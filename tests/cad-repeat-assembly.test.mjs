import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { Matrix4 } from 'three';
import { createCadCommandRouter } from '../src/cad-command-router.js';
import { createCadController } from '../src/cad-controller.js';
import { loadCadKernel } from '../src/cad-kernel-loader.js';
import { createCadProject, parseCadProject, serializeCadProject } from '../src/cad-project.js';
import { createCadService } from '../src/cad-service.js';

function createWorker() {
  const native = new Worker(new URL('./fixtures/cad-node-worker.mjs', import.meta.url));
  const adapter = {
    postMessage: (message) => native.postMessage(message),
    terminate: () => native.terminate(),
  };
  native.on('message', (data) => adapter.onmessage?.({ data }));
  native.on('error', (error) => adapter.onerror?.(error));
  return adapter;
}

async function confirm(cad, operation) {
  const original = cad.serialize();
  const depth = cad.state().undo;
  const proposal = await cad.preview(operation);
  assert.equal(cad.serialize(), original);
  assert.equal(cad.state().undo, depth);
  assert.equal(cad.apply(proposal).changed, true);
  assert.equal(cad.state().undo, depth + 1);
  return cad.serialize();
}

function translated(transform, delta) {
  const result = [...transform];
  delta.forEach((value, axis) => {
    result[12 + axis] += value;
  });
  return result;
}

function assertVector(actual, expected, label) {
  assert.equal(actual.length, expected.length, label);
  actual.forEach((value, index) => {
    assert.ok(Math.abs(value - expected[index]) < 1e-6, `${label} [${index}]: ${value} != ${expected[index]}`);
  });
}

function assertTranslatedBounds(actual, original, delta, label) {
  for (const limit of ['min', 'max']) {
    assertVector(
      actual[limit],
      original[limit].map((value, axis) => value + delta[axis]),
      `${label} ${limit}`,
    );
  }
}

function assertHistory(cad, undo, redo) {
  for (const expected of undo) {
    cad.undo();
    assert.equal(cad.serialize(), expected);
  }
  for (const expected of redo) {
    cad.redo();
    assert.equal(cad.serialize(), expected);
  }
}

test('36 named native CAD sources retain exact geometry and positions over three group, move and dissolve cycles', async () => {
  const cad = createCadController({ createWorker });
  const count = 36;
  const width = (index) => 4 + 2 * (index % 3);
  const height = 4;
  const thickness = 3;
  const overlap = 1;

  try {
    let left = 0;
    for (let index = 0; index < count; index++) {
      const size = [width(index), height, thickness];
      await cad.execute({
        kind: 'create',
        recipe: { type: 'box', size },
        options: {
          id: `part-${index}`,
          name: `Baugruppenteil ${index + 1} · ${size[0]} mm`,
          transform: new Matrix4().makeTranslation(left + size[0] / 2, -9, 7).toArray(),
        },
      });
      left += size[0] - overlap;
    }
    const ids = cad.snapshot().nodes.map((node) => node.id);
    assert.equal(ids.length, count);
    const unionVolume = (left + overlap) * height * thickness;

    for (const [cycle, delta] of [
      [13, -7, 4],
      [-3, 9, -2],
      [6, 5, 1],
    ].entries()) {
      const disassembledBefore = cad.serialize();
      const sources = cad.snapshot().nodes;
      const { objects: before } = await cad.describe();
      const priorBounds = {
        min: [0, 1, 2].map((axis) => Math.min(...before.map((part) => part.worldBounds.min[axis]))),
        max: [0, 1, 2].map((axis) => Math.max(...before.map((part) => part.worldBounds.max[axis]))),
      };
      const id = `assembly-${cycle}`;
      const name = `Prüfbaugruppe ${cycle + 1}`;
      const frame = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 17 + cycle, -11, 5, 1];
      const group = await confirm(cad, { kind: 'tool', name: 'previewGroup', options: { id, ids, name, frame } });

      const grouped = cad.snapshot().nodes;
      assert.equal(grouped.length, 1);
      assert.equal(grouped[0].id, id);
      assert.equal(grouped[0].name, name);
      assert.equal(grouped[0].source, 'group');
      assert.deepEqual(grouped[0].transform, frame);
      assert.deepEqual(
        grouped[0].children.map((child, index) => ({ ...child, transform: sources[index].transform })),
        sources,
      );
      const { objects: groupedScene } = await cad.describe();
      const measuredGroup = groupedScene.find((part) => part.id === id);
      assert.equal(measuredGroup.solids, 1);
      assert.ok(Math.abs(measuredGroup.volume - unionVolume) < 1e-6);
      assertTranslatedBounds(measuredGroup.worldBounds, priorBounds, [0, 0, 0], name);
      const measuredSources = groupedScene.filter((part) => part.target.path.length > 0);
      assert.deepEqual(
        measuredSources.map((part) => part.id),
        ids,
      );
      for (const [index, part] of measuredSources.entries()) {
        assertTranslatedBounds(part.worldBounds, before[index].worldBounds, [0, 0, 0], part.id);
      }

      const moved = await confirm(cad, {
        kind: 'batch',
        commands: [{ op: 'transform', target: id, translate: delta, space: 'world' }],
      });
      const { objects: movedScene } = await cad.describe();
      assertTranslatedBounds(movedScene.find((part) => part.id === id).worldBounds, priorBounds, delta, name);

      const dissolved = await confirm(cad, { kind: 'tool', name: 'previewDissolve', options: { id } });
      assert.deepEqual(
        cad.snapshot().nodes,
        sources.map((part) => ({ ...part, transform: translated(part.transform, delta) })),
      );
      const { objects: after } = await cad.describe();
      assert.deepEqual(
        after.map((part) => part.id),
        ids,
      );
      for (const [index, part] of after.entries()) {
        assert.equal(part.solids, 1, part.id);
        assert.equal(part.volume, before[index].volume, part.id);
        assertTranslatedBounds(part.worldBounds, before[index].worldBounds, delta, part.id);
      }

      assertHistory(cad, [moved, group, disassembledBefore], [group, moved, dissolved]);
    }
  } finally {
    cad.dispose();
  }
});

test('48 named native CAD parts stay separate over three rigid assembly, move and detach cycles', async () => {
  const cad = createCadController({ createWorker });
  const count = 48;
  const deltas = [
    [3, 7, -5],
    [-5, -2, 9],
    [4, 0, -1],
  ];
  const jointOperation = (request) => ({ kind: 'joints', request });

  try {
    await cad.execute({
      kind: 'batch',
      commands: Array.from({ length: count + 1 }, (_, index) => ({
        op: 'create',
        type: 'box',
        size: [4, 4 + (index % 3), 6],
        pos: [(index % 8) * 12, Math.floor(index / 8) * 12, (index % 5) * 10],
        name: index === count ? 'Unabhängiges Prüfteil' : `Starres Bauteil ${index + 1}`,
      })),
    });
    const ids = cad
      .snapshot()
      .nodes.slice(0, count)
      .map((part) => part.id);

    for (const [cycle, delta] of deltas.entries()) {
      const original = cad.serialize();
      const sources = cad.snapshot().nodes;
      const mainId = ids[cycle];
      const joined = await confirm(cad, jointOperation({ action: 'rigid-assembly', mainId, ids }));
      const attached = cad.snapshot();
      assert.deepEqual(attached.nodes, sources);
      assert.deepEqual(
        attached.joints.joints.map(({ kind, parentId, childId }) => [kind, parentId, childId]),
        ids.filter((id) => id !== mainId).map((id) => ['fixed', mainId, id]),
      );

      const moved = await confirm(cad, jointOperation({ action: 'rigid-move', mainId, translate: delta }));
      const movedParts = cad.snapshot().nodes;
      assert.deepEqual(
        movedParts,
        sources.map((part, index) =>
          index === count ? part : { ...part, transform: translated(part.transform, delta) },
        ),
      );

      const detached = await confirm(cad, jointOperation({ action: 'clear' }));
      assert.equal(cad.snapshot().joints, undefined);
      assert.deepEqual(cad.snapshot().nodes, movedParts);
      await assert.rejects(cad.previewJoints({ action: 'rigid-move', mainId, translate: [1, 0, 0] }), {
        code: 'JOINT_ASSEMBLY_SELECTION',
      });
      assert.equal(cad.serialize(), detached);
      assertHistory(cad, [moved, joined, original], [joined, moved, detached]);
    }
  } finally {
    cad.dispose();
  }
});

test('dissolving a saved group reuses its inspected thread and rebuilds cold or staged thread sources', async () => {
  const oc = await loadCadKernel({ print: () => {}, printErr: () => {} });
  const threadId = 'lead-screw';
  const groupId = 'thread-group';
  const setup = createCadService({ oc });
  let saved;
  try {
    const thread = setup.nativeNode(
      {
        type: 'thread',
        size: [12, 12, 6],
        params: { kind: 'external', profile: 'trapezoid', diameter: 12, length: 6, pitch: 4, leadIn: 0 },
      },
      { id: threadId, name: 'Gewindespindel', transform: new Matrix4().makeTranslation(7, -3, 15).toArray() },
    );
    const block = setup.nativeNode(
      { type: 'box', size: [4, 6, 8] },
      { id: 'support', transform: new Matrix4().makeTranslation(30, 2, 0).toArray() },
    );
    const router = createCadCommandRouter({ oc, service: setup });
    const { project } = await router.run(createCadProject({ nodes: [thread, block] }), {
      kind: 'tool',
      name: 'previewGroup',
      options: {
        id: groupId,
        ids: [threadId, block.id],
        frame: [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, -8, 12, 5, 1],
      },
    });
    saved = serializeCadProject(project);
  } finally {
    setup.dispose();
  }

  const dissolve = { kind: 'tool', name: 'previewDissolve', options: { id: groupId } };
  for (const scenario of ['warm', 'cold', 'staged']) {
    const service = createCadService({ oc });
    try {
      const router = createCadCommandRouter({ oc, service });
      const baseline = parseCadProject(saved);
      const input = parseCadProject(saved);
      const source = input.nodes[0].children.find(({ id }) => id === threadId);
      if (scenario === 'staged') source.recipe.params.pitch = 3;

      const inspected = scenario === 'cold' ? null : router.scene(input).objects.find(({ id }) => id === threadId);
      assert.equal(service.constructionState().total, 0, scenario);
      assert.equal(service.sourceProofState().entries, 0, scenario);
      const inputBefore = serializeCadProject(input);
      const { project } = await router.run(input, dissolve, { baseline });
      assert.equal(serializeCadProject(baseline), saved, scenario);
      assert.equal(serializeCadProject(input), inputBefore, scenario);
      const promoted = project.nodes.find(({ id }) => id === threadId);
      assert.equal(promoted.name, source.name, scenario);
      assert.deepEqual(promoted.recipe, source.recipe, scenario);
      assert.deepEqual(promoted.transform, new Matrix4().makeTranslation(7, -3, 15).toArray(), scenario);
      assert.equal(service.constructionState().counts[threadId] ?? 0, scenario === 'warm' ? 0 : 1, scenario);
      if (scenario === 'warm') {
        assert.deepEqual(promoted.brep, source.brep);
        const measured = router.scene(project).objects.find(({ id }) => id === threadId);
        assert.equal(measured.solids, 1);
        assert.equal(measured.volume, inspected.volume);
        assertTranslatedBounds(measured.worldBounds, inspected.worldBounds, [0, 0, 0], promoted.name);
        await service.rebuild(project);
        assert.equal(service.constructionState().counts[threadId], 1, 'inspection establishes no recipe proof');
      } else if (scenario === 'staged') {
        assert.notEqual(promoted.brep.data, source.brep.data);
      }
    } finally {
      service.dispose();
    }
  }
});
