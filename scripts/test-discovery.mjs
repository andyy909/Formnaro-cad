import { readdirSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

function listFiles(root, directory) {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const file = directory + '/' + entry.name;
    if (entry.isDirectory()) return listFiles(root, file);
    return entry.isFile() ? [file] : [];
  }).sort();
}

function listTestPaths(root) {
  return listFiles(root, 'tests').filter((file) => basename(file).includes('.test.'));
}

export function discoverTests(root) {
  const read = (file) => readFileSync(resolve(root, file), 'utf8');
  const tests = listTestPaths(root);
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
    ...listFiles(root, 'scripts').map((file) => [file, read(file)]),
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

  return [...testsByFile.values()];
}
