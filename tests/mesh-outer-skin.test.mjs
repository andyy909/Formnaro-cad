import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OUTER_SKIN_BUDGET_MM,
  OUTER_SKIN_EXCLUDED_NEIGHBOURHOOD_MM,
  OUTER_SKIN_METHOD,
  buildOuterSkinReference,
  createSeededRandom,
  detectPlanarPatches,
  evaluateOuterSkin,
  sampleSurfacePoints,
} from '../src/mesh-outer-skin.js';

const near = (actual, expected, tolerance = 1e-9) => Math.abs(actual - expected) <= tolerance;

function builder() {
  const verts = [];
  const triangles = [];
  const add = (p) => {
    verts.push(p[0], p[1], p[2]);
    return verts.length / 3 - 1;
  };
  const api = {
    add,
    quad(a, b, c, d, normal) {
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const flip = cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2] < 0;
      const ids = (flip ? [a, d, c, b] : [a, b, c, d]).map((p) => add(p));
      triangles.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
    },
    box(min, max) {
      const [x0, y0, z0] = min;
      const [x1, y1, z1] = max;
      api.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1]);
      api.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
      api.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
      api.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]);
      api.quad([x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [0, 1, 0]);
      api.quad([x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [-1, 0, 0]);
    },
    ring(min, max, hole) {
      const [x0, y0, z0] = min;
      const [x1, y1, z1] = max;
      const [hx0, hy0, hx1, hy1] = hole;
      for (const [z, n] of [
        [z0, [0, 0, -1]],
        [z1, [0, 0, 1]],
      ]) {
        api.quad([x0, y0, z], [hx0, y0, z], [hx0, y1, z], [x0, y1, z], n);
        api.quad([hx1, y0, z], [x1, y0, z], [x1, y1, z], [hx1, y1, z], n);
        api.quad([hx0, y0, z], [hx1, y0, z], [hx1, hy0, z], [hx0, hy0, z], n);
        api.quad([hx0, hy1, z], [hx1, hy1, z], [hx1, y1, z], [hx0, y1, z], n);
      }
      const wall = (a, b, n) => {
        api.quad([a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1], n);
      };
      wall([hx0, hy0], [hx0, hy1], [1, 0, 0]);
      wall([hx1, hy0], [hx1, hy1], [-1, 0, 0]);
      wall([hx0, hy0], [hx1, hy0], [0, 1, 0]);
      wall([hx0, hy1], [hx1, hy1], [0, -1, 0]);
    },
    mesh() {
      return { verts, triangles };
    },
  };
  return api;
}

const rotate = (mesh, axis, angle) => {
  const norm = Math.hypot(...axis);
  const [ux, uy, uz] = axis.map((v) => v / norm);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const verts = [];
  for (let i = 0; i < mesh.verts.length; i += 3) {
    const [x, y, z] = [mesh.verts[i], mesh.verts[i + 1], mesh.verts[i + 2]];
    const d = ux * x + uy * y + uz * z;
    verts.push(
      x * cos + (uy * z - uz * y) * sin + ux * d * (1 - cos),
      y * cos + (uz * x - ux * z) * sin + uy * d * (1 - cos),
      z * cos + (ux * y - uy * x) * sin + uz * d * (1 - cos),
    );
  }
  return { verts, triangles: [...mesh.triangles] };
};

function internalWallBody() {
  const original = builder();
  original.box([0, 0, 0], [40, 40, 40]);
  // innere, vollständig im Material liegende Trennwand (eigene Komponente)
  original.quad([0, 0, 20], [40, 0, 20], [40, 40, 20], [0, 40, 20], [0, 0, 1]);
  const repair = builder();
  repair.box([0, 0, 0], [40, 40, 40]);
  return { original: original.mesh(), repair: repair.mesh() };
}

function throughHoleBody() {
  const original = builder();
  original.ring([0, 0, 0], [40, 40, 20], [12, 12, 28, 28]);
  const repair = builder();
  repair.box([0, 0, 0], [40, 40, 20]);
  return { original: original.mesh(), repair: repair.mesh() };
}

function thinGapBody() {
  const original = builder();
  original.box([0, 0, 0], [40, 40, 20]);
  original.box([0, 0, 20.2], [40, 40, 40.2]);
  const repair = builder();
  repair.box([0, 0, 0], [40, 40, 40.2]);
  return { original: original.mesh(), repair: repair.mesh() };
}

function shiftedFaceBody() {
  const original = builder();
  original.box([0, 0, 0], [40, 40, 40]);
  const repair = builder();
  repair.box([0, 0, 0], [40.3, 40, 40]);
  return { original: original.mesh(), repair: repair.mesh() };
}

const COUNTS = [24000, 48000, 96000];

function hiddenBodyCandidate({ center, size = [2, 2, 0.8], withWall = false }) {
  const candidate = builder();
  candidate.box([0, 0, 0], [40, 40, 40]);
  if (withWall) candidate.quad([0, 0, 20], [40, 0, 20], [40, 40, 20], [0, 40, 20], [0, 0, 1]);
  candidate.box(
    [center[0] - size[0] / 2, center[1] - size[1] / 2, center[2] - size[2] / 2],
    [center[0] + size[0] / 2, center[1] + size[1] / 2, center[2] + size[2] / 2],
  );
  return candidate.mesh();
}

test('N03-A internal planar wall is excluded only where both sides are proven inside material', () => {
  const { original } = internalWallBody();
  const { reference, report } = buildOuterSkinReference(original);
  assert.equal(report.method, OUTER_SKIN_METHOD);
  assert.equal(report.proven, true);
  assert.equal(report.excludedFaces, 2);
  assert.ok(near(report.excludedArea, 1600, 1e-6), `Fläche ${report.excludedArea}`);
  assert.equal(reference.triangles.length / 3, original.triangles.length / 3 - 2);
  const region = report.regions.find((r) => r.excludedArea > 0);
  assert.ok(region);
  assert.ok(near(Math.abs(region.normal[2]), 1, 1e-6));
  assert.ok(near(region.offset, 20, 1e-6));
  assert.equal(region.excludedFaces, 2);
  assert.equal(region.ratio, 1);
  // the closed outer shell stays complete
  assert.equal(report.referenceFaces, 12);
});

test('N03-A open hull yields no exclusion instead of a silent hole', () => {
  const { original } = internalWallBody();
  const open = { verts: [...original.verts], triangles: [...original.triangles] };
  // remove the two faces of the side wall x=40 and of the bottom
  const keep = [];
  for (let f = 0; f < open.triangles.length / 3; f++) {
    const ids = open.triangles.slice(f * 3, f * 3 + 3);
    const xs = ids.map((i) => open.verts[i * 3]);
    const zs = ids.map((i) => open.verts[i * 3 + 2]);
    if (xs.every((x) => near(x, 40)) || zs.every((z) => near(z, 0))) continue;
    keep.push(...ids);
  }
  open.triangles = keep;
  const { report } = buildOuterSkinReference(open);
  assert.equal(report.proven, false);
  assert.equal(report.excludedFaces, 0);
  assert.equal(report.excludedArea, 0);
});

test('N03-A a real through hole is not excluded and a closing repair fails', () => {
  const { original, repair } = throughHoleBody();
  const { report } = buildOuterSkinReference(original);
  assert.equal(report.excludedFaces, 0);
  const result = evaluateOuterSkin({ original, candidate: repair, samples: COUNTS });
  assert.equal(result.passed, false);
  assert.equal(result.decidedBy, 'raw');
  for (const run of result.runs) {
    assert.ok(run.raw.worst > OUTER_SKIN_BUDGET_MM, `Roh ${run.samples}: ${run.raw.worst}`);
    assert.ok(run.skin.worst > OUTER_SKIN_BUDGET_MM, `Außenhaut ${run.samples}: ${run.skin.worst}`);
  }
});

test('N03-A a bridged 0,2 mm gap fails in both directions', () => {
  const { original, repair } = thinGapBody();
  const result = evaluateOuterSkin({ original, candidate: repair, samples: COUNTS });
  assert.equal(result.passed, false);
  assert.equal(result.proven, false);
  for (const run of result.runs) {
    assert.ok(run.raw.worst > OUTER_SKIN_BUDGET_MM);
    assert.ok(run.skin.worst > OUTER_SKIN_BUDGET_MM);
  }
});

test('N03-A a 0,3 mm shifted outer face fails', () => {
  const { original, repair } = shiftedFaceBody();
  const result = evaluateOuterSkin({ original, candidate: repair, samples: COUNTS });
  assert.equal(result.passed, false);
  for (const run of result.runs) assert.ok(run.raw.worst > 0.29 && run.raw.worst <= 0.301);
});

test('N03-A an unchanged copy measures zero', () => {
  const { original } = internalWallBody();
  const result = evaluateOuterSkin({ original, candidate: original, samples: COUNTS });
  assert.equal(result.passed, true);
  assert.equal(result.proven, true);
  for (const run of result.runs) {
    assert.ok(run.skin.worst < 1e-9, `Außenhaut ${run.samples}: ${run.skin.worst}`);
    assert.ok(run.raw.worst < 1e-9, `Roh ${run.samples}: ${run.raw.worst}`);
    assert.ok(run.skin.skippedInsideMaterial > 0);
  }
});

test('N03-A internal wall case: raw comparison exceeds the budget, the outer skin holds at all sample counts', () => {
  const { original, repair } = internalWallBody();
  const result = evaluateOuterSkin({ original, candidate: repair, samples: COUNTS });
  assert.equal(result.proven, true);
  assert.equal(result.decidedBy, 'outer-skin');
  assert.equal(result.passed, true);
  for (const run of result.runs) {
    assert.ok(run.raw.worst > 19, `Roh ${run.samples}: ${run.raw.worst}`);
    assert.ok(run.skin.worst <= OUTER_SKIN_BUDGET_MM, `Außenhaut ${run.samples}: ${run.skin.worst}`);
    assert.ok(run.skin.worst < 1e-9);
  }
  assert.deepEqual(
    result.verdicts.map((v) => v.samples),
    COUNTS,
  );
  assert.ok(result.spread.skin < 1e-6);
});

test('N03-A method is rotation invariant and reproducible', () => {
  const { original, repair } = internalWallBody();
  const rotated = rotate(original, [0.3, -0.7, 0.2], 0.83);
  const rotatedRepair = rotate(repair, [0.3, -0.7, 0.2], 0.83);
  const { report } = buildOuterSkinReference(rotated);
  assert.equal(report.excludedFaces, 2);
  assert.ok(near(report.excludedArea, 1600, 1e-6));
  const result = evaluateOuterSkin({ original: rotated, candidate: rotatedRepair, samples: [24000] });
  assert.equal(result.passed, true);
  assert.ok(result.runs[0].skin.worst < 1e-9);
  const a = sampleSurfacePoints(original, 2000, 7);
  const b = sampleSurfacePoints(original, 2000, 7);
  const c = sampleSurfacePoints(original, 2000, 8);
  assert.deepEqual([...a], [...b]);
  assert.notDeepEqual([...a], [...c]);
  assert.equal(createSeededRandom(5)(), createSeededRandom(5)());
});

test('N03-A planar patches are reported with area, normal and bounds', () => {
  const { original } = internalWallBody();
  const { patches, degenerate } = detectPlanarPatches(original, { minArea: 100 });
  assert.equal(degenerate, 0);
  const wall = patches.find((p) => near(p.offset, 20, 1e-6) && near(Math.abs(p.normal[2]), 1, 1e-6));
  assert.ok(wall);
  assert.ok(near(wall.area, 1600, 1e-6));
  assert.equal(wall.faces.length, 2);
  assert.ok(near(wall.bounds.min[2], 20) && near(wall.bounds.max[2], 20));
});

test('N03-A excluded neighbourhood is a named constant of 0,5 mm', () => {
  assert.equal(OUTER_SKIN_EXCLUDED_NEIGHBOURHOOD_MM, 0.5);
  const { original, repair } = internalWallBody();
  const result = evaluateOuterSkin({ original, candidate: repair, samples: [24000] });
  assert.equal(result.excludedNeighbourhoodMm, 0.5);
  assert.equal(result.insideSkipScope, 'excluded-neighbourhood');
  const narrowed = evaluateOuterSkin({ original, candidate: repair, samples: [24000], excludedNeighbourhood: 0.2 });
  assert.equal(narrowed.excludedNeighbourhoodMm, 0.2);
});

test('N03-A Nachbesserung 1: Innenmaterial-Übersprung gilt nur in der 0,5-mm-Nachbarschaft', () => {
  assert.equal(OUTER_SKIN_EXCLUDED_NEIGHBOURHOOD_MM, 0.5);
  const { original } = internalWallBody();
  const far = evaluateOuterSkin({
    original,
    candidate: hiddenBodyCandidate({ center: [10, 10, 25] }),
    samples: COUNTS,
  });
  assert.equal(far.proven, true);
  assert.equal(far.decidedBy, 'outer-skin');
  assert.equal(far.excludedNeighbourhoodMm, 0.5);
  assert.equal(far.insideSkipScope, 'excluded-neighbourhood');
  assert.equal(far.passed, false);
  for (const run of far.runs) {
    assert.ok(run.skin.worst > 8, `Außenhaut ${run.samples}: ${run.skin.worst}`);
    assert.equal(run.skin.skippedInsideMaterial, 0);
  }
});

test('N03-A Nachbesserung 1: Innenkörper direkt an der entfernten Wand bleibt unentdeckt (dokumentierte Grenze)', () => {
  const { original } = internalWallBody();
  const result = evaluateOuterSkin({
    original,
    candidate: hiddenBodyCandidate({ center: [20, 20, 20] }),
    samples: COUNTS,
  });
  assert.equal(result.passed, true);
  for (const run of result.runs) {
    assert.ok(run.skin.worst < 1e-9, `Außenhaut ${run.samples}: ${run.skin.worst}`);
    assert.ok(run.skin.skippedInsideMaterial > 0);
  }
});

test('N03-A Nachbesserung 1: ohne belegte Ausschlusszone wird nichts übersprungen', () => {
  const plain = builder();
  plain.box([0, 0, 0], [40, 40, 40]);
  const result = evaluateOuterSkin({
    original: plain.mesh(),
    candidate: hiddenBodyCandidate({ center: [20, 20, 20] }),
    samples: COUNTS,
  });
  assert.equal(result.proven, false);
  assert.equal(result.decidedBy, 'raw');
  assert.equal(result.excludedNeighbourhoodMm, null);
  assert.equal(result.insideSkipScope, 'none');
  assert.equal(result.passed, false);
  for (const run of result.runs) {
    assert.equal(run.skin.skippedInsideMaterial, 0);
    assert.ok(run.skin.worst > 15);
  }
});
