const test = require('node:test'), assert = require('node:assert/strict');
const { wilson, compareRates, perSuccess } = require('../backend/ai-lab-stats.cjs');
const round3 = (value) => Math.round(value * 1000) / 1000;

test('Wilson interval matches the documented 95 % cases', () => {
  for (const [passed, total, low, high] of [[0, 16, 0.000, 0.194], [16, 16, 0.806, 1.000], [14, 16, 0.640, 0.965], [5, 16, 0.142, 0.556], [227, 256, 0.842, 0.920]]) {
    const interval = wilson(passed, total);
    assert.equal(round3(interval.low), low, `${passed}/${total} low`);
    assert.equal(round3(interval.high), high, `${passed}/${total} high`);
  }
});

test('Wilson interval keeps raw precision and clamps its endpoints to [0, 1]', () => {
  const interval = wilson(0, 16);
  assert.ok(interval.high > 0.193 && interval.high < 0.194, 'raw high must not be rounded to display precision');
  const wide = wilson(1, 2, 1000);
  assert.ok(wide.low >= 0 && wide.high <= 1, 'endpoints stay inside [0, 1]');
});

test('Wilson interval validates inputs and returns null for 0/0', () => {
  assert.equal(wilson(0, 0), null);
  for (const args of [[-1, 5], [1.5, 5], [5, 4], [5, -1], [0, 5, 0], [0, 5, -1], [0, 5, Number.NaN], [0, 5, Number.POSITIVE_INFINITY]]) {
    assert.throws(() => wilson(...args), /RangeError|ganze|überschreiten|positive/, String(args));
  }
});

test('compareRates keeps the three original cases and separates disjoint intervals', () => {
  assert.equal(compareRates({ passed: 9, total: 10 }, { passed: 1, total: 10 }).relation, 'first-higher');
  assert.equal(compareRates({ passed: 1, total: 10 }, { passed: 9, total: 10 }).relation, 'second-higher');
  assert.equal(compareRates({ passed: 5, total: 10 }, { passed: 5, total: 10 }).relation, 'not-distinguishable');
});

test('touching interval boundaries count as not distinguishable', () => {
  const result = compareRates({ low: 0, high: 0.5 }, { low: 0.5, high: 1 });
  assert.equal(result.applicable, true);
  assert.equal(result.separated, false);
  assert.equal(result.relation, 'not-distinguishable');
  assert.match(result.statement, /nicht unterscheidbar/);
});

test('the interval heuristic is not an equality proof and not for paired language trials', () => {
  const equalLooking = compareRates({ passed: 5, total: 10 }, { passed: 5, total: 10 });
  assert.match(equalLooking.caveat, /kein Signifikanztest/);
  assert.match(equalLooking.caveat, /nicht für gepaarte/);
  const paired = compareRates({ passed: 5, total: 10 }, { passed: 5, total: 10 }, { paired: true });
  assert.equal(paired.applicable, false);
  assert.equal(paired.relation, 'not-applicable');
  assert.match(paired.statement, /gepaarte/);
  const empty = compareRates({ passed: 0, total: 0 }, { passed: 5, total: 10 });
  assert.equal(empty.applicable, false);
  assert.match(empty.statement, /0\/0/);
});

test('perSuccess divides costs and average runtime by confirmed successes', () => {
  assert.deepEqual(perSuccess({ passed: 2, costMin: 4, costMax: 8, priceUnknown: false, totalMs: 6000 }), {
    costMin: 2,
    costMax: 4,
    priceUnknown: false,
    seconds: 3,
  });
});

test('perSuccess returns null when no attempt passed', () => {
  assert.equal(perSuccess({ passed: 0, costMin: 4, costMax: 8, priceUnknown: false, totalMs: 6000 }), null);
});

test('perSuccess carries an unknown price unchanged instead of computing it as zero', () => {
  const result = perSuccess({ passed: 1, costMin: 2, costMax: 3, priceUnknown: true, totalMs: 1000 });
  assert.equal(result.priceUnknown, true);
  assert.equal(result.costMin, 2);
  assert.equal(result.costMax, 3);
  assert.equal(result.seconds, 1);
});
