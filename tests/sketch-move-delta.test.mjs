import test from 'node:test';
import assert from 'node:assert/strict';
import { sketchMoveDelta } from '../src/sketch-move-delta.js';

test('Move delta is positive right/up in all four quadrants and keeps signs', () => {
  assert.deepEqual(sketchMoveDelta([10, 10], [15, 17]), [5, 7]);
  assert.deepEqual(sketchMoveDelta([10, 10], [5, 17]), [-5, 7]);
  assert.deepEqual(sketchMoveDelta([10, 10], [5, 3]), [-5, -7]);
  assert.deepEqual(sketchMoveDelta([10, 10], [15, 3]), [5, -7]);
});

test('Move delta keeps zero axes and normalises negative zero', () => {
  assert.deepEqual(sketchMoveDelta([10, 10], [10, 14]), [0, 4]);
  assert.deepEqual(sketchMoveDelta([10, 10], [14, 10]), [4, 0]);
  assert.deepEqual(sketchMoveDelta([10, 10], [10, 10]), [0, 0]);
  const delta = sketchMoveDelta([0, 0], [-0, -0]);
  assert.equal(Object.is(delta[0], 0), true);
  assert.equal(Object.is(delta[1], 0), true);
});

test('Move delta subtracts without display rounding and leaves inputs untouched', () => {
  const start = [0.1, 0.2],
    end = [0.3, 0.4];
  assert.deepEqual(sketchMoveDelta(start, end), [0.3 - 0.1, 0.4 - 0.2]);
  assert.deepEqual(sketchMoveDelta([0, 0], [1.2345678901234567, -1.2345678901234567]), [
    1.2345678901234567, -1.2345678901234567,
  ]);
  assert.deepEqual(start, [0.1, 0.2]);
  assert.deepEqual(end, [0.3, 0.4]);
});

test('Move delta rejects invalid or non-finite coordinates and non-finite results', () => {
  const valid = [0, 0];
  for (const bad of [
    undefined,
    null,
    [],
    [0],
    [0, 0, 0],
    ['0', '0'],
    '0,0',
    { x: 0, y: 0 },
    [NaN, 0],
    [Infinity, 0],
    [-Infinity, 0],
    [0, NaN],
    [0, Infinity],
  ]) {
    assert.throws(() => sketchMoveDelta(bad, valid));
    assert.throws(() => sketchMoveDelta(valid, bad));
  }
  assert.throws(() => sketchMoveDelta([-Number.MAX_VALUE, 0], [Number.MAX_VALUE, 0]));
  assert.throws(() => sketchMoveDelta([0, -Number.MAX_VALUE], [0, Number.MAX_VALUE]));
});
