import { posix } from 'node:path';
import { selectNodeTests } from './select-node-tests.mjs';

export const coveragePlatforms = ['win32', 'linux'];

export function validateInventory(discovered, manifest) {
  const present = new Map(discovered.map(({ file, kind }) => [file, kind]));
  const seen = new Set();
  const errors = [];
  const exclusions = [];
  const active = [];
  for (const { file, kind, status, os, note } of manifest) {
    if (typeof file !== 'string' || !file.startsWith('tests/') || /[\\:\u0000-\u001f]/.test(file)
        || posix.normalize(file) !== file || !posix.basename(file).includes('.test.')) {
      errors.push('Invalid test path: ' + JSON.stringify(file));
      continue;
    }
    const key = file.toLowerCase();
    if (seen.has(key)) errors.push('Duplicate manifest path: ' + file);
    seen.add(key);

    if (!['node', 'electron', 'python'].includes(kind)) errors.push('Invalid test kind: ' + file);
    if (present.has(file) && present.get(file) !== kind) {
      errors.push(`Test kind mismatch: ${file} is ${present.get(file)}, manifest declares ${kind}`);
    }
    if (os !== undefined && os !== 'windows') errors.push('Invalid test platform: ' + file);
    if (kind === 'node' && !/\.test\.[cm]?js$/.test(file)) errors.push('Invalid Node test path: ' + file);
    if (kind === 'node' && !['pass', 'fail', 'timeout', 'obsolete'].includes(status)) {
      errors.push('Unclassified Node test: ' + file);
    }

    if (status === 'obsolete' && present.has(file)) errors.push('Obsolete test still exists: ' + file);
    if (status !== 'obsolete' && !present.has(file)) errors.push('Manifest test file missing: ' + file);
    if (['obsolete', 'fail', 'timeout'].includes(status) && !(typeof note === 'string' && note.trim())) {
      errors.push('Test exception lacks a reason: ' + file);
    }

    if (status === 'obsolete' || kind !== 'node' || status !== 'pass') {
      exclusions.push({ file, reason: [kind, status, note].filter(Boolean).join(' · ') });
    } else {
      active.push({ file, os });
    }
  }
  const indexed = new Set(manifest.map(({ file }) => file));
  for (const file of present.keys()) {
    if (!indexed.has(file)) errors.push('Test missing from manifest: ' + file);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return { active, exclusions };
}

export function verifyPaths(expected, actual, label) {
  const expectedPaths = new Set(expected);
  const actualPaths = new Set();
  const errors = [];
  for (const file of actual) {
    if (actualPaths.has(file)) errors.push('duplicate ' + file);
    if (!expectedPaths.has(file)) errors.push('unexpected ' + file);
    actualPaths.add(file);
  }
  for (const file of expectedPaths) {
    if (!actualPaths.has(file)) errors.push('missing ' + file);
  }
  if (errors.length) throw new Error(label + ':\n' + errors.join('\n'));
}

export function planCoverage(discovered, manifest, { shardCount, balanceByDuration, durationProfile }) {
  const { active, exclusions } = validateInventory(discovered, manifest);
  const groups = new Map();
  for (const platform of coveragePlatforms) {
    const expected = active.filter(({ os }) => !os || platform === 'win32').map(({ file }) => file);
    const shards = Array.from({ length: shardCount }, (_, index) => selectNodeTests(manifest, {
      platform, shard: index + 1, shardCount, balanceByDuration, durationProfile,
    }).tests.map(({ file }) => file));
    verifyPaths(expected, shards.flat(), platform + ' test groups');
    groups.set(platform, { expected, shards });
  }
  return { groups, exclusions, windowsOnly: active.filter(({ os }) => os === 'windows').map(({ file }) => file) };
}
