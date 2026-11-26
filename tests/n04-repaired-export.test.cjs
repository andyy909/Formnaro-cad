const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
const { createStlConverter } = require('../backend/stl-converter.cjs');
const fixture = path.resolve(__dirname, 'fixtures/n03b-outer-skin-process.cjs');
const failedFixture = path.resolve(__dirname, 'fixtures/n04b-step-failed-process.cjs');
const args = (target_faces) => ({
  id: 'n04-export',
  name: 'Halter.stl',
  bytes: new Uint8Array([1, 2, 3]),
  options: { unit: 1, tolerance: 0.15, mode: 'auto', rounds: 'keep', repair: true, fallback: true, samples: 6000, target_faces },
});
async function context(fixtureModule = fixture) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'formnaro-n04-export-'));
  return {
    root,
    runner: createStlConverter({ command: process.execPath, prefix: [fixtureModule], tempRoot: root }),
    dispose: () => fs.rm(root, { recursive: true, force: true }),
  };
}

test('N04 repaired 3MF is hash-checked and reported next to the repaired STL', async () => {
  const c = await context();
  try {
    const value = await c.runner.convert(args(500));
    assert.equal(value.report.repaired_mesh, 'Halter.repariert.stl');
    assert.equal(value.report.repaired_3mf, 'Halter.repariert.3mf');
    assert.equal(Buffer.from(value.artifacts.repaired_3mf).toString(), 'repaired-3mf-package');
    assert.equal(Buffer.from(value.artifacts.repaired_stl).toString(), 'repaired-stl');
    assert.match(value.report.repair_fassung.repaired_stl_sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(await fs.readdir(c.root), []);
  } finally {
    await c.dispose();
  }
});

test('N04 an unaccepted repair leaves no accepted export and no files behind', async () => {
  const c = await context();
  try {
    await assert.rejects(c.runner.convert(args(506)), /Reparatur abgelehnt/);
    assert.deepEqual(await fs.readdir(c.root), []);
  } finally {
    await c.dispose();
  }
});

test('N04-B a confirmed repair survives a failed STEP without being a STEP result', async () => {
  const c = await context(failedFixture);
  try {
    const value = await c.runner.convert(args(500));
    assert.equal(value.repairOnly, true);
    assert.equal(value.bytes, null);
    assert.equal(value.deviation, null);
    assert.equal(value.report.step.status, 'failed');
    assert.match(value.report.step.message, /STEP-Aufbau im Test fehlgeschlagen/);
    assert.equal(value.report.output, null);
    assert.equal(value.report.status, 'repair_only');
    assert.equal(value.report.repaired_mesh, 'Halter.repariert.stl');
    assert.equal(value.report.repaired_3mf, 'Halter.repariert.3mf');
    assert.equal(value.report.preview, null);
    assert.equal(Buffer.from(value.artifacts.repaired_stl).toString(), 'repaired-stl-after-step-failure');
    assert.equal(Buffer.from(value.artifacts.repaired_3mf).toString(), 'repaired-3mf-after-step-failure');
    assert.ok(!('preview' in value.artifacts));
    assert.match(value.report.repair_fassung.repaired_stl_sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(await fs.readdir(c.root), []);
  } finally {
    await c.dispose();
  }
});

test('N04-B a manipulated repair file is refused', async () => {
  const c = await context(failedFixture);
  try {
    await assert.rejects(c.runner.convert(args(507)), /Netzdatei konnte nicht bestätigt werden/);
    assert.deepEqual(await fs.readdir(c.root), []);
  } finally {
    await c.dispose();
  }
});

test('N04-B a missing repair file is refused', async () => {
  const c = await context(failedFixture);
  try {
    await assert.rejects(c.runner.convert(args(508)), /Reparaturdateien fehlen/);
    assert.deepEqual(await fs.readdir(c.root), []);
  } finally {
    await c.dispose();
  }
});

test('N04-B an unconfirmed repair stays a plain conversion error', async () => {
  const c = await context(failedFixture);
  try {
    await assert.rejects(c.runner.convert(args(506)), /STEP-Aufbau im Test fehlgeschlagen/);
    assert.deepEqual(await fs.readdir(c.root), []);
  } finally {
    await c.dispose();
  }
});

test('N04-B a repair admission for a different threshold is refused', async () => {
  const c = await context(failedFixture);
  try {
    await assert.rejects(c.runner.convert(args(509)), /Schwelle 0.2 mm/);
    assert.deepEqual(await fs.readdir(c.root), []);
  } finally {
    await c.dispose();
  }
});
