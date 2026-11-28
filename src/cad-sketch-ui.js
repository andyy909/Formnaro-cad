import { installSketchConstraintsUI } from './sketch-constraints-ui.js';
import { SKETCH_TEMPLATES, createSketchTemplate } from './sketch-templates.js';
import { createSketchAttachmentPicker } from './sketch-attachment-picker.js';
import { installSketchProfileUI } from './sketch-profile-ui.js';
import { moveProfilePoints, profileFromLegacy, profileGaps } from './sketch-profile.js';
import { mountSketchPractice } from './cad-sketch-practice-ui.js';
import { createSketchViewCache } from './sketch-view-cache.js';
import { drawingSize, drawnMeasurement, resizeDrawnShape } from './sketch-draw-dimensions.js';
import { createSketchCanvasDimensions } from './sketch-canvas-dimensions.js';
import { createSketchMoveReadout } from './sketch-move-readout.js';
import { sketchMoveDelta } from './sketch-move-delta.js';
import {
  assertSketchScaleMaintained,
  prepareSketchScale,
  resizeSketchScaleTarget,
  sketchScaleDrag,
  sketchScaleHandles,
  sketchScaleMeasurement,
  sketchScaleTarget,
} from './sketch-scale-target.js';
import { parseSketchDirectMeasure } from './sketch-direct-measure.js';
import { alignSketchPoints, sketchContourHandles } from './sketch-align.js';
import { commonFrame } from './common-tool-operations.js';
import { meshSourceAtPath } from './cad-mesh-source-tree.js';
import { resolveSketch, defaultSketch } from './mesh-engine/mesh-sketch.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { defaultCadSketch, resolveCadSketch, cadSketchExpression } from './cad-sketch.js';
import { cadSelectionContext } from './cad-interface-state.js';
import { cadContourLinkProblems } from './cad-linked-contours-data.js';
import {
  createSketchHistory,
  sketchSnap,
  moveSketchPoints,
  createSketchCamera,
  sketchViewport,
  sketchVisibleGridStep,
} from './sketch-interaction.js';
import './cad-sketch.css';

const quickSketchTools = [
  ['select', 'Auswahl', 'V'],
  ['line', 'Linie', 'L'],
  ['rectangle', 'Rechteck', 'R'],
  ['circle', 'Kreis', 'K'],
  ['circle3', 'Kreis durch 3 Punkte', 'J'],
  ['arc', 'Bogen', 'B'],
  ['construction', 'Hilfslinie', 'H'],
  ['move', 'Kontur verschieben', 'M'],
  ['scale', 'Größe ändern', 'S'],
  ['align', 'Ausrichten', 'A'],
];

export function createCadSketchUI({
  controller,
  view,
  getSelection,
  select,
  prepare,
  modal,
  pickFace,
  rebindContour,
  startPractice,
  cancelPractice,
  exportProfile,
  t = (x) => x,
  toast,
}) {
  const $ = (id) => document.getElementById(id),
    ns = 'http://www.w3.org/2000/svg';
  let state = null,
    nextAttachmentSketch = null;
  const picker = createSketchAttachmentPicker({
    controller,
    view,
    getSelection,
    prepare,
    pickFace,
    toast,
    onPicked: (config) => {
      const node = controller.readSnapshot().nodes.find((n) => n.id === config.targetId);
      const sketch = nextAttachmentSketch;
      nextAttachmentSketch = null;
      open(false, node.kind === 'mesh', null, { ...config, ...(sketch ? { sketch } : {}) });
    },
  });
  const selectionKey = () => JSON.stringify(getSelection());
  function close() {
    const picking = picker.close(),
      s = state;
    if (!s) return picking;
    state = null;
    s.ticket++;
    s.abort?.abort();
    if (s.running) controller.cancel();
    if (s.proposal) controller.discard(s.proposal.previewId);
    view.clearPreview();
    s.dispose();
    return true;
  }
  function run(fn) {
    Promise.resolve()
      .then(fn)
      .catch((error) => {
        if (error.name !== 'AbortError' && error.code !== 'ABORTED')
          state ? state.message(error.message, true) : toast(error.message);
      });
  }
  function open(
    edit = false,
    mesh = false,
    meshAddress = null,
    attachment = null,
    template = null,
    imported = null,
    draft = null,
  ) {
    close();
    prepare();
    let original, target;
    if (edit) {
      const selected = getSelection();
      if (selected.length !== 1) throw Error(t('Eine native Skizze oder ihre Gruppenquelle auswählen.'));
      const c = cadSelectionContext(controller.readSnapshot(), selected[0]);
      if (mesh) {
        const entry = meshSourceAtPath(c.node, meshAddress?.path ?? []);
        if (c.locked || entry.locked || entry.node.type !== 'sketch')
          throw Error('Eine entsperrte Netzskizze auswählen.');
        original = { recipe: { sketch: entry.node.sketch } };
        target = { rootId: c.node.id, path: [] };
      } else {
        if (c.locked || c.node.recipe?.type !== 'sketch') throw Error(t('Eine entsperrte native Skizze auswählen.'));
        original = c.node;
        target = c.target;
      }
    }
    const link =
      !mesh && target
        ? controller
            .readSnapshot()
            .contourLinks?.links.find(
              (link) =>
                link.target.rootId === target.rootId &&
                JSON.stringify(link.target.path) === JSON.stringify(target.path),
            )
        : null;
    const s = (state = {
      sketch: structuredClone(
        draft ??
          imported?.sketch ??
          attachment?.sketch ??
          (template ? createSketchTemplate(template.id) : null) ??
          original?.recipe.sketch ??
          (mesh ? defaultSketch() : defaultCadSketch()),
      ),
      target,
      attachment,
      template,
      imported,
      link: link ? structuredClone(link) : null,
      linked: !!link || !!imported?.linkedContour,
      revision: controller.revision(),
      selection: selectionKey(),
      ticket: 0,
      running: false,
      applying: false,
      proposal: null,
      dispose: () => {},
    });
    modal(
      template ? 'Skizzenvorlage: ' + template.name : 'Bearbeitbare Skizze',
      `<div class="sketch-editor"><div><label class="dialog-label">${t('Kontur')}<select id="sketch-kind"><option value="rectangle">${t('Rechteck')}</option><option value="circle">${t('Kreis')}</option><option value="polygon">${t('Geschlossene Kontur')}</option></select></label><p class="small-note">${t('Im Zeichenfeld ziehen: Rechteck / Kreis. Einfache Kontur: Punkte anklicken, automatisch geschlossen. Erweiterte Konturen unten einschalten. Maße in mm; Formeln mit + − * / und Klammern.')}</p><svg id="sketch-board" viewBox="-50 -50 100 100" role="application" aria-label="${t('Skizzenfläche in Millimetern')}" tabindex="0"></svg><div class="ai-controls"><button id="sketch-clear">${t('Kontur leeren')}</button><button id="sketch-last">${t('Letzten Punkt entfernen')}</button></div><div id="sketch-points"></div></div><div><fieldset><legend>${t('Feste Maße / Maßbeziehungen')}</legend><div id="sketch-dimensions"></div></fieldset><fieldset><legend>${t('Benannte Maße')}</legend><p class="small-note">${t('Beispiel: innen = breite − 2 * wand. Namen ohne Leerzeichen, z. B. breite, wand.')}</p><div id="sketch-variables"></div><button id="sketch-variable-add">＋ ${t('Maß')}</button></fieldset><div id="sketch-preview-3d" aria-label="${t('Native 3D-Vorschau der Extrusion')}"></div><p id="sketch-message" role="status"></p><div class="modal-actions"><button id="sketch-preview">${t('Vorschau berechnen')}</button><button id="sketch-apply" class="primary" disabled>${t(edit ? 'Skizze ändern' : 'Extrudieren und hinzufügen')}</button><button id="sketch-cancel">${t('Abbrechen')}</button></div></div></div>`,
    );
    $('modal').classList.add('sketch-modal', 'sketch-workspace');
    $('sketch-kind').value = s.sketch.kind;
    if (s.imported?.notes) {
      const notes = document.createElement('p');
      notes.className = 'small-note';
      notes.textContent = s.imported.notes;
      $('sketch-message').before(notes);
    }
    if (s.linked) {
      const linkPanel = document.createElement('fieldset');
      linkPanel.id = 'sketch-contour-link';
      linkPanel.innerHTML =
        '<legend>Verknüpfte Kontur</legend><p id="sketch-contour-source" data-no-translate></p><p id="sketch-contour-status" role="status"></p><p class="small-note">Die Profilkontur wird von der Ausgangsfläche bestimmt. Extrusionshöhe und freie benannte Zielmaße bleiben bearbeitbar. Quelländerungen werden ausschließlich mit „Aktualisieren“ berechnet.</p>' +
        (s.link
          ? '<div class="ai-controls"><button id="sketch-contour-rebind">Referenz neu wählen …</button><button id="sketch-contour-unlink">Verknüpfung lösen …</button></div>'
          : '');
      $('sketch-dimensions').closest('fieldset').before(linkPanel);
      const source = s.link?.source ?? s.imported.linkedContour.source;
      let sourceName;
      try {
        sourceName = cadSelectionContext(controller.readSnapshot(), source)
          .chain.map((node) => node.name)
          .join(' / ');
      } catch {
        sourceName = 'Ausgangsquelle fehlt';
      }
      $('sketch-contour-source').textContent = sourceName;
      const issues = s.link
        ? cadContourLinkProblems(controller.readSnapshot()).filter((problem) => problem.linkId === s.link.id)
        : [];
      $('sketch-contour-status').textContent = issues.length
        ? issues.map((issue) => issue.message).join(' ')
        : s.link
          ? 'Verknüpfung aktuell.'
          : 'Neue Verknüpfung: Aktualisieren erzeugt die geprüfte Vorschau.';
      $('sketch-contour-status').classList.toggle('ai-error', issues.length > 0);
      $('sketch-preview').textContent = 'Aktualisieren';
      $('sketch-apply').textContent = s.link ? 'Skizze übernehmen' : 'Verknüpft extrudieren und hinzufügen';
    }
    const quick = document.createElement('details');
    quick.className = 'sketch-quick-help';
    quick.innerHTML =
      '<summary>Zeichnen, Maße und Bearbeiten – kurze Anleitung</summary><p>Mausrad: zoomen. Ansicht verschieben: Werkzeug wählen oder mittlere Maustaste. Einpassen zeigt die ganze Kontur. Beim Zeichnen fangen Raster, Endpunkte und Mittelpunkte.</p><p>Punkte wählen / ziehen: anklicken, mit Umschalt mehrere wählen und ziehen. Zurück / Vor und Strg+Z betreffen nur den Entwurf. Formelgesteuerte Punkte bleiben geschützt; die zugehörige Maßformel ändern.</p><p>Erweiterte Konturen enthalten Linien, echte Kreisbögen, Kreise, Langlöcher und Innenöffnungen. Benannte Maße steuern die Zeichnung. Maße und Konturwerkzeuge bieten Trimmen, Verlängern, Spiegelkopie und Versatz. Konstruktionslinien dienen als Hilfen und werden nicht extrudiert.</p><p>Eine geschlossene Außenkontur mit getrennten Innenöffnungen verwenden. Erst Vorschau berechnen prüft die Geometrie; Extrudieren und hinzufügen übernimmt genau einen Modellschritt. Eine fertige Skizze später über ihre Quelle bearbeiten oder in der Vorlagenbibliothek speichern.</p>';
    $('sketch-dimensions').closest('fieldset').after(quick);
    if (template) {
      const tip = document.createElement('p');
      tip.className = 'sketch-template-help';
      tip.id = 'sketch-template-help';
      tip.textContent = template.help;
      quick.before(tip);
    }
    const onPart = document.createElement('button');
    onPart.id = 'sketch-on-part-start';
    onPart.textContent = 'Diese Skizze auf Teilfläche verwenden …';
    $('sketch-kind').parentElement.before(onPart);
    if (!mesh && exportProfile) {
      const actions = document.createElement('div');
      actions.className = 'ai-controls';
      actions.innerHTML = `<label>${t('Schnittkontur 1:1')} <select aria-label="${t('Schnittkonturformat')}"><option>SVG</option><option>DXF</option></select></label><button type="button">${t('Exportieren')}</button>`;
      $('sketch-message').before(actions);
      const button = actions.querySelector('button');
      button.onclick = () =>
        run(async () => {
          button.disabled = true;
          try {
            await exportProfile(
              s.sketch,
              s.imported?.name ?? original?.name ?? 'Skizze',
              actions.querySelector('select').value.toLowerCase(),
            );
          } finally {
            button.disabled = false;
          }
        });
    }
    onPart.hidden = !!attachment || s.linked || !!s.imported?.profileOnly;
    try {
      const selected = getSelection(),
        c =
          selected.length === 1 && !selected[0].path.length
            ? cadSelectionContext(controller.readSnapshot(), selected[0])
            : null;
      onPart.disabled =
        !c ||
        c.locked ||
        c.hidden ||
        !['cad', 'mesh'].includes(c.node.kind) ||
        (c.node.kind === 'cad' ? !c.node.solid : c.node.meshRole === 'hole');
    } catch {
      onPart.disabled = true;
    }
    onPart.onclick = () =>
      run(async () => {
        nextAttachmentSketch = structuredClone(s.sketch);
        close();
        $('modal').close();
        await picker.open();
      });
    if (attachment) {
      const panel = document.createElement('fieldset');
      panel.id = 'sketch-attachment-controls';
      panel.innerHTML =
        '<legend>Skizze am vorhandenen Teil</legend><p id="sketch-attachment-target"></p><label>Bearbeitung<select id="sketch-attachment-mode"><option value="add">Material hinzufügen</option><option value="cut">Material ausschneiden</option></select></label><label>Kontaktüberlappung (mm)<input id="sketch-attachment-overlap" type="number" min="0" max="1" step="0.01" value="0.02"></label><p class="small-note">Die angegebene Tiefe gilt ab der gewählten Fläche. Die gespeicherte Skizzenquelle enthält zusätzlich die Kontaktüberlappung im Teil. Original und Skizze bleiben als Gruppenquellen erhalten.</p>';
      $('sketch-dimensions').closest('fieldset').before(panel);
      $('sketch-attachment-target').textContent =
        controller.readSnapshot().nodes.find((n) => n.id === attachment.targetId).name +
        ' · Bezug ' +
        attachment.reference.point.map((v) => Number(v.toFixed(3))).join(' / ') +
        ' mm';
    }

    const board = $('sketch-board'),
      mount = $('sketch-preview-3d'),
      draftHistory = createSketchHistory(s.sketch),
      camera2d = createSketchCamera(),
      draftView = createSketchViewCache({
        resolve: mesh ? resolveSketch : resolveCadSketch,
        expression: cadSketchExpression,
      });
    let renderer,
      controls,
      scene,
      camera,
      raf = 0,
      start = null,
      draftRecords = [],
      meshes = [],
      selected = new Set(),
      tool = s.linked ? 'pan' : 'draw',
      profileUI,
      constraintsUI;
    let heldDimension, editTarget, alignmentSource, moveTimer;
    const measurements = createSketchCanvasDimensions(board, { edit: openDimension });
    const moveReadout = createSketchMoveReadout(board);
    const dimensionEditor = document.createElement('form');
    dimensionEditor.className = 'sketch-dimension-entry';
    dimensionEditor.setAttribute('popover', 'manual');
    const measureField = document.createElement('input');
    measureField.type = 'text';
    measureField.inputMode = 'decimal';
    measureField.required = true;
    const measureUnit = document.createElement('span');
    measureUnit.textContent = 'mm';
    const acceptMeasure = document.createElement('button');
    acceptMeasure.textContent = t('OK');
    const cancelMeasure = document.createElement('button');
    cancelMeasure.type = 'button';
    cancelMeasure.textContent = t('Abbrechen');
    cancelMeasure.onclick = () => closeDimension(true);
    dimensionEditor.append(measureField, measureUnit, acceptMeasure, cancelMeasure);
    board.after(dimensionEditor);
    const alignment = document.createElement('div');
    alignment.className = 'sketch-align-controls';
    alignment.hidden = true;
    const alignAxes = document.createElement('select');
    alignAxes.setAttribute('aria-label', t('Ausrichtungsachse'));
    for (const [value, label] of [
      ['xy', 'X und Y'],
      ['x', 'Nur X'],
      ['y', 'Nur Y'],
    ])
      alignAxes.add(new Option(t(label), value));
    const alignHint = document.createElement('span');
    alignHint.setAttribute('role', 'status');
    alignment.append(alignAxes, alignHint);
    board.before(alignment);
    const modeSwitch = document.createElement('div');
    modeSwitch.className = 'sketch-workspace-mode';
    modeSwitch.setAttribute('role', 'group');
    modeSwitch.setAttribute('aria-label', t('Skizzenmodus'));
    for (const [value, label] of [
      ['simple', 'Einfach'],
      ['advanced', 'Erweitert'],
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.sketchModeChoice = value;
      button.textContent = t(label);
      button.onclick = () => setWorkspaceMode(value);
      modeSwitch.append(button);
    }
    $('sketch-kind').parentElement.before(modeSwitch);
    function setWorkspaceMode(mode) {
      $('modal').dataset.sketchMode = mode;
      for (const button of modeSwitch.children)
        button.setAttribute('aria-pressed', String(button.dataset.sketchModeChoice === mode));
      syncTransformTools();
    }
    setWorkspaceMode(s.sketch.version >= 2 ? 'advanced' : 'simple');
    const toolbar = document.createElement('div');
    toolbar.className = 'sketch-canvas-toolbar';
    toolbar.innerHTML =
      '<label>Werkzeug<select id="sketch-tool"><option value="draw">Zeichnen</option><option value="select">Punkte wählen / ziehen</option><option value="pan">Ansicht verschieben</option></select></label><label>Rasterweite (mm)<input id="sketch-grid" type="number" min="0" step="any" value="1"></label><label class="sketch-toggle"><input id="sketch-show-grid" type="checkbox" checked> Raster</label><label class="sketch-toggle"><input id="sketch-grid-snap" type="checkbox" checked> Rasterfang</label><label class="sketch-toggle"><input id="sketch-point-snap" type="checkbox" checked> Punktfang</label><button id="sketch-fit">Einpassen</button><button id="sketch-undo" title="Strg+Z">Zurück</button><button id="sketch-redo" title="Strg+Umschalt+Z">Vor</button><button id="sketch-expand" aria-pressed="false">Vergrößern</button>';
    const quickToolbar = document.createElement('div');
    quickToolbar.className = 'sketch-quick-tools';
    quickToolbar.hidden = s.linked;
    quickToolbar.setAttribute('role', 'group');
    quickToolbar.setAttribute('aria-label', t('Skizzenwerkzeuge'));
    for (const [value, label, shortcut] of quickSketchTools) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.sketchQuickTool = value;
      button.textContent = t(label);
      button.title = t(label) + ' (' + shortcut + ')';
      button.setAttribute('aria-keyshortcuts', shortcut);
      button.setAttribute('aria-pressed', 'false');
      button.onclick = () => chooseQuickTool(value);
      quickToolbar.append(button);
    }
    const relations = document.createElement('button');
    relations.id = 'sketch-open-relations';
    relations.type = 'button';
    relations.disabled = s.linked;
    relations.textContent = t('Abhängigkeiten');
    relations.onclick = () => {
      if (s.sketch.version < 2) profileUI.enable();
      if (s.sketch.version < 3) $('sketch-constraints-enable').click();
      setTool('select');
      $('sketch-constraints').scrollIntoView({ block: 'nearest' });
    };
    quickToolbar.append(relations);
    board.before(quickToolbar);
    board.before(toolbar);
    let scaleSelection;
    const toolSelect = $('sketch-tool');
    toolSelect.add(new Option(t('Kontur verschieben'), 'move'), toolSelect.options[2]);
    toolSelect.add(new Option(t('Ausrichten'), 'align'), toolSelect.options[3]);
    toolSelect.add(new Option(t('Größe ändern'), 'scale'), toolSelect.options[4]);
    syncTransformTools();
    const boardResize = new ResizeObserver(() => {
      if (state === s) draw();
    });
    boardResize.observe(board);
    function disposePreview() {
      cancelAnimationFrame(raf);
      controls?.dispose();
      controls = null;
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      meshes = [];
    }
    const closed = () => {
      if (state === s && !$('modal').open) close();
    };
    $('modal').addEventListener('close', closed);
    s.dispose = () => {
      clearMoveReadout();
      moveReadout.dispose();
      closeDimension();
      measurements.clear();
      disposePreview();
      renderer?.dispose();
      renderer?.forceContextLoss();
      boardResize.disconnect();
      $('modal').removeEventListener('close', closed);
      $('modal').classList.remove('sketch-modal', 'sketch-profile-active', 'sketch-workspace', 'sketch-expanded');
      delete $('modal').dataset.sketchMode;
    };
    s.message = (message, error = false) => {
      if (state !== s) return;
      $('sketch-message').textContent = t(message);
      $('sketch-message').classList.toggle('ai-error', error);
    };
    function changed({ record = true, solved = false, historyGroup } = {}) {
      heldDimension = undefined;
      closeDimension();
      alignmentSource = undefined;
      syncAlignHint();
      constraintsUI?.dirty();
      draftView.invalidate();
      if (record && (s.sketch.version < 3 || solved)) draftHistory.record(s.sketch, historyGroup);
      s.ticket++;
      s.abort?.abort();
      if (s.running) {
        controller.cancel();
        s.running = false;
      }
      if (s.proposal) controller.discard(s.proposal.previewId);
      s.proposal = null;
      s.unlink = false;
      view.clearPreview();
      $('sketch-apply').disabled = true;
      $('sketch-preview').disabled = false;
      if (s.linked)
        $('sketch-apply').textContent = s.link ? 'Skizze übernehmen' : 'Verknüpft extrudieren und hinzufügen';
      mount.style.opacity = '.35';
      draw();
      const h = draftHistory.state();
      $('sketch-undo').disabled = !h.undo;
      $('sketch-redo').disabled = !h.redo;
    }
    function input(value, update, label) {
      const e = document.createElement('input');
      e.value = String(value);
      e.maxLength = 200;
      e.setAttribute('aria-label', t(label));
      e.oninput = () => {
        update(e.value);
        changed();
      };
      return e;
    }
    function variables() {
      const root = $('sketch-variables');
      root.replaceChildren();
      s.sketch.variables.forEach((measure, index) => {
        const row = document.createElement('div');
        row.className = 'sketch-variable';
        const value = input(measure.value, (next) => (measure.value = next), 'Wert oder Formel');
        const updateValueLabel = () => value.setAttribute('aria-label', t('Wert oder Formel') + ' · ' + measure.name);
        const name = input(
          measure.name,
          (next) => {
            measure.name = next;
            updateValueLabel();
          },
          'Maßname',
        );
        updateValueLabel();
        value.id = 'sketch-variable-value-' + (index + 1);
        const result = document.createElement('output'),
          remove = document.createElement('button');
        remove.textContent = '×';
        remove.setAttribute('aria-label', t('Maß entfernen'));
        remove.onclick = () => {
          s.sketch.variables.splice(index, 1);
          variables();
          changed();
        };
        row.append(name, value, result, remove);
        root.append(row);
      });
      $('sketch-variable-add').disabled = s.sketch.variables.length >= 40;
    }
    function pointFields() {
      const root = $('sketch-points');
      root.replaceChildren();
      root.hidden = s.sketch.kind !== 'polygon';
      (s.sketch.points ?? []).forEach((p, i) => {
        const row = document.createElement('label');
        row.textContent = 'P' + (i + 1) + ' X / Y';
        row.append(
          input(p[0], (v) => (p[0] = v), 'P' + (i + 1) + ' X'),
          input(p[1], (v) => (p[1] = v), 'P' + (i + 1) + ' Y'),
        );
        root.append(row);
      });
    }
    function fields() {
      const dims = $('sketch-dimensions');
      dims.replaceChildren();
      for (const [key, label] of [
        ['width', 'Breite'],
        ['depth', 'Tiefe'],
        ['diameter', 'Durchmesser'],
        ['height', 'Extrusionshöhe'],
      ]) {
        if (key === 'height' && s.imported?.profileOnly) continue;
        if (
          key !== 'height' &&
          (s.linked ||
            !(
              (s.sketch.kind === 'rectangle' && ['width', 'depth'].includes(key)) ||
              (s.sketch.kind === 'circle' && key === 'diameter')
            ))
        )
          continue;
        const row = document.createElement('label');
        row.textContent = t(label) + ' (mm / ' + t('Formel') + ')';
        const e = input(s.sketch.dimensions[key], (v) => (s.sketch.dimensions[key] = v), label);
        e.dataset.sketchDimension = key;
        row.append(e);
        dims.append(row);
      }
      variables();
      pointFields();
      profileUI?.refresh();
      constraintsUI?.refresh();
      readonlyProfile();
      syncQuickTools();
    }
    function readonlyProfile() {
      if (!s.linked) return;
      $('sketch-kind').disabled = true;
      for (const id of [
        'sketch-clear',
        'sketch-last',
        'sketch-points',
        'sketch-profile-tools',
        'sketch-profile-properties',
        'sketch-edit-tools',
      ])
        if ($(id)) {
          $(id).hidden = true;
          for (const input of $(id).querySelectorAll('input,select,button')) input.disabled = true;
        }
      for (const option of $('sketch-tool').options) option.disabled = option.value !== 'pan';
      setTool('pan');
    }
    function svg(kind, attrs) {
      const el = document.createElementNS(ns, kind);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
      board.append(el);
      return el;
    }
    function draw() {
      board.replaceChildren();
      const data = draftView.read(s.sketch),
        r = data.resolved;
      if (r) {
        s.message(t('Fläche') + ' ' + r.area.toFixed(3) + ' mm² · ' + t('Extrusionshöhe') + ' ' + r.height + ' mm');
        $('sketch-variables')
          .querySelectorAll('output')
          .forEach((o, i) => (o.textContent = Number(r.values[s.sketch.variables[i].name]?.toFixed(3))));
      } else s.message(data.error.message, true);
      const points =
        r?.points ??
        (data.geometry ? data.handles.map((handle) => handle.point) : null) ??
        (s.sketch.points ?? []).map((p) => p.map(Number)).filter((p) => p.every(Number.isFinite));
      s.drawPoints = points;
      const viewport = board.getBoundingClientRect();
      const square = camera2d.view() ?? camera2d.fit(points, r?.diameter ?? 0);
      const box = sketchViewport(square, viewport.width, viewport.height);
      const extent = Math.min(box[2], box[3]) / 2;
      board.setAttribute('viewBox', box.join(' '));
      const step = sketchVisibleGridStep(Math.max(box[2], box[3]), Number($('sketch-grid').value));
      const showGrid = $('sketch-show-grid').checked;
      for (const horizontal of [true, false]) {
        const lo = horizontal ? box[1] : box[0],
          hi = lo + (horizontal ? box[3] : box[2]);
        const drawGridLine = (p, style) =>
          svg('line', {
            x1: horizontal ? box[0] : p,
            y1: horizontal ? p : box[1],
            x2: horizontal ? box[0] + box[2] : p,
            y2: horizontal ? p : box[1] + box[3],
            class: style,
          });
        if (showGrid) {
          const first = Math.ceil(lo / step);
          const count = Math.min(100, Math.max(0, Math.floor(hi / step) - first + 1));
          for (let offset = 0; offset < count; offset++)
            if (first + offset !== 0) drawGridLine((first + offset) * step, 'grid');
        }
        if (lo <= 0 && hi >= 0) drawGridLine(0, 'axis');
      }
      if ([2, 3, 4].includes(s.sketch.version))
        s.drawPoints = profileUI.render(extent, { resolved: data.geometry, handles: data.handles }) ?? [];
      else if (r?.kind === 'circle') svg('circle', { cx: 0, cy: 0, r: r.diameter / 2, class: 'contour' });
      else if (points.length)
        svg('polygon', { points: points.map((p) => p[0] + ',' + -p[1]).join(' '), class: 'contour' });
      if (s.sketch.kind === 'polygon')
        points.forEach((p, i) =>
          svg('circle', {
            cx: p[0],
            cy: -p[1],
            r: extent / 80,
            class: 'vertex' + (selected.has(i) ? ' selected' : ''),
            'data-point-index': i,
          }),
        );
      if ([2, 3, 4].includes(s.sketch.version))
        for (const handle of board.querySelectorAll('[data-point-index]'))
          handle.classList.toggle('selected', selected.has(Number(handle.dataset.pointIndex)));
      constraintsUI?.render(data.geometry, data.handles, [...selected], extent);
      const anchor = s.drawPoints[alignmentSource];
      if (anchor) svg('circle', { cx: anchor[0], cy: -anchor[1], r: 8 / boardScale(), class: 'sketch-align-anchor' });
      measurements.render(heldDimension);
      if (editTarget) positionDimensionEditor();
    }
    function point(e) {
      const p = board.createSVGPoint();
      p.x = e.clientX;
      p.y = e.clientY;
      const q = p.matrixTransform(board.getScreenCTM().inverse());
      return [q.x, -q.y];
    }
    function boardScale() {
      const transform = board.getScreenCTM();
      return Math.hypot(transform?.a ?? 0, transform?.b ?? 0) || 1;
    }
    const tolerance = () => 9 / boardScale();
    function snapResult(p, exclude = []) {
      const pointSnap = $('sketch-point-snap').checked;
      const midpoints =
        pointSnap && [2, 3, 4].includes(s.sketch.version) ? draftView.read(s.sketch).midpoints : undefined;
      return sketchSnap(p, {
        points: pointSnap ? (s.drawPoints ?? []) : [],
        midpoints,
        grid: $('sketch-grid-snap').checked ? Number($('sketch-grid').value) : 0,
        tolerance: tolerance(),
        exclude,
      });
    }
    const snap = (p, exclude) => snapResult(p, exclude).point;
    function closeDimension(restoreFocus = false) {
      if (!editTarget) return;
      const { anchor } = editTarget;
      editTarget = undefined;
      dimensionEditor.hidePopover();
      if (restoreFocus && anchor.isConnected) anchor.focus({ preventScroll: true });
    }
    function positionDimensionEditor() {
      const label = editTarget.anchor.getBoundingClientRect();
      const surface = board.getBoundingClientRect();
      const width = dimensionEditor.offsetWidth,
        height = dimensionEditor.offsetHeight;
      dimensionEditor.style.left = Math.max(surface.left, Math.min(label.left, surface.right - width)) + 'px';
      dimensionEditor.style.top = Math.max(surface.top, Math.min(label.top, surface.bottom - height)) + 'px';
    }
    function openDimension(anchor, key, measurement) {
      editTarget = { anchor, key, measurement };
      measureField.setAttribute('aria-label', anchor.getAttribute('aria-label'));
      measureField.value = String(measurement.values[key]);
      measureField.setCustomValidity('');
      if (!dimensionEditor.matches(':popover-open')) dimensionEditor.showPopover();
      positionDimensionEditor();
      measureField.focus({ preventScroll: true });
      measureField.select();
    }
    measureField.oninput = () => measureField.setCustomValidity('');
    dimensionEditor.onkeydown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closeDimension(true);
    };
    dimensionEditor.onsubmit = (event) => {
      event.preventDefault();
      if (!editTarget) return;
      const { key, measurement } = editTarget;
      let value;
      try {
        value = parseSketchDirectMeasure(measureField.value, measurement.values[key]);
      } catch (error) {
        measureField.setCustomValidity(t(error.message));
        measureField.reportValidity();
        return;
      }
      closeDimension(true);
      run(() => measurement.resize(key, value));
    };
    function showDraggedMeasurements(origin, end) {
      const shape = s.sketch.version >= 2 ? $('sketch-profile-shape').value : s.sketch.kind;
      const from = shape === 'line' ? profileUI.lineStart(origin) : origin;
      const values = drawingSize(shape, from, end);
      board.querySelector('.sketch-drawing-preview')?.remove();
      if (!values) return;
      if (values.radius !== undefined)
        svg('circle', { cx: from[0], cy: -from[1], r: values.radius, class: 'sketch-drawing-preview' });
      else if (values.x !== undefined)
        svg('rect', {
          x: Math.min(from[0], end[0]),
          y: -Math.max(from[1], end[1]),
          width: values.x,
          height: values.y,
          class: 'sketch-drawing-preview',
        });
      measurements.render({ shape, start: from, end, values });
    }
    function showDrawnMeasure(target) {
      const shape = target.ids ? $('sketch-profile-shape').value : s.sketch.kind;
      if (
        state !== s ||
        start ||
        tool !== 'draw' ||
        (shape !== target.shape && !(shape === 'circle3' && target.shape === 'circle'))
      )
        return;
      const data = draftView.read(s.sketch);
      const measured = drawnMeasurement(target, data);
      if (!measured?.values || Object.values(measured.values).some((value) => !Number.isFinite(value) || value <= 0))
        return;
      const ticket = s.ticket;
      heldDimension = {
        ...measured,
        shape,
        async resize(key, value) {
          if (state !== s || ticket !== s.ticket || start || tool !== 'draw')
            throw Error(t('Die Zeichnung wurde inzwischen geändert.'));
          const draft = resizeDrawnShape(s.sketch, target, data, key, value);
          if (draft.version >= 3) {
            const accepted = await constraintsUI.solve({ draft, affected: target.ids });
            if (!accepted) {
              showDrawnMeasure(target);
              return;
            }
          } else {
            s.sketch = draft;
            fields();
            changed();
          }
          if (target.shape === 'line') {
            const line = draftView.read(s.sketch).geometry?.elements.find((element) => element.id === target.ids[0]);
            if (line) profileUI.updateLineEnd(target.ids[0], line.end);
          }
          showDrawnMeasure(target);
        },
      };
      measurements.render(heldDimension);
      drawCirclePlacement();
      drawScaleHandles();
    }
    function drawScaleHandles() {
      board.querySelectorAll('.sketch-scale-handle').forEach((node) => node.remove());
      if (tool !== 'scale' || !scaleSelection) return;
      const radius = 5 * (1 / boardScale());
      for (const [x, y] of sketchScaleHandles(scaleSelection, draftView.read(s.sketch))) {
        svg('rect', {
          x: x - radius,
          y: -y - radius,
          width: 2 * radius,
          height: 2 * radius,
          class: 'sketch-scale-handle',
        });
      }
    }
    function startScaleGesture(gesture) {
      const data = draftView.read(s.sketch);
      const target = sketchScaleTarget(s.sketch, data, gesture.p, tolerance());
      scaleSelection = target;
      if (!target) {
        s.message('Einen Kreis oder ein achsenparalleles Rechteck wählen.');
        draw();
        return;
      }
      const measured = drawnMeasurement(target, data);
      const canDrag =
        target.shape === 'circle'
          ? Math.abs(
              Math.hypot(gesture.p[0] - measured.start[0], gesture.p[1] - measured.start[1]) - measured.values.radius,
            ) <= tolerance()
          : sketchScaleHandles(target, data).some(
              ([x, y]) => Math.hypot(x - gesture.p[0], y - gesture.p[1]) <= tolerance(),
            );
      gesture.scale = { target, data, canDrag, group: Symbol('sketch scale') };
      draw();
    }
    function calculateScale(base, target, values) {
      const prepared = prepareSketchScale(base, target, draftView.read(base));
      let draft = prepared.sketch;
      for (const [key, value] of Object.entries(values)) {
        draft = resizeSketchScaleTarget(draft, prepared.target, draftView.read(draft), key, value);
      }
      return { draft, target: prepared.target };
    }
    async function commitScale(draft, target, group) {
      if (draft.version >= 3) {
        const expected = draftView.read(draft);
        return constraintsUI.solve({
          draft,
          affected: target.ids,
          historyGroup: group,
          validate: (solved) => assertSketchScaleMaintained(expected, draftView.read(solved)),
        });
      }
      s.sketch = draft;
      $('sketch-kind').value = draft.kind;
      fields();
      changed({ historyGroup: group });
      return true;
    }
    function showScaleDimensions(target, group) {
      if (state !== s || start || tool !== 'scale') return;
      const measured = sketchScaleMeasurement(target, draftView.read(s.sketch));
      if (!measured) return;
      const ticket = s.ticket;
      const measurement = {
        ...measured,
        async resize(key, value) {
          if (state !== s || start || tool !== 'scale' || s.ticket !== ticket)
            throw Error('Die Zeichnung wurde inzwischen geändert.');
          if (constraintsUI?.busy()) throw Error('Die Skizzenbedingungen werden noch gelöst.');
          if (value === measured.values[key]) return;
          const { draft, target: next } = calculateScale(s.sketch, target, { [key]: value });
          const accepted = await commitScale(draft, next, group);
          showScaleDimensions(accepted ? next : target, group);
          if (!accepted) throw Error('Die vorhandenen Skizzenbedingungen verhindern dieses Zielmaß.');
        },
      };
      scaleSelection = target;
      heldDimension = measurement;
      measurements.render(measurement);
      drawScaleHandles();
    }
    function drawCirclePlacement(cursor) {
      board.querySelectorAll('.sketch-circle-placement').forEach((node) => node.remove());
      const placement = tool === 'draw' && profileUI?.circlePlacement(cursor);
      if (!placement) return;
      for (const [x, y] of placement.points) {
        svg('circle', { cx: x, cy: -y, r: 4 * (1 / boardScale()), class: 'sketch-circle-placement sketch-snap-guide' });
      }
      if (placement.preview) {
        const { center, radius } = placement.preview;
        svg('circle', {
          cx: center[0],
          cy: -center[1],
          r: radius,
          class: 'sketch-circle-placement sketch-drawing-preview',
        });
      }
    }
    function movedDraft(gesture, delta) {
      if (gesture.dragSource && delta.every((distance) => distance === 0)) return structuredClone(gesture.before);
      const source = gesture.dragSource ?? gesture.before;
      return source.version >= 2
        ? moveProfilePoints(source, gesture.drag, delta, cadSketchExpression)
        : moveSketchPoints(source, gesture.drag, delta);
    }
    function showMoveDimensions(gesture, delta, editable) {
      const origin = gesture.measureOrigin ?? gesture.p;
      const ticket = s.ticket;
      const measurement = {
        start: origin,
        end: origin.map((value, axis) => value + delta[axis]),
        values: { dx: delta[0], dy: delta[1] },
      };
      if (editable) {
        measurement.resize = async (key, value) => {
          if (state !== s || ticket !== s.ticket || start || tool !== gesture.tool)
            throw Error('Die Zeichnung wurde inzwischen geändert.');
          if (constraintsUI?.busy()) throw Error('Die Skizzenbedingungen werden noch gelöst.');
          const next = [...delta];
          next[key === 'dx' ? 0 : 1] = value;
          if (next.every((distance, axis) => distance === delta[axis])) return;
          const draft = movedDraft(gesture, next);
          if (draft.version >= 3) {
            const accepted = await constraintsUI.solve({
              draft,
              historyGroup: gesture,
              validate: (solved) => {
                const actual = movementDelta(gesture.anchor, next, solved);
                if (actual.some((distance, axis) => Math.abs(distance - next[axis]) > 1e-5))
                  throw Error('Die vorhandenen Skizzenbedingungen verhindern diesen Zielversatz.');
              },
            });
            if (state !== s || start || tool !== gesture.tool) return;
            showMoveDimensions(gesture, accepted ? movementDelta(gesture.anchor, next) : delta, true);
            if (!accepted) throw Error('Der Versatz passt nicht zu den vorhandenen Skizzenbedingungen.');
          } else {
            s.sketch = draft;
            if (gesture.dragSource) $('sketch-kind').value = draft.kind;
            fields();
            changed({ historyGroup: gesture });
            showMoveDimensions(gesture, next, true);
          }
        };
      }
      heldDimension = measurement;
      measurements.render(measurement);
    }
    function clearMoveReadout() {
      clearTimeout(moveTimer);
      moveReadout.clear();
    }
    function finishMoveReadout(delta) {
      if (!delta?.some((value) => Math.abs(value) > 1e-8)) return;
      clearTimeout(moveTimer);
      moveReadout.show(delta, { active: false });
      moveTimer = setTimeout(() => moveReadout.clear(), 4200);
    }
    function movementAnchor(index) {
      const ref = draftView.read(s.sketch).handles[index]?.references[0];
      return ref && { ...ref, origin: [...s.drawPoints[index]] };
    }
    function movementDelta(anchor, fallback, sketch = s.sketch) {
      if (!anchor) return fallback;
      const { geometry } = draftView.read(sketch);
      const point = geometry?.elements.find(({ id }) => id === anchor.id)?.[anchor.field];
      return point ? sketchMoveDelta(anchor.origin, point) : fallback;
    }
    function syncTransformTools() {
      const select = $('sketch-tool');
      if (!select) return;
      const advanced = $('modal').dataset.sketchMode === 'advanced';
      if (!advanced && ['move', 'scale', 'align'].includes(tool)) setTool('select');
      for (const option of select.options)
        if (['move', 'scale', 'align'].includes(option.value)) option.hidden = !advanced;
    }
    function nearestPoint(p, radius = tolerance()) {
      let best = radius,
        nearest;
      for (const [index, q] of (s.drawPoints ?? []).entries()) {
        const distance = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (distance <= radius && (nearest === undefined || distance < best)) {
          best = distance;
          nearest = index;
        }
      }
      return nearest;
    }
    function contourIndices(anchor) {
      if (s.sketch.version >= 2) return sketchContourHandles(s.sketch, draftView.read(s.sketch).handles, anchor);
      return s.sketch.kind === 'polygon' ? (s.drawPoints ?? []).map((_, index) => index) : [];
    }
    function outerContourAnchor() {
      if (s.sketch.version < 2) return s.sketch.kind === 'polygon' ? 0 : undefined;
      const outer = s.sketch.loops.find((loop) => loop.role === 'outer');
      if (!outer) return undefined;
      const index = draftView
        .read(s.sketch)
        .handles.findIndex((handle) => handle.references.some(({ id }) => outer.elements.includes(id)));
      return index < 0 ? undefined : index;
    }
    function syncAlignHint() {
      alignment.hidden = tool !== 'align';
      alignHint.textContent = t(
        alignmentSource === undefined
          ? 'Punkt an der zu verschiebenden Kontur wählen.'
          : 'Bezugspunkt oder Ursprung wählen.',
      );
    }
    async function alignAt(p) {
      const hit = nearestPoint(p);
      if (alignmentSource === undefined) {
        if (hit === undefined || !contourIndices(hit).length) {
          alignHint.textContent = t('Punkt einer bearbeitbaren Kontur wählen.');
          return;
        }
        alignmentSource = hit;
        syncAlignHint();
        draw();
        return;
      }
      const source = alignmentSource;
      const target = hit ?? (Math.hypot(...p) <= tolerance() ? [0, 0] : undefined);
      const indices = selected.size > 1 && selected.has(source) ? [...selected] : contourIndices(source);
      try {
        const result = alignSketchPoints(
          s.sketch,
          { points: s.drawPoints, source, target, axes: alignAxes.value, selected: indices },
          cadSketchExpression,
        );
        selected.clear();
        alignmentSource = undefined;
        if (result.sketch.version >= 3) {
          const anchor = movementAnchor(source);
          if (!(await constraintsUI.solve({ draft: result.sketch }))) {
            alignHint.textContent = t('Ausrichtung passt nicht zu den vorhandenen Skizzenbedingungen.');
            return;
          }
          if (state === s && tool === 'align') finishSolvedMovement(anchor);
        } else {
          s.sketch = result.sketch;
          fields();
          changed();
          finishMoveReadout(result.delta);
        }
      } catch (error) {
        alignHint.textContent = t(error.message);
      }
    }
    function clearPointerGuides() {
      board.querySelector('.sketch-snap-guide')?.remove();
      profileUI?.drawPreview?.(null);
    }
    function drawPointerGuides(event) {
      const aim = snapResult(point(event));
      profileUI?.drawPreview?.(aim.point, camera2d.view()[2] / 2, start ? snap(start.p) : undefined);
      let marker = board.querySelector('.sketch-snap-guide');
      if (!aim.kind) {
        marker?.remove();
        return;
      }
      marker ??= svg('circle', { class: 'sketch-snap-guide', 'aria-hidden': 'true' });
      marker.setAttribute('data-kind', aim.kind);
      marker.setAttribute('cx', aim.point[0]);
      marker.setAttribute('cy', -aim.point[1]);
      marker.setAttribute('r', 5 / boardScale());
    }
    function syncQuickTools() {
      const shape = $('sketch-profile-shape')?.value;
      const value = tool !== 'draw' ? tool : s.sketch.version >= 2 ? shape : null;
      quickToolbar.dataset.profile = String(s.sketch.version >= 2);
      for (const button of quickToolbar.querySelectorAll('[data-sketch-quick-tool]'))
        button.setAttribute('aria-pressed', String(button.dataset.sketchQuickTool === value));
    }
    function setTool(value) {
      if (tool !== value) profileUI?.cancelDrawing?.();
      tool = value;
      scaleSelection = undefined;
      $('sketch-tool').value = value;
      board.dataset.tool = value;
      clearPointerGuides();
      heldDimension = undefined;
      closeDimension();
      measurements.clear();
      clearMoveReadout();
      alignmentSource = undefined;
      syncAlignHint();
      syncQuickTools();
      draw();
    }
    function chooseQuickTool(value) {
      if (s.linked) return;
      if (['select', 'move', 'scale', 'align'].includes(value)) {
        if (value !== 'select') setWorkspaceMode('advanced');
        setTool(value);
      } else {
        if (['arc', 'circle3', 'construction'].includes(value) || s.sketch.version < 2) setWorkspaceMode('advanced');
        const initial = s.sketch.version < 2;
        if (initial) {
          profileUI.enable();
          if (!edit && !draft && !imported && !attachment && !template && value !== 'construction')
            $('sketch-profile-role').value = 'outer';
        }
        const shape = $('sketch-profile-shape');
        if (shape.value !== value) {
          shape.value = value;
          shape.dispatchEvent(new Event('change', { bubbles: true }));
        }
        setTool('draw');
      }
      board.focus({ preventScroll: true });
    }
    function restoreDraft(direction) {
      clearMoveReadout();
      s.sketch = draftHistory[direction]();
      constraintsUI?.restore();
      selected.clear();
      profileUI?.reset();
      $('sketch-kind').value = s.sketch.kind;
      fields();
      changed({ record: false });
    }
    $('sketch-undo').onclick = () => restoreDraft('undo');
    $('sketch-redo').onclick = () => restoreDraft('redo');
    $('sketch-tool').onchange = () => setTool($('sketch-tool').value);
    $('sketch-grid').oninput = draw;
    $('sketch-show-grid').onchange = draw;
    for (const id of ['sketch-grid-snap', 'sketch-point-snap']) $(id).onchange = clearPointerGuides;
    $('sketch-fit').onclick = () => {
      const r = draftView.read(s.sketch).resolved;
      camera2d.fit(
        [...(r?.points ?? s.drawPoints ?? []), ...(s.sketch.version === 4 ? (s.drawPoints ?? []) : [])],
        r?.diameter ?? 0,
        { minimum: s.sketch.version === 4 ? 1 : 50 },
      );
      draw();
    };
    $('sketch-expand').onclick = () => {
      $('modal').classList.toggle('sketch-expanded');
      const expanded = $('modal').classList.contains('sketch-expanded');
      $('sketch-expand').textContent = expanded ? 'Verkleinern' : 'Vergrößern';
      $('sketch-expand').setAttribute('aria-pressed', String(expanded));
      draw();
    };
    board.onwheel = (e) => {
      e.preventDefault();
      const p = point(e);
      camera2d.zoom(Math.exp(e.deltaY * 0.001), [p[0], -p[1]]);
      draw();
    };
    board.oncontextmenu = (e) => e.preventDefault();
    board.onkeydown = (e) => {
      const key = e.key.toLowerCase();
      let handled = false;
      if ((e.ctrlKey || e.metaKey) && ['z', 'y'].includes(key)) {
        restoreDraft(key === 'y' || e.shiftKey ? 'redo' : 'undo');
        handled = true;
      } else if (!s.linked && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const shortcut = quickSketchTools.find(([, , letter]) => letter.toLowerCase() === key);
        if (shortcut) {
          chooseQuickTool(shortcut[0]);
          handled = true;
        } else if (key === 'escape' && tool === 'align') {
          alignmentSource = undefined;
          syncAlignHint();
          draw();
          handled = true;
        } else if (key === 'escape') handled = !!profileUI?.cancelDrawing();
        else if (key === 'enter' && tool === 'draw') handled = !!profileUI?.finishOpen();
        if (handled) clearPointerGuides();
      }
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    board.onpointerdown = (e) => {
      if (![0, 1].includes(e.button)) return;
      e.preventDefault();
      board.focus({ preventScroll: true });
      const p = point(e),
        pan = s.linked || e.button === 1 || tool === 'pan';
      if (!pan && constraintsUI?.busy()) return;
      if (!pan) {
        closeDimension();
        heldDimension = undefined;
        measurements.clear();
        clearMoveReadout();
      }
      if (!pan && e.button === 0 && profileUI?.handleLineEdit?.(p, tolerance())) return;
      if (!pan && tool === 'align') {
        void alignAt(p);
        return;
      }
      start = { p, screen: [e.clientX, e.clientY], pan, tool, before: structuredClone(s.sketch), moved: false };
      if (!pan && tool === 'scale') startScaleGesture(start);
      if (!pan && tool === 'move') {
        const hit = nearestPoint(p);
        const onContour = e.target.closest('.contour:not(.contour-open)');
        if (s.sketch.kind === 'circle' && (onContour || Math.hypot(...p) <= tolerance())) {
          start.dragSource = profileFromLegacy(start.before);
          start.drag = [0];
          start.measureOrigin = [0, 0];
        }
        const anchor = hit ?? (onContour ? outerContourAnchor() : undefined);
        if (!start.dragSource && anchor !== undefined) {
          start.drag = contourIndices(anchor);
          if (hit !== undefined) start.p = [...s.drawPoints[hit]];
        }
        if (!start.drag?.length) s.message('Eine bearbeitbare Kontur wählen.', true);
      }
      if (!pan && tool === 'select') {
        const hit = nearestPoint(p);
        if (!e.shiftKey && !e.ctrlKey) constraintsUI?.clearElementSelection();
        if (hit !== undefined && (s.sketch.kind === 'polygon' || [2, 3, 4].includes(s.sketch.version))) {
          if (e.shiftKey || e.ctrlKey) {
            if (selected.has(hit)) selected.delete(hit);
            else selected.add(hit);
          } else if (!selected.has(hit)) selected = new Set([hit]);
          start.p = [...s.drawPoints[hit]];
          start.drag = [...selected];
        } else if (!e.shiftKey && !e.ctrlKey) selected.clear();
        draw();
      }
      if (start.drag?.length) {
        start.measureOrigin ??= s.drawPoints[start.drag[0]];
        if (s.sketch.version >= 3) start.anchor = movementAnchor(start.drag[0]);
      }
      board.setPointerCapture(e.pointerId);
    };
    board.onpointermove = (e) => {
      if (!start) {
        if (tool === 'draw' && !s.linked) {
          drawPointerGuides(e);
          drawCirclePlacement(snap(point(e)));
        }
        return;
      }
      if (start.pan) {
        const scale = 1 / boardScale();
        camera2d.pan((start.screen[0] - e.clientX) * scale, (start.screen[1] - e.clientY) * scale);
        start.screen = [e.clientX, e.clientY];
        draw();
        return;
      }
      if (start.tool === 'scale') {
        if (
          !start.scale?.canDrag ||
          (!start.moved && Math.hypot(e.clientX - start.screen[0], e.clientY - start.screen[1]) < 3)
        )
          return;
        const { target, data } = start.scale;
        try {
          const values = sketchScaleDrag(target, data, point(e), start.p);
          const next = calculateScale(start.before, target, values);
          start.scale.next = next;
          start.moved = true;
          s.sketch = next.draft;
          scaleSelection = next.target;
          changed({ record: false });
          const dimensions = sketchScaleMeasurement(next.target, draftView.read(next.draft));
          heldDimension = dimensions;
          measurements.render(dimensions);
          s.message('');
        } catch (error) {
          s.message(error.message, true);
        }
        return;
      }
      if (start.drag?.length) {
        const p = snap(point(e), start.drag),
          delta = sketchMoveDelta(start.p, p);
        try {
          if (delta.every((value, axis) => value === (start.delta?.[axis] ?? 0))) return;
          s.sketch = movedDraft(start, delta);
          start.moved = true;
          start.delta = delta;
          changed({ record: false });
          showMoveDimensions(start, delta, false);
        } catch (error) {
          s.message(error.message, true);
        }
      } else if (start.tool === 'draw') {
        drawPointerGuides(e);
        showDraggedMeasurements(snap(start.p), snap(point(e)));
      }
    };
    board.onpointerleave = () => {
      if (!start) clearPointerGuides();
    };
    board.onpointerup = (e) => {
      if (!start) return;
      const gesture = start;
      start = null;
      clearPointerGuides();
      if (gesture.pan) return;
      measurements.clear();
      board.querySelector('.sketch-drawing-preview')?.remove();
      if (gesture.tool === 'scale') {
        if (!gesture.scale) return;
        const { target, group, next } = gesture.scale;
        if (!next) {
          showScaleDimensions(target, group);
          return;
        }
        if (next.draft.version >= 3) {
          s.sketch = gesture.before;
          draftView.invalidate();
        }
        void commitScale(next.draft, next.target, group).then((accepted) => {
          showScaleDimensions(accepted ? next.target : target, group);
        });
        return;
      }
      if (gesture.tool === 'select' || gesture.tool === 'move') {
        if (gesture.moved) {
          if (s.sketch.version >= 3) {
            moveReadout.clear();
            void constraintsUI.solve({ historyGroup: gesture }).then((accepted) => {
              if (accepted && state === s && !start && tool === gesture.tool)
                showMoveDimensions(gesture, movementDelta(gesture.anchor, gesture.delta), true);
            });
            return;
          }
          draftHistory.record(s.sketch, gesture);
          if (gesture.dragSource) $('sketch-kind').value = s.sketch.kind;
          fields();
          changed({ record: false });
          showMoveDimensions(gesture, gesture.delta, true);
        }
        return;
      }
      const end = snap(point(e)),
        origin = snap(gesture.p);
      if ([2, 3, 4].includes(s.sketch.version)) {
        const shape = $('sketch-profile-shape').value;
        const added = profileUI.pointerUp(origin, end);
        if (shape === 'circle3') drawCirclePlacement();
        const solved = added && s.sketch.version >= 3 ? constraintsUI.solve() : null;
        if (Array.isArray(added) && ['line', 'construction', 'circle', 'circle3', 'rectangle'].includes(shape)) {
          const direction = end.map((value, axis) => (value < origin[axis] ? -1 : 1));
          const measure = () =>
            showDrawnMeasure({ shape: shape === 'circle3' ? 'circle' : shape, ids: added, direction });
          if (solved)
            void solved.then((accepted) => {
              if (accepted) measure();
            });
          else measure();
        }
        return;
      }
      if (s.sketch.kind === 'polygon') {
        if (s.sketch.points.length >= 128) {
          s.message('Geschlossene Kontur: höchstens 128 Punkte.', true);
          return;
        }
        s.sketch.points.push(end.map((v) => String(Number(v.toFixed(8)))));
      } else if (s.sketch.kind === 'rectangle') {
        s.sketch.dimensions.width = String(Number(Math.max(0.01, Math.abs(end[0] - origin[0])).toFixed(8)));
        s.sketch.dimensions.depth = String(Number(Math.max(0.01, Math.abs(end[1] - origin[1])).toFixed(8)));
      } else
        s.sketch.dimensions.diameter = String(
          Number(Math.max(0.01, 2 * Math.hypot(end[0] - origin[0], end[1] - origin[1])).toFixed(8)),
        );
      fields();
      changed();
      if (s.sketch.kind !== 'polygon') showDrawnMeasure({ shape: s.sketch.kind });
    };
    board.onpointercancel = () => {
      if (start?.moved) {
        s.sketch = start.before;
        fields();
        changed({ record: false });
      }
      start = null;
      clearPointerGuides();
      measurements.clear();
      clearMoveReadout();
      board.querySelector('.sketch-drawing-preview')?.remove();
    };
    $('sketch-kind').onchange = () => {
      const kind = $('sketch-kind').value;
      if (kind === 'profile') {
        setWorkspaceMode('advanced');
        profileUI.enable();
        return;
      }
      if ([2, 3, 4].includes(s.sketch.version))
        s.sketch = structuredClone((mesh ? defaultSketch : defaultCadSketch)(kind));
      else s.sketch.kind = kind;
      profileUI.reset();
      selected.clear();
      fields();
      changed();
    };
    $('sketch-clear').onclick = () => {
      if ([2, 3, 4].includes(s.sketch.version)) {
        s.sketch.elements = [];
        s.sketch.loops = [];
        if (s.sketch.version >= 3) s.sketch.constraints = [];
        profileUI.reset();
        selected.clear();
        fields();
        changed();
        return;
      }
      s.sketch.kind = 'polygon';
      s.sketch.points = [];
      $('sketch-kind').value = 'polygon';
      fields();
      changed();
    };
    $('sketch-last').onclick = () => {
      if ([2, 3, 4].includes(s.sketch.version)) {
        profileUI.removeLast();
        return;
      }
      s.sketch.points.pop();
      pointFields();
      changed();
    };
    $('sketch-variable-add').onclick = () => {
      if (s.sketch.variables.length >= 40) return;
      let i = 1;
      while (s.sketch.variables.some((v) => v.name === 'mass' + i)) i++;
      s.sketch.variables.push({ name: 'mass' + i, value: '10' });
      variables();
      changed();
    };
    function renderPreview(records) {
      disposePreview();
      const width = Math.max(1, mount.clientWidth),
        height = 170;
      if (!renderer) {
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        mount.append(renderer.domElement);
      }
      renderer.setSize(width, height);
      scene = new THREE.Scene();
      scene.background = new THREE.Color('#1c2a36');
      scene.add(new THREE.HemisphereLight(0xffffff, 0x556677, 3));
      for (const record of records) {
        const data = record.mesh,
          g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(data.vertices ?? data.verts, 3));
        if (data.normals) g.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
        g.setIndex(data.triangles);
        if (!data.normals) g.computeVertexNormals();
        const mesh = new THREE.Mesh(
          g,
          new THREE.MeshStandardMaterial({ color: record.color ?? '#ee9b39', roughness: 0.7, side: THREE.DoubleSide }),
        );
        mesh.matrixAutoUpdate = false;
        mesh.matrix.fromArray(record.transform);
        scene.add(mesh);
        meshes.push(mesh);
      }
      scene.updateMatrixWorld(true);
      const box = new THREE.Box3();
      for (const mesh of meshes) box.union(new THREE.Box3().setFromObject(mesh));
      const center = box.getCenter(new THREE.Vector3()),
        radius = Math.max(0.01, box.getSize(new THREE.Vector3()).length() / 2),
        distance = radius * 3.3;
      camera = new THREE.PerspectiveCamera(42, width / height, Math.max(0.0001, radius / 1000), distance * 20);
      camera.up.set(0, 0, 1);
      camera.position.copy(center).add(new THREE.Vector3(1, -1, 1).normalize().multiplyScalar(distance));
      controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(center);
      controls.update();
      const render = () => {
        if (state === s) renderer.render(scene, camera);
      };
      controls.addEventListener('change', render);
      render();
      mount.style.opacity = '1';
    }
    function proposalTarget(proposal) {
      const alias = s.attachment
        ? (proposal.selectedIds?.[0] ?? proposal.aliases?.attachment)
        : mesh
          ? proposal.selectedIds?.[0]
          : (proposal.aliases?.sketch ?? proposal.selectedTargets?.[0] ?? s.target ?? proposal.selectedIds?.[0]);
      if (!alias) throw Error('Ziel der Skizzenvorschau fehlt.');
      return typeof alias === 'string' ? { rootId: alias, path: [] } : alias;
    }
    async function preview({ unlink = false } = {}) {
      if (state !== s || s.running || constraintsUI?.busy()) return;
      if (s.sketch.version >= 3 && !(await constraintsUI.solve())) return;
      if (controller.revision() !== s.revision) throw Error('Modell geändert. Skizze erneut öffnen.');
      const editTarget = s.linked ? s.target : profileUI.asCopy() ? null : s.target,
        resolved = (mesh ? resolveSketch : resolveCadSketch)(s.sketch);
      changed();
      s.unlink = unlink;
      const ticket = ++s.ticket;
      s.running = true;
      s.abort = new AbortController();
      $('sketch-preview').disabled = true;
      s.message(
        unlink
          ? 'Verknüpfung lösen wird vorbereitet …'
          : s.linked
            ? 'Verknüpfte Kontur wird ausdrücklich aktualisiert …'
            : mesh
              ? 'Netzskizze wird berechnet …'
              : 'Native Skizze wird berechnet …',
      );
      try {
        if (s.imported?.profileOnly) {
          const project = controller.snapshot();
          if (!project.attachedSketch) throw Error('Die gebundene Skizze fehlt.');
          project.attachedSketch.sketch = resolved.sketch;
          const proposal = await controller.preview(undefined, {
            project,
            revision: s.revision,
            label: 'Tablet-Skizzenmaße bearbeiten',
            signal: s.abort.signal,
          });
          if (state !== s || ticket !== s.ticket) {
            controller.discard(proposal.previewId);
            return;
          }
          s.proposal = proposal;
          $('sketch-apply').disabled = false;
          $('sketch-apply').textContent = 'Skizzenmaße übernehmen';
          s.message('Geprüfte Kontur · ' + resolved.size.slice(0, 2).join(' × ') + ' mm');
          return proposal;
        }
        const attachmentOperation = s.attachment
          ? {
              ...(mesh ? { type: 'mesh-sketch-attachment' } : { kind: 'sketchAttachment' }),
              ...s.attachment,
              sketch: s.sketch,
              mode: $('sketch-attachment-mode').value,
              overlap: Number($('sketch-attachment-overlap').value),
            }
          : null;
        const request = s.linked
          ? unlink
            ? { action: 'unlink', ids: [s.link.id] }
            : s.link
              ? { action: 'update', ids: [s.link.id], edits: [{ target: s.target, sketch: s.sketch }] }
              : {
                  action: 'create',
                  ...s.imported.linkedContour,
                  name: s.imported.name,
                  height: resolved.height,
                  targetSketch: s.sketch,
                }
          : null;
        const proposal = request
          ? await controller.previewContourLinks(request, {
              revision: s.revision,
              label: unlink
                ? 'Konturverknüpfung lösen'
                : s.link
                  ? 'Verknüpfte Kontur aktualisieren'
                  : 'Verknüpfte Kontur erstellen',
              signal: s.abort.signal,
            })
          : await controller.preview(
              attachmentOperation ??
                (mesh
                  ? editTarget
                    ? {
                        type: 'mesh-source-edit',
                        id: editTarget.rootId,
                        path: meshAddress?.path ?? [],
                        set: { sketch: s.sketch },
                      }
                    : {
                        type: 'mesh-create-source',
                        shape: 'sketch',
                        sketch: s.sketch,
                        ...(s.template ? { name: s.template.name } : {}),
                        frame: commonFrame(controller.readSnapshot()),
                      }
                  : {
                      kind: 'batch',
                      commands: [
                        {
                          op: 'sketch',
                          as: 'sketch',
                          sketch: s.sketch,
                          ...(s.template ? { name: s.template.name } : {}),
                          ...(s.imported
                            ? { name: s.imported.name ?? 'Übernommene CAD-Kontur', frame: s.imported.frame }
                            : {}),
                          ...(editTarget ? { target: editTarget } : {}),
                        },
                      ],
                    }),
              { revision: s.revision, label: 'Native Skizze extrudieren' },
            );
        if (state !== s || ticket !== s.ticket) {
          controller.discard(proposal.previewId);
          return;
        }
        s.proposal = proposal;
        const target = proposalTarget(proposal),
          id = target.rootId;
        s.resultTarget = target;
        if (unlink) {
          $('sketch-apply').disabled = false;
          $('sketch-apply').textContent = 'Verknüpfung lösen';
          s.message(
            'Vorschau bereit: Die fertig berechnete Geometrie bleibt erhalten. Entwurfsmaße werden dabei nicht übernommen.',
          );
          return proposal;
        }
        if (s.linked && proposal.contourReport?.affectedIds?.length === 0) {
          $('sketch-apply').disabled = false;
          s.message('Kontur und freie Zielmaße sind bereits aktuell. Geprüfte Vorschau ohne Geometrieänderung bereit.');
          return proposal;
        }
        const display = proposal.preparedView ?? (await controller.display(proposal.project));
        if (state !== s || ticket !== s.ticket) return;
        const records = display.meshes.filter((m) => (m.rootId ?? m.id) === id);
        if (!records.length) throw Error('Native Skizzenvorschau fehlt.');
        draftRecords = records;
        renderPreview(records);
        const affected = s.linked ? (proposal.contourReport?.affectedIds ?? [id]) : [id],
          previewRecords = s.linked ? display.meshes.filter((m) => affected.includes(m.rootId ?? m.id)) : records;
        view.setPreview(
          previewRecords,
          proposal.project,
          s.attachment ? [s.attachment.targetId] : editTarget ? affected : [],
        );
        let detail = '';
        if (!s.linked) {
          const description = await controller.describe(proposal.project),
            native = description.objects.find(
              (n) => n.target.rootId === target.rootId && JSON.stringify(n.target.path) === JSON.stringify(target.path),
            );
          if (state !== s || ticket !== s.ticket) return;
          if (!native?.worldBounds) throw Error('Native Skizzenmaße fehlen.');
          detail =
            ' · ' +
            t('Weltgrenzen') +
            ': ' +
            native.worldBounds.size.map((v) => Number(v.toFixed(3))).join(' × ') +
            ' mm';
        }
        if (state !== s || ticket !== s.ticket) return;
        $('sketch-apply').disabled = false;
        s.message(
          t(mesh ? 'Netzvorschau bereit' : 'Native Vorschau bereit') +
            ' · ' +
            t('Konturmaße') +
            ': ' +
            resolved.size.map((v) => Number(v.toFixed(3))).join(' × ') +
            ' mm' +
            detail,
        );
        return proposal;
      } catch (error) {
        if (state === s && ticket === s.ticket) {
          if (s.proposal) controller.discard(s.proposal.previewId);
          s.proposal = null;
          view.clearPreview();
          $('sketch-apply').disabled = true;
        }
        throw error;
      } finally {
        if (state === s && ticket === s.ticket) {
          s.running = false;
          $('sketch-preview').disabled = false;
        }
      }
    }
    async function apply() {
      if (state !== s || !s.proposal || s.running) throw Error('Zuerst Vorschau berechnen.');
      if (controller.revision() !== s.revision) throw Error('Modell geändert. Skizze erneut öffnen.');
      s.applying = true;
      try {
        const proposal = s.proposal,
          target = s.imported?.profileOnly ? null : (s.resultTarget ?? proposalTarget(proposal)),
          result = controller.apply({ previewId: proposal.previewId, revision: proposal.revision });
        s.proposal = null;
        close();
        $('modal').close();
        if (result.changed && target) select([target]);
      } finally {
        s.applying = false;
      }
    }
    if (s.link) {
      $('sketch-contour-rebind').onclick = () =>
        run(() => {
          if (!rebindContour) throw Error('Flächenauswahl ist derzeit nicht verfügbar.');
          const link = structuredClone(s.link),
            edits = [{ target: s.target, sketch: structuredClone(s.sketch) }];
          close();
          $('modal').close();
          return rebindContour(link, edits);
        });
      $('sketch-contour-unlink').onclick = () => run(() => preview({ unlink: true }));
    }
    if (s.attachment) {
      $('sketch-attachment-mode').value = s.attachment.mode ?? 'add';
      $('sketch-apply').textContent =
        $('sketch-attachment-mode').value === 'cut' ? 'Ausschneiden und übernehmen' : 'Anbauen und übernehmen';
      const updateAttachment = () => {
        $('sketch-apply').textContent =
          $('sketch-attachment-mode').value === 'cut' ? 'Ausschneiden und übernehmen' : 'Anbauen und übernehmen';
        changed({ record: false });
      };
      $('sketch-attachment-mode').onchange = $('sketch-attachment-overlap').oninput = updateAttachment;
    }
    profileUI = installSketchProfileUI({
      s,
      board,
      svg,
      fields,
      changed,
      message: s.message,
      controller,
      isCurrent: () => state === s,
      desktop: true,
      prepareLineEdit: () => setTool('draw'),
    });
    $('sketch-profile-shape').addEventListener('change', syncQuickTools);
    $('sketch-profile-enable').addEventListener('click', () => setWorkspaceMode('advanced'));
    syncQuickTools();
    constraintsUI = installSketchConstraintsUI({
      s,
      properties: $('sketch-profile-properties'),
      fields,
      changed,
      message: s.message,
      isCurrent: () => state === s,
      revision: () => controller.revision(),
      board,
      svg,
      redraw: draw,
      clearPointSelection: () => selected.clear(),
    });
    s.solveConstraints = () => constraintsUI.solve();
    if (template) {
      $('sketch-dimensions')
        .closest('fieldset')
        .after($('sketch-template-help'), $('sketch-variables').closest('fieldset'), quick);
    }
    s.practiceFeedback = () => {
      const { geometry } = draftView.read(s.sketch);
      const gaps = geometry ? profileGaps(s.sketch.loops, geometry.elements) : [];
      return {
        ...(geometry
          ? {
              gapCount: gaps.length,
              gaps: gaps.slice(0, 8).map(({ role, from, to, distance }) => ({ role, from, to, distance })),
            }
          : {}),
        measures: s.sketch.variables
          .slice(0, 12)
          .map(({ name }, i) => ({ name, target: 'ui:id:sketch-variable-value-' + (i + 1) })),
      };
    };
    if (startPractice && !mesh && !attachment && !imported && !s.linked && (!target || !target.path.length)) {
      const panel = mountSketchPractice({
        anchor: mount,
        startPractice,
        cancelPractice,
        t,
        snapshot: () => {
          if (s.sketch.kind !== 'profile')
            throw Error(t('Für die Skizzenübung zuerst „Konturen mit Öffnungen“ wählen.'));
          if (s.running || constraintsUI.busy()) throw Error(t('Zuerst die laufende Skizzenberechnung abschließen.'));
          const sketch = structuredClone(s.sketch),
            key = JSON.stringify(sketch);
          return {
            data: { sketch, ...(target ? { target: structuredClone(target) } : {}) },
            feedback: s.practiceFeedback(),
            assertCurrent: () => {
              if (state !== s || JSON.stringify(s.sketch) !== key)
                throw Object.assign(
                  Error(t('Die Ausgangsskizze wurde geändert. Übung mit dem aktuellen Entwurf neu starten.')),
                  { code: 'STALE_REVISION' },
                );
              if (s.running || constraintsUI.busy())
                throw Object.assign(Error(t('Zuerst die laufende Skizzenberechnung abschließen.')), { code: 'BUSY' });
            },
          };
        },
        show: async (proposal) => {
          const part = proposal.practiceDelta.parts[0];
          const display = proposal.preparedView ?? (await controller.display(proposal.project));
          if (state !== s) return;
          const records = display.meshes.filter((mesh) => (mesh.rootId ?? mesh.id) === part.id);
          if (!records.length) throw Error(t('Native Skizzenvorschau fehlt.'));
          renderPreview(records);
        },
        restore: () => {
          if (state !== s) return;
          if (s.proposal && draftRecords.length) renderPreview(draftRecords);
          else {
            disposePreview();
            renderer?.clear();
            mount.style.opacity = '.35';
          }
        },
      });
      const dispose = s.dispose;
      s.dispose = () => {
        panel.dispose();
        dispose();
      };
    }
    s.preview = preview;
    s.apply = apply;
    s.interaction = () => ({ selected: [...selected], history: draftHistory.state(), camera: camera2d.view(), tool });
    const priorDispose = s.dispose;
    s.dispose = () => {
      priorDispose();
      $('modal').classList.remove('sketch-expanded');
    };
    $('sketch-preview').onclick = () => run(preview);
    $('sketch-apply').onclick = () => run(apply);
    $('sketch-cancel').onclick = () => {
      close();
      $('modal').close();
    };
    fields();
    draw();
    changed({ record: false });
  }
  function changedExternally() {
    picker.changed();
    const s = state;
    if (s && !s.applying && (controller.revision() !== s.revision || selectionKey() !== s.selection)) {
      close();
      $('modal').close();
    }
  }
  return {
    open,
    openPracticeDraft: ({ target, sketch }) => open(!!target, false, null, null, null, null, sketch),
    openImported: (imported) => open(false, false, null, null, null, imported),
    canRefreshTabletDraft(deliveryId) {
      const s = state;
      return (
        !!deliveryId &&
        s?.imported?.tabletDeliveryId === deliveryId &&
        !s.running &&
        !s.proposal &&
        JSON.stringify(s.sketch) === JSON.stringify(s.imported.sketch)
      );
    },
    openTemplate: (id, mesh = false) => {
      const template = SKETCH_TEMPLATES.find((t) => t.id === id);
      if (!template) throw Error('Unbekannte Skizzenvorlage.');
      return open(false, mesh, null, null, template);
    },
    openOnPart: (mode = 'add') => {
      nextAttachmentSketch = null;
      return picker.open({ mode });
    },
    close,
    pickAttachment: picker.choose,
    revisionChanged: changedExternally,
    selectionChanged: changedExternally,
    solveConstraints: () => state?.solveConstraints(),
    practiceFeedback: () => state?.practiceFeedback(),
    preview: () => state?.preview(),
    apply: () => state?.apply(),
    state: () =>
      state
        ? {
            revision: state.revision,
            preview: state.proposal?.previewId,
            running: state.running,
            sketch: structuredClone(state.sketch),
            attachment: state.attachment ? structuredClone(state.attachment) : null,
            imported: state.imported ? structuredClone(state.imported) : null,
            linked: state.linked,
            link: state.link ? structuredClone(state.link) : null,
            unlink: !!state.unlink,
            target: state.target ? structuredClone(state.target) : null,
            interaction: state.interaction?.(),
          }
        : picker.state(),
  };
}
