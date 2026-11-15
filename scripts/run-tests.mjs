import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runNodeTest } from './node-test-file.mjs';
import { selectNodeTests } from './select-node-tests.mjs';

const args = new Set(process.argv.slice(2));
const includeFailing = args.delete('--include-failing');
const balanceByDuration = args.delete('--balance-by-duration');
const list = args.delete('--list');
const shardOption = [...args].find((arg) => arg.startsWith('--shard='));
if (shardOption) args.delete(shardOption);
const shardMatch = /^--shard=([1-9]\d*)\/([1-9]\d*)$/.exec(shardOption ?? '--shard=1/1');
const shard = Number(shardMatch?.[1]);
const shardCount = Number(shardMatch?.[2]);
if (args.size || !Number.isSafeInteger(shard) || !Number.isSafeInteger(shardCount) || shard > shardCount) {
  console.error('Usage: node scripts/run-tests.mjs [--include-failing] [--shard=<index>/<count>] [--balance-by-duration] [--list]');
  process.exit(2);
}

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(root + 'tests/manifest.json', 'utf8'));
const { tests, selectedCount, estimatedSeconds } = selectNodeTests(manifest, {
  platform: process.platform, includeFailing, shard, shardCount, balanceByDuration,
});
if (!tests.length) {
  console.error('No measured Node test files selected by tests/manifest.json.');
  process.exit(1);
}
if (list) {
  for (const { file } of tests) console.log(file);
} else {
  const counts = { pass: 0, fail: 0, timeout: 0 };
  const heading = `Shard ${shard}/${shardCount}: ${tests.length} of ${selectedCount} selected files.`;
  if (shardCount > 1) console.log(heading);
  if (balanceByDuration) console.log(`Estimated test time: ${estimatedSeconds}s.`);
  for (const [index, { file }] of tests.entries()) {
    console.log(`[${index + 1}/${tests.length}] Running ${file}`);
    const { status, seconds } = await runNodeTest(file, root);
    counts[status]++;
    console.log(`${status.toUpperCase()} ${file} (${seconds}s)`);
  }

  const result = `Node files: ${counts.pass}/${tests.length} pass, ${counts.fail} fail, ${counts.timeout} timeout.`;
  console.log(result);
  if (balanceByDuration && process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Node tests\n\n${heading} ${result}\n`);
  }
  if (counts.fail || counts.timeout) process.exitCode = 1;
}
