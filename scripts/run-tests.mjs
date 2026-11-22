import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runNodeTest } from './node-test-file.mjs';
import { selectNodeTests } from './select-node-tests.mjs';
import { discoverTests } from './test-discovery.mjs';
import { planCoverage, verifyPaths } from './test-coverage.mjs';

const args = new Set(process.argv.slice(2));
const includeFailing = args.delete('--include-failing');
const useCiDurations = args.delete('--balance-by-duration=ci');
const balanceByDuration = args.delete('--balance-by-duration') || useCiDurations;
const list = args.delete('--list');
const coverage = args.delete('--verify-coverage');
const shardOption = [...args].find((arg) => arg.startsWith('--shard='));
if (shardOption) args.delete(shardOption);
const shardMatch = /^--shard=([1-9]\d*)\/([1-9]\d*)$/.exec(shardOption ?? '--shard=1/1');
const shard = Number(shardMatch?.[1]);
const shardCount = Number(shardMatch?.[2]);
if (args.size || !Number.isSafeInteger(shard) || !Number.isSafeInteger(shardCount) || shard > shardCount || (coverage && includeFailing)) {
  console.error('Usage: node scripts/run-tests.mjs [--include-failing] [--shard=<index>/<count>] [--balance-by-duration[=ci]] [--list] [--verify-coverage]');
  process.exit(2);
}

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(root + 'tests/manifest.json', 'utf8'));
const coverageOnly = coverage && !shardOption;
const coverageShardCount = coverageOnly ? 2 : shardCount;
const durationProfile = (useCiDurations || coverageOnly) && coverageShardCount > 1
  ? JSON.parse(readFileSync(new URL('../tests/ci-test-durations.json', import.meta.url), 'utf8'))
  : undefined;
let coveragePlan;
if (coverage) {
  coveragePlan = planCoverage(discoverTests(root), manifest, {
    shardCount: coverageShardCount, balanceByDuration: coverageOnly || balanceByDuration, durationProfile,
  });
  if (coverageOnly) {
    for (const { file, reason } of coveragePlan.exclusions) console.log(`Excluded from Node CI: ${file} (${reason})`);
    for (const file of coveragePlan.windowsOnly) console.log(`Windows only: ${file}`);
    for (const [platform, { expected, shards }] of coveragePlan.groups) {
      console.log(`${platform}: ${expected.length} expected files across ${shards.length} groups.`);
      for (const [index, files] of shards.entries()) {
        console.log(`  Group ${index + 1}: ${files.length} expected and selected. Execution pending.`);
      }
    }
    process.exit(0);
  }
  if (!coveragePlan.groups.has(process.platform)) throw new Error('Unsupported CI platform: ' + process.platform);
}

const { tests, selectedCount, estimatedSeconds } = selectNodeTests(manifest, {
  platform: process.platform, includeFailing, shard, shardCount, balanceByDuration, durationProfile,
});
if (!tests.length) {
  console.error('No measured Node test files selected by tests/manifest.json.');
  process.exit(1);
}
const selected = tests.map(({ file }) => file);
const expected = coveragePlan?.groups.get(process.platform).shards[shard - 1];
const label = `${process.platform} group ${shard}/${shardCount}`;
if (expected) verifyPaths(expected, selected, label + ' selection');

if (list) {
  for (const { file } of tests) console.log(file);
} else {
  const passed = [];
  const counts = { pass: 0, fail: 0, timeout: 0 };
  const heading = `Shard ${shard}/${shardCount}: ${tests.length} of ${selectedCount} selected files.`;
  if (shardCount > 1) console.log(heading);
  if (balanceByDuration) console.log(`Estimated test time: ${estimatedSeconds}s.`);
  for (const [index, { file }] of tests.entries()) {
    console.log(`[${index + 1}/${tests.length}] Running ${file}`);
    const { status, seconds } = await runNodeTest(file, root);
    counts[status]++;
    if (status === 'pass') passed.push(file);
    console.log(`${status.toUpperCase()} ${file} (${seconds}s)`);
  }

  const result = `Node files: ${counts.pass}/${tests.length} pass, ${counts.fail} fail, ${counts.timeout} timeout.`;
  console.log(result);
  if (balanceByDuration && process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Node tests\n\n${heading} ${result}\n`);
  }
  if (expected) {
    const summary = `${label}: ${expected.length} expected, ${selected.length} selected, ${passed.length} passed.`;
    console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
    verifyPaths(expected, passed, label + ' successful files');
  }
  if (counts.fail || counts.timeout) process.exitCode = 1;
}
