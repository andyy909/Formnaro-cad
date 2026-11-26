import { meshContourGeometry as g } from './mesh-lid.js';
import { cadGeometryDigest } from './cad-geometry-digest.js';

const fail = (message) => {
  throw Object.assign(Error(message), { code: 'MESH_SECTION_CONTOURS' });
};
const vector = (v) => Array.isArray(v) && v.length === 3 && v.every((x) => Number.isFinite(x) && Math.abs(x) <= 1e6);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const sub = (a, b) => a.map((v, k) => v - b[k]);
function lineFit(points, tolerance) {
  const start = points[0],
    end = points.at(-1),
    d = sub(end, start),
    length = distance(start, end);
  if (length < 1e-9) return null;
  let error = 0,
    previous = -1e-9;
  for (const p of points) {
    const q = sub(p, start),
      t = (q[0] * d[0] + q[1] * d[1]) / (length * length);
    if (t < previous - 1e-8 || t < 0 || t > 1 + 1e-8) return null;
    previous = t;
    error = Math.max(error, Math.abs(cross(q, d)) / length);
  }
  return error <= tolerance ? { element: { type: 'line', start, end }, error } : null;
}
function arcFit(points, tolerance) {
  if (points.length < 5) return null;
  const a = points[0],
    b = points[Math.floor(points.length / 2)],
    c = points.at(-1),
    u = sub(b, a),
    v = sub(c, a),
    det = 2 * cross(u, v);
  if (Math.abs(det) < 1e-10) return null;
  const U = u[0] ** 2 + u[1] ** 2,
    V = v[0] ** 2 + v[1] ** 2,
    center = [a[0] + (U * v[1] - V * u[1]) / det, a[1] + (u[0] * V - v[0] * U) / det],
    radius = distance(a, center);
  if (!Number.isFinite(radius) || radius < 0.005 || radius > 5000) return null;
  const sign = Math.sign(cross(u, v));
  let angle = 0,
    stepMax = 0,
    error = 0;
  for (let i = 0; i < points.length; i++) {
    error = Math.max(error, Math.abs(distance(points[i], center) - radius));
    if (i) {
      const x = sub(points[i - 1], center),
        y = sub(points[i], center),
        step = Math.atan2(cross(x, y), x[0] * y[0] + x[1] * y[1]) * sign;
      if (step < -1e-8 || step > Math.PI) return null;
      angle += step;
      stepMax = Math.max(stepMax, step);
    }
  }
  // Vertex residual plus the largest intervening chord sag is a conservative
  // two-sided distance bound for the complete measured polyline and fitted arc.
  const bound = error + radius * (1 - Math.cos(stepMax / 2));
  if (angle >= Math.PI * 1.95 || angle < 0.03 || bound > tolerance) return null;
  return { element: { type: 'arc', start: a, through: b, end: c }, error: bound };
}
function fittedCircle(points, tolerance) {
  const circle = g.circle(points, { maxRadius: 5000 });
  if (circle) {
    let stepMax = 0;
    for (let i = 0; i < points.length; i++) {
      const a = sub(points[i], circle.center),
        b = sub(points[(i + 1) % points.length], circle.center);
      stepMax = Math.max(stepMax, Math.abs(Math.atan2(cross(a, b), a[0] * b[0] + a[1] * b[1])));
    }
    const error = circle.fitError + (circle.diameter / 2) * (1 - Math.cos(stepMax / 2));
    if (error <= tolerance)
      return { element: { type: 'circle', center: circle.center, diameter: circle.diameter }, error };
  }
  return null;
}
function fittedLoop(points, tolerance) {
  const circle = fittedCircle(points, tolerance);
  if (circle) return { elements: [circle.element], error: circle.error };
  const path = [...points, points[0]],
    elements = [];
  let error = 0;
  for (let i = 0; i < points.length;) {
    let best = { element: { type: 'line', start: path[i], end: path[i + 1] }, error: 0 },
      end = i + 1;
    for (let j = i + 2; j < path.length; j++) {
      const candidate = path.slice(i, j + 1),
        fit = lineFit(candidate, tolerance) ?? arcFit(candidate, tolerance);
      if (fit) {
        best = fit;
        end = j;
      } else if (j > end + 4) break;
    }
    elements.push(best.element);
    error = Math.max(error, best.error);
    i = end;
  }
  return { elements, error };
}

/** A section at the requested plane. Measurements may keep closed cycles from
 * an incomplete cut. Sketch profiles still require all components to be closed. */
export function meshSectionContours(node, options = {}) {
  const allowed = [
    'normal',
    'planePoint',
    'fitTolerance',
    'includePoints',
    'loopIndices',
    'geometryDigest',
    'summaryOnly',
    'allowIncomplete',
  ];
  if (
    !options ||
    Object.getPrototypeOf(options) !== Object.prototype ||
    Object.keys(options).some((k) => !allowed.includes(k)) ||
    !vector(options.normal) ||
    Math.hypot(...options.normal) < 1e-12 ||
    !vector(options.planePoint) ||
    (options.summaryOnly !== undefined && typeof options.summaryOnly !== 'boolean') ||
    (options.allowIncomplete !== undefined && typeof options.allowIncomplete !== 'boolean') ||
    (options.summaryOnly && options.includePoints) ||
    (options.includePoints !== undefined && typeof options.includePoints !== 'boolean') ||
    !Number.isFinite(options.fitTolerance ?? 0.02) ||
    (options.fitTolerance ?? 0.02) < 0 ||
    (options.fitTolerance ?? 0.02) > 0.1 ||
    (options.geometryDigest !== undefined && !/^[a-f0-9]{64}$/.test(options.geometryDigest)) ||
    (options.loopIndices !== undefined &&
      (!Array.isArray(options.loopIndices) ||
        !options.loopIndices.length ||
        options.loopIndices.length > 32 ||
        new Set(options.loopIndices).size !== options.loopIndices.length ||
        options.loopIndices.some((i) => !Number.isInteger(i) || i < 0 || i > 31)))
  )
    fail(
      'Schnittkonturen: normal, planePoint, optional fitTolerance 0–0,1 mm, includePoints, loopIndices, summaryOnly, allowIncomplete und aktueller geometryDigest.',
    );
  const s = g.source(node);
  if (options.geometryDigest && options.geometryDigest !== s.geometryDigest)
    throw Object.assign(Error('Die Schnittvorlage wurde geändert. Erneut messen.'), { code: 'MESH_SECTION_STALE' });
  const f = g.frame(s, options.normal),
    plane = g.dot(g.sub(options.planePoint, s.anchor), f.n),
    shift = f.epsilon * 2.231,
    actual = plane + shift;
  if (actual <= f.lo || actual >= f.hi) fail('Die Schnittebene muss innerhalb der Vorlage liegen.');
  const diagnostics = options.summaryOnly || options.allowIncomplete ? { rejectedComponents: 0 } : undefined;
  const contours = g.section(f, plane, diagnostics);
  if (!g.simpleContours(contours, f.epsilon * 8))
    fail('Berührende oder überschneidende Schnittkonturen sind nicht eindeutig.');
  const selected = options.loopIndices ?? contours.map((_, i) => i);
  if (selected.some((i) => i >= contours.length)) fail('Eine angefragte Kontur existiert in diesem Schnitt nicht.');
  const tolerance = options.fitTolerance ?? 0.02,
    origin = f.world([0, 0, actual]),
    frame = [...f.u, 0, ...f.v, 0, ...f.n, 0, ...origin, 1],
    all = [];
  for (let index = 0; index < contours.length; index++) {
    const points = contours[index];
    let parentIndex = null;
    for (let j = 0; j < index; j++)
      if (
        points.every((p) => g.contains(contours[j], p)) &&
        (parentIndex === null || g.area(contours[j]) < g.area(contours[parentIndex]))
      )
        parentIndex = j;
    const depth = parentIndex === null ? 0 : all[parentIndex].depth + 1,
      role = depth % 2 ? 'hole' : 'outer',
      bounds = {
        min: [0, 1].map((k) => Math.min(...points.map((p) => p[k]))),
        max: [0, 1].map((k) => Math.max(...points.map((p) => p[k]))),
      };
    if (options.summaryOnly) {
      const circle = fittedCircle(points, tolerance);
      const label = { index, depth, role: diagnostics?.rejectedComponents ? 'unknown' : role };
      if (circle) {
        const exactCenter = f.world([...circle.element.center, actual]),
          center = exactCenter.map((n) => Number(n.toFixed(6))),
          diameter = Number(circle.element.diameter.toFixed(6)),
          rounding =
            Math.hypot(...exactCenter.map((n, i) => n - center[i])) + Math.abs(circle.element.diameter - diameter) / 2;
        const fitErrorBound = Math.ceil((circle.error + rounding) * 1e6) / 1e6;
        if (fitErrorBound <= tolerance) {
          all.push({ ...label, kind: 'circle', center, diameter, fitErrorBound });
          continue;
        }
      }
      all.push({ ...label, kind: 'outline', bounds });
    } else {
      const fit = fittedLoop(points, tolerance),
        elements = fit.elements.map((e, i) => ({ id: `s${index}e${i}`, ...e }));
      all.push({
        index,
        parentIndex,
        depth,
        role,
        area: g.area(points),
        pointCount: points.length,
        complete: true,
        fitErrorBound: fit.error,
        elements,
        ...(options.includePoints ? { points } : {}),
        bounds,
      });
    }
  }
  if (options.summaryOnly) {
    const isComplete = diagnostics?.rejectedComponents === 0 && selected.length === all.length;
    return {
      version: 1,
      kind: 'meshSectionMeasurements',
      geometryDigest: s.geometryDigest,
      units: 'mm',
      measurementPlanePoint: origin,
      nominalPlanePoint: options.planePoint,
      normal: f.n,
      frame,
      fitTolerance: tolerance,
      complete: isComplete,
      status: isComplete ? 'complete' : 'incomplete',
      closed: diagnostics?.rejectedComponents === 0,
      rejectedComponents: diagnostics?.rejectedComponents ?? 0,
      totalLoops: all.length,
      measurements: selected.map((i) => {
        const { depth, ...measurement } = all[i];
        return measurement;
      }),
      sketch: null,
      sourcePreserved: true,
      limitations:
        'Closed cycles on this plane. Circle centers in world mm; outline bounds in section frame. An unknown role does not prove a hole.',
    };
  }
  const loops = selected.map((i) => all[i]),
    elements = loops.flatMap((l) => l.elements),
    missingParents = loops
      .filter((l) => l.parentIndex !== null && !selected.includes(l.parentIndex))
      .map((l) => l.index);
  const sketch =
    elements.length <= 128 && !missingParents.length
      ? {
          version: 2,
          kind: 'profile',
          variables: [],
          dimensions: { height: 1 },
          elements,
          loops: loops.map((l) => ({ id: 's' + l.index, role: l.role, elements: l.elements.map((e) => e.id) })),
        }
      : null;
  const hasRejected = (diagnostics?.rejectedComponents ?? 0) > 0;
  const outerLoops = hasRejected ? [] : loops.filter((l) => l.role === 'outer'),
    outerProfile = hasRejected ? null : (outerLoops[0] ?? null),
    innerLoops = loops.filter((l) => l.role === 'hole'),
    innerCircles = [];
  for (const l of loops) {
    if (l.elements.length === 1 && l.elements[0].type === 'circle') {
      const el = l.elements[0];
      const exactCenter = f.world([...el.center, actual]);
      innerCircles.push({
        index: l.index,
        role: 'hole',
        planeCenter: el.center,
        center: exactCenter.map((n) => Number(n.toFixed(6))),
        diameter: Number(el.diameter.toFixed(6)),
        fitErrorBound: l.fitErrorBound,
        closed: true,
      });
    }
  }
  const isComplete = !hasRejected && selected.length === all.length;
  return {
    version: 1,
    kind: 'meshSectionContours',
    geometryDigest: s.geometryDigest,
    sectionId: 'section-' + cadGeometryDigest(JSON.stringify([s.geometryDigest, options])).slice(0, 24),
    units: 'mm',
    normal: f.n,
    uAxis: f.u,
    vAxis: f.v,
    origin,
    plane: { origin, normal: f.n, uAxis: f.u, vAxis: f.v },
    nominalPlanePoint: options.planePoint,
    measurementPlanePoint: origin,
    sectionShift: shift,
    frame,
    totalLoops: all.length,
    returnedLoops: loops.length,
    complete: isComplete,
    status: isComplete ? 'complete' : 'incomplete',
    closed: !hasRejected,
    rejectedComponents: diagnostics?.rejectedComponents ?? 0,
    openProfile: hasRejected
      ? { role: 'outer', status: 'incomplete', closed: false, uncertainty: 'Unterbrochener oder offener Schnitt' }
      : null,
    outerLoops,
    outerProfile,
    innerLoops,
    innerCircles,
    loops,
    sketch,
    sketchUnavailable: sketch
      ? null
      : missingParents.length
        ? 'Selected holes need their parent outlines.'
        : 'Native sketches support at most 128 elements; request fewer complete loops or use measured line/arc data.',
    sourcePreserved: true,
    fitTolerance: tolerance,
    limitations:
      'Complete ordered closed contours of original triangles at the disclosed measurement plane. Circle/arc/line fitting bounds apply only to these 2D polylines. No shape or tolerance guarantee between sections, no automatic repair. Sketch height is a placeholder of 1 mm; choose the required extrusion height and construction plane explicitly.',
  };
}

/** Map a 2D section plane point [u, v] to a 3D world coordinate [x, y, z] using the section frame. */
export function planePointToWorld(point2d, frameOrSection) {
  const frame = Array.isArray(frameOrSection) ? frameOrSection : frameOrSection?.frame;
  if (!Array.isArray(frame) || frame.length !== 16) throw Error('Gültigen 4x4-Ebenenrahmen übergeben.');
  const [u, v] = point2d;
  return [
    frame[12] + u * frame[0] + v * frame[4],
    frame[13] + u * frame[1] + v * frame[5],
    frame[14] + u * frame[2] + v * frame[6],
  ];
}

/** Map a 3D world coordinate [x, y, z] to the 2D section plane [u, v]. */
export function worldPointToPlane(point3d, frameOrSection) {
  const frame = Array.isArray(frameOrSection) ? frameOrSection : frameOrSection?.frame;
  if (!Array.isArray(frame) || frame.length !== 16) throw Error('Gültigen 4x4-Ebenenrahmen übergeben.');
  const dx = point3d[0] - frame[12],
    dy = point3d[1] - frame[13],
    dz = point3d[2] - frame[14];
  return [dx * frame[0] + dy * frame[1] + dz * frame[2], dx * frame[4] + dy * frame[5] + dz * frame[6]];
}
