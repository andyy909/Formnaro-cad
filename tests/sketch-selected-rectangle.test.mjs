import test from 'node:test';
import assert from 'node:assert/strict';
import { cadSketchExpression, defaultCadSketch, resolveCadSketch } from '../src/cad-sketch.js';
import { appendProfileLoop, profileFromLegacy, profilePrimitive } from '../src/sketch-profile.js';
import { upgradeSketchConstraints } from '../src/sketch-constraints-data.js';
import { solveSketchConstraints } from '../src/sketch-constraints-solver.js';
import { createSketchViewCache } from '../src/sketch-view-cache.js';
import { resizeSelectedRectangle } from '../src/sketch-selected-rectangle.js';

const TOLERANCE = 1e-7;
const near = (a, b, tolerance = TOLERANCE) => Math.abs(a - b) <= tolerance;
const read = (sketch) =>
  createSketchViewCache({ resolve: resolveCadSketch, expression: cadSketchExpression }).read(sketch);

const emptyProfile = () => ({
  version: 2,
  kind: 'profile',
  variables: [],
  dimensions: { height: '3' },
  elements: [],
  loops: [],
});
const circle = (id, center, diameter) => ({ id, type: 'circle', center, diameter, construction: false });

function rectangle(from = [-20, -10], to = [20, 10]) {
  const lines = profilePrimitive('rectangle', from, to),
    sketch = appendProfileLoop(emptyProfile(), lines, 'outer');
  return { sketch, ids: lines.map((line) => line.id) };
}

function bounds(sketch, ids) {
  const elements = ids.map((id) => sketch.elements.find((element) => element.id === id)),
    xs = elements.flatMap((element) => [element.start[0], element.end[0]]),
    ys = elements.flatMap((element) => [element.start[1], element.end[1]]);
  return { min: [Math.min(...xs), Math.min(...ys)], max: [Math.max(...xs), Math.max(...ys)] };
}

function heldCorner(sketch, ids, direction) {
  const elements = ids.map((id) => sketch.elements.find((element) => element.id === id));
  return direction.map((sign, axis) => elements[sign < 0 ? 2 : 0].start[axis]);
}

test('All four corner directions keep the held corner, the requested size and the bore', () => {
  for (const direction of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ])
    for (const key of ['x', 'y']) {
      const base = rectangle(),
        sketch = appendProfileLoop(base.sketch, [circle('hole', [0, 0], 4)], 'hole'),
        before = structuredClone(sketch),
        data = read(sketch),
        geometry = JSON.stringify(data.geometry),
        result = resizeSelectedRectangle(sketch, { shape: 'rectangle', ids: base.ids, direction }, data, key, 30);
      assert.deepEqual(sketch, before);
      assert.equal(JSON.stringify(data.geometry), geometry);
      assert.notEqual(result, sketch);
      const old = bounds(sketch, base.ids),
        fixed = heldCorner(sketch, base.ids, direction),
        size = { x: old.max[0] - old.min[0], y: old.max[1] - old.min[1] };
      size[key] = 30;
      const moving = fixed.map(
          (coordinate, axis) => coordinate + direction[axis] * (axis === 0 ? size.x : size.y),
        ),
        next = bounds(result, base.ids);
      assert.ok(near(next.min[0], Math.min(fixed[0], moving[0])), `${direction} ${key}: linke Kante`);
      assert.ok(near(next.max[0], Math.max(fixed[0], moving[0])), `${direction} ${key}: rechte Kante`);
      assert.ok(near(next.min[1], Math.min(fixed[1], moving[1])), `${direction} ${key}: untere Kante`);
      assert.ok(near(next.max[1], Math.max(fixed[1], moving[1])), `${direction} ${key}: obere Kante`);
      assert.deepEqual(
        result.elements.find((element) => element.id === 'hole'),
        sketch.elements.find((element) => element.id === 'hole'),
      );
      assert.deepEqual(result.loops, sketch.loops);
      const resolved = resolveCadSketch(result);
      assert.ok(near(resolved.size[0], size.x));
      assert.ok(near(resolved.size[1], size.y));
      assert.ok(near(resolved.area, size.x * size.y - Math.PI * 4, 1e-6));
    }
});

test('An offset rectangle keeps the held corner of its own directions', () => {
  const { sketch, ids } = rectangle([10, 5], [50, 25]),
    data = read(sketch),
    x = bounds(resizeSelectedRectangle(sketch, { shape: 'rectangle', ids, direction: [-1, 1] }, data, 'x', 20), ids),
    y = bounds(resizeSelectedRectangle(sketch, { shape: 'rectangle', ids, direction: [-1, 1] }, data, 'y', 8), ids);
  assert.ok(near(x.min[0], 30) && near(x.max[0], 50));
  assert.ok(near(x.min[1], 5) && near(x.max[1], 25));
  assert.ok(near(y.min[0], 10) && near(y.max[0], 50));
  assert.ok(near(y.min[1], 5) && near(y.max[1], 13));
});

test('The unchanged old rectangle keeps its center and edits width/depth only', () => {
  const sketch = defaultCadSketch(),
    before = structuredClone(sketch),
    data = read(sketch),
    x = resizeSelectedRectangle(sketch, { shape: 'rectangle' }, data, 'x', 64);
  assert.deepEqual(sketch, before);
  assert.equal(x.dimensions.width, '64');
  assert.equal(x.dimensions.depth, 'tiefe');
  assert.deepEqual(x.variables, sketch.variables);
  assert.deepEqual(x.points, sketch.points);
  const rx = resolveCadSketch(x);
  assert.ok(near(rx.size[0], 64) && near(rx.size[1], 30));
  assert.ok(near(rx.points[0][0], -32) && near(rx.points[2][0], 32));

  const y = resizeSelectedRectangle(sketch, { shape: 'rectangle', direction: [-1, -1] }, data, 'y', 12.5);
  assert.equal(y.dimensions.depth, '12.5');
  assert.equal(y.dimensions.width, 'breite');
  const ry = resolveCadSketch(y);
  assert.ok(near(ry.size[0], 40) && near(ry.size[1], 12.5));
  assert.ok(near(ry.points[0][1], -6.25) && near(ry.points[2][1], 6.25));

  assert.throws(
    () => resizeSelectedRectangle({ ...sketch, kind: 'polygon' }, { shape: 'rectangle' }, data, 'x', 20),
    /alte Rechteck-Grundform/,
  );
});

test('Formula-bound rectangle sides are rejected instead of silently replaced', () => {
  const legacy = defaultCadSketch(),
    sketch = profileFromLegacy(legacy, resolveCadSketch(legacy)),
    ids = [...sketch.loops[0].elements],
    before = structuredClone(sketch),
    data = read(sketch);
  assert.ok(sketch.elements.some((element) => !Number.isFinite(Number(element.start[0]))));
  assert.throws(
    () => resizeSelectedRectangle(sketch, { shape: 'rectangle', ids, direction: [1, 1] }, data, 'x', 50),
    /Formelgebundene Rechteckseite/,
  );
  assert.deepEqual(sketch, before);

  const mixed = rectangle();
  mixed.sketch.variables = [{ name: 'hoehe', value: '10' }];
  const right = mixed.sketch.elements.find((element) => element.id === mixed.ids[1]);
  right.end = ['20', 'hoehe'];
  assert.throws(
    () =>
      resizeSelectedRectangle(
        mixed.sketch,
        { shape: 'rectangle', ids: mixed.ids, direction: [1, 1] },
        read(mixed.sketch),
        'y',
        20,
      ),
    /Formelgebundene Rechteckseite/,
  );
});

test('Neighbouring geometry at the moving corner blocks instead of tearing off', () => {
  const base = rectangle(),
    guide = { id: 'guide', type: 'line', start: [20, 10], end: [30, 18], construction: true },
    sketch = { ...base.sketch, elements: [...base.sketch.elements, guide] },
    before = structuredClone(sketch),
    data = read(sketch);
  assert.throws(
    () =>
      resizeSelectedRectangle(sketch, { shape: 'rectangle', ids: base.ids, direction: [1, 1] }, data, 'x', 50),
    /Geometriebindung/,
  );
  assert.deepEqual(sketch, before);

  const result = resizeSelectedRectangle(
    sketch,
    { shape: 'rectangle', ids: base.ids, direction: [-1, -1] },
    data,
    'y',
    12,
  );
  assert.deepEqual(result.elements.find((element) => element.id === 'guide'), guide);
  assert.ok(near(bounds(result, base.ids).max[1], 10));
});

test('Resizing a rectangular opening keeps the outer contour and neighbouring openings', () => {
  let sketch = appendProfileLoop(emptyProfile(), profilePrimitive('rectangle', [-40, -30], [40, 30]), 'outer');
  const opening = profilePrimitive('rectangle', [-10, -8], [10, 8]),
    other = profilePrimitive('rectangle', [20, -5], [30, 5]);
  sketch = appendProfileLoop(sketch, opening, 'hole');
  sketch = appendProfileLoop(sketch, other, 'hole');
  const before = structuredClone(sketch),
    data = read(sketch),
    ids = opening.map((element) => element.id),
    result = resizeSelectedRectangle(sketch, { shape: 'rectangle', ids, direction: [-1, -1] }, data, 'x', 30);
  assert.deepEqual(sketch, before);
  assert.deepEqual(result.loops, sketch.loops);
  for (const element of sketch.elements) {
    if (opening.some((line) => line.id === element.id)) continue;
    assert.deepEqual(result.elements.find((candidate) => candidate.id === element.id), element);
  }
  const next = bounds(result, ids);
  assert.ok(near(next.min[0], -20) && near(next.max[0], 10));
  assert.ok(near(next.min[1], -8) && near(next.max[1], 8));
  assert.ok(near(resolveCadSketch(result).area, 80 * 60 - 30 * 16 - 10 * 10));
});

test('Version 3 constraints stay untouched and the solved result keeps the held corner', () => {
  const base = rectangle(),
    sketch = upgradeSketchConstraints(appendProfileLoop(base.sketch, [circle('hole', [0, 0], 4)], 'hole')),
    before = structuredClone(sketch),
    data = read(sketch),
    result = resizeSelectedRectangle(sketch, { shape: 'rectangle', ids: base.ids, direction: [1, 1] }, data, 'y', 25);
  assert.deepEqual(sketch, before);
  assert.deepEqual(result.constraints, sketch.constraints);
  const solved = solveSketchConstraints(result);
  assert.equal(solved.ok, true, JSON.stringify(solved));
  assert.ok(near(resolveCadSketch(solved.sketch).size[0], 40));
  assert.ok(near(resolveCadSketch(solved.sketch).size[1], 25));
});

test('Invalid values, targets and side sets are rejected without changing the input', () => {
  const base = rectangle(),
    sketch = base.sketch,
    before = structuredClone(sketch),
    data = read(sketch),
    target = { shape: 'rectangle', ids: base.ids, direction: [1, 1] };
  for (const value of [0, -2, NaN, Infinity, 10000.01, undefined, '30', null])
    assert.throws(() => resizeSelectedRectangle(sketch, target, data, 'x', value));
  for (const key of ['width', 'radius', 'dx', undefined])
    assert.throws(() => resizeSelectedRectangle(sketch, target, data, key, 20));
  assert.throws(() => resizeSelectedRectangle(sketch, { ...target, shape: 'circle' }, data, 'x', 20));
  assert.throws(() => resizeSelectedRectangle(sketch, { ...target, ids: base.ids.slice(0, 3) }, data, 'x', 20));
  assert.throws(
    () => resizeSelectedRectangle(sketch, { ...target, ids: [...base.ids.slice(0, 3), base.ids[0]] }, data, 'x', 20),
  );
  assert.throws(
    () => resizeSelectedRectangle(sketch, { ...target, ids: [...base.ids.slice(0, 3), 'missing'] }, data, 'x', 20),
  );
  assert.throws(() => resizeSelectedRectangle(sketch, { ...target, direction: [1] }, data, 'x', 20));
  assert.throws(() => resizeSelectedRectangle(sketch, { ...target, direction: [0, 1] }, data, 'x', 20));
  assert.throws(() => resizeSelectedRectangle(sketch, target, { ...data, geometry: null }, 'x', 20));
  assert.throws(() => resizeSelectedRectangle(sketch, { shape: 'rectangle' }, data, 'x', 20));
  assert.throws(
    () =>
      resizeSelectedRectangle(
        defaultCadSketch(),
        { shape: 'rectangle', ids: base.ids, direction: [1, 1] },
        read(defaultCadSketch()),
        'x',
        20,
      ),
  );
  assert.deepEqual(sketch, before);
});

test('a reopened rectangle can start at any corner and run clockwise', () => {
  const { sketch, ids } = rectangle();
  const loop = sketch.loops[0];
  loop.elements = [...ids.slice(1), ids[0]].reverse();
  for (const element of sketch.elements) {
    if (ids.includes(element.id)) [element.start, element.end] = [element.end, element.start];
  }
  const data = read(sketch);
  const target = { shape: 'rectangle', ids: loop.elements, direction: [1, 1] };
  const result = resizeSelectedRectangle(sketch, target, data, 'x', 45);
  assert.equal(bounds(result, ids).max[0] - bounds(result, ids).min[0], 45);
  assert.deepEqual(result.loops, sketch.loops);
  for (const element of result.elements.filter((element) => ids.includes(element.id))) {
    const index = loop.elements.indexOf(element.id);
    const next = result.elements.find((other) => other.id === loop.elements[(index + 1) % 4]);
    assert.deepEqual(next.start, element.end);
  }
});
