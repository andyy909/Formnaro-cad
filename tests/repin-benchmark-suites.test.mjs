import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectSuites, repinSuites } from '../scripts/repin-benchmark-suites.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUITES = ['ai/benchmark-core-v1.json', 'ai/benchmark-advanced-v2.json', 'ai/benchmark-guided-v1.json'];
const VERSION_TEST = 'tests/ai-advanced-benchmark.test.cjs';
const read = (root, file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

// Kopie nur der Suiten, ihrer gepinnten Dateien und des Versionstests.
function sandbox(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'formnaro-repin-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = new Set([...SUITES, VERSION_TEST]);
  for (const suite of SUITES) {
    const data = read(repo, suite);
    for (const d of data.dependencies) files.add(d.path);
  }
  for (const file of files) { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.copyFileSync(path.join(repo, file), path.join(root, file)); }
  return root;
}

test('Unveränderter Stand: nichts zu tun, keine Datei wird angefasst', t => {
  const root = sandbox(t), before = SUITES.map(f => fs.readFileSync(path.join(root, f), 'utf8'));
  assert(inspectSuites(root).every(s => !s.changed.length));
  assert(repinSuites(root, 'No pinned file changed.').every(r => !r.changed.length));
  assert.deepEqual(SUITES.map(f => fs.readFileSync(path.join(root, f), 'utf8')), before);
});

test('Geänderte gepinnte Datei: Hash, Patch-Version, Begründung und Versionstest werden angepasst', t => {
  const root = sandbox(t), oldSuites = SUITES.map(file => read(root, file));
  fs.appendFileSync(path.join(root, 'backend/ai-diagnostics.cjs'), '\n// changed');
  const open = inspectSuites(root);
  assert.deepEqual(open.map(s => s.changed.map(c => c.path)), SUITES.map(() => ['backend/ai-diagnostics.cjs']));

  const reason = 'Record truncated response text for replay. Tasks and native predicates unchanged.';
  repinSuites(root, reason);
  const currentSuites = SUITES.map(file => read(root, file));
  const patch = v => Number(v.split('.')[2]);
  for (const [index, before] of oldSuites.entries()) {
    const after = currentSuites[index];
    assert.equal(patch(after.version), patch(before.version) + 1);
    assert.equal(after.revisionReason, reason);
    assert.deepEqual(after.cases, before.cases);
    assert.deepEqual(after.limits, before.limits);
    assert.deepEqual(after.calibration, before.calibration);
  }
  assert(inspectSuites(root).every(s => !s.changed.length), 'Nach dem Neu-Binden stimmen alle Hashes');

  const versionTest = fs.readFileSync(path.join(root, VERSION_TEST), 'utf8');
  for (const [index, before] of oldSuites.slice(0, 2).entries()) {
    assert(versionTest.includes("'" + currentSuites[index].version + "'") && !versionTest.includes("'" + before.version + "'"));
  }
  assert(fs.readFileSync(path.join(root, SUITES[0]), 'utf8').endsWith('}\n'), 'Dateiformat wie bisher');
});

test('Eine gemeinsame Datei ändert nur die Version ihrer beiden Suiten', t => {
  const root = sandbox(t), [core, advanced, guided] = SUITES.map(file => read(root, file));
  fs.appendFileSync(path.join(root, 'backend/ai-test-lab-plan.cjs'), '\n// changed');
  repinSuites(root, 'Plan validation accepts one more field. Tasks unchanged.');
  assert.equal(read(root, SUITES[0]).version, core.version);
  assert.notEqual(read(root, SUITES[1]).version, advanced.version);
  assert.notEqual(read(root, SUITES[2]).version, guided.version);
});

test('Ohne Begründung wird nichts geschrieben', t => {
  const root = sandbox(t);
  fs.appendFileSync(path.join(root, 'backend/ai-diagnostics.cjs'), '\n// changed');
  const before = fs.readFileSync(path.join(root, SUITES[0]), 'utf8');
  assert.throws(() => repinSuites(root, ''), /--reason/);
  assert.equal(fs.readFileSync(path.join(root, SUITES[0]), 'utf8'), before);
});
