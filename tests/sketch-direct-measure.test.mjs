import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSketchDirectMeasure } from '../src/sketch-direct-measure.js';

test('a plain number is the exact target value with sign, dot or comma', () => {
  assert.equal(parseSketchDirectMeasure(12), 12);
  assert.equal(parseSketchDirectMeasure(-2.5), -2.5);
  assert.equal(parseSketchDirectMeasure('12'), 12);
  assert.equal(parseSketchDirectMeasure('1,5'), 1.5);
  assert.equal(parseSketchDirectMeasure('1.5'), 1.5);
  assert.equal(parseSketchDirectMeasure(' -2,5 '), -2.5);
  assert.equal(parseSketchDirectMeasure('−2,5'), -2.5);
  assert.equal(parseSketchDirectMeasure('.5'), 0.5);
});

test('a leading * / or + uses the current value', () => {
  assert.equal(parseSketchDirectMeasure('/2', 24), 12);
  assert.equal(parseSketchDirectMeasure('*1,5', 40), 60);
  assert.equal(parseSketchDirectMeasure('* 2', 3), 6);
  assert.equal(parseSketchDirectMeasure('+5', 10), 15);
  assert.equal(parseSketchDirectMeasure('-2,5', 10), -2.5);
  assert.equal(parseSketchDirectMeasure('*2', 1e-7), 2e-7);
  assert.equal(parseSketchDirectMeasure('/10', 1e21), 1e20);
});

test('basic arithmetic keeps point before dash and supports a leading sign', () => {
  assert.equal(parseSketchDirectMeasure('20-2'), 18);
  assert.equal(parseSketchDirectMeasure('2+3*4'), 14);
  assert.equal(parseSketchDirectMeasure('20-2*3'), 14);
  assert.equal(parseSketchDirectMeasure('10/2+3'), 8);
  assert.equal(parseSketchDirectMeasure('-2,5*2'), -5);
  assert.equal(parseSketchDirectMeasure('-2+5'), 3);
  assert.equal(parseSketchDirectMeasure('2*-3'), -6);
  assert.equal(parseSketchDirectMeasure('10/4'), 2.5);
  assert.equal(parseSketchDirectMeasure('/2*3+1', 10), 16);
});

test('invalid, non-finite and dividing by zero inputs are rejected', () => {
  for (const input of ['', '   ', 'abc', '2x', '2+', '1/0', '1..2', '1,2,3', '2 3', '(2)', '1e3', '2//3'])
    assert.throws(() => parseSketchDirectMeasure(input, 10), undefined, `accepted ${input}`);
  assert.throws(() => parseSketchDirectMeasure('*2'));
  assert.throws(() => parseSketchDirectMeasure(Infinity));
  assert.throws(() => parseSketchDirectMeasure(NaN));
  assert.throws(() => parseSketchDirectMeasure(null));
});
