import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runNodeTest } from './node-test-file.mjs';

const args = process.argv.slice(2);
if (args.length && (args.length !== 1 || args[0] !== '--include-failing')) {
  console.error('Usage: node scripts/run-tests.mjs [--include-failing]');
  process.exit(2);
}

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(root + 'tests/manifest.json', 'utf8'));
const statuses = new Set(args.length ? ['pass', 'fail', 'timeout'] : ['pass']);
const tests = manifest.filter(({ kind, status }) => kind === 'node' && statuses.has(status));
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
for (const [index, { file }] of tests.entries()) {
  console.log(`[${index + 1}/${tests.length}] Running ${file}`);
  const { status, seconds } = await runNodeTest(file, root);
  counts[status]++;
  console.log(`${status.toUpperCase()} ${file} (${seconds}s)`);
}

console.log(`Node files: ${counts.pass}/${tests.length} pass, ${counts.fail} fail, ${counts.timeout} timeout.`);
if (counts.fail || counts.timeout) process.exitCode = 1;
