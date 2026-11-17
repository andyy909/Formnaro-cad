import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runNodeTest } from './node-test-file.mjs';
import { discoverTests } from './test-discovery.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (file) => readFileSync(root + file, 'utf8');
const manifestFile = 'tests/manifest.json';
const args = process.argv.slice(2);
if (args.length && (args.length !== 1 || args[0] !== '--run')) {
  console.error('Usage: node scripts/test-inventory.mjs [--run]');
  process.exit(2);
}

const previous = existsSync(root + manifestFile) ? JSON.parse(read(manifestFile)) : [];
const previousByFile = new Map(previous.map((entry) => [entry.file, entry]));
const discovered = discoverTests(root);
const present = new Set(discovered.map(({ file }) => file));
const entries = discovered.map((entry) => {
  entry.referencedBy.sort();
  const old = previousByFile.get(entry.file);
  return old?.kind === entry.kind ? { ...old, ...entry } : entry;
});
// Retain explicit tombstones for removed legacy tests; never run missing files.
entries.push(...previous.filter((entry) => entry.status === 'obsolete' && !present.has(entry.file)));
entries.sort((a, b) => a.file.localeCompare(b.file));

if (args[0] === '--run') {
  const nodeTests = entries.filter(({ kind, status }) => kind === 'node' && status !== 'obsolete');
  const counts = { pass: 0, fail: 0, timeout: 0 };
  for (const [index, entry] of nodeTests.entries()) {
    console.log(`[${index + 1}/${nodeTests.length}] Running ${entry.file}`);
    const result = await runNodeTest(entry.file, root);
    if (entry.status !== result.status) delete entry.note;
    Object.assign(entry, result);
    counts[result.status]++;
    console.log(`${result.status.toUpperCase()} ${entry.file} (${result.seconds}s)`);
  }
  console.log(`Node files: ${counts.pass} pass, ${counts.fail} fail, ${counts.timeout} timeout.`);
  console.log('Ten slowest files:');
  for (const entry of [...nodeTests].sort((a, b) => b.seconds - a.seconds).slice(0, 10)) {
    console.log(`  ${entry.seconds}s ${entry.file} (${entry.status})`);
  }
}

const rows = entries.map((entry) => '  ' + JSON.stringify(entry));
const pendingManifest = root + manifestFile + '.' + process.pid + '.tmp';
try {
  writeFileSync(pendingManifest, '[\n' + rows.join(',\n') + '\n]\n', { flag: 'wx' });
  renameSync(pendingManifest, root + manifestFile);
} finally {
  rmSync(pendingManifest, { force: true });
}
console.log(`Inventoried ${rows.length} test files in ${manifestFile}.`);
