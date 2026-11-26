import assert from 'node:assert/strict';
import test from 'node:test';
import { createSketchHistory } from '../src/sketch-interaction.js';

test('a drag and both axis corrections share one history entry', () => {
  const origin = { x: 20, y: 15 };
  const history = createSketchHistory(origin);
  const gesture = Symbol('move');
  history.record({ x: 32.5, y: 11 }, gesture);
  history.record({ x: 30, y: 11 }, gesture);
  history.record({ x: 30, y: 15 }, gesture);
  assert.deepEqual(history.state(), { undo: 1, redo: 0 });
  assert.deepEqual(history.undo(), origin);
  assert.deepEqual(history.redo(), { x: 30, y: 15 });
});

test('correcting a drag back to the starting point removes the history entry', () => {
  const origin = { x: 20, y: 15 };
  const history = createSketchHistory(origin);
  const gesture = Symbol('move');
  history.record({ x: 30, y: 15 }, gesture);
  history.record(origin, gesture);
  assert.deepEqual(history.state(), { undo: 0, redo: 0 });
  history.record({ x: 24, y: 15 }, gesture);
  assert.deepEqual(history.undo(), origin);
});
