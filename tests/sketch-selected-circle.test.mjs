import test from 'node:test';
import assert from 'node:assert/strict';
import { resizeSelectedCircle } from '../src/sketch-selected-circle.js';
import { solveSketchConstraints, sketchConstraintResiduals } from '../src/sketch-constraints-solver.js';

const circle = (id, center = [20, 20], diameter = 10) => ({
  id,
  type: 'circle',
  center,
  diameter: String(diameter),
  construction: false,
});
const line = (id, start = [0, 0], end = [10, 0]) => ({ id, type: 'line', start, end, construction: false });
const draft = (version, elements, constraints = []) => ({
  version,
  kind: 'profile',
  variables: [],
  dimensions: { height: '3' },
  elements,
  loops: [],
  ...(version >= 3 ? { constraints } : {}),
});
const legacy = (diameter = '8') => ({
  version: 1,
  kind: 'circle',
  variables: [],
  dimensions: { diameter, height: '3' },
  points: [],
});
const near = (a, b) => assert.ok(Math.abs(Number(a) - Number(b)) < 1e-7, `${a} vs ${b}`);

test('Legacy base circle changes only its diameter and leaves the source untouched', () => {
  const sketch = legacy('8'),
    before = structuredClone(sketch),
    out = resizeSelectedCircle(sketch, null, 12.5);
  assert.notEqual(out, sketch);
  assert.equal(out.dimensions.diameter, '12.5');
  assert.equal(out.dimensions.height, '3');
  assert.equal(out.version, 1);
  assert.deepEqual(sketch, before);
});

test('Profile circle keeps its element id, centre, neighbours and untouched relations', () => {
  const sketch = draft(
      3,
      [line('level'), circle('hole'), circle('neighbour', [60, 50], 6)],
      [
        { id: 'level-relation', type: 'horizontal', refs: [{ element: 'level' }] },
        { id: 'neighbour-fixed', type: 'fixed', refs: [{ element: 'neighbour' }], value: { center: [60, 50], diameter: 6 } },
      ],
    ),
    before = structuredClone(sketch),
    out = resizeSelectedCircle(sketch, 'hole', 12),
    changed = out.elements.find((element) => element.id === 'hole'),
    relation = out.constraints.find(
      (constraint) => constraint.type === 'radius' && constraint.refs[0].element === 'hole',
    );
  assert.equal(changed.id, 'hole');
  assert.deepEqual(changed.center, [20, 20]);
  assert.deepEqual(out.elements.find((element) => element.id === 'neighbour'), sketch.elements[2]);
  assert.deepEqual(out.elements, [sketch.elements[0], { ...sketch.elements[1], diameter: '12' }, sketch.elements[2]]);
  assert.deepEqual(out.constraints.find((constraint) => constraint.id === 'level-relation'), sketch.constraints[0]);
  assert.deepEqual(out.constraints.find((constraint) => constraint.id === 'neighbour-fixed'), sketch.constraints[1]);
  assert.equal(relation.value, '6');
  assert.deepEqual(sketch, before);
  const solved = solveSketchConstraints(out);
  assert.equal(solved.ok, true, JSON.stringify(solved));
  near(solved.sketch.elements.find((element) => element.id === 'hole').diameter, 12);
  assert.ok(sketchConstraintResiduals(solved.sketch).rows.every((row) => Math.abs(row.value) < 1e-7));
  const solvedNeighbour = solved.sketch.elements.find((element) => element.id === 'neighbour');
  assert.deepEqual(solvedNeighbour.center.map(Number), [60, 50]);
  assert.equal(Number(solvedNeighbour.diameter), 6);
});

test('Version 2 circle stores the radius relation as diameter and keeps neighbours', () => {
  const sketch = draft(2, [circle('hole'), circle('neighbour', [60, 50], 6)]),
    before = structuredClone(sketch),
    out = resizeSelectedCircle(sketch, 'hole', 14);
  assert.equal(out.elements.find((element) => element.id === 'hole').diameter, '2*(7)');
  assert.deepEqual(out.elements.find((element) => element.id === 'neighbour'), sketch.elements[1]);
  assert.deepEqual(sketch, before);
  const twice = resizeSelectedCircle(out, 'hole', 18);
  assert.equal(twice.elements.find((element) => element.id === 'hole').diameter, '2*(9)');
});

test('An existing literal radius relation keeps its stable id and receives the new value', () => {
  const sketch = draft(3, [circle('hole')], [
      { id: 'dimension-1', type: 'radius', refs: [{ element: 'hole' }], value: '5' },
    ]),
    out = resizeSelectedCircle(sketch, 'hole', 16);
  assert.equal(out.constraints.length, 1);
  assert.equal(out.constraints[0].id, 'dimension-1');
  assert.equal(out.constraints[0].value, '8');
});

test('Diameter bounds are inclusive and invalid values are rejected without mutation', () => {
  const sketch = draft(3, [circle('hole')], []),
    before = structuredClone(sketch);
  assert.equal(resizeSelectedCircle(sketch, 'hole', 0.01).constraints[0].value, '0.005');
  assert.equal(resizeSelectedCircle(sketch, 'hole', 10000).constraints[0].value, '5000');
  assert.equal(resizeSelectedCircle(legacy('8'), null, 0.01).dimensions.diameter, '0.01');
  assert.equal(resizeSelectedCircle(legacy('8'), null, 10000).dimensions.diameter, '10000');
  for (const bad of [0, 0.009999, 10000.0001, -1, NaN, Infinity, -Infinity, '10', null, undefined, {}, [10]]) {
    assert.throws(() => resizeSelectedCircle(sketch, 'hole', bad), /Durchmesser/);
    assert.throws(() => resizeSelectedCircle(legacy('8'), null, bad), /Durchmesser/);
  }
  assert.deepEqual(sketch, before);
});

test('Formula-bound and geometrically bound circle dimensions are not silently overwritten', () => {
  const formulaDiameter = draft(3, [{ ...circle('hole'), diameter: '2*width' }], []);
  formulaDiameter.variables = [{ name: 'width', value: '5' }];
  const formulaRelation = draft(3, [circle('hole')], [
    { id: 'radius-formula', type: 'radius', refs: [{ element: 'hole' }], value: 'width/2' },
  ]);
  formulaRelation.variables = [{ name: 'width', value: '10' }];
  const fixedCircle = draft(3, [circle('hole')], [
    {
      id: 'fixed-circle',
      type: 'fixed',
      refs: [{ element: 'hole' }],
      value: { center: [20, 20], diameter: 10 },
    },
  ]);
  const equalRadii = draft(3, [circle('hole'), circle('same', [60, 50], 10)], [
    { id: 'equal-radii', type: 'equalRadius', refs: [{ element: 'hole' }, { element: 'same' }] },
  ]);
  const legacyFormula = legacy('width');
  legacyFormula.variables = [{ name: 'width', value: '8' }];
  for (const [sketch, pattern] of [
    [formulaDiameter, /Formel/],
    [formulaRelation, /Formel/],
    [fixedCircle, /fixiert/],
    [equalRadii, /Radien/],
    [legacyFormula, /Formel/],
  ]) {
    const before = structuredClone(sketch);
    assert.throws(() => resizeSelectedCircle(sketch, sketch.kind === 'circle' ? null : 'hole', 12), pattern);
    assert.deepEqual(sketch, before);
  }
});

test('Missing elements and non-circular elements are rejected', () => {
  const sketch = draft(3, [line('line'), circle('hole')]);
  assert.throws(() => resizeSelectedCircle(sketch, 'missing', 10), /Kreiselement/);
  assert.throws(() => resizeSelectedCircle(sketch, 'line', 10), /Kreis/);
  assert.throws(() => resizeSelectedCircle(legacy('8'), 'hole', 10), /Kreiselement/);
  assert.throws(
    () => resizeSelectedCircle({ version: 1, kind: 'rectangle', dimensions: { width: '10' } }, null, 10),
    /Grundkreis/,
  );
});
