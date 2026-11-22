import assert from 'node:assert/strict';
import test from 'node:test';
import { cadFinishAmountOperation } from '../src/cad-finish-command.js';

test('editFinish changes only the step matching the stable ID', () => {
  const edge = { origin: { rootId: 'plate', path: ['original'] } };
  const steps = [
    { id: 'round-one', kind: 'round', amount: 3, edges: [edge] },
    { id: 'round-two', kind: 'round', amount: 3, edges: [edge] },
    { id: 'chamfer-end', kind: 'chamfer', amount: 1, edges: [edge] },
  ];
  const plate = { id: 'plate', kind: 'cad', finish: { steps } };
  const original = structuredClone(plate);

  const operation = cadFinishAmountOperation(plate, 'round-one', 4);
  const expectedSteps = structuredClone(original.finish.steps);
  expectedSteps[0].amount = 4;
  assert.deepEqual(operation, { kind: 'editFinish', target: 'plate', steps: expectedSteps });
  assert.deepEqual(plate, original);

  operation.steps[0].edges[0].origin.path.push('changed');
  assert.deepEqual(plate, original);

  assert.throws(() => cadFinishAmountOperation(plate, 'missing', 4), /Kantenschritt fehlt/);
  for (const amount of [0, 0.001, Number.NaN, Infinity, 1001, '4'])
    assert.throws(() => cadFinishAmountOperation(plate, 'round-one', amount), /0,01–1000 mm/);
});
