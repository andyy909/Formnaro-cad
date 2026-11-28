import { cadSelectionContext } from './cad-interface-state.js';
import { cadExchangeProfile } from './cad-exchange-profile.js';

export function createCadProfileExportUI({ controller, view, visibleCadIds, prepare, toast, safe, download, writers }) {
  let picking;

  function cancel() {
    if (!picking) return;
    picking.abort.abort();
    picking = null;
    view.setInteraction(null);
  }

  function save(sketch, name, format, signal) {
    const { write, mime, extension = format } = writers[format];
    return download(write(cadExchangeProfile(sketch)), name + '.' + extension, mime, { numbered: true, signal });
  }

  function saveSelection(targets, format) {
    if (targets.length !== 1) throw Error('Genau eine native Skizze oder Skizzenquelle auswählen.');
    const { node } = cadSelectionContext(controller.readSnapshot(), targets[0]);
    if (node.recipe?.type !== 'sketch') throw Error('Eine native Skizze oder Skizzenquelle auswählen.');
    return save(node.recipe.sketch, node.name, format);
  }

  function pickFace(format) {
    prepare();
    if (!visibleCadIds().length) throw Error('Für den Export muss ein nativer CAD-Körper sichtbar sein.');
    const revision = controller.revision();
    const scope = controller.projectScope();
    const job = { abort: new AbortController(), busy: false };
    picking = job;
    const { signal } = job.abort;
    const current = () => picking === job && revision === controller.revision() && scope === controller.projectScope();
    toast('Ebene CAD-Fläche für die Schnittkontur anklicken. Esc bricht ab.');
    view.setInteraction((ray, _event, visualHit) =>
      safe(async () => {
        if (!current()) {
          if (picking === job) cancel();
          return;
        }
        const id = visualHit?.object?.userData.rootId;
        if (job.busy || !visibleCadIds().includes(id)) return;
        job.busy = true;
        try {
          const hit = await controller.query('rayPick', { ray, ids: [id] }, { signal });
          if (!current()) return;
          if (!hit) throw Error('Keine CAD-Fläche getroffen.');
          const { sketch } = await controller.query('faceSketch', { nodeId: id, faceIndex: hit.faceIndex }, { signal });
          if (!current()) return;
          const { name } = controller.readSnapshot().nodes.find((node) => node.id === id);
          const result = await save(sketch, name + ' - Fläche ' + hit.faceIndex, format, signal);
          if (current() && !result?.canceled) cancel();
        } catch (error) {
          if (current() && error.name !== 'AbortError') toast(error.message);
        } finally {
          job.busy = false;
        }
      }),
    );
  }

  return { cancel, pickFace, saveSelection, save };
}
