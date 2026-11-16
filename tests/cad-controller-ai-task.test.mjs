import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { createCadControllerAITask } from '../src/cad-controller-ai-task.js';
import { createCadController } from '../src/cad-controller.js';
import { createCadProject } from '../src/cad-project.js';

const factory = (file) => () => {
  const w = new Worker(new URL(file, import.meta.url)),
    a = { postMessage: (v) => w.postMessage(v), terminate: () => w.terminate() };
  w.on('message', (data) => a.onmessage?.({ data }));
  w.on('error', (error) => a.onerror?.(error));
  return a;
};
const cube = {
  id: 'source',
  kind: 'mesh',
  name: 'Original',
  layerId: 'default',
  folderId: null,
  color: '#ee8800',
  opacity: 1,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  mesh: { verts: [0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2], triangles: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3] },
};
const box = { kind: 'create', recipe: { type: 'box', size: [20, 12, 6] }, options: { id: 'body' } };
const convert = (target) => ({
  kind: 'batch',
  commands: [{ op: 'tool', engine: 'converter', operation: { kind: 'convert', target } }],
});
const converterError = () =>
  Object.assign(Error('Converter repair rejected on the original mesh'), {
    code: 'CAD_CONVERTER_REPAIR_REJECTED',
    feedback: { retryable: true, toolFailure: { scope: 'converter-only' } },
  });
function controller(t, extra = {}) {
  const cad = createCadController({
    initial: createCadProject({ nodes: [cube] }),
    createWorker: factory('./fixtures/cad-node-worker.mjs'),
    createMeshWorker: factory('./fixtures/mesh-engine-node-worker.mjs'),
    ...extra,
  });
  t.after(() => cad.dispose());
  return cad;
}
// A runner controlled from the test: started resolves when the runner is entered,
// release resolves the pending value. No timers are involved.
function openRunner() {
  let start, release;
  const started = new Promise((resolve) => (start = resolve));
  const pending = new Promise((resolve) => (release = resolve));
  return {
    runner: () => {
      start();
      return pending;
    },
    started,
    release,
  };
}
// A runner that only settles when its abort signal fires; it records the real signal.
function abortableRunner() {
  let start;
  const started = new Promise((resolve) => (start = resolve));
  const state = { signal: undefined, aborted: false };
  return {
    state,
    started,
    runner: ({ signal }) => {
      state.signal = signal;
      start();
      return new Promise((resolve, reject) => {
        const abort = () => {
          state.aborted = true;
          reject(Object.assign(Error('Lokale Berechnung abgebrochen.'), { name: 'AbortError', code: 'ABORTED' }));
        };
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
      });
    },
  };
}

test('A capture after a real revision change reports STALE_REVISION until a workspace query resets lazily', async (t) => {
  const cad = controller(t);
  cad.beginAITask();
  const text = 'Original measured profile: Äußere Kontur\n' + JSON.stringify({ diameter: 3.125, points: [[1, 2]] });
  await cad.analyze([
    {
      id: 'save',
      engine: 'workspace',
      kind: 'files',
      options: { action: 'write', path: 'measure/original.json', text },
    },
  ]);
  assert.deepEqual(cad.captureAITaskRuntime().files, { 'measure/original.json': text });
  const before = cad.revision();
  await cad.execute(box);
  assert.notEqual(cad.revision(), before);
  assert.throws(() => cad.captureAITaskRuntime(), { code: 'STALE_REVISION' });
  // The workspace query lazily resets the stale binding even though no analysis runs.
  const listed = await cad.analyze([{ id: 'list', engine: 'workspace', kind: 'files', options: { action: 'list' } }]);
  assert.deepEqual(listed.results[0].value, []);
  const snapshot = cad.captureAITaskRuntime();
  assert.equal(snapshot.revision, cad.revision());
  assert.deepEqual(snapshot.files, {});
});

test('Restore rejects outdated and invalid snapshots atomically, accepts a current snapshot for a stale binding and keeps instances isolated', async (t) => {
  let cadConversions = 0,
    donorConversions = 0;
  const cad = controller(t, {
    convertModel: async () => {
      cadConversions++;
      throw converterError();
    },
  });
  cad.beginAITask();
  await cad.analyze([
    {
      id: 'save',
      engine: 'workspace',
      kind: 'files',
      options: { action: 'write', path: 'measure/old.json', text: 'old task file' },
    },
  ]);
  const stale = JSON.parse(JSON.stringify(cad.captureAITaskRuntime()));
  await cad.execute(box);
  const revision = cad.revision(),
    model = cad.serialize();
  // The old snapshot belongs to the old revision: rejected before any live change.
  assert.throws(() => cad.restoreAITaskRuntime(stale), { code: 'AI_TASK_RUNTIME_INVALID' });
  assert.throws(() => cad.captureAITaskRuntime(), { code: 'STALE_REVISION' });
  assert.equal(cad.revision(), revision);
  assert.equal(cad.serialize(), model);
  // A second controller reaches the same content-bound revision and provides a genuinely
  // current snapshot with new files and a stored converter lock.
  const donor = controller(t, {
    convertModel: async () => {
      donorConversions++;
      throw converterError();
    },
  });
  await donor.execute(box);
  assert.equal(donor.revision(), revision);
  donor.beginAITask();
  const text = 'Äußere Kontur\n' + JSON.stringify({ diameter: 3.125, points: [[3, 4]] });
  await donor.analyze([
    { id: 'save', engine: 'workspace', kind: 'files', options: { action: 'write', path: 'measure/new.json', text } },
  ]);
  await assert.rejects(donor.preview(convert('source')), { code: 'CAD_CONVERTER_REPAIR_REJECTED' });
  const current = JSON.parse(JSON.stringify(donor.captureAITaskRuntime()));
  assert.equal(current.revision, revision);
  assert.equal(current.files['measure/new.json'], text);
  assert.equal(current.blockedConversions.length, 1);
  // A current valid snapshot may replace the workspace that was still bound to the old revision.
  assert.deepEqual(cad.restoreAITaskRuntime(current), { revision, files: 1, blockedConversions: 1 });
  assert.deepEqual(cad.captureAITaskRuntime(), current);
  const read = await cad.analyze([
    { id: 'read', engine: 'workspace', kind: 'files', options: { action: 'read', path: 'measure/new.json' } },
  ]);
  assert.equal(read.results[0].value, text);
  // Returned snapshots are copies; mutating them must not change the live task state.
  const returned = cad.captureAITaskRuntime();
  returned.files['measure/new.json'] = 'tampered';
  returned.files['measure/extra.json'] = 'tampered';
  returned.blockedConversions.length = 0;
  assert.deepEqual(cad.captureAITaskRuntime(), current);
  // Every invalid snapshot is rejected before a synchronous exchange; the live state,
  // including the stored lock, stays exactly as captured.
  const variants = [
    ['revision', { ...current, revision: 'another' }, 'AI_TASK_RUNTIME_INVALID'],
    ['escape', { ...current, files: { ...current.files, '../host': 'x' } }, 'AI_WORKSPACE_INVALID'],
    [
      'oversize',
      { ...current, files: { ...current.files, 'large.txt': 'x'.repeat(32 * 1024 * 1024 + 1) } },
      'AI_WORKSPACE_INVALID',
    ],
    [
      'duplicate lock',
      { ...current, blockedConversions: [...current.blockedConversions, ...current.blockedConversions] },
      'AI_TASK_RUNTIME_INVALID',
    ],
    [
      'invalid lock',
      { ...current, blockedConversions: [{ key: 'invalid', error: { code: 'X', message: 'invalid' } }] },
      'AI_TASK_RUNTIME_INVALID',
    ],
  ];
  for (const [label, altered, code] of variants) {
    assert.throws(() => cad.restoreAITaskRuntime(altered), { code }, label);
    assert.deepEqual(cad.captureAITaskRuntime(), current, label);
  }
  // The two instances own separate state: resetting the donor and using its converter
  // route never touches the restored workspace or the stored lock of the first instance.
  donor.beginAITask();
  assert.deepEqual(donor.captureAITaskRuntime(), { version: 1, revision, files: {}, blockedConversions: [] });
  assert.deepEqual(cad.captureAITaskRuntime(), current);
  await assert.rejects(donor.preview(convert('source')), { code: 'CAD_CONVERTER_REPAIR_REJECTED' });
  assert.equal(donorConversions, 2);
  assert.deepEqual(cad.captureAITaskRuntime(), current);
  await assert.rejects(cad.preview(convert('source')), { code: 'CAD_CONVERTER_REPAIR_REJECTED' });
  assert.equal(cadConversions, 0);
  assert.equal(donorConversions, 2);
});

test('The converter cache records analyze failures but serves them only to the explicit convert route', async (t) => {
  let conversions = 0,
    runnerCalls = 0,
    caught;
  const cad = controller(t, {
    convertModel: async () => {
      conversions++;
      throw converterError();
    },
    runScript: async ({ call }) => {
      runnerCalls++;
      try {
        return await call('query', { engine: 'converter', kind: 'analyze', options: { target: 'source' } });
      } catch (error) {
        caught = error;
        return { converter: 'rejected', code: error.code };
      }
    },
  });
  cad.beginAITask();
  const request = {
    engine: 'javascript',
    kind: 'run',
    options: { code: 'return await api.query({engine:"converter",kind:"analyze",options:{target:"source"}});' },
  };
  const first = await cad.analyze([{ id: 'first', ...request }]);
  assert.equal(conversions, 1);
  assert.equal(runnerCalls, 1);
  assert.equal(caught.code, 'CAD_CONVERTER_REPAIR_REJECTED');
  assert.equal(first.results[0].value.code, 'CAD_CONVERTER_REPAIR_REJECTED');
  const locked = cad.captureAITaskRuntime();
  assert.equal(locked.blockedConversions.length, 1);
  // action=analyze never reads the cache: the injected runner runs a second time.
  await cad.analyze([{ id: 'second', ...request }]);
  assert.equal(conversions, 2);
  assert.equal(runnerCalls, 2);
  // The explicit converter route throws the stored failure without another runner call.
  await assert.rejects(cad.preview(convert('source')), {
    code: 'CAD_CONVERTER_REPAIR_REJECTED',
    message: 'Converter repair rejected on the original mesh',
  });
  assert.equal(conversions, 2);
  assert.equal(runnerCalls, 2);
  // The batch wrapper decorates the thrown error with its command position, but the
  // stored converter lock keeps its key and code and the runner was not called again.
  const afterPreview = cad.captureAITaskRuntime();
  assert.equal(afterPreview.blockedConversions.length, 1);
  assert.equal(afterPreview.blockedConversions[0].key, locked.blockedConversions[0].key);
  assert.equal(afterPreview.blockedConversions[0].error.code, 'CAD_CONVERTER_REPAIR_REJECTED');
});

test('A workspace query during the running build resets lazily instead of throwing BUSY', async (t) => {
  let listed, busyDuringBuild;
  const cad = controller(t, {
    runScript: async ({ call }) => {
      busyDuringBuild = cad.state().busy;
      listed = await call('query', { engine: 'workspace', kind: 'files', options: { action: 'list' } });
      return { count: listed.length };
    },
  });
  cad.beginAITask();
  await cad.analyze([
    {
      id: 'save',
      engine: 'workspace',
      kind: 'files',
      options: { action: 'write', path: 'measure/old.json', text: 'old task file' },
    },
  ]);
  await cad.execute(box);
  const revision = cad.revision();
  assert.throws(() => cad.captureAITaskRuntime(), { code: 'STALE_REVISION' });
  // Preview batches execute JavaScript as op:'script'; analyze uses engine:'javascript'.
  const proposal = await cad.preview({
    kind: 'batch',
    commands: [
      {
        op: 'script',
        name: 'Dateien',
        code: 'return await api.query({engine:"workspace",kind:"files",options:{action:"list"}});',
      },
    ],
  });
  assert.equal(proposal.revision, revision);
  assert.equal(busyDuringBuild, true);
  assert.deepEqual(listed, []);
  const snapshot = cad.captureAITaskRuntime();
  assert.equal(snapshot.revision, revision);
  assert.deepEqual(snapshot.files, {});
});

test('The AI task module keeps one preview owner gate and releases owners only on untrack', () => {
  const store = { revision: () => 'r', state: () => ({ busy: false }) };
  const ai = createCadControllerAITask({ store, alive: () => {} });
  const a = new AbortController(),
    b = new AbortController();
  ai.track(a);
  assert.equal(ai.busy(), true);
  assert.equal(ai.allowsPreview(a), true);
  assert.equal(ai.allowsPreview(b), false);
  assert.equal(ai.allowsPreview(undefined), false);
  ai.track(b);
  assert.equal(ai.busy(), true);
  assert.equal(ai.owns(a), true);
  assert.equal(ai.owns(b), true);
  assert.equal(ai.allowsPreview(a), false);
  assert.equal(ai.allowsPreview(b), false);
  // Dispose aborts every open owner but keeps it registered until its own finally.
  ai.dispose();
  assert.equal(a.signal.aborted, true);
  assert.equal(b.signal.aborted, true);
  assert.equal(ai.busy(), true);
  ai.untrack(a);
  assert.equal(ai.owns(a), false);
  assert.equal(ai.busy(), true);
  ai.untrack(b);
  assert.equal(ai.busy(), false);
});

test('A running analysis blocks preview, capture, restore and begin until the runner settles', async (t) => {
  const opened = openRunner();
  const cad = controller(t, { runScript: opened.runner });
  cad.beginAITask();
  const analysis = cad.analyze([
    { id: 'slow', engine: 'javascript', kind: 'run', options: { code: 'return {count:1};' } },
  ]);
  await opened.started;
  assert.equal(cad.state().busy, true);
  await assert.rejects(
    cad.preview({ kind: 'batch', commands: [{ op: 'create', recipe: { type: 'box', size: [1, 1, 1] } }] }),
    { code: 'BUSY' },
  );
  assert.throws(() => cad.captureAITaskRuntime(), { code: 'BUSY' });
  assert.throws(() => cad.restoreAITaskRuntime({}), { code: 'BUSY' });
  assert.throws(() => cad.beginAITask(), { code: 'BUSY' });
  opened.release({ count: 1 });
  const result = await analysis;
  assert.equal(result.results[0].value.count, 1);
  assert.equal(cad.state().busy, false);
});

test('Analyze calls the controller callbacks without assigning a receiver', async (t) => {
  const events = [];
  const cad = controller(t, {
    onBusy: function (value) {
      events.push({ callback: 'busy', receiver: this, value });
    },
    resolveGeometry: async function (project, _progress, { signal }) {
      events.push({ callback: 'geometry', receiver: this, value: project.nodes[0].id });
      assert.equal(signal.aborted, false);
      return project;
    },
    getProgramResources: function () {
      events.push({ callback: 'resources', receiver: this });
      return { fixture: 'local' };
    },
    runScript: async ({ call }) => {
      const model = await call('model');
      return { firstId: model.objects[0].id };
    },
  });

  const result = await cad.analyze([
    { id: 'model', engine: 'javascript', kind: 'run', options: { code: 'return {};' } },
    { id: 'catalog', engine: 'app', kind: 'resources' },
  ]);

  assert.equal(result.results[0].value.firstId, 'source');
  assert.equal(result.results[1].value.fixture, 'local');
  assert.deepEqual(events, [
    { callback: 'busy', receiver: undefined, value: true },
    { callback: 'geometry', receiver: undefined, value: 'source' },
    { callback: 'resources', receiver: undefined },
    { callback: 'busy', receiver: undefined, value: false },
  ]);
});

test('Cancel aborts the open runner signal while its owner stays registered until the finally release', async (t) => {
  const opened = abortableRunner();
  const cad = controller(t, { runScript: opened.runner });
  cad.beginAITask();
  const analysis = cad.analyze([{ id: 'wait', engine: 'javascript', kind: 'run', options: { code: 'return {};' } }]);
  const rejection = assert.rejects(analysis, { code: 'ABORTED' });
  await opened.started;
  assert.equal(cad.state().busy, true);
  cad.cancel();
  assert.equal(opened.state.signal.aborted, true);
  // The owner is released only in the analysis finally, not by cancel itself.
  assert.equal(cad.state().busy, true);
  await rejection;
  assert.equal(opened.state.aborted, true);
  assert.equal(cad.state().busy, false);
  assert.equal(cad.captureAITaskRuntime().revision, cad.revision());
});

test('Dispose aborts the open runner, releases its owner in the finally and closes the controller', async (t) => {
  const opened = abortableRunner();
  const cad = controller(t, { runScript: opened.runner });
  cad.beginAITask();
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  t.after(() => process.off('unhandledRejection', onUnhandled));
  const analysis = cad.analyze([{ id: 'wait', engine: 'javascript', kind: 'run', options: { code: 'return {};' } }]);
  const rejection = assert.rejects(analysis, { code: 'ABORTED' });
  await opened.started;
  cad.dispose();
  assert.equal(opened.state.signal.aborted, true);
  await rejection;
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(unhandled, []);
  assert.equal(cad.state().busy, false);
  assert.throws(() => cad.captureAITaskRuntime(), { message: 'CAD-Anwendung wurde geschlossen.' });
  assert.throws(() => cad.restoreAITaskRuntime({}), { message: 'CAD-Anwendung wurde geschlossen.' });
});

test('beginAITask clears files and converter locks even at the same revision', async (t) => {
  let conversions = 0;
  const cad = controller(t, {
    convertModel: async () => {
      conversions++;
      throw converterError();
    },
  });
  cad.beginAITask();
  await cad.analyze([
    {
      id: 'save',
      engine: 'workspace',
      kind: 'files',
      options: { action: 'write', path: 'measure/task.json', text: 'task' },
    },
  ]);
  await assert.rejects(cad.preview(convert('source')), { code: 'CAD_CONVERTER_REPAIR_REJECTED' });
  const before = cad.captureAITaskRuntime();
  assert.equal(before.files['measure/task.json'], 'task');
  assert.equal(before.blockedConversions.length, 1);
  const revision = cad.revision();
  // The same revision does not short-circuit begin: it still clears workspace and locks.
  cad.beginAITask();
  assert.equal(cad.revision(), revision);
  assert.deepEqual(cad.captureAITaskRuntime(), { version: 1, revision, files: {}, blockedConversions: [] });
  await assert.rejects(cad.preview(convert('source')), { code: 'CAD_CONVERTER_REPAIR_REJECTED' });
  assert.equal(conversions, 2);
});

test('Analysis artifacts merge per request and stay readable after a revision change', async (t) => {
  let calls = 0;
  const cad = controller(t, {
    runScript: async () => {
      calls++;
      if (calls === 2) cad.undo();
      return { request: calls };
    },
  });
  cad.beginAITask();
  await cad.analyze([
    {
      id: 'prefill',
      engine: 'workspace',
      kind: 'files',
      options: { action: 'write', path: 'measure/prefill.json', text: 'pre' },
    },
  ]);
  await cad.execute(box);
  const revision = cad.revision();
  assert.throws(() => cad.captureAITaskRuntime(), { code: 'STALE_REVISION' });
  const analysis = cad.analyze([
    { id: 'first', engine: 'javascript', kind: 'run', options: { code: 'return {request:1};' } },
    { id: 'second', engine: 'javascript', kind: 'run', options: { code: 'return {request:2};' } },
  ]);
  await assert.rejects(analysis, { code: 'STALE_REVISION' });
  assert.equal(calls, 2);
  // Restore the content-bound revision so the workspace binding is current again.
  cad.redo();
  assert.equal(cad.revision(), revision);
  const snapshot = cad.captureAITaskRuntime();
  assert.equal(snapshot.files['measure/prefill.json'], undefined);
  const artifacts = Object.keys(snapshot.files).filter((path) => path.startsWith('analysis-programs/'));
  assert.equal(artifacts.length, 2);
  const program = artifacts.find((path) => path.endsWith('.js'));
  assert.ok(program);
  assert.equal(snapshot.files[program], 'return {request:1};');
  const read = await cad.analyze([
    { id: 'read', engine: 'workspace', kind: 'files', options: { action: 'read', path: program } },
  ]);
  assert.equal(read.results[0].value, 'return {request:1};');
});
