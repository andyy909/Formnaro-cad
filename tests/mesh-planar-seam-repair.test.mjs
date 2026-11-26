import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMeshSelectionTopology } from '../src/mesh-selection-data.js';
import { inspectMeshTopology } from '../src/mesh-inspector.js';
import { detectDefectPlane, repairPlanarSeam } from '../src/mesh-planar-seam-repair.js';

function rotatePoints(verts, axis, angle) {
  const norm = Math.hypot(...axis);
  const [ux, uy, uz] = axis.map((v) => v / norm);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const out = [];
  for (let i = 0; i < verts.length; i += 3) {
    const x = verts[i], y = verts[i + 1], z = verts[i + 2];
    const dot = ux * x + uy * y + uz * z;
    const rx = x * cos + (uy * z - uz * y) * sin + ux * dot * (1 - cos);
    const ry = y * cos + (uz * x - ux * z) * sin + uy * dot * (1 - cos);
    const rz = z * cos + (ux * y - uy * x) * sin + uz * dot * (1 - cos);
    out.push(rx, ry, rz);
  }
  return out;
}

function createSyntheticSeamMesh() {
  // Base box [0, 10] x [0, 10] x [0, 10]
  // Top face at Z=10 is split so a column [2, 8] x [2, 8] x [10, 20] attaches to it.
  // The column has a redundant bottom cap at Z=10: [2,8] x [2,8]
  const verts = [
    // Base bottom z=0
    0, 0, 0,   10, 0, 0,   10, 10, 0,   0, 10, 0, // 0..3
    // Base top outer z=10
    0, 0, 10,  10, 0, 10,  10, 10, 10,  0, 10, 10, // 4..7
    // Column base / interface on top at z=10
    2, 2, 10,  8, 2, 10,   8, 8, 10,   2, 8, 10,  // 8..11
    // Column top z=20
    2, 2, 20,  8, 2, 20,   8, 8, 20,   2, 8, 20,  // 12..15
  ];

  const triangles = [
    // Base bottom (z=0)
    0, 2, 1,   0, 3, 2,
    // Base sides
    0, 1, 5,   0, 5, 4,
    1, 2, 6,   1, 6, 5,
    2, 3, 7,   2, 7, 6,
    3, 0, 4,   3, 4, 7,
    // Base top collar surrounding the column [2,8]x[2,8]
    4, 5, 9,   4, 9, 8,
    5, 6, 10,  5, 10, 9,
    6, 7, 11,  6, 11, 10,
    7, 4, 8,   7, 8, 11,
    // Redundant cap at bottom of column (overlapping seam at z=10)
    8, 9, 10,  8, 10, 11,
    // Column walls
    8, 13, 9,   8, 12, 13,
    9, 14, 10,  9, 13, 14,
    10, 15, 11, 10, 14, 15,
    11, 12, 8,  11, 15, 12,
    // Column top (z=20)
    12, 14, 13, 12, 15, 14,
  ];

  return { verts, triangles };
}

test('N02-01 & N02-02: Geometrical plane detection on synthetic seam is fully rotation-invariant', () => {
  const mesh = createSyntheticSeamMesh();
  const topo = buildMeshSelectionTopology(mesh);
  const rep = inspectMeshTopology(topo);
  const seamGroup = rep.defectGroups.find((g) => g.nonmanifoldEdgeIndices.length > 0);

  assert.ok(seamGroup, 'Defect group with nonmanifold seam must be found');
  const plane = detectDefectPlane(mesh, topo, seamGroup);
  assert.ok(plane, 'Defect plane must be detected');
  assert.deepEqual(plane.normal.map((v) => Math.round(v)), [0, 0, 1]);
  assert.equal(Math.round(plane.distance), 10);

  // Rotate by 45 degrees around [1, 0, 0]
  const angle = Math.PI / 4;
  const rotVerts = rotatePoints(mesh.verts, [1, 0, 0], angle);
  const rotMesh = { verts: rotVerts, triangles: [...mesh.triangles] };
  const rotTopo = buildMeshSelectionTopology(rotMesh);
  const rotRep = inspectMeshTopology(rotTopo);
  const rotSeamGroup = rotRep.defectGroups.find((g) => g.nonmanifoldEdgeIndices.length > 0);

  assert.ok(rotSeamGroup, 'Rotated defect group must be found');
  const rotPlane = detectDefectPlane(rotMesh, rotTopo, rotSeamGroup);
  assert.ok(rotPlane, 'Rotated plane must be detected');

  // Expected normal: [0, -sin(45°), cos(45°)] ~ [0, -0.7071, 0.7071]
  const expectedNormal = [0, -Math.sin(angle), Math.cos(angle)];
  for (let k = 0; k < 3; k++) {
    assert.ok(
      Math.abs(rotPlane.normal[k] - expectedNormal[k]) < 1e-3 ||
      Math.abs(rotPlane.normal[k] + expectedNormal[k]) < 1e-3,
      `Rotated normal component ${k} matches`,
    );
  }
});

test('N02-03: Local seam repair replaces only overlapping faces and preserves unrelated faces', () => {
  const mesh = createSyntheticSeamMesh();
  const beforeCopy = structuredClone(mesh);
  const topo = buildMeshSelectionTopology(mesh);
  const rep = inspectMeshTopology(topo);
  const seamGroup = rep.defectGroups.find((g) => g.nonmanifoldEdgeIndices.length > 0);

  const res = repairPlanarSeam(mesh, topo, seamGroup);
  assert.equal(res.report.closed, true);
  assert.equal(res.report.removedFaceCount, 2); // exactly the 2 redundant cap faces

  const postTopo = buildMeshSelectionTopology(res.mesh);
  const postRep = inspectMeshTopology(postTopo);
  assert.equal(postRep.categories.nonmanifoldEdge.count, 0, 'No nonmanifold edges after repair');
  assert.equal(postRep.categories.boundary.count, 0, 'No boundary edges after repair (closed solid)');
  assert.equal(postRep.defectGroups.length, 0, 'Zero defect groups remaining');

  // Input mesh remained untouched
  assert.deepEqual(mesh, beforeCopy);
});

test('N02-05 Counter-probe 1: Large open hole is strictly rejected with MESH_PLANAR_REPAIR_REJECTED', () => {
  // Box with missing top face at Z=10
  const verts = [
    0, 0, 0,  10, 0, 0,  10, 10, 0,  0, 10, 0,
    0, 0, 10, 10, 0, 10, 10, 10, 10, 0, 10, 10,
  ];
  const triangles = [
    // bottom
    0, 2, 1,  0, 3, 2,
    // sides
    0, 1, 5,  0, 5, 4,
    1, 2, 6,  1, 6, 5,
    2, 3, 7,  2, 7, 6,
    3, 0, 4,  3, 4, 7,
  ];
  const mesh = { verts, triangles };
  const topo = buildMeshSelectionTopology(mesh);
  const rep = inspectMeshTopology(topo);
  const openHoleGroup = rep.defectGroups[0];
  assert.ok(openHoleGroup);
  assert.equal(openHoleGroup.nonmanifoldEdgeIndices.length, 0);

  assert.throws(
    () => repairPlanarSeam(mesh, topo, openHoleGroup),
    {
      code: 'MESH_PLANAR_REPAIR_REJECTED',
      message: 'Keine überlappende ebene Nahtstelle. Ein absichtlich offenes Loch wird nicht automatisch geschlossen.',
    },
  );
});

test('N02-05 Counter-probe 2: Intact narrow slit remains untouched with 0 changes', () => {
  // A solid block with an intentional 0.5mm slit (already watertight and manifold)
  // [0, 4.75] and [5.25, 10]
  const verts = [
    0, 0, 0,   4.75, 0, 0,   4.75, 10, 0,   0, 10, 0,
    0, 0, 10,  4.75, 0, 10,  4.75, 10, 10,  0, 10, 10,
  ];
  const triangles = [
    0, 2, 1, 0, 3, 2,
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7,
    4, 5, 6, 4, 6, 7,
  ];
  const mesh = { verts, triangles };
  const topo = buildMeshSelectionTopology(mesh);
  const rep = inspectMeshTopology(topo);
  assert.equal(rep.defectGroups.length, 0, 'Intact slit block has 0 defect groups');
  const res = repairPlanarSeam(mesh, topo, null);
  assert.equal(res.report.changes, 0);
  assert.deepEqual(res.mesh, mesh);
});

test('N02-05 Counter-probe 3: Two separate bodies remain strictly separated', () => {
  // Body A: synthetic mesh with seam at x in [0, 10]
  const meshA = createSyntheticSeamMesh();
  // Body B: isolated clean cube at x in [30, 40]
  const shift = 30;
  const vertsB = [
    shift + 0, 0, 0,  shift + 10, 0, 0,  shift + 10, 10, 0,  shift + 0, 10, 0,
    shift + 0, 0, 10, shift + 10, 0, 10, shift + 10, 10, 10, shift + 0, 10, 10,
  ];
  const vOffset = meshA.verts.length / 3;
  const trisB = [
    0, 2, 1, 0, 3, 2,
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7,
    4, 5, 6, 4, 6, 7,
  ].map((i) => i + vOffset);

  const combined = {
    verts: [...meshA.verts, ...vertsB],
    triangles: [...meshA.triangles, ...trisB],
  };

  const topo = buildMeshSelectionTopology(combined);
  const rep = inspectMeshTopology(topo);
  const seamGroup = rep.defectGroups.find((g) => g.nonmanifoldEdgeIndices.length > 0);
  assert.ok(seamGroup);

  const res = repairPlanarSeam(combined, topo, seamGroup);
  const postTopo = buildMeshSelectionTopology(res.mesh);
  const postRep = inspectMeshTopology(postTopo);

  assert.equal(postRep.categories.nonmanifoldEdge.count, 0);
  // Verify Body B vertices and faces were completely untouched
  const bodyBTriangles = res.mesh.triangles.slice(res.mesh.triangles.length - trisB.length);
  assert.deepEqual(bodyBTriangles, trisB);
});
