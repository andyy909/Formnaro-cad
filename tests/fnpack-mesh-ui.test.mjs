import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import pack from '../backend/fnpack.cjs';
import { createCadController } from '../src/cad-controller.js';
import { createCadProject } from '../src/cad-project.js';
import { createFnpackResolver, encodeFnpackProject } from '../src/cad-fnpack-data.js';
import { isGeometryRef } from '../src/cad-geometry-ref.js';
import { Vector3 } from 'three';
import { createMeshSelectionOverlay, meshSelectionSurfaceHit } from '../src/cad-mesh-selection-rendering.js';
import { meshSelectionGeometryDigest } from '../src/mesh-selection-data.js';
import { denseBoxMesh, meshNode } from './fixtures/mesh-reduce-fixtures.mjs';

const css = registerHooks({ load: (url, context, next) => url.endsWith('.css')
  ? { format: 'module', source: '', shortCircuit: true }
  : next(url, context) });
const { createCadMeshReduceUI } = await import('../src/cad-mesh-reduce-ui.js');
const { createCadMeshSelectionUI } = await import('../src/cad-mesh-selection-ui.js');
css.deregister();

function element() {
  const descendants = new Map();
  return {
    value: '', parentElement: { firstChild: {}, append() {} },
    classList: { toggle() {} },
    addEventListener() {}, remove() {}, setAttribute() {}, after() {},
    querySelectorAll: () => [],
    closest: () => ({}),
    querySelector(key) {
      if (!descendants.has(key)) descendants.set(key, element());
      return descendants.get(key);
    },
  };
}
const adapter = file => () => {
  const worker = new Worker(new URL(file, import.meta.url));
  const client = { postMessage: message => worker.postMessage(message), terminate: () => worker.terminate() };
  worker.on('message', data => client.onmessage?.({ data }));
  worker.on('error', error => client.onerror?.(error));
  return client;
};
async function fixture(t) {
  const path = await mkdtemp(join(tmpdir(), 'fnpack-mesh-ui-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  const mesh = meshNode(await denseBoxMesh(), 'chosen');
  const other = meshNode({ verts: [0,0,0,1,0,0,0,1,0], triangles: [0,1,2] }, 'unselected');
  const unprotected = meshNode({ verts: [1,0,0,2,0,0,1,1,0], triangles: [0,1,2] }, 'unprotected');

  for (const node of [mesh, other]) {
    node.metadata.meshProtection = { format: 'FormnaroMeshProtection', version: 1, regions: [{
      id: 'contact', name: 'Contact', purpose: 'contact', geometryDigest: meshSelectionGeometryDigest(node),
      triangleIds: [0],
    }] };
  }
  const file = join(path, 'fixture.fnpack');
  await pack.writeFnpack(file, encodeFnpackProject(createCadProject({ nodes: [mesh, other, unprotected] })));
  const opened = await pack.openFnpack(file);
  t.after(() => opened.close());
  const reads = [];
  const resolver = createFnpackResolver({ readBlock: hash => { reads.push(hash); return opened.read(hash); } });
  const controller = createCadController({ createWorker: adapter('./fixtures/cad-node-worker.mjs'),
    createMeshWorker: adapter('./fixtures/mesh-engine-node-worker.mjs'), resolveGeometry: resolver.hydrate });
  t.after(() => controller.dispose());
  await controller.open(opened.index.project);
  const node = controller.readSnapshot().nodes[0];
  assert.ok(isGeometryRef(node.mesh));
  assert.equal(node.mesh.triangles, mesh.mesh.triangles.length / 3);
  return { controller, reads, node };
}
const getSelection = () => [{ rootId: 'chosen', path: [] }];

test('large mesh UI proposes a numeric target when opening a saved FNPACK mesh', async t => {
  const { controller, node } = await fixture(t);
  const panel = element();
  globalThis.document = { createElement: () => panel };
  t.after(() => { delete globalThis.document; });
  const ui = createCadMeshReduceUI({ controller, getSelection, view: { canvas: element(), setInteraction() {} } });
  t.after(() => ui.dispose());
  assert.equal(await ui.open('large-v1'), true);
  assert.equal(panel.querySelector('#mesh-reduce-target').value, String(Math.floor(node.mesh.triangles * 0.25)));
});

test('face selection opens FNPACK by loading only the selected source and draws selection and protection from its exact geometry', async t => {
  const { controller, reads, node } = await fixture(t);
  const panel = element();
  globalThis.document = { createElement: () => panel };
  t.after(() => { delete globalThis.document; });
  const overlays = new Set(), protection = [], visiblyDisplayed = new Set(['chosen', 'unprotected']);
  let interaction, protectedSource;
  function construct(binding, mesh) {
    const overlay = createMeshSelectionOverlay(binding, mesh);
    overlays.add(overlay);
    return overlay.children[0].geometry.attributes.position.count;
  }
  let selected = 0;
  const ui = createCadMeshSelectionUI({ getProject: () => controller.readSnapshot(),
    materialize: controller.materialize, getSelection,
    view: { canvas: element(), setInteraction(fn) { interaction = fn; },
      setMeshSelection(binding, source) { if (binding) selected = construct(binding, source); },
      meshSelectionHit: meshSelectionSurfaceHit,
      meshInspectionAvailable: id => visiblyDisplayed.has(id),
      setMeshProtection(values) {
        protectedSource = values[0]?.node;
        protection.splice(0, protection.length, ...values.map(v => construct(v.binding, v.node)));
      },
    },
  });
  t.after(() => {
    ui.dispose();
    for (const overlay of overlays) overlay.traverse(part => { part.geometry?.dispose(); part.material?.dispose(); });
  });
  assert.equal((await ui.open()).objectId, 'chosen');
  assert.deepEqual(protection, [3]);
  const source = protectedSource.mesh;
  const [a,b,c] = source.triangles.slice(3,6).map(id => new Vector3(...source.verts.slice(id*3,id*3+3)));
  const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
  const center = a.clone().add(b).add(c).divideScalar(3);
  const ray = { origin: center.addScaledVector(normal, 5).toArray(), direction: normal.negate().toArray() };
  const hit = rootId => ({ faceIndex: 999, object: { visible: true, userData: { rootId, record: { kind: 'mesh' } } } });
  await interaction(ray, { button: 0 }, hit('unselected'));
  assert.equal(ui.state().triangleCount, 0);
  await interaction(ray, { button: 0 }, hit('chosen'));
  assert.deepEqual(ui.state().draft.triangleIds, [1]);
  assert.equal(selected, 3);
  panel.querySelector('#mesh-selection-regions').value = 'contact';
  ui.recall();
  assert.deepEqual(ui.state().draft.triangleIds, [0]);
  const saved = await ui.apply();
  assert.deepEqual(saved.triangleIds, [0]);
  assert.deepEqual((await ui.restore(saved)).triangleIds, [0]);
  assert.deepEqual([...new Set(reads)], [node.mesh.sha256]);
  assert.ok(isGeometryRef(controller.readSnapshot().nodes[0].mesh));

  visiblyDisplayed.add('unselected');
  assert.equal(await ui.sync(), true);
  assert.deepEqual(protection, [3, 3]);
  assert.deepEqual([...new Set(reads)], [node.mesh.sha256, controller.readSnapshot().nodes[1].mesh.sha256]);
  visiblyDisplayed.delete('unselected');
  await ui.sync();
  assert.deepEqual(protection, [3]);
});
