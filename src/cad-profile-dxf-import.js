const UNIT_MM = new Map([
  [1, 25.4],
  [2, 304.8],
  [3, 1609344],
  [4, 1],
  [5, 10],
  [6, 1000],
  [7, 1000000],
  [8, 0.0000254],
  [9, 0.0254],
  [10, 914.4],
  [11, 1e-7],
  [12, 1e-6],
  [13, 0.001],
  [14, 100],
  [15, 10000],
  [16, 100000],
  [17, 1e12],
  [18, 1.495978707e14],
  [19, 9.4607304725808e18],
  [20, 3.085677581491367e19],
  [21, 1200000 / 3937],
  [22, 100000 / 3937],
  [23, 3600000 / 3937],
  [24, 6336000000 / 3937],
]);
const MAX_TEXT = 4 * 1024 * 1024;
const TAU = Math.PI * 2;
const radians = (angle) => (angle * Math.PI) / 180;

function value(record, code, fallback) {
  return record.find((pair) => pair[0] === code)?.[1] ?? fallback;
}

function number(record, code, fallback) {
  const raw = value(record, code, fallback);
  const n = typeof raw === 'string' && !raw ? NaN : Number(raw);
  if (!Number.isFinite(n)) throw Error('Ungültige numerische DXF-Gruppe ' + code + '.');
  return n;
}

function point(record, code) {
  return [number(record, code), number(record, code + 10)];
}

function records(pairs) {
  const out = [];
  let record;
  for (const pair of pairs) {
    if (pair[0] === 0) {
      record = { type: pair[1], values: [] };
      out.push(record);
    } else record?.values.push(pair);
  }
  return out;
}

export function readCadProfileDxf(text) {
  if (text.length > MAX_TEXT || text.includes('\0')) throw Error('Eine ASCII-DXF-Datei bis 4 MiB wählen.');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  if (lines.length < 8 || lines.length % 2) throw Error('Unvollständige DXF-Datei.');
  const sections = new Map();
  let current = null,
    eof = false;
  for (let i = 0; i < lines.length; i += 2) {
    const code = lines[i].trim(),
      raw = lines[i + 1].trim(),
      type = raw.toUpperCase();
    if (!/^\d{1,4}$/.test(code)) throw Error('Ungültiger DXF-Gruppencode.');
    const n = Number(code);
    if (eof) throw Error('Daten nach dem DXF-Dateiende.');
    if (n === 0 && type === 'SECTION') {
      if (current || lines[i + 2]?.trim() !== '2') throw Error('Ungültiger DXF-Abschnitt.');
      const name = lines[i + 3].trim().toUpperCase();
      if (sections.has(name)) throw Error('Doppelter DXF-Abschnitt.');
      current = [];
      sections.set(name, current);
      i += 2;
    } else if (n === 0 && type === 'ENDSEC') {
      if (!current) throw Error('DXF-Abschnitt fehlt.');
      current = null;
    } else if (n === 0 && type === 'EOF') {
      if (current) throw Error('Offener DXF-Abschnitt.');
      eof = true;
    } else if (current) current.push([n, n === 0 ? type : raw]);
    else if (n !== 999) throw Error('DXF-Daten außerhalb eines Abschnitts.');
  }
  if (!eof || !sections.has('ENTITIES')) throw Error('DXF-Modellbereich oder Dateiende fehlt.');
  const header = sections.get('HEADER') ?? [];
  const index = header.findIndex((pair) => pair[0] === 9 && pair[1].toUpperCase() === '$INSUNITS');
  const unit = index >= 0 && header[index + 1]?.[0] === 70 ? UNIT_MM.get(Number(header[index + 1][1])) : null;
  const layerTypes = new Map(
    records(sections.get('TABLES') ?? [])
      .filter((record) => record.type === 'LAYER')
      .map((record) => [value(record.values, 2, '0').toUpperCase(), value(record.values, 6, '').toUpperCase()]),
  );
  const blocks = new Map();
  let block;
  for (const record of records(sections.get('BLOCKS') ?? [])) {
    if (record.type === 'BLOCK') {
      const key = value(record.values, 2, '').toUpperCase();
      if (!key || block || blocks.has(key)) throw Error('Ungültige DXF-Blockdefinition.');
      block = { base: point(record.values, 10), entities: [] };
      blocks.set(key, block);
    } else if (record.type === 'ENDBLK') block = null;
    else block?.entities.push(record);
  }
  if (block) throw Error('Unvollständige DXF-Blockdefinition.');
  return { unit, blocks, layerTypes, entities: records(sections.get('ENTITIES')) };
}

function arc(a, radius, start, sweep) {
  if (!(radius > 0) || !sweep) throw Error('Ungültige DXF-Kreiskurve.');
  const at = (angle) => [a[0] + radius * Math.cos(angle), a[1] + radius * Math.sin(angle)];
  return { type: 'arc', start: at(start), through: at(start + sweep / 2), end: at(start + sweep) };
}

function polyline(values) {
  const vertices = [];
  for (const [code, raw] of values) {
    if (code === 10) vertices.push({ x: Number(raw), bulge: 0 });
    else if (code === 20 && vertices.length) vertices.at(-1).y = Number(raw);
    else if (code === 42 && vertices.length) vertices.at(-1).bulge = Number(raw);
  }
  if (
    vertices.length < 2 ||
    vertices.length > 128 ||
    number(values, 90) !== vertices.length ||
    vertices.some((v) => ![v.x, v.y, v.bulge].every(Number.isFinite))
  )
    throw Error('Ungültige DXF-Polylinie.');
  const closed = number(values, 70, 0) & 1;
  return vertices.slice(0, closed ? vertices.length : -1).map((vertex, i) => {
    const next = vertices[(i + 1) % vertices.length];
    const start = [vertex.x, vertex.y],
      end = [next.x, next.y],
      b = vertex.bulge;
    if (!b) return { type: 'line', start, end };
    return {
      type: 'arc',
      start,
      end,
      through: [(start[0] + end[0] + b * (end[1] - start[1])) / 2, (start[1] + end[1] - b * (end[0] - start[0])) / 2],
    };
  });
}

const drawing = new Set([
  'TEXT',
  'MTEXT',
  'DIMENSION',
  'LEADER',
  'MLEADER',
  'ATTDEF',
  'ATTRIB',
  'SEQEND',
  'HATCH',
  'POINT',
  'SOLID',
  'VIEWPORT',
]);

export function cadDxfEntities(document, unit = document.unit) {
  if (!(Number.isFinite(unit) && unit > 0)) throw Error('Für diese DXF-Datei die Längeneinheit wählen.');
  const entities = [],
    skipped = new Set(),
    layers = new Set();
  let visited = 0;
  function visit(items, transform, depth, scale, parentLayer) {
    if (depth > 12) throw Error('DXF-Blockreferenzen sind zyklisch oder zu tief verschachtelt.');
    for (const { type, values } of items) {
      if (++visited > 4096) throw Error('DXF enthält zu viele referenzierte Elemente.');
      if (number(values, 67, 0) !== 0 || value(values, 410, 'Model').toLowerCase() !== 'model') continue;
      const rawLayer = value(values, 8, '0');
      const layer = rawLayer === '0' ? parentLayer : rawLayer;
      if (drawing.has(type)) {
        skipped.add(type);
        continue;
      }
      if (number(values, 210, 0) || number(values, 220, 0) || number(values, 230, 1) !== 1)
        throw Error('DXF-Element liegt auf einer abweichenden 3D-Ebene.');
      if (type === 'INSERT') {
        const block = document.blocks.get(value(values, 2, '').toUpperCase());
        if (!block) throw Error('DXF-Blockdefinition fehlt.');
        const at = point(values, 10),
          sx = number(values, 41, 1),
          sy = number(values, 42, 1);
        if (
          !sx ||
          Math.abs(Math.abs(sx) - Math.abs(sy)) > Math.abs(sx) * 1e-10 ||
          number(values, 70, 1) !== 1 ||
          number(values, 71, 1) !== 1
        )
          throw Error('DXF-Block mit ungleicher XY-Skalierung oder Rechteckanordnung wird nicht unterstützt.');
        const angle = radians(number(values, 50, 0)),
          c = Math.cos(angle),
          s = Math.sin(angle);
        visit(
          block.entities,
          (p) => {
            const x = (p[0] - block.base[0]) * sx,
              y = (p[1] - block.base[1]) * sy;
            return transform([at[0] + c * x - s * y, at[1] + s * x + c * y]);
          },
          depth + 1,
          scale * Math.abs(sx),
          layer,
        );
        continue;
      }
      if (number(values, 30, 0) || number(values, 31, 0) || number(values, 38, 0))
        throw Error('DXF-Element liegt außerhalb der XY-Ebene.');
      const entityLineType = value(values, 6, 'BYLAYER').toUpperCase();
      const lineType = entityLineType === 'BYLAYER' ? document.layerTypes.get(layer.toUpperCase()) : entityLineType;
      if (['HIDDEN', 'HIDDEN2', 'HIDDENX2'].includes(lineType)) {
        skipped.add(lineType);
        continue;
      }
      let items;
      if (type === 'LINE') items = [{ type: 'line', start: point(values, 10), end: point(values, 11) }];
      else if (type === 'CIRCLE')
        items = [{ type: 'circle', center: point(values, 10), diameter: number(values, 40) * 2 }];
      else if (type === 'ARC') {
        const start = radians(number(values, 50)),
          end = radians(number(values, 51));
        items = [arc(point(values, 10), number(values, 40), start, (((end - start) % TAU) + TAU) % TAU)];
      } else if (type === 'LWPOLYLINE') items = polyline(values);
      else throw Error('Nicht unterstütztes DXF-Element: ' + type.slice(0, 60) + '.');
      if (entities.length + items.length > 128) throw Error('DXF-Skizze unterstützt höchstens 128 Elemente.');
      layers.add(layer);
      for (const item of items) {
        if (item.type === 'circle')
          entities.push({ type: item.type, center: transform(item.center), diameter: item.diameter * scale });
        else
          entities.push({
            type: item.type,
            start: transform(item.start),
            end: transform(item.end),
            ...(item.through ? { through: transform(item.through) } : {}),
          });
      }
    }
  }
  visit(document.entities, (point) => point.map((value) => value * unit), 0, unit, '0');
  return { entities, layers: [...layers], skipped: [...skipped] };
}
