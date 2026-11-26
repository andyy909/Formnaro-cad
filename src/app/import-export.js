import * as THREE from 'three';
import { needsStepDrillExportProof } from '../cad-step-drill-verify.js';
import { mountFreeCADImport } from '../cad-freecad-import-ui.js';
import { prepareMeshImport } from '../mesh-import-client.js';
import { MESH_IMPORT_LIMITS } from '../mesh-import-limits.js';
import { meshSvgPaths } from '../mesh-contours.js';
import { createCadExportWorkflow } from '../cad-export-workflow.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { CAD_PROJECT_LIMITS } from '../cad-project.js';
import { readExchangeFile, exchangeImportSummary } from '../exchange-formats.js';
import {
  hasLocalStlConverter,
  conversionControls,
  readConversionControls,
  conversionSummary,
  createLocalStlConversion,
} from '../cad-stl-converter.js';
import { cadIdentity } from '../cad-affine.js';
import { repairFassungFromReport } from '../mesh-repair-fassung.js';
import { originalCadSubpath } from '../cad-original-contours.js';
import { easyImportPolicy } from '../cad-easy-domain.js';
import { cadDrawingSvg, cadDrawingDxf } from '../cad-drawing-export.js';
import { cadDrawingPaperSize, cadDrawingSourceSignatures } from '../cad-drawing-data.js';

export function createImportExport({
  $,
  window,
  controller,
  project,
  activeEasyKind,
  workFrame,
  placeImportedProposal,
  setBusy,
  readyForFile,
  aiUI,
  escape,
  modal,
  clearPreview,
  scheduleRefresh,
  showPreview,
  view,
  select,
  workflowSettings,
  restrictEasyImport,
  safe,
  quality,
  download,
  selected,
  prepareExportDialog,
  state,
}) {
  async function importFile(
    file,
    {
      height = 3,
      unit = 1,
      reconstruct = false,
      repair = false,
      fillSmallHoles = false,
      tolerance = 0.15,
      mode = 'auto',
      fallback = true,
      converted,
      current = () => true,
      files = [],
      exchange,
      asMesh = false,
      preparedMesh,
      importSignal,
      forMeshHelp = false,
      autoMeshRepair = true,
      simplifyLarge = true,
      importMaxError = 0.02,
      onImportProgress = () => {},
    } = {},
  ) {
    const importDomain = activeEasyKind(),
      domainRevision = state.easyDomainRevision,
      policy = forMeshHelp ? null : easyImportPolicy(file.name.split('.').at(-1), importDomain);
    if (policy) {
      asMesh = policy.asMesh;
      reconstruct = policy.reconstruct;
    }
    const rawStl = /\.stl$/i.test(file.name) && !reconstruct && !converted;
    if (file.size > (rawStl ? MESH_IMPORT_LIMITS.bytes : CAD_PROJECT_LIMITS.bytes))
      throw Error(rawStl ? 'STL-Import: maximal 256 MiB.' : 'Importdatei ist größer als 50 MB.');
    const importRevision = controller.revision(),
      checkImport = () => {
        if (importSignal?.aborted || domainRevision !== state.easyDomainRevision)
          throw new DOMException('Arbeitsbereich während des Imports geändert oder Import abgebrochen.', 'AbortError');
        if (!current()) throw new DOMException('Import abgebrochen.', 'AbortError');
        if (controller.revision() !== importRevision)
          throw Object.assign(Error('Projekt während des Imports geändert. Erneut importieren.'), {
            code: 'STALE_REVISION',
          });
      };
    const ext = file.name.split('.').at(-1).toLowerCase(),
      p = project(),
      options = {
        name: file.name,
        id: crypto.randomUUID(),
        layerId: p.activeLayerId,
        folderId: p.activeFolderId,
        metadata: { importedFile: { name: file.name, type: ext } },
      };
    let proposal;

    if (['3mf', 'glb', 'gltf'].includes(ext)) {
      const revision = controller.revision(),
        result = exchange ?? (await readExchangeFile(file, { files }));

      if (!current() || controller.revision() !== revision) throw Error('Import abgebrochen oder Projekt geändert.');

      const draft = controller.snapshot(),
        ids = [];

      for (const part of result.parts) {
        const id = ids.length ? crypto.randomUUID() : options.id;
        ids.push(id);
        draft.nodes.push({
          id,
          kind: asMesh ? 'mesh' : 'referenceMesh',
          name: part.name,
          transform: cadIdentity(),
          color: part.color,
          opacity: part.opacity,
          layerId: draft.activeLayerId,
          folderId: draft.activeFolderId,
          metadata: options.metadata,
          mesh: part.mesh,
        });
      }

      proposal = await controller.preview(undefined, {
        project: draft,
        revision,
        label: 'Austauschdatei als Netzreferenzen importieren',
      });

      if (!current()) {
        controller.discard(proposal.previewId);
        throw Object.assign(Error('Import abgebrochen.'), { name: 'AbortError' });
      }

      return placeImportedProposal(proposal, checkImport, options.metadata);
    } else if (['step', 'stp'].includes(ext))
      proposal = await controller.preview(
        { kind: 'importStepAssembly', bytes: new Uint8Array(await file.arrayBuffer()), options },
        { label: 'STEP-CAD importieren' },
      );
    else if (ext === 'svg' && asMesh) {
      const svg = await file.text();
      checkImport();
      proposal = await controller.preview(
        {
          type: 'mesh-create-source',
          id: options.id,
          shape: 'svg',
          svg,
          paths: meshSvgPaths(svg),
          height,
          name: file.name,
          frame: workFrame(p),
        },
        { revision: importRevision, label: 'SVG als Netz extrudieren' },
      );
    } else if (ext === 'svg') {
      const svg = new SVGLoader().parse(await file.text()),
        paths = svg.paths
          .filter((path) => path.userData?.style?.fill !== 'none')
          .map((path) => ({
            subpaths: path.subPaths
              .map((value) => originalCadSubpath(value, { flipY: true }))
              .filter((value) => value.length),
            fillRule: path.userData?.style?.fillRule ?? 'nonzero',
            color: '#' + path.color.getHexString(),
          }));
      proposal = await controller.preview(
        { kind: 'svg', paths, height, options },
        { label: 'Originale SVG-CAD-Konturen extrudieren' },
      );
    } else if (ext === 'stl' && (reconstruct || converted)) {
      if (converted || hasLocalStlConverter()) {
        const revision = controller.revision(),
          ticket = ++state.localStlSequence,
          active = () => ticket === state.localStlSequence && current();

        const check = () => {
          if (!active()) {
            const error = Error('Konvertierung abgebrochen.');
            error.name = 'AbortError';
            throw error;
          }
          if (controller.revision() !== revision) {
            const error = Error('Das Projekt wurde während der Konvertierung geändert. Bitte erneut importieren.');
            error.code = 'STALE_REVISION';
            throw error;
          }
        };

        setBusy(true);

        try {
          if (!converted) {
            state.localStlTask = createLocalStlConversion({
              onProgress: (message) => {
                const status = $('import-status');
                if (active() && status?.isConnected) status.textContent = message;
              },
            });
            converted = await state.localStlTask.run(file, { unit, repair, tolerance, mode, fallback });
          }

          check();
          options.metadata.notes = conversionSummary(converted.report).slice(0, 4000);
          const repair = repairFassungFromReport(converted.report);
          if (repair) options.metadata.meshRepair = repair;

          proposal = await controller.preview(
            {
              kind: 'importStep',
              bytes: converted.bytes,
              options: { ...options, transform: workFrame(p), color: '#8294aa' },
            },
            { revision, label: 'STL-Konverter: CAD-Körper übernehmen' },
          );

          try {
            check();
          } catch (error) {
            controller.discard(proposal.previewId);
            throw error;
          }
        } finally {
          if (ticket === state.localStlSequence) {
            state.localStlTask = null;
            setBusy(false);
          }
        }
      } else
        proposal = await controller.preview(
          {
            kind: 'importStlHousing',
            bytes: new Uint8Array(await file.arrayBuffer()),
            unit,
            repair: { enabled: repair, fillSmallHoles },
            options: { ...options, transform: workFrame(p), color: '#8294aa' },
          },
          { label: 'STL-Gehäuse als CAD rekonstruieren' },
        );
    } else if (rawStl) {
      const result =
        preparedMesh ??
        (await prepareMeshImport(
          await file.arrayBuffer(),
          { unit, repair: autoMeshRepair, simplify: simplifyLarge, maxError: importMaxError },
          { signal: importSignal, isCurrent: current, onProgress: onImportProgress },
        ));
      checkImport();
      options.metadata.notes = JSON.stringify(result.report);
      const draft = controller.snapshot();
      draft.nodes.push({
        id: options.id,
        kind: asMesh ? 'mesh' : 'referenceMesh',
        name: file.name,
        transform: workFrame(draft),
        color: '#8294aa',
        opacity: asMesh ? 1 : 0.6,
        layerId: draft.activeLayerId,
        folderId: draft.activeFolderId,
        metadata: options.metadata,
        mesh: result.mesh,
      });
      proposal = await controller.preview(undefined, {
        project: draft,
        revision: importRevision,
        label: 'STL-Netz laden und automatisch bereinigen',
      });
    } else if (['stl', 'obj'].includes(ext)) {
      const verts = [],
        triangles = [];
      let object;

      if (ext === 'stl') {
        const bytes = new Uint8Array(await file.arrayBuffer());
        object = new THREE.Mesh(new STLLoader().parse(bytes.buffer));
      } else object = new OBJLoader().parse(await file.text());

      object.updateMatrixWorld(true);
      try {
        object.traverse((value) => {
          if (!value.isMesh) return;
          const geometry = value.geometry,
            attribute = geometry.getAttribute('position'),
            offset = verts.length / 3;
          for (let i = 0; i < attribute.count; i++)
            verts.push(
              ...new THREE.Vector3()
                .fromBufferAttribute(attribute, i)
                .applyMatrix4(value.matrixWorld)
                .multiplyScalar(unit)
                .toArray(),
            );
          if (geometry.index) triangles.push(...Array.from(geometry.index.array, (v) => v + offset));
          else for (let i = 0; i < attribute.count; i++) triangles.push(offset + i);
        });
      } finally {
        object.traverse((value) => value.geometry?.dispose());
      }

      if (reconstruct) throw Error('CAD-Gehäuserekonstruktion unterstützt nur STL.');
      else {
        const draft = controller.snapshot();
        draft.nodes.push({
          id: options.id,
          kind: asMesh ? 'mesh' : 'referenceMesh',
          name: file.name,
          transform: workFrame(draft),
          color: '#8294aa',
          opacity: asMesh ? 1 : 0.6,
          layerId: draft.activeLayerId,
          folderId: draft.activeFolderId,
          metadata: options.metadata,
          mesh: { verts, triangles },
        });
        proposal = await controller.preview(
          asMesh && repair ? { type: 'mesh-repair', id: options.id, fillSmallHoles, optional: true } : undefined,
          { project: draft, label: 'Netzteil importieren' },
        );
      }
    } else throw Error('Dateityp nicht unterstützt.');

    return placeImportedProposal(proposal, checkImport, options.metadata);
  }

  async function importDialog(file, { files = [] } = {}) {
    const importDomain = activeEasyKind(),
      domainRevision = state.easyDomainRevision;
    easyImportPolicy(file.name.split('.').at(-1), importDomain);
    if (/\.fcstd$/i.test(file.name)) {
      readyForFile();
      if (aiUI.isBusy()) throw Error('Laufenden Auftrag zuerst abschließen.');
      escape();
      const revision = controller.revision();
      modal(
        'FCStd-Datei importieren',
        '<div id=freecad-import-host></div><div class=modal-actions><button id=freecad-import-close>Schließen</button></div>',
        { modeless: true },
      );
      $('modal').classList.add('freecad-document-modal');
      $('modal').scrollTop = 0;
      state.freecadImportReader = mountFreeCADImport({
        host: $('freecad-import-host'),
        file,
        revision,
        isCurrent: (value) => controller.revision() === value && domainRevision === state.easyDomainRevision,
        preview: (request, options) => controller.previewFreeCADImport(request, options),
        apply: async (proposal) => {
          const result = controller.apply(proposal);
          clearPreview();
          await scheduleRefresh();
          return result;
        },
        discard: (id) => controller.discard(id),
        showPreview: async (proposal) => {
          await showPreview(proposal, [proposal.selectedTargets[0].rootId]);
          view.fit([], { includePreview: true });
        },
        clearPreview,
        onApplied: (target) => select([target]),
      });
      $('freecad-import-close').onclick = () => $('modal').close();
      return;
    }

    if (/\.(3mf|glb|gltf)$/i.test(file.name)) {
      const revision = controller.revision(),
        exchange = await readExchangeFile(file, { files });
      if (domainRevision !== state.easyDomainRevision)
        throw new DOMException('Arbeitsbereich während des Imports geändert.', 'AbortError');
      if (controller.revision() !== revision) throw Error('Projekt inzwischen verändert. Import erneut starten.');

      modal(
        'Teile importieren',
        exchangeImportSummary(exchange, { cad: true }) +
          '<label class="dialog-label">Verwendung<select id="exchange-kind"><option value="reference">Ansichtsvorlagen</option><option value="mesh">Bearbeitbare Netzteile</option></select></label><p>Auch offene Netze lassen sich als Netzteile anzeigen und speichern. Körperwerkzeuge benötigen eine zusätzliche Prüfung.</p><p id="exchange-status" role="status"></p><div class="modal-actions"><button id="exchange-cancel">Abbrechen</button><button id="exchange-import" class="primary">Importieren</button></div>',
      );

      $('exchange-kind').value =
        importDomain === 'mesh' ? 'mesh' : workflowSettings.get().import.meshUse === 'mesh' ? 'mesh' : 'reference';
      if (importDomain) restrictEasyImport('exchange-kind', importDomain);

      const dialog = $('modal'),
        session = state.modalSequence;
      let active = true,
        importing = false;
      const closed = () => {
          if (!dialog.open) cancel();
        },
        detach = () => dialog.removeEventListener('close', closed),
        current = () =>
          active && domainRevision === state.easyDomainRevision && dialog.open && session === state.modalSequence,
        cancel = () => {
          const own = active && session === state.modalSequence;
          active = false;
          detach();
          if (own && importing) escape();
        };
      dialog.addEventListener('close', closed);
      $('exchange-cancel').onclick = () => {
        cancel();
        dialog.close();
      };

      $('exchange-import').onclick = async () => {
        const button = $('exchange-import');
        button.disabled = true;
        importing = true;
        try {
          if (controller.revision() !== revision) throw Error('Projekt inzwischen verändert. Import erneut starten.');
          await importFile(file, { files, exchange, asMesh: $('exchange-kind').value === 'mesh', current });
          importing = false;
          active = false;
          detach();
          if (session === state.modalSequence) dialog.close();
        } catch (error) {
          if (current()) $('exchange-status').textContent = error.message;
        } finally {
          importing = false;
          if (button.isConnected && session === state.modalSequence) button.disabled = false;
        }
      };
      return;
    }

    const svg = /\.svg$/i.test(file.name),
      stl = /\.stl$/i.test(file.name),
      reference = /\.(stl|obj)$/i.test(file.name);

    if (!svg && !reference) return importFile(file);

    const defaults = workflowSettings.get(),
      local = hasLocalStlConverter(),
      repairControls = stl
        ? '<div id="import-repair-options" hidden><label><input id="import-repair" type="checkbox" checked> Netzfehler vor der CAD-Rekonstruktion reparieren</label>' +
          (local
            ? '<label class="dialog-label">Umwandlung<select id="import-assistance"><option value="without">Ohne KI · lokal umwandeln</option><option value="with">Lokal zuerst · KI gezielt einsetzen</option></select></label><p class="small-note">Formnaro prüft zuerst einen lokalen STEP-Körper. Die KI-Option kann einzelne Problemflächen anhand numerischer Messdaten prüfen. Im Konverter stehen außerdem eine lokale Symmetrieprüfung und die CAD-Vorschau mit Übernehmen oder Verwerfen zur Verfügung.</p>' +
              conversionControls('import')
            : '<p>Entfernt Nullflächen und doppelte Dreiecke, richtet Flächen aus und repariert exakt kollineare Kanten. Originaldatei und Punktkoordinaten bleiben erhalten.</p><label><input id="import-fill-holes" type="checkbox"> Kleine Netzlücken schließen</label><p>Ergänzt Flächen an kleinen Randlücken. Nur einschalten, wenn diese Öffnungen unbeabsichtigt sind.</p>') +
          '</div>'
        : '';

    modal(
      svg ? 'SVG extrudieren' : stl ? 'STL importieren' : 'Netzreferenz importieren',

      (svg
        ? '<label class="dialog-label">Verwendung<select id="import-kind"><option value="cad">CAD-Körper</option><option value="mesh">Bearbeitbares Netzteil</option></select></label><label class="dialog-label">Extrusionshöhe (mm)<input id="import-height" type="number" min="0.01" max="10000" value="3"></label>'
        : (stl
            ? '<label class="dialog-label">Verwendung<select id="import-kind"><option value="reference">Ansichtsvorlage</option><option value="mesh">Bearbeitbares Netzteil</option><option value="cad">STL als CAD-Körper rekonstruieren</option></select></label><p>CAD-Körper lassen sich mit den CAD-Werkzeugen bearbeiten. Netzreferenzen lassen sich positionieren.</p>' +
              repairControls
            : '<label class="dialog-label">Verwendung<select id="import-kind"><option value="reference">Ansichtsvorlage</option><option value="mesh">Bearbeitbares Netzteil</option></select></label>') +
          '<label class="dialog-label">Einheit<select id="import-unit"><option value="1">Millimeter</option><option value="10">Zentimeter</option><option value="25.4">Zoll</option></select></label>') +
        (stl
          ? '<div id="import-mesh-options"><p>Auch offene oder beschädigte Teile laden. Sichere Bereinigung schließt keine Öffnungen und entfernt keine Bestandteile.</p><label><input id="import-auto-mesh-repair" type="checkbox" checked> Automatisch bereinigen</label><label><input id="import-simplify-large" type="checkbox" checked> Große Netze bei Bedarf vereinfachen</label><label class="dialog-label">Fehlerwert für Vereinfachung (mm)<input id="import-mesh-error" type="number" min="0" max="1" step="0.01" value="0.02"></label><p class="small-note">Bis 256 MiB binäre STL und 5 Millionen Dreiecke. Über 500.000 Dreiecken wird eine Arbeitskopie mit Ziel 250.000 versucht. Offene Ränder und ausgeprägte Kanten bleiben fest. Fehlerwert ist eine Algorithmusschätzung; Passmaße müssen geprüft werden. Die Originaldatei bleibt erhalten.</p></div>'
          : '') +
        '<p id="import-status" role="status"></p><pre id="import-mesh-report" hidden></pre><div class="modal-actions"><button id="import-cancel">Abbrechen</button><button id="import-confirm" class="primary">Importieren</button></div>',
    );

    if (!svg) {
      $('import-kind').value = !stl && defaults.import.meshUse === 'cad' ? 'reference' : defaults.import.meshUse;
      $('import-unit').value = String(defaults.import.unit);
    } else $('import-height').value = defaults.import.svgHeight;

    if (stl) {
      $('import-repair').checked = defaults.conversion.repair;
      if (local) {
        $('import-tolerance').value = defaults.conversion.tolerance;
        $('import-mode').value = defaults.conversion.mode;
        $('import-fallback').checked = defaults.conversion.fallback;
      }
    }

    if (!svg && importDomain && $('import-kind')) restrictEasyImport('import-kind', importDomain);
    if (stl) {
      $('import-kind').onchange = () => {
        $('import-repair-options').hidden = $('import-kind').value !== 'cad';
        $('import-mesh-options').hidden = $('import-kind').value === 'cad';
      };
      $('import-repair').onchange = () => {
        if ($('import-fill-holes')) $('import-fill-holes').disabled = !$('import-repair').checked;
      };
      $('import-kind').onchange();
    }

    const dialog = $('modal'),
      session = state.modalSequence,
      importAbort = new AbortController(),
      openedRevision = controller.revision();
    let active = true,
      importing = false,
      preparedMesh = null,
      preparedOptions = null;
    const closed = () => {
        if (!dialog.open) cancel();
      },
      detach = () => dialog.removeEventListener('close', closed),
      current = () =>
        active && domainRevision === state.easyDomainRevision && dialog.open && session === state.modalSequence,
      cancel = () => {
        const own = active && session === state.modalSequence;
        active = false;
        importAbort.abort();
        preparedMesh = null;
        detach();
        if (own && importing) escape();
      };
    dialog.addEventListener('close', closed);
    $('import-cancel').onclick = () => {
      cancel();
      dialog.close();
    };

    $('import-confirm').onclick = () =>
      safe(async () => {
        const cadConversion = stl && local && $('import-kind').value === 'cad',
          controls = cadConversion ? readConversionControls('import') : {};

        if (cadConversion) {
          const assistance = $('import-assistance').value,
            initialOptions = { ...controls, unit: Number($('import-unit').value), repair: $('import-repair').checked };
          readyForFile();
          active = false;
          detach();
          state.functionsUI.converter(file, { intent: 'import', assistance, initialOptions });
          return;
        }

        importing = true;
        try {
          if (controller.revision() !== openedRevision)
            throw Error('Projekt inzwischen verändert. Import erneut starten.');
          const inputOptions = preparedOptions ?? {
            ...controls,
            current,
            height: svg ? Number($('import-height').value) : 3,
            unit: reference ? Number($('import-unit').value) : 1,
            asMesh: !!$('import-kind') && $('import-kind').value === 'mesh',
            reconstruct: stl && $('import-kind').value === 'cad',
            repair: stl && $('import-kind').value === 'cad' && $('import-repair').checked,
            fillSmallHoles: !!$('import-fill-holes') && $('import-fill-holes').checked,
          };
          for (const input of $('modal-body').querySelectorAll('input,select,button:not(#import-cancel)'))
            input.disabled = true;
          if (stl && !inputOptions.reconstruct && !preparedMesh) {
            if (file.size > MESH_IMPORT_LIMITS.bytes) throw Error('STL-Import: maximal 256 MiB.');
            preparedOptions = inputOptions;
            preparedMesh = await prepareMeshImport(
              await file.arrayBuffer(),
              {
                unit: inputOptions.unit,
                repair: $('import-auto-mesh-repair').checked,
                simplify: $('import-simplify-large').checked,
                maxError: Number($('import-mesh-error').value),
              },
              {
                signal: importAbort.signal,
                isCurrent: () => current() && controller.revision() === openedRevision,
                onProgress: (message) => {
                  if (current()) $('import-status').textContent = message;
                },
              },
            );
            if (!current() || controller.revision() !== openedRevision)
              throw new DOMException('Import abgebrochen oder Projekt geändert.', 'AbortError');
            if (preparedMesh.report.simplification.changed) {
              const r = preparedMesh.report;
              const report = $('import-mesh-report');
              report.hidden = false;
              report.textContent =
                `Arbeitskopie: ${r.inputTriangles.toLocaleString('de-DE')} → ${r.outputTriangles.toLocaleString('de-DE')} Dreiecke.\nGeschätzter Fehler: ${r.simplification.errorEstimateMm.toLocaleString('de-DE', { maximumFractionDigits: 6 })} mm.\n` +
                r.warnings.join('\n');
              $('import-status').textContent = 'Vereinfachte Arbeitskopie geprüft. Zum Laden erneut bestätigen.';
              $('import-confirm').textContent = 'Arbeitskopie importieren';
              return;
            }
          }
          await importFile(file, { ...inputOptions, preparedMesh, importSignal: importAbort.signal });
          importing = false;
          active = false;
          preparedMesh = null;
          detach();
          if (session === state.modalSequence) dialog.close();
        } catch (error) {
          preparedMesh = null;
          preparedOptions = null;
          if (error.name !== 'AbortError' && current() && $('import-status')?.isConnected)
            $('import-status').textContent = error.message;
        } finally {
          importing = false;
          if (session === state.modalSequence)
            for (const input of $('modal-body').querySelectorAll('input,select,button'))
              input.disabled = !!preparedMesh && input.id !== 'import-confirm' && input.id !== 'import-cancel';
        }
      });
  }

  async function saveDrawingExport({ format, sheet, signal }) {
    const revision = controller.revision(),
      release = controller.holdRevision(revision);
    try {
      if (signal?.aborted) return { saved: false, canceled: true };
      controller.assertExportReady({
        ids: [...new Set(sheet.views.flatMap((v) => v.sourceIds))],
        format: 'drawing-' + format,
        includeHidden: true,
      });
      const source = controller.readSnapshot(),
        ids = [...new Set(sheet.views.flatMap((v) => v.sourceIds))];
      if (needsStepDrillExportProof(source, ids)) await controller.query('stepDrillIntegrity', { ids }, { signal });
      const options = { sourceSignatures: cadDrawingSourceSignatures(source) },
        name = sheet.name || 'Zeichnungsblatt';
      if (format === 'pdf') {
        if (!window.offlinecadDesktop?.printDrawingPdf)
          throw Error('PDF-Ausgabe benötigt die lokale Formnaro-Anwendung.');
        const [widthMm, heightMm] = cadDrawingPaperSize(sheet),
          svg = cadDrawingSvg(sheet, options),
          bytes = await window.offlinecadDesktop.printDrawingPdf({ svg, widthMm, heightMm });
        if (signal?.aborted) return { saved: false, canceled: true };
        if (controller.revision() !== revision)
          throw Object.assign(Error('Modell während der PDF-Ausgabe geändert.'), { code: 'STALE_REVISION' });
        return await download(bytes, name + '.pdf', 'application/pdf', { numbered: true, signal });
      }
      const text =
        format === 'svg' ? cadDrawingSvg(sheet, options) : format === 'dxf' ? cadDrawingDxf(sheet, options) : null;
      if (text === null) throw Error('Unbekanntes Zeichnungsformat.');
      return await download(text, name + '.' + format, format === 'svg' ? 'image/svg+xml' : 'application/dxf', {
        numbered: true,
        signal,
      });
    } finally {
      release();
    }
  }

  const { exportModel, exportDialog } = createCadExportWorkflow({
    project,
    activeEasyKind,
    getEasyDomainRevision: () => state.easyDomainRevision,
    quality,
    controller,
    download,
    prepareDialog: prepareExportDialog,
    modal,
    $,
    workflowSettings,
    getModalSequence: () => state.modalSequence,
    safe,
    selected,
  });

  return { importFile, importDialog, exportModel, exportDialog, saveDrawingExport };
}
