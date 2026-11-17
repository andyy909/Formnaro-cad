import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { selectNodeTests } from '../scripts/select-node-tests.mjs';
import { discoverTests } from '../scripts/test-discovery.mjs';
import { planCoverage, validateInventory, verifyPaths } from '../scripts/test-coverage.mjs';

const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'));
const durationProfile = JSON.parse(readFileSync(new URL('./ci-test-durations.json', import.meta.url), 'utf8'));
const nodeTest = (name, options) => ({ file: `tests/${name}.test.mjs`, kind: 'node', status: 'pass', ...options });
const windowsShard = (entries, shard, extra) => selectNodeTests(entries, {
  platform: 'win32', shard, shardCount: 2, balanceByDuration: true, ...extra,
});
const files = ({ tests }) => tests.map(({ file }) => file);

test('the Windows shards contain every passing Node file exactly once', () => {
  const expected = manifest.filter(({ kind, status }) => kind === 'node' && status === 'pass').map(({ file }) => file);
  const first = windowsShard(manifest, 1);
  const second = windowsShard(manifest, 2);
  assert.deepEqual([...files(first), ...files(second)].sort(), expected.sort());
});

test('duration balancing uses measurements, includes new files and keeps platform/status filters', () => {
  const entries = [
    nodeTest('a', { seconds: 9, os: 'windows' }), nodeTest('b', { seconds: 6 }),
    nodeTest('c', { seconds: 3 }), nodeTest('d', { seconds: 2 }),
    nodeTest('new'), nodeTest('fail', { status: 'fail' }), nodeTest('timeout', { status: 'timeout' }),
    nodeTest('electron', { kind: 'electron' }),
  ];
  assert.deepEqual(files(windowsShard(entries, 1)), ['tests/a.test.mjs', 'tests/d.test.mjs']);
  assert.deepEqual(files(windowsShard(entries, 2)), ['tests/b.test.mjs', 'tests/c.test.mjs', 'tests/new.test.mjs']);
  assert.deepEqual(files(windowsShard(entries.toReversed(), 2)).sort(), files(windowsShard(entries, 2)).sort());
  const linux = { platform: 'linux', shard: 1, shardCount: 2 };
  assert.deepEqual(files(selectNodeTests(entries, linux)), ['tests/b.test.mjs', 'tests/d.test.mjs']);
  assert.deepEqual(files(selectNodeTests(entries, { ...linux, shardCount: 1, includeFailing: true })),
    ['tests/b.test.mjs', 'tests/c.test.mjs', 'tests/d.test.mjs', 'tests/new.test.mjs', 'tests/fail.test.mjs', 'tests/timeout.test.mjs']);
});

test('duplicate selected files are rejected before either shard can run', () => {
  for (const shard of [1, 2]) {
    assert.throws(() => windowsShard([nodeTest('a'), nodeTest('A')], shard), /Duplicate Node test path/);
  }
});

test('the CI duration profile preserves each platform selection and gives deterministic shards', () => {
  for (const platform of ['win32', 'linux']) {
    const options = { platform, shard: 1, shardCount: 1 };
    const expected = files(selectNodeTests(manifest, options));
    const newEntry = nodeTest('new-ci-test');
    const entries = [...manifest, newEntry];
    const assigned = [1, 2].map((shard) => {
      const ci = { ...options, shard, shardCount: 2, balanceByDuration: true, durationProfile };
      const actual = files(selectNodeTests(entries, ci));
      assert.deepEqual(files(selectNodeTests(entries.toReversed(), ci)).sort(), [...actual].sort());
      return actual;
    });
    assert.deepEqual(assigned.flat().sort(), [...expected, newEntry.file].sort());
  }
});

test('CI estimates use the operating system and account for work on the first Windows shard', () => {
  const entries = [nodeTest('a'), nodeTest('b'), nodeTest('new'), nodeTest('fallback', { seconds: 2 })];
  const profile = {
    platforms: ['win32', 'linux'],
    firstShardExtraMs: { win32: 10000 },
    files: { 'tests/a.test.mjs': [10000, 3000], 'tests/b.test.mjs': [3000, 10000] },
  };
  const windows = windowsShard(entries, 1, { durationProfile: profile });
  const linux = windowsShard(entries, 1, { platform: 'linux', durationProfile: profile });
  assert.deepEqual(files(windows), ['tests/b.test.mjs']);
  assert.equal(windows.estimatedSeconds, 3);
  assert.equal(windowsShard(entries, 2, { durationProfile: profile }).estimatedSeconds, 13);
  assert.deepEqual(files(linux), ['tests/b.test.mjs']);
  assert.equal(linux.estimatedSeconds, 10);
  assert.deepEqual(files(windowsShard(entries.slice(2), 1, { durationProfile: profile })), ['tests/new.test.mjs']);
  assert.deepEqual(files(windowsShard(entries.slice(2), 2, { durationProfile: profile })), ['tests/fallback.test.mjs']);
});

test('coverage discovers nested tests, ignores fixtures and respects platform and runtime rules', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'formnaro-coverage-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'tests', 'nested'), { recursive: true });
  mkdirSync(join(directory, '.github', 'workflows'), { recursive: true });
  mkdirSync(join(directory, 'scripts'));
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ scripts: {} }));
  writeFileSync(join(directory, '.github', 'workflows', 'build.yml'), '');
  for (const file of ['a.test.mjs', 'nested/windows.test.cjs', 'nested/manual.test.py', 'nested/fixture.mjs']) {
    writeFileSync(join(directory, 'tests', file), '');
  }
  const entries = [
    nodeTest('a'),
    { file: 'tests/nested/windows.test.cjs', kind: 'node', status: 'pass', os: 'windows' },
    { file: 'tests/nested/manual.test.py', kind: 'python' },
    nodeTest('obsolete', { status: 'obsolete', note: 'Replaced by a.test.mjs' }),
  ];
  const plan = planCoverage(discoverTests(directory), entries, { shardCount: 1 });
  assert.deepEqual(plan.groups.get('win32').shards, [['tests/a.test.mjs', 'tests/nested/windows.test.cjs']]);
  assert.deepEqual(plan.groups.get('linux').shards, [['tests/a.test.mjs']]);
  assert.deepEqual(plan.exclusions.map(({ file }) => file), ['tests/nested/manual.test.py', 'tests/obsolete.test.mjs']);
  assert.deepEqual(plan.windowsOnly, ['tests/nested/windows.test.cjs']);
});

test('coverage reports missing, duplicate, noncanonical and unclassified manifest paths', () => {
  const entries = [
    nodeTest('present', { status: undefined }),
    nodeTest('wrong-kind', { kind: 'electron', status: undefined }),
    nodeTest('PRESENT'),
    nodeTest('gone'),
    nodeTest('../external'),
    nodeTest('old', { status: 'obsolete' }),
  ];
  const discovered = ['present', 'new', 'wrong-kind'].map((name) => nodeTest(name));
  assert.throws(() => validateInventory(discovered, entries), (error) => {
    assert.match(error.message, /Test kind mismatch: tests\/wrong-kind\.test\.mjs is node, manifest declares electron/);
    assert.match(error.message, /Unclassified Node test: tests\/present\.test\.mjs/);
    assert.match(error.message, /Duplicate manifest path: tests\/PRESENT\.test\.mjs/);
    assert.match(error.message, /Manifest test file missing: tests\/gone\.test\.mjs/);
    assert.match(error.message, /Invalid test path: "tests\/\.\.\/external\.test\.mjs"/);
    assert.match(error.message, /Test exception lacks a reason: tests\/old\.test\.mjs/);
    assert.match(error.message, /Test missing from manifest: tests\/new\.test\.mjs/);
    return true;
  });
});

test('a group cannot pass with missing, duplicate or unexpected files even at the expected count', () => {
  const expected = ['a', 'b', 'c'];
  assert.doesNotThrow(() => verifyPaths(expected, ['c', 'a', 'b'], 'test group'));
  assert.throws(() => verifyPaths(expected, ['a', 'a', 'd'], 'test group'), {
    message: 'test group:\nduplicate a\nunexpected d\nmissing b\nmissing c',
  });
});
