import './cad-part-properties.css';
import { flags } from './organization.js';
import { cadIdentity } from './cad-affine.js';
import { meshSurfaceHit } from './mesh-surface.js';
import { meshSelectionGeometryDigest } from './mesh-selection-data.js';
import {
  paintPartFaces,
  PART_NUMBER_MAX_LENGTH,
  validatePartProperties,
  partSurfaceState,
  validateExplosion,
  explosionOffsets,
  summarizeParts,
  partsCsv,
} from './cad-part-properties.js';
import { createPartPropertiesService } from './cad-part-properties-service.js';
import {
  cadComponentPlacement,
  cadComponentDefinitionLength,
  changeCadComponentDefinitionLength,
  unlinkComponentInstance,
} from './cad-component-definitions.js';

const number = (value) => {
  const s = String(value).trim(),
    v = s ? Number(s.replace(',', '.')) : NaN;
  if (!Number.isFinite(v)) throw Error('Endliche Zahl eingeben.');
  return v;
};
const fmt = (value) =>
  value === null || value === undefined
    ? 'offen'
    : (Math.abs(value) < 0.0000005 ? 0 : value).toLocaleString('de-DE', { maximumFractionDigits: 6 });
const escape = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
export function createCadPartPropertiesUI({
  controller,
  view,
  getSelection,
  getScene,
  isLoaded = () => true,
  meshSelection,
  prepare,
  showPreview,
  clearPreview,
  refresh,
  download,
  onWorkspaceChange,
  toast,
}) {
  const panel = document.createElement('section');
  panel.id = 'part-properties-panel';
  panel.className = 'edge-tool-panel';
  panel.hidden = true;
  view.canvas.parentElement.append(panel);
  const notice = document.createElement('div');
  notice.className = 'part-explosion-notice';
  notice.id = 'explosion-notice';
  notice.hidden = true;
  notice.innerHTML = 'Explosionsansicht · Montage unverändert <button type="button">Montage anzeigen</button>';
  view.canvas.parentElement.append(notice);
  const service = createPartPropertiesService(controller),
    $ = (id) => panel.querySelector('#' + id);
  let active = null,
    explosion = null,
    showing = false,
    sequence = 0;
  const project = () => controller.readSnapshot(),
    status = (s) => {
      if ($('part-status')) $('part-status').textContent = s;
    };
  const run = (fn) => {
    try {
      return Promise.resolve(fn()).catch((e) => {
        status(e.message);
        toast(e.message);
      });
    } catch (e) {
      status(e.message);
      toast(e.message);
      return Promise.resolve();
    }
  };
  const current = (s) => active === s && s.revision === controller.revision();
  function nodes() {
    const p = project();
    return p.nodes.filter(
      (n) =>
        ['cad', 'mesh'].includes(n.kind) &&
        !flags(n, p).hidden &&
        !n.suppressed &&
        (n.kind === 'cad' ? n.solid : n.meshRole !== 'hole'),
    );
  }
  function target() {
    const n = project().nodes.find((n) => n.id === $('part-target')?.value);
    if (!n) throw Error('Ein vollständiges Teil auswählen.');
    return n;
  }
  function discard() {
    const s = active;
    if (s) s.ticket++;
    if (s?.proposal) {
      controller.discard(s.proposal.previewId);
      s.proposal = null;
      clearPreview();
    }
    if ($('part-apply')) $('part-apply').disabled = true;
  }
  function close() {
    if (!active) return false;
    discard();
    active = null;
    sequence++;
    panel.hidden = true;
    view.setInteraction(null);
    return true;
  }
  function suspendExplosion() {
    if (!showing) return false;
    showing = false;
    view.clearExplosion();
    notice.hidden = true;
    return true;
  }
  notice.querySelector('button').onclick = () => {
    suspendExplosion();
    onWorkspaceChange();
  };
  function drawExplosion() {
    view.clearExplosion();
    notice.hidden = !showing || !explosion?.distance;
    if (!showing || !explosion?.distance) return;
    const p = project(),
      visible = new Set(
        nodes()
          .filter((n) => view.allows(n.id))
          .map((n) => n.id),
      ),
      placements = explosionOffsets(explosion, p)
        .filter((r) => visible.has(r.id))
        .map((r) => {
          const delta = cadIdentity();
          r.offset.forEach((v, k) => (delta[12 + k] = v));
          return { rootId: r.id, delta };
        });
    if (placements.length) view.setExplosion(placements);
  }
  function restoreExplosion(value) {
    suspendExplosion();
    explosion = validateExplosion(value ?? null);
    showing = !!explosion?.distance;
    drawExplosion();
  }
  function showExplosion(value) {
    discard();
    view.setInteraction(null);
    explosion = validateExplosion(value);
    showing = !!explosion?.distance;
    drawExplosion();
    onWorkspaceChange();
    if ($('explosion-distance')) $('explosion-distance').value = String(explosion?.distance ?? 0);
    if ($('explosion-value')) $('explosion-value').textContent = fmt(explosion?.distance ?? 0) + ' mm';
  }
  function createExplosion() {
    const scene = getScene(),
      parts = nodes()
        .map((n) => ({ n, o: scene.objects.find((o) => o.id === n.id && !o.target.path.length) }))
        .filter((r) => r.o?.worldBounds);
    if (parts.length < 2) throw Error('Mindestens zwei sichtbare fertige Teile erforderlich.');
    const centers = parts.map(
        ({ o }) => o.worldBounds.center ?? o.worldBounds.min.map((v, k) => (v + o.worldBounds.max[k]) / 2),
      ),
      center = [0, 1, 2].map((k) => centers.reduce((s, p) => s + p[k], 0) / centers.length);
    showExplosion({
      version: 1,
      distance: explosion?.distance || 40,
      parts: parts.map(({ n }, i) => {
        const d = centers[i].map((v, k) => v - center[k]),
          length = Math.hypot(...d);
        return {
          id: n.id,
          direction:
            length > 1e-8 ? d.map((v) => v / length) : [i % 3 === 0 ? 1 : 0, i % 3 === 1 ? 1 : 0, i % 3 === 2 ? 1 : 0],
        };
      }),
    });
  }
  function clearExplosion() {
    suspendExplosion();
    explosion = null;
    onWorkspaceChange();
    if (active) renderMode();
  }
  function selectedFaces() {
    const s = active;
    if (!s) return;
    const n = target(),
      binding = meshSelection();
    if (n.kind !== 'mesh' || binding?.objectId !== n.id || binding.geometryDigest !== meshSelectionGeometryDigest(n))
      throw Error('Eine aktuelle Netz-Flächenauswahl für dieses Teil übernehmen.');
    s.clearSurfaces = false;
    s.faceIds = [...binding.triangleIds];
    faceLabel();
    discard();
  }
  function faceLabel() {
    if ($('part-faces'))
      $('part-faces').textContent = active?.faceIds.length
        ? active.faceIds.length +
          ' gewählte Flächen: ' +
          active.faceIds.slice(0, 40).join(', ') +
          (active.faceIds.length > 40 ? ' …' : '')
        : 'Noch keine Flächen gewählt.';
  }
  async function pick(ray) {
    const s = active;
    if (!current(s) || s.busy || showing) return;
    const n = target(),
      ticket = s.ticket;
    s.busy = true;
    try {
      const loaded = await controller.materialize([n.id]);
      if (!current(s) || ticket !== s.ticket) return;
      const source = loaded.nodes.find((v) => v.id === n.id),
        hit = n.kind === 'cad' ? await controller.query('rayPick', { ray, ids: [n.id] }) : meshSurfaceHit(source, ray);
      if (!current(s) || ticket !== s.ticket) return;
      if (!hit || hit.objectId !== n.id) throw Error('Eine eindeutige Fläche des gewählten Teils anklicken.');
      const index = n.kind === 'cad' ? hit.faceIndex : hit.triangleIndex;
      if (!Number.isSafeInteger(index)) throw Error('Native Fläche konnte nicht zugeordnet werden.');
      discard();
      s.clearSurfaces = false;
      if (s.faceIds.includes(index)) s.faceIds = s.faceIds.filter((i) => i !== index);
      else s.faceIds.push(index);
      faceLabel();
      status('Flächen gesammelt. Gruppenname und Farbe wählen, dann Vorschau berechnen.');
    } finally {
      if (active === s) s.busy = false;
    }
  }
  async function showPartPreview(s, ticket, draft, ids, label, message) {
    const proposal = await controller.preview(undefined, { project: draft, revision: s.revision, label });
    if (!current(s) || ticket !== s.ticket) {
      controller.discard(proposal.previewId);
      return;
    }
    s.proposal = proposal;
    try {
      await showPreview(proposal, ids, ids);
    } catch (error) {
      if (current(s) && ticket === s.ticket) discard();
      throw error;
    }
    if (!current(s) || ticket !== s.ticket) {
      controller.discard(proposal.previewId);
      return;
    }
    $('part-apply').disabled = false;
    status(message);
  }

  async function previewDefinition(action) {
    const s = active;
    if (!s || !current(s) || s.busy) throw Error('Aktuelles Teil wählen.');
    const id = target().id,
      resize = action === 'length',
      scope = resize ? cadComponentDefinitionLength(project(), id) : cadComponentPlacement(project(), id),
      length = resize ? number($('part-definition-length').value) : undefined,
      partNumber = $('part-definition-detached-number').value.trim(),
      ids = resize ? scope.instances.map((instance) => instance.id) : [id],
      label = resize ? 'Gemeinsame Länge ändern' : 'Verwendung lösen';
    suspendExplosion();
    discard();
    const ticket = s.ticket;
    s.busy = true;
    status('Bauteildefinition wird geprüft …');
    try {
      const materialized = await controller.materialize(ids);
      if (!current(s) || ticket !== s.ticket) return;
      const draft = resize
        ? changeCadComponentDefinitionLength(materialized, id, length).project
        : unlinkComponentInstance(materialized, id, partNumber ? { partNumber } : undefined).project;
      await showPartPreview(
        s,
        ticket,
        draft,
        ids,
        label,
        resize
          ? 'Vorschau bereit. Alle verknüpften Platzierungen behalten ihre Einbaulage.'
          : 'Vorschau bereit. Die gewählte Platzierung erhält eine eigene Definition.',
      );
    } finally {
      if (active === s) s.busy = false;
    }
  }

  async function preview() {
    const s = active;
    if (!current(s) || s.busy) throw Error('Aktuelles Teil wählen.');
    suspendExplosion();
    discard();
    const id = target().id,
      ticket = s.ticket;
    if (!isLoaded(id)) throw Error('Das Teil zuerst vollständig darstellen.');
    s.busy = true;
    status('Teileigenschaften werden geprüft …');
    try {
      const draft = await controller.materialize([id]);
      if (!current(s) || ticket !== s.ticket) return;
      const n = draft.nodes.find((n) => n.id === id);
      if (flags(n, draft).locked || flags(n, draft).hidden) throw Error('Ein sichtbares, entsperrtes Teil wählen.');
      if ($('part-mode').value === 'material') {
        const partNumber = $('part-number').value.trim();
        const name = $('part-material').value.trim();
        const density = $('part-density').value.trim();
        const properties = { ...n.metadata?.partProperties, version: 1 };
        if (partNumber) properties.partNumber = partNumber;
        else delete properties.partNumber;
        if (name || density || properties.material)
          properties.material = { name, densityGcm3: density ? number(density) : null };
        if (properties.partNumber || properties.material || properties.surfaces) {
          n.metadata = { ...n.metadata, partProperties: validatePartProperties(properties) };
        } else if (n.metadata?.partProperties) {
          delete n.metadata.partProperties;
          if (!Object.keys(n.metadata).length) delete n.metadata;
        }
      } else if (s.clearSurfaces) {
        const properties = { ...n.metadata?.partProperties, version: 1 };
        delete properties.surfaces;
        n.metadata = { ...n.metadata, partProperties: validatePartProperties(properties) };
      } else {
        if (!s.faceIds.length) throw Error('Mindestens eine Fläche ausdrücklich wählen.');
        const measured =
          n.kind === 'cad'
            ? await controller.query('partProperties', { id })
            : { faceCount: n.mesh.triangles.length / 3 };
        if (!current(s) || ticket !== s.ticket) return;
        if (
          s.faceIds.some(
            (i) =>
              i < (n.kind === 'cad' ? 1 : 0) || i >= (n.kind === 'cad' ? measured.faceCount + 1 : measured.faceCount),
          )
        )
          throw Error('Gewählte Fläche ist nicht mehr vorhanden.');
        paintPartFaces(n, {
          name: $('part-group-name').value.trim(),
          color: $('part-color').value,
          faceIds: s.faceIds,
        });
      }
      await showPartPreview(
        s,
        ticket,
        draft,
        [id],
        'Teileigenschaften ändern',
        'Vorschau bereit. Geometrie und Originalquellen bleiben unverändert; Übernehmen erzeugt einen Rückgängig-Schritt.',
      );
    } finally {
      if (active === s) s.busy = false;
    }
  }
  async function apply() {
    const s = active;
    if (!current(s) || s.busy || !s.proposal) throw Error('Zuerst aktuelle Vorschau berechnen.');
    s.applying = true;
    try {
      controller.apply(s.proposal);
      s.proposal = null;
      clearPreview();
      s.revision = controller.revision();
      await refresh();
      renderMode();
      status(
        $('part-mode').value === 'definition' ? 'Bauteildefinition übernommen.' : 'Teileigenschaften übernommen.',
      );
    } finally {
      if (active === s) s.applying = false;
    }
  }
  function renderSummaryTable(result) {
    const isGrouped = result.mode === 'grouped';
    const table = document.createElement('table'),
      head = table.createTHead().insertRow();
    const headers = [
      isGrouped ? 'Kennung / Definition' : 'Teil-ID',
      'Teilenummer',
      'Name',
      'Materialgruppe',
      'Menge',
      'Volumen mm³',
      'Masse g',
      'Status',
    ];
    for (const title of headers) {
      const th = document.createElement('th');
      th.textContent = title;
      head.append(th);
    }
    for (const row of result.rows) {
      const tr = table.createTBody().insertRow();
      const cells = [
        row.definitionId ?? row.id,
        row.partNumber ?? '',
        row.name,
        row.material ?? 'offen',
        row.count ?? 1,
        fmt(row.volumeMm3),
        fmt(row.massG),
        row.status,
      ];
      for (const value of cells) tr.insertCell().textContent = value;
    }
    $('part-summary').replaceChildren(table);
    $('part-total').textContent = result.complete
      ? 'Gesamtmasse: ' +
        fmt(result.totalMassG) +
        ' g · Schwerpunkt (Montage): ' +
        result.centerMm.map(fmt).join(' / ') +
        ' mm'
      : 'Gesamtmasse und Gesamtschwerpunkt offen. Bekannte Teilmasse: ' +
        fmt(result.knownMassG) +
        ' g. Dichte oder gültiger Körpernachweis fehlt.';
    $('part-csv').disabled = false;
    status(result.scope);
  }
  async function summary() {
    const s = active;
    if (!current(s) || s.busy) return;
    const ticket = s.ticket;
    s.busy = true;
    status('Native Volumen und Schwerpunkte werden geprüft …');
    try {
      const mode = $('part-bom-mode')?.value ?? 'single';
      const result = await service.measure({ mode });
      if (!current(s) || ticket !== s.ticket) return;
      s.summary = result;
      renderSummaryTable(result);
    } finally {
      if (active === s) s.busy = false;
    }
  }
  function renderDefinition(node) {
    const lengthInput = $('part-definition-length'),
      lengthButton = $('part-definition-length-preview'),
      detachNumber = $('part-definition-detached-number'),
      detachButton = $('part-definition-detach-preview'),
      definitionNote = $('part-definition-note'),
      lengthNote = $('part-definition-length-note');
    lengthInput.value = '';
    detachNumber.value = '';
    lengthInput.disabled = lengthButton.disabled = detachNumber.disabled = detachButton.disabled = true;
    lengthNote.textContent = '';
    try {
      const { definition, instances } = cadComponentPlacement(project(), node?.id);
      const countLabel = instances.length === 1 ? 'Platzierung' : 'Platzierungen';
      definitionNote.textContent = definition.name + ' · ' + instances.length + ' ' + countLabel;
      detachNumber.placeholder = definition.partNumber ?? '';
      detachNumber.disabled = detachButton.disabled = false;
    } catch (error) {
      definitionNote.textContent = error.message;
      return;
    }
    try {
      const { length } = cadComponentDefinitionLength(project(), node.id);
      lengthInput.value = String(length).replace('.', ',');
      lengthInput.disabled = lengthButton.disabled = false;
    } catch (error) {
      lengthNote.textContent = error.message;
    }
  }

  function renderMode() {
    const s = active;
    if (!s) return;
    discard();
    view.setInteraction(null);
    s.faceIds = [];
    s.clearSurfaces = false;
    s.summary = null;
    const mode = $('part-mode').value,
      targetOptions = $('part-target'),
      parts = new Map(nodes().map((node) => [node.id, node])),
      n = parts.get(targetOptions.value),
      props = n?.metadata?.partProperties ?? {};
    for (const [index, option] of [...targetOptions.options].entries()) {
      const part = parts.get(option.value);
      if (!part) continue;
      option.textContent = part.name;
      option.title = '';
      if (mode === 'definition') {
        const placement = part.transform.slice(12, 15).map((value, axis) => 'XYZ'[axis] + ' ' + fmt(value));
        option.textContent += ' · ' + placement.join(' / ') + ' mm · #' + (index + 1);
        option.title = part.id;
      }
    }
    $('part-editor').hidden = !['material', 'surfaces', 'definition'].includes(mode);
    $('part-definition-fields').hidden = mode !== 'definition';
    $('part-preview').hidden = mode === 'definition';
    if (mode === 'definition') renderDefinition(n);
    $('part-material-fields').hidden = mode !== 'material';
    $('part-surface-fields').hidden = mode !== 'surfaces';
    $('part-summary-fields').hidden = mode !== 'summary';
    $('part-explosion-fields').hidden = mode !== 'explosion';
    $('part-target-row').hidden = ['summary', 'explosion'].includes(mode);
    $('part-number').value = props.partNumber ?? '';
    $('part-material').value = props.material?.name ?? '';
    $('part-density').value =
      props.material?.densityGcm3 === null || props.material?.densityGcm3 === undefined
        ? ''
        : String(props.material.densityGcm3).replace('.', ',');
    faceLabel();
    $('part-clear-groups').disabled = !n?.metadata?.partProperties?.surfaces;
    if (mode === 'surfaces' && n) {
      const state = partSurfaceState(n);
      status(
        state.stored && state.current && !state.active
          ? 'Quellenfarben haben Vorrang. Für eigene Flächengruppen Quellenfarben am Teil ausdrücklich abschalten.'
          : state.stored && !state.current
            ? 'Gespeicherte Flächengruppen sind nach Geometrieänderung veraltet und wirken nicht. Neue Flächen wählen.'
            : 'Flächen auf dem gewählten Teil anklicken oder eine Netz-Flächenauswahl verwenden.',
      );
      view.setInteraction((ray) => run(() => pick(ray)));
    } else status('');
    $('explosion-distance').value = String(explosion?.distance ?? 40);
    $('explosion-value').textContent = fmt(explosion?.distance ?? 40) + ' mm';
  }
  function open(mode = 'material') {
    prepare();
    close();
    active = {
      revision: controller.revision(),
      ticket: ++sequence,
      faceIds: [],
      busy: false,
      proposal: null,
      applying: false,
      summary: null,
    };
    const selected = getSelection().find((t) => !t.path.length)?.rootId,
      values = nodes();
    const definitionFields = `<div id="part-definition-fields">
      <p id="part-definition-note" class="small-note"></p>
      <label>Länge (lokale Z-Achse, mm)<input id="part-definition-length" inputmode="decimal"></label>
      <button id="part-definition-length-preview" type="button">Gemeinsame Länge ändern …</button>
      <p id="part-definition-length-note" class="small-note" role="status"></p>
      <label>Teilenummer der gelösten Verwendung (optional)<input id="part-definition-detached-number" maxlength="${PART_NUMBER_MAX_LENGTH}"></label>
      <button id="part-definition-detach-preview" type="button">Verwendung lösen …</button>
    </div>`;
    panel.innerHTML =
      '<div class="inspection-heading"><strong>Teile, Material und Baugruppe</strong><button id="part-close" type="button" aria-label="Schließen">×</button></div><label>Bereich<select id="part-mode"><option value="material">Teilenummer, Material und Dichte</option><option value="surfaces">Flächenfarben und Gruppen</option><option value="definition">Bauteildefinition</option><option value="summary">Masse, Schwerpunkt und Stückliste</option><option value="explosion">Gespeicherte Explosionsansicht</option></select></label><label id="part-target-row">Fertiges Teil<select id="part-target">' +
      values.map((n) => '<option value="' + escape(n.id) + '">' + escape(n.name) + '</option>').join('') +
      '</select></label><div id="part-editor"><div id="part-material-fields"><label>Teilenummer (optional)<input id="part-number" maxlength="' +
      PART_NUMBER_MAX_LENGTH +
      '"></label><label>Materialgruppe<input id="part-material" maxlength="120" placeholder="Eigene Materialbezeichnung"></label><label>Dichte (g/cm³)<input id="part-density" inputmode="decimal" placeholder="ausdrücklich eingeben oder offen lassen"></label><p class="small-note">Ein homogenes Material je fertigem Teil. Flächenfarbe setzt keine Dichte. Ohne Dichte bleibt die Masse offen.</p></div><div id="part-surface-fields"><label>Flächengruppe<input id="part-group-name" value="Flächengruppe" maxlength="120"></label><label>Farbe<input id="part-color" type="color" value="#278fa4"></label><p id="part-faces"></p><button id="part-use-selection" type="button">Übernommene Netz-Flächenauswahl verwenden</button><button id="part-clear-faces" type="button">Flächenwahl leeren</button><button id="part-clear-groups" type="button">Eigene Flächengruppen entfernen …</button><p class="small-note">CAD-Flächen sind an das unveränderte BRep gebunden; Netzgruppen an die gespeicherten Dreiecke. Nach Geometrieänderung neu wählen.</p></div>' +
      definitionFields +
      '<div class="edge-actions"><button id="part-preview">Vorschau</button><button id="part-apply" class="primary" disabled>Übernehmen</button></div></div><div id="part-summary-fields"><p>Sichtbare fertige Teile in Montageposition, unabhängig von der Explosionsansicht. Keine Vereinigung überlappender Teile.</p><label>Stücklisten-Ansicht<select id="part-bom-mode"><option value="single">Einzelteile</option><option value="grouped">Gruppiert nach Bauteildefinition</option></select></label><button id="part-measure">Teile prüfen / Stückliste aktualisieren</button><div id="part-summary" class="part-table-scroll"></div><p id="part-total"></p><button id="part-csv" disabled>Stückliste als CSV exportieren</button></div><div id="part-explosion-fields"><p>Reine Anzeigeverschiebung. Quellen, Montage, Gelenke und Modell-Exporte bleiben in Einbaulage.</p><button id="explosion-create">Richtungen aus aktueller Baugruppe erzeugen</button><label>Abstand <output id="explosion-value"></output><input id="explosion-distance" type="range" min="0" max="300" step="1" value="40"></label><button id="explosion-show">Gespeicherte Explosion anzeigen</button><button id="explosion-assembly">Montage anzeigen</button><button id="explosion-clear">Gespeicherte Explosion entfernen</button><p class="small-note">Richtungen und Abstand werden im Arbeitsplatz mitgespeichert. Während der Explosion ist Modellbearbeitung gesperrt.</p></div><p id="part-status" role="status" aria-live="polite"></p>';
    $('part-mode').value = mode;
    if (selected && values.some((n) => n.id === selected)) $('part-target').value = selected;
    $('part-close').onclick = close;
    $('part-mode').onchange = renderMode;
    $('part-target').onchange = renderMode;
    for (const id of ['part-number', 'part-material', 'part-density', 'part-group-name', 'part-color'])
      $(id).oninput = () => {
        if (id === 'part-group-name' || id === 'part-color') active.clearSurfaces = false;
        discard();
      };
    $('part-use-selection').onclick = () => run(selectedFaces);
    $('part-clear-faces').onclick = () => {
      discard();
      active.faceIds = [];
      faceLabel();
    };
    $('part-clear-groups').onclick = () =>
      run(() => {
        discard();
        active.faceIds = [];
        faceLabel();
        active.clearSurfaces = true;
        return preview();
      });
    $('part-definition-length').oninput = discard;
    $('part-definition-detached-number').oninput = discard;
    $('part-definition-length-preview').onclick = () => run(() => previewDefinition('length'));
    $('part-definition-detach-preview').onclick = () => run(() => previewDefinition('detach'));
    $('part-preview').onclick = () => run(preview);
    $('part-apply').onclick = () => run(apply);
    $('part-measure').onclick = () => run(summary);
    $('part-bom-mode').onchange = () => {
      const s = active;
      if (!s?.summary) return;
      const mode = $('part-bom-mode').value;
      s.summary = summarizeParts(s.summary.rawRows ?? s.summary.rows, { mode });
      renderSummaryTable(s.summary);
    };
    $('part-csv').onclick = () =>
      run(() =>
        download(
          partsCsv(active.summary, { grouped: $('part-bom-mode')?.value === 'grouped' }),
          'Stueckliste.csv',
          'text/csv',
        ),
      );
    $('explosion-create').onclick = () => run(createExplosion);
    $('explosion-distance').oninput = () =>
      run(() => {
        if (!explosion) throw Error('Zuerst Richtungen erzeugen.');
        showExplosion({ ...explosion, distance: number($('explosion-distance').value) });
      });
    $('explosion-show').onclick = () =>
      run(() => {
        if (!explosion) throw Error('Noch keine Explosion gespeichert.');
        showExplosion(explosion);
      });
    $('explosion-assembly').onclick = () => {
      suspendExplosion();
      onWorkspaceChange();
    };
    $('explosion-clear').onclick = clearExplosion;
    panel.hidden = false;
    renderMode();
  }
  function revisionChanged() {
    if (active?.applying) {
      active.revision = controller.revision();
      return;
    }
    close();
    service.clear();
  }
  return {
    open,
    close,
    pick,
    preview,
    apply,
    summary,
    createExplosion,
    showExplosion,
    suspendExplosion,
    restoreExplosion,
    storedExplosion: () => (explosion ? structuredClone(explosion) : null),
    exploded: () => showing && !!explosion?.distance,
    beforeDisplay: () => {
      view.clearExplosion();
    },
    afterDisplay: drawExplosion,
    revisionChanged,
    editing: () => !!active && ['material', 'surfaces', 'definition'].includes($('part-mode').value),
    picking: () => !!active && $('part-mode').value === 'surfaces',
    state: () =>
      active
        ? {
            revision: active.revision,
            busy: active.busy,
            faceIds: [...active.faceIds],
            hasPreview: !!active.proposal,
            summary: active.summary,
            explosion: explosion ? structuredClone(explosion) : null,
            showing,
          }
        : null,
    cacheState: service.state,
  };
}
