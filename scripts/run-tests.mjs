import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runNodeTest } from './node-test-file.mjs';

const args = new Set(process.argv.slice(2));
const includeFailing = args.delete('--include-failing');
const shardOption = [...args].find((arg) => arg.startsWith('--shard='));
if (shardOption) args.delete(shardOption);
const shardMatch = /^--shard=([1-9]\d*)\/([1-9]\d*)$/.exec(shardOption ?? '--shard=1/1');
const shard = Number(shardMatch?.[1]);
const shardCount = Number(shardMatch?.[2]);
if (args.size || !Number.isSafeInteger(shard) || !Number.isSafeInteger(shardCount) || shard > shardCount) {
  console.error('Usage: node scripts/run-tests.mjs [--include-failing] [--shard=<index>/<count>]');
  process.exit(2);
}

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(root + 'tests/manifest.json', 'utf8'));
const statuses = new Set(includeFailing ? ['pass', 'fail', 'timeout'] : ['pass']);
const selected = manifest.filter(({ kind, status, os }) =>
  kind === 'node' && statuses.has(status) && (os !== 'windows' || process.platform === 'win32'),
);
const tests = selected.filter((_, index) => index % shardCount === shard - 1);
if (!tests.length) {
  console.error('No measured Node test files selected by tests/manifest.json.');
  process.exit(1);
}
for (const { file } of tests) {
  if (typeof file !== 'string' || !file.startsWith('tests/') || file.includes('\\')
      || posix.normalize(file) !== file || !/\.test\.[cm]?js$/.test(file)) {
    throw new Error(`Invalid Node test path in tests/manifest.json: ${JSON.stringify(file)}`);
  }
}

const counts = { pass: 0, fail: 0, timeout: 0 };
if (shardCount > 1) console.log(`Shard ${shard}/${shardCount}: ${tests.length} of ${selected.length} selected files.`);
for (const [index, { file }] of tests.entries()) {
  console.log(`[${index + 1}/${tests.length}] Running ${file}`);
  const { status, seconds } = await runNodeTest(file, root);
  counts[status]++;
  console.log(`${status.toUpperCase()} ${file} (${seconds}s)`);
}

console.log(`Node files: ${counts.pass}/${tests.length} pass, ${counts.fail} fail, ${counts.timeout} timeout.`);
if (counts.fail || counts.timeout) process.exitCode = 1;
