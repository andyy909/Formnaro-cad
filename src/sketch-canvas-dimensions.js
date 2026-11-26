import './sketch-canvas-dimensions.css';

const NS = 'http://www.w3.org/2000/svg';
const definitions = {
  x: ['X', 'Breite', 'Width'],
  y: ['Y', 'Höhe', 'Height'],
  radius: ['R', 'Radius', 'Radius'],
  diameter: ['Ø', 'Durchmesser', 'Diameter'],
  length: ['L', 'Länge', 'Length'],
  dx: ['ΔX', 'Verschiebung X', 'X offset'],
  dy: ['ΔY', 'Verschiebung Y', 'Y offset'],
};
const formats = {
  de: new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }),
  en: new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }),
};
const signedFormats = {
  de: new Intl.NumberFormat('de-DE', { maximumFractionDigits: 4, signDisplay: 'exceptZero', useGrouping: false }),
  en: new Intl.NumberFormat('en-US', { maximumFractionDigits: 4, signDisplay: 'exceptZero', useGrouping: false }),
};
const offset = 30;
const deltaOffset = 36;
const labelHeight = 28;
const hitHeight = 44;
const labelMargin = 4;
const labelGap = 4;
const minimumLabelWidth = 56;

const add = (p, v, factor = 1) => [p[0] + v[0] * factor, p[1] + v[1] * factor];
const midpoint = (a, b) => a.map((value, k) => (value + b[k]) / 2);
const polyline = (...points) => 'M ' + points.map((point) => point.join(' ')).join(' L ');

export function dimensionLabel(key, value, language = 'de') {
  const definition = definitions[key];
  if (!definition || !Number.isFinite(value)) return null;
  const locale = language === 'en' ? 'en' : 'de';
  const delta = key === 'dx' || key === 'dy';
  const formatted = (delta ? signedFormats : formats)[locale].format(value);
  const [axis, name, englishName] = definition;
  return {
    title: axis + ' ' + formatted + ' mm',
    accessibleName: (delta ? axis + ' ' : '') + (language === 'en' ? englishName : name) + ' ' + formatted + ' mm',
  };
}

function direction(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  return length > 0.01 ? [dx / length, dy / length] : [1, 0];
}

function arrow(tip, forward) {
  const tail = add(tip, forward, -7);
  const normal = [-forward[1], forward[0]];
  return polyline(add(tail, normal, 3), tip, add(tail, normal, -3));
}

function bracket(from, to, normal, gap) {
  const a = add(from, normal, gap), b = add(to, normal, gap);
  const forward = direction(a, b);
  const hasRoomForArrows = Math.hypot(b[0] - a[0], b[1] - a[1]) >= 16;
  return {
    from,
    to,
    normal,
    gap,
    center: midpoint(a, b),
    guides: polyline(from, add(a, normal, 5)) + ' ' + polyline(to, add(b, normal, 5)),
    dimension: polyline(a, b) + (hasRoomForArrows ? ' ' + arrow(a, add([0, 0], forward, -1)) + ' ' + arrow(b, forward) : ''),
  };
}

export function projectDimensions(a, b, values, width, height) {
  const results = {};
  const left = Math.min(a[0], b[0]), right = Math.max(a[0], b[0]);
  const top = Math.min(a[1], b[1]), bottom = Math.max(a[1], b[1]);
  const above = top >= offset + hitHeight / 2 + 4 || top >= height - bottom;
  const leftOfShape = left >= offset + 46 || left >= width - right;
  if (Number.isFinite(values.x)) {
    const y = above ? top : bottom;
    results.x = bracket([left, y], [right, y], [0, above ? -1 : 1], offset);
  }
  if (Number.isFinite(values.diameter)) {
    results.diameter = bracket(a, b, [0, above ? -1 : 1], offset);
  }
  if (Number.isFinite(values.y)) {
    const x = leftOfShape ? left : right;
    results.y = bracket([x, top], [x, bottom], [leftOfShape ? -1 : 1, 0], offset);
  }
  if (Number.isFinite(values.length)) {
    const [x, y] = direction(a, b);
    const normal = add([0, 0], [-y, x], x >= 0 ? -1 : 1);
    results.length = bracket(a, b, normal, offset);
  }
  if (Number.isFinite(values.radius)) {
    const forward = direction(a, b);
    const leader = add(b, forward, 58);
    results.radius = {
      center: leader,
      guides: polyline(b, leader),
      dimension: polyline(a, b) + ' ' + arrow(b, forward),
    };
  }
  if (Number.isFinite(values.dx) || Number.isFinite(values.dy)) {
    // Signed local deltas follow the reference point and the current position:
    // the horizontal leg starts at the reference, the vertical leg ends on it.
    const corner = [b[0], a[1]];
    if (Number.isFinite(values.dx)) {
      const aboveRoom = a[1] - deltaOffset - labelHeight / 2 - labelMargin;
      const belowRoom = height - a[1] - deltaOffset - labelHeight / 2 - labelMargin;
      const above = aboveRoom >= 0 || aboveRoom >= belowRoom;
      results.dx = bracket(a, corner, [0, above ? -1 : 1], deltaOffset);
    }
    if (Number.isFinite(values.dy)) {
      const rightRoom = width - b[0] - deltaOffset - minimumLabelWidth / 2 - labelMargin;
      const leftRoom = b[0] - deltaOffset - minimumLabelWidth / 2 - labelMargin;
      const right = rightRoom >= 0 || rightRoom >= leftRoom;
      results.dy = bracket(corner, b, [right ? 1 : -1, 0], deltaOffset);
    }
  }
  return results;
}

const clampCenter = (value, half, size) => {
  const minimum = half + labelMargin;
  const maximum = size - half - labelMargin;
  return maximum >= minimum ? Math.min(Math.max(value, minimum), maximum) : size / 2;
};

const labelsOverlap = (a, b) =>
  Math.abs(a.center[0] - b.center[0]) < (a.width + b.width) / 2 + labelGap
  && Math.abs(a.center[1] - b.center[1]) < (a.height + b.height) / 2 + labelGap;

function separateLabels(a, b, width, height) {
  let best;
  const verticalFit = a.height + b.height + labelGap <= height - 2 * labelMargin;
  if (verticalFit) {
    const total = a.height + b.height + labelGap;
    const top = Math.min(
      Math.max((a.center[1] + b.center[1]) / 2 - total / 2, labelMargin),
      height - labelMargin - total,
    );
    for (const firstAbove of [a.center[1] <= b.center[1], a.center[1] > b.center[1]]) {
      const y = firstAbove
        ? [top + a.height / 2, top + a.height + labelGap + b.height / 2]
        : [top + b.height + labelGap + a.height / 2, top + b.height / 2];
      const score = Math.abs(y[0] - a.center[1]) + Math.abs(y[1] - b.center[1]);
      if (!best || score < best.score) {
        best = {score, centers: [[a.center[0], y[0]], [b.center[0], y[1]]]};
      }
    }
  }
  const horizontalFit = a.width + b.width + labelGap <= width - 2 * labelMargin;
  if (horizontalFit) {
    const total = a.width + b.width + labelGap;
    const left = Math.min(
      Math.max((a.center[0] + b.center[0]) / 2 - total / 2, labelMargin),
      width - labelMargin - total,
    );
    for (const firstLeft of [a.center[0] <= b.center[0], a.center[0] > b.center[0]]) {
      const x = firstLeft
        ? [left + a.width / 2, left + a.width + labelGap + b.width / 2]
        : [left + b.width + labelGap + a.width / 2, left + b.width / 2];
      const score = Math.abs(x[0] - a.center[0]) + Math.abs(x[1] - b.center[0]);
      if (!best || score < best.score) {
        best = {score, centers: [[x[0], a.center[1]], [x[1], b.center[1]]]};
      }
    }
  }
  if (!best) return false;
  [a.center, b.center] = best.centers;
  return true;
}

// Keep label hit boxes inside the board and split the two delta badges when
// zero-length legs, short drags or viewport edges put them on top of each other.
export function layoutDimensionLabels(labels, width, height) {
  const placed = labels.map((label) => ({
    ...label,
    center: [
      clampCenter(label.center[0], label.width / 2, width),
      clampCenter(label.center[1], label.height / 2, height),
    ],
  }));
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < placed.length; a++) {
      for (let b = a + 1; b < placed.length; b++) {
        if (labelsOverlap(placed[a], placed[b])) separateLabels(placed[a], placed[b], width, height);
      }
    }
  }
  return placed;
}

function setAttributes(node, values) {
  for (const [key, value] of Object.entries(values)) node.setAttribute(key, value);
}

function isPoint(point) {
  return Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);
}

export function createSketchCanvasDimensions(board, { edit } = {}) {
  const make = (tag, className) => {
    const node = board.ownerDocument.createElementNS(NS, tag);
    node.classList.add(className);
    return node;
  };
  const layer = make('g', 'sketch-canvas-dimensions');
  let activeMeasurement;
  const rows = new Map(Object.entries(definitions).map(([key]) => {
    const group = make('g', 'sketch-canvas-dimension');
    const guides = make('path', 'sketch-canvas-dimension-guides');
    const line = make('path', 'sketch-canvas-dimension-line');
    const anchor = make('g', 'sketch-canvas-dimension-label');
    const hit = make('rect', 'sketch-canvas-dimension-hit');
    const badge = make('rect', 'sketch-canvas-dimension-badge');
    const text = make('text', 'sketch-canvas-dimension-text');
    setAttributes(badge, { y: -labelHeight / 2, height: labelHeight, rx: 5 });
    setAttributes(hit, { y: -hitHeight / 2, height: hitHeight });
    anchor.dataset.sketchCanvasDimension = key;
    for (const type of ['pointerdown', 'pointerup']) anchor.addEventListener(type, (event) => event.stopPropagation());
    const activate = (event) => {
      if (!activeMeasurement?.resize || !edit) return;
      event.preventDefault();
      event.stopPropagation();
      edit(anchor, key, activeMeasurement);
    };
    anchor.addEventListener('click', activate);
    anchor.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') activate(event);
    });
    anchor.append(hit, badge, text);
    group.append(guides, line, anchor);
    return [key, {group, guides, line, anchor, hit, badge, text}];
  }));

  function clear() {
    activeMeasurement = undefined;
    layer.remove();
  }

  function render(measurement) {
    const { start, end, values } = measurement ?? {};
    const transform = board.getScreenCTM();
    if (!isPoint(start) || !isPoint(end) || !values || !transform
        || !(Math.abs(transform.a * transform.d - transform.b * transform.c) > Number.EPSILON)) {
      clear();
      return;
    }
    const rect = board.getBoundingClientRect();
    const inverse = transform.inverse().translate(rect.left, rect.top);
    const matrix = [inverse.a, inverse.b, inverse.c, inverse.d, inverse.e, inverse.f];
    if (!matrix.every(Number.isFinite) || !rect.width || !rect.height) {
      clear();
      return;
    }
    // The annotation layer uses CSS-pixel units. CAD points are projected below,
    // so text and touch targets keep their size at any sketch zoom.
    layer.setAttribute('transform', 'matrix(' + matrix.join(' ') + ')');
    const project = ([x, y]) => [
      transform.a * x - transform.c * y + transform.e - rect.left,
      transform.b * x - transform.d * y + transform.f - rect.top,
    ];
    const data = projectDimensions(project(start), project(end), values, rect.width, rect.height);
    activeMeasurement = measurement;
    if (layer.parentNode !== board) board.append(layer);
    const language = board.ownerDocument.documentElement.lang.startsWith('en') ? 'en' : 'de';
    const editable = Boolean(measurement.resize && edit);
    const placed = new Map();
    for (const [key, row] of rows) {
      const annotation = data[key];
      if (!annotation) {
        row.group.remove();
        continue;
      }
      const {group, guides, line, anchor, badge, hit, text} = row;
      if (group.parentNode !== layer) layer.append(group);
      guides.setAttribute('d', annotation.guides);
      line.setAttribute('d', annotation.dimension);
      const label = dimensionLabel(key, values[key], language);
      if (!label) {
        row.group.remove();
        continue;
      }
      if (text.textContent !== label.title) text.textContent = label.title;
      const labelWidth = Math.max(minimumLabelWidth, text.getComputedTextLength() + 16);
      setAttributes(badge, { x: -labelWidth / 2, width: labelWidth });
      setAttributes(hit, { x: -(labelWidth + 8) / 2, width: labelWidth + 8 });
      const clamp = (value, size, half) => Math.min(Math.max(value, half), Math.max(half, size - half));
      const center = [
        clamp(annotation.center[0], rect.width, labelWidth / 2 + 4),
        clamp(annotation.center[1], rect.height, hitHeight / 2 + 3),
      ];
      const delta = key === 'dx' || key === 'dy';
      anchor.toggleAttribute('data-editable', editable);
      if (editable) {
        setAttributes(anchor, { role: 'button', tabindex: 0, 'aria-label': label.accessibleName });
      } else if (delta) {
        setAttributes(anchor, { role: 'img', 'aria-label': label.accessibleName });
        anchor.removeAttribute('tabindex');
      } else {
        for (const attribute of ['role', 'tabindex', 'aria-label']) anchor.removeAttribute(attribute);
      }
      placed.set(key, { key, center, width: labelWidth + 8, height: hitHeight, anchor });
    }
    const deltas = ['dx', 'dy'].map((key) => placed.get(key)).filter(Boolean);
    for (const item of layoutDimensionLabels(deltas, rect.width, rect.height)) {
      placed.get(item.key).center = item.center;
    }
    for (const { center, anchor } of placed.values()) {
      anchor.setAttribute('transform', 'translate(' + center[0] + ' ' + center[1] + ')');
    }
  }

  return { render, clear };
}
