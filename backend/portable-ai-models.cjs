'use strict';
const fs = require('node:fs/promises');
const { createReadStream, createWriteStream } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pipeline } = require('node:stream/promises');

const IMPORTED_ID = /^formnaro-gguf-[0-9a-f]{32}$/;

async function inspectGGUF(file) {
  if (path.extname(file).toLowerCase() !== '.gguf') throw Error('Bitte eine .gguf-Modell-Datei auswählen.');
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Bitte eine reguläre GGUF-Datei auswählen.');
  const handle = await fs.open(file, 'r');
  try {
    const header = Buffer.alloc(24);
    const { bytesRead } = await handle.read(header);
    if (bytesRead !== header.length || header.toString('ascii', 0, 4) !== 'GGUF'
      || ![2, 3].includes(header.readUInt32LE(4)) || header.readBigUInt64LE(8) === 0n) {
      throw Error('Die Datei enthält kein unterstütztes GGUF-Modell.');
    }
  } finally { await handle.close(); }
  if (/-\d{5}-of-(?!00001)\d{5}\.gguf$/i.test(file)) {
    throw Error('Bitte ein GGUF-Textmodell wählen, das aus einer einzelnen Datei besteht.');
  }
  return stat;
}

function createImportedModels(directory) {
  const root = path.join(directory, 'Eigene Modelle');

  async function find(id) {
    if (!IMPORTED_ID.test(id)) return null;
    const folder = path.join(root, id);
    for (const candidate of [root, folder]) {
      const stat = await fs.lstat(candidate).catch(error => {
        if (error.code !== 'ENOENT') throw error;
        return null;
      });
      if (!stat?.isDirectory() || stat.isSymbolicLink()) return null;
    }
    const files = (await fs.readdir(folder)).filter(file => path.extname(file).toLowerCase() === '.gguf');
    if (files.length !== 1) return null;
    const target = path.join(folder, files[0]);
    await inspectGGUF(target);
    return { id, target, name: path.basename(target, path.extname(target)) };
  }

  async function add(file, { signal, checkSpace }) {
    const source = path.resolve(file);
    const origin = await inspectGGUF(source);
    const relative = path.relative(root, source).split(path.sep);
    const existing = relative.length === 2 && await find(relative[0]);
    if (existing?.target === source) return { ...existing, remove: async () => {} };

    await checkSpace(origin.size);
    signal.throwIfAborted();
    await fs.mkdir(root, { recursive: true });
    if ((await fs.lstat(root)).isSymbolicLink()) throw Error('Der Ordner für eigene Modelle muss im Formnaro-Datenordner liegen.');
    const id = 'formnaro-gguf-' + randomUUID().replaceAll('-', '');
    const folder = path.join(root, id);
    const target = path.join(folder, path.basename(source));
    const temporary = path.join(folder, '.import.part');
    await fs.mkdir(folder);
    const remove = async () => {
      await fs.unlink(temporary).catch(() => {});
      await fs.unlink(target).catch(() => {});
      await fs.rmdir(folder).catch(() => {});
    };
    try {
      await pipeline(createReadStream(source), createWriteStream(temporary, { flags: 'wx' }), { signal });
      const [copied, original] = await Promise.all([fs.stat(temporary), fs.stat(source)]);
      if (copied.size !== origin.size || original.size !== origin.size || original.mtimeMs !== origin.mtimeMs) {
        throw Error('Die Quelldatei wurde beim Kopieren verändert. Bitte erneut auswählen.');
      }
      signal.throwIfAborted();
      await fs.rename(temporary, target);
      await inspectGGUF(target);
      signal.throwIfAborted();
      return { id, target, name: path.basename(target, path.extname(target)), remove };
    } catch (error) {
      await remove();
      throw error;
    }
  }

  async function list() {
    const entries = await fs.readdir(root).catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return [];
    });
    return (await Promise.all(entries.map(id => find(id).catch(() => null)))).filter(Boolean);
  }

  return { find, add, list };
}

module.exports = { IMPORTED_ID, createImportedModels };
