import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {DOMParser, XMLSerializer} from '@xmldom/xmldom';
import {resolveCadSketch} from '../src/cad-sketch.js';
import {cadProfileSvg} from '../src/cad-profile-svg.js';

const pointAt = (center, radius, angle) => [center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)];
const line = (start, end) => ({type: 'line', start, end});
const circle = (center, radius) => ({type: 'circle', center, radius});
// Resolved arcs carry point endpoints plus the signed angle according to src/sketch-profile.js.
const arc = (center, radius, startAngle, sweep) => ({
  type: 'arc',
  center,
  radius,
  startAngle,
  sweep,
  start: pointAt(center, radius, startAngle),
  end: pointAt(center, radius, startAngle + sweep),
});
const rectangle = (role, x, y, width, height) => ({
  role,
  entities: [
    line([x, y], [x + width, y]),
    line([x + width, y], [x + width, y + height]),
    line([x + width, y + height], [x, y + height]),
    line([x, y + height], [x, y]),
  ],
});

// Reference: work/Referenz-Montageplatte.json (local, not part of the repository).
const PLATE_REFERENCE = new URL('../work/Referenz-Montageplatte.json', import.meta.url);
const PLATE_HOLES = [
  [-40, -20],
  [-40, 20],
  [40, -20],
  [40, 20],
];
// 22 x 6 mm slot: two 3 mm cap centres 16 mm apart, so the caps add one diameter each.
const SLOT = {radius: 3, width: 6, overallLength: 22};
const plateSketch = () => ({
  version: 2,
  kind: 'profile',
  variables: [],
  dimensions: {height: '5'},
  elements: [
    {id: 'outer-bottom', type: 'line', start: ['-50', '-30'], end: ['50', '-30']},
    {id: 'outer-right', type: 'line', start: ['50', '-30'], end: ['50', '30']},
    {id: 'outer-top', type: 'line', start: ['50', '30'], end: ['-50', '30']},
    {id: 'outer-left', type: 'line', start: ['-50', '30'], end: ['-50', '-30']},
    ...PLATE_HOLES.map(([x, y], index) => ({
      id: `hole-${index + 1}`,
      type: 'circle',
      center: [String(x), String(y)],
      diameter: '6',
    })),
    {id: 'slot-bottom', type: 'line', start: ['-8', '-3'], end: ['8', '-3']},
    {id: 'slot-right', type: 'arc', start: ['8', '-3'], through: ['11', '0'], end: ['8', '3']},
    {id: 'slot-top', type: 'line', start: ['8', '3'], end: ['-8', '3']},
    {id: 'slot-left', type: 'arc', start: ['-8', '3'], through: ['-11', '0'], end: ['-8', '-3']},
  ],
  loops: [
    {id: 'plate', role: 'outer', elements: ['outer-bottom', 'outer-right', 'outer-top', 'outer-left']},
    ...PLATE_HOLES.map((_, index) => ({id: `hole-${index + 1}`, role: 'hole', elements: [`hole-${index + 1}`]})),
    {id: 'slot', role: 'hole', elements: ['slot-bottom', 'slot-right', 'slot-top', 'slot-left']},
  ],
});

// Resolves a real sketch and derives the SVG frame from the outer contour bounds.
const resolvePlate = () => {
  const resolved = resolveCadSketch(plateSketch());
  const bounds = {
    x: resolved.center[0] - resolved.size[0] / 2,
    y: resolved.center[1] - resolved.size[1] / 2,
    width: resolved.size[0],
    height: resolved.size[1],
  };
  return {resolved, bounds, svg: cadProfileSvg({loops: resolved.loops, bounds})};
};

const pathData = (svg) => [...svg.matchAll(/ d="([^"]+)"/g)].map((match) => match[1]);

const pathNodes = (d) => {
  const nodes = [];
  let current = null,
    subpath = null;
  for (const part of d.match(/[MLAZ][^MLAZ]*/g) ?? []) {
    const type = part[0];
    const numbers = type === 'Z' ? [] : part.slice(1).trim().split(/\s+/).map(Number);
    if (type === 'M') {
      current = numbers;
      subpath = numbers;
    } else if (type === 'L') {
      nodes.push({type, numbers, from: current});
      current = numbers;
    } else if (type === 'A') {
      nodes.push({type, numbers, from: current});
      current = numbers.slice(-2);
    } else if (type === 'Z') {
      nodes.push({type, numbers, from: current});
      current = subpath;
    }
  }
  return nodes;
};

// Mirrors CAD millimetres (Y up) into the local SVG frame (Y down).
const toSvgPoint = (bounds, [x, y]) => [x - bounds.x, bounds.y + bounds.height - y];

// Independent endpoint-to-centre conversion for circular SVG arcs (SVG 1.1 F.6.5, rotation 0).
const resolveCircularArc = (from, [rx, ry, rotation, largeArc, sweepFlag, x, y]) => {
  assert.equal(rx, ry, 'only circular arcs are emitted');
  assert.equal(rotation, 0);
  const [x1, y1] = from;
  const dx = (x1 - x) / 2,
    dy = (y1 - y) / 2,
    lambda = dx * dx + dy * dy;
  const factor = Math.sqrt(Math.max(0, (rx * rx) / lambda - 1)) * (largeArc === sweepFlag ? -1 : 1);
  const cxp = factor * dy,
    cyp = -factor * dx,
    cx = cxp + (x1 + x) / 2,
    cy = cyp + (y1 + y) / 2;
  const startAngle = Math.atan2(dy - cyp, dx - cxp);
  const endAngle = Math.atan2(-dy - cyp, -dx - cxp);
  let sweep = endAngle - startAngle;
  if (!sweepFlag && sweep > 0) sweep -= 2 * Math.PI;
  if (sweepFlag && sweep < 0) sweep += 2 * Math.PI;
  return {
    center: [cx, cy],
    radius: rx,
    sweep,
    pointAt: (t) => [cx + rx * Math.cos(startAngle + t * sweep), cy + rx * Math.sin(startAngle + t * sweep)],
  };
};

// Walks the emitted SVG arc and compares it with the mirrored CAD arc point by point.
const assertFollowsCadArc = (node, cadArc, bounds) => {
  const resolved = resolveCircularArc(node.from, node.numbers),
    expectedCenter = toSvgPoint(bounds, cadArc.center);
  assert.ok(
    Math.hypot(resolved.center[0] - expectedCenter[0], resolved.center[1] - expectedCenter[1]) < 1e-4,
    `arc centre ${resolved.center} differs from ${expectedCenter}`,
  );
  assert.ok(Math.abs(Math.abs(resolved.sweep) - Math.abs(cadArc.sweep)) < 1e-4, 'arc keeps its angular size');
  const samples = 12;
  for (let step = 0; step <= samples; step += 1) {
    const t = step / samples,
      angle = cadArc.startAngle + t * cadArc.sweep,
      expected = toSvgPoint(bounds, pointAt(cadArc.center, cadArc.radius, angle)),
      actual = resolved.pointAt(t);
    assert.ok(
      Math.hypot(actual[0] - expected[0], actual[1] - expected[1]) < 1e-4,
      `arc point t=${t} is ${actual}, expected ${expected}`,
    );
  }
};

test('A 100 x 60 mm rectangle becomes an explicit millimetre SVG with Y pointing down', () => {
  const svg = cadProfileSvg({
    loops: [rectangle('outer', 0, 0, 100, 60)],
    bounds: {x: 0, y: 0, width: 100, height: 60},
  });
  assert.match(svg, /width="100mm"/);
  assert.match(svg, /height="60mm"/);
  assert.match(svg, /viewBox="0 0 100 60"/);
  const path = svg.match(/<path data-role="outer" d="([^"]+)" fill="none"/);
  assert.ok(path, 'outer section path is present and unfilled');
  // CAD Y up: the bottom edge (y=0) sits at SVG y=60, the top edge (y=60) at 0.
  assert.equal(path[1], 'M0 60 L100 60 L100 0 L0 0 Z');
  assert.ok(!/<circle|<ellipse|<arc/i.test(svg));
});

test('Absolute bounds only shift the output, never the measured 100 x 60 mm part', () => {
  const local = cadProfileSvg({
    loops: [rectangle('outer', 0, 0, 100, 60)],
    bounds: {x: 0, y: 0, width: 100, height: 60},
  });
  const offset = cadProfileSvg({
    loops: [rectangle('outer', 10, 20, 100, 60)],
    bounds: {x: 10, y: 20, width: 100, height: 60},
  });
  assert.equal(offset, local);
});

test('Holes stay separate unfilled section paths in the given order', () => {
  const svg = cadProfileSvg({
    loops: [rectangle('outer', 0, 0, 100, 60), rectangle('hole', 20, 20, 10, 10)],
    bounds: {x: 0, y: 0, width: 100, height: 60},
  });
  const roles = [...svg.matchAll(/data-role="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(roles, ['outer', 'hole']);
  assert.match(svg, /data-role="hole" d="M20 40 L30 40 L30 30 L20 30 Z" fill="none"/);
  assert.equal((svg.match(/fill="none"/g) ?? []).length, 2);
});

test('Decimal millimetre bounds stay exact and never use exponent notation', () => {
  const svg = cadProfileSvg({
    loops: [rectangle('outer', 0.25, -0.5, 12.5, 10.25)],
    bounds: {x: 0.25, y: -0.5, width: 12.5, height: 10.25},
  });
  assert.match(svg, /width="12.5mm"/);
  assert.match(svg, /height="10.25mm"/);
  assert.match(svg, /viewBox="0 0 12.5 10.25"/);
  assert.match(svg, /d="M0 10.25 L12.5 10.25 L12.5 0 L0 0 Z"/);
  assert.ok(!/e[+-]?\d/i.test(svg));
});

test('A generic SVG reader parses the output and sees the declared physical size', () => {
  const svg = cadProfileSvg({
    loops: [rectangle('outer', 0, 0, 100, 60), rectangle('hole', 40, 20, 20, 20)],
    bounds: {x: 0, y: 0, width: 100, height: 60},
  });
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = document.documentElement;
  assert.equal(root.tagName, 'svg');
  assert.equal(root.getAttribute('xmlns'), 'http://www.w3.org/2000/svg');
  assert.equal(root.getAttribute('width'), '100mm');
  assert.equal(root.getAttribute('height'), '60mm');
  assert.equal(root.getAttribute('viewBox'), '0 0 100 60');
  const paths = root.getElementsByTagName('path');
  assert.equal(paths.length, 2);
  for (let index = 0; index < paths.length; index += 1) assert.equal(paths.item(index).getAttribute('fill'), 'none');
  const serialized = new XMLSerializer().serializeToString(document);
  assert.match(serialized, /<svg[^>]+width="100mm"[^>]+height="60mm"/);
});

test('Contours must be closed and must not contain degenerate lines', () => {
  const bounds = {x: 0, y: 0, width: 100, height: 60};
  const open = rectangle('outer', 0, 0, 100, 60);
  open.entities.pop();
  assert.throws(() => cadProfileSvg({loops: [open], bounds}), /nicht geschlossen/);
  assert.throws(
    () => cadProfileSvg({loops: [{role: 'outer', entities: [line([5, 5], [5, 5])]}], bounds}),
    /keine Länge/,
  );
  assert.throws(
    () =>
      cadProfileSvg({
        loops: [{role: 'outer', entities: [line([0, 0], [10, 0]), arc([0, 0], 10, 0, Math.PI / 2)]}],
        bounds,
      }),
    /nicht geschlossen/,
  );
});

test('A circle becomes a single <circle> element around the mirrored centre', () => {
  const bounds = {x: -50, y: -30, width: 100, height: 60};
  const svg = cadProfileSvg({loops: [{role: 'outer', entities: [circle([40, 20], 3)]}], bounds});
  assert.match(svg, /<circle data-role="outer" cx="90" cy="10" r="3" fill="none" stroke="#000000"/);
  assert.ok(!/<path|<ellipse|<arc/i.test(svg), 'a circle stays one circular element');
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const circles = document.getElementsByTagName('circle');
  assert.equal(circles.length, 1);
  assert.equal(circles.item(0).getAttribute('cx'), '90');
  assert.equal(circles.item(0).getAttribute('cy'), '10');
  assert.equal(circles.item(0).getAttribute('r'), '3');
});

test('Small and large arcs keep their direction when SVG mirrors CAD Y', () => {
  const bounds = {x: -50, y: -30, width: 100, height: 60};
  const cases = [
    {name: 'small arc counter-clockwise', entity: arc([0, 0], 10, 0, Math.PI / 2), end: [0, 10], flags: [0, 0]},
    {
      name: 'large arc counter-clockwise',
      entity: arc([0, 0], 10, 0, (3 * Math.PI) / 2),
      end: [0, -10],
      flags: [1, 0],
    },
    {name: 'small arc clockwise', entity: arc([0, 0], 10, 0, -Math.PI / 2), end: [0, -10], flags: [0, 1]},
    {name: 'large arc clockwise', entity: arc([0, 0], 10, 0, (-3 * Math.PI) / 2), end: [0, 10], flags: [1, 1]},
  ];
  for (const {name, entity, end, flags} of cases) {
    const svg = cadProfileSvg({
      loops: [{role: 'outer', entities: [line([0, 0], [10, 0]), entity, line(end, [0, 0])]}],
      bounds,
    });
    const arcs = pathNodes(pathData(svg)[0]).filter((node) => node.type === 'A');
    assert.equal(arcs.length, 1, name);
    assert.deepEqual(arcs[0].numbers.slice(0, 5), [10, 10, 0, ...flags], name);
    const expectedEnd = toSvgPoint(bounds, end);
    assert.ok(
      Math.hypot(arcs[0].numbers[5] - expectedEnd[0], arcs[0].numbers[6] - expectedEnd[1]) < 1e-4,
      `${name}: arc ends on the mirrored CAD point`,
    );
    assertFollowsCadArc(arcs[0], entity, bounds);
    // The CAD sweep sign decides the visual turn: positive sweeps look counter-clockwise.
    assert.equal(arcs[0].numbers[4], entity.sweep > 0 ? 0 : 1, `${name}: sweep flag follows the signed sweep`);
    assert.equal(arcs[0].numbers[3], Math.abs(entity.sweep) > Math.PI ? 1 : 0, `${name}: large-arc flag`);
  }
});

test('The resolved reference plate yields four diameter-6 circles and two arc commands', () => {
  const {resolved, bounds, svg} = resolvePlate();
  assert.match(svg, /width="100mm" height="60mm"/);
  const circles = resolved.loops.filter((loop) => loop.entities.length === 1 && loop.entities[0].type === 'circle');
  assert.equal(circles.length, 4, 'the sketch keeps four genuine circle entities');
  for (const loop of circles) {
    assert.equal(loop.role, 'hole');
    assert.equal(loop.entities[0].radius, 3);
  }

  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const elements = document.documentElement.childNodes;
  const shapes = [];
  for (let index = 0; index < elements.length; index += 1) {
    const node = elements.item(index);
    if (['circle', 'path'].includes(node.tagName)) shapes.push(node);
  }
  assert.deepEqual(
    shapes.map((node) => node.tagName),
    ['path', 'circle', 'circle', 'circle', 'circle', 'path'],
    'outer contour, four hole circles and the slot path',
  );
  const circleNodes = shapes.filter((node) => node.tagName === 'circle');
  circleNodes.forEach((node, index) => {
    const [x, y] = toSvgPoint(bounds, PLATE_HOLES[index]);
    assert.equal(node.getAttribute('data-role'), 'hole');
    assert.equal(node.getAttribute('cx'), String(x));
    assert.equal(node.getAttribute('cy'), String(y));
    assert.equal(node.getAttribute('r'), '3');
    assert.equal(node.getAttribute('fill'), 'none');
  });

  const paths = pathData(svg);
  assert.equal(paths.length, 2, 'one outer contour and one slot contour');
  assert.equal(paths.join(' ').match(/ L/g).length, 5, 'three outer edges and two slot flanks');
  assert.equal(paths.join(' ').match(/ A/g).length, 2, 'exactly the two slot semicircles');
  assert.ok(!/<ellipse/i.test(svg));

  assert.equal(paths[1], 'M42 33 L58 33 A3 3 0 0 0 58 27 L42 27 A3 3 0 0 0 42 33 Z');
  const slotLoop = resolved.loops[resolved.loops.length - 1];
  const slotArcs = pathNodes(paths[1]).filter((node) => node.type === 'A');
  assert.equal(slotArcs.length, 2);
  for (const node of slotArcs) {
    assert.deepEqual(node.numbers.slice(0, 5), [3, 3, 0, 0, 0], 'semicircle, radius 3');
    const chord = Math.hypot(node.numbers[5] - node.from[0], node.numbers[6] - node.from[1]);
    assert.ok(Math.abs(chord - 6) < 1e-9, 'each slot cap spans one diameter');
  }
  assertFollowsCadArc(slotArcs[0], slotLoop.entities[1], bounds);
  assertFollowsCadArc(slotArcs[1], slotLoop.entities[3], bounds);

  // Cross-check the local reference document when it is available; it stays outside Git.
  if (existsSync(PLATE_REFERENCE)) {
    const reference = JSON.parse(readFileSync(PLATE_REFERENCE, 'utf8'));
    assert.equal(reference.unit, 'mm');
    assert.deepEqual(reference.outer.min, [bounds.x, bounds.y]);
    assert.deepEqual(reference.outer.max, [bounds.x + bounds.width, bounds.y + bounds.height]);
    assert.equal(reference.holes.diameter, 6);
    assert.deepEqual(reference.holes.centers, PLATE_HOLES);
    assert.deepEqual(reference.slot.centers, [
      [-8, 0],
      [8, 0],
    ]);
    assert.equal(reference.slot.width, SLOT.width);
    assert.equal(reference.slot.overallLength, SLOT.overallLength);
    const types = resolved.loops.flatMap((loop) => loop.entities.map((entity) => entity.type));
    assert.equal(types.filter((type) => type === 'line').length, reference.expected.lines);
    assert.equal(types.filter((type) => type === 'circle').length, reference.expected.circles);
    assert.equal(types.filter((type) => type === 'arc').length, reference.expected.arcs);
    assert.equal(resolved.loops.length, reference.expected.outerLoops + reference.expected.innerLoops);
  }
});

test('Short valid edges survive while endpoint drift stays at the sketch tolerance', () => {
  const bounds = {x: 0, y: 0, width: 100, height: 60};
  const framed = (tiny) => ({
    role: 'outer',
    entities: [
      line([0, 0], [100, 0]),
      line([100, 0], [100, 60]),
      line([100, 60], [50 + tiny, 60]),
      line([50 + tiny, 60], [50 - tiny, 60]),
      line([50 - tiny, 60], [0, 60]),
      line([0, 60], [0, 0]),
    ],
  });
  // A 4e-6 mm edge stays a real edge and keeps its own coordinates in the drawing.
  const visible = cadProfileSvg({loops: [framed(2e-6)], bounds});
  assert.match(visible, /d="M0 60 L100 60 L100 0 L50.000002 0 L49.999998 0 L0 0 Z"/);
  // Even an edge shorter than the 1e-7 mm endpoint tolerance is a valid CAD edge.
  const tinySvg = cadProfileSvg({loops: [framed(2.5e-8)], bounds});
  assert.equal((tinySvg.match(/ L/g) ?? []).length, 5, 'no contour element is dropped');

  // Endpoint agreement uses the sketch's 1e-7 mm join tolerance, not the length check.
  const drift = (gap) => ({
    role: 'outer',
    entities: [line([0, 0], [50, 30]), line([50 + gap, 30], [0, 0])],
  });
  assert.doesNotThrow(() => cadProfileSvg({loops: [drift(5e-8)], bounds}));
  assert.throws(() => cadProfileSvg({loops: [drift(5e-6)], bounds}), /nicht geschlossen/);
});

test('Circles and arcs are validated as closed, bounded analytic contours', () => {
  const bounds = {x: 0, y: 0, width: 100, height: 60};
  const loop = (entities) => [{role: 'outer', entities}];
  assert.throws(() => cadProfileSvg({loops: loop([circle([50, 30], 0)]), bounds}), /positiven Radius/);
  assert.throws(() => cadProfileSvg({loops: loop([circle([50, 30], -3)]), bounds}), /positiven Radius/);
  assert.throws(
    () => cadProfileSvg({loops: loop([circle([50, 30], Number.POSITIVE_INFINITY)]), bounds}),
    /endlichen Radius/,
  );
  assert.throws(() => cadProfileSvg({loops: loop([circle([99, 30], 3)]), bounds}), /außerhalb der Grenzen/);
  assert.throws(
    () => cadProfileSvg({loops: loop([circle([50, 30], 3), line([0, 0], [1, 0])]), bounds}),
    /Kreis braucht eine eigene Kontur/,
  );
  const pointed = (start, end, sweep = Math.PI / 2) => ({
    type: 'arc',
    center: [0, 0],
    radius: 10,
    startAngle: 0,
    start,
    end,
    sweep,
  });
  assert.throws(() => cadProfileSvg({loops: loop([pointed([10, 0], [0, 10], 0)]), bounds}), /keinen Bogen/);
  assert.throws(() => cadProfileSvg({loops: loop([pointed([10, 0], [0, 10], 2 * Math.PI)]), bounds}), /Vollkreis/);
  assert.throws(
    () => cadProfileSvg({loops: loop([pointed([10 + 5e-6, 0], [0, 10])]), bounds}),
    /start passt nicht zu startAngle und Radius/,
  );
  assert.throws(
    () => cadProfileSvg({loops: loop([pointed([10, 0], [5e-6, 10])]), bounds}),
    /end passt nicht zu startAngle, sweep und Radius/,
  );
  assert.throws(() => cadProfileSvg({loops: loop([arc([50, 30], 0, 0, Math.PI / 2)]), bounds}), /positiven Radius/);
  assert.throws(
    () => cadProfileSvg({loops: loop([arc([50, 30], 60, 0, Math.PI / 2)]), bounds}),
    /außerhalb der Grenzen/,
  );
  assert.throws(
    () => cadProfileSvg({loops: loop([{type: 'spline', start: [0, 0], end: [1, 1]}]), bounds}),
    (error) =>
      error.message.includes('Nicht unterstützter Typ "spline"') &&
      error.message.includes('"line", "circle" und "arc"'),
  );
});

test('Invalid bounds, roles, missing outers and out-of-bounds points fail clearly', () => {
  const bounds = {x: 0, y: 0, width: 100, height: 60};
  assert.throws(() => cadProfileSvg({loops: [rectangle('outer', 0, 0, 100, 60)]}), /Grenzen/);
  assert.throws(
    () => cadProfileSvg({loops: [rectangle('outer', 0, 0, 100, 60)], bounds: {...bounds, width: 0}}),
    /positive Breite/,
  );
  assert.throws(
    () => cadProfileSvg({loops: [rectangle('outer', 0, 0, 100, 60)], bounds: {...bounds, height: Number.NaN}}),
    /endliche Zahlen/,
  );
  assert.throws(() => cadProfileSvg({bounds}), /Kontur \(loops\)/);
  assert.throws(
    () => cadProfileSvg({loops: [{...rectangle('outer', 0, 0, 100, 60), role: 'edge'}], bounds}),
    /Rolle "outer" oder "hole"/,
  );
  assert.throws(() => cadProfileSvg({loops: [rectangle('hole', 10, 10, 10, 10)], bounds}), /Außenkontur/);
  assert.throws(() => cadProfileSvg({loops: [rectangle('outer', 0, 0, 100.001, 60)], bounds}), /außerhalb der Grenzen/);
});
