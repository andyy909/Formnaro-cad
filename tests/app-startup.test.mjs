import assert from 'node:assert/strict';
import test from 'node:test';
import { createStartup } from '../src/app/startup.js';

function setup(offlinecadDesktop) {
  const overlay = { dataset: {}, hidden: false, textContent: '' };
  const status = { textContent: '' };
  const document = {
    documentElement: { lang: 'de' },
    getElementById: (id) => ({ 'startup-phase': overlay, status })[id],
  };
  const window = {
    offlinecadDesktop,
    localStorage: { getItem: (key) => (key === 'offlinecad-settings-v1' ? 'local settings' : null) },
  };
  const performance = {
    time: 10.5,
    now() {
      return this.time;
    },
  };
  return { startup: createStartup({ document, window, performance }), overlay, status, document, window, performance };
}

test('Startup records completed phases with independent snapshots and uses the current document language', () => {
  const { startup, overlay, document, performance } = setup();
  startup.setStartupPhase('read-recovery');
  assert.equal(overlay.textContent, 'Autosicherung wird gelesen …');
  assert.deepEqual(startup.startupPhases(), []);

  performance.time = 13;
  document.documentElement.lang = 'en';
  startup.setStartupPhase('validate-project');
  assert.equal(overlay.textContent, 'Validating project …');
  const snapshot = startup.startupPhases();
  assert.deepEqual(snapshot, [{ name: 'read-recovery', startedMs: 10.5, finishedMs: 13, durationMs: 2.5 }]);
  snapshot[0].name = 'changed';
  snapshot.length = 0;

  performance.time = 18;
  startup.setStartupPhase('ready');
  assert.deepEqual(overlay, { dataset: { phase: 'ready' }, hidden: true, textContent: '' });
  assert.deepEqual(startup.startupPhases(), [
    { name: 'read-recovery', startedMs: 10.5, finishedMs: 13, durationMs: 2.5 },
    { name: 'validate-project', startedMs: 13, finishedMs: 18, durationMs: 5 },
  ]);
});

test('Startup opens the CAD-only program store before announcing UI mounting and returning the store', async () => {
  const { promise, resolve } = Promise.withResolvers();
  const { startup, overlay, document, performance } = setup({
    initializeProgramData: () => assert.fail('Synchronous initialization'),
    initializeProgramDataAsync(request) {
      assert.equal(overlay.dataset.phase, 'load-data');
      assert.equal(overlay.textContent, 'Lokale Daten werden geladen …');
      assert.deepEqual(request, {
        format: 'FormnaroProgramDataInitialization',
        version: 1,
        cadOnly: true,
        values: { 'offlinecad-settings-v1': 'local settings' },
      });
      return promise;
    },
  });
  const opening = startup.openStorage();
  assert.equal(overlay.hidden, false);
  assert.equal(overlay.dataset.phase, 'load-data');
  assert.deepEqual(startup.startupPhases(), []);

  performance.time = 20.5;
  document.documentElement.lang = 'en';
  resolve({ values: { 'offlinecad-settings-v1': 'portable settings' }, revisions: {} });
  const storage = await opening;
  assert.equal(overlay.dataset.phase, 'mount-ui');
  assert.equal(overlay.textContent, 'Preparing the workspace …');
  assert.equal(storage.getItem('offlinecad-settings-v1'), 'portable settings');
  assert.deepEqual(startup.startupPhases(), [{ name: 'load-data', startedMs: 10.5, finishedMs: 20.5, durationMs: 10 }]);
});

test('Startup records the error, failed phase and status in order and rejects with the original error', async () => {
  const error = new Error('Speicher nicht verfügbar');
  const { startup, window, overlay, status } = setup({
    initializeProgramData: () => assert.fail('Synchronous initialization'),
    initializeProgramDataAsync: () => Promise.reject(error),
  });
  const events = [];
  Object.defineProperty(window, '__cadError', { set: (value) => events.push(['error', value]) });
  Object.defineProperty(overlay.dataset, 'phase', { set: (value) => events.push(['phase', value]) });
  Object.defineProperty(status, 'textContent', { set: (value) => events.push(['status', value]) });

  await assert.rejects(startup.openStorage(), (received) => received === error);
  assert.deepEqual(events, [
    ['phase', 'load-data'],
    ['error', 'Speicher nicht verfügbar'],
    ['phase', 'failed'],
    ['status', 'Start fehlgeschlagen: Speicher nicht verfügbar'],
  ]);
  assert.equal(overlay.hidden, false);
  assert.equal(overlay.textContent, 'Start fehlgeschlagen: Speicher nicht verfügbar');
  assert.deepEqual(startup.startupPhases(), [{ name: 'load-data', startedMs: 10.5, finishedMs: 10.5, durationMs: 0 }]);
});
