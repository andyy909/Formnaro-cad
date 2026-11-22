import { meshContourGeometry as geometry } from './mesh-lid.js';
import { meshPlanarPatches } from './mesh-features.js';
import { meshSectionContours } from './mesh-section-contours.js';

const MAX_AXES = 3;
const MAX_PLANES = 12;
const MAX_RESULTS = 16;
const CENTER_TOLERANCE_MM = 0.08;
const { dot, sub } = geometry;
const rounded = (value) => Number(value.toFixed(5));

function onSameAxis(a, b, normal) {
  const delta = sub(a.center, b.center);
  const along = dot(delta, normal);
  return Math.hypot(...delta.map((value, i) => value - normal[i] * along)) <= CENTER_TOLERANCE_MM;
}

function sameDiameter(a, b) {
  return Math.abs(a.diameter - b.diameter) <= 2 * (a.fitErrorBound + b.fitErrorBound) + 0.004;
}

function uniqueMatch(circle, others, normal, matches) {
  const candidates = others.filter((other) => onSameAxis(circle, other, normal) && matches(circle, other));
  return candidates.length === 1 ? candidates[0] : undefined;
}

function measureBands(node, frame, levels) {
  const measure = (t) => {
    try {
      const section = meshSectionContours(node, {
        normal: frame.n, planePoint: frame.world([0, 0, t]), summaryOnly: true,
      });
      return section.measurements.filter(({ kind, role }) => kind === 'circle' && role !== 'outer');
    } catch (error) {
      if (!['MESH_LID_SECTION', 'MESH_SECTION_CONTOURS'].includes(error.code)) throw error;
      return [];
    }
  };
  return levels.slice(1).map((end, index) => {
    const start = levels[index], inset = Math.min(0.04, (end - start) / 4);
    if (end - start < 0.08) return [];
    const low = measure(start + inset), middle = measure((start + end) / 2), high = measure(end - inset);
    return middle.flatMap((circle) => {
      const first = uniqueMatch(circle, low, frame.n, sameDiameter);
      const last = uniqueMatch(circle, high, frame.n, sameDiameter);
      if (!first || !last || !sameDiameter(first, last)) return [];
      const confirmed = [first, circle, last].filter((sample) => sample.role === 'hole').length;
      return [{ ...circle, start, end, inset, confirmed,
        fitErrorBound: Math.max(first.fitErrorBound, circle.fitErrorBound, last.fitErrorBound) }];
    });
  });
}

function stageInfo(circle, bands, index, direction, frame) {
  let edge = circle;
  let partial = circle.confirmed !== 3;
  for (let i = index + direction; bands[i]; i += direction) {
    const match = uniqueMatch(circle, bands[i], frame.n, sameDiameter);
    if (!match) break;
    partial ||= match.confirmed !== 3;
    edge = match;
  }
  const first = direction < 0 ? edge : circle, last = direction > 0 ? edge : circle;
  const centerProjection = dot(sub(circle.center, frame.anchor), frame.n);
  const worldPoint = (t) => circle.center.map((value, i) => rounded(value + frame.n[i] * (t - centerProjection)));
  return {
    diameterMM: rounded(circle.diameter),
    diameterFitBoundMM: rounded(2 * circle.fitErrorBound),
    from: worldPoint(first.start),
    to: worldPoint(last.end),
    depthBetweenPlanesMM: rounded(last.end - first.start),
    sampleInsetFromEndsMM: [rounded(first.inset), rounded(last.inset)],
    ...(partial ? { includesUnclassifiedSections: true } : {}),
  };
}

// Evidence for abrupt diameter changes. Only closed hole loops on both sides
// seed a step. Open sections can extend an already identified diameter band.
export function measuredSteppedBores(node) {
  if (!node.mesh?.triangles?.length || node.mesh.triangles.length / 3 > 100000) return [];
  const source = geometry.source(node);
  const axes = [];
  for (const patch of meshPlanarPatches(source)) {
    let axis = axes.find(({ normal }) => Math.abs(dot(normal, patch.normal)) > 1 - 1e-6);
    if (!axis) {
      axis = { normal: patch.normal, levels: [], area: 0 };
      axes.push(axis);
    }
    axis.area += patch.area;
    const t = dot(sub(patch.point, source.anchor), axis.normal);
    if (axis.levels.length < MAX_PLANES && !axis.levels.some((other) => Math.abs(other - t) < 0.008)) axis.levels.push(t);
  }
  const results = [];
  const differs = (a, b) => a.confirmed >= 2 && b.confirmed >= 2 &&
    Math.abs(a.diameter - b.diameter) >= 0.18 && !sameDiameter(a, b);
  const relevant = axes.filter(({ levels }) => levels.length >= 3).sort((a, b) => b.area - a.area).slice(0, MAX_AXES);
  for (const { normal, levels } of relevant) {
    const frame = geometry.frame(source, normal);
    const bands = measureBands(node, frame, levels.sort((a, b) => a - b));
    for (let i = 1; i < bands.length; i++) {
      for (const before of bands[i - 1]) {
        const after = uniqueMatch(before, bands[i], normal, differs);
        if (!after || uniqueMatch(after, bands[i - 1], normal, differs) !== before) continue;
        results.push({
          axis: normal.map(rounded),
          stages: [stageInfo(before, bands, i - 1, -1, frame), stageInfo(after, bands, i, 1, frame)],
        });
      }
    }
  }
  const diameterChange = ({ stages: [a, b] }) => Math.abs(a.diameterMM - b.diameterMM);
  return results.sort((a, b) => diameterChange(b) - diameterChange(a)).slice(0, MAX_RESULTS);
}
