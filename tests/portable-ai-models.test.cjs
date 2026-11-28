'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { IMPORTED_ID, createImportedModels } = require('../backend/portable-ai-models.cjs');

function ggufHeader() {
  const header = Buffer.alloc(24);
  header.write('GGUF');
  header.writeUInt32LE(3, 4);
  header.writeBigUInt64LE(1n, 8);
  return header;
}

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'formnaro-gguf-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, models: path.join(root, 'KI-Modelle') };
}

function importOptions(checkSpace = async () => {}) {
  return { signal: new AbortController().signal, checkSpace };
}

test('Copies a single-file GGUF and reopens it through a new model store', async t => {
  const { root, models } = await fixture(t);
  const source = path.join(root, 'Eigenes Modell.gguf');
  const bytes = Buffer.concat([ggufHeader(), Buffer.from('fixture')]);
  await fs.writeFile(source, bytes);
  const store = createImportedModels(models);
  assert.deepEqual(await store.list(), []);

  const imported = await store.add(source, importOptions(async size => {
    assert.equal(size, bytes.length);
  }));
  assert.match(imported.id, IMPORTED_ID);
  assert.equal(imported.target, path.join(models, 'Eigene Modelle', imported.id, path.basename(source)));
  assert.deepEqual(await fs.readFile(source), bytes);
  assert.deepEqual(await fs.readFile(imported.target), bytes);

  const reopened = createImportedModels(models);
  const saved = { id: imported.id, target: imported.target, name: 'Eigenes Modell' };
  assert.deepEqual(await reopened.find(imported.id), saved);
  assert.deepEqual(await reopened.list(), [saved]);

  const reused = await reopened.add(imported.target, importOptions(async () => {
    assert.fail('A managed file should not require another copy');
  }));
  assert.equal(reused.id, imported.id);
  assert.equal(reused.target, imported.target);
  await reused.remove();
  assert.deepEqual(await reopened.list(), [saved]);
});

test('Rejects malformed and split GGUF files, directories and path-like IDs', async t => {
  const { root, models } = await fixture(t);
  const store = createImportedModels(models);
  const invalid = path.join(root, 'broken.gguf');
  const shard = path.join(root, 'example-00001-of-00002.gguf');
  const folder = path.join(root, 'folder.gguf');
  await fs.writeFile(invalid, Buffer.from('GGUF'));
  await fs.writeFile(shard, ggufHeader());
  await fs.mkdir(folder);

  const options = importOptions(async () => assert.fail('An invalid file should not reach the copy step'));
  await assert.rejects(store.add(invalid, options), /kein unterstütztes GGUF-Modell/);
  await assert.rejects(store.add(shard, options), /einzelnen Datei/);
  await assert.rejects(store.add(folder, options), /reguläre GGUF-Datei/);
  for (const id of ['../broken', String.raw`..\\broken`, path.resolve(root, 'broken')]) {
    assert.equal(await store.find(id), null);
  }
  assert.deepEqual(await store.list(), []);
});

test('Aborted import preserves the external source and prior model without a partial file', async t => {
  const { root, models } = await fixture(t);
  const store = createImportedModels(models);
  const original = path.join(root, 'original.gguf');
  const next = path.join(root, 'next.gguf');
  const bytes = ggufHeader();
  await fs.writeFile(original, bytes);
  await fs.writeFile(next, bytes);
  const saved = await store.add(original, importOptions());
  const controller = new AbortController();
  await assert.rejects(store.add(next, {
    signal: controller.signal,
    checkSpace: async () => controller.abort(),
  }), { name: 'AbortError' });

  assert.deepEqual(await fs.readFile(next), bytes);
  assert.deepEqual(await fs.readFile(saved.target), bytes);
  assert.deepEqual(await fs.readdir(path.join(models, 'Eigene Modelle')), [saved.id]);
  assert.deepEqual(await fs.readdir(path.dirname(saved.target)), [path.basename(saved.target)]);
});
