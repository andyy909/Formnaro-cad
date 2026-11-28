import test from 'node:test';
import assert from 'node:assert/strict';
import { admitLocalRepairOuterSkin } from '../src/mesh-engine-adapter.js';
import { meshCadInput, confirmedLocalRepair } from '../src/cad-mesh-to-cad-data.js';
import { meshToCadNative } from '../src/cad-mesh-to-cad-native.js';
import { createCadProject } from '../src/cad-project.js';
import { projectObjectGeometryDigest } from '../src/project-objects.js';

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const cube = (x = 0) => ({
  verts: [
    x, 0, 0, x + 10, 0, 0, x + 10, 10, 0, x, 10, 0,
    x, 0, 10, x + 10, 0, 10, x + 10, 10, 10, x, 10, 10,
  ],
  triangles: [
    0, 2, 1, 0, 3, 2,
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7,
    4, 5, 6, 4, 6, 7,
  ],
});
const repairOperation = (planar = true) => ({
  type: 'repair',
  options: {
    method: 'simple-v1',
    geometryDigest: 'a'.repeat(64),
    removeDegenerate: false,
    removeDuplicates: false,
    orient: false,
    repairPlanarSeam: planar,
    smallTriangleLimit: 20,
    removeComponents: [],
  },
});
const meshNode = ({ meshSource } = {}) => ({
  id: 'mesh',
  kind: 'mesh',
  meshRole: 'solid',
  name: 'Repariertes Netz',
  color: '#77a8b5',
  opacity: 1,
  transform: [...identity],
  layerId: 'default',
  folderId: null,
  mesh: cube(),
  ...(meshSource ? { meshSource } : {}),
});

test('Q02-P-D: the released outer-skin comparison passes under budget and reports every value', () => {
  const report = admitLocalRepairOuterSkin(cube(), cube());
  assert.equal(report.method, 'outer-skin-v1');
  assert.equal(report.budgetMm, 0.15);
  assert.equal(report.passed, true);
  assert.ok(report.skin.originalToCandidateMm < 1e-9);
  assert.ok(report.raw.candidateToOriginalMm < 1e-9);
  assert.match(report.originalDigest, /^[a-f0-9]{64}$/);
  assert.match(report.resultDigest, /^[a-f0-9]{64}$/);
  assert.ok(report.durationMs >= 0);
  assert.equal(report.probe.samplePointsPerDirection, 24000);
  assert.equal(typeof report.excludedFaces, 'number');
  assert.equal(typeof report.excludedAreaMm2, 'number');
});

test('Q02-P-D: a candidate above the budget is blocked with location and amount', () => {
  assert.throws(
    () => admitLocalRepairOuterSkin(cube(), cube(1)),
    (error) => {
      assert.equal(error.code, 'MESH_OUTER_SKIN_BUDGET');
      assert.match(error.message, /Außenhautprüfung nicht bestanden/);
      assert.match(error.message, /0,15 mm/);
      assert.equal(error.report.passed, false);
      assert.equal(error.report.worstLocation.length, 3);
      assert.ok(error.report.raw.originalToCandidateMm > 0.15);
      return true;
    },
  );
});

test('Q02-P-C: only a retained planar-seam repair counts as a confirmed local repair', () => {
  assert.equal(confirmedLocalRepair(meshNode()), null);
  assert.equal(
    confirmedLocalRepair(meshNode({ meshSource: { version: 3, operation: repairOperation(false) } })),
    null,
  );
  assert.deepEqual(confirmedLocalRepair(meshNode({ meshSource: { version: 3, operation: repairOperation() } })), {
    method: 'simple-v1',
    planarSeam: true,
    note: 'Lokale ebene Naht am Original repariert; das Ergebnis wird nicht erneut repariert.',
  });
});

test('Q02-P-C: mesh → CAD binds the confirmed repair to the converter input', () => {
  const project = createCadProject(),
    node = meshNode({ meshSource: { version: 3, operation: repairOperation() } });
  project.nodes.push(node);
  const input = meshCadInput(project, { rootId: 'mesh', path: [] }, 'r1');
  assert.equal(input.source.localRepair.method, 'simple-v1');
  assert.equal(input.source.digest, projectObjectGeometryDigest(node));
  const plain = createCadProject();
  plain.nodes.push(meshNode());
  assert.equal(meshCadInput(plain, { rootId: 'mesh', path: [] }, 'r1').source.localRepair, null);
});

test('Q02-P-C: the native step rejects a converter repair of an already repaired mesh', () => {
  const project = createCadProject(),
    node = meshNode({ meshSource: { version: 3, operation: repairOperation() } });
  project.nodes.push(node);
  const fassung = {
      version: 1,
      id: 'b'.repeat(64),
      origin_sha256: 'c'.repeat(64),
      result_sha256: 'd'.repeat(64),
      budget_mm: 0.15,
      samples: 24000,
      accepted: true,
    },
    options = {
      target: { rootId: 'mesh', path: [] },
      sourceDigest: projectObjectGeometryDigest(node),
      bytes: new Uint8Array([1, 2, 3]),
      id: 'copy',
      notes: 'Bericht',
    },
    service = { stepNode: () => ({ id: 'copy' }) };
  assert.throws(() => meshToCadNative(service, project, { ...options, repair: fassung }), /bereits lokal repariert/);
  assert.deepEqual(meshToCadNative(service, project, options), { id: 'copy' });
  const plain = createCadProject();
  plain.nodes.push(meshNode());
  const plainNode = plain.nodes[0];
  assert.deepEqual(
    meshToCadNative(service, plain, {
      ...options,
      sourceDigest: projectObjectGeometryDigest(plainNode),
      repair: fassung,
    }),
    { id: 'copy' },
  );
});
