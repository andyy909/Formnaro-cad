import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { getRawHeader } from '@electron/asar';

function layout(archive, bytes) {
  const { header, headerSize } = getRawHeader(archive);
  const entries = [];
  function visit(node) {
    if (node.files) {
      for (const child of Object.values(node.files)) visit(child);
      return;
    }
    if (node.size === 0 || node.offset === undefined) return;
    const offset = 8 + headerSize + Number(node.offset);
    const hash = createHash('sha256')
      .update(bytes.subarray(offset, offset + node.size))
      .digest('hex');
    entries.push({ offset, size: node.size, hash });
  }
  visit(header);
  return entries.sort((a, b) => a.offset - b.offset);
}

// Records are either a source range (1, offset, size) or literal bytes (0, size, payload).
// Matching by content also reuses Vite assets whose names changed.
export function makeLabDelta(base, target, output) {
  const before = fs.readFileSync(base),
    after = fs.readFileSync(target);
  if (Math.max(before.length, after.length) >= 2 ** 31) throw Error('Archive exceeds patch format size.');
  const reuse = new Map(layout(base, before).map((row) => [row.hash, row]));
  let cursor = 0;
  const chunks = [Buffer.from('FNLAB001')];
  function literal(end) {
    if (cursor === end) return;
    const record = Buffer.alloc(5);
    record.writeInt32LE(end - cursor, 1);
    chunks.push(record, after.subarray(cursor, end));
    cursor = end;
  }
  for (const entry of layout(target, after)) {
    // ASAR writers may share a payload offset between multiple directory entries.
    if (entry.offset < cursor) continue;
    const old = reuse.get(entry.hash);
    if (!old) continue;
    literal(entry.offset);
    const record = Buffer.alloc(9);
    record[0] = 1;
    record.writeInt32LE(old.offset, 1);
    record.writeInt32LE(old.size, 5);
    chunks.push(record);
    cursor += old.size;
  }
  literal(after.length);
  const delta = Buffer.concat(chunks),
    hash = createHash('sha256');
  let position = 8,
    restored = 0;
  while (position < delta.length) {
    const type = delta[position++];
    const offset = type === 1 ? delta.readInt32LE(position) : 0;
    if (type === 1) position += 4;
    const size = delta.readInt32LE(position);
    position += 4;
    const data = type === 1 ? before.subarray(offset, offset + size) : delta.subarray(position, position + size);
    if (size <= 0 || size !== data.length || type > 1) throw Error('Invalid lab patch record.');
    if (type === 0) position += size;
    hash.update(data);
    restored += size;
  }
  if (restored !== after.length || hash.digest('hex') !== createHash('sha256').update(after).digest('hex'))
    throw Error('Lab patch round-trip differs from the compiled archive.');
  fs.writeFileSync(output, delta);
}
