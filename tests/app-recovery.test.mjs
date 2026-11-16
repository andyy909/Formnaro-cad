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
