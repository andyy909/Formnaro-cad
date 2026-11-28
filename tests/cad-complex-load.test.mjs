import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCadKernel } from '../src/cad-kernel-loader.js';
import {
  brepHasNoTriangulation,
  cadBoolean,
  readCadBrep,
  transformCad,
  validateCadSolid,
} from '../src/cad-native-kernel.js';
import { buildCadRecipe } from '../src/cad-recipes.js';
import { exportCadStep, importCadStep } from '../src/cad-step-io.js';

const oc = await loadCadKernel({ print: () => {}, printErr: () => {} });

function cylinder(radius, height, center) {
  const shape = buildCadRecipe(oc, { type: 'cylinder', size: [2 * radius, 2 * radius, height] });
  try {
    return transformCad(oc, shape, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, ...center, 1]);
  } finally {
    shape.delete();
  }
}

function assertNear(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) <= 1e-6, label + ': ' + actual + ' versus ' + expected);
}

test('32 consecutive native booleans keep a perforated plate with bosses a valid single solid', () => {
  const thickness = 8;
  const holeRadius = 2;
  const bossRadius = 3;
  const bossRise = 4;
  let plate = buildCadRecipe(oc, { type: 'box', size: [80, 48, thickness] });
  let expectedVolume = 80 * 48 * thickness;
  let operationCount = 0;

  function apply(operation, tool, volumeChange) {
    try {
      const next = cadBoolean(oc, operation, plate, tool);
      plate.delete();
      plate = next;
      expectedVolume += volumeChange;
      const label = operation + ' ' + ++operationCount;
      const checked = validateCadSolid(oc, plate);
      assert.equal(checked.solids, 1, label);
      assertNear(checked.volume, expectedVolume, label);
    } finally {
      tool.delete();
    }
  }

  try {
    for (let column = 0; column < 8; column++) {
      const x = -35 + column * 10;
      for (const y of [-10, 0, 10]) {
        apply('difference', cylinder(holeRadius, thickness + 2, [x, y, 0]), -Math.PI * holeRadius ** 2 * thickness);
      }
      // Overlap the plate by 1 mm so every boss joins the same solid.
      apply('union', cylinder(bossRadius, bossRise + 1, [x, 19, 5.5]), Math.PI * bossRadius ** 2 * bossRise);
    }

    assert.equal(operationCount, 32);
    const { bounds } = validateCadSolid(oc, plate);
    [80, 48, thickness + bossRise].forEach((size, axis) => assertNear(bounds.size[axis], size, 'plate bounds ' + axis));
  } finally {
    plate.delete();
  }
});

test('Native STEP roundtrip preserves the dimensions and placements of 160 analytic solids', () => {
  const parts = [];
  const expected = [];
  let reopened;
  try {
    for (let index = 0; index < 160; index++) {
      const radius = 2 + (index % 7) / 2;
      const height = 3 + (index % 9);
      const center = [index * 16, (index % 4) * 12, index % 3];
      const shape = cylinder(radius, height, center);
      parts.push({ shape, name: 'Pin ' + (index + 1) });
      expected.push({ center, size: [2 * radius, 2 * radius, height], volume: Math.PI * radius ** 2 * height });
    }

    const bytes = exportCadStep(oc, parts, { assemblyName: 'Pin inventory' });
    const step = new TextDecoder().decode(bytes);
    assert.match(step, /^ISO-10303-21;/);
    assert.equal(step.match(/\bCYLINDRICAL_SURFACE\(/g)?.length, parts.length);

    const imported = importCadStep(oc, bytes);
    assert.equal(imported.stats.solids, parts.length);
    assertNear(
      imported.stats.volume,
      expected.reduce((sum, part) => sum + part.volume, 0),
      'assembly volume',
    );
    assert.ok(brepHasNoTriangulation(imported.brep.data));

    reopened = readCadBrep(oc, imported.brep.data);
    const explorer = new oc.TopExp_Explorer(reopened, oc.TopAbs_ShapeEnum.TopAbs_SOLID);
    const actual = [];
    try {
      while (explorer.More()) {
        const solid = explorer.Current();
        try {
          actual.push(validateCadSolid(oc, solid));
        } finally {
          solid.delete();
        }
        explorer.Next();
      }
    } finally {
      explorer.delete();
    }

    actual.sort((a, b) => a.bounds.center[0] - b.bounds.center[0]);
    assert.equal(actual.length, expected.length);
    for (const [index, part] of expected.entries()) {
      const checked = actual[index];
      const label = parts[index].name;
      assertNear(checked.volume, part.volume, label + ' volume');
      for (let axis = 0; axis < 3; axis++) {
        assertNear(checked.bounds.center[axis], part.center[axis], label + ' center ' + axis);
        assertNear(checked.bounds.size[axis], part.size[axis], label + ' size ' + axis);
      }
    }
  } finally {
    reopened?.delete();
    for (const { shape } of parts) shape.delete();
  }
});
