import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, moduleReferences, resolveRelative } from '../scripts/module-graph.mjs';

test('graph follows real module paths, workers and re-exports without conflating Mini copies', () => {
  const sources = {
    'src/cad-main.js': `import './shared.js'; new Worker(new URL('./worker.js', import.meta.url));`,
    'src/main.js': `import './old.js'; import './shared.js';`,
    'src/shared.js': `export {value} from './leaf.js';`,
    'src/leaf.js': 'export const value = 1;',
    'src/old.js': `import('./lazy.js?worker');`,
    'src/lazy.js': '', 'src/worker.js': '',
    'mini/src/main.js': `import './old.js';`, 'mini/src/old.js': '',
    'mini-cad/src/main.js': `import '../../src/shared.js';`,
    'backend/start.cjs': `require('../src/worker.js');`,
    'tests/old.test.mjs': `readFileSync(new URL('../src/old.js', import.meta.url));`,
    'scripts/read.mjs': `readFileSync('src/lazy.js');`,
    'preload.cjs': `import('./src/shared.js');`,
    'electron.cjs': `import('./src/' + selected);`,
  };
  const graph = buildGraph(Object.keys(sources), (file) => sources[file]);
  assert.deepEqual(graph.summary, { modules: 7, current: 4, legacyOnly: 3 });
  const old = graph.modules.find(({ file }) => file === 'src/old.js');
  assert.ok(old.mentionedBy.includes('mini/src/main.js'));
  assert.ok(!old.consumers.some(({ file }) => file === 'mini/src/main.js'));
  assert.ok(old.consumers.some(({ file, kind }) => file === 'tests/old.test.mjs' && kind === 'url'));
  assert.ok(graph.modules.find(({ file }) => file === 'src/lazy.js').consumers.some(({ kind }) => kind === 'path-literal'));
  assert.equal(graph.unresolved.length, 0);
  assert.equal(graph.dynamic.length, 1);
  assert.equal(graph.dynamic[0].file, 'electron.cjs');
});

test('parser ignores comments, regexes and quoted fake imports; flags missing targets', () => {
  const source = `// import './fake.js';
    const text = "import './fake.js'"; const pattern = /import\('fake'\)/;
    export * from './real.js'; import(\`./lazy.js\`);`;
  assert.deepEqual(moduleReferences(source, 'src/main.js').references.map(({ specifier }) => specifier), ['./real.js', './lazy.js']);
  const graph = buildGraph(['src/main.js'], () => source);
  assert.deepEqual(graph.unresolved.map(({ target }) => target), ['src/real.js', 'src/lazy.js']);
  assert.equal(resolveRelative('mini/src/main.js', './old.js'), 'mini/src/old.js');
  assert.equal(resolveRelative('src/main.js', './worker.js?worker#x'), 'src/worker.js');
});

test('reachability crosses backend and ai intermediates; documentation mentions remain separate', () => {
  const sources = {
    'src/cad-main.js': `import '../backend/shared.mjs';`,
    'backend/shared.mjs': `export * from '../ai/bridge.mjs';`,
    'ai/bridge.mjs': `import '../src/kept.js';`,
    'src/main.js': `import './kept.js';`, 'src/kept.js': '',
    'mini/README.md': 'kept.js is a historical filename.',
  };
  const graph = buildGraph(Object.keys(sources), (file) => sources[file]);
  const kept = graph.modules.find(({ file }) => file === 'src/kept.js');
  assert.equal(kept.current, true);
  assert.equal(kept.legacyOnly, false);
  assert.deepEqual(kept.mentionedBy, ['ai/bridge.mjs', 'mini/README.md']);
  assert.deepEqual(graph.summary, { modules: 3, current: 2, legacyOnly: 1 });
});
