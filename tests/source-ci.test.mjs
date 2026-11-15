import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { selectNodeTests } from '../scripts/select-node-tests.mjs';
import { findPullRequestRun } from '../scripts/source-ci-trigger.mjs';

const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'));
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
