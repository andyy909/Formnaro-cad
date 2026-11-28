const MM_DECIMALS = 6;
const TWO_PI = Math.PI * 2;
const ANGLE_TOLERANCE = 1e-9;
// Endpoint agreement between contour elements, matching JOIN_TOLERANCE in sketch-profile.js.
const ENDPOINT_TOLERANCE = 1e-7;
// Only elements without any length are rejected, so a short valid CAD edge survives.
const MIN_LENGTH = 1e-8;
const STYLE = 'fill="none" stroke="#000000" stroke-width="0.25"';

function fail(message) {
  throw Error(`SVG-Profil: ${message}`);
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function readBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') fail('Grenzen {x, y, width, height} fehlen.');
  const { x, y, width, height } = bounds;
  if (![x, y, width, height].every(finite)) fail('Grenzen brauchen endliche Zahlen für x, y, width und height.');
  if (!(width > 0) || !(height > 0)) fail('Grenzen brauchen eine positive Breite und Höhe.');
  return { x, y, width, height };
}

function readPoint(point, label) {
  if (!Array.isArray(point) || point.length !== 2 || !point.every(finite))
    fail(`${label} braucht einen Punkt [x, y] aus endlichen Zahlen.`);
  return [point[0], point[1]];
}

function readRadius(entity, label) {
  if (!finite(entity.radius)) fail(`${label} braucht einen endlichen Radius.`);
  if (!(entity.radius > 0)) fail(`${label} braucht einen positiven Radius.`);
  if (formatMm(entity.radius) === '0') fail(`${label} hat einen für die SVG-Ausgabe zu kleinen Radius.`);
  return entity.radius;
}

function readAngle(value, label) {
  if (!finite(value)) fail(`${label} braucht einen endlichen Winkel in Radiant.`);
  return value;
}

function pointDistance(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

function pointAt(center, radius, angle) {
  return [center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)];
}

function normalizeAngle(angle) {
  const wrapped = angle % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

function onArc(angle, startAngle, sweep) {
  if (sweep > 0) {
    const offset = normalizeAngle(angle - startAngle);
    return offset <= sweep + ANGLE_TOLERANCE || TWO_PI - offset <= ANGLE_TOLERANCE;
  }
  const backward = normalizeAngle(startAngle - angle);
  return backward <= -sweep + ANGLE_TOLERANCE || TWO_PI - backward <= ANGLE_TOLERANCE;
}

function assertInsideBounds(point, bounds, label) {
  const [x, y] = point;
  if (
    x < bounds.x - ENDPOINT_TOLERANCE ||
    x > bounds.x + bounds.width + ENDPOINT_TOLERANCE ||
    y < bounds.y - ENDPOINT_TOLERANCE ||
    y > bounds.y + bounds.height + ENDPOINT_TOLERANCE
  )
    fail(`${label} liegt außerhalb der Grenzen.`);
}

function readLine(entity, label, bounds) {
  const start = readPoint(entity.start, `${label} (start)`),
    end = readPoint(entity.end, `${label} (end)`);
  if (pointDistance(start, end) < MIN_LENGTH) fail(`${label} hat keine Länge.`);
  assertInsideBounds(start, bounds, `${label} (start)`);
  assertInsideBounds(end, bounds, `${label} (end)`);
  return { kind: 'line', start, end };
}

function readCircle(entity, label, bounds) {
  const center = readPoint(entity.center, `${label} (center)`),
    radius = readRadius(entity, label);
  for (const [dx, dy] of [
    [-radius, -radius],
    [radius, radius],
  ])
    assertInsideBounds([center[0] + dx, center[1] + dy], bounds, `${label} (Umriss)`);
  return { kind: 'circle', center, radius };
}

function readArc(entity, label, bounds) {
  const center = readPoint(entity.center, `${label} (center)`),
    radius = readRadius(entity, label),
    startAngle = readAngle(entity.startAngle, `${label} (startAngle)`),
    sweep = readAngle(entity.sweep, `${label} (sweep)`),
    start = readPoint(entity.start, `${label} (start)`),
    end = readPoint(entity.end, `${label} (end)`);
  if (!(Math.abs(sweep) > ANGLE_TOLERANCE)) fail(`${label} hat keinen Bogen (sweep ist 0).`);
  if (!(Math.abs(sweep) < TWO_PI - ANGLE_TOLERANCE))
    fail(`${label} braucht |sweep| < 2π; ein Vollkreis ist type "circle".`);
  if (pointDistance(start, end) < MIN_LENGTH) fail(`${label} hat keine Länge.`);
  if (pointDistance(start, pointAt(center, radius, startAngle)) > ENDPOINT_TOLERANCE)
    fail(`${label}: start passt nicht zu startAngle und Radius.`);
  if (pointDistance(end, pointAt(center, radius, startAngle + sweep)) > ENDPOINT_TOLERANCE)
    fail(`${label}: end passt nicht zu startAngle, sweep und Radius.`);
  for (const point of [start, end]) assertInsideBounds(point, bounds, label);
  for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2])
    if (onArc(angle, startAngle, sweep)) assertInsideBounds(pointAt(center, radius, angle), bounds, `${label} (Bogen)`);
  return { kind: 'arc', center, radius, sweep, start, end };
}

function readSegment(entity, label, bounds) {
  if (!entity || typeof entity !== 'object') fail(`${label} ist kein Objekt.`);
  if (entity.type === 'line') return readLine(entity, label, bounds);
  if (entity.type === 'circle') return readCircle(entity, label, bounds);
  if (entity.type === 'arc') return readArc(entity, label, bounds);
  fail(
    `${label}: Nicht unterstützter Typ ${JSON.stringify(entity.type)}. ` +
      'Unterstützt sind "line", "circle" und "arc".',
  );
}

function readLoops(loops, bounds) {
  if (!Array.isArray(loops) || !loops.length) fail('Mindestens eine Kontur (loops) ist erforderlich.');
  let outerCount = 0;
  const contours = loops.map((loop, loopIndex) => {
    const loopLabel = `Kontur ${loopIndex + 1}`;
    if (!loop || typeof loop !== 'object') fail(`${loopLabel} ist kein Objekt.`);
    const { role, entities } = loop;
    if (role !== 'outer' && role !== 'hole') fail(`${loopLabel} braucht die Rolle "outer" oder "hole".`);
    if (role === 'outer') outerCount += 1;
    if (!Array.isArray(entities) || !entities.length) fail(`${loopLabel} braucht mindestens einen Konturzug.`);
    const segments = entities.map((entity, entityIndex) =>
      readSegment(entity, `${loopLabel}, Konturzug ${entityIndex + 1}`, bounds),
    );
    if (segments.length > 1 && segments.some((segment) => segment.kind === 'circle'))
      fail(`${loopLabel} mischt einen Kreis mit weiteren Konturzügen; ein Kreis braucht eine eigene Kontur.`);
    if (!(segments.length === 1 && segments[0].kind === 'circle')) {
      for (let index = 1; index < segments.length; index += 1)
        if (pointDistance(segments[index - 1].end, segments[index].start) > ENDPOINT_TOLERANCE)
          fail(`${loopLabel} ist nicht geschlossen: Konturzug ${index} endet nicht am Start des nächsten.`);
      if (pointDistance(segments[segments.length - 1].end, segments[0].start) > ENDPOINT_TOLERANCE)
        fail(`${loopLabel} ist nicht geschlossen: Ende und Start fallen nicht zusammen.`);
    }
    return { role, segments };
  });
  if (!outerCount) fail('Mindestens eine Außenkontur (role: "outer") ist erforderlich.');
  return contours;
}

function formatMm(value) {
  if (!Number.isFinite(value)) fail('Maß liegt außerhalb des Zahlenbereichs.');
  const rounded = Math.round(value * 10 ** MM_DECIMALS) / 10 ** MM_DECIMALS;
  if (rounded === 0) return '0';
  const text = String(rounded);
  if (!/e/i.test(text)) return text;
  return rounded.toFixed(MM_DECIMALS).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Serialises validated, closed contours as an unfilled millimetre SVG.
 * CAD millimetres use Y up; the returned SVG uses local coordinates with Y
 * down, so bounds {x, y, width, height} map onto viewBox "0 0 width height".
 *
 * Entities follow the resolved sketch contract: "line" {start, end},
 * "circle" {center, radius} and "arc" {center, radius, startAngle, sweep,
 * start:[x,y], end:[x,y]}. The arc angles are radians from +X in CAD
 * orientation (Y up); the signed sweep selects direction and size, positive
 * turning counter-clockwise and |sweep| > π drawing the large arc. Both
 * endpoints must agree with centre, radius, startAngle and sweep within
 * 1e-7 mm. A circle becomes a <circle cx cy r> element so it round-trips as a
 * single circular sketch entity, and arcs become analytic "A" path commands.
 */
export function cadProfileSvg({ loops, bounds } = {}) {
  const frame = readBounds(bounds),
    contours = readLoops(loops, frame),
    toX = (value) => formatMm(value - frame.x),
    toY = (value) => formatMm(frame.y + frame.height - value),
    width = formatMm(frame.width),
    height = formatMm(frame.height);
  const arcCommand = (end, radius, sweep) => {
    // Mirroring Y flips the visual turn, so a positive CAD sweep becomes SVG sweep-flag 0.
    const largeArc = Math.abs(sweep) > Math.PI + ANGLE_TOLERANCE ? 1 : 0,
      sweepFlag = sweep > 0 ? 0 : 1;
    return ` A${formatMm(radius)} ${formatMm(radius)} 0 ${largeArc} ${sweepFlag} ${toX(end[0])} ${toY(end[1])}`;
  };
  const segmentCommand = (segment) =>
    segment.kind === 'line'
      ? ` L${toX(segment.end[0])} ${toY(segment.end[1])}`
      : arcCommand(segment.end, segment.radius, segment.sweep);
  const pathData = (segments) => {
    // The closing "Z" draws the last line itself, so only a trailing arc needs an explicit command.
    const drawn = segments.slice(0, -1).map(segmentCommand);
    if (segments[segments.length - 1].kind === 'arc') drawn.push(segmentCommand(segments[segments.length - 1]));
    return `M${toX(segments[0].start[0])} ${toY(segments[0].start[1])}` + drawn.join('') + ' Z';
  };
  const shapes = contours.map(({ role, segments }) => {
    if (segments.length === 1 && segments[0].kind === 'circle') {
      const { center, radius } = segments[0];
      return (
        `<circle data-role="${role}" cx="${toX(center[0])}" cy="${toY(center[1])}" ` +
        `r="${formatMm(radius)}" ${STYLE}/>`
      );
    }
    return `<path data-role="${role}" d="${pathData(segments)}" ${STYLE}/>`;
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" ` +
    `viewBox="0 0 ${width} ${height}">\n  ${shapes.join('\n  ')}\n</svg>`
  );
}
