import assert from 'node:assert/strict';
import test from 'node:test';
import { createIsolation } from '../src/app/isolation.js';
import { createCadIsolation } from '../src/cad-isolation.js';

function fixture({ kind = null, fileBusy = false } = {}) {
  const project = {
    nodes: [
      { id: 'part', kind: 'cad' },
      { id: 'mesh', kind: 'mesh' },
      { id: 'other', kind: 'cad' },
    ],
    folders: [],
    layers: [],
  };
  const isolation = createCadIsolation();
  const notice = { hidden: true };
  const events = [];
  const target = { rootId: 'part', path: [] };
  const liveTarget = { rootId: 'other', path: [] };
  let selection = [target];
  let scene = { revision: 1 };
  const actions = createIsolation({
    isolation,
    isolationNotice: notice,
    view: {
      setIsolation: (ids) => events.push(['view', ids]),
      setSelection: (selected, currentScene) => events.push(['selection', selected, currentScene]),
    },
    project: () => project,
    activeEasyKind: () => kind,
    readyForFile: () => {
      events.push(['ready']);
      if (fileBusy) throw Error('file busy');
    },
    getSelection: () => {
      events.push(['capture']);
      return structuredClone(selection);
    },
    escape: () => {
      events.push(['escape', isolation.state()]);
      selection = [liveTarget];
      scene = { revision: 2 };
    },
    getLiveSelection: () => selection,
    getScene: () => scene,
    refreshMarkerVisibility: () => events.push(['markers', notice.hidden]),
    refreshUi: () => events.push(['ui', notice.hidden]),
  });
  return { actions, isolation, project, notice, events, target, liveTarget };
}

test('isolating captures targets before Escape and updates live selection after visibility', () => {
  const { actions, isolation, notice, events, liveTarget } = fixture();
  assert.deepEqual(events, []);
  actions.isolateSelection();

  assert.deepEqual(isolation.state(), ['part']);
  assert.equal(notice.hidden, false);
  assert.deepEqual(events, [
    ['ready'],
    ['capture'],
    ['escape', null],
    ['view', ['part']],
    ['markers', true],
    ['selection', [liveTarget], { revision: 2 }],
    ['ui', false],
  ]);
});

test('ending isolation restores renderer visibility and hides the status after the marker update', () => {
  const { actions, isolation, project, notice, events, target } = fixture();
  isolation.start(project, [target]);
  actions.updateIsolation();
  assert.equal(notice.hidden, false);
  events.length = 0;

  actions.endIsolation();
  assert.equal(isolation.state(), null);
  assert.equal(notice.hidden, true);
  assert.deepEqual(events, [['escape', ['part']], ['view', null], ['markers', false]]);
});

test('Easy mode intersects the active domain with isolation and keeps the status tied to isolation', () => {
  const { actions, isolation, project, notice, events, target } = fixture({ kind: 'cad' });
  actions.updateIsolation();
  assert.equal(notice.hidden, true);

  isolation.start(project, [target, { rootId: 'mesh', path: [] }]);
  actions.updateIsolation();
  assert.equal(notice.hidden, false);
  assert.deepEqual(isolation.state(), ['part', 'mesh']);
  assert.deepEqual(events, [
    ['view', ['part', 'other']],
    ['markers', true],
    ['view', ['part']],
    ['markers', true],
  ]);
});

test('a busy file operation stops isolation before selection capture or Escape', () => {
  const { actions, isolation, notice, events } = fixture({ fileBusy: true });
  assert.throws(() => actions.isolateSelection(), /file busy/);
  assert.equal(isolation.state(), null);
  assert.equal(notice.hidden, true);
  assert.deepEqual(events, [['ready']]);
});
