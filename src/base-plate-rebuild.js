// R03: build the upper base plate from its own measured R01 contour. The plate
// sketch stays native and editable; height and the transition face are measured
// on the source mesh with rays and horizontal triangle areas, never estimated.
// Pure geometry; the CAD kernel is passed in like the other mesh tools.
import { meshContourGeometry as g } from './mesh-lid.js';
import { meshSectionContours, planePointToWorld, worldPointToPlane } from './mesh-section-contours.js';
import { resolveSketchProfile } from './sketch-profile.js';
import { sketchExpression } from './sketch-expression.js';
import { projectObjectGeometryDigest } from './project-objects.js';

export const BASE_PLATE_LIMITS = Object.freeze({
  // Support points must lie on the disclosed measurement plane.
  planeTolerance: 1e-6,
  // R01 evidence stores world points at 1e-3 mm; the 2D points keep full precision.
  sourceTolerance: 2e-3,
  // Manifold returns float32 meshes; keep a matching slack for the body proof.
  thicknessTolerance: 1e-4,
  locationTolerance: 1e-4,
  // The contour was approximated by native lines/arcs within the default
  // section fit tolerance (0.02 mm). Comparisons never use a wider budget.
  contourBudget: 0.02,
  maxElements: 128,
});

const fail = (message, code = 'BASE_PLATE') => {
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
  if (!vector(value, 2)) fail(what + ' benötigt zwei endliche Koordinaten.', 'BASE_PLATE_PROFILE');
  return [value[0], value[1]];
}
function frameParts(frame) {
  if (!Array.isArray(frame) || frame.length !== 16 || !frame.every(finite))
    fail('Der gemessene Ebenenrahmen fehlt oder ist ungültig.', 'BASE_PLATE_FRAME');
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
    fail('Der Ebenenrahmen ist nicht orthonormal.', 'BASE_PLATE_FRAME');
  if (norm(sub(cross(u, v), n)) > 1e-6)
    fail('Der Ebenenrahmen ist nicht rechtshändig zur gemessenen Normale.', 'BASE_PLATE_FRAME');
  return { u, v, n, origin, frame: [...frame] };
}
// R01 evidence stores the frame as named axes, live sections as a 4x4 matrix.
function readFrame(value) {
  if (Array.isArray(value)) return frameParts(value);
  if (value && typeof value === 'object' && vector(value.uAxis) && vector(value.vAxis) && vector(value.normal) && vector(value.origin))
    return frameParts([...value.uAxis, 0, ...value.vAxis, 0, ...value.normal, 0, ...value.origin, 1]);
  fail('Der gemessene Ebenenrahmen fehlt oder ist ungültig.', 'BASE_PLATE_FRAME');
}
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const uniqueKey = (p) => p.map((v) => v.toPrecision(15)).join(',');

const HEIGHT_VARIABLE = 'grundplatte_hoehe';

/** Convert the closed R01 base-plate profile into exactly one native outer
 * sketch on the measured plane. The measured world points are checked against
 * the returned support points; an open profile never invents a sketch. */
export function basePlateSketch(profile, { height = 1, name = 'Grundplatte' } = {}) {
  if (!profile || typeof profile !== 'object') fail('Gemessenes Grundplattenprofil fehlt.', 'BASE_PLATE_PROFILE');
  const sourceFrame = profile.frame ?? profile.plane?.frame,
    status =
      profile.status ?? (profile.complete === false || profile.closed === false ? 'incomplete' : 'complete');
  const open = profile.openProfile ?? null,
    closed = status === 'complete' && profile.closed !== false && profile.complete !== false,
    complete = closed && !!profile.outerProfile;
  if (!complete || !profile.outerProfile) {
    return {
      version: 1,
      kind: 'basePlateSketch',
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
    loops = [];
  if (!Array.isArray(outer.elements) || !outer.elements.length)
    fail('Das gemessene Außenprofil enthält keine Elemente.', 'BASE_PLATE_PROFILE');
  const nativeElement = (element, fallbackId) => {
    if (!element || typeof element !== 'object') fail('Ungültiges Profilelement im Grundplattenprofil.', 'BASE_PLATE_PROFILE');
    const id = typeof element.id === 'string' && element.id ? element.id : fallbackId;
    if (!id || id.length > 100 || ids.has(id)) fail('Ungültige oder doppelte Elementkennung im Grundplattenprofil.', 'BASE_PLATE_PROFILE');
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
    fail('Nicht unterstütztes Profilelement: ' + String(element?.type ?? 'unbekannt'), 'BASE_PLATE_PROFILE');
  };
  const outerElements = outer.elements.map((element, i) => nativeElement(element, 's0e' + i));
  elements.push(...outerElements);
  loops.push({ id: 'aussen', role: 'outer', elements: outerElements.map((element) => element.id) });
  const bound = Number.isFinite(outer.fitErrorBound) ? outer.fitErrorBound : null;
  if (bound !== null && bound > 1e-9)
    uncertainSegments.push({
      scope: 'aussen',
      role: 'outer',
      elements: outerElements.map((element) => element.id),
      fitErrorBound: Number(bound.toFixed(6)),
      reason: 'Gemessene Polyline, innerhalb der Schnitttoleranz durch native Elemente angenähert.',
    });
  if (elements.length > BASE_PLATE_LIMITS.maxElements)
    fail('Das Grundplattenprofil überschreitet ' + BASE_PLATE_LIMITS.maxElements + ' native Elemente.', 'BASE_PLATE_SKETCH');
  if (!(Number(height) >= 0.01 && Number(height) <= 10000))
    fail('Die Platzhalterhöhe der Skizze muss 0,01–10.000 mm betragen.', 'BASE_PLATE_SKETCH');
  // The extrusion height stays a named, editable sketch dimension. It is
  // replaced by the independently measured plate height in R03-02.
  const sketch = {
    version: 2,
    kind: 'profile',
    variables: [{ name: HEIGHT_VARIABLE, value: String(height) }],
    dimensions: { height: HEIGHT_VARIABLE },
    elements,
    loops,
  };
  let resolved;
  try {
    resolved = resolveSketchProfile(sketch, sketchExpression);
  } catch (error) {
    fail('Das gemessene Grundplattenprofil ergibt keine gültige native Skizze: ' + error.message, 'BASE_PLATE_SKETCH');
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
  if (!vector(measuredPoint)) fail('Der gemessene Ebenenpunkt fehlt.', 'BASE_PLATE_FRAME');
  let maxPlaneDistance = 0;
  for (const point of supportPoints)
    maxPlaneDistance = Math.max(maxPlaneDistance, Math.abs(dot(sub(planePointToWorld(point, plane.frame), measuredPoint), plane.n)));
  if (maxPlaneDistance > BASE_PLATE_LIMITS.planeTolerance)
    fail(
      'Stützpunkte liegen nach Rückrechnung nicht in der gemessenen Ebene (' + maxPlaneDistance.toFixed(9) + ' mm).',
      'BASE_PLATE_PLANE',
    );
  let maxSourceDistance = null,
    sourcePointCount = null;
  if (Array.isArray(outer.points2D) && Array.isArray(outer.pointsWorld) && outer.points2D.length === outer.pointsWorld.length) {
    sourcePointCount = outer.pointsWorld.length;
    maxSourceDistance = 0;
    for (let i = 0; i < outer.points2D.length; i++)
      maxSourceDistance = Math.max(maxSourceDistance, norm(sub(planePointToWorld(outer.points2D[i], plane.frame), outer.pointsWorld[i])));
    if (maxSourceDistance > BASE_PLATE_LIMITS.sourceTolerance)
      fail('Rückgerechnete Stützpunkte weichen von den R01-Weltpunkten ab (' + maxSourceDistance.toFixed(6) + ' mm).', 'BASE_PLATE_SOURCE');
  }
  return {
    version: 1,
    kind: 'basePlateSketch',
    name,
    status: 'complete',
    complete: true,
    plane: { origin: plane.origin, uAxis: plane.u, vAxis: plane.v, normal: plane.n, frame: plane.frame },
    sketch: resolved.sketch,
    area: resolved.area,
    measuredContour: {
      area: Number.isFinite(outer.area) ? outer.area : null,
      pointCount: Number.isFinite(outer.pointCount) ? outer.pointCount : null,
      elementCount: outer.elements.length,
      bounds2D: outer.bounds2D ?? null,
    },
    supportPoints: {
      count: supportPoints.length,
      points2D: supportPoints,
      maxPlaneDistance,
      maxSourceDistance,
      sourcePointCount,
    },
    uncertainSegments,
    limitations:
      'Eine native Außenkontur auf der gemessenen Ebene. Die Höhe ist zunächst ein Platzhalter und wird erst mit der gemessenen Grundplattenhöhe ersetzt. Keine Formgarantie zwischen den Schnitten; Bohrungen gehören zu R04.',
  };
}

// --- measurement and body ---------------------------------------------------

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

/** Sum horizontal mesh faces at the measured near/far offset. The plate's upper
 * transition face is the exposed planar area at the top offset; bores and the
 * supports above it are not part of this measured plate surface. */
function horizontalAreas(source, plane, near, far) {
  const points = source.points,
    indices = source.indices;
  const area = { near: 0, far: 0 };
  for (let t = 0; t < indices.length; t += 3) {
    const a = points[indices[t]],
      b = points[indices[t + 1]],
      c = points[indices[t + 2]],
      normal = cross(sub(b, a), sub(c, a)),
      length = norm(normal);
    if (!(length > 1e-12)) continue;
    const unit = normal.map((value) => value / length),
      alignment = Math.abs(dot(unit, plane.normal));
    if (alignment < 0.9999) continue;
    const offsets = [a, b, c].map((point) => dot(sub(point, plane.origin), plane.normal));
    if (offsets.every((value) => Math.abs(value - far) <= 1e-3)) area.far += length / 2;
    else if (offsets.every((value) => Math.abs(value - near) <= 1e-3)) area.near += length / 2;
  }
  return area;
}

/** Independently measure the base-plate span along the measured normal. Rays
 * through a raster of material points on the measured plane; the dominant
 * near/far class is the plate thickness. Supports, bores and neighbouring
 * material fall out of that class instead of being averaged into it. */
export function measureBasePlateHeight(node, prepared, { samples = 24, probe, rounding = 0.001 } = {}) {
  if (prepared?.kind !== 'basePlateSketch' || prepared.status !== 'complete' || !prepared.sketch)
    fail('Zuerst eine vollständige native Grundplattenkontur aus dem gemessenen Profil aufbauen.', 'BASE_PLATE_SKETCH');
  const plane = prepared.plane,
    resolved = resolveSketchProfile(prepared.sketch, sketchExpression),
    outer = resolved.polygons[0];
  if (!outer || outer.length < 3) fail('Die native Grundplattenkontur besitzt keine Fläche.', 'BASE_PLATE_SKETCH');
  const bounds = polygonBounds(outer);
  let probes = [];
  if (probe) {
    const point = pair(probe, 'Messpunkt');
    if (!g.contains(outer, point)) fail('Der Messpunkt liegt nicht im Grundplattenmaterial.', 'BASE_PLATE_HEIGHT');
    probes = [point];
  } else {
    const steps = Math.max(4, Math.min(64, Math.floor(samples)));
    for (let i = 0; i < steps; i++)
      for (let j = 0; j < steps; j++) {
        const point = [
          bounds.min[0] + ((i + 0.5) / steps) * (bounds.max[0] - bounds.min[0]),
          bounds.min[1] + ((j + 0.5) / steps) * (bounds.max[1] - bounds.min[1]),
        ];
        if (g.contains(outer, point)) probes.push(point);
      }
  }
  if (!probes.length) fail('Im Grundplattenmaterial ließ sich kein Messpunkt finden.', 'BASE_PLATE_HEIGHT');
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
  if (hits.length < (probe ? 1 : 3)) fail('Die Grundplattenhöhe ist an dieser Stelle nicht eindeutig messbar.', 'BASE_PLATE_HEIGHT');
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
    height = winner.far - winner.near;
  if (!(height >= 0.01 && height <= 10000))
    fail('Die gemessene Grundplattenhöhe liegt außerhalb 0,01–10.000 mm.', 'BASE_PLATE_HEIGHT');
  if (!(winner.near < -BASE_PLATE_LIMITS.locationTolerance && winner.far > BASE_PLATE_LIMITS.locationTolerance))
    fail('Die Messebene liegt nicht im gemessenen Grundplattenmaterial. Anderen Körper oder andere Messebene wählen.', 'BASE_PLATE_HEIGHT');
  const surfaces = horizontalAreas(source, plane, winner.near, winner.far);
  return {
    version: 1,
    kind: 'basePlateHeight',
    near: winner.near,
    far: winner.far,
    height,
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
    distribution: ranked.slice(0, 3).map((bin) => ({ near: bin.near, far: bin.far, height: bin.far - bin.near, count: bin.count })),
    surfaces: {
      top: { offset: winner.far, area: surfaces.far },
      bottom: { offset: winner.near, area: surfaces.near },
    },
    method:
      'Strahl entlang der gemessenen Ebenennormale durch Rasterpunkte im Grundplattenmaterial; häufigste Plattenhöhe, Median der Klasse. Waagerechte Stirnflächen werden zusätzlich als Dreiecksflächen am oberen und unteren Versatz gemessen.',
    independent: true,
  };
}

function validateMeasured(measured) {
  if (!measured || !finite(measured.near) || !finite(measured.far) || !(measured.far > measured.near))
    fail('Gemessene Grundplattenlage (near/far) fehlt oder ist ungültig.', 'BASE_PLATE_HEIGHT');
  const height = measured.far - measured.near;
  if (!(height >= 0.01 && height <= 10000))
    fail('Gemessene Grundplattenhöhe liegt außerhalb 0,01–10.000 mm.', 'BASE_PLATE_HEIGHT');
  if (measured.normal !== undefined && (!vector(measured.normal) || norm(measured.normal) <= 1e-9))
    fail('Gemessene Normale ist ungültig.', 'BASE_PLATE_HEIGHT');
  const normal = measured.normal === undefined ? null : measured.normal;
  return {
    near: measured.near,
    far: measured.far,
    height,
    normal,
    surfaces: measured.surfaces ? structuredClone(measured.surfaces) : null,
  };
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
  return { near: min, far: max, height: max - min };
}

function bodyFaceAreas(body) {
  const mesh = body.mesh,
    { origin, normal } = body.plane,
    span = bodyNormalSpan(body);
  let top = 0,
    bottom = 0,
    side = 0,
    total = 0;
  for (let i = 0; i < mesh.triangles.length; i += 3) {
    const a = [mesh.verts[mesh.triangles[i] * 3], mesh.verts[mesh.triangles[i] * 3 + 1], mesh.verts[mesh.triangles[i] * 3 + 2]],
      b = [mesh.verts[mesh.triangles[i + 1] * 3], mesh.verts[mesh.triangles[i + 1] * 3 + 1], mesh.verts[mesh.triangles[i + 1] * 3 + 2]],
      c = [mesh.verts[mesh.triangles[i + 2] * 3], mesh.verts[mesh.triangles[i + 2] * 3 + 1], mesh.verts[mesh.triangles[i + 2] * 3 + 2]],
      raw = cross(sub(b, a), sub(c, a)),
      length = norm(raw);
    if (!(length > 1e-12)) continue;
    const area = length / 2,
      alignment = dot(raw, normal) / length;
    total += area;
    const offsets = [a, b, c].map((point) => dot(sub(point, origin), normal));
    if (alignment > 0.9999 && offsets.every((value) => Math.abs(value - span.far) <= 1e-3)) top += area;
    else if (alignment < -0.9999 && offsets.every((value) => Math.abs(value - span.near) <= 1e-3)) bottom += area;
    else side += area;
  }
  return { top, bottom, side, total };
}

/** Extrude the single native base-plate sketch along the measured normal from
 * the measured lower to the measured upper offset. A caller may pass an edited
 * `height` (R03-04); otherwise the independently measured plate height is used. */
export function buildBasePlateBody(kernel, prepared, { measured, source, height, name = 'Grundplatte' } = {}) {
  if (!kernel?.Manifold?.extrude) fail('Der native CAD-Kern fehlt.', 'BASE_PLATE_KERNEL');
  if (prepared?.kind !== 'basePlateSketch' || prepared.status !== 'complete' || !prepared.sketch)
    fail('Zuerst eine vollständige native Grundplattenkontur aus dem gemessenen Profil aufbauen.', 'BASE_PLATE_SKETCH');
  const plane = prepared.plane,
    span = validateMeasured(measured),
    thickness = height === undefined ? span.height : Number(height);
  if (!(thickness >= 0.01 && thickness <= 10000))
    fail('Die Grundplattenhöhe muss 0,01–10.000 mm betragen.', 'BASE_PLATE_HEIGHT');
  const sketch = structuredClone(prepared.sketch),
    variable = sketch.variables?.find((item) => item.name === HEIGHT_VARIABLE);
  if (variable) variable.value = String(thickness);
  else sketch.dimensions = { ...sketch.dimensions, height: String(thickness) };
  const resolved = resolveSketchProfile(sketch, sketchExpression);
  let solid = kernel.Manifold.extrude(resolved.polygons, thickness, 0, 0, [1, 1], false);
  let volume, mesh;
  try {
    if (solid.isEmpty() || solid.status() !== 'NoError' || !(solid.volume() > 0))
      fail('Die extrudierte Grundplattenkontur ergibt keinen geschlossenen Körper.', 'BASE_PLATE_BODY');
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
    kind: 'basePlateBody',
    name,
    status: 'complete',
    plane: structuredClone(plane),
    sketch,
    extrusion: { near: span.near, far: span.near + thickness, height: thickness, direction: [...plane.normal] },
    measured: {
      near: span.near,
      far: span.far,
      height: span.height,
      normal: span.normal ? [...span.normal] : [...plane.normal],
      origin: [...plane.origin],
      surfaces: span.surfaces,
    },
    source: source ? { geometryDigest: projectObjectGeometryDigest(source) } : null,
    mesh,
    volume,
    report: null,
  };
  const actual = bodyNormalSpan(body),
    areas = bodyFaceAreas(body);
  body.report = {
    bodyNear: actual.near,
    bodyFar: actual.far,
    bodyHeight: actual.height,
    spanDeviation: Math.max(Math.abs(actual.near - span.near), Math.abs(actual.far - body.extrusion.far)),
    measuredHeight: span.height,
    heightEdited: Math.abs(thickness - span.height) > 1e-9,
    transitionArea: areas.top,
    topFaceArea: areas.top,
    bottomFaceArea: areas.bottom,
    sideArea: areas.side,
    totalSurfaceArea: areas.total,
    sourceTopSurfaceArea: span.surfaces?.top?.area ?? null,
    sourceBottomSurfaceArea: span.surfaces?.bottom?.area ?? null,
  };
  return body;
}

export function basePlateBodyNode(body, { id = 'grundplatte-koerper', name = 'Grundplatte' } = {}) {
  if (body?.kind !== 'basePlateBody' || !body.mesh) fail('Kein gespeicherter Grundplattenkörper.', 'BASE_PLATE_BODY');
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
    metadata: { notes: 'R03 Grundplatte aus gemessener Kontur' },
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

/** Spatial proof of the reconstructed plate: lower/upper offset, measured
 * height, measured normal, kernel volume and the source part's extent. */
export function checkBasePlateBody(body, { measured = body?.measured, source } = {}) {
  if (body?.kind !== 'basePlateBody' || !body.mesh) fail('Kein gespeicherter Grundplattenkörper.', 'BASE_PLATE_BODY');
  const span = validateMeasured(measured),
    actual = bodyNormalSpan(body),
    tolerance = BASE_PLATE_LIMITS.locationTolerance,
    checks = [];
  const check = (id, label, expected, value) => {
    const deviation = typeof expected === 'number' && typeof value === 'number' ? Math.abs(expected - value) : null;
    const ok = typeof expected === 'number' && typeof value === 'number' ? deviation <= tolerance : expected === value;
    checks.push({ id, label, expected, actual: value, deviation, ok });
  };
  check('lage-unten', 'Untere Grundplattenlage (Ist/Soll)', span.near, actual.near);
  check('hoehe', 'Grundplattenhöhe (Ist/Soll)', body.extrusion.height, actual.height);
  // An intentionally edited height (R03-04) is a design change; the measured
  // evidence is not overwritten. Unedited bodies must match the ray result.
  if (!body.report?.heightEdited) check('gemessene-hoehe', 'Gemessene Grundplattenhöhe (Ist/Soll)', span.height, actual.height);
  check('lage-oben', 'Obere Grundplattenlage (Ist/Soll)', body.extrusion.near + body.extrusion.height, actual.far);
  check('ebene-im-material', 'Messebene liegt in der gemessenen Grundplatte', true, span.near < -tolerance && span.far > tolerance);
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
  checks.push({
    id: 'kern',
    label: 'Körper aus dem Kern mit Volumen',
    expected: true,
    actual: Number.isFinite(body.volume) && body.volume > 0,
    deviation: null,
    ok: Number.isFinite(body.volume) && body.volume > 0,
  });
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
function distanceToPolyline3(point, polygon) {
  if (polygon.length < 2) return Infinity;
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length],
      ab = sub(b, a),
      length = dot(ab, ab),
      t = length ? Math.max(0, Math.min(1, dot(sub(point, a), ab) / length)) : 0,
      projected = a.map((value, k) => value + t * ab[k]);
    best = Math.min(best, norm(sub(point, projected)));
  }
  return best;
}
// Densify both contours so a difference in the middle of a long edge is seen,
// not only at the stored vertices.
function densify(polygon, step = 0.5) {
  const points = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length],
      count = Math.max(1, Math.ceil(Math.hypot(...b.map((value, k) => value - a[k])) / step));
    for (let k = 0; k < count; k++) points.push(a.map((value, axis) => value + ((b[axis] - value) * k) / count));
  }
  return points;
}
function twoSidedDeviation(first, second, distance = distanceToPolyline) {
  const a = densify(first),
    b = densify(second);
  let firstToSecond = 0,
    secondToFirst = 0;
  for (const point of a) firstToSecond = Math.max(firstToSecond, distance(point, second));
  for (const point of b) secondToFirst = Math.max(secondToFirst, distance(point, first));
  return { maxDeviation: Math.max(firstToSecond, secondToFirst), firstToSecond, secondToFirst };
}

/** Compare the reconstructed plate with a retained measured section (R03-03
 * style evidence). Returns the largest two-sided contour deviation in mm. */
export function compareBasePlateBody(body, retained, { budget = BASE_PLATE_LIMITS.contourBudget } = {}) {
  if (body?.kind !== 'basePlateBody' || !body.mesh) fail('Kein gespeicherter Grundplattenkörper.', 'BASE_PLATE_BODY');
  const retainedNormal = retained?.normal ?? retained?.cut?.normal;
  if (!retained || !vector(retainedNormal) || norm(retainedNormal) < 1e-9 || retained.frame === undefined)
    fail('Zurückgehaltener Schnitt benötigt Normale, Rahmen und Messebene.', 'BASE_PLATE_RETAINED');
  const retainedFrame = readFrame(retained.frame),
    frame = retainedFrame.frame;
  const planePoint = retained.measurementPlanePoint ?? retained.cut?.actualPlanePoint ?? retained.planePoint ?? retained.origin;
  if (!vector(planePoint)) fail('Zurückgehaltener Schnitt benötigt einen Messebenenpunkt.', 'BASE_PLATE_RETAINED');
  const node = basePlateBodyNode(body, { id: 'grundplatte-vergleich' }),
    cut = meshSectionContours(node, { normal: retainedNormal, planePoint, includePoints: true });
  if (!cut.complete || !cut.outerProfile)
    fail('Der Grundplattenkörper schneidet die zurückgehaltene Ebene nicht als geschlossene Außenkontur.', 'BASE_PLATE_RETAINED');
  const toRetained = (point) => worldPointToPlane(planePointToWorld(point, cut.frame), frame);
  const bodyPoints = cut.outerProfile.points.map(toRetained);
  const loop = retained.outerProfile ?? retained,
    retainedPoints =
      Array.isArray(loop.points) && loop.points.length >= 3 ? loop.points : Array.isArray(loop.points2D) && loop.points2D.length >= 3 ? loop.points2D : null;
  if (!retainedPoints) fail('Zurückgehaltener Schnitt enthält keine Kontur.', 'BASE_PLATE_RETAINED');
  const deviation = twoSidedDeviation(bodyPoints, retainedPoints);
  return {
    ok: deviation.maxDeviation <= budget,
    mode: 'contour',
    maxDeviation: deviation.maxDeviation,
    bodyToRetained: deviation.firstToSecond,
    retainedToBody: deviation.secondToFirst,
    budget,
    bodyArea: cut.outerProfile.area,
    retainedLoopCount: retained.totalLoops ?? null,
  };
}

/** Compare the plate body with the source mesh at any plane (R03-03). Both
 * outer contours are cut on the same plane, densified and compared in world mm.
 * Internal loops belong to R04 and are reported, not silently repaired. */
export function compareBasePlateSection(body, source, { normal, planePoint, budget = BASE_PLATE_LIMITS.contourBudget } = {}) {
  if (body?.kind !== 'basePlateBody' || !body.mesh) fail('Kein gespeicherter Grundplattenkörper.', 'BASE_PLATE_BODY');
  if (!vector(normal) || norm(normal) < 1e-12 || !vector(planePoint))
    fail('Ebenenvergleich benötigt eine Normale und einen Ebenenpunkt.', 'BASE_PLATE_SECTION');
  let bodyCut, sourceCut;
  try {
    bodyCut = meshSectionContours(basePlateBodyNode(body, { id: 'grundplatte-vergleich' }), { normal, planePoint, includePoints: true });
    sourceCut = meshSectionContours(source, { normal, planePoint, includePoints: true });
  } catch (error) {
    return { ok: false, maxDeviation: null, error: error.message, budget, normal: [...normal], planePoint: [...planePoint] };
  }
  if (!bodyCut.complete || !bodyCut.outerProfile)
    return { ok: false, maxDeviation: null, error: 'Der Körper schneidet diese Ebene nicht als geschlossene Außenkontur.', budget, normal: [...normal], planePoint: [...planePoint] };
  if (!sourceCut.complete || !sourceCut.outerProfile)
    return { ok: false, maxDeviation: null, error: 'Die Vorlage schneidet diese Ebene nicht als geschlossene Außenkontur.', budget, normal: [...normal], planePoint: [...planePoint] };
  const bodyPoints = bodyCut.outerProfile.points.map((point) => planePointToWorld(point, bodyCut.frame)),
    sourcePoints = sourceCut.outerProfile.points.map((point) => planePointToWorld(point, sourceCut.frame)),
    bodySamples = densify(bodyPoints, 0.5),
    sourceSamples = densify(sourcePoints, 0.5);
  let bodyToSource = 0,
    sourceToBody = 0;
  for (const point of bodySamples) bodyToSource = Math.max(bodyToSource, distanceToPolyline3(point, sourcePoints));
  for (const point of sourceSamples) sourceToBody = Math.max(sourceToBody, distanceToPolyline3(point, bodyPoints));
  const maxDeviation = Math.max(bodyToSource, sourceToBody);
  return {
    ok: maxDeviation <= budget,
    maxDeviation,
    maxDeviationMm: maxDeviation,
    bodyToSource,
    sourceToBody,
    budget,
    normal: [...normal],
    planePoint: [...planePoint],
    bodyLoops: bodyCut.totalLoops,
    sourceLoops: sourceCut.totalLoops,
    bodyArea: bodyCut.outerProfile.area,
    sourceArea: sourceCut.outerProfile.area,
  };
}

/** Convenience for R03-03: the largest contour deviation in mm at one plane. */
export function largestBasePlateDeviation(body, source, options) {
  return compareBasePlateSection(body, source, options).maxDeviation;
}

// --- persist, reopen and edit ----------------------------------------------

/** Open a saved plate body and keep its native contour as the editable source. */
export function openBasePlateBody(saved) {
  if (saved?.kind !== 'basePlateBody' || !saved.sketch || !saved.plane?.frame)
    fail('Kein gespeicherter Grundplattenkörper zum Öffnen.', 'BASE_PLATE_OPEN');
  const plane = readFrame(saved.plane.frame);
  if (!vector(saved.plane.normal) || norm(saved.plane.normal) < 1e-9)
    fail('Gespeicherte Grundplattenebene ist unvollständig.', 'BASE_PLATE_OPEN');
  let resolved;
  try {
    resolved = resolveSketchProfile(saved.sketch, sketchExpression);
  } catch (error) {
    fail('Gespeicherte Grundplattenkontur ist nicht mehr editierbar: ' + error.message, 'BASE_PLATE_OPEN');
  }
  return {
    version: 1,
    kind: 'basePlateBodySource',
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
          height: saved.extrusion?.height,
          normal: saved.extrusion?.direction ? [...saved.extrusion.direction] : [...plane.n],
          origin: plane.origin,
          surfaces: null,
        },
    source: saved.source ? structuredClone(saved.source) : null,
    mesh: saved.mesh ? structuredClone(saved.mesh) : null,
    volume: saved.volume,
    area: resolved.area,
  };
}

/** Change one named sketch dimension of the reopened plate source. Invalid
 * heights are rejected before a body is rebuilt. */
export function setBasePlateDimension(opened, name, value) {
  if (opened?.kind !== 'basePlateBodySource') fail('Zuerst den gespeicherten Grundplattenkörper öffnen.', 'BASE_PLATE_DIMENSION');
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > 200) fail('Maßwert fehlt oder ist zu lang.', 'BASE_PLATE_DIMENSION');
  const next = structuredClone(opened),
    variable = next.sketch.variables.find((item) => item.name === name);
  if (!variable) fail('Unbekanntes Skizzenmaß: ' + String(name), 'BASE_PLATE_DIMENSION');
  const from = variable.value;
  variable.value = text;
  try {
    const resolved = resolveSketchProfile(next.sketch, sketchExpression);
    next.area = resolved.area;
  } catch (error) {
    fail('Skizzenmaß ' + name + ' ergibt keine gültige Grundplattenkontur: ' + error.message, 'BASE_PLATE_DIMENSION');
  }
  next.edited = { name, from, to: text };
  return next;
}

/** Rebuild the opened plate body from its edited native sketch. The measured
 * span stays evidence; an edited height is applied as the new extrusion depth. */
export function rebuildBasePlateBody(kernel, opened) {
  if (opened?.kind !== 'basePlateBodySource') fail('Zuerst den gespeicherten Grundplattenkörper öffnen.', 'BASE_PLATE_OPEN');
  const resolved = resolveSketchProfile(opened.sketch, sketchExpression),
    body = buildBasePlateBody(
      kernel,
      { kind: 'basePlateSketch', status: 'complete', plane: opened.plane, sketch: opened.sketch },
      { measured: opened.measured, height: resolved.height, name: opened.name },
    );
  body.previousVolume = opened.volume;
  body.volumeDelta = body.volume - opened.volume;
  body.edited = opened.edited ?? null;
  body.source = opened.source ? structuredClone(opened.source) : null;
  return body;
}
