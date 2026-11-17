import assert from 'node:assert/strict';
import test from 'node:test';
import { createAlignment } from '../src/app/alignment.js';

const translation = ([x, y, z]) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const target = (rootId) => ({ rootId, path: [] });
const box = (id, x) => ({ id, min: [x - 1, 2, 3], center: [x, 4, 5], max: [x + 1, 6, 7] });
const bounds = { ...box(undefined, 9), byId: [box('a', 5), box('b', 13), box('locked', 18)] };

function fixture() {
  const nodes = ['a', 'b', 'locked'].map((id) => ({
    id,
    kind: 'cad',
    name: id,
    transform: translation([0, 0, 0]),
  }));
  let selection = nodes.map((node) => target(node.id));
  const state = { session: null, task: Promise.resolve(), ticket: 0 };
  const requests = [];
  const events = [];
  const elements = new Map();
  const element = () => ({
    dataset: {},
    children: [],
    hidden: true,
    append(child) {
      this.children.push(child);
    },
    querySelectorAll() {
      return this.children.filter((child) => child.dataset.alignAxis !== undefined);
    },
    replaceChildren() {
      this.children.length = 0;
    },
    scrollIntoView() {},
    setAttribute() {},
  });
  const $ = (id) => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  const model = { nodes, coordinateMode: 'world' };
  let revision = 'first';
  const view = {
    clearAlignmentPreview: () => events.push(['clear']),
    setInteraction: (callback) => {
      view.interact = callback;
    },
    setAlignmentReference: (id) => events.push(['reference', id]),
    fit: (targets) => events.push(['fit', targets]),
  };
  const actions = createAlignment({
    $,
    document: { createElement: element },
    state,
    controller: {
      revision: () => revision,
      query: (kind, options) => new Promise((resolve, reject) => requests.push({ kind, options, resolve, reject })),
    },
    view,
    project: () => model,
    activeFrame: () => translation([0, 0, 0]),
    context: ({ rootId }) => ({ locked: rootId === 'locked' }),
    getSelection: () => selection,
    selected: () => selection.map((item) => ({ node: nodes.find((node) => node.id === item.rootId), target: item })),
    copy: structuredClone,
    translate: translation,
    getMarkers: () => ({ hide() {}, set: (data) => events.push(['markers', data]) }),
    refreshUi: () => {},
    openInspector: () => {},
    safe: (action) => action(),
    escape: () => {
      state.session = null;
      ++state.ticket;
    },
    gesture: async (change) => {
      events.push(['gesture', change]);
    },
    mutate: async (edit, label, options) => {
      events.push(['mutate', label, options]);
      edit(model);
    },
  });
  return {
    actions,
    state,
    requests,
    events,
    nodes,
    view,
    $,
    setSelection: (value) => {
      selection = value;
    },
    setRevision: (value) => {
      revision = value;
    },
  };
}

test('an older bounds request, a changed revision and an aborted session cannot publish alignment markers', async () => {
  const { actions, state, requests, events, setRevision } = fixture();
  actions.alignPanel();
  const session = state.session;
  const older = state.task;
  const latest = actions.refreshAlignment();
  assert.equal(state.session, session);
  requests[1].resolve(bounds);
  await latest;
  const published = session.data;
  requests[0].resolve(bounds);
  await older;
  assert.equal(events.length, 1);
  assert.equal(session.data, published);

  const wrongRevision = actions.refreshAlignment();
  setRevision('changed');
  requests[2].resolve(bounds);
  await wrongRevision;
  assert.equal(session.data, null);

  const aborted = actions.refreshAlignment();
  requests[3].reject(new DOMException('aborted', 'AbortError'));
  await aborted;
  const closed = actions.refreshAlignment();
  state.session = null;
  ++state.ticket;
  requests[4].resolve(bounds);
  await closed;
  assert.equal(events.length, 1);
  assert.equal(session.data, null);
});

test('applying waits for the picked locked reference, clears preview and commits only movable parts at the plan revision', async () => {
  const { actions, state, requests, events, nodes, view, $ } = fixture();
  actions.alignPanel();
  requests[0].resolve(bounds);
  await state.task;
  const ray = { origin: [10, 0, 0] };
  const pick = view.interact(ray, null, { object: { userData: { rootId: 'locked' } } });
  assert.equal(requests[1].kind, 'rayPick');
  assert.deepEqual(requests[1].options, { ray, ids: ['a', 'b', 'locked'] });
  requests[1].resolve({ objectId: 'locked' });
  await Promise.resolve();
  assert.equal($('align-reference').textContent, 'Feste Referenz: locked');
  const apply = actions.applyAlignment(0, 'center');
  assert.equal(
    events.some(([name]) => name === 'mutate'),
    false,
  );
  requests[2].resolve(bounds);
  await Promise.all([pick, apply]);
  assert.deepEqual(events.slice(-2), [['clear'], ['mutate', 'CAD ausrichten', { revision: 'first' }]]);
  assert.deepEqual(
    nodes.map((node) => node.transform[12]),
    [13, 5, 0],
  );
});

test('mirror uses the current selection and revision after the bounds query, while center uses its captured targets and revision', async () => {
  const { actions, requests, events, setSelection, setRevision } = fixture();
  const selection = [target('a')];
  const mirror = actions.mirror(0);
  setSelection(selection);
  setRevision('mirror');
  requests[0].resolve(bounds);
  await mirror;
  assert.deepEqual(events[0], [
    'gesture',
    {
      targets: selection,
      delta: [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 18, 0, 0, 1],
      revision: 'mirror',
    },
  ]);

  const center = actions.centerSelection();
  setSelection([target('b')]);
  setRevision('later');
  requests[1].resolve(bounds);
  await center;
  assert.deepEqual(events.slice(1), [
    ['gesture', { targets: selection, delta: translation([-9, -4, -3]), revision: 'mirror' }],
    ['fit', selection],
  ]);
});
