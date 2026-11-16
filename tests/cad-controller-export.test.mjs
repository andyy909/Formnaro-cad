import test from 'node:test';
import assert from 'node:assert/strict';
import { createCadControllerExport } from '../src/cad-controller-export.js';
import { hasCurrentPartSurfaceGroups, partSurfaceDigest } from '../src/cad-part-properties.js';
import { assertCadDrillSourcesReady } from '../src/cad-drill-source-data.js';

const defaultLayer = () => [{ id: 'default', name: 'Standard', hidden: false, locked: false }];

function projectFixture(extra = {}) {
  return {
    version: 30,
    nodes: [],
    layers: defaultLayer(),
    folders: [],
    activeLayerId: 'default',
    activeFolderId: null,
    ...extra,
  };
}

function meshNode(id, { multicolor = true, hidden = false, hole = false } = {}) {
  return {
    id,
    kind: 'mesh',
    layerId: 'default',
    folderId: null,
    hidden,
    meshRole: hole ? 'hole' : 'part',
    mesh: { verts: [], triangles: [] },
    meshSource: { appearance: { multicolor } },
    metadata: {},
  };
}

function groupedMeshNode(id) {
  const node = meshNode(id, { multicolor: false });
  node.metadata.partProperties = {
    surfaces: {
      kind: 'mesh',
      geometryDigest: partSurfaceDigest(node),
      groups: [{ name: 'Fläche', color: '#ff0000', faceIds: [0] }],
    },
  };
  return node;
}

function lostDrillNode(id) {
  return {
    id,
    kind: 'cad',
    layerId: 'default',
    folderId: null,
    hidden: false,
    suppressed: false,
    solid: true,
    children: [],
    drill: { version: 2, sourceId: 'missing-source', boxId: 'missing-box' },
  };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function harness({ project = projectFixture(), revision = 1 } = {}) {
  const state = { project, revision, busy: false, disposed: false };
  const calls = { worker: [], mesh: [], busy: [], progress: [] };
  const impl = {
    mesh: () => Promise.resolve([]),
    worker: () => Promise.resolve({ data: 'exported' }),
  };
  const alive = () => {
    if (state.disposed) throw Error('CAD-Anwendung wurde geschlossen.');
  };
  const store = {
    readSnapshot: () => state.project,
    revision: () => state.revision,
    state: () => ({ busy: state.busy }),
  };
  const meshWorker = {
    run(request, options) {
      calls.mesh.push({ request, options });
      return impl.mesh(request, options);
    },
  };
  const worker = {
    run(request, options) {
      calls.worker.push({ request, options });
      return impl.worker(request, options);
    },
  };
  const progress = (value) => calls.progress.push(value);
  const factory = createCadControllerExport({
    alive,
    store,
    worker,
    meshWorker,
    onBusy: (value) => calls.busy.push(value),
    progress,
  });
  return { state, calls, impl, factory, progress };
}

test('disposed controller export rejects before any worker or busy action', async () => {
  const h = harness();
  h.state.disposed = true;
  assert.throws(() => h.factory.assertExportReady({ format: 'step' }), /CAD-Anwendung wurde geschlossen/);
  await assert.rejects(h.factory.exportModel({ format: 'step' }), /CAD-Anwendung wurde geschlossen/);
  assert.deepEqual(h.calls.busy, []);
  assert.equal(h.calls.worker.length, 0);
  assert.equal(h.calls.mesh.length, 0);
});

test('export forwards the worker result and the unchanged request with current references', async () => {
  const color = meshNode('color');
  const other = meshNode('other');
  const hidden = meshNode('hidden', { hidden: true });
  const hole = meshNode('hole', { hole: true });
  const plain = meshNode('plain', { multicolor: false });
  const grouped = groupedMeshNode('grouped');
  assert.equal(hasCurrentPartSurfaceGroups(grouped), true);
  const project = projectFixture({ nodes: [color, other, hidden, hole, plain, grouped] });
  const h = harness({ project, revision: 4 });
  const exported = { data: new Uint8Array([1, 2, 3]), extension: '3mf' };
  const meshColorParts = [{ rootId: 'color', mesh: { verts: [], triangles: [] } }];
  h.impl.mesh = () => Promise.resolve(meshColorParts);
  h.impl.worker = (request, options) => {
    options.progress(37);
    return Promise.resolve(exported);
  };
  const options = { format: '3mf', ids: ['color'], marker: 'unverändert' };
  const result = await h.factory.exportModel(options);
  assert.equal(result, exported);
  assert.deepEqual(options, { format: '3mf', ids: ['color'], marker: 'unverändert' });
  assert.deepEqual(h.calls.progress, [37]);
  assert.equal(h.calls.mesh.length, 1);
  assert.deepEqual(h.calls.mesh[0].request, { job: 'toolsQuery', kind: 'colors', ids: ['color'], project });
  assert.equal(h.calls.mesh[0].options.revision, 4);
  assert.equal(h.calls.mesh[0].options.progress, h.progress);
  assert.equal(h.calls.worker.length, 1);
  assert.equal(h.calls.worker[0].request.job, 'exportModel');
  assert.equal(h.calls.worker[0].request.project, project);
  assert.notEqual(h.calls.worker[0].request.options, options);
  assert.deepEqual(h.calls.worker[0].request.options, { ...options, meshColorParts });
  assert.equal(h.calls.worker[0].options.revision, 4);
  assert.equal(h.calls.worker[0].options.progress, h.progress);
  assert.deepEqual(h.calls.busy, [true, false]);

  await h.factory.exportModel({ format: '3mf' });
  assert.deepEqual(h.calls.mesh[1].request.ids, ['color', 'other'], 'only visible colored mesh parts are prepared');
  assert.deepEqual(h.calls.busy, [true, false, true, false]);

  const meshCalls = h.calls.mesh.length;
  const step = await h.factory.exportModel({ format: 'step', ids: ['color'] });
  assert.equal(step, exported);
  assert.equal(h.calls.mesh.length, meshCalls, 'only obj/3mf/gltf/glb prepare mesh colors');
  assert.equal(h.calls.worker[2].request.options.meshColorParts, undefined);
});

test('factory reads project and revision only when a method is called', async () => {
  const h = harness({ project: projectFixture({ nodes: [meshNode('old')] }), revision: 2 });
  const next = projectFixture({ nodes: [meshNode('next')] });
  h.state.project = next;
  h.state.revision = 9;
  await h.factory.exportModel({ format: 'step' });
  assert.equal(h.calls.worker[0].request.project, next);
  assert.equal(h.calls.worker[0].options.revision, 9);
});

test('a revision change during the delayed mesh color response rejects before the export worker', async () => {
  const project = projectFixture({ nodes: [meshNode('color')] });
  const h = harness({ project, revision: 3 });
  const colors = deferred();
  h.impl.mesh = () => colors.promise;
  const pending = h.factory.exportModel({ format: 'obj' });
  assert.equal(h.calls.mesh.length, 1);
  assert.equal(h.calls.worker.length, 0);
  h.state.revision = 4;
  colors.resolve([{ rootId: 'color' }]);
  await assert.rejects(pending, {
    code: 'STALE_REVISION',
    message: 'Projekt während des Exports geändert.',
  });
  assert.equal(h.calls.worker.length, 0);
  assert.deepEqual(h.calls.busy, [true, false]);
});

test('a revision change during the delayed export response rejects the output', async () => {
  const h = harness({ revision: 5 });
  const answer = deferred();
  h.impl.worker = () => answer.promise;
  const pending = h.factory.exportModel({ format: 'step' });
  assert.equal(h.calls.worker.length, 1);
  h.state.revision = 6;
  answer.resolve({ data: 'late output' });
  await assert.rejects(pending, {
    code: 'STALE_REVISION',
    message: 'Projekt während des Exports geändert. Erneut exportieren.',
  });
  assert.deepEqual(h.calls.busy, [true, false]);
});

test('mesh and export worker errors propagate unchanged and finally reports the current busy value', async () => {
  const meshError = Error('mesh colors failed');
  const meshFixture = harness({ project: projectFixture({ nodes: [meshNode('color')] }) });
  meshFixture.impl.mesh = () => Promise.reject(meshError);
  await assert.rejects(meshFixture.factory.exportModel({ format: 'obj' }), (error) => error === meshError);
  assert.equal(meshFixture.calls.worker.length, 0);
  assert.deepEqual(meshFixture.calls.busy, [true, false]);

  const exportError = Error('export worker failed');
  const idle = harness();
  idle.impl.worker = () => Promise.reject(exportError);
  await assert.rejects(idle.factory.exportModel({ format: 'step' }), (error) => error === exportError);
  assert.deepEqual(idle.calls.busy, [true, false]);

  const busy = harness();
  busy.impl.worker = () => {
    busy.state.busy = true;
    return Promise.reject(exportError);
  };
  await assert.rejects(busy.factory.exportModel({ format: 'step' }), (error) => error === exportError);
  assert.deepEqual(busy.calls.busy, [true, true]);
});

test('a validation failure before busy keeps the existing guard error, order and problems', async () => {
  const project = projectFixture({
    nodes: [lostDrillNode('bore')],
    contourLinks: { links: [{ invalid: true }] },
  });
  const h = harness({ project });
  const options = { format: 'step' };
  let expected;
  try {
    assertCadDrillSourcesReady(project, options);
  } catch (error) {
    expected = error;
  }
  assert.ok(expected);
  assert.throws(
    () => h.factory.assertExportReady(options),
    (error) =>
      error.code === expected.code &&
      error.message === expected.message &&
      JSON.stringify(error.problems) === JSON.stringify(expected.problems),
  );
  await assert.rejects(h.factory.exportModel(options), (error) => error.code === expected.code);
  assert.deepEqual(h.calls.busy, []);
  assert.equal(h.calls.worker.length, 0);
  assert.equal(h.calls.mesh.length, 0);
  assert.equal(harness().factory.assertExportReady({}), true);
});
