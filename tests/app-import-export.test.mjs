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
