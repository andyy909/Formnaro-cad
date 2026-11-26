// R02: build one native arm-head sketch from a measured R01 section, extrude it
// over the independently measured arm thickness and compare it with a retained
// section. Pure geometry; the CAD kernel is passed in like the other mesh tools.
import { meshContourGeometry as g } from './mesh-lid.js';
import { meshSectionContours, planePointToWorld, worldPointToPlane } from './mesh-section-contours.js';
import { resolveSketchProfile } from './sketch-profile.js';
import { sketchExpression } from './sketch-expression.js';
import { projectObjectGeometryDigest } from './project-objects.js';

export const ARM_HEAD_LIMITS = Object.freeze({
  // Support points must lie on the disclosed measurement plane.
  planeTolerance: 1e-6,
  // R01 evidence stores world points at 1e-3 mm; the 2D points keep full precision.
  sourceTolerance: 2e-3,
  // Manifold returns float32 meshes; keep a matching slack for the body proof.
  thicknessTolerance: 1e-4,
  locationTolerance: 1e-4,
  // The section was approximated by native lines/arcs within the default
  // section fit tolerance (0.02 mm). The retained section is compared at that
  // same budget, never wider.
  contourBudget: 0.02,
  maxElements: 128,
});

const fail = (message, code = 'ARM_HEAD') => {
  throw Object.assign(Error(message), { code });
};
const dot = (a, b) => a.reduce((sum, v, k) => sum + v * b[k], 0);
const sub = (a, b) => a.map((v, k) => v - b[k]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(...a);
const negative = (a) => a.map((v) => -v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e6;
const vector = (v, n = 3) => Array.isArray(v) && v.length === n && v.every(finite);
function pair(value, what = 'Punkt') {
  if (!vector(value, 2)) fail(what + ' benötigt zwei endliche Koordinaten.', 'ARM_HEAD_PROFILE');
  return [value[0], value[1]];
}
function frameParts(frame) {
  if (!Array.isArray(frame) || frame.length !== 16 || !frame.every(finite))
    fail('Der gemessene Ebenenrahmen fehlt oder ist ungültig.', 'ARM_HEAD_FRAME');
  const u = frame.slice(0, 3),
    v = frame.slice(4, 7),
    n = frame.slice(8, 11),
    origin = frame.slice(12, 15);
  if (
    Math.abs(norm(u) - 1) > 1e-6 ||
    Math.abs(norm(v) - 1) > 1e-6 ||
    Math.abs(norm(n) - 1) > 1e-6 ||
    Math.abs(dot(u, v)) > 1e-6
  )
    fail('Der Ebenenrahmen ist nicht orthonormal.', 'ARM_HEAD_FRAME');
  if (norm(sub(cross(u, v), n)) > 1e-6)
    fail('Der Ebenenrahmen ist nicht rechtshändig zur gemessenen Normale.', 'ARM_HEAD_FRAME');
  return { u, v, n, origin, frame: [...frame] };
}
// R01 evidence stores the frame as named axes, live sections as a 4x4 matrix.
function readFrame(value) {
  if (Array.isArray(value)) return frameParts(value);
  if (value && typeof value === 'object' && vector(value.uAxis) && vector(value.vAxis) && vector(value.normal) && vector(value.origin))
    return frameParts([...value.uAxis, 0, ...value.vAxis, 0, ...value.normal, 0, ...value.origin, 1]);
  fail('Der gemessene Ebenenrahmen fehlt oder ist ungültig.', 'ARM_HEAD_FRAME');
}
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const uniqueKey = (p) => p.map((v) => v.toPrecision(15)).join(',');

/** Convert the closed R01 arm-head profile into exactly one native profile sketch.
 * Support points are checked against the measured plane and, when R01 stored
 * world points, against that source evidence. Unknown/open segments are marked. */
export function armHeadSketch(profile, { height = 1, name = 'Armkopf' } = {}) {
  if (!profile || typeof profile !== 'object') fail('Gemessenes Armprofil fehlt.', 'ARM_HEAD_PROFILE');
  const sourceFrame = profile.frame ?? profile.plane?.frame,
    status =
      profile.status ?? (profile.complete === false || profile.closed === false ? 'incomplete' : 'complete');
  const open = profile.openProfile ?? null,
    closed = status === 'complete' && profile.closed !== false && profile.complete !== false,
    complete = closed && !!profile.outerProfile;
  if (!complete || !profile.outerProfile) {
    return {
      version: 1,
      kind: 'armHeadSketch',
      name,
      status: 'incomplete',
      complete: false,
      plane: sourceFrame
        ? (() => {
            const parts = readFrame(sourceFrame);
            return { origin: parts.origin, uAxis: parts.u, vAxis: parts.v, normal: parts.n, frame: parts.frame };
          })()
        : null,
      sketch: null,
      area: null,
      supportPoints: null,
      uncertainSegments: [
        {
          scope: open?.role ?? 'outer',
          status: 'incomplete',
          closed: false,
          reason: open?.uncertainty ?? profile.uncertainty ?? 'Offener oder unterbrochener Schnitt ohne geschlossene Außenkontur.',
        },
      ],
      limitations:
        'Unvollständige Schnitte ergeben keine native Skizze. Die offenen Abschnitte bleiben ausgewiesen und werden nicht durch eine angenommene Kontur geschlossen.',
    };
  }
  const plane = readFrame(sourceFrame),
    outer = profile.outerProfile,
    ids = new Set(),
    elements = [],
    uncertainSegments = [],
    variables = [],
    loops = [];
  if (!Array.isArray(outer.elements) || !outer.elements.length)
    fail('Das gemessene Außenprofil enthält keine Elemente.', 'ARM_HEAD_PROFILE');
  const nativeElement = (element, fallbackId) => {
    if (!element || typeof element !== 'object') fail('Ungültiges Profilelement im Armprofil.', 'ARM_HEAD_PROFILE');
    const id = typeof element.id === 'string' && element.id ? element.id : fallbackId;
    if (!id || id.length > 100 || ids.has(id)) fail('Ungültige oder doppelte Elementkennung im Armprofil.', 'ARM_HEAD_PROFILE');
    ids.add(id);
    if (element.type === 'line')
      return { id, type: 'line', start: pair(element.start, 'Linienstart'), end: pair(element.end, 'Linienende'), construction: false };
    if (element.type === 'arc')
      return {
        id,
        type: 'arc',
        start: pair(element.start, 'Bogenstart'),
        through: pair(element.through, 'Bogenmitte'),
        end: pair(element.end, 'Bogenende'),
        construction: false,
      };
    if (element.type === 'circle') return { id, type: 'circle', center: pair(element.center, 'Kreismittelpunkt'), diameter: element.diameter, construction: false };
    fail('Nicht unterstütztes Profilelement: ' + String(element?.type ?? 'unbekannt'), 'ARM_HEAD_PROFILE');
  };
  const rememberBound = (loop, loopId, role, ids2, fallbackBound) => {
    const bound = Number.isFinite(loop.fitErrorBound) ? loop.fitErrorBound : fallbackBound;
    if (Number.isFinite(bound) && bound > 1e-9)
      uncertainSegments.push({
        scope: loopId,
        role,
        elements: ids2,
        fitErrorBound: Number(bound.toFixed(6)),
        reason: 'Gemessene Polyline, innerhalb der Schnitttoleranz durch native Elemente angenähert.',
      });
  };
  const outerElements = outer.elements.map((element, i) => nativeElement(element, 's0e' + i));
  elements.push(...outerElements);
  loops.push({ id: 'aussen', role: 'outer', elements: outerElements.map((element) => element.id) });
  rememberBound(outer, 'aussen', 'outer', outerElements.map((element) => element.id), outer.fitErrorBound);
  const holes = [];
  if (Array.isArray(profile.innerLoops) && profile.innerLoops.length) {
    for (const [index, loop] of profile.innerLoops.filter((item) => item.role === 'hole').entries()) {
      const loopId = 'bohrung-' + index,
        holeElements = (loop.elements ?? []).map((element, i) => nativeElement(element, 's' + (index + 1) + 'e' + i));
      if (!holeElements.length) continue;
      holes.push({ id: loopId, role: 'hole', elements: holeElements.map((element) => element.id) });
      elements.push(...holeElements);
      rememberBound(loop, loopId, 'hole', holeElements.map((element) => element.id), loop.fitErrorBound);
    }
  }
  if (!holes.length && Array.isArray(profile.innerCircles)) {
    for (const [index, circle] of profile.innerCircles.entries()) {
      const loopId = 'bohrung-' + index,
        center = circle.planeCenter
          ? pair(circle.planeCenter, 'Bohrungsmittelpunkt')
          : worldPointToPlane(circle.center, plane.frame),
        element = nativeElement(
          { id: 's' + (Number.isInteger(circle.index) ? circle.index : index + 1) + 'e0', type: 'circle', center, diameter: circle.diameter },
          's' + (index + 1) + 'e0',
        );
      holes.push({ id: loopId, role: 'hole', elements: [element.id] });
      elements.push(element);
      rememberBound(circle, loopId, 'hole', [element.id], circle.fitErrorBound);
    }
  }
  loops.push(...holes);
  if (elements.length > ARM_HEAD_LIMITS.maxElements)
    fail('Das Armprofil überschreitet ' + ARM_HEAD_LIMITS.maxElements + ' native Elemente.', 'ARM_HEAD_SKETCH');
  let circleIndex = 0;
  for (const element of elements.filter((item) => item.type === 'circle')) {
    const diameter = Number(element.diameter);
    if (!(diameter >= 0.01 && diameter <= 10000))
      fail('Gemessener Bohrungsdurchmesser liegt außerhalb 0,01–10.000 mm.', 'ARM_HEAD_PROFILE');
    const variable = elements.filter((item) => item.type === 'circle').length === 1 ? 'armkopf_bohrung' : 'armkopf_bohrung_' + ++circleIndex;
    variables.push({ name: variable, value: String(diameter) });
    element.diameter = variable;
  }
  if (!(Number(height) >= 0.01 && Number(height) <= 10000))
    fail('Die Platzhalterhöhe der Skizze muss 0,01–10.000 mm betragen.', 'ARM_HEAD_SKETCH');
  const sketch = { version: 2, kind: 'profile', variables, dimensions: { height: String(height) }, elements, loops };
  let resolved;
  try {
    resolved = resolveSketchProfile(sketch, sketchExpression);
  } catch (error) {
    fail('Das gemessene Armprofil ergibt keine gültige native Skizze: ' + error.message, 'ARM_HEAD_SKETCH');
  }
  const supportPoints = [],
    seen = new Set();
  for (const element of elements) {
    const points = element.type === 'line' ? [element.start, element.end] : element.type === 'arc' ? [element.start, element.through, element.end] : [element.center];
    for (const point of points) {
      const key = uniqueKey(point);
      if (seen.has(key)) continue;
      seen.add(key);
      supportPoints.push(point);
    }
  }
  const measuredPoint = profile.measurementPlanePoint ?? profile.cut?.actualPlanePoint ?? plane.origin;
  if (!vector(measuredPoint)) fail('Der gemessene Ebenenpunkt fehlt.', 'ARM_HEAD_FRAME');
  let maxPlaneDistance = 0;
  for (const point of supportPoints)
    maxPlaneDistance = Math.max(maxPlaneDistance, Math.abs(dot(sub(planePointToWorld(point, plane.frame), measuredPoint), plane.n)));
  if (maxPlaneDistance > ARM_HEAD_LIMITS.planeTolerance)
    fail(
      'Stützpunkte liegen nach Rückrechnung nicht in der gemessenen Ebene (' + maxPlaneDistance.toFixed(9) + ' mm).',
      'ARM_HEAD_PLANE',
    );
  let maxSourceDistance = null,
    sourcePointCount = null;
  if (Array.isArray(outer.points2D) && Array.isArray(outer.pointsWorld) && outer.points2D.length === outer.pointsWorld.length) {
    sourcePointCount = outer.pointsWorld.length;
    maxSourceDistance = 0;
    for (let i = 0; i < outer.points2D.length; i++)
      maxSourceDistance = Math.max(maxSourceDistance, norm(sub(planePointToWorld(outer.points2D[i], plane.frame), outer.pointsWorld[i])));
    if (maxSourceDistance > ARM_HEAD_LIMITS.sourceTolerance)
      fail('Rückgerechnete Stützpunkte weichen von den R01-Weltpunkten ab (' + maxSourceDistance.toFixed(6) + ' mm).', 'ARM_HEAD_SOURCE');
  }
  return {
    version: 1,
    kind: 'armHeadSketch',
    name,
    status: 'complete',
    complete: true,
    plane: { origin: plane.origin, uAxis: plane.u, vAxis: plane.v, normal: plane.n, frame: plane.frame },
    sketch: resolved.sketch,
    area: resolved.area,
    supportPoints: {
      count: supportPoints.length,
      points2D: supportPoints,
      maxPlaneDistance,
      maxSourceDistance,
      sourcePointCount,
    },
    uncertainSegments,
    limitations:
      'Eine native Skizze auf der gemessenen Ebene. Der offene Schnittanteil ist ausgewiesen; die Platzhalterhöhe 1 mm wird erst mit der gemessenen Armdicke ersetzt. Keine Formgarantie zwischen den Schnitten.',
  };
}

// --- measurement and body ---------------------------------------------------

function insideMaterial(outer, holes, point) {
  return g.contains(outer, point) && !holes.some((hole) => g.contains(hole, point));
}
function polygonBounds(polygon) {
  let min = [Infinity, Infinity],
    max = [-Infinity, -Infinity];
  for (const point of polygon) {
    min = min.map((v, k) => Math.min(v, point[k]));
    max = max.map((v, k) => Math.max(v, point[k]));
  }
  return { min, max };
}
function rayTriangle(origin, direction, a, b, c) {
  const e1 = sub(b, a),
    e2 = sub(c, a),
    p = cross(direction, e2),
    det = dot(e1, p);
  if (Math.abs(det) < 1e-12) return null;
  const inverse = 1 / det,
    tvec = sub(origin, a),
    u = dot(tvec, p) * inverse;
  if (u < -1e-9 || u > 1 + 1e-9) return null;
  const q = cross(tvec, e1),
    v = dot(direction, q) * inverse;
  if (v < -1e-9 || u + v > 1 + 1e-9) return null;
  const t = dot(e2, q) * inverse;
  return t > 1e-7 ? t : null;
}
function createRayIndex(points, indices, plane, bounds) {
  const cells = 32,
    cell = [
      Math.max(1e-9, (bounds.max[0] - bounds.min[0]) / cells),
      Math.max(1e-9, (bounds.max[1] - bounds.min[1]) / cells),
    ],
    grid = new Map(),
    project = (point) => {
      const delta = sub(point, plane.origin);
      return [dot(delta, plane.uAxis), dot(delta, plane.vAxis)];
    },
    cellOf = (point) => [
      Math.min(cells - 1, Math.max(0, Math.floor((point[0] - bounds.min[0]) / cell[0]))),
      Math.min(cells - 1, Math.max(0, Math.floor((point[1] - bounds.min[1]) / cell[1]))),
    ];
  for (let t = 0; t < indices.length; t += 3) {
    const a = project(points[indices[t]]),
      b = project(points[indices[t + 1]]),
      c = project(points[indices[t + 2]]);
    if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 1e-12) continue;
    const lo = [Math.min(a[0], b[0], c[0]), Math.min(a[1], b[1], c[1])],
      hi = [Math.max(a[0], b[0], c[0]), Math.max(a[1], b[1], c[1])],
      [i0, j0] = cellOf(lo),
      [i1, j1] = cellOf(hi);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const key = i + ',' + j;
        let list = grid.get(key);
        if (!list) {
          list = [];
          grid.set(key, list);
        }
        list.push(t);
      }
  }
  return (origin, direction) => {
    const [i, j] = cellOf(project(origin)),
      list = grid.get(i + ',' + j) ?? [];
    let best = Infinity;
    for (const t of list) {
      const hit = rayTriangle(origin, direction, points[indices[t]], points[indices[t + 1]], points[indices[t + 2]]);
      if (hit !== null && hit < best) best = hit;
    }
    return best === Infinity ? null : best;
  };
}

/** Independently measure the arm wall along the measured normal. Rays through a
 * raster of material points on the measured plane; the dominant near/far class
 * is the arm thickness. Bosses, plates and neighbouring arms fall out of the
 * dominant class instead of being averaged into it. */
export function measureArmThickness(node, prepared, { samples = 24, probe, rounding = 0.001 } = {}) {
  if (prepared?.kind !== 'armHeadSketch' || prepared.status !== 'complete' || !prepared.sketch)
    fail('Zuerst eine vollständige native Armkopfskizze aus dem gemessenen Profil aufbauen.', 'ARM_HEAD_SKETCH');
  const plane = prepared.plane,
    resolved = resolveSketchProfile(prepared.sketch, sketchExpression),
    outer = resolved.polygons[0],
    holes = resolved.polygons.slice(1),
    bounds = polygonBounds(outer);
  if (!outer || outer.length < 3) fail('Die native Armkontur besitzt keine Fläche.', 'ARM_HEAD_SKETCH');
  let probes = [];
  if (probe) {
    const point = pair(probe, 'Messpunkt');
    if (!insideMaterial(outer, holes, point)) fail('Der Messpunkt liegt nicht im Armmaterial.', 'ARM_HEAD_THICKNESS');
    probes = [point];
  } else {
    const steps = Math.max(4, Math.min(64, Math.floor(samples)));
    for (let i = 0; i < steps; i++)
      for (let j = 0; j < steps; j++) {
        const point = [
          bounds.min[0] + ((i + 0.5) / steps) * (bounds.max[0] - bounds.min[0]),
          bounds.min[1] + ((j + 0.5) / steps) * (bounds.max[1] - bounds.min[1]),
        ];
        if (insideMaterial(outer, holes, point)) probes.push(point);
      }
  }
  if (!probes.length) fail('Im Armmaterial ließ sich kein Messpunkt finden.', 'ARM_HEAD_THICKNESS');
  const source = g.source(node),
    firstHit = createRayIndex(source.points, source.indices, plane, bounds),
    hits = [];
  for (const point of probes) {
    const world = planePointToWorld(point, plane.frame),
      forward = firstHit(world, plane.normal),
      backward = firstHit(world, negative(plane.normal));
    if (forward === null || backward === null) continue;
    if (!(forward > 0) || !(backward > 0)) continue;
    hits.push({ point, near: -backward, far: forward });
  }
  if (hits.length < (probe ? 1 : 3)) fail('Die Armdicke ist an dieser Stelle nicht eindeutig messbar.', 'ARM_HEAD_THICKNESS');
  const bins = new Map();
  for (const hit of hits) {
    const key = Math.round(hit.near / rounding) + '/' + Math.round(hit.far / rounding),
      bin = bins.get(key) ?? { near: [], far: [], points: [] };
    bins.set(key, bin);
    bin.near.push(hit.near);
    bin.far.push(hit.far);
    bin.points.push(hit.point);
  }
  const ranked = [...bins.values()]
    .map((bin) => ({ near: median(bin.near), far: median(bin.far), count: bin.near.length, points: bin.points }))
    .sort((a, b) => b.count - a.count || a.near - b.near);
  const winner = ranked[0],
    thickness = winner.far - winner.near;
  if (!(thickness >= 0.01 && thickness <= 10000))
    fail('Die gemessene Armdicke liegt außerhalb 0,01–10.000 mm.', 'ARM_HEAD_THICKNESS');
  if (!(winner.near < -ARM_HEAD_LIMITS.locationTolerance && winner.far > ARM_HEAD_LIMITS.locationTolerance))
    fail('Die Messebene liegt nicht im gemessenen Armmaterial. Anderen Arm oder andere Messebene wählen.', 'ARM_HEAD_THICKNESS');
  return {
    version: 1,
    kind: 'armHeadThickness',
    near: winner.near,
    far: winner.far,
    thickness,
    normal: [...plane.normal],
    origin: [...plane.origin],
    probe: { point2D: winner.points[Math.floor(winner.points.length / 2)], near: winner.near, far: winner.far },
    probes: {
      sampled: probes.length,
      measured: hits.length,
      dominant: winner.count,
      share: winner.count / hits.length,
      classes: ranked.length,
    },
    distribution: ranked.slice(0, 3).map((bin) => ({ near: bin.near, far: bin.far, thickness: bin.far - bin.near, count: bin.count })),
    method: 'Strahl entlang der gemessenen Ebenennormale durch Rasterpunkte im Armmaterial; häufigste Wanddicke, Median der Klasse.',
    independent: true,
  };
}

function validateMeasured(measured) {
  if (!measured || !finite(measured.near) || !finite(measured.far) || !(measured.far > measured.near))
    fail('Gemessene Armlage (near/far) fehlt oder ist ungültig.', 'ARM_HEAD_THICKNESS');
  const thickness = measured.far - measured.near;
  if (!(thickness >= 0.01 && thickness <= 10000))
    fail('Gemessene Armdicke liegt außerhalb 0,01–10.000 mm.', 'ARM_HEAD_THICKNESS');
  if (measured.normal !== undefined && (!vector(measured.normal) || norm(measured.normal) <= 1e-9))
    fail('Gemessene Normale ist ungültig.', 'ARM_HEAD_THICKNESS');
  const normal = measured.normal === undefined ? null : measured.normal;
  return { near: measured.near, far: measured.far, thickness, normal };
}

function bodyNormalSpan(body) {
  const { origin, normal } = body.plane,
    mesh = body.mesh;
  let min = Infinity,
    max = -Infinity;
  for (let i = 0; i < mesh.verts.length; i += 3) {
    const offset = dot(sub([mesh.verts[i], mesh.verts[i + 1], mesh.verts[i + 2]], origin), normal);
    min = Math.min(min, offset);
    max = Math.max(max, offset);
  }
  return { near: min, far: max, thickness: max - min };
}

function measuredCutPlanes(cuts = []) {
  if (!Array.isArray(cuts) || cuts.length > ARM_HEAD_LIMITS.maxElements)
    fail('Die gemessenen Beschnitte sind ungültig.', 'ARM_HEAD_CUT');
  return cuts.map((cut) => {
    const { normal, point } = cut ?? {};
    if (!vector(normal) || !vector(point) || Math.abs(norm(normal) - 1) > 1e-6)
      fail('Ein gemessener Beschnitt benötigt einen Ebenenpunkt und eine Einheitsnormale zur erhaltenen Seite.', 'ARM_HEAD_CUT');
    return { normal: [...normal], point: [...point] };
  });
}

/** Extrude the single native arm-head sketch along the measured normal over the
 * independently measured near/far span. The saved body keeps its editable sketch. */
export function buildArmHeadBody(kernel, prepared, { measured, source, cuts, name = 'Armkopf' } = {}) {
  if (!kernel?.Manifold?.extrude) fail('Der native CAD-Kern fehlt.', 'ARM_HEAD_KERNEL');
  if (prepared?.kind !== 'armHeadSketch' || prepared.status !== 'complete' || !prepared.sketch)
    fail('Zuerst eine vollständige native Armkopfskizze aus dem gemessenen Profil aufbauen.', 'ARM_HEAD_SKETCH');
  const plane = prepared.plane,
    span = validateMeasured(measured),
    height = span.thickness,
    sketch = structuredClone(prepared.sketch);
  sketch.dimensions = { ...sketch.dimensions, height: String(height) };
  const cutPlanes = measuredCutPlanes(cuts);
  const resolved = resolveSketchProfile(sketch, sketchExpression);
  let solid = kernel.Manifold.extrude(resolved.polygons, height, 0, 0, [1, 1], false);
  let volume, mesh;
  try {
    const base = plane.origin.map((value, index) => value + span.near * plane.normal[index]);
    for (const { normal, point } of cutPlanes) {
      const localNormal = [plane.uAxis, plane.vAxis, plane.normal].map((axis) => dot(normal, axis));
      const clipped = solid.trimByPlane(localNormal, dot(normal, sub(point, base)));
      solid.delete();
      solid = clipped;
    }
    if (solid.isEmpty() || solid.status() !== 'NoError' || !(solid.volume() > 0))
      fail('Die extrudierte Armkopfskizze ergibt keinen geschlossenen Körper.', 'ARM_HEAD_BODY');
    volume = solid.volume();
    const raw = solid.getMesh(),
      verts = [],
      numProp = raw.numProp ?? 3;
    for (let i = 0; i < raw.vertProperties.length; i += numProp) {
      const u = raw.vertProperties[i],
        v = raw.vertProperties[i + 1],
        w = span.near + raw.vertProperties[i + 2];
      verts.push(
        plane.origin[0] + u * plane.uAxis[0] + v * plane.vAxis[0] + w * plane.normal[0],
        plane.origin[1] + u * plane.uAxis[1] + v * plane.vAxis[1] + w * plane.normal[1],
        plane.origin[2] + u * plane.uAxis[2] + v * plane.vAxis[2] + w * plane.normal[2],
      );
    }
    mesh = { verts, triangles: Array.from(raw.triVerts) };
  } finally {
    solid.delete();
  }
  const body = {
    version: 1,
    kind: 'armHeadBody',
    name,
    status: 'complete',
    plane: structuredClone(plane),
    sketch,
    extrusion: { near: span.near, far: span.far, thickness: height, direction: [...plane.normal] },
    measured: {
      near: span.near,
      far: span.far,
      thickness: height,
      normal: span.normal ? [...span.normal] : [...plane.normal],
      origin: [...plane.origin],
    },
    ...(cutPlanes.length ? { cuts: cutPlanes } : {}),
    source: source ? { geometryDigest: projectObjectGeometryDigest(source) } : null,
    mesh,
    volume,
    report: null,
  };
  const actual = bodyNormalSpan(body);
  body.report = {
    bodyNear: actual.near,
    bodyFar: actual.far,
    bodyThickness: actual.thickness,
    spanDeviation: Math.max(Math.abs(actual.near - span.near), Math.abs(actual.far - span.far)),
  };
  return body;
}

export function armHeadBodyNode(body, { id = 'armkopf-koerper', name = 'Armkopf' } = {}) {
  if (body?.kind !== 'armHeadBody' || !body.mesh) fail('Kein gespeicherter Armkörper.', 'ARM_HEAD_BODY');
  return {
    id,
    kind: 'mesh',
    name,
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    meshRole: 'solid',
    color: '#7ba8bf',
    opacity: 1,
    hidden: false,
    locked: false,
    metadata: { notes: 'R02 Armkopf aus gemessener Kontur' },
    mesh: { verts: [...body.mesh.verts], triangles: [...body.mesh.triangles] },
  };
}

function transformedBounds(node) {
  const mesh = node?.mesh,
    matrix = node?.transform ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  if (!mesh?.verts?.length) return null;
  let min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.verts.length; i += 3) {
    const x = mesh.verts[i],
      y = mesh.verts[i + 1],
      z = mesh.verts[i + 2],
      world = [
        matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
        matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
        matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
      ];
    min = min.map((v, k) => Math.min(v, world[k]));
    max = max.map((v, k) => Math.max(v, world[k]));
  }
  return { min, max };
}

/** Spatial proof of the reconstructed arm: the body must sit at the chosen arm's
 * independently measured near/far span, keep the measured thickness, lie inside
 * the source part and keep the measured normal direction. A reversed normal or a
 * wrong arm therefore fails here even when the sketch itself is valid. */
export function checkArmHeadBody(body, { measured = body?.measured, source } = {}) {
  if (body?.kind !== 'armHeadBody' || !body.mesh) fail('Kein gespeicherter Armkörper.', 'ARM_HEAD_BODY');
  const span = validateMeasured(measured),
    actual = bodyNormalSpan(body),
    tolerance = ARM_HEAD_LIMITS.locationTolerance,
    checks = [];
  const check = (id, label, expected, value) => {
    const deviation = typeof expected === 'number' && typeof value === 'number' ? Math.abs(expected - value) : null;
    const ok = typeof expected === 'number' && typeof value === 'number' ? deviation <= tolerance : expected === value;
    checks.push({ id, label, expected, actual: value, deviation, ok });
  };
  check('lage-vorne', 'Vordere Armlage (Ist/Soll)', span.near, actual.near);
  check('lage-hinten', 'Hintere Armlage (Ist/Soll)', span.far, actual.far);
  check('dicke', 'Armdicke (Ist/Soll)', span.thickness, actual.thickness);
  check('ebene-im-arm', 'Messebene liegt im gemessenen Arm', true, span.near < -tolerance && span.far > tolerance);
  if (span.normal) {
    const alignment = dot(span.normal, body.plane.normal) / (norm(span.normal) * norm(body.plane.normal));
    checks.push({
      id: 'normale',
      label: 'Normale stimmt mit der Messung überein',
      expected: 1,
      actual: alignment,
      deviation: Math.abs(1 - alignment),
      ok: alignment > 1 - 1e-6,
    });
  }
  checks.push({ id: 'kern', label: 'Körper aus dem Kern mit Volumen', expected: true, actual: Number.isFinite(body.volume) && body.volume > 0, deviation: null, ok: Number.isFinite(body.volume) && body.volume > 0 });
  if (source) {
    const bounds = transformedBounds(source);
    if (bounds) {
      let inside = true,
        overflow = 0;
      for (let i = 0; i < body.mesh.verts.length; i += 3)
        for (let k = 0; k < 3; k++) {
          const value = body.mesh.verts[i + k],
            out = Math.max(bounds.min[k] - value, value - bounds.max[k], 0);
          overflow = Math.max(overflow, out);
          if (out > 1e-3) inside = false;
        }
      checks.push({
        id: 'quelle',
        label: 'Körper liegt innerhalb der gemessenen Bauteilausdehnung',
        expected: true,
        actual: inside,
        deviation: overflow,
        ok: inside,
      });
    }
  }
  return { ok: checks.every((item) => item.ok), checks, problems: checks.filter((item) => !item.ok) };
}

function distanceToPolyline(point, polygon) {
  if (polygon.length < 2) return Infinity;
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = dx * dx + dy * dy,
      t = length ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length)) : 0;
    best = Math.min(best, Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy));
  }
  return best;
}

/** Compare the reconstructed body at the retained section plane with the
 * retained section's outer arm contour (largest loop = selected arm). Returns the
 * largest measured deviation; bounds-only evidence is compared by its extents. */
export function compareArmHeadBody(body, retained, { budget = ARM_HEAD_LIMITS.contourBudget } = {}) {
  if (body?.kind !== 'armHeadBody' || !body.mesh) fail('Kein gespeicherter Armkörper.', 'ARM_HEAD_BODY');
  if (
    !retained ||
    !vector(retained.normal) ||
    norm(retained.normal) < 1e-9 ||
    retained.frame === undefined
  )
    fail('Zurückgehaltener Schnitt benötigt Normale, Rahmen und Messebene.', 'ARM_HEAD_RETAINED');
  const retainedFrame = readFrame(retained.frame),
    frame = retainedFrame.frame;
  const planePoint = retained.measurementPlanePoint ?? retained.planePoint ?? retained.origin;
  if (!vector(planePoint)) fail('Zurückgehaltener Schnitt benötigt einen Messebenenpunkt.', 'ARM_HEAD_RETAINED');
  const node = armHeadBodyNode(body, { id: 'armkopf-vergleich' }),
    cut = meshSectionContours(node, { normal: retained.normal, planePoint, includePoints: true });
  if (!cut.complete || !cut.outerProfile) fail('Der Armkörper schneidet die zurückgehaltene Ebene nicht als geschlossene Außenkontur.', 'ARM_HEAD_RETAINED');
  const toRetained = (point) => worldPointToPlane(planePointToWorld(point, cut.frame), frame);
  const bodyPoints = cut.outerProfile.points.map(toRetained);
  const loop = retained.outerProfile ?? retained,
    retainedPoints = Array.isArray(loop.points) && loop.points.length >= 3 ? loop.points : Array.isArray(loop.points2D) && loop.points2D.length >= 3 ? loop.points2D : null,
    bounds = loop.bounds2D ?? loop.bounds ?? retained.outerBounds2D ?? null;
  if (retainedPoints) {
    let bodyToRetained = 0,
      retainedToBody = 0;
    for (const point of bodyPoints) bodyToRetained = Math.max(bodyToRetained, distanceToPolyline(point, retainedPoints));
    for (const point of retainedPoints) retainedToBody = Math.max(retainedToBody, distanceToPolyline(point, bodyPoints));
    const maxDeviation = Math.max(bodyToRetained, retainedToBody);
    return {
      ok: maxDeviation <= budget,
      mode: 'contour',
      maxDeviation,
      bodyToRetained,
      retainedToBody,
      budget,
      bodyArea: cut.outerProfile.area,
      retainedLoopCount: retained.totalLoops ?? null,
    };
  }
  if (!bounds) fail('Zurückgehaltener Schnitt enthält weder Kontur noch Ausdehnung.', 'ARM_HEAD_RETAINED');
  let bodyMin = [Infinity, Infinity],
    bodyMax = [-Infinity, -Infinity];
  for (const point of bodyPoints) {
    bodyMin = bodyMin.map((v, k) => Math.min(v, point[k]));
    bodyMax = bodyMax.map((v, k) => Math.max(v, point[k]));
  }
  const deviations = [
    Math.abs(bodyMin[0] - bounds.min[0]),
    Math.abs(bodyMin[1] - bounds.min[1]),
    Math.abs(bodyMax[0] - bounds.max[0]),
    Math.abs(bodyMax[1] - bounds.max[1]),
  ];
  const maxDeviation = Math.max(...deviations);
  return {
    ok: maxDeviation <= budget,
    mode: 'bounds',
    maxDeviation,
    deviations: { min: [deviations[0], deviations[1]], max: [deviations[2], deviations[3]] },
    budget,
    bodyBounds: { min: bodyMin, max: bodyMax },
    retainedBounds: { min: bounds.min, max: bounds.max },
    retainedLoopCount: retained.totalLoops ?? null,
  };
}

// --- persist, reopen and edit ----------------------------------------------

/** Open a saved arm body and keep its native sketch as the editable source. */
export function openArmHeadBody(saved) {
  if (saved?.kind !== 'armHeadBody' || !saved.sketch || !saved.plane?.frame)
    fail('Kein gespeicherter Armkörper zum Öffnen.', 'ARM_HEAD_OPEN');
  const plane = readFrame(saved.plane.frame);
  if (!vector(saved.plane.normal) || norm(saved.plane.normal) < 1e-9)
    fail('Gespeicherte Armkopfebene ist unvollständig.', 'ARM_HEAD_OPEN');
  let resolved;
  try {
    resolved = resolveSketchProfile(saved.sketch, sketchExpression);
  } catch (error) {
    fail('Gespeicherte Armkopfskizze ist nicht mehr editierbar: ' + error.message, 'ARM_HEAD_OPEN');
  }
  return {
    version: 1,
    kind: 'armHeadBodySource',
    name: saved.name,
    status: 'editable',
    plane: structuredClone(saved.plane),
    sketch: structuredClone(saved.sketch),
    extrusion: structuredClone(saved.extrusion),
    measured: saved.measured
      ? structuredClone(saved.measured)
      : {
          near: saved.extrusion?.near,
          far: saved.extrusion?.far,
          thickness: saved.extrusion?.thickness,
          normal: saved.extrusion?.direction ? [...saved.extrusion.direction] : [...plane.n],
          origin: plane.origin,
        },
    cuts: measuredCutPlanes(saved.cuts),
    source: saved.source ? structuredClone(saved.source) : null,
    mesh: saved.mesh ? structuredClone(saved.mesh) : null,
    volume: saved.volume,
    area: resolved.area,
  };
}

/** Change one named sketch dimension of the reopened arm source. Invalid sizes
 * (for example a bore larger than its surrounding contour) are rejected before a
 * body is rebuilt. */
export function setArmHeadDimension(opened, name, value) {
  if (opened?.kind !== 'armHeadBodySource') fail('Zuerst den gespeicherten Armkörper öffnen.', 'ARM_HEAD_DIMENSION');
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > 200) fail('Maßwert fehlt oder ist zu lang.', 'ARM_HEAD_DIMENSION');
  const next = structuredClone(opened),
    variable = next.sketch.variables.find((item) => item.name === name);
  if (!variable) fail('Unbekanntes Skizzenmaß: ' + String(name), 'ARM_HEAD_DIMENSION');
  const from = variable.value;
  variable.value = text;
  try {
    const resolved = resolveSketchProfile(next.sketch, sketchExpression);
    next.area = resolved.area;
  } catch (error) {
    fail('Skizzenmaß ' + name + ' ergibt keine gültige Kontur: ' + error.message, 'ARM_HEAD_DIMENSION');
  }
  next.edited = { name, from, to: text };
  return next;
}

/** Rebuild the opened arm body from its edited native sketch and the unchanged
 * independent thickness measurement. */
export function rebuildArmHeadBody(kernel, opened) {
  if (opened?.kind !== 'armHeadBodySource') fail('Zuerst den gespeicherten Armkörper öffnen.', 'ARM_HEAD_OPEN');
  const body = buildArmHeadBody(
    kernel,
    { kind: 'armHeadSketch', status: 'complete', plane: opened.plane, sketch: opened.sketch },
    { measured: opened.measured, cuts: opened.cuts, name: opened.name },
  );
  body.previousVolume = opened.volume;
  body.volumeDelta = body.volume - opened.volume;
  body.edited = opened.edited ?? null;
  body.source = opened.source ? structuredClone(opened.source) : null;
  return body;
}
