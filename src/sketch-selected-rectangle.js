// Resize an axis-aligned four-sided sketch loop around its opposite corner.
import { sketchLiteral } from './sketch-constraints-data.js';
import { resizeDrawnShape } from './sketch-draw-dimensions.js';

const tolerance = 1e-7;
const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tolerance;
const cornersAt = (min, max) => [min, [max[0], min[1]], max, [min[0], max[1]]];

export function sketchRectangleGeometry(ids, data) {
  if (ids.length !== 4 || new Set(ids).size !== 4) return null;
  const elements = ids.map((id) => data.geometry?.elements.find((element) => element.id === id));
  if (elements.some((element) => element?.type !== 'line' || element.construction)) return null;
  const points = elements.flatMap(({ start, end }) => [start, end]);
  const min = [0, 1].map((axis) => Math.min(...points.map((point) => point[axis])));
  const max = [0, 1].map((axis) => Math.max(...points.map((point) => point[axis])));
  if (max.some((value, axis) => value - min[axis] <= tolerance)) return null;
  const corners = cornersAt(min, max);
  const cornersFor = (point) => corners.findIndex((corner) => near(point, corner));
  const sides = elements.map(({ start, end }) => [cornersFor(start), cornersFor(end)]);
  if (sides.some(([a, b]) => a < 0 || b < 0 || Math.abs(a - b) % 2 !== 1)) return null;
  if (new Set(sides.map(([a, b]) => Math.min(a, b) + ':' + Math.max(a, b))).size !== 4) return null;
  return { min, max, corners, sides };
}

export function resizeSelectedRectangle(sketch, target, data, key, value) {
  if (target?.shape !== 'rectangle') throw Error('Ein ausgewähltes Rechteck erforderlich.');
  if (key !== 'x' && key !== 'y') throw Error('Rechteck: Gesamtmaß x oder y wählen.');
  if (!Number.isFinite(value) || value < 0.01 || value > 10000)
    throw Error('Maß muss zwischen 0,01 und 10000 mm liegen.');
  const { ids, direction } = target;
  if (ids == null) {
    if (sketch?.version !== 1 || sketch.kind !== 'rectangle')
      throw Error('Ohne Seitenkennungen ist nur die alte Rechteck-Grundform bearbeitbar.');
    return resizeDrawnShape(sketch, target, data, key, value);
  }
  if (sketch?.kind !== 'profile' || !Array.isArray(ids) || !sketch.loops?.some(
    (loop) => loop.elements.length === 4 && ids.length === 4 && ids.every((id) => loop.elements.includes(id)),
  )) throw Error('Die gewählten Seiten bilden keine geschlossene Rechteckkontur.');
  if (!Array.isArray(direction) || direction.length !== 2 || !direction.every((sign) => sign === 1 || sign === -1))
    throw Error('Richtung vom festgehaltenen zum bewegten Eckpunkt fehlt.');
  const rectangle = sketchRectangleGeometry(ids, data);
  if (!rectangle) throw Error('Die ausgewählten Seiten bilden kein achsenparalleles Rechteck.');
  const { min, max, corners, sides } = rectangle;
  const selected = ids.map((id) => sketch.elements.find((element) => element.id === id));
  if (selected.some((element) => !element || ![...element.start, ...element.end].every(sketchLiteral)))
    throw Error('Formelgebundene Rechteckseite: das steuernde Maß bearbeiten.');
  const size = [max[0] - min[0], max[1] - min[1]];
  size[key === 'x' ? 0 : 1] = value;
  const fixed = direction.map((sign, axis) => sign < 0 ? max[axis] : min[axis]);
  const moving = fixed.map((point, axis) => point + direction[axis] * size[axis]);
  const nextCorners = cornersAt(
    fixed.map((point, axis) => Math.min(point, moving[axis])),
    fixed.map((point, axis) => Math.max(point, moving[axis])),
  );
  const moved = corners.filter((corner, index) => !near(corner, nextCorners[index]));
  const linked = data.geometry.elements.some((element) => !ids.includes(element.id) && element.type !== 'circle' &&
    [element.start, element.end].some((point) => Array.isArray(point) && moved.some((corner) => near(point, corner))));
  if (linked) throw Error('Geometriebindung: Nachbargeometrie hängt am bewegten Eckpunkt und würde abreißen.');

  const result = structuredClone(sketch);
  for (const [index, [a, b]] of sides.entries()) {
    const element = result.elements.find(({ id }) => id === ids[index]);
    element.start = nextCorners[a].map(String);
    element.end = nextCorners[b].map(String);
  }
  return result;
}
