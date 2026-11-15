const { Module, registerHooks } = require('node:module');
const { join } = require('node:path');
const { performance: hostPerformance } = require('node:perf_hooks');
const { pathToFileURL } = require('node:url');

const diagnosticPath = require.resolve('../../backend/ai-diagnostic-child.cjs');
const diagnosticUrl = pathToFileURL(diagnosticPath).href;

function loadDiagnosticChild(spawn, performance) {
  const dependencies = [
    ['node:child_process', { spawn }],
    ['node:fs', { mkdirSync() {} }],
    ['node:perf_hooks', { performance }]
  ];
  const files = [diagnosticPath];
  const modules = new Map(dependencies.map(([specifier, exports], index) => {
    const file = join(__dirname, `.diagnostic-test-module-${index}.cjs`);
    const stub = new Module(file);
    stub.exports = exports;
    stub.loaded = true;
    files.push(file);
    return [specifier, { file, url: pathToFileURL(file).href, stub }];
  }));
  const cached = files.map(file => [file, require.cache[file]]);
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      const mock = context.parentURL === diagnosticUrl && modules.get(specifier);
      if (mock) return { url: mock.url, format: 'commonjs', shortCircuit: true };
      return nextResolve(specifier, context);
    }
  });
  try {
    delete require.cache[diagnosticPath];
    for (const { file, stub } of modules.values()) require.cache[file] = stub;
    return require(diagnosticPath);
  } finally {
    hooks.deregister();
    for (const [file, previous] of cached) {
      if (previous) require.cache[file] = previous;
      else delete require.cache[file];
    }
  }
}

function openDiagnosticFixture(t, {
  spawn, executable = process.execPath, directory = 'unused',
  performance = hostPerformance, clock, normal = 200, grace = 800, forced = 200
}) {
  const { openDiagnosticChild } = loadDiagnosticChild(spawn, performance);
  if (clock) t.mock.method(Date, 'now', () => clock.now());
  const hostSetTimeout = globalThis.setTimeout;
  const delays = [];
  t.mock.method(globalThis, 'setTimeout', (callback, ms, ...args) => {
    const shortened = ms === 30000 ? normal : ms === 5000 ? forced : ms > 30000 && ms <= 120000 ? grace : undefined;
    if (shortened !== undefined) delays.push(ms);
    return hostSetTimeout(callback, shortened ?? ms, ...args);
  });
  const control = openDiagnosticChild({ app: { isPackaged: true }, directory, executable });
  return { control, delays };
}

module.exports = { openDiagnosticFixture };
