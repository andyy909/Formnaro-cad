import { posix } from 'node:path';

function durationMs({ seconds }) {
  return Number.isFinite(seconds) && seconds > 0 ? Math.max(1, Math.round(seconds * 1000)) : 1000;
}

export function selectNodeTests(manifest, { platform, includeFailing, shard, shardCount, balanceByDuration }) {
  const statuses = new Set(includeFailing ? ['pass', 'fail', 'timeout'] : ['pass']);
  const selected = manifest.filter(({ kind, status, os }) =>
    kind === 'node' && statuses.has(status) && (os !== 'windows' || platform === 'win32'),
  );
  const files = new Set();
  for (const { file } of selected) {
    if (typeof file !== 'string' || !file.startsWith('tests/') || file.includes('\\')
        || posix.normalize(file) !== file || !/\.test\.[cm]?js$/.test(file)) {
      throw new Error(`Invalid Node test path in tests/manifest.json: ${JSON.stringify(file)}`);
    }
    const key = platform === 'win32' ? file.toLowerCase() : file;
    if (files.has(key)) throw new Error(`Duplicate Node test path in tests/manifest.json: ${file}`);
    files.add(key);
  }

  let tests;
  if (balanceByDuration && shardCount > 1 && selected.length) {
    if (shardCount > selected.length) throw new Error('More shards than selected Node test files.');
    // Schedule longest files first, breaking ties by path and then by shard index.
    const byDuration = [...selected].sort((a, b) =>
      durationMs(b) - durationMs(a) || (a.file < b.file ? -1 : 1),
    );
    const loads = Array(shardCount).fill(0);
    const assignments = new Map();
    for (const entry of byDuration) {
      let lightest = 0;
      for (let index = 1; index < loads.length; index++) {
        if (loads[index] < loads[lightest]) lightest = index;
      }
      assignments.set(entry.file, lightest);
      loads[lightest] += durationMs(entry);
    }
    tests = selected.filter(({ file }) => assignments.get(file) === shard - 1);
  } else {
    tests = selected.filter((_, index) => index % shardCount === shard - 1);
  }
  return {
    tests,
    selectedCount: selected.length,
    estimatedSeconds: tests.reduce((ms, entry) => ms + durationMs(entry), 0) / 1000,
  };
}
