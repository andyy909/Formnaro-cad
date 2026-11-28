import test from 'node:test';
import { importStepWorldTree } from './fixtures/cad-step-world-tree.mjs';
import assert from 'node:assert/strict';
import { loadCadKernel } from '../src/cad-kernel-loader.js';
import { buildCadRecipe } from '../src/cad-recipes.js';
import { transformCad } from '../src/cad-native-kernel.js';
import { exportCadStep } from '../src/cad-step-io.js';

// D2: the optional assembly path writes exactly one named XCAF assembly node
// above separately named part labels. Every part keeps its already verified,
// placed shape with an identity occurrence location, so the part position lives
// in the body itself and no local occurrence transform is added here.
// D3: `assemblyTree` extends that path with nested nodes whose leaves address
// parts by index. Parts stay world-placed, occurrences stay identity; real
// definitions, occurrences and local placements are D4.
const oc = await loadCadKernel({ print: () => {}, printErr: () => {} });

function fixture() {
  const plate = buildCadRecipe(oc, { type: 'box', size: [100, 60, 5] }),
    bearing = transformCad(
      oc,
      buildCadRecipe(oc, { type: 'box', size: [10, 6, 4] }),
      [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 40, 0, 2, 1],
    );
  return {
    plate,
    bearing,
    parts: [
      { shape: plate, name: 'Grundplatte', color: '#cc3322', opacity: 1 },
      { shape: bearing, name: 'Lager', color: '#2277cc', opacity: 1 },
    ],
    close() {
      plate.delete();
      bearing.delete();
    },
  };
}

// Reference assembly: base plate in world position, a "Antrieb" subassembly and
// two same-named bearings that sit apart in world space (drive translated to
// x=40 and rotated 90 degrees, bearings at local x=0 and x=12, so the world
// offset is 12 mm along Y). D3 parts are already placed, so the fixture bakes
// exactly those world positions into the bodies.
function nestedFixture() {
  const plate = buildCadRecipe(oc, { type: 'box', size: [100, 60, 5] }),
    bearing = (x, y) =>
      transformCad(oc, buildCadRecipe(oc, { type: 'box', size: [10, 6, 4] }), [
        1,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1,
        0,
        x,
        y,
        2,
        1,
      ]),
    bearing1 = bearing(40, 0),
    bearing2 = bearing(40, 12);
  return {
    plate,
    bearing1,
    bearing2,
    parts: [
      { shape: plate, name: 'Grundplatte', color: '#cc3322', opacity: 1 },
      { shape: bearing1, name: 'Lager', color: '#2277cc', opacity: 1 },
      { shape: bearing2, name: 'Lager', color: '#2277cc', opacity: 1 },
    ],
    tree: {
      name: 'Prüfbaugruppe',
      children: [{ partIndex: 0 }, { name: 'Antrieb', children: [{ partIndex: 1 }, { partIndex: 2 }] }],
    },
    close() {
      for (const shape of [plate, bearing1, bearing2]) shape.delete();
    },
  };
}

const near = (actual, expected, message) =>
    assert.ok(Math.abs(actual - expected) < 1e-5, message ?? `${actual} != ${expected}`),
  nearBounds = (stats, min, max) => {
    min.forEach((value, index) => near(stats.bounds.min[index], value, `min[${index}]`));
    max.forEach((value, index) => near(stats.bounds.max[index], value, `max[${index}]`));
  },
  colors = (nodes) => nodes.map((node) => node.appearance);

test('Nested assembly export writes named subassemblies over separately named, placed parts', () => {
  const f = nestedFixture();
  try {
    const bytes = exportCadStep(oc, f.parts, { assemblyTree: f.tree }),
      text = new TextDecoder().decode(bytes),
      tree = importStepWorldTree(oc, bytes);
    assert.equal(tree.length, 1, 'genau eine Baugruppenwurzel');
    const root = tree[0];
    assert.equal(root.name, 'Prüfbaugruppe');
    assert.equal(root.children.length, 2);
    assert.deepEqual(
      root.children.map((child) => child.name),
      ['Grundplatte', 'Antrieb'],
    );
    // Assembly nodes are organisation only: no body, no merged geometry.
    assert.equal(root.stats, undefined);
    assert.deepEqual(root.appearance, {});
    near(root.children[0].stats.volume, 100 * 60 * 5);

    const drive = root.children[1];
    assert.equal(drive.stats, undefined);
    assert.deepEqual(drive.appearance, {});
    // Two same-named bearings stay two distinct occurrences with separate bodies.
    assert.deepEqual(
      drive.children.map((child) => child.name),
      ['Lager', 'Lager'],
    );
    const [bearing1, bearing2] = drive.children;
    near(bearing1.stats.volume, 10 * 6 * 4);
    near(bearing2.stats.volume, 10 * 6 * 4);
    // Identity occurrence placement keeps the authored world positions unchanged.
    nearBounds(bearing1.stats, [35, -3, 0], [45, 3, 4]);
    nearBounds(bearing2.stats, [35, 9, 0], [45, 15, 4]);
    near(bearing2.stats.bounds.min[1] - bearing1.stats.bounds.min[1], 12, 'getrennte Lage bleibt 12 mm');
    nearBounds(root.children[0].stats, [-50, -30, -2.5], [50, 30, 2.5]);
    assert.deepEqual(colors([root.children[0], bearing1, bearing2]), [
      { color: '#cc3322', opacity: 1 },
      { color: '#2277cc', opacity: 1 },
      { color: '#2277cc', opacity: 1 },
    ]);

    // One PRODUCT for each assembly and each part definition, plus three part
    // usages and one subassembly usage, all with identity locations.
    assert.equal([...text.matchAll(/PRODUCT\(/g)].length, 5, 'zwei Baugruppen und drei Teile');
    assert.equal(
      [...text.matchAll(/NEXT_ASSEMBLY_USAGE_OCCURRENCE\(/g)].length,
      4,
      'drei Teile und eine Unterbaugruppe',
    );
    assert.doesNotMatch(text, /TRIANGULATED_FACE|TESSELLATED_SHAPE|POLYGONAL_FACE_SET/);
  } finally {
    f.close();
  }
});

test('Nested tree accepts twelve entries deep and rejects a thirteenth level', () => {
  const f = nestedFixture();
  try {
    // Twelve entries deep: eleven assembly nodes, the three parts on level 12.
    let tree = { name: 'Ebene 11', children: [0, 1, 2].map((partIndex) => ({ partIndex })) };
    for (let level = 10; level >= 1; level--) tree = { name: `Ebene ${level}`, children: [tree] };
    const round = importStepWorldTree(oc, exportCadStep(oc, f.parts, { assemblyTree: tree }));
    let node = round[0];
    for (let level = 1; level < 11; level++) {
      assert.equal(node.name, `Ebene ${level}`);
      assert.equal(node.children.length, 1);
      node = node.children[0];
    }
    assert.equal(node.name, 'Ebene 11');
    assert.deepEqual(
      node.children.map((child) => child.name),
      ['Grundplatte', 'Lager', 'Lager'],
    );

    // A twelfth assembly node would place its parts on level 13, past the
    // reader limit and the writer's matching import-compatible bound.
    let tooDeep = { name: 'Ebene 12', children: [{ partIndex: 0 }, { partIndex: 1 }, { partIndex: 2 }] };
    for (let level = 11; level >= 1; level--) tooDeep = { name: `Ebene ${level}`, children: [tooDeep] };
    assert.throws(() => exportCadStep(oc, f.parts, { assemblyTree: tooDeep }), /12 Ebenen/);
  } finally {
    f.close();
  }
});

test('Nested tree validation rejects empty, duplicated, missing and cyclic branches', () => {
  const f = fixture();
  try {
    const parts = f.parts,
      empty = { name: 'Leer', children: [] },
      missing = { name: 'Teilbaum', children: [{ partIndex: 0 }] },
      duplicated = { name: 'Teilbaum', children: [{ partIndex: 1 }, { partIndex: 1 }] },
      unknown = { name: 'Teilbaum', children: [{ partIndex: 2 }, { partIndex: 0 }] },
      fractional = { name: 'Teilbaum', children: [{ partIndex: 0.5 }, { partIndex: 1 }] },
      extraKey = { name: 'Teilbaum', children: [{ partIndex: 0, name: 'x' }, { partIndex: 1 }] },
      badShape = { name: 'Teilbaum', children: [{ partIndex: 0 }, { partIndex: 1 }], extra: true },
      barePart = { partIndex: 0 },
      cycle = { name: 'Zyklus', children: [] };
    cycle.children.push({ partIndex: 0 }, cycle);

    assert.throws(() => exportCadStep(oc, parts, { assemblyTree: empty }), /leeren Ast/);
    assert.throws(() => exportCadStep(oc, parts, { assemblyTree: missing }), /genau einmal/);
    assert.throws(() => exportCadStep(oc, parts, { assemblyTree: duplicated }), /genau einmal/);
    assert.throws(() => exportCadStep(oc, parts, { assemblyTree: unknown }), /unbekannten Teil/);
    assert.throws(() => exportCadStep(oc, parts, { assemblyTree: fractional }), /Ungültiger STEP-Baugruppenbaum/);
    assert.throws(() => exportCadStep(oc, parts, { assemblyTree: extraKey }), /Ungültiger STEP-Baugruppenbaum/);
    assert.throws(() => exportCadStep(oc, parts, { assemblyTree: badShape }), /Ungültiger STEP-Baugruppenbaum/);
    assert.throws(() => exportCadStep(oc, parts, { assemblyTree: barePart }), /STEP-Baugruppenname/);
    assert.throws(() => exportCadStep(oc, parts, { assemblyTree: cycle }), /Zyklus/);
    for (const assemblyTree of [null, 'Baum', [], 7])
      assert.throws(() => exportCadStep(oc, parts, { assemblyTree }), /Ungültiger STEP-Baugruppenbaum/);
  } finally {
    f.close();
  }
});

test('Nested tree names are validated before any XCAF work', () => {
  const f = fixture();
  try {
    for (const name of ['', '   ', 'x'.repeat(1001), 42, undefined])
      assert.throws(
        () =>
          exportCadStep(oc, f.parts, {
            assemblyTree: { name: 'Wurzel', children: [{ name, children: [{ partIndex: 0 }, { partIndex: 1 }] }] },
          }),
        /STEP-Baugruppenname/,
      );
    assert.throws(
      () =>
        exportCadStep(oc, f.parts, {
          assemblyName: 'Prüfbaugruppe',
          assemblyTree: { name: 'Prüfbaugruppe', children: [{ partIndex: 0 }, { partIndex: 1 }] },
        }),
      /entweder Namen oder Baum/,
    );
  } finally {
    f.close();
  }
});

test('Named assembly export writes one XCAF node over separately named, placed and coloured parts', () => {
  const f = fixture();
  try {
    const bytes = exportCadStep(oc, f.parts, { assemblyName: 'Prüfbaugruppe' }),
      text = new TextDecoder().decode(bytes),
      tree = importStepWorldTree(oc, bytes);
    assert.equal(tree.length, 1, 'genau eine Baugruppenwurzel');
    const root = tree[0];
    assert.equal(root.name, 'Prüfbaugruppe');
    assert.equal(root.children.length, 2);
    assert.deepEqual(
      root.children.map((child) => child.name),
      ['Grundplatte', 'Lager'],
    );
    // The assembly label is organisation only: no body, no merged geometry.
    assert.equal(root.stats, undefined);
    assert.deepEqual(root.appearance, {});
    assert.ok(root.children.every((child) => !child.children));

    const [plate, bearing] = root.children;
    near(plate.stats.volume, 100 * 60 * 5);
    near(bearing.stats.volume, 10 * 6 * 4);
    // Identity occurrence placement keeps the authored positions unchanged.
    nearBounds(plate.stats, [-50, -30, -2.5], [50, 30, 2.5]);
    nearBounds(bearing.stats, [35, -3, 0], [45, 3, 4]);
    assert.deepEqual(colors(root.children), [
      { color: '#cc3322', opacity: 1 },
      { color: '#2277cc', opacity: 1 },
    ]);

    // One PRODUCT for the assembly and one per separate part definition, plus
    // exactly two assembly usages with identity locations.
    assert.equal([...text.matchAll(/PRODUCT\(/g)].length, 3, 'Baugruppe und zwei getrennte Teile');
    assert.equal([...text.matchAll(/NEXT_ASSEMBLY_USAGE_OCCURRENCE\(/g)].length, 2, 'zwei Vorkommen');
    assert.doesNotMatch(text, /TRIANGULATED_FACE|TESSELLATED_SHAPE|POLYGONAL_FACE_SET/);
  } finally {
    f.close();
  }
});

test('Flat export stays unchanged without an assembly name', () => {
  const f = fixture();
  try {
    const flatBytes = exportCadStep(oc, f.parts),
      explicitBytes = exportCadStep(oc, f.parts, {});
    for (const bytes of [flatBytes, explicitBytes]) {
      const tree = importStepWorldTree(oc, bytes);
      assert.deepEqual(
        tree.map((node) => node.name),
        ['Grundplatte', 'Lager'],
      );
      assert.ok(tree.every((node) => !node.children));
      assert.deepEqual(colors(tree), [
        { color: '#cc3322', opacity: 1 },
        { color: '#2277cc', opacity: 1 },
      ]);
      assert.equal([...new TextDecoder().decode(bytes).matchAll(/PRODUCT\(/g)].length, 2);
    }
  } finally {
    f.close();
  }
});

test('Assembly name is validated before any XCAF work', () => {
  const f = fixture();
  try {
    for (const assemblyName of ['', 'x'.repeat(1001), 42, null])
      assert.throws(() => exportCadStep(oc, f.parts, { assemblyName }), /STEP-Baugruppenname/);
    assert.throws(() => exportCadStep(oc, [], { assemblyName: 'Prüfbaugruppe' }), /mindestens einen/);
    assert.throws(
      () => exportCadStep(oc, [], { assemblyTree: { name: 'Prüfbaugruppe', children: [{ partIndex: 0 }] } }),
      /mindestens einen/,
    );
  } finally {
    f.close();
  }
});
