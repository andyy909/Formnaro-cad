import { moveSketchPoints } from './sketch-interaction.js';
import { moveProfilePoints } from './sketch-profile.js';

function isPoint(point) {
  return Array.isArray(point) && point.length === 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

export function sketchContourHandles(sketch, handles, source) {
  const references = handles[source]?.references ?? [];
  const group = sketch.loops.find((loop) => references.some(({ id }) => loop.elements.includes(id)));
  const members = new Set(group?.elements ?? references.slice(0, 1).map(({ id }) => id));
  return handles.flatMap((handle, index) => handle.references.some(({ id }) => members.has(id)) ? [index] : []);
}

export function alignSketchPoints(sketch, { points, source, target, axes, selected = [source] }, expression) {
  const indices = [...new Set(selected)];
  const hasPoint = (index) => Number.isInteger(index) && index >= 0 && isPoint(points?.[index]);
  if (!indices.includes(source) || !indices.every(hasPoint)) throw Error('Gültige Skizzenpunkte zum Ausrichten auswählen.');
  if (!['x', 'y', 'xy'].includes(axes)) throw Error('Zum Ausrichten X, Y oder beide Achsen wählen.');

  const targetPoint = hasPoint(target) ? points[target] : target;
  if (!isPoint(targetPoint)) throw Error('Einen Bezugspunkt zum Ausrichten wählen.');
  if (indices.includes(target)) throw Error('Einen Bezugspunkt außerhalb der Auswahl wählen.');

  const delta = points[source].map((coordinate, axis) =>
    axes.includes(axis === 0 ? 'x' : 'y') ? targetPoint[axis] - coordinate || 0 : 0,
  );
  if (delta.some((offset) => !Number.isFinite(offset))) throw Error('Der Ausrichtungsversatz ist zu groß.');
  if (delta.every((offset) => Math.abs(offset) < 1e-8)) throw Error('Die Auswahl ist bereits so ausgerichtet.');

  const aligned = [2, 3, 4].includes(sketch.version)
    ? moveProfilePoints(sketch, indices, delta, expression)
    : moveSketchPoints(sketch, indices, delta);
  return { sketch: aligned, delta };
}
