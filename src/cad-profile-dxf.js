const degrees = (radians) => ((((radians * 180) / Math.PI) % 360) + 360) % 360;

/** ASCII DXF model-space geometry in millimetres. */
export function cadProfileDxf({ loops }, { polylines = false } = {}) {
  const pairs = [];
  const put = (...values) => {
    for (const value of values) {
      if (typeof value === 'number' && !Number.isFinite(value)) throw Error('DXF enthält keine endliche Koordinate.');
      pairs.push(String(value));
    }
  };
  const point = (code, [x, y]) => put(code, x, code + 10, y);
  const entity = (name, subclass) => put(0, name, 100, 'AcDbEntity', 8, '0', 100, subclass);

  put(
    0,
    'SECTION',
    2,
    'HEADER',
    9,
    '$ACADVER',
    1,
    'AC1015',
    9,
    '$INSUNITS',
    70,
    4,
    9,
    '$MEASUREMENT',
    70,
    1,
    0,
    'ENDSEC',
    0,
    'SECTION',
    2,
    'ENTITIES',
  );
  for (const { entities } of loops) {
    if (polylines && entities[0].type !== 'circle') {
      entity('LWPOLYLINE', 'AcDbPolyline');
      put(90, entities.length, 70, 1);
      for (const edge of entities) {
        point(10, edge.start);
        if (edge.type === 'arc') put(42, Math.tan(edge.sweep / 4));
      }
      continue;
    }
    for (const edge of entities) {
      if (edge.type === 'line') {
        entity('LINE', 'AcDbLine');
        point(10, edge.start);
        point(11, edge.end);
      } else if (edge.type === 'circle') {
        entity('CIRCLE', 'AcDbCircle');
        point(10, edge.center);
        put(40, edge.radius);
      } else if (edge.type === 'arc') {
        entity('ARC', 'AcDbCircle');
        point(10, edge.center);
        put(40, edge.radius, 100, 'AcDbArc');
        const end = edge.startAngle + edge.sweep;
        put(50, degrees(edge.sweep > 0 ? edge.startAngle : end), 51, degrees(edge.sweep > 0 ? end : edge.startAngle));
      } else throw Error('Nicht unterstütztes DXF-Konturelement.');
    }
  }
  put(0, 'ENDSEC', 0, 'EOF');
  return pairs.join('\r\n') + '\r\n';
}
