import {
  validateCadDrawingSheet,
  cadDrawingPaperSize,
  cadDrawingPaperPoint,
  cadDrawingProblems,
  cadDrawingDimension,
  cadDrawingBalloon,
  cadDrawingViewScale,
  cadDrawingPartsListSize,
  CAD_DRAWING_PARTS_LIST_COLUMNS,
  CAD_DRAWING_PARTS_LIST_STYLE,
} from './cad-drawing-data.js';

const TAU = Math.PI * 2,
  mod = (a) => ((a % TAU) + TAU) % TAU;
const num = (n) => {
  if (!Number.isFinite(n)) throw Error('Zeichnung enthält keine endlichen Koordinaten.');
  return String(n === 0 ? 0 : n);
};
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const at = (c, t) =>
  c.kind === 'ellipse'
    ? c.center.map((v, k) => v + c.radii[0] * Math.cos(t) * c.xAxis[k] + c.radii[1] * Math.sin(t) * c.yAxis[k])
    : c.center.map((v, k) => v + c.radius * (k ? Math.sin(t) : Math.cos(t)));
const pathPoint = (p) => p.map(num).join(' ');
const paperPoint = (view, scale, p) => [view.position[0] + p[0] * scale, view.position[1] - p[1] * scale];
const scaleLabel = (n) => (n >= 1 ? String(n) + ':1' : '1:' + String(Number((1 / n).toPrecision(8))));
const drawingOrder = (curves) => [...curves].sort((a, b) => Number(b.hidden) - Number(a.hidden));
const partsListCell = (row, key) => {
  const value = row[key];
  return value === null || value === undefined ? '' : String(value);
};
function partsListSvg(list, interactive) {
  const [width, height] = cadDrawingPartsListSize(list),
    [left, bottom] = list.position,
    top = bottom - height,
    titleBottom = top + CAD_DRAWING_PARTS_LIST_STYLE.titleHeight,
    headerBottom = titleBottom + CAD_DRAWING_PARTS_LIST_STYLE.headerHeight,
    stroke = [`M${num(left)} ${num(top)} H${num(left + width)} V${num(bottom)} H${num(left)} Z`],
    text = [];
  stroke.push(`M${num(left)} ${num(titleBottom)} H${num(left + width)}`);
  stroke.push(`M${num(left)} ${num(headerBottom)} H${num(left + width)}`);
  let cursor = left;
  for (const column of CAD_DRAWING_PARTS_LIST_COLUMNS.slice(0, -1)) {
    cursor += column.width;
    stroke.push(`M${num(cursor)} ${num(titleBottom)} V${num(bottom)}`);
  }
  for (let index = 1; index < list.rows.length; index++)
    stroke.push(
      `M${num(left)} ${num(headerBottom + index * CAD_DRAWING_PARTS_LIST_STYLE.rowHeight)} H${num(left + width)}`,
    );
  text.push(
    `<text x="${num(left + width / 2)}" y="${num(top + 4.8)}" text-anchor="middle" font-size="3.1" font-weight="bold">${esc(list.title)}</text>`,
  );
  const cells = (row, baseline, header = false) => {
    let x = left;
    for (const column of CAD_DRAWING_PARTS_LIST_COLUMNS) {
      const anchor = column.align === 'middle' ? 'middle' : 'start',
        cellX = column.align === 'middle' ? x + column.width / 2 : x + 1.2,
        value = row ? partsListCell(row, column.key) : column.label;
      text.push(
        `<text x="${num(cellX)}" y="${num(baseline)}" text-anchor="${anchor}" font-size="${header ? 2.6 : 2.5}"${header ? ' font-weight="bold"' : ''}>${esc(value)}</text>`,
      );
      x += column.width;
    }
  };
  cells(null, titleBottom + 4.2, true);
  for (const [index, row] of list.rows.entries())
    cells(row, headerBottom + (index + 0.7) * CAD_DRAWING_PARTS_LIST_STYLE.rowHeight);
  return `<g${interactive ? ` data-drawing-parts-list="${esc(list.id)}"` : ''} fill="none" stroke="#222" stroke-width="0.25"><path d="${stroke.join(' ')}"/></g><g fill="#111" font-family="Arial, sans-serif">${text.join('')}</g>`;
}

function ready(value, options) {
  const sheet = validateCadDrawingSheet(value),
    problems = cadDrawingProblems(sheet, options);
  if (problems.length && !options.allowStale) {
    const error = Error(problems.map((p) => p.message).join(' '));
    error.code = 'CAD_DRAWING_UPDATE_REQUIRED';
    error.problems = problems;
    throw error;
  }
  return sheet;
}
function splitBezier(values) {
  const layers = [values.map((v) => [...v])];
  while (layers.at(-1).length > 1)
    layers.push(
      layers
        .at(-1)
        .slice(0, -1)
        .map((v, i) => v.map((x, k) => (x + layers.at(-1)[i + 1][k]) / 2)),
    );
  return [layers.map((row) => row[0]), layers.map((row) => row.at(-1)).reverse()];
}
function lineDistance(p, a, b) {
  const d = b.map((v, k) => v - a[k]),
    dd = d[0] ** 2 + d[1] ** 2,
    t = dd ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / dd)) : 0;
  return Math.hypot(p[0] - a[0] - t * d[0], p[1] - a[1] - t * d[1]);
}
// Positive rational Bézier curves lie inside their Euclidean control hull.
// Subdivision therefore supplies a conservative distance bound for each chord.
export function cadDrawingBezierPolyline(curve, { tolerance = 0.01, maxPoints = 200000 } = {}) {
  const first = curve.poles[0],
    points = [[...first]];
  let maxDeviation = 0;
  function visit(h, depth) {
    const p = h.map((v) => [v[0] / v[2], v[1] / v[2]]),
      bound = Math.max(...p.map((v) => lineDistance(v, p[0], p.at(-1))));
    if (bound <= tolerance) {
      maxDeviation = Math.max(maxDeviation, bound);
      points.push(p.at(-1));
      if (points.length > maxPoints) throw Error('Zeichnung überschreitet die Kurvenpunktgrenze.');
      return;
    }
    if (depth >= 30) throw Error('Zeichnungskurve erreicht die geforderte Abweichungsgrenze nicht.');
    for (const part of splitBezier(h)) visit(part, depth + 1);
  }
  visit(
    curve.poles.map((p, i) => [p[0] * curve.weights[i], p[1] * curve.weights[i], curve.weights[i]]),
    0,
  );
  return { points, maxDeviation, proof: 'positive-rational-bezier-control-hull' };
}
function curveSvg(c, tolerance) {
  if (c.kind === 'line') return `<path d="M${pathPoint(c.a)} L${pathPoint(c.b)}"/>`;
  if (c.kind === 'circle') return `<circle cx="${num(c.center[0])}" cy="${num(c.center[1])}" r="${num(c.radius)}"/>`;
  if (c.kind === 'polyline')
    return `<polyline points="${c.points.map((p) => p.map(num).join(',')).join(' ')}" data-max-deviation-mm="${num(c.maxDeviation)}" data-error-bound="${c.proof}"/>`;
  if (c.kind === 'bezier') {
    if (c.weights.every((w) => w === c.weights[0]) && c.poles.length <= 4) {
      const commands = { 2: 'L', 3: 'Q', 4: 'C' };
      return `<path d="M${pathPoint(c.poles[0])} ${commands[c.poles.length]}${c.poles.slice(1).map(pathPoint).join(' ')}"/>`;
    }
    return curveSvg({ kind: 'polyline', ...cadDrawingBezierPolyline(c, { tolerance }) }, tolerance);
  }
  const ellipse = c.kind === 'ellipse',
    span = ellipse
      ? c.closed
        ? TAU
        : mod(c.endAngle - c.startAngle)
      : c.clockwise
        ? -mod(c.startAngle - c.endAngle)
        : mod(c.endAngle - c.startAngle);
  if (Math.abs(span) < 1e-14) return '';
  const count = Math.max(1, Math.ceil(Math.abs(span) / Math.PI)),
    rx = ellipse ? c.radii[0] : c.radius,
    ry = ellipse ? c.radii[1] : c.radius,
    rotation = ellipse ? (Math.atan2(c.xAxis[1], c.xAxis[0]) * 180) / Math.PI : 0,
    det = ellipse ? c.xAxis[0] * c.yAxis[1] - c.xAxis[1] * c.yAxis[0] : 1,
    sweep = span * det >= 0 ? 1 : 0;
  let d = 'M' + pathPoint(at(c, c.startAngle));
  for (let i = 1; i <= count; i++)
    d += ` A${num(rx)} ${num(ry)} ${num(rotation)} 0 ${sweep} ${pathPoint(at(c, c.startAngle + (span * i) / count))}`;
  if (ellipse && c.closed) d += ' Z';
  return `<path d="${d}"/>`;
}

export function cadDrawingAnnotationGeometry(sheet, a, options) {
  if (a.kind === 'label') return { text: a.text, position: a.position, lines: [], arcs: [] };
  if (a.kind === 'balloon') {
    const { row, target } = cadDrawingBalloon(sheet, a, options),
      text = String(row.position),
      radius = Math.max(3.2, text.length + 1),
      delta = target.map((coordinate, axis) => coordinate - a.position[axis]),
      length = Math.hypot(...delta),
      lines = [];
    if (length > radius) {
      const rim = a.position.map((coordinate, axis) => coordinate + (delta[axis] * radius) / length);
      lines.push([target, rim]);
    }
    return { text, position: a.position, lines, arcs: [], radius };
  }
  const result = cadDrawingDimension(sheet, a),
    { view, curves } = result,
    viewScale = cadDrawingViewScale(view, sheet),
    p = (p) => paperPoint(view, viewScale, p),
    lines = [],
    arcs = [];
  if (a.kind === 'distance') {
    const [first, last] = result.points.map(p),
      axis = a.axis === 'x' ? 0 : 1,
      other = 1 - axis,
      start = [...first],
      end = [...last];
    start[other] = end[other] = a.position[other];
    lines.push([first, start], [last, end], [start, end]);
    if (a.position[axis] < Math.min(start[axis], end[axis]) || a.position[axis] > Math.max(start[axis], end[axis]))
      lines.push([
        Math.abs(a.position[axis] - start[axis]) < Math.abs(a.position[axis] - end[axis]) ? start : end,
        a.position,
      ]);
  } else if (a.kind === 'length') {
    const [first, last] = result.points.map(p),
      delta = last.map((x, k) => x - first[k]),
      length = Math.hypot(...delta),
      n = [-delta[1] / length, delta[0] / length],
      offset = (a.position[0] - first[0]) * n[0] + (a.position[1] - first[1]) * n[1],
      start = first.map((x, k) => x + n[k] * offset),
      end = last.map((x, k) => x + n[k] * offset);
    lines.push([first, start], [last, end], [start, end]);
  } else if (a.kind === 'angle') {
    const [c, d] = curves,
      u = c.b.map((x, k) => x - c.a[k]),
      v = d.b.map((x, k) => x - d.a[k]),
      cross = u[0] * v[1] - u[1] * v[0],
      w = d.a.map((x, k) => x - c.a[k]);
    if (Math.abs(cross) > 1e-12 * Math.hypot(...u) * Math.hypot(...v)) {
      const t = (w[0] * v[1] - w[1] * v[0]) / cross,
        center = c.a.map((x, k) => x + t * u[k]),
        cp = p(center),
        r = Math.max(4, Math.min(40, Math.hypot(a.position[0] - cp[0], a.position[1] - cp[1]))),
        start = Math.atan2(-u[1], u[0]),
        raw = Math.atan2(-v[1], v[0]),
        span = Math.atan2(Math.sin(raw - start), Math.cos(raw - start));
      arcs.push({ center: cp, radius: r, startAngle: start, endAngle: start + span, clockwise: span < 0 });
      lines.push(
        [cp, [cp[0] + r * Math.cos(start), cp[1] + r * Math.sin(start)]],
        [cp, [cp[0] + r * Math.cos(start + span), cp[1] + r * Math.sin(start + span)]],
      );
    } else lines.push([p(c.a), a.position], [p(d.a), a.position]);
  } else if (a.kind === 'centermark') {
    const c = curves[0],
      center = p(c.center),
      overshoot = 2,
      r = c.radius * viewScale + overshoot;
    lines.push(
      [
        [center[0] - r, center[1]],
        [center[0] + r, center[1]],
      ],
      [
        [center[0], center[1] - r],
        [center[0], center[1] + r],
      ],
    );
    return { text: '', position: center, lines, arcs: [] };
  } else if (a.kind === 'centerline') {
    const [c1, c2] = curves,
      center1 = p(c1.center),
      center2 = p(c2.center),
      dx = center2[0] - center1[0],
      dy = center2[1] - center1[1],
      distance = Math.hypot(dx, dy);
    if (distance < 1e-10) fail('Mittellinie benötigt zwei unterschiedliche Mitten.');
    const dir = [dx / distance, dy / distance];
    const overhangStart = Number.isFinite(a.extensionStart)
      ? a.extensionStart
      : Number.isFinite(a.overhangMm)
        ? a.overhangMm
        : 3;
    const overhangEnd = Number.isFinite(a.extensionEnd)
      ? a.extensionEnd
      : Number.isFinite(a.overhangMm)
        ? a.overhangMm
        : 3;
    const start = [center1[0] - dir[0] * overhangStart, center1[1] - dir[1] * overhangStart];
    const end = [center2[0] + dir[0] * overhangEnd, center2[1] + dir[1] * overhangEnd];
    lines.push([start, end]);
    return {
      text: '',
      position: [(center1[0] + center2[0]) / 2, (center1[1] + center2[1]) / 2],
      lines,
      arcs: [],
      dash: '8 2 2 2',
    };
  } else {
    const c = curves[0],
      center = p(c.center),
      direction = a.position.map((x, k) => x - center[k]),
      length = Math.hypot(...direction);
    let unit = length ? direction.map((x) => x / length) : [1, 0];
    if (c.kind === 'arc') {
      const angle = Math.atan2(-unit[1], unit[0]),
        sweep = c.clockwise ? mod(c.startAngle - c.endAngle) : mod(c.endAngle - c.startAngle),
        offset = c.clockwise ? mod(c.startAngle - angle) : mod(angle - c.startAngle);
      if (offset > sweep + 1e-12) {
        const delta = (t) => Math.abs(Math.atan2(Math.sin(t - angle), Math.cos(t - angle))),
          endpoint = delta(c.startAngle) <= delta(c.endAngle) ? c.startAngle : c.endAngle;
        unit = [Math.cos(endpoint), -Math.sin(endpoint)];
      }
    }
    const r = c.radius * viewScale,
      edge = center.map((x, k) => x + r * unit[k]);
    if (a.kind === 'diameter') lines.push([center.map((x, k) => x - r * unit[k]), edge]);
    else lines.push([center, edge]);
    lines.push([edge, a.position]);
  }
  return { text: result.text, position: a.position, lines, arcs };
}

const namedGroup = (id, label, items) =>
  '<g id="formnaro-' + id + '"><title>' + esc(label) + '</title>' + items.join('') + '</g>';

function drawingViewSvg(view, viewScale, interactive, attrs) {
  const curves = drawingOrder(view.projection.curves)
    .map((c) => {
      const geometry = curveSvg(c, view.projection.tolerance);
      return `<g${attrs('curve', c.id)}${c.hidden ? ' stroke-dasharray="' + num(1 / viewScale) + ' ' + num(1 / viewScale) + '"' : ''}>${interactive ? `<g stroke="transparent" stroke-width="${num(3 / viewScale)}" pointer-events="stroke">${geometry}</g><g pointer-events="none">${geometry}</g>` : geometry}</g>`;
    })
    .join('');
  return `<g${attrs('view', view.id)} transform="translate(${view.position.map(num).join(' ')}) scale(${num(viewScale)} ${num(-viewScale)})" fill="none" stroke="#111" stroke-width="${num(0.25 / viewScale)}" stroke-linecap="round" stroke-linejoin="round">${curves}</g>`;
}

export function cadDrawingViewSvg(value, viewId, options = {}) {
  const sheet = ready(value, options),
    view = sheet.views.find((item) => item.id === viewId);
  if (!view?.projection) throw Error('Eine berechnete Zeichnungsansicht auswählen.');
  const scale = cadDrawingViewScale(view, sheet),
    { min, max } = view.projection.bounds,
    [left, top] = paperPoint(view, scale, [min[0], max[1]]),
    margin = 0.5,
    width = (max[0] - min[0]) * scale + margin * 2,
    height = (max[1] - min[1]) * scale + margin * 2,
    box = [left - margin, top - margin, width, height].map(num).join(' '),
    contents = drawingViewSvg(view, scale, false, () => '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${num(width)}mm" height="${num(height)}mm" viewBox="${box}" data-formnaro-drawing-view="1">${contents}</svg>`;
}

export function cadDrawingSvg(value, options = {}) {
  const sheet = ready(value, options),
    [width, height] = cadDrawingPaperSize(sheet),
    interactive = options.interactive === true,
    attrs = (name, id) => (interactive ? ` data-drawing-${name}="${esc(id)}"` : '');
  const title = sheet.titleBlock,
    margin = 10,
    blockWidth = Math.min(180, width - 20),
    blockX = width - margin - blockWidth,
    blockY = height - 40,
    content = [];
  content.push(
    `<rect x="0" y="0" width="${width}" height="${height}" fill="white"/><g fill="none" stroke="#222" stroke-width="0.25"><rect x="${margin}" y="${margin}" width="${width - 2 * margin}" height="${height - 2 * margin}"/><rect x="${blockX}" y="${blockY}" width="${blockWidth}" height="30"/><path d="M${blockX} ${blockY + 15} H${width - margin} M${blockX + blockWidth * 0.55} ${blockY + 15} V${height - margin}"/></g>`,
  );
  content.push(
    `<g fill="#111" font-family="Arial, sans-serif" font-size="3.2"><text x="${blockX + 3}" y="${blockY + 6}">${esc(title.title || sheet.name)}</text><text x="${blockX + 3}" y="${blockY + 12}">${esc(title.number)}</text><text x="${blockX + 3}" y="${blockY + 21}">${esc(title.author)} · ${esc(title.date)}</text><text x="${blockX + 3}" y="${blockY + 27}">Rev. ${esc(title.revision)}</text><text x="${blockX + blockWidth * 0.55 + 3}" y="${blockY + 21}">${sheet.paper} · ${esc(sheet.scale >= 1 ? num(sheet.scale) + ':1' : '1:' + num(1 / sheet.scale))}</text><text x="${blockX + blockWidth * 0.55 + 3}" y="${blockY + 27}">mm · Formnaro</text></g>`,
  );
  if (!interactive) content.splice(0, content.length, namedGroup('title-block', 'Schriftfeld', content));
  const views = [];
  for (const view of sheet.views) {
    if (!view.projection) {
      if (interactive)
        views.push(
          `<g${attrs('view', view.id)}><rect x="${view.position[0] - 20}" y="${view.position[1] - 15}" width="40" height="30" fill="#f4f4f4" stroke="#777" stroke-dasharray="2 1"/><text x="${view.position[0]}" y="${view.position[1]}" text-anchor="middle" font-size="3">Blatt aktualisieren</text></g>`,
        );
      continue;
    }
    const viewScale = cadDrawingViewScale(view, sheet);
    views.push(drawingViewSvg(view, viewScale, interactive, attrs));
    if (view.kind === 'detail') {
      const radius = view.cutout.radius * viewScale,
        letter = String.fromCharCode(
          65 + Math.max(0, sheet.views.filter((candidate) => candidate.kind === 'detail').indexOf(view)),
        );
      views.push(
        `<g${attrs('detail', view.id)}><circle cx="${num(view.position[0])}" cy="${num(view.position[1])}" r="${num(radius)}" fill="none" stroke="#666" stroke-width="0.25" stroke-dasharray="2 1"/><text x="${num(view.position[0] - radius)}" y="${num(view.position[1] - radius - 2)}" font-family="Arial, sans-serif" font-size="3.5" fill="#111" stroke="white" stroke-width="0.8" paint-order="stroke">${esc('Detail ' + letter + ' · ' + scaleLabel(viewScale))}</text></g>`,
      );
    } else if (view.kind === 'exploded') {
      const bounds = view.projection.bounds,
        [x, y] = cadDrawingPaperPoint(view, viewScale, [bounds.min[0], bounds.max[1]]);
      views.push(
        `<text x="${num(x)}" y="${num(y - 2)}" pointer-events="none" font-family="Arial, sans-serif" font-size="3.5" fill="#111">${esc(options.explodedViewLabel ?? 'Explosionsansicht')}</text>`,
      );
    }
  }
  content.push(interactive ? views.join('') : namedGroup('views', 'Ansichten', views));
  const annotations = [];
  for (const a of sheet.annotations) {
    let g;
    try {
      g = cadDrawingAnnotationGeometry(sheet, a, options);
    } catch (error) {
      if (!options.allowStale) throw error;
      g =
        a.kind === 'balloon'
          ? { text: '?', position: a.position, lines: [], arcs: [], radius: 3.2, lost: true }
          : { text: 'Bezug verloren', position: a.position, lines: [], arcs: [] };
    }
    const lines = g.lines.map(([p, q]) => `<path d="M${pathPoint(p)} L${pathPoint(q)}"/>`).join(''),
      arcs = g.arcs.map((c) => curveSvg({ kind: 'arc', ...c }, 0.01)).join(''),
      strokeDash = g.dash ? ` stroke-dasharray="${g.dash}"` : '';
    if (a.kind === 'balloon') {
      const [x, y] = g.position.map(num),
        color = g.lost ? '#a12222' : '#222',
        title = g.lost ? `<title>${esc(options.lostBalloonLabel ?? 'Positionsballon: Bezug verloren')}</title>` : '';
      annotations.push(
        `<g${attrs('annotation', a.id)}>${title}<g fill="none" stroke="${color}" stroke-width="0.25">${lines}<circle cx="${x}" cy="${y}" r="${num(g.radius)}" fill="white"/></g><text x="${x}" y="${num(g.position[1] + 1.15)}" fill="${color}" text-anchor="middle" font-family="Arial, sans-serif" font-size="3.5">${esc(g.text)}</text></g>`,
      );
      continue;
    }
    annotations.push(
      `<g${attrs('annotation', a.id)}><g fill="none" stroke="#333" stroke-width="0.18"${strokeDash}>${lines}${arcs}</g>${g.text ? `<text x="${num(g.position[0])}" y="${num(g.position[1] - 0.7)}" text-anchor="middle" fill="#111" stroke="white" stroke-width="0.8" paint-order="stroke" font-family="Arial, sans-serif" font-size="3.5">${esc(g.text)}</text>` : ''}</g>`,
    );
  }
  content.push(interactive ? annotations.join('') : namedGroup('annotations', 'Maße und Beschriftungen', annotations));
  if (sheet.partsList) content.push(partsListSvg(sheet.partsList, interactive));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" data-formnaro-drawing="1" role="img" aria-label="${esc(sheet.name)}">${content.join('')}</svg>`;
}

const dxfText = (s) =>
  String(s)
    .replace(/\\/g, '\\U+005C')
    .replace(/[^\x20-\x7e]/g, (c) => '\\U+' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'))
    .replace(/[\r\n]/g, ' ');
function ellipseDxf(c) {
  const swap = c.radii[1] > c.radii[0],
    axis = swap ? c.yAxis : c.xAxis,
    major = swap ? c.radii[1] : c.radii[0],
    minor = swap ? c.radii[0] : c.radii[1],
    det = c.xAxis[0] * c.yAxis[1] - c.xAxis[1] * c.yAxis[0],
    normal = Math.sign(det),
    shift = swap ? -Math.PI / 2 : 0;
  return {
    major: axis.map((x) => x * major),
    ratio: minor / major,
    normal,
    start: c.closed ? 0 : mod(c.startAngle + shift),
    end: c.closed ? TAU : mod(c.endAngle + shift),
  };
}
/** Model-space export: independent views are tiled without scaling. Paper
 * scale and paper moves cannot change any geometric length, radius or area. */
export function cadDrawingDxf(value, options = {}) {
  const sheet = ready(value, options),
    pairs = [],
    put = (...values) => {
      for (let i = 0; i < values.length; i += 2) pairs.push(String(values[i]), String(values[i + 1]));
    },
    point = (code, p) => put(code, num(p[0]), code + 10, num(p[1]), code + 20, 0),
    layers = ['0', 'ANNOTATIONS', ...sheet.views.map((_, i) => 'VIEW_' + (i + 1))];
  let handle = 256;
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
    '$DWGCODEPAGE',
    3,
    'ANSI_1252',
    9,
    '$INSUNITS',
    70,
    4,
    9,
    '$MEASUREMENT',
    70,
    1,
    9,
    '$DIMASSOC',
    280,
    0,
    0,
    'ENDSEC',
  );
  put(
    0,
    'SECTION',
    2,
    'TABLES',
    0,
    'TABLE',
    2,
    'LTYPE',
    5,
    (handle++).toString(16),
    330,
    0,
    100,
    'AcDbSymbolTable',
    70,
    3,
    0,
    'LTYPE',
    5,
    (handle++).toString(16),
    100,
    'AcDbSymbolTableRecord',
    100,
    'AcDbLinetypeTableRecord',
    2,
    'CONTINUOUS',
    70,
    0,
    3,
    'Solid line',
    72,
    65,
    73,
    0,
    40,
    0,
    0,
    'LTYPE',
    5,
    (handle++).toString(16),
    100,
    'AcDbSymbolTableRecord',
    100,
    'AcDbLinetypeTableRecord',
    2,
    'HIDDEN',
    70,
    0,
    3,
    'Hidden edge',
    72,
    65,
    73,
    2,
    40,
    3,
    49,
    2,
    74,
    0,
    49,
    -1,
    74,
    0,
    0,
    'LTYPE',
    5,
    (handle++).toString(16),
    100,
    'AcDbSymbolTableRecord',
    100,
    'AcDbLinetypeTableRecord',
    2,
    'CENTER',
    70,
    0,
    3,
    'Center line',
    72,
    65,
    73,
    4,
    40,
    16,
    49,
    10,
    74,
    0,
    49,
    -2,
    74,
    0,
    49,
    2,
    74,
    0,
    49,
    -2,
    74,
    0,
    0,
    'ENDTAB',
  );
  put(0, 'TABLE', 2, 'LAYER', 5, (handle++).toString(16), 330, 0, 100, 'AcDbSymbolTable', 70, layers.length);
  for (const layer of layers)
    put(
      0,
      'LAYER',
      5,
      (handle++).toString(16),
      100,
      'AcDbSymbolTableRecord',
      100,
      'AcDbLayerTableRecord',
      2,
      layer,
      70,
      0,
      62,
      7,
      6,
      'CONTINUOUS',
    );
  put(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'BLOCKS', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
  const entity = (kind, layer, subclass, linetype = false) => {
    put(0, kind, 5, (handle++).toString(16), 100, 'AcDbEntity', 8, layer);
    if (linetype === true) put(6, 'HIDDEN');
    else if (linetype) put(6, linetype);
    put(100, subclass);
  };
  const line = (a, b, layer, linetype = false) => {
    entity('LINE', layer, 'AcDbLine', linetype);
    point(10, a);
    point(11, b);
  };
  const label = (text, p, layer = 'ANNOTATIONS', height = 2.5, centered = false) => {
    entity('TEXT', layer, 'AcDbText');
    point(10, p);
    put(40, height, 1, dxfText(text), 50, 0);
    if (centered) {
      put(72, 1);
      point(11, p);
    }
    put(100, 'AcDbText');
    if (centered) put(73, 2);
  };
  function writeCurve(c, offset, layer) {
    const p = (v) => v.map((x, k) => x + offset[k]);
    if (c.kind === 'line') {
      line(p(c.a), p(c.b), layer, c.hidden);
      return;
    }
    if (c.kind === 'circle' || c.kind === 'arc') {
      entity(c.kind === 'circle' ? 'CIRCLE' : 'ARC', layer, 'AcDbCircle', c.hidden);
      point(10, p(c.center));
      put(40, num(c.radius));
      if (c.kind === 'arc') {
        put(
          100,
          'AcDbArc',
          50,
          num((mod(c.clockwise ? c.endAngle : c.startAngle) * 180) / Math.PI),
          51,
          num((mod(c.clockwise ? c.startAngle : c.endAngle) * 180) / Math.PI),
        );
      }
      return;
    }
    if (c.kind === 'ellipse') {
      const e = ellipseDxf(c);
      entity('ELLIPSE', layer, 'AcDbEllipse', c.hidden);
      point(10, p(c.center));
      point(11, e.major);
      put(210, 0, 220, 0, 230, e.normal, 40, num(e.ratio), 41, num(e.start), 42, num(e.end));
      return;
    }
    if (c.kind === 'bezier') {
      const degree = c.poles.length - 1,
        rational = !c.weights.every((w) => w === c.weights[0]);
      entity('SPLINE', layer, 'AcDbSpline', c.hidden);
      put(
        210,
        0,
        220,
        0,
        230,
        1,
        70,
        8 + (rational ? 4 : 0) + (degree === 1 ? 16 : 0),
        71,
        degree,
        72,
        2 * (degree + 1),
        73,
        c.poles.length,
        74,
        0,
      );
      for (let i = 0; i <= degree; i++) put(40, 0);
      for (let i = 0; i <= degree; i++) put(40, 1);
      if (rational) for (const weight of c.weights) put(41, num(weight));
      for (const pole of c.poles) point(10, p(pole));
      return;
    }
    entity('LWPOLYLINE', layer, 'AcDbPolyline', c.hidden);
    put(90, c.points.length, 70, 0);
    for (const v of c.points) {
      const q = p(v);
      put(10, num(q[0]), 20, num(q[1]));
    }
  }
  let cursor = 0;
  for (const [index, view] of sheet.views.entries()) {
    if (!view.projection) continue;
    const bounds = view.projection.bounds,
      offset = [cursor - bounds.min[0], -bounds.min[1]],
      width = bounds.max[0] - bounds.min[0],
      height = bounds.max[1] - bounds.min[1],
      viewScale = cadDrawingViewScale(view, sheet),
      layer = 'VIEW_' + (index + 1);
    for (const c of drawingOrder(view.projection.curves)) writeCurve(c, offset, layer);
    label(
      view.kind === 'detail'
        ? 'Detail ' +
            String.fromCharCode(
              65 + Math.max(0, sheet.views.filter((candidate) => candidate.kind === 'detail').indexOf(view)),
            ) +
            ' ' +
            scaleLabel(viewScale)
        : {
            front: 'Vorderansicht',
            side: 'Seitenansicht',
            top: 'Draufsicht',
            section: 'Schnitt',
            exploded: 'Explosionsansicht',
          }[view.kind],
      [cursor, height + 8],
      layer,
    );
    for (const a of sheet.annotations.filter((a) => a.kind !== 'label' && a.viewId === view.id)) {
      const g = cadDrawingAnnotationGeometry(sheet, a, options),
        toModel = (p) => [
          (p[0] - view.position[0]) / viewScale + offset[0],
          -(p[1] - view.position[1]) / viewScale + offset[1],
        ];
      const linetype = a.kind === 'centerline' ? 'CENTER' : false;
      for (const [p, q] of g.lines) line(toModel(p), toModel(q), 'ANNOTATIONS', linetype);
      for (const arc of g.arcs)
        writeCurve(
          {
            kind: 'arc',
            center: toModel(arc.center),
            radius: arc.radius / viewScale,
            startAngle: -arc.startAngle,
            endAngle: -arc.endAngle,
            clockwise: !arc.clockwise,
          },
          [0, 0],
          'ANNOTATIONS',
        );
      if (a.kind === 'balloon') {
        writeCurve(
          { kind: 'circle', center: toModel(g.position), radius: g.radius / viewScale },
          [0, 0],
          'ANNOTATIONS',
        );
        label(g.text, toModel(g.position), 'ANNOTATIONS', 3.5 / viewScale, true);
      } else if (g.text) label(g.text, toModel(g.position));
    }
    cursor += width + 20;
  }
  if (sheet.partsList) {
    const list = sheet.partsList,
      [width, height] = cadDrawingPartsListSize(list),
      [left, bottom] = list.position,
      top = bottom - height,
      titleBottom = top + CAD_DRAWING_PARTS_LIST_STYLE.titleHeight,
      headerBottom = titleBottom + CAD_DRAWING_PARTS_LIST_STYLE.headerHeight,
      paper = ([x, y]) => [x, -y],
      paperLine = (a, b) => line(paper(a), paper(b), 'ANNOTATIONS'),
      cells = (row, baseline) => {
        let x = left;
        for (const column of CAD_DRAWING_PARTS_LIST_COLUMNS) {
          const value = row ? partsListCell(row, column.key) : column.label,
            cellX = column.align === 'middle' ? x + column.width / 2 - value.length * 0.6 : x + 1.2;
          label(value, paper([cellX, baseline]), 'ANNOTATIONS', row ? 2.5 : 2.6);
          x += column.width;
        }
      };
    paperLine([left, top], [left + width, top]);
    paperLine([left + width, top], [left + width, bottom]);
    paperLine([left + width, bottom], [left, bottom]);
    paperLine([left, bottom], [left, top]);
    paperLine([left, titleBottom], [left + width, titleBottom]);
    paperLine([left, headerBottom], [left + width, headerBottom]);
    let cursor = left;
    for (const column of CAD_DRAWING_PARTS_LIST_COLUMNS.slice(0, -1)) {
      cursor += column.width;
      paperLine([cursor, titleBottom], [cursor, bottom]);
    }
    for (let index = 1; index < list.rows.length; index++) {
      const y = headerBottom + index * CAD_DRAWING_PARTS_LIST_STYLE.rowHeight;
      paperLine([left, y], [left + width, y]);
    }
    label(list.title, paper([left + width / 2 - list.title.length * 0.8, top + 4.8]), 'ANNOTATIONS', 3);
    cells(null, titleBottom + 4.2);
    for (const [index, row] of list.rows.entries())
      cells(row, headerBottom + (index + 0.7) * CAD_DRAWING_PARTS_LIST_STYLE.rowHeight);
  }
  let labelY = -15;
  for (const a of sheet.annotations.filter((a) => a.kind === 'label')) {
    label(a.text, [0, labelY]);
    labelY -= 5;
  }
  const title = sheet.titleBlock;
  label(title.title || sheet.name, [0, labelY]);
  label([title.number, title.revision, title.author, title.date].filter(Boolean).join(' | '), [0, labelY - 5]);
  put(0, 'ENDSEC', 0, 'EOF');
  return pairs.join('\r\n') + '\r\n';
}
