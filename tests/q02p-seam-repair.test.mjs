import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMeshSelectionTopology } from '../src/mesh-selection-data.js';
import { inspectMeshTopology } from '../src/mesh-inspector.js';
import { repairSimpleTopology } from '../src/mesh-simple-repair.js';

const VERTICES = [
  0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0,
  0, 0, 10, 10, 0, 10, 10, 10, 10, 0, 10, 10,
  2, 2, 10, 8, 2, 10, 8, 8, 10, 2, 8, 10,
  2, 2, 20, 8, 2, 20, 8, 8, 20, 2, 8, 20,
];
const FACES = [
  0, 2, 1, 0, 3, 2,
  0, 1, 5, 0, 5, 4,
  1, 2, 6, 1, 6, 5,
  2, 3, 7, 2, 7, 6,
  3, 0, 4, 3, 4, 7,
  4, 5, 9, 4, 9, 8,
  5, 6, 10, 5, 10, 9,
  6, 7, 11, 6, 11, 10,
  7, 4, 8, 7, 8, 11,
  8, 9, 10, 8, 10, 11,
  8, 13, 9, 8, 12, 13,
  9, 14, 10, 9, 13, 14,
  10, 15, 11, 10, 14, 15,
  11, 12, 8, 11, 15, 12,
  12, 14, 13, 12, 15, 14,
];
const COLLAR_FACE = 10;

const seamMesh = ({ dropCollar = false, dropBottom = false } = {}) => {
  const triangles = [...FACES];
  if (dropCollar) triangles.splice(COLLAR_FACE * 3, 3);
  if (dropBottom) triangles.splice(0, 3);
  return { verts: [...VERTICES], triangles };
};

function rotate(verts, axis, angle) {
  const norm = Math.hypot(...axis);
  const [ux, uy, uz] = axis.map((v) => v / norm);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const out = [];
  for (let i = 0; i < verts.length; i += 3) {
    const x = verts[i], y = verts[i + 1], z = verts[i + 2];
    const dot = ux * x + uy * y + uz * z;
    out.push(
      x * cos + (uy * z - uz * y) * sin + ux * dot * (1 - cos),
      y * cos + (uz * x - ux * z) * sin + uy * dot * (1 - cos),
      z * cos + (ux * y - uy * x) * sin + uz * dot * (1 - cos),
    );
  }
  return out;
}

const repairSeam = (mesh) => {
  const topology = buildMeshSelectionTopology(mesh);
  const options = {
    method: 'simple-v1',
    geometryDigest: topology.geometryDigest,
    removeDegenerate: false,
    removeDuplicates: false,
    orient: false,
    repairPlanarSeam: true,
    smallTriangleLimit: 20,
    removeComponents: [],
  };
  return repairSimpleTopology(topology, options, { buildTopology: buildMeshSelectionTopology });
};
const diagnose = (mesh) =>
  Object.fromEntries(
    Object.entries(inspectMeshTopology(buildMeshSelectionTopology(mesh)).categories).map(([k, c]) => [k, c.count]),
  );

test('Q02-P-A: the public wrapper survives the face count reduced by the seam repair', () => {
  const before = structuredClone(seamMesh());
  const result = repairSeam(before);
  assert.equal(result.report.repairedPlanarSeams, 1);
  assert.equal(result.report.planarSeamChanges, 2);
  assert.equal(result.report.beforeTriangles, 30);
  assert.equal(result.report.afterTriangles, 28);
  assert.equal(result.report.holesFilled, 0);
  const after = diagnose(result.mesh);
  assert.equal(after.boundary, 0);
  assert.equal(after.nonmanifoldEdge, 0);
});

test('Q02-P-B1: a residual rim on the proven defect plane is closed with existing coordinates', () => {
  const before = structuredClone(seamMesh({ dropCollar: true }));
  const result = repairSeam(before);
  assert.equal(result.report.holesFilled, 1);
  assert.deepEqual(
    result.report.residualOpeningsClosed.map((x) => [x.boundaryEdgesClosed, x.addedTriangles]),
    [[3, 1]],
  );
  assert.equal(result.report.coordinatesMoved, false);
  const after = diagnose(result.mesh);
  assert.equal(after.boundary, 0);
  assert.equal(after.nonmanifoldEdge, 0);
  assert.equal(after.duplicate, 0);
  assert.equal(after.degenerate, 0);
  for (const value of result.mesh.verts) assert.ok(before.verts.includes(value));
});

test('Q02-P-B1 counter-probe: an intentional hole on another plane stays open', () => {
  const result = repairSeam(seamMesh({ dropBottom: true }));
  assert.equal(result.report.holesFilled, 0);
  assert.deepEqual(result.report.residualOpeningsClosed, []);
  assert.equal(diagnose(result.mesh).boundary, 3);
});

test('Q02-P-B1 counter-probe: a hole on the same plane in another patch stays open', () => {
  const mesh = seamMesh({ dropCollar: true });
  const offset = mesh.verts.length / 3;
  // Separate open box at x = 50..60: the same z = 10 plane, but a distinct patch.
  mesh.verts.push(
    50, 0, 0, 60, 0, 0, 60, 10, 0, 50, 10, 0,
    50, 0, 10, 60, 0, 10, 60, 10, 10, 50, 10, 10,
  );
  const start = mesh.triangles.length;
  mesh.triangles.push(
    0, 2, 1, 0, 3, 2,
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7,
  );
  for (let i = start; i < mesh.triangles.length; i++) mesh.triangles[i] += offset;
  const result = repairSeam(mesh);
  assert.equal(result.report.holesFilled, 1);
  assert.equal(diagnose(result.mesh).boundary, 4);
  assert.ok(result.mesh.verts.includes(50), 'the untouched open box keeps its coordinates');
});

test('Q02-P-B1: the residual closing is rotation invariant', () => {
  const mesh = seamMesh({ dropCollar: true });
  mesh.verts = rotate(mesh.verts, [1, 0, 0], Math.PI / 4);
  const result = repairSeam(mesh);
  assert.equal(result.report.holesFilled, 1);
  const after = diagnose(result.mesh);
  assert.equal(after.boundary, 0);
  assert.equal(after.nonmanifoldEdge, 0);
});

test('Q02-P-B1 without an injected topology builder keeps the residual rim open (pre-B1 behaviour)', () => {
  const mesh = seamMesh({ dropCollar: true });
  const topology = buildMeshSelectionTopology(mesh);
  const result = repairSimpleTopology(topology, {
    method: 'simple-v1', geometryDigest: topology.geometryDigest, removeDegenerate: false, removeDuplicates: false,
    orient: false, repairPlanarSeam: true, smallTriangleLimit: 20, removeComponents: [],
  });
  assert.equal(result.report.repairedPlanarSeams, 1);
  assert.equal(result.report.holesFilled, 0);
  assert.ok(diagnose(result.mesh).boundary > 0);
});
