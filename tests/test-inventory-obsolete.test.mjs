import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('inventory preserves obsolete records and measures only existing tests', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'formnaro-inventory-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const directory of ['scripts', 'tests', '.github/workflows']) mkdirSync(join(root, directory), { recursive: true });
  for (const file of ['test-inventory.mjs', 'node-test-file.mjs', 'test-discovery.mjs']) copyFileSync(new URL('../scripts/' + file, import.meta.url), join(root, 'scripts', file));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: {} }));
  writeFileSync(join(root, '.github/workflows/build.yml'), '');
  writeFileSync(join(root, 'tests/current.test.mjs'), "import test from 'node:test';import {writeFileSync} from 'node:fs';test('current',()=>writeFileSync('executed','yes'));");
  const obsolete = { file: 'tests/deleted.test.mjs', referencedBy: [], kind: 'node', status: 'obsolete', note: 'removed feature' };
  writeFileSync(join(root, 'tests/manifest.json'), JSON.stringify([obsolete]));
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const output = execFileSync(process.execPath, ['scripts/test-inventory.mjs', '--run'], { cwd: root, env, encoding: 'utf8' });
  const manifest = JSON.parse(readFileSync(join(root, 'tests/manifest.json'), 'utf8'));
  assert.deepEqual(manifest.find(({ file }) => file === obsolete.file), obsolete);
  assert.equal(manifest.find(({ file }) => file === 'tests/current.test.mjs').status, 'pass');
  assert.match(output, /Node files: 1 pass, 0 fail, 0 timeout/);
  assert.equal(readFileSync(join(root, 'executed'), 'utf8'), 'yes');
  const before = readFileSync(join(root, 'tests/manifest.json'), 'utf8');
  execFileSync(process.execPath, ['scripts/test-inventory.mjs'], { cwd: root, env });
  assert.equal(readFileSync(join(root, 'tests/manifest.json'), 'utf8'), before);
});
