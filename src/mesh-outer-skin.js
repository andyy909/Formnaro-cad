import { createDistanceTree, closestTrianglePoint } from './model-deviation.js';

export const OUTER_SKIN_BUDGET_MM = 0.15;
export const OUTER_SKIN_EXCLUDED_NEIGHBOURHOOD_MM = 0.5;
export const OUTER_SKIN_METHOD = 'outer-skin-v1';
export const OUTER_SKIN_SEED = 20261124;

const fail = (message, code = 'MESH_OUTER_SKIN') => {
  throw Object.assign(Error(message), { code });
};

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const length = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => {
  const l = length(a);
  return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : null;
};

const vertexAt = (mesh, id) => [mesh.verts[id * 3], mesh.verts[id * 3 + 1], mesh.verts[id * 3 + 2]];

function faceAt(mesh, face) {
  const a = vertexAt(mesh, mesh.triangles[face * 3]);
  const b = vertexAt(mesh, mesh.triangles[face * 3 + 1]);
  const c = vertexAt(mesh, mesh.triangles[face * 3 + 2]);
  const n = cross(sub(b, a), sub(c, a));
  const area = length(n) / 2;
  return { a, b, c, area, normal: area > 0 ? unit(n) : null };
}

function validateMesh(mesh, label) {
  const { verts, triangles } = mesh ?? {};
  const count = triangles?.length / 3;
  if (
    !Array.isArray(verts) ||
    !Array.isArray(triangles) ||
    !Number.isInteger(count) ||
    count < 1 ||
    verts.length % 3 ||
    verts.some((v) => typeof v !== 'number' || !Number.isFinite(v)) ||
    triangles.some((i) => !Number.isSafeInteger(i) || i < 0 || i >= verts.length / 3)
  )
    fail(`${label}: endliche Dreiecksnetze mit gültigen Indizes erwartet.`, 'MESH_OUTER_SKIN_INPUT');
  return count;
}

const canonicalPlane = (normal, point) => {
  const n = unit(normal);
  if (!n) return null;
  let d = dot(n, point);
  const flip =
    d < -1e-9 ||
    (Math.abs(d) <= 1e-9 &&
      (n[2] < -1e-9 || (Math.abs(n[2]) <= 1e-9 && (n[1] < -1e-9 || (Math.abs(n[1]) <= 1e-9 && n[0] < 0)))));
  return flip ? { normal: n.map((v) => -v), offset: -d } : { normal: n, offset: d };
};

/** Fixed, non-axis-aligned interrogation directions; all must agree for a proof. */
const RAY_DIRECTIONS = [
  [0.371390676, 0.557086014, 0.742781353],
  [-0.624695048, 0.468521286, 0.624695048],
  [0.707106781, -0.40824829, 0.577350269],
  [-0.301511345, -0.904534034, 0.301511345],
  [0.267261242, 0.534522484, -0.801783726],
].map((d) => unit(d));

/** Plain binary BVH over triangles for ray parity tests. */
function buildRayBvh(mesh) {
  const count = mesh.triangles.length / 3;
  const lows = new Float64Array(count * 3);
  const highs = new Float64Array(count * 3);
  const centers = new Float64Array(count * 3);
  for (let f = 0; f < count; f++) {
    for (let k = 0; k < 3; k++) {
      const a = mesh.verts[mesh.triangles[f * 3] * 3 + k];
      const b = mesh.verts[mesh.triangles[f * 3 + 1] * 3 + k];
      const c = mesh.verts[mesh.triangles[f * 3 + 2] * 3 + k];
      lows[f * 3 + k] = Math.min(a, b, c);
      highs[f * 3 + k] = Math.max(a, b, c);
      centers[f * 3 + k] = (a + b + c) / 3;
    }
  }
  function build(ids) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const f of ids)
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], lows[f * 3 + k]);
        max[k] = Math.max(max[k], highs[f * 3 + k]);
      }
    if (ids.length <= 8) {
      return { min, max, ids };
    }
    const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    const axis = size.indexOf(Math.max(...size));
    ids.sort((a, b) => centers[a * 3 + axis] - centers[b * 3 + axis]);
    const middle = ids.length >> 1;
    return {
      min,
      max,
      left: build(ids.slice(0, middle)),
      right: build(ids.slice(middle)),
    };
  }
  return build(Array.from({ length: count }, (_, i) => i));
}

const slab = (origin, direction, min, max, maxDistance) => {
  let enter = 0;
  let exit = maxDistance;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(direction[k]) < 1e-12) {
      if (origin[k] < min[k] || origin[k] > max[k]) return false;
      continue;
    }
    const inverse = 1 / direction[k];
    let t0 = (min[k] - origin[k]) * inverse;
    let t1 = (max[k] - origin[k]) * inverse;
    if (t0 > t1) [t0, t1] = [t1, t0];
    enter = Math.max(enter, t0);
    exit = Math.min(exit, t1);
    if (enter > exit) return false;
  }
  return true;
};

/** Ray/mesh crossings; coincident hits are collapsed so duplicated sheets count once. */
function crossings(bvh, mesh, origin, direction, ignore) {
  const hits = [];
  const stack = [bvh];
  const e1 = [0, 0, 0];
  const e2 = [0, 0, 0];
  const pv = [0, 0, 0];
  while (stack.length) {
    const node = stack.pop();
    if (!slab(origin, direction, node.min, node.max, 1e9)) continue;
    if (node.ids) {
      for (const f of node.ids) {
        if (ignore && ignore.has(f)) continue;
        const ia = mesh.triangles[f * 3] * 3;
        const ib = mesh.triangles[f * 3 + 1] * 3;
        const ic = mesh.triangles[f * 3 + 2] * 3;
        e1[0] = mesh.verts[ib] - mesh.verts[ia];
        e1[1] = mesh.verts[ib + 1] - mesh.verts[ia + 1];
        e1[2] = mesh.verts[ib + 2] - mesh.verts[ia + 2];
        e2[0] = mesh.verts[ic] - mesh.verts[ia];
        e2[1] = mesh.verts[ic + 1] - mesh.verts[ia + 1];
        e2[2] = mesh.verts[ic + 2] - mesh.verts[ia + 2];
        pv[0] = direction[1] * e2[2] - direction[2] * e2[1];
        pv[1] = direction[2] * e2[0] - direction[0] * e2[2];
        pv[2] = direction[0] * e2[1] - direction[1] * e2[0];
        const determinant = dot(e1, pv);
        if (Math.abs(determinant) < 1e-12) continue;
        const inverse = 1 / determinant;
        const tv = [
          origin[0] - mesh.verts[ia],
          origin[1] - mesh.verts[ia + 1],
          origin[2] - mesh.verts[ia + 2],
        ];
        const u = dot(tv, pv) * inverse;
        if (u < -1e-9 || u > 1 + 1e-9) continue;
        const qv = cross(tv, e1);
        const v = dot(direction, qv) * inverse;
        if (v < -1e-9 || u + v > 1 + 1e-9) continue;
        const t = dot(e2, qv) * inverse;
        if (t > 1e-7) hits.push(t);
      }
      continue;
    }
    stack.push(node.left, node.right);
  }
  if (!hits.length) return 0;
  hits.sort((a, b) => a - b);
  let count = 1;
  for (let i = 1; i < hits.length; i++) if (hits[i] - hits[i - 1] > 1e-6) count++;
  return count;
}

/** True only if all five fixed rays report an odd (material) crossing count. */
function insideProven(bvh, mesh, point, ignore) {
  for (const direction of RAY_DIRECTIONS) {
    if (crossings(bvh, mesh, point, direction, ignore) % 2 === 0) return false;
  }
  return true;
}

/** Reusable material probe for one mesh; ray directions are fixed and reproducible. */
export function createMaterialProbe(mesh) {
  validateMesh(mesh, 'Materialprobe');
  const bvh = buildRayBvh(mesh);
  return {
    inside: (point, ignoreFaces = null) =>
      insideProven(bvh, mesh, point, ignoreFaces ? new Set(ignoreFaces) : null),
    crossingCounts: (point, ignoreFaces = null) =>
      RAY_DIRECTIONS.map((d) => crossings(bvh, mesh, point, d, ignoreFaces ? new Set(ignoreFaces) : null)),
  };
}

/**
 * Groups faces into connected coplanar patches. The plane normal is canonicalised,
 * so the result is rotation invariant and independent of winding conventions.
 */
export function detectPlanarPatches(mesh, options = {}) {
  const count = validateMesh(mesh, 'Ebenenprüfung');
  const minArea = options.minArea ?? 10;
  const normalStep = options.normalTolerance ?? 2e-3;
  const offsetStep = options.offsetTolerance ?? 2e-2;
  if (!(minArea > 0)) fail('Mindestfläche der Ebenenprüfung muss positiv sein.', 'MESH_OUTER_SKIN_INPUT');

  const faces = [];
  let degenerate = 0;
  for (let f = 0; f < count; f++) {
    const face = faceAt(mesh, f);
    if (!face.normal) {
      degenerate++;
      continue;
    }
    const plane = canonicalPlane(face.normal, face.a);
    faces.push({ id: f, area: face.area, normal: plane.normal, offset: plane.offset });
  }

  const groups = new Map();
  for (const face of faces) {
    const key = [face.normal, face.offset]
      .flat()
      .map((v, i) => Math.round(v / (i < 3 ? normalStep : offsetStep)))
      .join(',');
    const group = groups.get(key) ?? [];
    group.push(face);
    groups.set(key, group);
  }

  const weldKey = (mesh, id) =>
    [0, 1, 2]
      .map((k) => Math.round(mesh.verts[id * 3 + k] * 1e4))
      .join(',');
  const patches = [];
  for (const group of groups.values()) {
    const byId = new Map(group.map((f) => [f.id, f]));
    const edges = new Map();
    for (const face of group) {
      const keys = [0, 1, 2].map((k) => weldKey(mesh, mesh.triangles[face.id * 3 + k]));
      for (let k = 0; k < 3; k++) {
        const edge = [keys[k], keys[(k + 1) % 3]].sort().join('|');
        const list = edges.get(edge) ?? [];
        list.push(face.id);
        edges.set(edge, list);
      }
    }
    const neighbors = new Map();
    for (const list of edges.values()) {
      if (list.length < 2) continue;
      for (const a of list) for (const b of list) if (a !== b) {
        const n = neighbors.get(a) ?? [];
        n.push(b);
        neighbors.set(a, n);
      }
    }
    const seen = new Set();
    for (const start of group) {
      if (seen.has(start.id)) continue;
      const ids = [];
      const stack = [start.id];
      seen.add(start.id);
      while (stack.length) {
        const id = stack.pop();
        ids.push(id);
        for (const next of neighbors.get(id) ?? [])
          if (!seen.has(next)) {
            seen.add(next);
            stack.push(next);
          }
      }
      const area = ids.reduce((sum, id) => sum + byId.get(id).area, 0);
      if (area < minArea) continue;
      let normal = [0, 0, 0];
      let offset = 0;
      for (const id of ids) {
        normal = normal.map((v, k) => v + byId.get(id).normal[k] * byId.get(id).area);
        offset += byId.get(id).offset * byId.get(id).area;
      }
      normal = unit(normal) ?? byId.get(ids[0]).normal;
      offset /= area;
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (const id of ids)
        for (let k = 0; k < 3; k++) {
          const p = vertexAt(mesh, mesh.triangles[id * 3]);
          const q = vertexAt(mesh, mesh.triangles[id * 3 + 1]);
          const r = vertexAt(mesh, mesh.triangles[id * 3 + 2]);
          min[k] = Math.min(min[k], p[k], q[k], r[k]);
          max[k] = Math.max(max[k], p[k], q[k], r[k]);
        }
      patches.push({
        id: patches.length,
        faces: ids,
        area,
        normal,
        offset,
        planePoint: normal.map((v) => v * offset),
        bounds: { min, max },
      });
    }
  }
  patches.sort((a, b) => b.area - a.area);
  patches.forEach((patch, index) => (patch.id = index));
  return { patches, degenerate, facePlanes: faces.length };
}

const barycentric = (a, b, c, u, v) => {
  if (u + v > 1) {
    u = 1 - u;
    v = 1 - v;
  }
  return [
    a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * v,
    a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * v,
    a[2] + (b[2] - a[2]) * u + (c[2] - a[2]) * v,
  ];
};

const screenParameters = [
  [1 / 3, 1 / 3],
  [0.6, 0.2],
  [0.2, 0.6],
  [0.2, 0.2],
];

function refineParameters(level) {
  const n = 2 ** level;
  const out = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const u = (i + 0.5) / n;
      const v = (j + 0.5) / n;
      if (u + v >= 1 - 1e-9) continue;
      out.push([u, v]);
    }
  return out;
}

/**
 * Builds the outer-skin reference: the unchanged original minus only those planar
 * faces whose two sides are both proven to lie inside material. All boundary and
 * ambiguous faces stay in the reference.
 */
export function buildOuterSkinReference(mesh, options = {}) {
  const count = validateMesh(mesh, 'Außenhaut');
  const epsilon = options.epsilon ?? 0.02;
  const refineLevel = options.refineLevel ?? 2;
  const maxTests = options.maxTests ?? Infinity;
  if (!(epsilon > 0)) fail('Der Prüfabstand muss positiv sein.', 'MESH_OUTER_SKIN_INPUT');

  const { patches, degenerate } = detectPlanarPatches(mesh, options);
  const bvh = buildRayBvh(mesh);
  const excluded = new Set();
  const regions = [];
  let tests = 0;
  let provenBothSides = 0;
  let refusedOutside = 0;
  let ambiguous = 0;

  for (const patch of patches) {
    const ignore = new Set(patch.faces);
    const refined = refineParameters(refineLevel);
    let excludedFaces = 0;
    let excludedArea = 0;
    let patchRefused = 0;
    let patchAmbiguous = 0;
    const patchExcluded = [];
    for (const faceId of patch.faces) {
      if (tests > maxTests) break;
      const { a, b, c, area, normal } = faceAt(mesh, faceId);
      if (!normal) continue;
      const direction = normal;
      let screenOk = true;
      for (const [u, v] of screenParameters) {
        const p = barycentric(a, b, c, u, v);
        tests += 2;
        const plus = [p[0] + direction[0] * epsilon, p[1] + direction[1] * epsilon, p[2] + direction[2] * epsilon];
        if (!insideProven(bvh, mesh, plus, ignore)) {
          screenOk = false;
          break;
        }
        const minus = [p[0] - direction[0] * epsilon, p[1] - direction[1] * epsilon, p[2] - direction[2] * epsilon];
        if (!insideProven(bvh, mesh, minus, ignore)) {
          screenOk = false;
          break;
        }
      }
      if (!screenOk) {
        patchRefused++;
        refusedOutside++;
        continue;
      }
      let refinedOk = true;
      for (const [u, v] of refined) {
        const p = barycentric(a, b, c, u, v);
        tests += 2;
        const plus = [p[0] + direction[0] * epsilon, p[1] + direction[1] * epsilon, p[2] + direction[2] * epsilon];
        const minus = [p[0] - direction[0] * epsilon, p[1] - direction[1] * epsilon, p[2] - direction[2] * epsilon];
        if (!insideProven(bvh, mesh, plus, ignore) || !insideProven(bvh, mesh, minus, ignore)) {
          refinedOk = false;
          break;
        }
      }
      if (!refinedOk) {
        patchAmbiguous++;
        ambiguous++;
        continue;
      }
      excluded.add(faceId);
      excludedFaces++;
      excludedArea += area;
      patchExcluded.push(faceId);
      provenBothSides++;
    }
    const excludedBounds = () => {
      if (!patchExcluded.length) return null;
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (const id of patchExcluded)
        for (let k = 0; k < 3; k++) {
          for (let corner = 0; corner < 3; corner++) {
            const value = mesh.verts[mesh.triangles[id * 3 + corner] * 3 + k];
            min[k] = Math.min(min[k], value);
            max[k] = Math.max(max[k], value);
          }
        }
      return { min, max };
    };
    if (excludedFaces)
      regions.push({
        patchId: patch.id,
        normal: patch.normal,
        offset: patch.offset,
        planePoint: patch.planePoint,
        area: patch.area,
        excludedArea,
        excludedFaces,
        faces: patch.faces.length,
        ratio: excludedArea / patch.area,
        refusedFaces: patchRefused,
        ambiguousFaces: patchAmbiguous,
        bounds: patch.bounds,
        excludedBounds: excludedBounds(),
      });
    else if (patchRefused || patchAmbiguous)
      regions.push({
        patchId: patch.id,
        normal: patch.normal,
        offset: patch.offset,
        planePoint: patch.planePoint,
        area: patch.area,
        excludedArea: 0,
        excludedFaces: 0,
        faces: patch.faces.length,
        ratio: 0,
        refusedFaces: patchRefused,
        ambiguousFaces: patchAmbiguous,
        bounds: patch.bounds,
      });
  }

  const triangles = [];
  for (let f = 0; f < count; f++) {
    if (excluded.has(f)) continue;
    triangles.push(mesh.triangles[f * 3], mesh.triangles[f * 3 + 1], mesh.triangles[f * 3 + 2]);
  }
  const reference = { verts: [...mesh.verts], triangles };
  const excludedArea = [...excluded].reduce((sum, f) => sum + faceAt(mesh, f).area, 0);
  const excludedBounds = (() => {
    if (!excluded.size) return null;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const f of excluded)
      for (let k = 0; k < 3; k++)
        for (let corner = 0; corner < 3; corner++) {
          const value = mesh.verts[mesh.triangles[f * 3 + corner] * 3 + k];
          min[k] = Math.min(min[k], value);
          max[k] = Math.max(max[k], value);
        }
    return { min, max };
  })();
  const keptRegionArea = regions
    .filter((r) => r.excludedArea === 0)
    .reduce((sum, r) => sum + r.area, 0);

  return {
    reference,
    report: {
      method: OUTER_SKIN_METHOD,
      budgetMm: options.budget ?? OUTER_SKIN_BUDGET_MM,
      epsilon,
      refineLevel,
      planarPatches: patches.length,
      degenerateFaces: degenerate,
      excludedFaces: excluded.size,
      excludedFaceIds: [...excluded].sort((a, b) => a - b),
      excludedArea,
      excludedBounds,
      referenceFaces: triangles.length / 3,
      provenFaces: provenBothSides,
      refusedFaces: refusedOutside,
      ambiguousFaces: ambiguous,
      proven: excluded.size > 0,
      ambiguousArea: keptRegionArea,
      excludedRegionCount: regions.filter((r) => r.excludedArea > 0).length,
      regions,
      rule:
        'Ausgeschlossen wird nur ein Dreieck einer erkannten ebenen Zone, dessen Schwerpunkt und dessen Innenpunkte auf beiden Seiten der Fläche mit allen fünf festen Strahlrichtungen belegt im Material liegen. Grenz-, Außen- und mehrdeutige Dreiecke bleiben Referenz.',
    },
  };
}

export function createSeededRandom(seed) {
  let state = (Number.isFinite(seed) ? Math.floor(seed) : OUTER_SKIN_SEED) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Area-weighted, seeded surface sampling; the same seed reproduces the same points. */
export function sampleSurfacePoints(mesh, count, seed = OUTER_SKIN_SEED) {
  const faces = validateMesh(mesh, 'Stichprobe');
  if (!Number.isSafeInteger(count) || count < 1 || count > 500000)
    fail('Stichprobenzahl muss zwischen 1 und 500.000 liegen.', 'MESH_OUTER_SKIN_INPUT');
  const cumulative = new Float64Array(faces);
  let total = 0;
  for (let f = 0; f < faces; f++) {
    total += faceAt(mesh, f).area;
    cumulative[f] = total;
  }
  if (!(total > 0)) fail('Stichprobe benötigt eine Fläche größer null.', 'MESH_OUTER_SKIN_INPUT');
  const random = createSeededRandom(seed);
  const points = new Float64Array(count * 3);
  for (let i = 0; i < count; i++) {
    const target = random() * total;
    let lo = 0;
    let hi = faces - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const { a, b, c } = faceAt(mesh, lo);
    const p = barycentric(a, b, c, random(), random());
    points[i * 3] = p[0];
    points[i * 3 + 1] = p[1];
    points[i * 3 + 2] = p[2];
  }
  return points;
}

export function exactPointTriangleDistance(p, a, b, c) {
  const q = closestTrianglePoint(p, a, b, c);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

function bruteForceDistance(mesh, p) {
  let best = Infinity;
  let triangle = -1;
  for (let f = 0; f < mesh.triangles.length / 3; f++) {
    const a = vertexAt(mesh, mesh.triangles[f * 3]);
    const b = vertexAt(mesh, mesh.triangles[f * 3 + 1]);
    const c = vertexAt(mesh, mesh.triangles[f * 3 + 2]);
    const d = exactPointTriangleDistance(p, a, b, c);
    if (d < best) {
      best = d;
      triangle = f;
    }
  }
  return { distance: best, triangle };
}

/**
 * One directed sampled distance measurement. The `exactWorst` largest sampled
 * distances are re-measured by brute force against every target triangle.
 */
export function measureDirected({
  source,
  target,
  samples,
  seed = OUTER_SKIN_SEED,
  exactWorst = 50,
  budget = OUTER_SKIN_BUDGET_MM,
  insideMaterial = null,
  surfaceEpsilon = 1e-4,
}) {
  validateMesh(source, 'Messquelle');
  validateMesh(target, 'Messziel');
  const points = sampleSurfacePoints(source, samples, seed);
  const tree = createDistanceTree({ vertices: target.verts, triangles: target.triangles });
  const count = points.length / 3;
  let maximum = 0;
  let sum = 0;
  let sumSquared = 0;
  let skipped = 0;
  let skippedMaximum = 0;
  const worst = [];
  for (let i = 0; i < count; i++) {
    const p = [points[i * 3], points[i * 3 + 1], points[i * 3 + 2]];
    const hit = tree.nearest(p);
    const d = hit.distance;
    // Oberflächenpunkte, die belegt im Material der Referenz liegen, gehören
    // nicht zur Außenhaut (z. B. eine im Kandidaten verbliebene Innenwand).
    // Punkte auf der Referenzoberfläche selbst bleiben immer gemessen.
    if (insideMaterial && d > surfaceEpsilon && insideMaterial(p)) {
      skipped++;
      skippedMaximum = Math.max(skippedMaximum, d);
      continue;
    }
    sum += d;
    sumSquared += d * d;
    if (d > maximum) maximum = d;
    if (worst.length < exactWorst || d > worst[worst.length - 1].distance) {
      worst.push({ index: i, point: p, distance: d, triangle: hit.triangleId });
      worst.sort((a, b) => b.distance - a.distance);
      if (worst.length > exactWorst) worst.pop();
    }
  }
  const measured = count - skipped;
  const exact = worst.map((entry) => {
    const brute = bruteForceDistance(target, entry.point);
    return {
      index: entry.index,
      point: entry.point,
      sampledMm: entry.distance,
      exactMm: brute.distance,
      differenceMm: Math.abs(brute.distance - entry.distance),
      triangle: brute.triangle,
    };
  });
  const deviation = exact.reduce((m, entry) => Math.max(m, entry.differenceMm), 0);
  if (deviation > 1e-6)
    fail(
      `Exakter Punkt-zu-Dreieck-Abstand weicht von der Baumessung ab (${deviation} mm).`,
      'MESH_OUTER_SKIN_EXACT',
    );
  return {
    points: count,
    measuredPoints: measured,
    skippedInsideMaterial: skipped,
    skippedMaximumMm: skippedMaximum,
    samples,
    seed,
    maximum,
    mean: measured ? sum / measured : 0,
    rms: measured ? Math.sqrt(sumSquared / measured) : 0,
    exactWorstChecked: exact.length,
    exactMaximumDifferenceMm: deviation,
    worst: exact,
  };
}

export function measureSurfaceDeviation({
  reference,
  candidate,
  samples,
  seed = OUTER_SKIN_SEED,
  exactWorst = 50,
  budget = OUTER_SKIN_BUDGET_MM,
  skipInsideMaterial = true,
  insideScope = null,
}) {
  const referenceBvh = buildRayBvh(reference);
  const insideReference = (point) => insideProven(referenceBvh, reference, point, null);
  const insideMaterial = skipInsideMaterial
    ? (point) => (!insideScope || insideScope(point)) && insideReference(point)
    : null;
  return {
    referenceToCandidate: measureDirected({
      source: reference,
      target: candidate,
      samples,
      seed,
      exactWorst,
    }),
    candidateToReference: measureDirected({
      source: candidate,
      target: reference,
      samples,
      seed,
      exactWorst,
      budget,
      insideMaterial,
    }),
    samplePointsPerDirection: samples,
    seed,
    rule:
      'Referenz→Kandidat misst jede Referenzstichprobe. Kandidat→Referenz übergeht nur Stichproben innerhalb der Nachbarschaft ausgeschlossener Dreiecke, die belegt im Material der Referenz liegen; alles andere wird gemessen.',
  };
}

/**
 * Only candidate surface points within this neighbourhood of an excluded triangle
 * may be treated as internal material. Everything else is measured normally, so a
 * hidden body elsewhere in the part cannot disappear.
 */
export function createExcludedNeighbourhood(
  mesh,
  excludedFaceIds,
  neighbourhood = OUTER_SKIN_EXCLUDED_NEIGHBOURHOOD_MM,
) {
  if (!(neighbourhood >= 0)) fail('Die Ausschluss-Nachbarschaft muss ≥ 0 sein.', 'MESH_OUTER_SKIN_INPUT');
  if (!excludedFaceIds?.length) return () => false;
  const lookup = new Map();
  const verts = [];
  const triangles = [];
  for (const face of excludedFaceIds) {
    for (let corner = 0; corner < 3; corner++) {
      const id = mesh.triangles[face * 3 + corner];
      if (!lookup.has(id)) {
        lookup.set(id, verts.length / 3);
        verts.push(mesh.verts[id * 3], mesh.verts[id * 3 + 1], mesh.verts[id * 3 + 2]);
      }
      triangles.push(lookup.get(id));
    }
  }
  const tree = createDistanceTree({ vertices: verts, triangles });
  return (point) => tree.nearest(point).distance <= neighbourhood;
}

/** Reads an ASCII or binary STL into the mesh shape used by the modules. */
export function parseStl(data) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (buffer.length < 84) fail('STL-Datei ist zu kurz.', 'MESH_OUTER_SKIN_INPUT');
  const head = buffer.subarray(0, Math.min(1024, buffer.length)).toString('latin1');
  const verts = [];
  if (/^\s*solid/.test(head) && /facet\s+normal/.test(head)) {
    const text = buffer.toString('latin1');
    const pattern = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
    let match;
    while ((match = pattern.exec(text))) verts.push(Number(match[1]), Number(match[2]), Number(match[3]));
    if (!verts.length || verts.length % 9) fail('ASCII-STL enthält keine gültigen Dreiecke.', 'MESH_OUTER_SKIN_INPUT');
    return {
      verts,
      triangles: Array.from({ length: verts.length / 3 }, (_, i) => i),
      triangleCount: verts.length / 9,
      format: 'ascii',
    };
  }
  const count = buffer.readUInt32LE(80);
  if (!count || buffer.length < 84 + count * 50)
    fail('Binär-STL ist abgeschnitten oder leer.', 'MESH_OUTER_SKIN_INPUT');
  for (let i = 0; i < count; i++) {
    const offset = 84 + i * 50 + 12;
    for (let k = 0; k < 3; k++) {
      const p = offset + k * 12;
      verts.push(buffer.readFloatLE(p), buffer.readFloatLE(p + 4), buffer.readFloatLE(p + 8));
    }
  }
  return {
    verts,
    triangles: Array.from({ length: verts.length / 3 }, (_, i) => i),
    triangleCount: count,
    format: 'binary',
  };
}

const summaryOf = (measurement) => ({
  maximum: measurement.referenceToCandidate.maximum,
  reverse: measurement.candidateToReference.maximum,
  worst: Math.max(measurement.referenceToCandidate.maximum, measurement.candidateToReference.maximum),
  mean: (measurement.referenceToCandidate.mean + measurement.candidateToReference.mean) / 2,
  skippedInsideMaterial: measurement.candidateToReference.skippedInsideMaterial,
  exactMaximumDifferenceMm: Math.max(
    measurement.referenceToCandidate.exactMaximumDifferenceMm,
    measurement.candidateToReference.exactMaximumDifferenceMm,
  ),
  worstPoints: [
    ...measurement.referenceToCandidate.worst.slice(0, 3).map((e) => ({ ...e, direction: 'reference-to-candidate' })),
    ...measurement.candidateToReference.worst.slice(0, 3).map((e) => ({ ...e, direction: 'candidate-to-reference' })),
  ],
});

/**
 * Full admission run: raw STL comparison and outer-skin comparison at every
 * requested sample count. Without a proven exclusion zone the raw comparison
 * decides (no silent exclusion).
 */
export function evaluateOuterSkin({
  original,
  candidate,
  samples = [24000, 48000, 96000],
  seed = OUTER_SKIN_SEED,
  budget = OUTER_SKIN_BUDGET_MM,
  exactWorst = 50,
  skinOptions = {},
  excludedNeighbourhood = OUTER_SKIN_EXCLUDED_NEIGHBOURHOOD_MM,
}) {
  const { reference, report } = buildOuterSkinReference(original, { budget, ...skinOptions });
  // Ohne belegten Ausschluss wird nichts übersprungen; sonst nur Punkte in der
  // Nachbarschaft der ausgeschlossenen Dreiecke.
  const insideScope = report.proven
    ? createExcludedNeighbourhood(original, report.excludedFaceIds, excludedNeighbourhood)
    : null;
  const runs = [];
  for (const count of samples) {
    const raw = measureSurfaceDeviation({
      reference: original,
      candidate,
      samples: count,
      seed,
      exactWorst,
      budget,
      skipInsideMaterial: false,
    });
    const skin = measureSurfaceDeviation({
      reference,
      candidate,
      samples: count,
      seed,
      exactWorst,
      budget,
      skipInsideMaterial: report.proven,
      insideScope,
    });
    runs.push({ samples: count, raw: summaryOf(raw), skin: summaryOf(skin) });
  }
  const maxima = (key) => runs.map((run) => (key === 'raw' ? run.raw : run.skin).worst);
  const decidedBy = report.proven ? 'outer-skin' : 'raw';
  const decided = maxima(decidedBy);
  const verdicts = runs.map((run) => {
    const value = decidedBy === 'raw' ? run.raw.worst : run.skin.worst;
    return { samples: run.samples, maximum: value, passed: value <= budget };
  });
  return {
    budget,
    seed,
    decidedBy,
    proven: report.proven,
    excludedNeighbourhoodMm: report.proven ? excludedNeighbourhood : null,
    insideSkipScope: report.proven ? 'excluded-neighbourhood' : 'none',
    passed: verdicts.every((v) => v.passed),
    runs,
    spread: { raw: Math.max(...maxima('raw')) - Math.min(...maxima('raw')), skin: Math.max(...maxima('skin')) - Math.min(...maxima('skin')) },
    verdicts,
    report,
    referenceFaces: reference.triangles.length / 3,
  };
}
