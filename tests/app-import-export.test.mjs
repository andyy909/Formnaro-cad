import assert from 'node:assert/strict';
import test from 'node:test';
import { createImportExport } from '../src/app/import-export.js';

test('an SVG import stops before preview if the workspace changes while reading', async () => {
  let domainRevision = 1;
  const { importFile } = createImportExport({
    controller: {
      revision: () => 5,
      preview: () => assert.fail('A stale import must not open a preview'),
    },
    activeEasyKind: () => null,
    project: () => ({}),
    state: {
      get easyDomainRevision() {
        return domainRevision;
      },
    },
  });
  const file = {
    name: 'part.svg',
    async text() {
      domainRevision++;
      return '<svg/>';
    },
  };

  await assert.rejects(importFile(file, { asMesh: true }), { name: 'AbortError' });
});

test('a canceled drawing export releases the held revision without writing', async () => {
  const held = [];
  const { saveDrawingExport } = createImportExport({
    controller: {
      revision: () => 7,
      holdRevision(revision) {
        held.push(revision);
        return () => held.push('released');
      },
      assertExportReady: () => assert.fail('Canceled drawing export must not inspect geometry'),
    },
    download: () => assert.fail('Canceled drawing export must not write a file'),
  });

  assert.deepEqual(await saveDrawingExport({ format: 'pdf', signal: AbortSignal.abort() }), {
    saved: false,
    canceled: true,
  });
  assert.deepEqual(held, [7, 'released']);
});

test('direct STL-to-CAD reconstruction forwards the chosen repair option', async (t) => {
  const oldWindow = globalThis.window;
  t.after(() => { if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow; });
  const calls = [];
  const step = Uint8Array.of(1, 2, 3);
  globalThis.window = { offlinecadDesktop: {
    async convertStl(request) {
      calls.push(request);
      return { bytes: step, report: {
        version: '0.10.0', input_triangles: 2, output_faces: 1, solids: 1,
        bodies: [{ method: 'test', stage: 'native' }], options: { tolerance: 0.15 },
      } };
    },
  } };
  const busy = [];
  const state = { easyDomainRevision: 0, localStlSequence: 0 };
  const { importFile } = createImportExport({
    controller: {
      revision: () => 5,
      preview: (request, { revision }) => {
        assert.equal(revision, 5);
        assert.equal(request.kind, 'importStep');
        assert.deepEqual(request.bytes, step);
        return { previewId: 'stl-preview' };
      },
    },
    activeEasyKind: () => null,
    project: () => ({ activeLayerId: 'default', activeFolderId: null }),
    state,
    workFrame: () => [],
    setBusy: (value) => busy.push(value),
    placeImportedProposal: (proposal, check) => { check(); return proposal.previewId; },
  });
  const file = new File([Uint8Array.of(9)], 'body.stl');
  assert.equal(await importFile(file, { reconstruct: true, repair: true, unit: 10 }), 'stl-preview');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].options, { repair: true, unit: 10, tolerance: 0.15, mode: 'auto', fallback: true });
  assert.deepEqual(busy, [true, false]);
  assert.equal(state.localStlTask, null);
});
