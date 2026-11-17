import * as THREE from 'three';
import { cadPoint, inverseCadMatrix, multiplyCadMatrices } from '../cad-affine.js';
import { modelPlacementDelta } from '../model-placement.js';

export function createAlignment({
  $,
  document,
  state,
  controller,
  view,
  project,
  activeFrame,
  context,
  getSelection,
  selected,
  copy,
  translate,
  getMarkers,
  refreshUi,
  openInspector,
  safe,
  escape,
  gesture,
  mutate,
}) {
  async function mirror(axis) {
    selected({ editable: true });
    const bounds = await controller.query('bounds', { targets: getSelection(), frame: activeFrame() }),
      frame = activeFrame(),
      scale = [1, 1, 1];
    scale[axis] = -1;
    const reflection = new THREE.Matrix4()
        .makeTranslation(...bounds.center)
        .multiply(new THREE.Matrix4().makeScale(...scale))
        .multiply(new THREE.Matrix4().makeTranslation(...bounds.center.map((v) => -v)))
        .toArray(),
      delta = multiplyCadMatrices(multiplyCadMatrices(frame, reflection), inverseCadMatrix(frame));
    await gesture({ targets: getSelection(), delta, revision: controller.revision() });
  }

  function mirrorPanel() {
    $('mirror-panel').hidden = !$('mirror-panel').hidden;
  }

  function alignmentPlan(axis, mode) {
    return state.session?.data?.plans[axis][mode] ?? [];
  }

  async function applyAlignment(axis, mode) {
    await state.task;

    if (!state.session?.data) return;

    const { revision } = state.session.data,
      moves = alignmentPlan(axis, mode);
    view.clearAlignmentPreview();

    if (moves.length)
      await mutate(
        (draft) => {
          for (const { id, delta } of moves) {
            const node = draft.nodes.find((node) => node.id === id);
            node.transform = multiplyCadMatrices(translate(delta), node.transform);
          }
        },
        'CAD ausrichten',
        { revision },
      );
  }

  function refreshAlignment() {
    const current = state.session,
      ticket = ++state.ticket;

    if (!current) {
      getMarkers()?.hide();
      return Promise.resolve();
    }

    current.ids = current.ids.filter((id) => project().nodes.some((node) => node.id === id));
    if (current.ids.length < 2) {
      escape();
      return Promise.resolve();
    }

    if (!current.ids.includes(current.referenceId)) current.referenceId = null;

    getMarkers().hide();
    current.data = null;

    const frame = activeFrame(),
      revision = controller.revision();

    state.task = (async () => {
      const all = await controller.query('bounds', {
        targets: current.ids.map((rootId) => ({ rootId, path: [] })),
        frame,
      });

      if (state.session !== current || ticket !== state.ticket || revision !== controller.revision()) return;

      const bounds = current.referenceId ? all.byId.find((v) => v.id === current.referenceId) : all;

      if (!bounds) return;

      const plans = [0, 1, 2].map((axis) =>
        Object.fromEntries(
          ['min', 'center', 'max'].map((mode) => [
            mode,
            all.byId
              .filter((own) => own.id !== current.referenceId && !context({ rootId: own.id, path: [] }).locked)
              .flatMap((own) => {
                const amount = bounds[mode][axis] - own[mode][axis];
                if (Math.abs(amount) < 1e-7) return [];

                const offset = [0, 0, 0];
                offset[axis] = amount;
                const p = cadPoint(frame, offset);
                return [{ id: own.id, delta: p.map((v, k) => v - frame[12 + k]) }];
              }),
          ]),
        ),
      );

      current.data = { bounds, frame, plans, revision };

      getMarkers().set({ ...current.data, axisNames: project().coordinateMode === 'plane' ? 'UVN' : 'XYZ' });

      for (const button of $('align-grid').querySelectorAll('[data-align-axis]'))
        button.disabled = !plans[Number(button.dataset.alignAxis)][button.dataset.alignMode].length;
    })().catch((error) => {
      if (state.session === current && ticket === state.ticket && error.name !== 'AbortError') throw error;
    });

    return state.task;
  }

  function alignPanel() {
    const list = selected({ roots: true });
    if (list.length < 2) throw Error('Mindestens zwei Teile auswählen.');
    escape();
    state.session = { ids: list.map((value) => value.node.id), referenceId: null, data: null };
    $('align-panel').hidden = false;

    const label = () => {
      $('align-reference').textContent = state.session?.referenceId
        ? 'Feste Referenz: ' + project().nodes.find((node) => node.id === state.session.referenceId)?.name
        : 'Gesamte Auswahl · Objekt als feste Referenz anklicken.';
    };
    label();

    view.setInteraction(async (ray, event, visualHit) => {
      const current = state.session;
      if (!current) return;
      if (!visualHit) {
        escape();
        return;
      }
      const visualId = visualHit.object?.userData.rootId,
        node = project().nodes.find((n) => n.id === visualId),
        nativeIds = current.ids.filter((id) => project().nodes.find((n) => n.id === id)?.kind === 'cad'),
        hit =
          node?.kind !== 'cad' && current.ids.includes(visualId)
            ? { objectId: visualId }
            : nativeIds.length
              ? await controller.query('rayPick', { ray, ids: nativeIds })
              : null;
      if (hit && state.session === current) {
        current.referenceId = hit.objectId;
        view.setAlignmentReference(hit.objectId);
        label();
        await refreshAlignment();
      }
    });

    const grid = $('align-grid');
    grid.replaceChildren();
    for (let axis = 0; axis < 3; axis++)
      for (const [mode, text] of [
        ['min', '−'],
        ['center', 'Mitte'],
        ['max', '+'],
      ]) {
        const button = document.createElement('button');
        button.id = 'align-' + ['x', 'y', 'z'][axis] + '-' + mode;
        button.textContent = ['X', 'Y', 'Z'][axis] + ' ' + text;
        button.dataset.alignAxis = axis;
        button.dataset.alignMode = mode;
        button.onclick = () => safe(() => applyAlignment(axis, mode));
        grid.append(button);
      }

    const reset = document.createElement('button');
    reset.textContent = 'Gesamte Auswahl';
    reset.id = 'align-reset';
    reset.onclick = () => {
      if (state.session) {
        state.session.referenceId = null;
        view.setAlignmentReference(null);
        label();
        void safe(refreshAlignment);
      }
    };
    grid.append(reset);

    const close = document.createElement('button');
    close.textContent = 'Ausrichten beenden';
    close.id = 'align-close';
    close.onclick = escape;
    grid.append(close);
    refreshUi();
    void openInspector();
    $('toggle-right').setAttribute('aria-expanded', 'true');
    $('align-panel').scrollIntoView({ block: 'nearest' });

    void safe(refreshAlignment);
  }

  async function centerSelection() {
    const targets = selected({ editable: true }).map((value) => copy(value.target)),
      revision = controller.revision();
    const bounds = await controller.query('bounds', { targets });
    await gesture({ targets, delta: translate(modelPlacementDelta(bounds)), revision });
    view.fit(targets);
  }

  return { mirror, mirrorPanel, alignmentPlan, applyAlignment, refreshAlignment, alignPanel, centerSelection };
}
