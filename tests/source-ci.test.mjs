import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { selectNodeTests } from '../scripts/select-node-tests.mjs';
import { findPullRequestRun } from '../scripts/source-ci-trigger.mjs';

const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'));
const durationProfile = JSON.parse(readFileSync(new URL('../scripts/ci-test-durations.json', import.meta.url), 'utf8'));
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

const repository = 'example/cad';
const branch = 'plan/next';
const sha = 'current';
const repo = { full_name: repository };
const pull = { number: 12, head: { repo, ref: branch, sha } };
const run = {
  id: 34, event: 'pull_request', head_branch: branch, head_sha: sha,
  head_repository: repo, pull_requests: [{ number: pull.number }], status: 'queued',
};
const queryRun = (get) => findPullRequestRun(get, { repository, branch, sha, pause: async () => {} });

test('only an actual workflow run for the matching PR and head suppresses a branch push', async () => {
  let lookups = 0;
  assert.equal(await queryRun(async (path) => {
    if (path.startsWith('pulls?')) {
      assert.match(path, /state=open&head=example%3Aplan%2Fnext/);
      return [pull];
    }
    assert.match(path, /event=pull_request&branch=plan%2Fnext&head_sha=current/);
    return { workflow_runs: ++lookups === 2 ? [run] : [] };
  }), run.id);
  assert.equal(lookups, 2);
});

test('branch pushes keep all tests when the PR or its matching workflow run is absent', async () => {
  assert.equal(await queryRun(async () => []), undefined);
  assert.equal(await queryRun(async (path) => path.startsWith('pulls?') ? [
    { ...pull, head: { ...pull.head, sha: 'old' } },
    { ...pull, head: { ...pull.head, repo: { full_name: 'fork/cad' } } },
  ] : assert.fail('No run lookup for unrelated PRs')), undefined);
  assert.equal(await queryRun(async (path) => path.startsWith('pulls?') ? [pull] : { workflow_runs: [
    { ...run, head_sha: 'old' },
    { ...run, head_branch: 'plan/other' },
    { ...run, pull_requests: [{ number: 25 }] },
    { ...run, status: 'completed', conclusion: 'cancelled' },
  ] }), undefined);
});
