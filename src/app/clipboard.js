import { easyDomainAllows } from '../cad-easy-domain.js';
import { stripGeometryIdentity } from '../cad-fnpack-data.js';
import { captureCadLinkedClipboard, insertCadLinkedClipboard } from '../cad-linked-contours-clipboard.js';
import { cadContourSourceClosure } from '../cad-linked-contours-data.js';

export function createClipboard({
  controller,
  project,
  selected,
  activeEasyKind,
  execute,
  mutate,
  select,
  updateState,
  toast,
}) {
  let clipboardData,
    clipboardTask = Promise.resolve(),
    clipboardGeneration = 0;

  async function duplicate() {
    const list = selected({ editable: true });
    const commands = list.map((value, index) => ({
      op: 'duplicate',
      target: value.target,
      translate: [10, 10, 0],
      space: 'world',
      as: 'copy' + index,
    }));
    const result = await execute({ kind: 'batch', commands }, { label: 'CAD duplizieren' });
    select(
      Object.values(result.aliases).map((value) => (typeof value === 'string' ? { rootId: value, path: [] } : value)),
    );
  }

  function copySelection() {
    const generation = ++clipboardGeneration;
    const list = selected();
    const targets = list.map((value) => value.target);
    const source = project(),
      revision = controller.revision(),
      scope = controller.projectScope();
    const capture = (input) => {
      if (generation !== clipboardGeneration) return;
      if (controller.revision() !== revision || controller.projectScope() !== scope)
        throw Error('Modell während des Kopierens geändert. Auswahl erneut kopieren.');
      clipboardData = captureCadLinkedClipboard(input, targets, { scope: controller.projectScope() });
      if (input.version >= 17) {
        clipboardData.nodes = stripGeometryIdentity(clipboardData.nodes);
        clipboardData.closure.nodes = stripGeometryIdentity(clipboardData.closure.nodes);
      }
      updateState();
      toast('Auswahl kopiert.');
    };
    if (source.version >= 17) {
      const task = controller.materialize(cadContourSourceClosure(source, targets).rootIds).then(capture);
      clipboardTask = task.catch(() => {
        if (generation === clipboardGeneration) {
          clipboardData = null;
          updateState();
        }
      });
      return task;
    }
    capture(source);
    clipboardTask = Promise.resolve();
  }

  async function paste() {
    await clipboardTask;
    if (!clipboardData?.nodes.length) return;
    const sameProject = clipboardData.scope === controller.projectScope();
    const nodes = sameProject ? clipboardData.nodes : clipboardData.closure.nodes;
    if (activeEasyKind() && nodes.some((node) => !easyDomainAllows(node, activeEasyKind())))
      throw Error('Zum Einfügen in den passenden CAD- oder Netz-Bereich wechseln.');
    let result;
    await mutate((draft) => {
      result = insertCadLinkedClipboard(draft, clipboardData, { scope: controller.projectScope() });
    }, 'CAD-Auswahl einfügen');
    select(result.targets);
    if (result.addedSources)
      toast(
        result.addedSources +
          ' benötigte Ausgangsquelle' +
          (result.addedSources === 1 ? '' : 'n') +
          ' zusätzlich eingefügt.',
      );
  }

  function isPasteDisabled(busy) {
    const nodes = clipboardData?.nodes;
    return (
      !nodes?.length || busy || (!!activeEasyKind() && nodes.some((node) => !easyDomainAllows(node, activeEasyKind())))
    );
  }

  return { duplicate, copySelection, paste, isPasteDisabled };
}
