const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
const { createStlConverter } = require('../backend/stl-converter.cjs');
const fixture = path.resolve(__dirname, 'fixtures/n03b-outer-skin-process.cjs');
const args = (variant) => {
  const target = { valid: 500, method: 501, neighbourhood: 502, budget: 503, raw: 504, skinover: 505, abort: 506 }[variant];
  return {
    id: 'outer-skin',
    name: 'Halter.stl',
    bytes: new Uint8Array([1, 2, 3]),
    options: { unit: 1, tolerance: 0.15, mode: 'auto', rounds: 'keep', repair: true, fallback: true, samples: 6000, target_faces: target },
  };
};
async function context() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'formnaro-outer-skin-'));
  return {
    root,
    runner: createStlConverter({ command: process.execPath, prefix: [fixture], tempRoot: root }),
    dispose: () => fs.rm(root, { recursive: true, force: true }),
  };
}

test('N03-B outer-skin decision is accepted with raw values and method, area and neighbourhood', async () => {
  const c = await context();
  try {
    const value = await c.runner.convert(args('valid'));
    const admission = value.report.repairs.admission;
    assert.equal(admission.measurement.decided_by, 'outer-skin');
    assert.equal(admission.measurement.outer_skin.method, 'outer-skin-v1');
    assert.equal(admission.measurement.outer_skin.excluded_neighbourhood_mm, 0.5);
    assert.equal(admission.measurement.outer_skin.excluded_faces, 4);
    assert.equal(admission.measurement.raw.directions.original_to_repaired.max_mm, 3);
    assert.deepEqual(await fs.readdir(c.root), []);
  } finally {
    await c.dispose();
  }
});

test('N03-B a foreign method, another neighbourhood or budget is refused', async () => {
  const c = await context();
  try {
    await assert.rejects(c.runner.convert(args('method')), /outer-skin-v1/);
    await assert.rejects(c.runner.convert(args('neighbourhood')), /Nachbarschaft 0,5 mm/);
    await assert.rejects(c.runner.convert(args('budget')), /Schwelle 0\.2 mm/);
    assert.deepEqual(await fs.readdir(c.root), []);
  } finally {
    await c.dispose();
  }
});

test('N03-B a missing raw comparison or a skin value over the budget is refused', async () => {
  const c = await context();
  try {
    await assert.rejects(c.runner.convert(args('raw')), /Rohvergleich in Richtung Original→Reparatur/);
    await assert.rejects(c.runner.convert(args('skinover')), /Formabweichung 0\.300000 mm/);
    assert.deepEqual(await fs.readdir(c.root), []);
  } finally {
    await c.dispose();
  }
});
