import {createCadProject, parseCadProject} from './cad-project.js';
import {stripGeometryIdentity} from './cad-fnpack-data.js';
import {hasGeometryRefs} from './cad-geometry-ref.js';
import {cadPermanentlyVisible} from './cad-isolation.js';
import {captureCadLinkedClipboard, insertCadLinkedClipboard} from './cad-linked-contours-clipboard.js';
import {stampCadProjectParameters} from './cad-project-parameters-data.js';
import {flags} from './organization.js';

function readClipboard(partText, sourceId) {
  const source = parseCadProject(partText);
  const node = source.nodes.find(part => part.id === sourceId);
  if (!node || node.kind !== 'cad' ||
      !node.solid || !cadPermanentlyVisible(node, source))
    throw Error('Genau einen sichtbaren, fertigen CAD-Körper vom Tablet senden.');
  if (hasGeometryRefs(source)) throw Error('Die Geometrie des Tablet-Teils ist nicht vollständig geladen.');
  if (source.joints || source.linkedPatterns)
    throw Error('Dieses Teil benötigt weitere Quellen.');
  const parameters = source.projectParameters;
  if (parameters?.freecad?.length || parameters?.variants.some(variant => variant.states.length))
    throw Error('FreeCAD-Parameter und Varianten mit Teilzuständen können hier nicht übertragen werden.');
  const nodes = source.nodes.map(part => {
    const {hidden, locked} = flags(part, source);
    return {
      ...stripGeometryIdentity(part), layerId: 'default', folderId: null,
      ...(hidden ? {hidden: true} : {}), ...(locked ? {locked: true} : {}),
    };
  });
  const project = createCadProject({
    nodes, ...(source.contourLinks ? {contourLinks:source.contourLinks} : {}),
    ...(parameters ? {projectParameters: parameters} : {}),
  });
  const clipboard = captureCadLinkedClipboard(project, [{rootId:sourceId, path:[]}]);
  const closureIds = new Set(clipboard.closure.nodes.map(part => part.id));
  if (closureIds.size !== nodes.length || nodes.some(part => !closureIds.has(part.id)) ||
      clipboard.closure.links.length !== (source.contourLinks?.links.length ?? 0))
    throw Error('Das Angebot darf nur den gewählten Körper und seine benötigten Konturquellen enthalten.');
  if (parameters) {
    const selected = clipboard.closure.parameterData;
    if (selected.parameters.length !== parameters.parameters.length || selected.bindings.length !== parameters.bindings.length)
      throw Error('Das Angebot enthält Projektparameter außerhalb des gewählten CAD-Teils und seiner Quellen.');
    stampCadProjectParameters(project, selected);
  }
  return clipboard;
}

function insertWorkplanePart(draft, partText, sourceId) {
  const source = parseCadProject(partText);
  const [part] = source.nodes;
  if (source.nodes.length !== 1 || part?.id !== sourceId || part.kind !== 'mesh' || part.hidden
      || part.meshRole !== 'solid' || hasGeometryRefs(part)) {
    throw Error('Genau ein sichtbares Teil aus der Tablet-Hauptansicht senden.');
  }
  const {name, transform, mesh, color} = part;
  const id = crypto.randomUUID();
  draft.nodes.push({
    id, kind:'mesh', name, transform, mesh, color, meshRole:'solid',
    layerId:draft.activeLayerId, folderId:draft.activeFolderId,
  });
  return {name, targets:[{rootId:id,path:[]}]};
}

export function createCadTabletPartUI({controller, view, prepare, ready, showPreview, clearPreview, onApplied}) {
  const panel = document.createElement('section');
  panel.id = 'tablet-part-tool';
  panel.className = 'edge-tool-panel';
  panel.setAttribute('aria-label', 'Tablet-Teil empfangen');
  panel.hidden = true;
  panel.innerHTML = `
    <strong>Tablet-Teil empfangen</strong>
    <p id="tablet-part-status" role="status"></p>
    <div class="edge-actions">
      <button type="button" id="tablet-part-apply" class="primary" data-apply hidden>Teil übernehmen</button>
      <button type="button" id="tablet-part-discard" hidden>Vorschau verwerfen</button>
      <button type="button" id="tablet-part-close">Schließen</button>
    </div>`;
  view.canvas.parentElement.append(panel);
  const status = panel.querySelector('#tablet-part-status');
  const apply = panel.querySelector('#tablet-part-apply');
  const discard = panel.querySelector('#tablet-part-discard');
  const receipts = new Map();
  let target, pending, receiptOpening;
  const current = item => item.opening === controller.projectScope() && item.revision === controller.revision();

  function withdraw(outcome = 'discarded') {
    const entry = pending;
    pending = target = null;
    if (entry) {
      if (entry.proposal) {
        controller.discard(entry.proposal.previewId);
        clearPreview(entry.proposal.previewId);
      }
      entry.proposal = null;
      entry.status = outcome;
    }
    apply.hidden = discard.hidden = true;
  }

  function close() {
    withdraw();
    panel.hidden = true;
  }

  function open() {
    ready();
    prepare();
    target = {opening: controller.projectScope(), revision: controller.revision()};
    panel.hidden = false;
    status.textContent = 'Wähle am Tablet das Teil und sende es an den PC.';
  }

  function refresh() {
    const opening = controller.projectScope();
    if (receiptOpening !== opening) {
      receipts.clear();
      receiptOpening = opening;
    }
    if ((!target || current(target)) && (!pending || current(pending))) return;
    withdraw('stale');
    status.textContent = 'Das PC-Projekt wurde geändert. Öffne „Tablet-Teil empfangen“ erneut.';
  }

  function advertised() {
    refresh();
    if (!target || pending) return null;
    try { ready(); }
    catch { return null; }
    return {revision: target.revision};
  }

  function advertisedDirect() {
    refresh();
    if (pending) return null;
    try { ready(); }
    catch { return null; }
    return {revision:controller.revision()};
  }

  discard.onclick = () => {
    withdraw();
    status.textContent = 'Vorschau verworfen. Beide Projekte bleiben unverändert.';
  };
  panel.querySelector('#tablet-part-close').onclick = close;
  apply.onclick = () => {
    const entry = pending;
    const proposal = entry?.proposal;
    if (!proposal || apply.hidden) return;
    if (!current(entry)) {
      refresh();
      return;
    }
    const invitation = target;
    // Apply synchronously publishes a new revision, which refreshes this panel.
    pending = target = null;
    try {
      controller.apply({previewId: proposal.previewId, revision: entry.revision});
    } catch (error) {
      pending = entry;
      target = invitation;
      refresh();
      status.textContent = error.message;
      return;
    }
    entry.proposal = null;
    entry.status = 'applied';
    close();
    onApplied(entry.targetId);
  };

  async function receive(command) {
    refresh();
    const stale = command.direct
      ? 'PC-Zielstand geändert. Sende das Teil erneut.'
      : 'PC-Zielstand geändert. Öffne am PC „Tablet-Teil empfangen“ erneut.';
    if (command.opening !== receiptOpening) throw Error(stale);
    const previous = receipts.get(command.deliveryId);
    if (previous) {
      if (previous.owner !== command.owner || previous.digest !== command.digest)
        throw Error('Diese Übergabekennung wurde bereits für ein anderes Angebot verwendet.');
      if (previous.status === 'stale') throw Error(stale);
      return {status: previous.status};
    }
    const destination = command.direct
      ? {opening:controller.projectScope(), revision:controller.revision()}
      : target;
    if (!destination || destination.revision !== command.revision) throw Error(stale);
    if (pending) throw Error('Am PC zuerst die laufende Teilevorschau übernehmen oder verwerfen.');
    ready();
    const draft = controller.snapshot();
    const firstInserted = draft.nodes.length;
    let name, insertion;
    try {
      if (command.direct) {
        insertion = insertWorkplanePart(draft, command.partText, command.sourceId);
        name = insertion.name;
      } else {
        const clipboard = readClipboard(command.partText, command.sourceId);
        insertion = insertCadLinkedClipboard(draft, clipboard, {
          scope: controller.projectScope(), offset: [0, 0, 0],
        });
        name = clipboard.nodes[0].name;
      }
    } catch (error) {
      panel.hidden = false;
      status.textContent = error.message;
      throw error;
    }
    const {targets, addedSources, parameterNames} = insertion;
    const previewIds = draft.nodes.slice(firstInserted)
      .filter(node => cadPermanentlyVisible(node, draft)).map(node => node.id);
    const entry = {...destination, targetId: targets[0].rootId, status: 'building', owner: command.owner, digest: command.digest};
    pending = entry;
    if (receipts.size >= 128) receipts.delete(receipts.keys().next().value);
    receipts.set(command.deliveryId, entry);
    panel.hidden = false;
    status.textContent = 'Das Tablet-Teil wird für die Vorschau geprüft …';
    try {
      const proposal = await controller.preview(undefined, {project: draft, revision: entry.revision, label: 'Tablet-Teil einfügen'});
      if (pending !== entry || !current(entry)) {
        controller.discard(proposal.previewId);
        throw Error('Das PC-Ziel für die Teilevorschau ist nicht mehr verfügbar.');
      }
      entry.proposal = proposal;
      await showPreview(proposal, previewIds);
      if (pending !== entry || !current(entry)) throw Error('Das PC-Ziel für die Teilevorschau ist nicht mehr verfügbar.');
      const sourceLabel = addedSources === 1 ? '1 Konturquelle' : addedSources + ' Konturquellen';
      const renamed = [...(parameterNames ?? [])].filter(([original, name]) => original !== name);
      const parts = ['Vorschau: ' + name];
      if (addedSources) parts.push(sourceLabel);
      if (renamed.length) parts.push('Projektparameter umbenannt: ' + renamed.map(([original, name]) => original + ' → ' + name).join(', '));
      status.textContent = parts.join(' · ');
      apply.hidden = discard.hidden = false;
      entry.status = 'preview';
      return {status: entry.status};
    } catch (error) {
      if (pending === entry) {
        withdraw('failed');
        receipts.delete(command.deliveryId);
        status.textContent = error.message;
      }
      throw error;
    }
  }

  return {
    open, close, refresh, advertised, advertisedDirect, receive,
    isOpen: () => !panel.hidden,
    hasPending: () => !!pending,
    hasTarget: () => !!target && current(target),
    previewId: () => pending?.proposal?.previewId,
  };
}
