// Opening side and axis of round holes, derived only from native mesh section
import { SCHEMAS, validParameters } from './parameters.js';
// contours (meshSectionContours) taken along a candidate axis. Pure measurement:
// no reference geometry, no repair, no model mutation. A countersink is reported
// only if a bore plateau and a LINEAR radius ramp with enough resolved samples are
// both measured. Cylinders, steps and everything unresolved stay unproven.
import { meshSectionContours } from './mesh-section-contours.js';
import { analyzeMeshFeatures } from './mesh-features.js';
import { meshContourGeometry as geometry } from './mesh-lid.js';

export const OPENING_LIMITS = Object.freeze({
  minSamples: 7, // sections that must contain the hole
  minPlateau: 2, // bore samples at constant radius
  minRamp: 3, // distinct intermediate samples on the linear ramp
  minHalfAngleDeg: 10, // flatter/steeper ramps cannot be told from a step/chamfer rim
  maxHalfAngleDeg: 80,
  maxTiltDeg: 1.5, // allowed angle between hole axis and section normal
  trackDistance: 0.1, // mm lateral distance to continue a hole track between sections
  radiusSlack: 0.002, // mm added to fit error bounds
  minRise: 0.2, // mm total radius gain of the ramp
});

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const unit = (a) => mul(a, 1 / Math.hypot(...a));
const deg = (r) => (r * 180) / Math.PI;

/** Read one section result into world-space hole circles. */
function readSection(section) {
  const f = section.frame,
    u = [f[0], f[1], f[2]],
    v = [f[4], f[5], f[6]],
    n = [f[8], f[9], f[10]],
    origin = [f[12], f[13], f[14]],
    local = (p) => [dot(sub(p, origin), u), dot(sub(p, origin), v)],
    circles = [],
    other = [];
  for (const loop of section.loops) {
    if (loop.role !== 'hole') continue;
    const e = loop.elements;
    if (e.length === 1 && e[0].type === 'circle' && loop.complete !== false)
      circles.push({
        center: add(origin, add(mul(u, e[0].center[0]), mul(v, e[0].center[1]))),
        radius: e[0].diameter / 2,
        bound: loop.fitErrorBound,
      });
    else other.push(loop.bounds);
  }
  return { n, origin, local, circles, other };
}

function fitLine(xs, ys, bounds) {
  const k = xs.length,
    mx = xs.reduce((a, b) => a + b, 0) / k,
    my = ys.reduce((a, b) => a + b, 0) / k;
  let sxx = 0,
    sxy = 0;
  for (let i = 0; i < k; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  const slope = sxx > 0 ? sxy / sxx : 0,
    icpt = my - slope * mx;
  return {
    slope, intercept: icpt,
    residual: Math.max(...xs.map((x, i) => Math.abs(ys[i] - (icpt + slope * x)))),
    slopeUncertainty: bounds && sxx > 0
      ? xs.reduce((sum, x, i) => sum + Math.abs(x - mx) * bounds[i], 0) / sxx
      : 0,
  };
}

/**
 * Classify the radius profile r(t) of one hole track, t ascending along the axis.
 * Returns { status, reason, ... }. status 'countersink' is the only positive.
 */
export function classifyRadiusProfile(samples, limits = OPENING_LIMITS) {
  const s = [...samples].sort((a, b) => a.t - b.t),
    open = (status, reason, extra = {}) => ({ status, reason, ...extra });
  if (s.length < limits.minSamples) return open('ambiguous', `Nur ${s.length} Schnitte (nötig ${limits.minSamples}).`);
  const maxBound = Math.max(...s.map((x) => x.bound)),
    tol = maxBound + limits.radiusSlack,
    rMin = Math.min(...s.map((x) => x.radius)),
    rMax = Math.max(...s.map((x) => x.radius));
  if (rMax - rMin <= tol + limits.radiusSlack)
    return open('cylinder', 'Radius über alle Schnitte konstant.', { radius: (rMin + rMax) / 2, uncertainty: tol });
  // Bore plateau = samples at the smallest radius; it must sit at one end only.
  const plateauIdx = s.map((x, i) => (Math.abs(x.radius - rMin) <= x.bound + limits.radiusSlack + tol ? i : -1)).filter((i) => i >= 0);
  const lowEnd = plateauIdx[0] === 0 && plateauIdx.every((v, i) => v === i),
    highEnd = plateauIdx.at(-1) === s.length - 1 && plateauIdx.every((v, i) => v === s.length - plateauIdx.length + i);
  if (plateauIdx.length < limits.minPlateau) return open('ambiguous', 'Kein ausreichend langes Bohrungsplateau gemessen.');
  if (!lowEnd && !highEnd) return open('ambiguous', 'Plateau nicht an einem Ende (mehrseitig, Nut oder Tonne).');
  if (lowEnd && highEnd) return open('cylinder', 'Radius konstant.');
  const dir = lowEnd ? 1 : -1, // sign along axis towards the wider part
    ordered = dir === 1 ? s : [...s].reverse(), // plateau first, then widening
    rest = ordered.slice(plateauIdx.length),
    plateauR = ordered.slice(0, plateauIdx.length).reduce((a, x) => a + x.radius, 0) / plateauIdx.length;
  // Radii must be non-decreasing towards the opening within tolerance.
  for (let i = 1; i < ordered.length; i++)
    if (ordered[i].radius < ordered[i - 1].radius - 2 * tol) return open('ambiguous', 'Radius nicht monoton zur Öffnung.');
  const sign = dir,
    pos = (x) => x.t * sign; // increasing from bore to opening
  // Abrupt step: all wider samples share one radius.
  const restMin = Math.min(...rest.map((x) => x.radius)),
    restMax = Math.max(...rest.map((x) => x.radius));
  if (restMax - restMin <= tol + limits.radiusSlack)
    return open('step', 'Absatz mit zwei konstanten Radien, keine lineare Rampe.', {
      boreRadius: plateauR,
      stepRadius: (restMin + restMax) / 2,
    });
  const ramp = rest;
  if (ramp.length < limits.minRamp)
    return open('ambiguous', 'Übergang hat zu wenige aufgelöste Zwischenschnitte.');
  const rampBounds = ramp.map((x) => x.bound + limits.radiusSlack);
  const line = fitLine(ramp.map(pos), ramp.map((x) => x.radius), rampBounds);
  const rise = ramp.at(-1).radius - ramp[0].radius;
  const rampTol = Math.max(...rampBounds);
  const halfAngle = deg(Math.atan(line.slope));
  if (line.residual > rampTol || line.slope <= 0)
    return open('ambiguous', 'Der Verlauf zur Öffnung ist keine durchgehende lineare Rampe.');
  if (rise < Math.max(limits.minRise, 8 * rampTol)) return open('ambiguous', 'Radiusanstieg zu klein gegenüber der Messunsicherheit.');
  if (halfAngle < limits.minHalfAngleDeg || halfAngle > limits.maxHalfAngleDeg)
    return open('ambiguous', `Rampenwinkel ${halfAngle.toFixed(1)}° außerhalb des belegbaren Bereichs.`);
  // The ramp must meet the bore plateau between the last plateau sample and the first ramp sample.
  const posStart = (plateauR - line.intercept) / line.slope,
    lastPlateau = pos(ordered[plateauIdx.length - 1]),
    eps = rampTol / line.slope + 1e-6;
  if (posStart < lastPlateau - eps || posStart > pos(ramp[0]) + eps)
    return open('ambiguous', 'Rampe schließt nicht an das Bohrungsplateau an.');
  const dSlope = line.slopeUncertainty,
    angleLow = deg(Math.atan(Math.max(0, line.slope - dSlope))),
    angleHigh = deg(Math.atan(line.slope + dSlope));
  return {
    status: 'countersink',
    reason: 'Bohrungsplateau plus lineare Rampe mit aufgelösten Zwischenschnitten.',
    openingSign: dir, // +1: wider towards +axis
    boreRadius: plateauR,
    boreRadiusUncertainty: tol,
    halfAngleDegrees: halfAngle,
    halfAngleRangeDegrees: [angleLow, angleHigh],
    rampSamples: ramp.length,
    rampResidual: line.residual,
    rampStartT: posStart * sign,
    maxMeasuredRadius: ordered.at(-1).radius,
  };
}

/** Build tracks of circular hole loops across sections and classify each. */
export function deriveOpeningFromSections(sections, limits = OPENING_LIMITS) {
  const reads = sections.map((s) => readSection(s));
  if (!reads.length) return { tracks: [], positives: [] };
  const n0 = reads[0].n;
  if (reads.some((r) => Math.abs(dot(r.n, n0)) < 1 - 1e-6))
    throw Object.assign(Error('Schnitte müssen parallele Ebenen sein.'), { code: 'OPENING_PROFILE' });
  const lateral = (p) => sub(p, mul(n0, dot(p, n0))),
    tracks = [];
  reads.forEach((r, index) => {
    const t = dot(r.origin, n0),
      taken = new Set();
    for (const c of r.circles) {
      let best = null;
      for (const tr of tracks) {
        const d = Math.hypot(...sub(lateral(c.center), lateral(tr.last)));
        if (d <= limits.trackDistance && (!best || d < best.d)) best = { tr, d };
      }
      if (best && taken.has(best.tr)) best.tr.conflict = true;
      const tr = best?.tr ?? { members: [], last: c.center };
      if (!best) tracks.push(tr);
      taken.add(tr);
      tr.last = c.center;
      tr.members.push({ index, t, ...c });
    }
  });
  const result = tracks.map((tr) => {
    const m = tr.members;
    const problems = [];
    if (tr.conflict) problems.push('Zwei Kreise derselben Ebene gehören zur selben Spur.');
    if (new Set(m.map((sample) => sample.index)).size !== reads.length)
      problems.push('Die Bohrung ist nicht bis zu beiden gemessenen Außenflächen belegt.');
    // A non-circular hole loop around the track centre in any plane is unresolved geometry.
    reads.forEach((r, i) => {
      const c = m.reduce((a, b) => (Math.abs(b.index - i) < Math.abs(a.index - i) ? b : a)),
        [x, y] = r.local(c.center);
      if (r.other.some((b) => x >= b.min[0] && x <= b.max[0] && y >= b.min[1] && y <= b.max[1]))
        problems.push(`Schnitt ${i} enthält an der Bohrung eine nichtkreisförmige Kontur.`);
    });
    // Axis: lateral drift of the measured centres against t.
    const e1 = unit(Math.abs(n0[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]),
      u = unit(sub(e1, mul(n0, dot(e1, n0)))),
      v = [n0[1] * u[2] - n0[2] * u[1], n0[2] * u[0] - n0[0] * u[2], n0[0] * u[1] - n0[1] * u[0]],
      cu = m.map((x) => dot(x.center, u)),
      cv = m.map((x) => dot(x.center, v)),
      tt = m.map((x) => x.t),
      lu = fitLine(tt, cu),
      lv = fitLine(tt, cv),
      direction = unit(add(n0, add(mul(u, lu.slope), mul(v, lv.slope)))),
      tilt = deg(Math.acos(Math.min(1, dot(direction, n0)))),
      lateralResidual = Math.hypot(lu.residual, lv.residual),
      mean = (a) => a.reduce((x, y) => x + y, 0) / a.length,
      tMean = mean(tt),
      point = add(add(mul(n0, tMean), mul(u, lu.intercept + lu.slope * tMean)), mul(v, lv.intercept + lv.slope * tMean)),
      axisTol = Math.max(...m.map((x) => x.bound)) + limits.radiusSlack;
    if (tilt > limits.maxTiltDeg) problems.push(`Achse ${tilt.toFixed(2)}° gegen die Schnittnormale geneigt.`);
    if (lateralResidual > 4 * axisTol) problems.push('Kreismittelpunkte liegen nicht auf einer Achse.');
    const profile = classifyRadiusProfile(m.map(({ t, radius, bound }) => ({ t, radius, bound })), limits),
      axis = { point, direction, tiltDegrees: tilt, lateralResidual, sectionNormal: n0 };
    let status = profile.status,
      reason = profile.reason;
    if (problems.length) {
      status = 'ambiguous';
      reason = problems.join(' ');
    }
    const openingDirection = status === 'countersink' ? mul(direction, profile.openingSign) : null;
    return {
      status,
      reason,
      sections: m.length,
      axis,
      ...(status === 'countersink' ? { ...profile, openingDirection } : { radiusRange: [Math.min(...m.map((x) => x.radius)), Math.max(...m.map((x) => x.radius))] }),
    };
  });
  return { tracks: result, positives: result.filter((x) => x.status === 'countersink') };
}

/** Unique sign-free candidate axes from the existing mesh feature catalog. */
export function candidateAxes(node, { maxCandidates = 8 } = {}) {
  const catalog = analyzeMeshFeatures(node),
    axes = [];
  const push = (normal) => {
    if (!axes.some((a) => Math.abs(dot(a, normal)) > 1 - 1e-6)) axes.push(unit(normal));
  };
  for (const p of catalog.planes) push(p.normal);
  for (const p of catalog.profiles) if (p.circle) push(p.normal);
  return axes.slice(0, maxCandidates);
}

/**
 * Measure and classify all round holes seen along every candidate axis of the mesh.
 * Candidate selection uses only the measured feature catalog.
 */
export function measureOpenings(node, { count = 17, fitTolerance = 0.02, axes } = {}) {
  const found = [];
  const failures = [];
  const source = geometry.source(node);
  const fractions = [0.002, ...Array.from({ length: count }, (_, i) => (i + 0.5137) / count), 0.998];
  for (const normal of axes ?? candidateAxes(node)) {
    const frame = geometry.frame(source, normal);
    const sectionPoint = (t) => frame.world([0, 0, t]);
    const sections = [];
    for (const fraction of fractions) {
      const t = frame.lo + (frame.hi - frame.lo) * fraction;
      try {
        sections.push(meshSectionContours(node, { normal, planePoint: sectionPoint(t), fitTolerance }));
      } catch (error) {
        if (!['MESH_SECTION_CONTOURS', 'MESH_LID_SECTION'].includes(error.code)) throw error;
        failures.push({ normal, t, reason: error.message });
      }
    }
    if (sections.length !== fractions.length) continue;
    const stockRange = [frame.lo, frame.hi].map((t) => dot(sectionPoint(t), normal));
    for (const track of deriveOpeningFromSections(sections).tracks)
      found.push({ ...track, candidateNormal: normal, stockRange });
  }
  // The same hole can be seen along several parallel/anti-parallel candidates only
  // if axes coincide; keep tracks whose axis is a new line.
  const unique = [];
  for (const f of found) {
    const dup = unique.find((u) => {
      if (Math.abs(dot(u.axis.direction, f.axis.direction)) < 1 - 1e-4) return false;
      const d = sub(f.axis.point, u.axis.point);
      return Math.hypot(...sub(d, mul(u.axis.direction, dot(d, u.axis.direction)))) < 0.05;
    });
    if (!dup) unique.push(f);
  }
  return { tracks: unique, positives: unique.filter((x) => x.status === 'countersink'), failedSections: failures };
}

export const DIRECTED_COUNTERSINK_LIMITS = Object.freeze({
  maxTriangles: 100000, // the shared mesh feature/section limit; larger meshes use the ordinary route
  maxAxes: 6, // candidate axes measured (each costs ~19 sections)
  maxResults: 8,
});

const nativeAngle = SCHEMAS.countersink.find(({ key }) => key === 'angle');

const round = (x, digits = 4) => Number(x.toFixed(digits));
const roundVector = (v, digits = 4) => v.map((x) => round(x, digits));

/**
 * Compact, directed countersink measurements in world mm for the model request.
 * Everything is derived from measured sections: no reference values, no repair.
 * Returns [] for anything unproven so the caller can continue without a hint.
 */
export function directedCountersinks(node, limits = DIRECTED_COUNTERSINK_LIMITS) {
  const triangles = (node?.mesh?.triangles?.length ?? 0) / 3;
  if (!triangles || triangles > limits.maxTriangles) return [];
  let positives;
  try {
    const axes = candidateAxes(node, { maxCandidates: limits.maxAxes });
    if (!axes.length) return [];
    positives = measureOpenings(node, { axes }).positives;
  } catch (error) {
    // Unmeasurable meshes continue without a hint; only known measurement refusals are swallowed.
    if (/^(MESH_|OPENING_PROFILE)/.test(error.code ?? '')) return [];
    throw error;
  }
  const out = [];
  for (const track of positives) {
    const n0 = track.axis.sectionNormal,
      sign = track.openingSign,
      flipped = dot(n0, track.candidateNormal) < 0,
      [tLo, tHi] = flipped ? [-track.stockRange[1], -track.stockRange[0]] : track.stockRange,
      surfaceT = sign > 0 ? tHi : tLo,
      direction = track.axis.direction,
      alongAxis = (surfaceT - dot(track.axis.point, n0)) / dot(direction, n0),
      entry = add(track.axis.point, mul(direction, alongAxis)),
      span = sign * surfaceT - sign * track.rampStartT,
      slope = Math.tan((track.halfAngleDegrees * Math.PI) / 180),
      slopeSpread =
        Math.tan((track.halfAngleRangeDegrees[1] * Math.PI) / 180) -
        Math.tan((track.halfAngleRangeDegrees[0] * Math.PI) / 180),
      headRadius = track.boreRadius + slope * span;
    if (!(span > 0) || !Number.isFinite(headRadius) || headRadius <= track.boreRadius) continue;
    const included = 2 * track.halfAngleDegrees,
      range = track.halfAngleRangeDegrees.map((a) => 2 * a),
      angle = Math.min(nativeAngle.max, Math.max(nativeAngle.min, Math.round(included))),
      bore = round(2 * track.boreRadius, 3),
      sinkDiameter = round(2 * headRadius, 3),
      opening = track.openingDirection;
    // The measurement must support a value that the native cutter can use verbatim.
    if (angle < range[0] || angle > range[1] || sinkDiameter <= bore ||
        !validParameters({ type: 'countersink', params: { angle, bore, sinkDiameter } })) continue;
    out.push({
      entryPoint: roundVector(entry),
      openingDirection: roundVector(opening, 6),
      referenceRay: { origin: roundVector(add(entry, mul(opening, 2))), direction: roundVector(mul(opening, -1), 6) },
      boreDiameter: bore,
      headDiameter: sinkDiameter,
      includedAngleDegrees: angle,
      through: true,
      uncertaintyMM: {
        boreDiameter: round(2 * track.boreRadiusUncertainty, 4),
        headDiameter: round(2 * (track.boreRadiusUncertainty + 0.5 * slopeSpread * span), 4),
        entryPosition: round(track.axis.lateralResidual + track.boreRadiusUncertainty, 4),
      },
      includedAngleRangeDegrees: range.map((a) => round(a, 2)),
      sections: track.sections,
    });
    if (out.length >= limits.maxResults) break;
  }
  // Stable order for repeatable requests.
  return out.sort(
    (a, b) => a.entryPoint[0] - b.entryPoint[0] || a.entryPoint[1] - b.entryPoint[1] || a.entryPoint[2] - b.entryPoint[2],
  );
}
