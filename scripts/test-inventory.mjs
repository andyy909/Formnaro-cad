import { existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runNodeTest } from './node-test-file.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (file) => readFileSync(root + file, 'utf8');
const manifestFile = 'tests/manifest.json';
const args = process.argv.slice(2);
if (args.length && (args.length !== 1 || args[0] !== '--run')) {
  console.error('Usage: node scripts/test-inventory.mjs [--run]');
  process.exit(2);
}

function listFiles(directory) {
  return readdirSync(root + directory, { withFileTypes: true }).flatMap((entry) => {
    const file = directory + '/' + entry.name;
    if (entry.isDirectory()) return listFiles(file);
    return entry.isFile() ? [file] : [];
  }).sort();
}

const tests = listFiles('tests').filter((file) => basename(file).includes('.test.'));
const testsByFile = new Map();
const testsByName = new Map();
for (const file of tests) {
  const kind = file.endsWith('.py') ? 'python' : 'node';
  const entry = { file, referencedBy: [], kind };
  testsByFile.set(file, entry);
  const name = basename(file);
  testsByName.set(name, testsByName.has(name) ? null : entry);
  if (/\brequire\s*\(\s*['"]electron['"]\s*\)|\bfrom\s*['"]electron['"]/.test(read(file))) {
    if (kind === 'node') entry.kind = 'electron';
  }
}

const npmScripts = JSON.parse(read('package.json')).scripts;
const sources = [
  ...Object.entries(npmScripts).map(([name, command]) => [name === 'test' ? 'npm test' : name, command]),
  ['ci', read('.github/workflows/build.yml')],
  ...listFiles('scripts').map((file) => [file, read(file)]),
];

// Count explicit references, including bare names in script arrays. Dynamic
// discovery by an existing harness does not imply a literal file reference.
const testReference = /(?<![\w./-])(?:[\w.-]+\/)*[\w.-]+\.test\.[\w]+(?![\w.-])/g;
const electronCommand = /(?:^|[\s'"\x60/])electron(?:\.exe)?[ \t]+(?:--[\w=-]+[ \t]+)*['"]?$/i;
for (const [label, source] of sources) {
  for (const line of source.replaceAll('\\', '/').split(/\r?\n/)) {
    for (const match of line.matchAll(testReference)) {
      const file = match[0].replace(/^(?:\.\.?\/)+/, '');
      const entry = testsByFile.get(file) ?? testsByName.get(file);
      if (!entry) continue;
      if (!entry.referencedBy.includes(label)) entry.referencedBy.push(label);
      if (entry.kind === 'node' && electronCommand.test(line.slice(0, match.index))) {
        entry.kind = 'electron';
      }
    }
  }
}

const previous = existsSync(root + manifestFile) ? JSON.parse(read(manifestFile)) : [];
const previousByFile = new Map(previous.map((entry) => [entry.file, entry]));
const entries = [...testsByFile.values()].map((entry) => {
  entry.referencedBy.sort();
  const old = previousByFile.get(entry.file);
  return old?.kind === entry.kind ? { ...old, ...entry } : entry;
});

if (args[0] === '--run') {
  const nodeTests = entries.filter(({ kind }) => kind === 'node');
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
