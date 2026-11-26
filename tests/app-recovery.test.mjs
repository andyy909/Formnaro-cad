import assert from 'node:assert/strict';
import test from 'node:test';
import { createRecoveryActions } from '../src/app/recovery.js';

test('a late autosave error from the previous project does not mark the current project as failed', async () => {
  let scope = 'first project';
  const { promise, reject } = Promise.withResolvers();
  const state = { mode: 'scale' };
  const recovery = createRecoveryActions({
    controller: { projectScope: () => scope, revision: () => 3 },
    project: () => ({ version: 17 }),
    serializeWorkspace: () => 'first project with workspace',
    workspaceSignature: JSON.stringify,
    recovery: { packageMode: () => false, write: () => promise, blocked: () => false },
    updateSaveState: () => {},
    runtime: { autosave: true },
  });

  const writing = recovery.writeConfirmedRecovery(state);
  assert.deepEqual(recovery.readStatus(), { pending: true, error: null });
  scope = 'second project';
  assert.deepEqual(recovery.readStatus(), { pending: false, error: null });
  reject(Error('The previous write failed'));

  assert.equal(await writing, false);
  assert.deepEqual(recovery.readStatus(), { pending: false, error: null });
});

test('close retries a changed revision and saves confirmed OCAD data while the controller is busy', async () => {
  let revision = 1;
  const writes = [];
  const recovery = createRecoveryActions({
    window: { __cadReady: true },
    controller: {
      projectScope: () => 'project',
      revision: () => revision,
      state: () => ({ busy: revision === 1 }),
      serialize: () => 'confirmed model',
    },
    project: () => ({ version: 17 }),
    workspace: () => ({ revision }),
    workspaceSignature: (state = { revision }) => JSON.stringify(state),
    serializeWorkspace: (state) => JSON.stringify(state),
    recovery: {
      packageMode: () => false,
      blocked: () => false,
      async write(data, options) {
        writes.push([data, options.version]);
        revision = 2;
        return true;
      },
    },
    updateSaveState: () => {},
    isMeshSelectionChecking: () => false,
    toast: (message) => assert.fail(message),
    runtime: { autosave: true, startupEmptyRevision: 0 },
  });

  assert.equal(await recovery.flushOnClose(), true);
  assert.deepEqual(writes, [
    ['confirmed model', 17],
    ['{"revision":2}', 17],
  ]);
});

function harness({ startRevision, initialRevision, protectedFile }) {
  let revision = initialRevision;
  const writes = [];
  let intervalFn;
  const realSetInterval = globalThis.setInterval;
  const actions = {
    window: { __cadReady: true },
    controller: {
      projectScope: () => 'project',
      revision: () => revision,
      state: () => ({ busy: false }),
      serialize: () => 'confirmed model',
    },
    project: () => ({ version: 17 }),
    workspace: () => ({ revision }),
    workspaceSignature: (state = { revision }) => JSON.stringify(state),
    serializeWorkspace: (state) => JSON.stringify(state),
    recovery: {
      packageMode: () => false,
      blocked: () => false,
      async write(data) {
        writes.push(JSON.parse(data).revision);
        return true;
      },
    },
    updateSaveState: () => {},
    isBusy: () => false,
    hasActiveTool: () => false,
    isMeshSelectionChecking: () => false,
    toast: (message) => assert.fail(message),
    safe: (fn) => fn(),
    errorReporter: { report: (error) => assert.fail(error.message) },
    runtime: { autosave: true, startupEmptyRevision: startRevision },
  };
  return {
    writes,
    setRevision: (value) => (revision = value),
    create() {
      const recovery = createRecoveryActions(actions);
      return {
        ...recovery,
        startAutosave() {
          globalThis.setInterval = (fn) => ((intervalFn = fn), 0);
          try {
            recovery.startAutosave();
          } finally {
            globalThis.setInterval = realSetInterval;
          }
        },
      };
    },
    tick: async () => {
      intervalFn();
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

test('AS-3 A: an untouched empty startup window never overwrites an older recovery file', async () => {
  const h = harness({ startRevision: 'empty', initialRevision: 'empty' });
  const recovery = h.create();
  recovery.startAutosave();
  const realNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    for (let i = 0; i < 5; i++) {
      await h.tick();
      now += 1500;
    }
  } finally {
    Date.now = realNow;
  }
  assert.equal(await recovery.flushOnClose(), true);
  recovery.saveOnUnload();
  assert.deepEqual(h.writes, []);
});

test('AS-3 B: undo back to the startup revision after a written autosave is persisted on close', async () => {
  const h = harness({ startRevision: 'empty', initialRevision: 'empty' });
  const recovery = h.create();
  h.setRevision('one body');
  await recovery.writeConfirmedRecovery({ revision: 'one body' });
  h.setRevision('empty');
  assert.equal(await recovery.flushOnClose(), true);
  assert.deepEqual(h.writes, ['one body', 'empty']);
});

test('AS-3 B2: the autosave timer also persists the undone startup state', async () => {
  const h = harness({ startRevision: 'empty', initialRevision: 'empty' });
  const recovery = h.create();
  recovery.startAutosave();
  h.setRevision('one body');
  await recovery.writeConfirmedRecovery({ revision: 'one body' });
  h.setRevision('empty');
  const realNow = Date.now;
  let now = 2_000_000;
  Date.now = () => now;
  try {
    for (let i = 0; i < 4; i++) {
      await h.tick();
      now += 1500;
    }
  } finally {
    Date.now = realNow;
  }
  assert.deepEqual(h.writes, ['one body', 'empty']);
});

test('AS-3 C: undo to the opened project state after a written autosave is persisted on close', async () => {
  const h = harness({ startRevision: 'empty', initialRevision: 'opened' });
  const recovery = h.create();
  h.setRevision('two bodies');
  await recovery.writeConfirmedRecovery({ revision: 'two bodies' });
  h.setRevision('opened');
  assert.equal(await recovery.flushOnClose(), true);
  assert.deepEqual(h.writes, ['two bodies', 'opened']);
});
