import { cadSelectionContext } from './cad-interface-state.js';
import { cadSourceGeometryDigest } from './cad-geometry-digest.js';
import { cadProjectParameterExportProblems } from './cad-project-parameters-export.js';
import { cadContourLinkProblems } from './cad-linked-contours-data.js';
import {
  CAD_DRAWING_LIMITS,
  createCadDrawingSheet,
  validateCadDrawings,
  cadDrawingPaperSize,
  cadDrawingProblems,
  cadDrawingDimension,
  cadDrawingBalloon,
  createCadDrawingBalloon,
  cadDrawingDefaultDetailCutout,
  cadDrawingDetailProjection,
  cadDrawingViewScale,
  updateCadDrawingDetailViews,
  updateCadDrawingProjection,
  createCadDrawingPartsList,
  cadDrawingPartsListDefaultPosition,
  cadDrawingExplosion,
  cadDrawingProjectionOptions,
} from './cad-drawing-data.js';
import { createPartPropertiesService } from './cad-part-properties-service.js';
import { cadDrawingSvg } from './cad-drawing-export.js';
import {
  cadDrawingUpdatedPosition,
  cadDrawingRescaledPosition,
  cadDrawingNewViewPosition,
} from './cad-drawing-layout.js';
import { autoDimensionCadDrawing } from './cad-drawing-auto-dimensions.js';
import { CAD_DRAWING_POINT_ROLES, cadDrawingCurvePoint } from './cad-drawing-measure.js';
import './cad-drawing.css';

const labels = {
  front: 'Vorderansicht',
  side: 'Seitenansicht',
  top: 'Draufsicht',
  section: 'Schnittansicht',
  detail: 'Detailansicht',
  exploded: 'Explosionsansicht',
};
const makeId = () => globalThis.crypto.randomUUID();
const copy = (value) => structuredClone(value);

/** The sheet is a local draft until Apply. Only update() starts a native job;
 * all paper interaction, picking, text and view placement reuse its 2D curves. */
export function createCadDrawingUI({
  controller,
  view,
  getSelection,
  getExplosion = () => controller.readSnapshot().workspace?.explosion,
  prepare = () => {},
  refresh = async () => {},
  toast = () => {},
  t = (value) => value,
  exportDrawing,
}) {
  const panel = document.createElement('section');
  panel.id = 'cad-drawing-panel';
  panel.className = 'cad-drawing-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', t('Technische Zeichnungsblätter'));
  view.canvas.parentElement.append(panel);
  const q = (selector) => panel.querySelector(selector),
    signatureCache = new WeakMap(),
    partService = createPartPropertiesService(controller);
  let active = null;
  function draftProject() {
    return active?.combined && active.proposal ? active.proposal.project : controller.readSnapshot();
  }
  function sourceSignatures(sheet, project = draftProject()) {
    const signatures = Object.create(null);
    for (const id of new Set(sheet.views.flatMap((v) => v.sourceIds))) {
      const node = project.nodes.find((n) => n.id === id);
      if (node?.kind === 'cad') {
        let digest = signatureCache.get(node);
        if (!digest) {
          digest = cadSourceGeometryDigest(node);
          signatureCache.set(node, digest);
        }
        signatures[id] = digest;
      }
    }
    return signatures;
  }
  function pendingSourceCommit(value = sheet()) {
    if (!active?.combined || !active.proposal || !value) return false;
    const confirmed = controller.readSnapshot(),
      options = {
        ids: [...new Set(value.views.flatMap((view) => view.sourceIds))],
        format: 'drawing-svg',
        includeHidden: true,
      };
    return (
      JSON.stringify(sourceSignatures(value, confirmed)) !== JSON.stringify(sourceSignatures(value)) ||
      cadProjectParameterExportProblems(confirmed, options).length > 0 ||
      cadContourLinkProblems(confirmed, confirmed.contourLinks, options).length > 0
    );
  }
  function current(s) {
    return active === s && s.revision === controller.revision();
  }
  function sheet(s = active) {
    return s?.drawings.sheets.find((value) => value.id === s.sheetId);
  }
  function status(message, error = false) {
    if (!active) return;
    active.message = message;
    active.error = error;
    const element = q('[data-drawing-status]');
    if (element) {
      element.textContent = t(message);
      element.classList.toggle('ai-error', error);
    }
  }
  function run(fn) {
    return Promise.resolve()
      .then(fn)
      .catch((error) => {
        if (error.name === 'AbortError' || error.code === 'ABORTED') return;
        if (active) status(error.message, true);
        else toast(error.message);
      });
  }
  function abort({ discardProposal = true } = {}) {
    const s = active;
    if (!s) return;
    s.ticket++;
    s.abort?.abort();
    s.abort = null;
    s.running = !!s.exporting;
    if (discardProposal) {
      if (s.proposal) controller.discard(s.proposal.previewId);
      s.proposal = null;
      s.combined = false;
      view.clearPreview();
    }
    busyControls();
  }
  function close() {
    if (!active) return false;
    abort();
    active = null;
    panel.hidden = true;
    panel.replaceChildren();
    return true;
  }
  function selectedIds() {
    const project = controller.readSnapshot(),
      selection = getSelection();
    if (!selection.length || selection.some((value) => value.path.length))
      throw Error('Vollständige sichtbare CAD-Materialteile auswählen.');
    const contexts = selection.map((value) => cadSelectionContext(project, value));
    if (contexts.some((c) => c.node.kind !== 'cad' || !c.node.solid || c.hidden || !view.allows(c.node.id)))
      throw Error('Zeichnungen benötigen sichtbare CAD-Materialteile.');
    return contexts.map((c) => c.node.id);
  }
  function ensureBase(s) {
    if (JSON.stringify(controller.readSnapshot().drawings ?? { version: 1, sheets: [] }) !== s.baseDrawings)
      throw Error(
        'Die gespeicherten Zeichnungsblätter wurden außerhalb dieses Entwurfs geändert. Entwurf schließen und das Blatt erneut öffnen.',
      );
    s.revision = controller.revision();
  }
  function problems(value = sheet()) {
    if (!value) return [];
    const issues = cadDrawingProblems(value, { sourceSignatures: sourceSignatures(value) }),
      options = {
        ids: [...new Set(value.views.flatMap((v) => v.sourceIds))],
        format: 'drawing-svg',
        includeHidden: true,
      };
    if (active?.combined && active.proposal) {
      const project = draftProject();
      issues.push(
        ...cadProjectParameterExportProblems(project, options),
        ...cadContourLinkProblems(project, project.contourLinks, options),
      );
    } else
      try {
        controller.assertExportReady?.(options);
      } catch (error) {
        issues.push({ code: error.code, message: error.message });
      }
    return issues;
  }
  function busyControls() {
    if (!active) return;
    const stale = !active.running && problems().length > 0;
    const pending = pendingSourceCommit(sheet());
    for (const element of panel.querySelectorAll(
      '[data-drawing-update],[data-drawing-apply],[data-drawing-export],[data-drawing-edit],[data-drawing-auto]',
    ))
      element.disabled =
        active.running ||
        (element.matches('[data-drawing-auto]') && stale) ||
        (element.matches('[data-drawing-export]') && (stale || pending));
    const cancel = q('[data-drawing-stop]');
    if (cancel) {
      cancel.hidden = !active.running;
      cancel.textContent = t(active.exporting ? 'Ausgabe abbrechen' : 'Berechnung abbrechen');
    }
  }
  function invalidateSelection() {
    if (active) {
      active.picks = [];
      active.annotationId = null;
    }
  }
  function edited(message = 'Blattentwurf geändert. Mit „Blatt übernehmen“ speichern.') {
    const s = active;
    if (!s) return;
    abort({ discardProposal: !s.combined });
    invalidateSelection();
    s.changed = true;
    renderSheet();
    status(message);
  }
  function numeric(element, min, max) {
    const raw = element.value.trim(),
      value = Number(raw.replace(',', '.'));
    if (!raw || !Number.isFinite(value) || value < min || value > max)
      throw Error('Bitte einen gültigen Wert im angegebenen Bereich eingeben.');
    return value;
  }
  function resizePaper() {
    const s = active,
      value = sheet(s),
      canvas = q('[data-drawing-paper]');
    if (!s || !value || !canvas) return;
    const [w, h] = cadDrawingPaperSize(value);
    canvas.style.width = w * 2.4 * s.zoom + 'px';
    canvas.style.height = h * 2.4 * s.zoom + 'px';
    const zoom = q('[data-drawing-zoom-value]');
    if (zoom) zoom.textContent = Math.round(s.zoom * 100) + ' %';
  }
  function fit() {
    const s = active;
    if (!s) return;
    const [w, h] = cadDrawingPaperSize(sheet()),
      viewport = q('[data-drawing-viewport]');
    s.zoom = Math.max(
      0.1,
      Math.min(5, Math.min((viewport.clientWidth - 36) / (w * 2.4), (viewport.clientHeight - 36) / (h * 2.4))),
    );
    resizePaper();
  }
  function renderSheet() {
    const s = active,
      value = sheet(s);
    if (!s || !value) return;
    const canvas = q('[data-drawing-paper]');
    if (!canvas) return;
    resizePaper();
    const signatures = sourceSignatures(value);
    canvas.innerHTML = cadDrawingSvg(value, {
      allowStale: true,
      sourceSignatures: signatures,
      interactive: true,
      explodedViewLabel: t(labels.exploded),
      lostBalloonLabel: t('Positionsballon: Bezug verloren'),
    });
    const svg = canvas.querySelector('svg');
    if (svg) {
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.setAttribute('aria-label', t(value.name));
    }
    for (const element of canvas.querySelectorAll('[data-drawing-curve]')) {
      const group = element.closest('[data-drawing-view]');
      if (s.picks.some((p) => p.viewId === group?.dataset.drawingView && p.curveId === element.dataset.drawingCurve))
        element.classList.add('drawing-picked');
    }
    const stale = problems(value),
      pendingCommit = pendingSourceCommit(value);
    const state = q('[data-drawing-freshness]');
    if (state) {
      const issue = stale.find((problem) => problem.code === 'LOST_BALLOON_REFERENCE') ?? stale[0];
      state.textContent = stale.length
        ? t('Aktualisierung nötig') + ' · ' + t(issue.message)
        : pendingCommit
          ? t('Berechnete Quellen mit „Blatt übernehmen“ bestätigen.')
          : t('Blatt aktuell');
      state.classList.toggle('ai-error', stale.length > 0);
    }
    for (const button of panel.querySelectorAll('[data-drawing-export]')) {
      button.disabled = s.running || stale.length > 0 || pendingCommit;
      button.title = pendingCommit ? t('Berechnete Quellen zunächst mit „Blatt übernehmen“ bestätigen.') : '';
    }
    const annotationList = q('[data-drawing-annotation-list]');
    if (annotationList) {
      annotationList.replaceChildren();
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = t('Keine gewählt');
      annotationList.append(empty);
      for (const a of value.annotations) {
        const option = document.createElement('option');
        option.value = a.id;
        try {
          option.textContent =
            a.kind === 'label'
              ? a.text
              : a.kind === 'balloon'
                ? t('Positionsballon') + ' ' + cadDrawingBalloon(value, a, { sourceSignatures: signatures }).row.position
                : a.kind === 'centermark'
                  ? t('Mittelpunktmarke') + ' (' + a.curveIds[0] + ')'
                  : a.kind === 'centerline'
                    ? t('Mittellinie') + ' (' + a.curveIds.join(' · ') + ')'
                    : cadDrawingDimension(value, a).text;
        } catch {
          option.textContent = a.kind === 'balloon' ? t('Positionsballon: Bezug verloren') : t('Bezug verloren') + ' · ' + a.kind;
        }
        annotationList.append(option);
      }
      annotationList.value = s.annotationId ?? '';
      annotationList.onchange = () => {
        s.annotationId = annotationList.value || null;
        q('[data-drawing-remove-annotation]').disabled = !s.annotationId;
        toolHint();
      };
    }
    const remove = q('[data-drawing-remove-annotation]');
    if (remove) remove.disabled = s.running || !s.annotationId;
    const zoom = q('[data-drawing-zoom-value]');
    if (zoom) zoom.textContent = Math.round(s.zoom * 100) + ' %';
    const autoButton = q('[data-drawing-auto]');
    if (autoButton) autoButton.disabled = s.running || stale.length > 0;
    const autoReport = q('[data-drawing-auto-report]');
    if (autoReport) {
      autoReport.hidden = !s.autoReport;
      autoReport.textContent = s.autoReport ? autoMessage(s.autoReport) : '';
    }
    const partsReport = q('[data-drawing-parts-report]');
    if (partsReport)
      partsReport.textContent = value.partsList
        ? `${t('Stückliste auf dem Blatt')}: ${value.partsList.rows.length} ${t('Positionen')} · ${value.partsList.title}`
        : '';
  }
  function render() {
    const s = active,
      value = sheet(s);
    if (!s || !value) return;
    panel.innerHTML = `<header class="drawing-heading"><strong>${t('Technische Zeichnungsblätter')}</strong><button data-drawing-close aria-label="${t('Schließen')}">×</button></header><div class="drawing-layout"><aside class="drawing-controls"><label>${t('Zeichnungsblatt')}<select data-drawing-sheet data-drawing-edit></select></label><div class="drawing-row"><button data-drawing-new data-drawing-edit>${t('Neues Blatt')}</button><button data-drawing-delete-sheet data-drawing-edit>${t('Blatt löschen')}</button></div><label>${t('Blattname')}<input data-drawing-name data-drawing-edit maxlength="200"></label><div class="drawing-row"><label>${t('Papier')}<select data-drawing-paper-size data-drawing-edit><option>A4</option><option>A3</option></select></label><label>${t('Ausrichtung')}<select data-drawing-orientation data-drawing-edit><option value="landscape">${t('Querformat')}</option><option value="portrait">${t('Hochformat')}</option></select></label></div><label>${t('Maßstab')}<select data-drawing-scale data-drawing-edit><option value="0.1">1:10</option><option value="0.2">1:5</option><option value="0.5">1:2</option><option value="1">1:1</option><option value="2">2:1</option><option value="5">5:1</option><option value="10">10:1</option></select></label><details class="drawing-titleblock"><summary>${t('Titelblock')}</summary><label>${t('Titel')}<input data-drawing-title data-drawing-edit maxlength="200"></label><label>${t('Zeichnungsnummer')}<input data-drawing-number data-drawing-edit maxlength="80"></label><div class="drawing-row"><label>${t('Revision')}<input data-drawing-revision data-drawing-edit maxlength="40"></label><label>${t('Datum')}<input data-drawing-date data-drawing-edit maxlength="40"></label></div><label>${t('Erstellt von')}<input data-drawing-author data-drawing-edit maxlength="120"></label></details><hr><label>${t('Ansicht')}<select data-drawing-view-list data-drawing-edit></select></label><div class="drawing-row"><select data-drawing-add-kind data-drawing-edit aria-label="${t('Neue Ansicht')}">${Object.entries(
      labels,
    )
      .map(([kind, label]) => `<option value="${kind}">${t(label)}</option>`)
      .join(
        '',
      )}</select><button data-drawing-add-view data-drawing-edit>${t('Hinzufügen')}</button></div><div class="drawing-row"><button data-drawing-sources data-drawing-edit>${t('Auswahl verwenden')}</button><button data-drawing-remove-view data-drawing-edit>${t('Ansicht löschen')}</button></div><p data-drawing-source-list class="small-note"></p><div data-drawing-section-controls><div class="drawing-row"><label>${t('Schnittachse')}<select data-drawing-section-axis data-drawing-edit><option value="0">X</option><option value="1">Y</option><option value="2">Z</option></select></label><label>${t('Schnittlage (mm)')}<input data-drawing-section-offset data-drawing-edit inputmode="decimal"></label></div></div><div data-drawing-detail-controls hidden><p class="small-note">${t('Detailansicht: Ausschnitt in Modellkoordinaten der Quellansicht. Der Detailmaßstab gilt nur für dieses Detail; die Modellmaße und die DXF-Ausgabe bleiben 1:1.')}</p><div class="drawing-row"><label>${t('Ausschnitt X (mm)')}<input data-drawing-detail-x data-drawing-edit inputmode="decimal"></label><label>${t('Ausschnitt Y (mm)')}<input data-drawing-detail-y data-drawing-edit inputmode="decimal"></label></div><div class="drawing-row"><label>${t('Ausschnittradius (mm)')}<input data-drawing-detail-radius data-drawing-edit inputmode="decimal"></label><label>${t('Detailmaßstab')}<select data-drawing-detail-scale data-drawing-edit></select></label></div></div><hr><label>${t('Blattwerkzeug')}<select data-drawing-tool><option value="move">${t('Ansichten und Maßtexte verschieben')}</option><option value="length">${t('Längenmaß · Linie anklicken')}</option><option value="angle">${t('Winkelmaß · zwei Linien anklicken')}</option><option value="radius">${t('Radiusmaß · Kreis oder Bogen anklicken')}</option><option value="diameter">${t('Durchmesser · Kreis oder Bogen anklicken')}</option><option value="centermark">${t('Mittelpunktmarke · Kreis oder Bogen anklicken')}</option><option value="centerline">${t('Mittellinie · zwei Kreise oder Bögen anklicken')}</option><option value="balloon">${t('Positionsballon · Bauteilkante anklicken')}</option><option value="label">${t('Beschriftung · Blatt anklicken')}</option></select></label><label data-drawing-label-control hidden>${t('Beschriftung')}<input data-drawing-label maxlength="500"></label><label data-drawing-centerline-control hidden>${t('Überstand (mm)')}<input data-drawing-overhang type="number" min="0" max="100" step="1" inputmode="decimal"></label><div data-drawing-tolerance-control hidden><label>${t('Toleranzanzeige')}<select data-drawing-tolerance-mode data-drawing-edit><option value="none">${t('Keine Toleranz')}</option><option value="deviation">${t('Abweichung (+/−)')}</option><option value="limits">${t('Grenzmaße')}</option></select></label><div data-drawing-tolerance-inputs class="drawing-row" hidden><label>${t('Obere Abweichung (mm)')}<input data-drawing-tolerance-upper type="number" step="0.01" inputmode="decimal"></label><label>${t('Untere Abweichung (mm)')}<input data-drawing-tolerance-lower type="number" step="0.01" inputmode="decimal"></label></div></div><button data-drawing-remove-annotation data-drawing-edit disabled>${t('Gewählte Beschriftung löschen')}</button><p class="small-note" data-drawing-tool-hint></p></aside><main class="drawing-workspace"><div class="drawing-toolbar"><button data-drawing-zoom-out aria-label="${t('Verkleinern')}">−</button><span data-drawing-zoom-value></span><button data-drawing-zoom-in aria-label="${t('Vergrößern')}">+</button><button data-drawing-fit>${t('Blatt einpassen')}</button><span data-drawing-freshness role="status"></span></div><div class="drawing-viewport" data-drawing-viewport tabindex="0" aria-label="${t('Zeichnungsblatt')} "><div class="drawing-paper" data-drawing-paper></div></div></main></div><footer class="drawing-footer"><p data-drawing-status role="status" aria-live="polite"></p><div class="drawing-actions"><button data-drawing-update>${t('Blatt aktualisieren')}</button><button data-drawing-stop hidden>${t('Berechnung abbrechen')}</button><button data-drawing-export="pdf">PDF</button><button data-drawing-export="svg">SVG</button><button data-drawing-export="dxf">DXF 1:1</button><button data-drawing-apply class="primary">${t('Blatt übernehmen')}</button><button data-drawing-cancel>${t('Abbrechen')}</button></div></footer>`;
    const autoControls = document.createElement('div');
    autoControls.className = 'drawing-auto-controls';
    autoControls.innerHTML = `<label>${t('Automatische Bemaßung')}<select data-drawing-auto-mode data-drawing-edit><option value="basic">${t('Grundbemaßung')}</option><option value="detailed">${t('Detaillierte Bemaßung')}</option></select></label><button data-drawing-auto>${t('Automatisch bemaßen')}</button><p class="small-note">${t('Ergänzt Maße auf dem ganzen Blatt. Vorhandene Maße bleiben erhalten. Vorschläge lassen sich verschieben, löschen und ergänzen.')}</p><p class="small-note" data-drawing-auto-report role="status" hidden></p>`;
    q('[data-drawing-tool]').parentElement.before(autoControls);
    const partsControls = document.createElement('div');
    partsControls.className = 'drawing-parts-controls';
    partsControls.innerHTML = `<label>${t('Stückliste')}<button data-drawing-parts data-drawing-edit type="button">${t('Gruppierte Stückliste setzen / aktualisieren')}</button></label><p class="small-note" data-drawing-parts-report role="status"></p><p class="small-note">${t('Gruppiert nach Bauteildefinition. Bestehende Positionsnummern bleiben beim Umsortieren, Aus-/Einblenden und Wiederöffnen erhalten.')}</p>`;
    autoControls.after(partsControls);
    q('[data-drawing-parts]').id = 'drawing-parts';
    q('[data-drawing-parts]').onclick = () => run(updatePartsList);
    q('[data-drawing-auto-mode]').value = s.autoMode ?? 'basic';
    q('[data-drawing-auto-mode]').onchange = () => {
      s.autoMode = q('[data-drawing-auto-mode]').value;
    };
    q('[data-drawing-auto]').onclick = () => run(() => automatic(q('[data-drawing-auto-mode]').value));
    for (const [kind, label] of [
      ['distance-x', 'Horizontaler Abstand · zwei Maßpunkte'],
      ['distance-y', 'Vertikaler Abstand · zwei Maßpunkte'],
    ]) {
      const option = document.createElement('option');
      option.value = kind;
      option.textContent = t(label);
      q('[data-drawing-tool]').append(option);
    }
    const annotationLabel = document.createElement('label'),
      annotationList = document.createElement('select');
    annotationLabel.textContent = t('Gespeicherte Beschriftung');
    annotationList.dataset.drawingAnnotationList = '';
    annotationList.dataset.drawingEdit = '';
    annotationLabel.append(annotationList);
    q('[data-drawing-remove-annotation]').before(annotationLabel);
    // Stable names for the visible controls used by the practice assistant.
    for (const key of [
      'sheet',
      'name',
      'paper-size',
      'orientation',
      'scale',
      'title',
      'add-kind',
      'add-view',
      'update',
      'auto-mode',
      'auto',
      'apply',
      'annotation-list',
      'remove-annotation',
    ]) {
      q('[data-drawing-' + key + ']').id = 'drawing-' + key;
    }
    q('[data-drawing-title]').closest('details').querySelector('summary').id = 'drawing-title-block';
    const sheets = q('[data-drawing-sheet]');
    for (const item of s.drawings.sheets) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name;
      sheets.append(option);
    }
    sheets.value = s.sheetId;
    sheets.onchange = () => {
      s.sheetId = sheets.value;
      s.viewId = sheet().views[0]?.id;
      invalidateSelection();
      render();
      fit();
    };
    q('[data-drawing-close]').onclick = q('[data-drawing-cancel]').onclick = close;
    q('[data-drawing-new]').onclick = () =>
      run(() => {
        if (s.drawings.sheets.length >= CAD_DRAWING_LIMITS.sheets)
          throw Error('Höchstens ' + CAD_DRAWING_LIMITS.sheets + ' Zeichnungsblätter pro Projekt.');
        const item = createCadDrawingSheet({
          sourceIds: selectedIds(),
          name: 'Zeichnungsblatt ' + (s.drawings.sheets.length + 1),
        });
        s.drawings.sheets.push(item);
        s.sheetId = item.id;
        s.viewId = item.views[0]?.id;
        s.changed = true;
        render();
        fit();
      });
    q('[data-drawing-delete-sheet]').onclick = () =>
      run(() => {
        if (s.drawings.sheets.length === 1) throw Error('Mindestens ein Blatt behalten.');
        s.drawings.sheets = s.drawings.sheets.filter((item) => item.id !== value.id);
        s.sheetId = s.drawings.sheets[0].id;
        s.viewId = sheet().views[0]?.id;
        s.changed = true;
        render();
        fit();
      });
    for (const [selector, key] of [
      ['name', 'name'],
      ['paper-size', 'paper'],
      ['orientation', 'orientation'],
    ]) {
      const input = q('[data-drawing-' + selector + ']');
      input.value = value[key];
      input.onchange = () =>
        run(() => {
          if (key === 'name' && !input.value.trim()) throw Error('Ein Blattname wird benötigt.');
          value[key] = input.value;
          edited();
          if (key !== 'name') fit();
          else sheets.selectedOptions[0].textContent = value.name;
        });
    }
    const scale = q('[data-drawing-scale]'),
      scaleLabel = (n) => (n >= 1 ? String(n) + ':1' : '1:' + String(Number((1 / n).toPrecision(8))));
    scale.replaceChildren();
    for (const n of [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]) {
      const option = document.createElement('option');
      option.value = String(n);
      option.textContent = scaleLabel(n);
      scale.append(option);
    }
    if (![...scale.options].some((option) => Number(option.value) === value.scale)) {
      const option = document.createElement('option');
      option.value = value.scale;
      option.textContent = scaleLabel(value.scale);
      scale.append(option);
    }
    scale.value = String(value.scale);
    scale.onchange = () => {
      const next = Number(scale.value);
      for (const item of value.views)
        if (item.scale === undefined)
          item.position = cadDrawingRescaledPosition(item.position, item.projection, value.scale, next);
      value.scale = next;
      edited('Papiermaßstab geändert. Die Modellmaße und die DXF-Ausgabe bleiben 1:1.');
    };
    for (const key of ['title', 'number', 'revision', 'author', 'date']) {
      const input = q('[data-drawing-' + key + ']');
      input.value = value.titleBlock[key] ?? '';
      input.oninput = () => {
        value.titleBlock[key] = input.value;
        edited();
      };
    }
    q('[data-drawing-add-view]').onclick = () =>
      run(() => {
        if (value.views.length >= CAD_DRAWING_LIMITS.views)
          throw Error('Höchstens ' + CAD_DRAWING_LIMITS.views + ' Ansichten pro Blatt.');
        const kind = q('[data-drawing-add-kind]').value,
          parent = value.views.find((v) => v.id === s.viewId);
        let entry;
        if (kind === 'detail') {
          if (!parent) throw Error('Für ein Detail zuerst eine Quellansicht wählen.');
          if (parent.kind === 'detail') throw Error('Ein Detail einer Detailansicht wird nicht unterstützt.');
          if (!parent.projection)
            throw Error('Für ein Detail zuerst die Quellansicht mit „Blatt aktualisieren“ berechnen.');
          const cutout = cadDrawingDefaultDetailCutout(parent.projection, parent.id);
          entry = {
            id: makeId(),
            kind,
            sourceIds: [...parent.sourceIds],
            position: cadDrawingNewViewPosition(value.views.length, cadDrawingPaperSize(value)),
            scale: 2,
            cutout,
            projection: cadDrawingDetailProjection(parent.projection, cutout),
          };
        } else if (kind === 'exploded') {
          if (!parent || !['front', 'side', 'top'].includes(parent.kind))
            throw Error('Für eine Explosionsansicht zuerst eine Montageansicht wählen.');
          const paper = cadDrawingPaperSize(value);
          const position = value.views.some((item) => item.kind === 'exploded')
            ? cadDrawingNewViewPosition(value.views.length, paper)
            : [paper[0] * 0.65, paper[1] * 0.25];
          entry = {
            id: makeId(),
            kind,
            sourceIds: [...parent.sourceIds],
            position,
            assemblyViewId: parent.id,
            explosion: cadDrawingExplosion(getExplosion(), parent.sourceIds, { capture: true }),
          };
        } else {
          const sourceIds = parent?.sourceIds ?? selectedIds();
          entry = {
            id: makeId(),
            kind,
            sourceIds: [...sourceIds],
            position: cadDrawingNewViewPosition(value.views.length, cadDrawingPaperSize(value)),
            ...(kind === 'section' ? { section: { axis: 2, offset: 0 } } : {}),
          };
        }
        value.views.push(entry);
        s.viewId = entry.id;
        s.changed = true;
        render();
        status(
          kind === 'detail'
            ? 'Detailansicht mit eigenem Maßstab angelegt. Ausschnitt und Maßstab links einstellen.'
            : 'Neue Ansicht angelegt. „Blatt aktualisieren“ berechnet die Konturen.',
        );
      });
    q('[data-drawing-remove-view]').onclick = () =>
      run(() => {
        if (value.views.length === 1) throw Error('Mindestens eine Ansicht behalten.');
        value.views = value.views.filter((v) => v.id !== s.viewId);
        value.annotations = value.annotations.filter((a) => a.viewId !== s.viewId);
        s.viewId = value.views[0]?.id;
        s.changed = true;
        render();
      });
    q('[data-drawing-sources]').onclick = () =>
      run(() => {
        const item = value.views.find((v) => v.id === s.viewId);
        if (item.kind === 'exploded') return;
        item.sourceIds = selectedIds();
        s.changed = true;
        render();
        status('Auswahl als Quelle gesetzt. „Blatt aktualisieren“ berechnet die Konturen.');
      });
    q('[data-drawing-tool]').value = s.tool;
    q('[data-drawing-tool]').onchange = () => {
      s.tool = q('[data-drawing-tool]').value;
      invalidateSelection();
      toolHint();
      renderSheet();
    };
    q('[data-drawing-label]').value = s.label;
    q('[data-drawing-label]').oninput = () => {
      s.label = q('[data-drawing-label]').value;
    };
    const overhangInput = q('[data-drawing-overhang]');
    if (overhangInput) {
      overhangInput.value = s.overhangMm ?? 3;
      overhangInput.oninput = overhangInput.onchange = () => {
        const num = Number(overhangInput.value);
        if (Number.isFinite(num) && num >= 0 && num <= 100) {
          s.overhangMm = num;
          const target = value.annotations.find((a) => a.id === s.annotationId);
          if (target && target.kind === 'centerline') {
            target.overhangMm = num;
            edited();
          }
        }
      };
    }
    const toleranceModeSelect = q('[data-drawing-tolerance-mode]');
    if (toleranceModeSelect) {
      toleranceModeSelect.onchange = () => {
        const target = value.annotations.find((a) => a.id === s.annotationId);
        if (!target || !['length', 'diameter', 'radius', 'distance'].includes(target.kind)) return;
        const mode = toleranceModeSelect.value;
        if (mode === 'none') {
          delete target.tolerance;
        } else {
          if (!target.tolerance) {
            target.tolerance = { upper: 0.1, lower: -0.05, mode };
          } else {
            target.tolerance.mode = mode;
          }
        }
        toolHint();
        edited();
      };
    }
    const toleranceUpper = q('[data-drawing-tolerance-upper]');
    const toleranceLower = q('[data-drawing-tolerance-lower]');
    const onToleranceChange = () => {
      const target = value.annotations.find((a) => a.id === s.annotationId);
      if (!target || !target.tolerance) return;
      const up = Number(toleranceUpper?.value);
      const low = Number(toleranceLower?.value);
      if (Number.isFinite(up) && Number.isFinite(low)) {
        if (low > up) {
          status(t('Untere Toleranzgrenze darf nicht größer als die obere sein.'));
          return;
        }
        try {
          const testAnnotation = structuredClone(target);
          testAnnotation.tolerance.upper = up;
          testAnnotation.tolerance.lower = low;
          cadDrawingDimension(value, testAnnotation);
          target.tolerance.upper = up;
          target.tolerance.lower = low;
          edited();
        } catch (err) {
          status(err.message);
        }
      }
    };
    if (toleranceUpper) toleranceUpper.oninput = toleranceUpper.onchange = onToleranceChange;
    if (toleranceLower) toleranceLower.oninput = toleranceLower.onchange = onToleranceChange;
    q('[data-drawing-remove-annotation]').onclick = () => {
      if (!s.annotationId) return;
      value.annotations = value.annotations.filter((a) => a.id !== s.annotationId);
      edited();
      q('[data-drawing-remove-annotation]').disabled = true;
    };
    q('[data-drawing-update]').onclick = () => run(update);
    q('[data-drawing-stop]').onclick = () => {
      const exporting = s.exporting;
      abort({ discardProposal: false });
      status(
        exporting ? 'Ausgabe wird abgebrochen …' : 'Berechnung abgebrochen. Vorherige Blattdaten bleiben erhalten.',
      );
      renderSheet();
    };
    q('[data-drawing-apply]').onclick = () => run(apply);
    for (const button of panel.querySelectorAll('[data-drawing-export]'))
      button.onclick = () => run(() => exportFile(button.dataset.drawingExport));
    q('[data-drawing-zoom-in]').onclick = () => {
      s.zoom = Math.min(5, s.zoom * 1.2);
      resizePaper();
    };
    q('[data-drawing-zoom-out]').onclick = () => {
      s.zoom = Math.max(0.1, s.zoom / 1.2);
      resizePaper();
    };
    q('[data-drawing-fit]').onclick = fit;
    const viewport = q('[data-drawing-viewport]');
    viewport.addEventListener(
      'wheel',
      (event) => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        s.zoom = Math.max(0.1, Math.min(5, s.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1)));
        resizePaper();
      },
      { passive: false },
    );
    q('[data-drawing-paper]').addEventListener('pointerdown', pointerDown);
    q('[data-drawing-paper]').addEventListener('pointermove', pointerMove);
    q('[data-drawing-paper]').addEventListener('pointerup', pointerUp);
    q('[data-drawing-paper]').addEventListener('pointercancel', pointerCancel);
    renderViewControls();
    toolHint();
    renderSheet();
    busyControls();
    status(
      s.message ??
        '„Blatt aktualisieren“ berechnet die Ansichten. Ansichten und Maßtexte lassen sich anschließend auf dem Blatt verschieben.',
      s.error,
    );
  }
  function renderViewControls() {
    const s = active,
      value = sheet(),
      list = q('[data-drawing-view-list]'),
      scaleText = (n) => (n >= 1 ? String(n) + ':1' : '1:' + String(Number((1 / n).toPrecision(8))));
    list.replaceChildren();
    for (const item of value.views) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = t(labels[item.kind]) + ' ' + (value.views.indexOf(item) + 1);
      list.append(option);
    }
    if (!value.views.some((v) => v.id === s.viewId)) s.viewId = value.views[0]?.id;
    list.value = s.viewId;
    list.onchange = () => {
      s.viewId = list.value;
      renderViewControls();
    };
    const item = value.views.find((v) => v.id === s.viewId);
    q('[data-drawing-sources]').hidden = item?.kind === 'exploded';
    q('[data-drawing-section-controls]').hidden = item?.kind !== 'section';
    const nodes = controller.readSnapshot().nodes;
    q('[data-drawing-source-list]').textContent = item
      ? t('Quellen') +
        ': ' +
        item.sourceIds.map((id) => nodes.find((n) => n.id === id)?.name ?? t('Fehlendes Teil')).join(', ')
      : '';
    if (item?.kind === 'section') {
      q('[data-drawing-section-axis]').value = String(item.section.axis);
      q('[data-drawing-section-offset]').value = String(item.section.offset);
      q('[data-drawing-section-axis]').onchange = () => {
        item.section.axis = Number(q('[data-drawing-section-axis]').value);
        edited('Schnittlage geändert. „Blatt aktualisieren“ berechnet die neue Schnittkontur.');
      };
      q('[data-drawing-section-offset]').onchange = () =>
        run(() => {
          item.section.offset = numeric(q('[data-drawing-section-offset]'), -100000, 100000);
          edited('Schnittlage geändert. „Blatt aktualisieren“ berechnet die neue Schnittkontur.');
        });
    }
    const detailControls = q('[data-drawing-detail-controls]');
    if (detailControls) detailControls.hidden = item?.kind !== 'detail';
    if (item?.kind === 'detail') {
      const x = q('[data-drawing-detail-x]'),
        y = q('[data-drawing-detail-y]'),
        radius = q('[data-drawing-detail-radius]'),
        scale = q('[data-drawing-detail-scale]');
      x.value = String(item.cutout.center[0]);
      y.value = String(item.cutout.center[1]);
      radius.value = String(item.cutout.radius);
      scale.replaceChildren();
      for (const n of [0.1, 0.2, 0.5, 1, 2, 5, 10]) {
        const option = document.createElement('option');
        option.value = String(n);
        option.textContent = n >= 1 ? String(n) + ':1' : '1:' + String(Number((1 / n).toPrecision(8)));
        scale.append(option);
      }
      if (![...scale.options].some((option) => Number(option.value) === item.scale)) {
        const option = document.createElement('option');
        option.value = String(item.scale);
        option.textContent = scaleText(item.scale);
        scale.append(option);
      }
      scale.value = String(item.scale);
      const apply = () =>
        run(() => {
          const parent = value.views.find((view) => view.id === item.cutout.sourceViewId);
          if (!parent?.projection)
            throw Error('Die Detailquelle hat keine berechnete Projektion. Zuerst „Blatt aktualisieren“ ausführen.');
          const cutout = {
            sourceViewId: item.cutout.sourceViewId,
            center: [numeric(x, -1e6, 1e6), numeric(y, -1e6, 1e6)],
            radius: numeric(radius, 0, 1e6),
          };
          if (!(cutout.radius > 1e-9)) throw Error('Der Ausschnittradius muss größer als 0 sein.');
          const projection = cadDrawingDetailProjection(parent.projection, cutout),
            nextScale = Number(scale.value);
          if (!Number.isFinite(nextScale) || nextScale <= 0) throw Error('Ungültiger Detailmaßstab.');
          const previousScale = cadDrawingViewScale(item, value);
          if (nextScale !== previousScale)
            for (const annotation of value.annotations.filter((a) => a.viewId === item.id))
              annotation.position = [
                item.position[0] + (annotation.position[0] - item.position[0]) * (nextScale / previousScale),
                item.position[1] + (annotation.position[1] - item.position[1]) * (nextScale / previousScale),
              ];
          item.cutout = cutout;
          item.scale = nextScale;
          item.projection = projection;
          const updated = updateCadDrawingDetailViews(value);
          if (updated.changed) Object.assign(value, updated.sheet);
          edited('Detailausschnitt geändert. Die Modellmaße und die DXF-Ausgabe bleiben 1:1.');
        });
      x.onchange = y.onchange = radius.onchange = scale.onchange = apply;
    }
  }
  function toolHint() {
    const s = active;
    if (!s) return;
    q('[data-drawing-label-control]').hidden = s.tool !== 'label';
    const target = s.annotationId ? sheet().annotations.find((a) => a.id === s.annotationId) : null;
    const isCenterline = s.tool === 'centerline' || target?.kind === 'centerline';
    const overhangControl = q('[data-drawing-centerline-control]');
    if (overhangControl) {
      overhangControl.hidden = !isCenterline;
      if (isCenterline && target?.kind === 'centerline') {
        const input = q('[data-drawing-overhang]');
        if (input && Number.isFinite(target.overhangMm)) input.value = target.overhangMm;
      }
    }
    const toleranceControl = q('[data-drawing-tolerance-control]');
    const toleranceInputs = q('[data-drawing-tolerance-inputs]');
    const toleranceModeSelect = q('[data-drawing-tolerance-mode]');
    const toleranceUpper = q('[data-drawing-tolerance-upper]');
    const toleranceLower = q('[data-drawing-tolerance-lower]');
    const canHaveTolerance = target && ['length', 'diameter', 'radius', 'distance'].includes(target.kind);
    if (toleranceControl) {
      toleranceControl.hidden = !canHaveTolerance;
      if (canHaveTolerance) {
        const mode = target.tolerance ? (target.tolerance.mode ?? 'deviation') : 'none';
        if (toleranceModeSelect) toleranceModeSelect.value = mode;
        if (toleranceInputs) toleranceInputs.hidden = mode === 'none';
        if (toleranceUpper && target.tolerance) toleranceUpper.value = target.tolerance.upper;
        if (toleranceLower && target.tolerance) toleranceLower.value = target.tolerance.lower;
      }
    }
    q('[data-drawing-tool-hint]').textContent = t(
      s.tool.startsWith('distance-')
        ? 'Zwei Maßpunkte derselben Ansicht anklicken. Bei Geraden wird der nächste Endpunkt, bei Kreisen die Mitte verwendet.'
        : s.tool === 'move'
          ? 'Eine Ansicht oder einen Maßtext ziehen. Maßtexte anklicken und anschließend löschen.'
          : s.tool === 'angle'
            ? 'Zwei gerade Kanten derselben Ansicht nacheinander anklicken.'
            : s.tool === 'centerline'
              ? 'Zwei Kreise oder Kreisbögen derselben Ansicht nacheinander anklicken.'
              : s.tool === 'balloon'
                ? 'Eine Kante des Bauteils anklicken. Die Nummer kommt aus der Stückliste auf dem Blatt.'
                : s.tool === 'label'
                ? 'Text eingeben und die gewünschte Position auf dem Blatt anklicken.'
                : s.tool === 'length'
                  ? 'Eine gerade Kante anklicken. Gemessen wird ihre projizierte Länge in Millimetern.'
                  : s.tool === 'centermark'
                    ? 'Einen Kreis oder Kreisbogen anklicken, um eine Mittelpunktmarke zu setzen.'
                    : 'Einen unverzerrten Kreis oder Kreisbogen anklicken.',
    );
  }
  function autoMessage(report) {
    return `${t('Maße ergänzt')}: ${report.added} · ${t('Bereits bemaßt')}: ${report.duplicates}. ${report.warnings.map(t).join(' ')} ${t('Vorschau prüfen und mit „Blatt übernehmen“ speichern.')}`;
  }
  function automatic(mode = 'basic') {
    const s = active;
    if (!s || s.running) return;
    ensureBase(s);
    const value = sheet(),
      issues = problems(value);
    if (issues.length) throw Error(issues[0].message + ' ' + t('Zuerst „Blatt aktualisieren“ ausführen.'));
    const result = autoDimensionCadDrawing(value, { mode, sourceSignatures: sourceSignatures(value) });
    value.annotations = result.sheet.annotations;
    s.autoReport = result.report;
    s.autoMode = mode;
    s.tool = 'move';
    q('[data-drawing-tool]').value = 'move';
    toolHint();
    edited(autoMessage(result.report));
    return copy(result.report);
  }
  async function updatePartsList() {
    const s = active;
    if (!s || s.running) return;
    ensureBase(s);
    const value = sheet(),
      ticket = ++s.ticket,
      revision = s.revision;
    s.running = true;
    s.abort = new AbortController();
    busyControls();
    status('Stückliste wird aus den sichtbaren Teilen ermittelt …');
    try {
      const summary = await partService.measure({ mode: 'grouped' });
      if (active !== s || ticket !== s.ticket || s.revision !== revision || controller.revision() !== revision) return;
      if (!summary.rows.length && !value.partsList)
        throw Error('Keine sichtbaren fertigen Teile für die Stückliste. Zuerst Teile einblenden und erneut prüfen.');
      const previous = value.partsList ?? null,
        table = createCadDrawingPartsList(summary.rows, {
          id: previous?.id,
          title: previous?.title ?? 'Stückliste',
          position: cadDrawingPartsListDefaultPosition(value, summary.rows.length),
          previous,
        });
      value.partsList = table;
      s.changed = true;
      edited(
        previous
          ? summary.rows.length
            ? `Stückliste aktualisiert: ${table.rows.length} Positionen. Vorhandene Positionsnummern bleiben erhalten.`
            : 'Stückliste aktualisiert: keine sichtbaren Teile. Entfernte Positionsnummern bleiben für ein späteres Einblenden reserviert.'
          : `Stückliste mit ${table.rows.length} Positionen auf das Blatt gesetzt.`,
      );
      return copy(table);
    } finally {
      if (active === s && ticket === s.ticket) {
        s.running = false;
        s.abort = null;
        busyControls();
        renderSheet();
      }
    }
  }
  function paperPoint(event) {
    const canvas = q('[data-drawing-paper]'),
      bounds = canvas.getBoundingClientRect(),
      [w, h] = cadDrawingPaperSize(sheet());
    return [((event.clientX - bounds.left) * w) / bounds.width, ((event.clientY - bounds.top) * h) / bounds.height];
  }
  function measurePosition(value, point) {
    const position = [point[0] + 10, point[1] - 8];
    for (
      let i = 0;
      i < 20 &&
      value.annotations.some(
        (a) => Math.abs(a.position[0] - position[0]) < 22 && Math.abs(a.position[1] - position[1]) < 5,
      );
      i++
    )
      position[1] -= 6;
    return position;
  }
  function pointerDown(event) {
    const s = active;
    if (!s || s.running || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    run(() => {
      const point = paperPoint(event),
        annotation = event.target.closest('[data-drawing-annotation]'),
        group = event.target.closest('[data-drawing-view]'),
        curveElement = event.target.closest('[data-drawing-curve]'),
        value = sheet(),
        item = value.views.find((v) => v.id === group?.dataset.drawingView);
      if (item) {
        s.viewId = item.id;
        renderViewControls();
      }
      if (s.tool === 'label') {
        if (!s.label.trim()) throw Error('Zuerst eine Beschriftung eingeben.');
        value.annotations.push({ id: makeId(), kind: 'label', text: s.label, position: point });
        edited();
        return;
      }
      if (s.tool.startsWith('distance-')) {
        if (!item || !curveElement) throw Error('Eine geeignete Konturkante der Ansicht anklicken.');
        const curveId = curveElement.dataset.drawingCurve,
          curve = item.projection?.curves.find((c) => c.id === curveId);
        let role = 'center';
        if (curve?.kind === 'line') {
          const itemScale = cadDrawingViewScale(item, value),
            toPaper = (p) => [item.position[0] + p[0] * itemScale, item.position[1] - p[1] * itemScale],
            distance = (p) => Math.hypot(p[0] - point[0], p[1] - point[1]);
          role = distance(toPaper(curve.a)) <= distance(toPaper(curve.b)) ? 'a' : 'b';
        }
        if (!CAD_DRAWING_POINT_ROLES.includes(role)) return;
        cadDrawingCurvePoint(curve, role);
        const pick = { viewId: item.id, curveId, point: role };
        if (!s.picks.length) {
          s.picks = [pick];
          renderSheet();
          status('Zweiten Maßpunkt derselben Ansicht anklicken.');
          return;
        }
        if (s.picks[0].viewId !== item.id) throw Error('Beide Maßpunkte in derselben Ansicht auswählen.');
        if (value.annotations.length >= CAD_DRAWING_LIMITS.annotations) throw Error('Die Maßgrenze wurde erreicht.');
        const picks = [s.picks[0], pick],
          curveIds = [...new Set(picks.map((p) => p.curveId))],
          annotation = {
            id: makeId(),
            kind: 'distance',
            axis: s.tool === 'distance-x' ? 'x' : 'y',
            viewId: item.id,
            curveIds,
            anchors: picks.map((p) => ({ curveIndex: curveIds.indexOf(p.curveId), point: p.point })),
            sourceSignatures: copy(item.projection.sourceSignatures),
            position: measurePosition(value, point),
          };
        cadDrawingDimension(value, annotation);
        value.annotations.push(annotation);
        edited();
        return;
      }
      if (s.tool !== 'move') {
        if (!item || !curveElement) throw Error('Eine geeignete Konturkante der Ansicht anklicken.');
        const curveId = curveElement.dataset.drawingCurve,
          curve = item.projection?.curves.find((c) => c.id === curveId);
        if (s.tool === 'balloon') {
          if (value.annotations.length >= CAD_DRAWING_LIMITS.annotations) throw Error('Die Maßgrenze wurde erreicht.');
          const issue = problems(value).find((problem) => problem.viewId === item.id && !problem.annotationId);
          if (issue) throw Error(issue.message);
          const size = cadDrawingPaperSize(value),
            position = measurePosition(value, point).map((coordinate, axis) =>
              Math.max(15, Math.min(size[axis] - 15, coordinate)),
            );
          const balloon = createCadDrawingBalloon(value, { id: makeId(), viewId: item.id, curveId, position }, {
            sourceSignatures: sourceSignatures(value),
          });
          value.annotations.push(balloon);
          edited();
          return;
        }
        if (s.tool === 'length' || s.tool === 'angle') {
          if (curve?.kind !== 'line') throw Error('Für dieses Maß gerade Konturkanten wählen.');
        } else if (!['circle', 'arc'].includes(curve?.kind))
          throw Error(
            s.tool === 'centermark'
              ? 'Für eine Mittelpunktmarke einen Kreis oder Kreisbogen wählen.'
              : s.tool === 'centerline'
                ? 'Für eine Mittellinie Kreise oder Kreisbögen wählen.'
                : 'Für Radius und Durchmesser einen unverzerrten Kreis oder Kreisbogen wählen.',
          );
        if (s.tool === 'angle' || s.tool === 'centerline') {
          if (!s.picks.length) {
            s.picks = [{ viewId: item.id, curveId }];
            renderSheet();
            status(
              s.tool === 'centerline'
                ? 'Zweiten Kreis oder Kreisbogen derselben Ansicht anklicken.'
                : 'Zweite gerade Kante derselben Ansicht anklicken.',
            );
            return;
          }
          if (s.picks[0].viewId !== item.id)
            throw Error(
              s.tool === 'centerline'
                ? 'Beide Bohrungen in derselben Ansicht auswählen.'
                : 'Beide Kanten in derselben Ansicht auswählen.',
            );
          if (s.picks[0].curveId === curveId)
            throw Error(
              s.tool === 'centerline'
                ? 'Einen anderen Kreis oder Kreisbogen wählen.'
                : 'Eine andere gerade Kante wählen.',
            );
        }
        const curveIds = ['angle', 'centerline'].includes(s.tool) ? [s.picks[0].curveId, curveId] : [curveId];
        const selectedCurves = curveIds.map((id) => item.projection?.curves.find((c) => c.id === id));
        let pos;
        const itemScale = cadDrawingViewScale(item, value);
        if (s.tool === 'centermark' && curve?.center) {
          pos = [item.position[0] + curve.center[0] * itemScale, item.position[1] - curve.center[1] * itemScale];
        } else if (s.tool === 'centerline' && selectedCurves[0]?.center && selectedCurves[1]?.center) {
          const p1 = [item.position[0] + selectedCurves[0].center[0] * itemScale, item.position[1] - selectedCurves[0].center[1] * itemScale];
          const p2 = [item.position[0] + selectedCurves[1].center[0] * itemScale, item.position[1] - selectedCurves[1].center[1] * itemScale];
          pos = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
        } else {
          pos = measurePosition(value, point);
        }
        const annotation = {
          id: makeId(),
          kind: s.tool,
          viewId: item.id,
          sourceSignatures: copy(item.projection.sourceSignatures),
          curveIds,
          position: pos,
          ...(s.tool === 'centerline' ? { overhangMm: Number.isFinite(s.overhangMm) ? s.overhangMm : 3 } : {}),
        };
        if (selectedCurves.every((c) => c?.sourceReferences)) {
          annotation.curveReferences = selectedCurves.map((c) => ({
            sourceReferences: copy(c.sourceReferences),
          }));
        }
        value.annotations.push(annotation);
        const issues = problems(value).filter((p) => p.annotationId === annotation.id);
        if (issues.length) {
          value.annotations.pop();
          throw Error(issues[0].message);
        }
        edited();
        return;
      }
      const targetAnnotation = value.annotations.find((a) => a.id === annotation?.dataset.drawingAnnotation);
      s.annotationId = targetAnnotation?.id ?? null;
      q('[data-drawing-remove-annotation]').disabled = !targetAnnotation;
      toolHint();
      if (targetAnnotation || item) {
        s.drag = {
          pointerId: event.pointerId,
          start: point,
          position: [...(targetAnnotation ?? item).position],
          annotationId: targetAnnotation?.id,
          viewId: item?.id,
        };
        q('[data-drawing-paper]').setPointerCapture(event.pointerId);
      }
    });
  }
  function pointerMove(event) {
    const s = active,
      drag = s?.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const point = paperPoint(event),
      value = sheet(),
      target = drag.annotationId
        ? value.annotations.find((a) => a.id === drag.annotationId)
        : value.views.find((v) => v.id === drag.viewId);
    if (!target) return;
    target.position = drag.position.map((v, k) => Math.max(-100000, Math.min(100000, v + point[k] - drag.start[k])));
    s.changed = true;
    const attribute = drag.annotationId ? 'data-drawing-annotation' : 'data-drawing-view',
      id = drag.annotationId ?? drag.viewId,
      element = [...q('[data-drawing-paper]').querySelectorAll('[' + attribute + ']')].find(
        (el) => el.getAttribute(attribute) === id,
      );
    if (element) {
      const offset = target.position.map((v, k) => v - drag.position[k]);
      if (drag.annotationId || !target.projection)
        element.setAttribute('transform', 'translate(' + offset.join(' ') + ')');
      else
        element.setAttribute(
          'transform',
          'translate(' +
            target.position.join(' ') +
            ') scale(' +
            cadDrawingViewScale(target, value) +
            ' ' +
            -cadDrawingViewScale(target, value) +
            ')',
        );
    }
  }
  function pointerUp(event) {
    const s = active;
    if (s?.drag?.pointerId !== event.pointerId) return;
    s.drag = null;
    try {
      q('[data-drawing-paper]').releasePointerCapture(event.pointerId);
    } catch {}
    renderSheet();
    status('Position geändert. Mit „Blatt übernehmen“ speichern.');
  }
  function pointerCancel(event) {
    const s = active,
      drag = s?.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const value = sheet(),
      target = drag.annotationId
        ? value.annotations.find((a) => a.id === drag.annotationId)
        : value.views.find((v) => v.id === drag.viewId);
    if (target) target.position = drag.position;
    s.drag = null;
    renderSheet();
  }
  async function update() {
    const s = active;
    if (!s || s.running) return;
    ensureBase(s);
    const value = sheet(),
      ticket = ++s.ticket,
      revision = s.revision;
    let draft = copy(value);
    s.running = true;
    s.abort = new AbortController();
    busyControls();
    status('Native Ansichten werden berechnet …');
    try {
      const project = controller.readSnapshot();
      if (project.contourLinks?.links.length || project.projectParameters) {
        const previous = s.proposal,
          proposal = await controller.previewDrawingUpdate(s.drawings, {
            sheetIds: [s.sheetId],
            revision,
            signal: s.abort.signal,
            ...(s.combined && previous ? { basePreviewId: previous.previewId } : {}),
          });
        if (!current(s) || ticket !== s.ticket) {
          controller.discard(proposal.previewId);
          return;
        }
        const checked = validateCadDrawings(proposal.project.drawings);
        s.drawings = checked;
        s.proposal = proposal;
        s.combined = true;
        if (previous) controller.discard(previous.previewId);
        const records = proposal.preparedView?.meshes ?? [];
        if (records.length)
          view.setPreview(
            records,
            proposal.project,
            proposal.contourReport?.affectedIds ?? proposal.parameterReport?.affectedIds ?? [],
          );
        s.changed = true;
        invalidateSelection();
        render();
        status('Quellen, Konturen und Blatt geprüft. Mit „Blatt übernehmen“ gemeinsam speichern.');
        return proposal;
      }
      for (let i = 0; i < draft.views.length; i++) {
        const item = draft.views[i];
        if (item.kind === 'detail') continue;
        const previous = item.projection;
        status('Native Ansicht ' + (i + 1) + ' / ' + draft.views.length + ' wird berechnet …');
        const projection = await controller.query('drawingProjection', cadDrawingProjectionOptions(item), {
          signal: s.abort.signal,
        });
        if (active !== s || ticket !== s.ticket || controller.revision() !== revision) return;
        const position = cadDrawingUpdatedPosition(
          item.position,
          previous,
          projection,
          cadDrawingViewScale(item, draft),
        );
        draft = updateCadDrawingProjection(draft, item.id, projection);
        draft.views[i].position = position;
      }
      if (draft.views.some((view) => view.kind === 'detail')) draft = updateCadDrawingDetailViews(draft).sheet;
      // Native curve IDs encode their geometry. Preserve measures verbatim: changed
      // or missing curves stay visibly unresolved until explicitly picked/deleted.
      const drawings = copy(s.drawings),
        index = drawings.sheets.findIndex((v) => v.id === draft.id);
      drawings.sheets[index] = draft;
      const checked = validateCadDrawings(drawings);
      if (!current(s) || ticket !== s.ticket) return;
      s.drawings = checked;
      s.changed = true;
      invalidateSelection();
      render();
      status('Blatt aktualisiert. Die Vorschau mit „Blatt übernehmen“ speichern.');
    } finally {
      if (active === s && ticket === s.ticket) {
        s.running = false;
        s.abort = null;
        busyControls();
        renderSheet();
      }
    }
  }
  async function apply() {
    const s = active;
    if (!s || s.running) return;
    ensureBase(s);
    const drawings = validateCadDrawings(s.drawings),
      ticket = ++s.ticket;
    s.running = true;
    s.applying = true;
    busyControls();
    try {
      const previous = s.proposal,
        proposal =
          s.combined && previous
            ? await controller.previewDrawingEdits(drawings, {
                previewId: previous.previewId,
                revision: s.revision,
                label: 'Quellen, Konturen und Zeichnung übernehmen',
              })
            : await controller.previewDrawings(drawings, { revision: s.revision, label: 'Zeichnungsblätter ändern' });
      if (!current(s) || ticket !== s.ticket) {
        controller.discard(proposal.previewId);
        throw Object.assign(Error('Blattübernahme abgebrochen oder Modell geändert.'), {
          name: 'AbortError',
          code: 'ABORTED',
        });
      }
      if (previous) controller.discard(previous.previewId);
      s.proposal = proposal;
      const result = controller.apply({ previewId: proposal.previewId, revision: s.revision });
      s.proposal = null;
      close();
      if (result.changed) await refresh();
      toast('Zeichnungsblätter übernommen.');
      return result;
    } finally {
      if (active === s) {
        s.running = false;
        s.applying = false;
        busyControls();
      }
    }
  }
  async function exportFile(format) {
    const s = active;
    if (!s || s.running) return;
    ensureBase(s);
    const value = sheet(),
      issues = problems(value);
    if (pendingSourceCommit(value)) throw Error('Berechnete Quellen zunächst mit „Blatt übernehmen“ bestätigen.');
    if (issues.length) throw Error(issues[0].message + ' „Blatt aktualisieren“ ausführen.');
    if (typeof exportDrawing !== 'function') throw Error('Die lokale Zeichnungsausgabe ist nicht verfügbar.');
    s.running = true;
    s.exporting = true;
    s.abort = new AbortController();
    busyControls();
    try {
      const result = await exportDrawing({
        format,
        sheet: copy(value),
        project: controller.readSnapshot(),
        signal: s.abort.signal,
      });
      if (active === s)
        status(
          result?.canceled || result?.saved === false ? 'Ausgabe abgebrochen.' : format.toUpperCase() + ' ausgegeben.',
        );
      return result;
    } finally {
      if (active === s) {
        s.running = false;
        s.exporting = false;
        s.abort = null;
        busyControls();
        renderSheet();
      }
    }
  }
  function revisionChanged() {
    const s = active;
    if (!s || s.applying || s.revision === controller.revision()) return;
    if (s.combined) {
      close();
      toast('Das Modell wurde geändert. Berechnetes Zeichnungsblatt erneut öffnen und prüfen.');
      return;
    }
    abort();
    renderSheet();
    status('Das Modell wurde geändert. Quellen prüfen und „Blatt aktualisieren“ ausführen.', true);
  }
  function open({ sheetId } = {}) {
    close();
    prepare();
    const project = controller.readSnapshot(),
      confirmed = project.drawings ?? { version: 1, sheets: [] },
      drawings = copy(confirmed);
    if (sheetId && !drawings.sheets.some((item) => item.id === sheetId))
      throw Error('Das gewählte Zeichnungsblatt fehlt.');
    if (!drawings.sheets.length) {
      const value = createCadDrawingSheet({ sourceIds: selectedIds(), titleBlock: { title: project.name } });
      drawings.sheets.push(value);
      sheetId = value.id;
    } else sheetId ??= drawings.sheets[0].id;
    active = {
      drawings,
      baseDrawings: JSON.stringify(confirmed),
      sheetId,
      viewId: drawings.sheets.find((item) => item.id === sheetId).views[0]?.id,
      revision: controller.revision(),
      ticket: 0,
      running: false,
      applying: false,
      proposal: null,
      tool: 'move',
      picks: [],
      annotationId: null,
      label: '',
      zoom: 1,
      changed: false,
    };
    panel.hidden = false;
    render();
    fit();
    return state();
  }
  function state() {
    if (!active) return null;
    return {
      revision: active.revision,
      sheetId: active.sheetId,
      viewId: active.viewId,
      running: active.running,
      changed: active.changed,
      preview: active.proposal?.previewId,
      combined: !!active.combined,
      report: active.proposal?.contourReport ?? active.proposal?.parameterReport,
      autoReport: active.autoReport ? copy(active.autoReport) : null,
      tool: active.tool,
      picks: copy(active.picks),
      drawings: copy(active.drawings),
      problems: copy(problems()),
    };
  }
  panel.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });
  panel.addEventListener('pointerdown', (event) => event.stopPropagation());
  return {
    open,
    close,
    update,
    apply,
    automatic,
    export: exportFile,
    revisionChanged,
    modelChanged: revisionChanged,
    state,
    dispose() {
      close();
      panel.remove();
    },
  };
}
