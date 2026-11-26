
import {BufferGeometry, Group, LineBasicMaterial, LineLoop, Quaternion, Vector3} from 'three';
import {resolveCadSketch} from './cad-sketch.js';
import {cadWorkplaneFromHit} from './cad-tools-native.js';
import './cad-tools.css';

export function createCadTabletSketchUI({controller, view, prepare, ready, visible, usable, edit}) {
  const panel = document.createElement('section');
  panel.id = 'tablet-sketch-tool';
  panel.className = 'edge-tool-panel';
  panel.setAttribute('aria-label', 'Tablet-Skizze');
  panel.hidden = true;
  panel.innerHTML = `
    <strong>Tablet-Skizze</strong>
    <p id="tablet-sketch-status" role="status"></p>
    <div class="edge-actions">
      <button id="tablet-sketch-pick">Ebene CAD-Fläche wählen</button>
      <button id="tablet-sketch-workplane">Aktive Arbeitsebene verwenden</button>
    </div>
    <p id="tablet-sketch-existing" hidden><label>
      <input id="tablet-sketch-replace" type="checkbox" style="width:auto"> <span id="tablet-sketch-replace-label"></span>
    </label></p>
    <div class="edge-actions">
      <button id="tablet-sketch-apply" class="primary" hidden>Skizze übernehmen</button>
      <button id="tablet-sketch-discard" hidden>Vorschau verwerfen</button>
      <button id="tablet-sketch-edit" hidden>Skizze bearbeiten</button>
      <button id="tablet-sketch-remove" hidden>Skizze entfernen</button>
      <button id="tablet-sketch-close">Schließen</button>
    </div>`;
  view.canvas.parentElement.append(panel);
  const $ = name => panel.querySelector('#tablet-sketch-' + name);
  const overlay = new Group();
  overlay.name = 'tablet-sketch-profile';
  view.scene.add(overlay);
  const receipts = new Map();
  let target, pending, picker, picking = false, drawn;
  const stamp = () => ({opening: controller.projectScope(), revision: controller.revision()});
  const current = item => item && item.opening === controller.projectScope() && item.revision === controller.revision();
  const message = text => { $('status').textContent = text; };
  const supportVisible = workplane => !workplane.reference || visible(workplane.reference.objectId);

  function draw(attachment, color) {
    if (drawn?.attachment === attachment && drawn?.color === color) {
      const visible = !!attachment && supportVisible(attachment.workplane);
      if (overlay.visible !== visible) {
        overlay.visible = visible;
        view.invalidate('tablet-sketch');
      }
      return;
    }
    for (const child of [...overlay.children]) {
      child.geometry.dispose();
      child.material.dispose();
      child.removeFromParent();
    }
    drawn = {attachment, color};
    overlay.visible = !!attachment && supportVisible(attachment.workplane);
    if (attachment) {
      const profile = resolveCadSketch(attachment.sketch);
      const paths = profile.polygons ?? [profile.points ?? Array.from({length: 96}, (_, index) => {
        const angle = index * Math.PI / 48;
        return [Math.cos(angle) * profile.diameter / 2, Math.sin(angle) * profile.diameter / 2];
      })];
      const {origin, orientation} = attachment.workplane;
      const quaternion = new Quaternion(...orientation), offset = new Vector3(...origin);
      for (const path of paths) {
        const points = path.map(([x, y]) => new Vector3(x, y, 0).applyQuaternion(quaternion).add(offset));
        const line = new LineLoop(new BufferGeometry().setFromPoints(points),
          new LineBasicMaterial({color, depthTest: false, depthWrite: false}));
        line.renderOrder = 32;
        overlay.add(line);
      }
    }
    view.invalidate('tablet-sketch');
  }

  function stopPicking() {
    picker = null;
    if (picking) {
      picking = false;
      view.setInteraction(null);
    }
  }
  function targetUsable() {
    return current(target) && (!target.plane.reference || usable(target.plane.reference.objectId));
  }
  function finish(status) {
    const entry = pending;
    pending = null;
    if (!entry) return;
    if (entry.proposal) controller.discard(entry.proposal.previewId);
    entry.status = status;
    entry.proposal = null;
    $('replace').checked = false;
  }
  function refresh() {
    if (picker && !current(picker)) stopPicking();
    if (target && !targetUsable()) {
      target = null;
      finish('stale');
      message('PC-Zielstand geändert. Wähle am PC ein neues Ziel.');
    }
    const attachment = controller.readSnapshot().attachedSketch;
    const proposal = pending?.proposal;
    $('existing').hidden = !proposal || !attachment;
    if (proposal && attachment) {
      const id = attachment.workplane.reference?.objectId;
      const body = controller.readSnapshot().nodes.find(item => item.id === id);
      const location = body ? ' auf „' + body.name + '“' : ' auf ihrer Arbeitsebene';
      $('replace-label').textContent = '„' + attachment.name + '“' + location + ' ersetzen';
    }
    $('apply').hidden = !proposal;
    $('apply').disabled = !!attachment && !$('replace').checked;
    $('discard').hidden = !pending;
    $('edit').hidden = $('remove').hidden = !attachment || !!pending;
    $('pick').disabled = $('workplane').disabled = !!pending;
    draw(proposal?.project.attachedSketch ?? attachment, proposal ? '#ffbb42' : '#30bad7');
  }
  function guarded(action) {
    return () => Promise.resolve().then(action).catch(error => { message(error.message); });
  }
  function open() {
    ready();
    prepare();
    panel.hidden = false;
    if (!pending) message(target ? 'Ziel für das Tablet: ' + target.name : 'Wähle eine ebene CAD-Fläche oder die aktive Arbeitsebene.');
    refresh();
  }
  function setTarget(plane, name, chosen) {
    if (picker !== chosen || !current(chosen)) throw Error('PC-Zielstand geändert. Wähle die Fläche erneut.');
    const id = plane.reference?.objectId;
    if (id && !usable(id)) throw Error('Der CAD-Bezugskörper ist gerade nicht verfügbar.');
    stopPicking();
    target = {...chosen, id: crypto.randomUUID(), plane, name};
    message('Ziel für das Tablet: ' + name + '. Wähle am Tablet „Skizze für PC“.');
    refresh();
  }
  async function exactFace(chosen, node, point, normal) {
    if (!node || !usable(node.id)) throw Error('Eine sichtbare, entsperrte ebene CAD-Fläche anklicken.');
    const hit = await controller.query('tabletSketchPlane', {id: node.id, point, normal});
    setTarget(cadWorkplaneFromHit({objectId: node.id, ...hit}, {transform: node.transform}), node.name + ' · Fläche', chosen);
  }
  $('pick').onclick = guarded(() => {
    ready();
    stopPicking();
    picker = stamp();
    const chosen = picker;
    picking = true;
    let busy = false;
    message('Klicke in das Innere einer ebenen CAD-Fläche.');
    view.setInteraction(async (ray, _event, hint) => {
      if (busy || picker !== chosen) return;
      busy = true;
      try {
        const id = hint?.object.userData.rootId;
        const node = controller.readSnapshot().nodes.find(item => item.id === id);
        if (!node || !usable(id)) throw Error('Eine sichtbare, entsperrte ebene CAD-Fläche anklicken.');
        const hit = await controller.query('clickSurface', {ray, ids: [id]});
        if (hit?.surface.kind !== 'plane') throw Error('Diese Fläche ist gekrümmt. Wähle eine ebene CAD-Fläche.');
        await exactFace(chosen, node, hit.point, hit.normal);
      } catch (error) {
        if (picker === chosen) message(error.message);
      } finally {
        busy = false;
      }
    });
  });
  $('workplane').onclick = guarded(async () => {
    ready();
    stopPicking();
    picker = stamp();
    const chosen = picker, project = controller.readSnapshot(), plane = project.workplane, reference = plane.reference;
    if (reference && reference.kind !== 'mesh') {
      const node = project.nodes.find(item => item.id === reference.objectId);
      if (!node || !usable(node.id)) throw Error('Der CAD-Bezugskörper ist gerade nicht verfügbar.');
      const normal = new Vector3(0, 0, 1).applyQuaternion(new Quaternion(...plane.orientation)).toArray();
      const hit = await controller.query('tabletSketchPlane', {id: node.id, point: plane.origin, normal});
      // Preserve the active workplane's established X/Y direction.
      const fallback = cadWorkplaneFromHit({objectId: node.id, ...hit}, {transform: node.transform});
      const tangent = reference.topology.anchor.tangent ?? fallback.reference.topology.anchor.tangent;
      const anchored = {...fallback.reference, topology: {...fallback.reference.topology,
        anchor: {...fallback.reference.topology.anchor, tangent}}};
      setTarget({...plane, origin: hit.point, reference: anchored}, node.name + ' · Arbeitsebene', chosen);
    } else {
      setTarget({...plane, reference: null}, 'Aktive Arbeitsebene', chosen);
    }
  });
  function hide() {
    stopPicking();
    panel.hidden = true;
  }
  $('close').onclick = hide;
  $('discard').onclick = () => {
    finish('discarded');
    message('Vorschau verworfen. Das Tablet behält seinen Entwurf.');
    refresh();
  };
  $('replace').onchange = refresh;
  $('apply').onclick = guarded(() => {
    ready();
    const entry = pending;
    if (!entry?.proposal || !targetUsable() || !current(entry)) throw Error('Vorschau ist veraltet.');
    if (controller.readSnapshot().attachedSketch && !$('replace').checked)
      throw Error('Bestätige zuerst das Ersetzen der vorhandenen Skizze.');
    const proposal = entry.proposal;
    // onChange runs synchronously: preserve the receipt before the target becomes stale.
    pending = null;
    let result;
    try {
      result = controller.apply({previewId: proposal.previewId, revision: proposal.revision});
    } catch (error) {
      pending = entry;
      refresh();
      throw error;
    }
    entry.proposal = null;
    entry.status = 'applied';
    $('replace').checked = false;
    refresh();
    message(result.changed
      ? 'Skizze übernommen. Du kannst ihre Maße bearbeiten oder die Übernahme rückgängig machen.'
      : 'Diese Skizze ist bereits im Projekt vorhanden.');
  });
  $('edit').onclick = guarded(() => {
    ready();
    const profile = controller.readSnapshot().attachedSketch;
    if (!profile) throw Error('Keine übernommene Skizze vorhanden.');
    if (profile.workplane.reference && !usable(profile.workplane.reference.objectId))
      throw Error('Zum Bearbeiten den Bezugskörper einblenden und entsperren.');
    panel.hidden = true;
    edit({sketch:profile.sketch, name:profile.name, profileOnly:true});
  });
  $('remove').onclick = guarded(async () => {
    ready();
    if (!window.confirm('Übernommene Skizze aus diesem Projekt entfernen?')) return;
    const project = controller.snapshot();
    delete project.attachedSketch;
    const proposal = await controller.preview(undefined, {project, label: 'Tablet-Skizze entfernen'});
    controller.apply({previewId: proposal.previewId, revision: proposal.revision});
    message('Skizze entfernt.');
  });

  function advertised() {
    refresh();
    if (!targetUsable()) return null;
    const {id, opening, revision, name, plane: {origin, orientation}} = target;
    return {id, opening, revision, name, origin, orientation};
  }
  async function receive(command) {
    const previous = receipts.get(command.deliveryId);
    if (previous) {
      if (previous.owner !== command.owner || previous.digest !== command.digest)
        throw Error('Diese Übergabekennung wurde bereits für andere Skizzendaten vergeben.');
      return {status: previous.status};
    }
    if (!targetUsable() || target.id !== command.targetId ||
        target.opening !== command.opening || target.revision !== command.revision)
      throw Error('PC-Zielstand geändert. Wähle am PC ein neues Ziel. Der Entwurf bleibt am Tablet erhalten.');
    if (pending) throw Error('Am PC zuerst die offene Tablet-Vorschau übernehmen oder verwerfen.');
    ready();
    const profile = resolveCadSketch(command.sketch);
    const project = controller.snapshot();
    project.attachedSketch = {
      name: 'Tablet-Skizze', sketch: profile.sketch, workplane: structuredClone(target.plane),
    };
    const entry = {...stamp(), owner: command.owner, digest: command.digest, status: 'building', proposal: null};
    pending = entry;
    if (receipts.size >= 128) receipts.delete(receipts.keys().next().value);
    receipts.set(command.deliveryId, entry);
    stopPicking();
    panel.hidden = false;
    message('Native Profilvorschau wird geprüft …');
    refresh();
    try {
      const proposal = await controller.preview(undefined, {
        project, revision: entry.revision, label: 'Tablet-Skizze übernehmen',
      });
      if (pending !== entry || !targetUsable() || !current(entry)) {
        controller.discard(proposal.previewId);
        if (pending === entry) finish('stale');
        refresh();
        return {status: entry.status};
      }
      entry.status = 'preview';
      entry.proposal = proposal;
      panel.hidden = false;
      const dimensions = profile.size.slice(0, 2).map(value => Number(value.toFixed(3))).join(' × ');
      message(target.name + ' · ' + dimensions + ' mm · Vorschau. Prüfe die Kontur und bestätige die Übernahme.');
      refresh();
      return {status: entry.status};
    } catch (error) {
      if (pending === entry) {
        finish('failed');
        receipts.delete(command.deliveryId);
        refresh();
        message(error.message);
      }
      throw error;
    }
  }

  return {open, hide, refresh, stopPicking, advertised, receive, hasPending: () => !!pending};
}
