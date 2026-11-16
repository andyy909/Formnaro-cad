import test from 'node:test';
import assert from 'node:assert/strict';
import { createUiHelpers } from '../src/app/ui-helpers.js';

function fixture(desktop) {
  const events = [],
    nodes = { toast: { style: {} }, status: {}, 'modal-title': {}, 'modal-body': {} };
  let busy = false,
    language = 'de';
  nodes.modal = {
    open: false,
    modal: false,
    classList: { remove: (...v) => events.push(['classes', ...v]) },
    matches() {
      return this.modal;
    },
    close() {
      events.push('close');
      this.open = false;
    },
    show() {
      events.push('show');
      this.open = true;
      this.modal = false;
    },
    showModal() {
      events.push('showModal');
      this.open = true;
      this.modal = true;
    },
  };
  const links = [];
  const document = {
    body: { dataset: {}, append: (link) => links.push(link) },
    createElement: () => ({
      click() {
        events.push(['click', this.download]);
      },
      remove() {
        events.push('remove');
      },
    }),
  };
  const progress = { hidden: true };
  const helpers = createUiHelpers({
    $: (id) => nodes[id],
    t: (text) => `${language}:${text}`,
    errorReporter: { report: (e) => events.push(['report', e.message]) },
    beforeModal: () => events.push('cleanup'),
    getBusy: () => busy,
    setBusyState: (v) => {
      busy = v;
    },
    updateState: () => events.push(['update', busy]),
    progress,
    document,
    window: { offlinecadDesktop: desktop },
  });
  return {
    ...helpers,
    events,
    nodes,
    progress,
    links,
    language: (v) => {
      language = v;
    },
    isBusy: () => busy,
  };
}

test('safe preserves results, error order, abort silence and dynamic toast translation', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(),
    old = console.error;
  console.error = (e) => f.events.push(['console', e.message]);
  try {
    assert.equal(
      f.safe(() => 42),
      42,
    );
    assert.equal(await f.safe(() => Promise.resolve(7)), 7);
    const error = new Error('bad');
    assert.equal(
      f.safe(() => {
        throw error;
      }),
      undefined,
    );
    assert.deepEqual(f.events, [
      ['report', 'bad'],
      ['console', 'bad'],
    ]);
    assert.equal(f.nodes.toast.textContent, 'de:bad');
    f.language('en');
    await f.safe(() => Promise.reject(error));
    assert.equal(f.nodes.toast.textContent, 'en:bad');
    const n = f.events.length;
    const abort = Object.assign(new Error('abort'), { name: 'AbortError' });
    f.safe(() => {
      throw abort;
    });
    await f.safe(() => Promise.reject(abort));
    assert.equal(f.events.length, n);
    t.mock.timers.tick(6000);
    assert.equal(f.nodes.toast.style.display, 'none');
  } finally {
    console.error = old;
  }
});

test('modal cleanup precedes mode switch and busy delay resets', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  f.modal('one', '<b>x</b>');
  f.modal('two', 'y', { modeless: true });
  assert.equal(f.events[0], 'cleanup');
  assert.equal(f.events[2], 'showModal');
  assert.equal(f.events[3], 'cleanup');
  assert.equal(f.events[4], 'close');
  assert.equal(f.events[6], 'show');
  assert.equal(f.nodes['modal-title'].textContent, 'de:two');
  assert.equal(f.nodes['modal-body'].innerHTML, 'y');
  f.setBusy(true);
  assert.equal(f.isBusy(), true);
  t.mock.timers.tick(199);
  assert.equal(f.progress.hidden, true);
  t.mock.timers.tick(1);
  assert.equal(f.progress.hidden, false);
  f.setBusy(false);
  assert.equal(f.progress.hidden, true);
  f.setBusy(true);
  f.setBusy(false);
  t.mock.timers.tick(200);
  assert.equal(f.progress.hidden, true);
  assert.equal(f.nodes.status.textContent.startsWith('de:'), true);
});

test('browser export keeps bytes, numbering and cleanup; desktop cancellation propagates', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const oldCreate = URL.createObjectURL,
    oldRevoke = URL.revokeObjectURL,
    blobs = [],
    revoked = [];
  URL.createObjectURL = (blob) => {
    blobs.push(blob);
    return `blob:${blobs.length}`;
  };
  URL.revokeObjectURL = (u) => revoked.push(u);
  try {
    const f = fixture();
    await f.download(new Uint8Array([0, 255, 2]), 'a?.stl', 'x/test', { numbered: true });
    await f.download('abc', 'a?.stl', undefined, { numbered: true });
    assert.deepEqual(
      f.events.filter((e) => Array.isArray(e)),
      [
        ['click', 'a_.stl'],
        ['click', 'a_2.stl'],
      ],
    );
    assert.deepEqual([...new Uint8Array(await blobs[0].arrayBuffer())], [0, 255, 2]);
    t.mock.timers.tick(5000);
    assert.deepEqual(revoked, ['blob:1', 'blob:2']);
    let saved, canceled;
    const controller = new AbortController();
    const d = fixture({
      saveFile: (x) => {
        saved = x;
        controller.abort();
        return Promise.resolve({ saved: false, canceled: true });
      },
      cancelFileSave: (x) => {
        canceled = x;
        return Promise.resolve();
      },
    });
    assert.deepEqual(
      await d.download(new Uint8Array([1, 2]), 'a?.stl', undefined, { numbered: true, signal: controller.signal }),
      { saved: false, canceled: true },
    );
    assert.equal(saved.filename, 'a_.stl');
    assert.deepEqual([...saved.bytes], [1, 2]);
    assert.equal(saved.numbered, true);
    assert.equal(canceled.operationId, saved.operationId);
    assert.deepEqual(await d.download('x', 'x', undefined, { signal: controller.signal }), {
      saved: false,
      canceled: true,
    });
  } finally {
    URL.createObjectURL = oldCreate;
    URL.revokeObjectURL = oldRevoke;
  }
});
