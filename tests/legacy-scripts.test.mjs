import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const read = (file) => readFileSync(new URL(file, root));
const report = JSON.parse(read('docs/LEGACY-SKRIPTE.json'));

test('archived scripts retain exact bytes and no npm command uses a removed path', () => {
  const { scripts } = JSON.parse(read('package.json'));
  assert.equal(report.moved.length + report.kept.length, report.candidateCount);
  for (const { from, to, sha256 } of report.moved) {
    assert.equal(existsSync(new URL(from, root)), false, from);
    assert.equal(createHash('sha256').update(read(to)).digest('hex'), sha256, to);
    for (const [name, command] of Object.entries(scripts)) assert.ok(!command.includes(from), name + ': ' + from);
  }
  for (const { file } of report.kept) assert.ok(existsSync(new URL(file, root)), file);
});

test('retained test commands resolve their literal repository entry files', () => {
  const { scripts } = JSON.parse(read('package.json'));
  for (const [name, command] of Object.entries(scripts).filter(([name]) => name.startsWith('test:'))) {
    for (const [file] of command.matchAll(/(?:scripts|tests)\/[\w./-]+\.(?:[cm]?js|py)/g)) {
      assert.ok(existsSync(new URL(file, root)), name + ': ' + file);
    }
  }
});
