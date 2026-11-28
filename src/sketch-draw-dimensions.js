import { dimensionSketchElement } from './sketch-tools.js';
import { profilePrimitive } from './sketch-profile.js';

export function drawingSize(shape, start, end) {
  const x = Math.abs(end[0] - start[0]);
  const y = Math.abs(end[1] - start[1]);
  if (['rectangle', 'roundrect', 'slot'].includes(shape)) return { x, y };
  if (shape === 'circle') return { radius: Math.hypot(x, y) };
  if (shape === 'line' || shape === 'construction') return { length: Math.hypot(x, y) };
  return null;
}

export function drawnMeasurement({ shape, ids }, { geometry, resolved }) {
  if (!ids) {
    if (!resolved) return null;
    if (shape === 'circle') {
      const radius = resolved.diameter / 2;
      return { start: [0, 0], end: [radius, 0], values: { radius } };
    }
    const [x, y] = resolved.size;
    return { start: [-x / 2, -y / 2], end: [x / 2, y / 2], values: { x, y } };
  }
  const elements = ids.map((id) => geometry?.elements.find((element) => element.id === id));
  if (elements.some((element) => !element)) return null;
  const [first, , opposite] = elements;
  if (shape === 'circle') {
    const { center, radius } = first;
    return { start: center, end: [center[0] + radius, center[1]], values: { radius } };
  }
  const start = first.start;
  const end = shape === 'rectangle' ? opposite.start : first.end;
  return { start, end, values: drawingSize(shape, start, end) };
}

export function drawnSize(target, data) {
  return drawnMeasurement(target, data)?.values ?? null;
}

export function resizeDrawnShape(sketch, target, data, key, value) {
  const size = drawnSize(target, data);
  if (!size || !Object.hasOwn(size, key)) throw Error('Die gezeichnete Form ist nicht mehr verfügbar.');
  const minimum = key === 'radius' || key === 'length' ? 0.005 : 0.01;
  const maximum = key === 'radius' ? 5000 : 10000;
  if (!Number.isFinite(value) || value < minimum || value > maximum)
    throw Error('Maß muss zwischen ' + minimum.toLocaleString('de-DE') + ' und ' + maximum.toLocaleString('de-DE') + ' mm liegen.');

  const { shape, ids, direction } = target;
  if (ids && shape !== 'rectangle') return dimensionSketchElement(sketch, ids[0], key, String(value));
  const result = structuredClone(sketch);
  if (!ids) {
    const dimension = { radius: 'diameter', x: 'width', y: 'depth' }[key];
    result.dimensions[dimension] = String(key === 'radius' ? 2 * value : value);
    return result;
  }

  const corner = direction.map((sign, axis) => data.geometry.elements.find(
    (element) => element.id === ids[sign < 0 ? 2 : 0],
  ).start[axis]);
  size[key] = value;
  const opposite = corner.map((coordinate, axis) => coordinate + direction[axis] * (axis === 0 ? size.x : size.y));
  const sides = profilePrimitive('rectangle', corner, opposite);
  for (const [index, id] of ids.entries()) {
    const element = result.elements.find((element) => element.id === id);
    element.start = sides[index].start;
    element.end = sides[index].end;
  }
  return result;
}
