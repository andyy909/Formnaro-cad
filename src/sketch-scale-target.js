import { drawnMeasurement } from './sketch-draw-dimensions.js';
import { resizeSelectedCircle } from './sketch-selected-circle.js';
import { resizeSelectedRectangle, sketchRectangleGeometry } from './sketch-selected-rectangle.js';
import { appendProfileLoop, profilePrimitive } from './sketch-profile.js';
import { sketchLiteral } from './sketch-constraints-data.js';

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cornerDirections = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

function measuredGeometry(target, data) {
  if (target.shape !== 'rectangle' || !target.ids) return drawnMeasurement(target, data);
  const rectangle = sketchRectangleGeometry(target.ids, data);
  if (!rectangle) return null;
  const { min: start, max: end } = rectangle;
  return { start, end, values: { x: end[0] - start[0], y: end[1] - start[1] } };
}

export function sketchScaleTarget(sketch, data, point, tolerance) {
  const circles = data.geometry?.elements.filter((element) => element.type === 'circle' && !element.construction) ?? [];
  const candidates = circles.flatMap(({ id, center, radius }) => {
    const separation = distance(center, point);
    return separation <= radius + tolerance
      ? [{ score: Math.abs(separation - radius), target: { shape: 'circle', ids: [id] } }]
      : [];
  });
  if (sketch.version === 1 && sketch.kind === 'circle' && data.resolved) {
    const radius = data.resolved.diameter / 2, separation = Math.hypot(...point);
    if (separation <= radius + tolerance)
      candidates.push({ score: Math.abs(separation - radius), target: { shape: 'circle' } });
  }
  if (candidates.length) return candidates.sort((a, b) => a.score - b.score)[0].target;
  const shapes = sketch.version === 1 && sketch.kind === 'rectangle' && data.resolved
    ? [{ shape: 'rectangle' }] : (sketch.loops ?? []).map(({ elements: ids }) => ({ shape: 'rectangle', ids }));
  for (const target of shapes) {
    const measurement = measuredGeometry(target, data);
    if (!measurement) continue;
    const { start: [x, y], end: [right, top] } = measurement;
    if (point[0] < x - tolerance || point[0] > right + tolerance ||
        point[1] < y - tolerance || point[1] > top + tolerance) continue;
    const corner = point.map((value, axis) => value < [x + right, y + top][axis] / 2 ? -1 : 1);
    return { ...target, direction: corner };
  }
  return null;
}

export function sketchScaleHandles(target, data) {
  const measured = measuredGeometry(target, data);
  if (!measured) return [];
  const { start, end, values } = measured;
  if (target.shape === 'circle') {
    return cornerDirections.map(([x, y]) => [
      start[0] + x * values.radius / Math.SQRT2,
      start[1] + y * values.radius / Math.SQRT2,
    ]);
  }
  return cornerDirections.map(([x, y]) => [x < 0 ? start[0] : end[0], y < 0 ? start[1] : end[1]]);
}

export function sketchScaleMeasurement(target, data) {
  const measured = measuredGeometry(target, data);
  if (target.shape !== 'circle' || !measured) return measured;
  const { start, values: { radius } } = measured;
  return {
    start: [start[0] - radius, start[1]],
    end: [start[0] + radius, start[1]],
    values: { diameter: 2 * radius },
  };
}

export function resizeSketchScaleTarget(sketch, target, data, key, value) {
  return target.shape === 'circle'
    ? resizeSelectedCircle(sketch, target.ids?.[0], value)
    : resizeSelectedRectangle(sketch, target, data, key, value);
}

export function sketchScaleDrag(target, data, point, origin) {
  const { start, end, values } = measuredGeometry(target, data);
  if (target.shape === 'circle') {
    const diameter = 2 * (values.radius + distance(start, point) - distance(start, origin));
    return { diameter };
  }
  return Object.fromEntries(['x', 'y'].map((key, axis) => [
    key, end[axis] - start[axis] + target.direction[axis] * (point[axis] - origin[axis]),
  ]));
}

export function prepareSketchScale(sketch, target, data) {
  if (target.shape !== 'rectangle' || target.ids) return { sketch, target };
  const { width, depth, height } = sketch.dimensions;
  if (![width, depth].every(sketchLiteral))
    throw Error('Die Rechteckgröße ist über eine Formel gebunden. Zuerst das Ausgangsmaß ändern.');
  const { start, end } = drawnMeasurement(target, data);
  const sides = profilePrimitive('rectangle', start, end);
  return {
    sketch: appendProfileLoop({
      version: 2, kind: 'profile', variables: sketch.variables, dimensions: { height }, elements: [], loops: [],
    }, sides, 'outer'),
    target: { ...target, ids: sides.map(({ id }) => id) },
  };
}

export function assertSketchScaleMaintained(proposedData, solvedData) {
  const expected = proposedData.geometry?.elements, solved = solvedData.geometry?.elements;
  const same = expected && solved && expected.length === solved.length && expected.every((element) => {
    const current = solved.find(({ id }) => id === element.id);
    if (!current || current.type !== element.type) return false;
    const fields = Object.keys(element).filter((key) =>
      ['start', 'end', 'through', 'center'].includes(key) || /^control\d+$/.test(key));
    return fields.every((key) => distance(element[key], current[key]) <= 1e-5) &&
      (element.radius === undefined || Math.abs(element.radius - current.radius) <= 1e-5);
  });
  if (!same) throw Error('Die vorhandenen Skizzenbedingungen verhindern dieses Zielmaß.');
}
