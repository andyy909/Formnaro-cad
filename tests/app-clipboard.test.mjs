import test from 'node:test';
import assert from 'node:assert/strict';
import { cadIdentity } from '../src/cad-affine.js';
import { createClipboard } from '../src/app/clipboard.js';
import { stampCadContourLink } from '../src/cad-linked-contours-data.js';

const target = (rootId) => ({ rootId, path: [] });
const body = (id) => ({
  id,
  kind: 'cad',
  source: 'native',
  solid: true,
  layerId: 'default',
  folderId: null,
  recipe: { type: 'cylinder', size: [20, 20, 10] },
  transform: cadIdentity(),
  brep: { data: id + ' BRep' },
  stats: { bounds: { min: [-10, -10, 0], max: [10, 10, 10] } },
});
const project = (version, nodes) => ({
  version,
  nodes,
  layers: [{ id: 'default' }],
  folders: [],
  activeLayerId: 'default',
  activeFolderId: null,
});

function setup(initial, rootId = initial.nodes[0].id) {
  const state = { project: initial, targets: [target(rootId)], revision: 1, scope: 'origin', kind: null };
  const loads = [],
    events = [];
  const clipboard = createClipboard({
    selected: (options) => {
      if (options) events.push(['selected', options]);
      return state.targets.map((target) => ({ target }));
    },
    project: () => state.project,
    controller: {
      revision: () => state.revision,
      projectScope: () => state.scope,
      materialize: (ids) => {
        const load = Promise.withResolvers();
        loads.push({ ...load, ids });
        return load.promise;
      },
    },
    activeEasyKind: () => state.kind,
    execute: async (operation, options) => {
      events.push(['execute', operation, options]);
      return { aliases: { copy0: 'root-copy', copy1: { rootId: 'group', path: ['child-copy'] } } };
    },
    mutate: async (change, label) => {
      const draft = structuredClone(state.project);
      change(draft);
      state.project = draft;
      events.push(['mutate', label]);
    },
    select: (targets) => events.push(['select', targets]),
    updateState: () => events.push('updateState'),
    toast: (message) => events.push(['toast', message]),
  });
  return { state, clipboard, loads, events };
}

for (const finish of ['resolves', 'rejects']) {
  test('paste waits for the newest copy when an older load later ' + finish, async () => {
    const original = project(17, [body('older'), body('newer')]);
    const { state, clipboard, loads, events } = setup(original);
    const oldCopy = clipboard.copySelection();
    state.targets = [target('newer')];
    const newCopy = clipboard.copySelection();
    const paste = clipboard.paste();
    await Promise.resolve();
    assert.deepEqual(
      loads.map(({ ids }) => ids),
      [['older'], ['newer']],
    );
    assert.deepEqual(events, []);

    loads[1].resolve(original);
    await newCopy;
    await paste;
    if (finish === 'rejects') {
      const rejected = assert.rejects(oldCopy, /outdated load failed/);
      loads[0].reject(Error('outdated load failed'));
      await rejected;
    } else {
      loads[0].resolve(original);
      await oldCopy;
    }
    await clipboard.paste();
    assert.deepEqual(
      state.project.nodes.slice(2).map((node) => node.brep.data),
      ['newer BRep', 'newer BRep'],
    );
    assert.deepEqual(events.slice(0, 2), ['updateState', ['toast', 'Auswahl kopiert.']]);
    assert.equal(events.filter((event) => event === 'updateState').length, 1);
  });
}

for (const field of ['revision', 'scope']) {
  test('copy rejects a changed project ' + field + ' while geometry is loading', async () => {
    const original = project(17, [body('source')]);
    const { state, clipboard, loads, events } = setup(original);
    const copy = clipboard.copySelection();
    const rejected = assert.rejects(copy, /Modell während des Kopierens geändert/);
    const paste = clipboard.paste();
    state[field] = 'changed';
    loads[0].resolve(original);
    await rejected;
    await paste;
    assert.equal(clipboard.isPasteDisabled(false), true);
    assert.deepEqual(events, ['updateState']);
    assert.deepEqual(state.project.nodes, original.nodes);
  });
}

test('legacy clipboard capture is synchronous and paste checks the active CAD or mesh domain', async () => {
  const { state, clipboard, loads, events } = setup(project(16, [body('legacy')]));
  assert.equal(clipboard.isPasteDisabled(false), true);
  assert.equal(clipboard.copySelection(), undefined);
  assert.deepEqual(loads, []);
  assert.deepEqual(events, ['updateState', ['toast', 'Auswahl kopiert.']]);
  assert.equal(clipboard.isPasteDisabled(true), true);
  assert.equal(clipboard.isPasteDisabled(false), false);
  state.kind = 'mesh';
  assert.equal(clipboard.isPasteDisabled(false), true);
  await assert.rejects(clipboard.paste(), /passenden CAD- oder Netz-Bereich/);
  assert.equal(state.project.nodes.length, 1);
  state.kind = 'cad';
  assert.equal(clipboard.isPasteDisabled(false), false);
  await clipboard.paste();
  assert.equal(state.project.nodes.length, 2);
});

test('native copy materializes linked sources, strips stored identities and preserves scoped links', async () => {
  const source = body('source');
  const profile = {
    elements: [{ id: 'rim', type: 'circle', center: [0, 0], diameter: 20 }],
    loops: [{ id: 'outer', role: 'outer', elements: ['rim'] }],
  };
  const contour = body('contour');
  contour.recipe = {
    type: 'sketch',
    size: [20, 20, 2],
    sketch: {
      version: 2,
      kind: 'profile',
      variables: [{ name: 'height', value: '2' }],
      dimensions: { height: 'height' },
      ...profile,
    },
  };
  contour.transform[14] = 10;
  const original = project(17, [source, contour]);
  original.contourLinks = {
    version: 1,
    links: [
      stampCadContourLink(
        original,
        {
          id: 'link',
          source: target('source'),
          target: target('contour'),
          selector: { kind: 'native-role', role: 'cylinder.cap.max' },
        },
        { profile, faceFrame: contour.transform, elementMap: [{ id: 'rim', sourceKey: 'cylinder.edge.cap.max' }] },
      ),
    ],
  };
  for (const node of original.nodes) node.geometryIdentity = { version: 1 };
  const catalogue = structuredClone(original);
  for (const node of catalogue.nodes) node.brep = { format: 'Formnaro-GeometryRef', kind: 'brep' };

  const { state, clipboard, loads, events } = setup(catalogue, 'contour');
  const copy = clipboard.copySelection();
  assert.deepEqual(loads[0].ids, ['contour', 'source']);
  loads[0].resolve(original);
  await copy;

  state.project = original;
  await clipboard.paste();
  const same = state.project.nodes.at(-1);
  assert.equal(state.project.nodes.length, 3);
  assert.deepEqual(same.transform.slice(12, 15), [10, 10, 10]);
  assert.equal(same.brep.data, 'contour BRep');
  assert.equal(same.geometryIdentity, undefined);
  assert.deepEqual(state.project.contourLinks.links.at(-1).source, target('source'));
  assert.deepEqual(events.at(-1), ['select', [target(same.id)]]);

  state.scope = 'destination';
  state.project = project(17, []);
  await clipboard.paste();
  const [copiedContour, copiedSource] = state.project.nodes;
  assert.notEqual(copiedContour.id, 'contour');
  assert.notEqual(copiedSource.id, 'source');
  assert.deepEqual(
    state.project.nodes.map((node) => node.brep.data),
    ['contour BRep', 'source BRep'],
  );
  assert.ok(state.project.nodes.every((node) => !Object.hasOwn(node, 'geometryIdentity')));
  assert.deepEqual(state.project.contourLinks.links[0].source, target(copiedSource.id));
  assert.deepEqual(state.project.contourLinks.links[0].target, target(copiedContour.id));
  assert.deepEqual(events.slice(-3), [
    ['mutate', 'CAD-Auswahl einfügen'],
    ['select', [target(copiedContour.id)]],
    ['toast', '1 benötigte Ausgangsquelle zusätzlich eingefügt.'],
  ]);
  assert.ok(original.nodes.every((node) => node.geometryIdentity));
});

test('duplicate submits editable targets and selects string and nested result aliases', async () => {
  const { state, clipboard, events } = setup(project(16, [body('original')]));
  const nested = { rootId: 'group', path: ['child'] };
  state.targets.push(nested);
  assert.equal(await clipboard.duplicate(), undefined);
  assert.deepEqual(events, [
    ['selected', { editable: true }],
    [
      'execute',
      {
        kind: 'batch',
        commands: [
          { op: 'duplicate', target: target('original'), translate: [10, 10, 0], space: 'world', as: 'copy0' },
          { op: 'duplicate', target: nested, translate: [10, 10, 0], space: 'world', as: 'copy1' },
        ],
      },
      { label: 'CAD duplizieren' },
    ],
    ['select', [target('root-copy'), { rootId: 'group', path: ['child-copy'] }]],
  ]);
});
