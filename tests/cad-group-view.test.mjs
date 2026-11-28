import assert from 'node:assert/strict';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import { createCadController } from '../src/cad-controller.js';
import { createFnpackResolver, encodeFnpackProject } from '../src/cad-fnpack-data.js';
import { CAD_QUALITY_DEFAULTS } from '../src/cad-quality.js';

test('FNPACK group edits and history restore native-equivalent views with scoped reads', async () => {
  const requests = [];
  const hydrationScopes = [];
  const reads = [];
  let resolver;
  let view;
  let phasedView;
  let historyView;
  let loadAll = false;
  const controller = createCadController({
    reuseTranslations: true,
    getDisplayIds: (project) =>
      loadAll ? null : project.nodes.filter((node) => node.name !== 'Unloaded').map((node) => node.id),
    onChange: (_project, _state, hints) => {
      historyView = hints.historyView;
    },
    resolveGeometry: (project, ids, options) => {
      hydrationScopes.push(ids);
      return resolver.hydrate(project, ids, options);
    },
    createWorker: () => {
      const worker = new Worker(new URL('./fixtures/cad-node-worker.mjs', import.meta.url));
      const adapter = {
        onmessage: null,
        onerror: null,
        postMessage: (message) => {
          if (message.type === 'compute') requests.push(message.request);
          worker.postMessage(message);
        },
        terminate: () => worker.terminate(),
      };
      worker.on('message', (data) => adapter.onmessage?.({ data }));
      worker.on('error', (error) => adapter.onerror?.(error));
      return adapter;
    },
    prepareCommit: async (project, { preparedView }) => {
      phasedView = preparedView;
      view = preparedView ?? { ...(await controller.display(project)), scene: await controller.describe(project) };
      return view;
    },
  });

  try {
    await controller.execute({
      kind: 'batch',
      commands: [
        { op: 'create', type: 'box', name: 'Front', size: [4, 5, 6], pos: [-40, 0, 0] },
        { op: 'create', type: 'box', name: 'Body', size: [20, 16, 8], pos: [0, 0, 0] },
        { op: 'create', type: 'box', name: 'Middle', size: [5, 6, 7], pos: [-25, 0, 0] },
        { op: 'create', type: 'box', name: 'Unloaded', size: [7, 8, 9], pos: [25, 0, 0] },
        { op: 'create', type: 'cylinder', name: 'Cutter', size: [6, 6, 12], pos: [0, 0, 0], solid: false },
        { op: 'create', type: 'box', name: 'Tail', size: [6, 7, 8], pos: [40, 0, 0] },
      ],
    });
    const packed = encodeFnpackProject(controller.snapshot());
    const blocks = new Map(packed.blocks.map((block) => [block.sha256, block.bytes]));
    const [front, body, middle, unloaded, cutter, tail] = packed.project.nodes;
    const untouched = [front, middle, unloaded, tail];
    const untouchedIds = untouched.map((node) => node.id);
    const untouchedHashes = untouched.map((node) => node.brep.sha256);
    assert.equal(new Set(packed.project.nodes.map((node) => node.brep.sha256)).size, 6);
    resolver = createFnpackResolver({
      maxBlocks: 1,
      readBlock: async (hash) => {
        reads.push(hash);
        return blocks.get(hash);
      },
    });
    await controller.open(packed.project);
    assert.equal(reads.includes(unloaded.brep.sha256), false);
    assert.equal(view.scene.objects.find((object) => object.id === unloaded.id).geometryLoaded, false);
    assert.equal(view.scene.objects.find((object) => object.id === front.id).geometryLoaded, undefined);

    async function check(operation, changedIds, sceneIds, meshRootIds) {
      const selected = await controller.describe(undefined, [front.id]);
      assert.deepEqual(selected.selection, [front.id]);
      requests.length = 0;
      hydrationScopes.length = 0;
      reads.length = 0;

      const proposal = await controller.preview(operation);
      assert.ok(phasedView, 'prepareCommit must receive the scoped native view');
      assert.deepEqual(
        requests.filter((request) => request.job === 'query').map((request) => request.sceneRootIds),
        [changedIds],
      );
      assert.deepEqual(
        requests.filter((request) => request.job === 'display').map((request) => request.ids),
        [changedIds],
      );
      for (const scope of hydrationScopes)
        assert.ok(scope && scope.every((id) => !untouchedIds.includes(id)), 'untouched roots stay outside hydration');
      for (const hash of reads)
        assert.ok(!untouchedHashes.includes(hash), 'untouched geometry blocks stay outside the FNPACK reads');
      assert.deepEqual(
        proposal.project.nodes.filter((node) => untouchedIds.includes(node.id)),
        untouched,
      );

      assert.deepEqual(phasedView.scene.selection, []);
      assert.deepEqual(
        phasedView.scene.objects.map((object) => object.id),
        sceneIds,
      );
      assert.deepEqual(
        phasedView.meshes.map((mesh) => mesh.rootId ?? mesh.id),
        meshRootIds,
      );
      assert.deepEqual(phasedView.scene, await controller.describe(proposal.project));
      assert.deepEqual(phasedView.meshes, (await controller.display(proposal.project)).meshes);
      assert.equal(controller.apply(proposal).changed, true);
      assert.equal(controller.revision(), phasedView.revision);
    }

    const group = 'group-result';
    await check(
      { kind: 'tool', name: 'previewGroup', options: { ids: [body.id, cutter.id], id: group } },
      [group],
      [front.id, group, body.id, cutter.id, middle.id, unloaded.id, tail.id],
      [front.id, group, middle.id, tail.id],
    );
    await check(
      { kind: 'tool', name: 'previewDissolve', options: { id: group } },
      [body.id, cutter.id],
      [front.id, body.id, cutter.id, middle.id, unloaded.id, tail.id],
      [front.id, body.id, cutter.id, middle.id, tail.id],
    );

    async function checkHistory(action, expectedRootOrder) {
      const workerJobs = requests.length;
      const resolverCalls = hydrationScopes.length;
      assert.equal(controller[action]().changed, true);
      assert.equal(typeof historyView, 'function');
      const restored = historyView();
      assert.ok(restored, action + ' reuses the verified view');
      assert.equal(restored.revision, controller.revision());
      assert.deepEqual(
        restored.meshes.map((mesh) => mesh.rootId ?? mesh.id),
        expectedRootOrder,
      );

      controller.setDisplayQuality({ deflection: 0.25, angleDegrees: 20 });
      assert.equal(historyView(), null, 'a different display quality requires a fresh view');
      controller.setDisplayQuality(CAD_QUALITY_DEFAULTS.display);
      loadAll = true;
      assert.equal(historyView(), null, 'a changed load set requires a fresh view');
      loadAll = false;
      assert.equal(requests.length, workerJobs);
      assert.equal(hydrationScopes.length, resolverCalls);
      assert.deepEqual(historyView(), restored);

      const project = controller.snapshot();
      assert.deepEqual(restored.scene, await controller.describe(project));
      assert.deepEqual(restored.meshes, (await controller.display(project)).meshes);
    }

    await checkHistory('undo', [front.id, group, middle.id, tail.id]);
    await checkHistory('redo', [front.id, body.id, cutter.id, middle.id, tail.id]);
  } finally {
    controller.dispose();
  }
});
