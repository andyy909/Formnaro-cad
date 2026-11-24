const { mkdtempSync, rmdirSync } = require('node:fs');
const { Module } = require('node:module');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { performance: hostPerformance } = require('node:perf_hooks');

const diagnosticPath = require.resolve('../../backend/ai-diagnostic-child.cjs');

function loadDiagnosticChild(t, spawn, performance) {
  const previous = require.cache[diagnosticPath];
  const requireModule = Module.prototype.require;
  const dependencies = new Map([
    ['node:child_process', { spawn }],
    ['node:perf_hooks', { performance }]
  ]);
  // Capture the dependencies only while loading the real diagnostic module.
  const hook = t.mock.method(Module.prototype, 'require', function (name) {
    if (this.filename === diagnosticPath && dependencies.has(name)) return dependencies.get(name);
    return requireModule.call(this, name);
  });
  try {
    delete require.cache[diagnosticPath];
    return require(diagnosticPath);
  } finally {
    hook.mock.restore();
    if (previous) require.cache[diagnosticPath] = previous;
    else delete require.cache[diagnosticPath];
  }
}

function openDiagnosticFixture(t, {
  spawn, executable = process.execPath, performance = hostPerformance, clock,
  normal = 200, grace = 800, forced = 200
}) {
  const { openDiagnosticChild } = loadDiagnosticChild(t, spawn, performance);
  const directory = mkdtempSync(join(tmpdir(), 'formnaro-diagnostic-test-'));
  t.after(() => rmdirSync(directory));
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
