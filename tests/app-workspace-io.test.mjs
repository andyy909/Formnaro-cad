import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspaceIO } from '../src/app/workspace-io.js';
import { createCadProject, createCadWorkspaceSerializer } from '../src/cad-project.js';
import { encodeFnpackProject } from '../src/cad-fnpack-data.js';
import { createCadAssemblyDisplay } from '../src/cad-assembly-display.js';
import { CAD_QUALITY_DEFAULTS } from '../src/cad-quality.js';
import { defaultLayout } from '../src/layout-preferences.js';

function fixture() {
  const model = createCadProject();
  const camera = {
    projection: 'perspective',
    position: [80.00000000001, -90, 100],
    target: [0, 0, 0],
    up: [0, 0, 1],
    zoom: 1,
  };
  const runtime = {
    view: { viewState: () => camera, getMode: () => 'scale', restoreView: () => {} },
    layoutUI: { state: defaultLayout, restore: async () => {} },
    preferences: { snap: 0.25 },
    isolation: { end: () => {} },
    refreshTask: Promise.resolve(),
    fileBusy: false,
    preferredProjectFormat: 'ocad',
    savedRevision: null,
    cleanRevision: null,
    savedWorkspaceSignature: null,
    cleanWorkspaceSignature: null,
    activeProjectFile: null,
    recoveredProject: true,
  };
  const desktop = {};
  const assemblyDisplay = createCadAssemblyDisplay();
  const calls = [];
  const controller = {
    serializeWorkspace: createCadWorkspaceSerializer(model),
    revision: () => 'current',
    holdRevision(revision) {
      assert.equal(runtime.fileBusy, false);
      if (revision !== this.revision()) throw Object.assign(Error('Stale'), { code: 'STALE_REVISION' });
      calls.push('hold');
      return () => {
        assert.equal(runtime.fileBusy, false);
        calls.push('release');
      };
    },
  };
  const io = createWorkspaceIO({
    window: { offlinecadDesktop: desktop },
    runtime,
    controller,
    project: () => model,
    $: () => ({ close: () => calls.push('close') }),
    t: (value) => value,
    assemblyDisplay,
    quality: { get: () => CAD_QUALITY_DEFAULTS },
    getSelection: () => [],
    readyForFile: () => assert.equal(runtime.fileBusy, false),
    confirmProjectChange: async () => true,
    packFiles: { register: (value) => calls.push(value?.sourceId ?? 'register') },
    toast: () => {},
    updateState: () => calls.push('update'),
    scheduleRefresh: async () => calls.push('refresh'),
    updateIsolation: () => {},
    setQuality: async () => {},
    setPreferences: () => {},
    setMode: () => {},
    select: () => {},
    cacheWelcomePackageThumbnail: () => {},
  });
  return { io, runtime, desktop, controller, calls, camera, assemblyDisplay, model };
}

test('OCAD automation validates and holds the revision through the native reply, then records the exact stored format', async () => {
  const { io, runtime, desktop, calls, camera } = fixture();
  let finish;
  desktop.saveProject = () => assert.fail('The structured reply takes precedence');
  desktop.saveProjectReply = (args) => {
    calls.push('reply');
    assert.equal(args.automation, true);
    assert.equal(args.saveAs, true);
    assert.equal(args.filename, 'shop.ocad');
    const value = JSON.parse(new TextDecoder().decode(args.bytes));
    assert.deepEqual(value.workspace.view.position, camera.position);
    return new Promise((resolve) => {
      finish = () =>
        resolve({
          ok: true,
          value: { saved: true, file: { id: 'one', path: '/shop.ocad', size: args.bytes.length }, warning: 'test' },
        });
    });
  };
  await assert.rejects(io.saveFromAutomation({ revision: 'old', filename: 'shop.ocad' }), { code: 'STALE_REVISION' });
  await assert.rejects(
    io.saveFromAutomation({ revision: 'current', filename: 'shop.ocad', format: 'fnpack' }),
    /Dateiendung/,
  );
  const task = io.saveFromAutomation({ revision: 'current', filename: 'shop.ocad' });
  assert.deepEqual(calls, ['hold', 'reply']);
  assert.equal(runtime.fileBusy, true);
  assert.equal(runtime.activeProjectFile, null);
  finish();
  const receipt = await task;
  assert.deepEqual(receipt, {
    saved: true,
    revision: 'current',
    currentRevision: 'current',
    path: '/shop.ocad',
    format: 'ocad',
    bytes: receipt.bytes,
    warning: 'test',
  });
  assert.ok(receipt.bytes > 0);
  assert.equal(runtime.savedRevision, 'current');
  assert.equal(runtime.cleanRevision, 'current');
  assert.equal(runtime.recoveredProject, false);
  assert.equal(runtime.activeProjectFile.projectVersion, 5);
  assert.equal(runtime.savedWorkspaceSignature, runtime.cleanWorkspaceSignature);
  assert.equal(JSON.parse(runtime.cleanWorkspaceSignature).view.position[0], 80);
  assert.deepEqual(calls, ['hold', 'reply', 'register', 'update', 'release']);
});

test('cancel and a structured save error retain the file session and release automation', async () => {
  const { io, runtime, desktop, calls } = fixture();
  runtime.activeProjectFile = { id: 'existing', projectVersion: 5 };
  const before = { ...runtime };
  desktop.saveProject = () => assert.fail('The structured reply takes precedence');
  desktop.saveProjectReply = async () => ({ ok: true, value: { saved: false } });
  assert.deepEqual(await io.save(), { saved: false });
  assert.deepEqual(runtime, before);
  const feedback = { field: 'project' };
  desktop.saveProjectReply = async () => ({ ok: false, error: 'Changed on disk', code: 'EEXIST', feedback });
  await assert.rejects(io.saveFromAutomation({ revision: 'current', filename: 'shop.ocad' }), {
    message: 'Changed on disk',
    code: 'EEXIST',
    feedback,
  });
  assert.deepEqual(runtime, before);
  assert.deepEqual(calls, ['update', 'hold', 'release']);
});

test('an opened package registers its catalog before reading and only switches the file session on success', async () => {
  const { io, runtime, desktop, controller, calls, assemblyDisplay, model } = fixture();
  const workspace = { ...io.workspace(), version: 5, tree: { expanded: [] }, loadSet: [] };
  const packed = encodeFnpackProject({ ...createCadProject(), workspace }).project;
  const file = { id: 'ready', path: '/ready.fnpack' };
  let reply = { opened: false };
  desktop.openProject = async (args) => {
    assert.deepEqual(args, { id: file.id });
    assert.equal(runtime.fileBusy, true);
    return reply;
  };
  assert.equal(await io.openProject(file.id), undefined);
  assert.deepEqual(calls, []);
  reply = { opened: true, file, project: packed, fnpack: { sourceId: 'catalog' } };
  controller.readProject = async (value) => {
    calls.push('read');
    assert.equal(value, packed);
    return { project: structuredClone(value), warnings: [] };
  };
  controller.projectScope = () => 'new-scope';
  controller.invalidateDisplayView = () => calls.push('invalidate');
  controller.open = async () => {
    assert.equal(runtime.assemblyOpening, true);
    assert.equal(runtime.preferredProjectFormat, 'ocad');
    assert.equal(runtime.activeProjectFile, null);
    assert.deepEqual(assemblyDisplay.ids(model), []);
    throw Error('Cannot open');
  };
  await assert.rejects(io.openProject(file.id), /Cannot open/);
  assert.equal(runtime.preferredProjectFormat, 'ocad');
  assert.equal(runtime.activeProjectFile, null);
  assert.equal(runtime.fileBusy, false);
  assert.equal(runtime.assemblyOpening, false);
  assert.equal(assemblyDisplay.ids(model), null);
  controller.open = async (value) => {
    assert.equal(runtime.assemblyOpening, true);
    assert.equal(Object.hasOwn(value, 'workspace'), false);
  };
  assert.equal(await io.openProject(file.id), true);
  assert.equal(runtime.preferredProjectFormat, 'fnpack');
  assert.deepEqual(runtime.activeProjectFile, { ...file, projectVersion: 17 });
  assert.equal(runtime.cleanRevision, 'current');
  assert.equal(runtime.recoveredProject, false);
  assert.equal(runtime.fileBusy, false);
  assert.equal(runtime.savedWorkspaceSignature, io.workspaceSignature());
  assert.equal(runtime.cleanWorkspaceSignature, runtime.savedWorkspaceSignature);
  assert.deepEqual(calls, [
    'catalog',
    'read',
    'invalidate',
    'catalog',
    'read',
    'invalidate',
    'refresh',
    'update',
    'close',
  ]);
});
