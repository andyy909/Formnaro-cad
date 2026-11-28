// Pure 2D sketch move difference in local millimetres. No editor state, no rounding.
function coordinate(point, label) {
  if (!Array.isArray(point) || point.length !== 2 || !point.every((value) => Number.isFinite(value)))
    throw Error(`${label}: zwei endliche mm-Koordinaten erforderlich.`);
  return point;
}
export function sketchMoveDelta(start, end) {
  const from = coordinate(start, 'Start'),
    to = coordinate(end, 'Ziel'),
    delta = [to[0] - from[0], to[1] - from[1]];
  if (!delta.every((value) => Number.isFinite(value)))
    throw Error('Bewegungsdelta liegt außerhalb des endlichen Zahlenbereichs.');
  return delta.map((value) => (value === 0 ? 0 : value));
}
