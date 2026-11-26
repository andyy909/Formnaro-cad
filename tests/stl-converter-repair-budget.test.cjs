const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  crypto = require('node:crypto');
const { createStlConverter } = require('../backend/stl-converter.cjs');
const fixture = path.resolve(__dirname, 'fixtures/stl-repair-gate-process.cjs');
const args = (options) => ({ id: 'repair-gate', name: 'Haltér.stl', bytes: new Uint8Array([1, 2, 3]), options });
async function context() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'formnaro-repair-gate-'));
  return {
    root,
    runner: createStlConverter({ command: process.execPath, prefix: [fixture], tempRoot: root }),
    dispose: () => fs.rm(root, { recursive: true, force: true }),
  };
}

test('N03-01/02/04 admitted repair keeps threshold, both directions and the Fassung with input hash', async () => {
  const c = await context();
  try {
    const value = await c.runner.convert(
      args({
        unit: 1,
        tolerance: 0.15,
        mode: 'auto',
        rounds: 'keep',
        repair: true,
        fallback: true,
        samples: 6000,
        target_faces: 500,
      }),
    );
    const fassung = value.report.repair_fassung;
    assert.equal(fassung.id, 'a'.repeat(64));
    assert.equal(fassung.input, 'Haltér.stl');
    assert.match(fassung.input_sha256, /^[a-f0-9]{64}$/);
    assert.equal(
      fassung.input_sha256,
      crypto
        .createHash('sha256')
        .update(Buffer.from([1, 2, 3]))
        .digest('hex'),
    );
    assert.match(fassung.repaired_stl_sha256, /^[a-f0-9]{64}$/);
    assert.equal(value.report.repairs.admission.threshold_mm, 0.15);
    assert.equal(value.report.repairs.admission.measurement.directions.original_to_repaired.points, 24000);
    assert.deepEqual(await fs.readdir(c.root), []);
  } finally {
    await c.dispose();
  }
});

test('N03-03 a shifted repair region over the budget is refused with threshold, direction, sample and result', async () => {
  const c = await context();
  try {
    await assert.rejects(
      c.runner.convert(
        args({ unit: 1, tolerance: 0.15, mode: 'planar', rounds: 'keep', repair: true, fallback: true }),
      ),
      (error) => {
        assert.match(error.message, /Formabweichung 0\.300000 mm in Richtung Original→Reparatur/);
        assert.match(error.message, /Schwelle 0\.15 mm/);
        assert.match(error.message, /Stichprobe 24000 Punkte/);
        assert.match(error.message, /Lage \[1\.500, 2\.500, 3\.500\]/);
        return true;
      },
    );
    assert.deepEqual(await fs.readdir(c.root), []);
  } finally {
    await c.dispose();
  }
});

test('N03-03 a bridged opening is refused even when both sampled distances stay inside the budget', async () => {
  const c = await context();
  try {
    await assert.rejects(
      c.runner.convert(
        args({ unit: 1, tolerance: 0.15, mode: 'smooth', rounds: 'keep', repair: true, fallback: true }),
      ),
      /Eine Öffnung wurde überbrückt \(Löcher 2→0, Randkanten 8→0\)/,
    );
    assert.deepEqual(await fs.readdir(c.root), []);
  } finally {
    await c.dispose();
  }
});

test('Repair report without Fassung or with another threshold is refused', async () => {
  const c = await context();
  try {
    await assert.rejects(
      c.runner.convert(args({ unit: 1, tolerance: 0.15, mode: 'exact', rounds: 'keep', repair: true, fallback: true })),
      /Fassungskennung/,
    );
    await assert.rejects(
      c.runner.convert(
        args({ unit: 1, tolerance: 0.15, mode: 'auto', rounds: 'chamfer', repair: true, fallback: true }),
      ),
      /prüft die Schwelle 0\.2 mm/,
    );
    assert.deepEqual(await fs.readdir(c.root), []);
  } finally {
    await c.dispose();
  }
});

test('One missing surface direction is refused instead of displayed as a repair', async () => {
  const c = await context();
  try {
    await assert.rejects(
      c.runner.convert(args({ unit: 1, tolerance: 0.15, mode: 'auto', rounds: 'keep', repair: true, fallback: false })),
      /in Richtung Reparatur→Original fehlt/,
    );
    assert.deepEqual(await fs.readdir(c.root), []);
  } finally {
    await c.dispose();
  }
});
