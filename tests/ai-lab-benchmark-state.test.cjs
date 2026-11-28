const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createBenchmarks, verifySuite } = require('../backend/ai-lab-benchmark.cjs');

test('Calibration mismatch leaves lab state and historical benchmark results readable', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'formnaro-benchmark-state-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const [firstDependency] = require('../ai/benchmark-core-v1.json').dependencies;
  const pinnedSource = path.resolve(__dirname, '..', firstDependency.path);
  const read = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', (file, ...args) => {
    const content = read(file, ...args);
    return file === pinnedSource ? Buffer.concat([content, Buffer.from('\n// modified')]) : content;
  });

  const id = '12345678-1234-1234-1234-123456789abc';
  fs.writeFileSync(path.join(directory, 'Benchmark-' + id + '.json'), JSON.stringify({
    id, createdAt: '2026-01-01T00:00:00Z', plan: { name: 'Earlier run' },
    suite: { suiteId: 'formnaro-practice-core', suiteVersion: '1.0.0', suiteHash: 'earlier', cases: [] },
    rows: [],
  }));
  const benchmarks = createBenchmarks({ directory, getRecords: () => [], getRoles: () => ({}) });
  const state = benchmarks.state();

  assert.equal(state.busy, false);
  assert.equal(state.suites.length, 3);
  assert.equal(state.suite.available, false);
  assert.equal(state.suite.cases.length, 8);
  assert.ok(state.suite.reason.includes(firstDependency.path));
  assert.match(state.suite.reason, /erneut kalibrieren/);
  assert.equal(state.runs[0].name, 'Earlier run');
  assert.throws(() => verifySuite(), /erneut kalibrieren/);
  assert.throws(() => benchmarks.preview(), /erneut kalibrieren/);
  await assert.rejects(benchmarks.start(), /erneut kalibrieren/);
});
