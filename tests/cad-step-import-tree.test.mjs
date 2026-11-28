import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCadKernel } from '../src/cad-kernel-loader.js';
import { buildCadRecipe } from '../src/cad-recipes.js';
import { readCadBrep, transformCad, writeCadBrep } from '../src/cad-native-kernel.js';
import { importCadStepTree } from '../src/cad-step-io.js';
import { planCadStepImportTree, stepColumnMajorTransform, composeStepTransforms } from '../src/cad-step-import-tree.js';

// B5: the reader contract is checked independently of the installed bridge.
// A synthetic document supplies the native occurrence fields (native definition
// id, occurrence path, one row-major 3x4 placement per node) while the current
// old kernel still reads and validates the local BRep bytes. The real fixture
// covers the world-baked fallback of an older runtime.
const oc = await loadCadKernel({ print: () => {}, printErr: () => {} }),
  IDENTITY_3X4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
  IDENTITY_4X4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  // 90 degrees about Z translated to x=40, as written by the native bridge.
  DRIVE_3X4 = [0, -1, 0, 40, 1, 0, 0, 0, 0, 0, 1, 0],
  // The second bearing occurrence sits 12 mm along its local X axis.
  BEARING_OFFSET_3X4 = [1, 0, 0, 12, 0, 1, 0, 0, 0, 0, 1, 0],
  near = (actual, expected, message) =>
    assert.ok(Math.abs(actual - expected) < 1e-6, message ?? `${actual} != ${expected}`),
  nearValues = (actual, expected, message) =>
    actual.forEach((value, index) => near(value, expected[index], `${message}[${index}]`)),
  localBrep = (size) => {
    const shape = buildCadRecipe(oc, { type: 'box', size });
    try {
      return writeCadBrep(oc, shape);
    } finally {
      shape.delete();
    }
  },
  PLATE_BREP = localBrep([100, 60, 5]),
  BEARING_BREP = localBrep([10, 6, 4]),
  leaves = (nodes) => {
    const result = [];
    const collect = (node) => (node.children ? node.children.forEach(collect) : result.push(node));
    nodes.forEach(collect);
    return result;
  },
  leaf = (patch = {}) => ({ name: 'Teil', appearance: {}, brep: BEARING_BREP, faceColors: [], ...patch });

// Independent target values: one 100x60x5 plate at the origin, a subassembly
// "Antrieb" rotated 90 degrees about Z at x=40 and two occurrences of one
// 10x6x4 bearing definition at local x=0 and x=12. The local 12 mm spacing
// becomes a 12 mm world offset on Y after the drive rotation.
function occurrenceDocument({ secondBrep = BEARING_BREP } = {}) {
  return [
    {
      name: 'Prüfbaugruppe',
      appearance: {},
      definitionId: '0:1',
      occurrencePath: '0:1',
      localTransform: IDENTITY_3X4,
      children: [
        {
          name: 'Grundplatte',
          appearance: { color: '#cc3322', opacity: 1 },
          definitionId: '0:1:1',
          occurrencePath: '0:1/0:1:1',
          localTransform: IDENTITY_3X4,
          brepVersion: 2,
          brep: PLATE_BREP,
          faceColors: [],
        },
        {
          name: 'Antrieb',
          definitionId: '0:1:2',
          occurrencePath: '0:1/0:1:2',
          localTransform: DRIVE_3X4,
          children: [
            {
              name: 'Lager',
              definitionName: 'Lager 10x6x4',
              appearance: { color: '#2277cc', opacity: 1 },
              definitionId: '0:1:2:1',
              occurrencePath: '0:1/0:1:2/0:1:2:1',
              localTransform: IDENTITY_3X4,
              brepVersion: 2,
              brep: BEARING_BREP,
            },
            {
              name: 'Lager rechts',
              definitionName: 'Lager 10x6x4',
              appearance: { color: '#2277cc', opacity: 1 },
              definitionId: '0:1:2:1',
              occurrencePath: '0:1/0:1:2/0:1:2:2',
              localTransform: BEARING_OFFSET_3X4,
              brepVersion: 2,
              brep: secondBrep,
            },
          ],
        },
      ],
    },
  ];
}

test('Occurrence contract keeps definition geometry local and composes Parent * Child', () => {
  const plan = planCadStepImportTree(occurrenceDocument());
  assert.equal(plan.geometry, 'definition');
  assert.deepEqual(plan.counts, { entries: 5, parts: 3, definitions: 2 });
  assert.deepEqual(plan.tree[0].appearance, {});
  assert.deepEqual(
    plan.tree[0].children.map((child) => child.name),
    ['Grundplatte', 'Antrieb'],
  );
  const parts = leaves(plan.tree);
  assert.deepEqual(
    parts.map((part) => part.name),
    ['Grundplatte', 'Lager', 'Lager rechts'],
  );
  assert.deepEqual(parts[0].worldTransform, IDENTITY_4X4);
  assert.deepEqual(parts[1].worldTransform, [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 40, 0, 0, 1]);
  assert.deepEqual(parts[2].worldTransform, [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 40, 12, 0, 1]);
  assert.equal(parts[1].definitionId, parts[2].definitionId, 'beide Lager teilen eine Definition');
  assert.equal(parts[1].definitionName, 'Lager 10x6x4');
  assert.equal(parts[1].occurrencePath, '0:1/0:1:2/0:1:2:1');
  assert.equal(parts[2].occurrencePath, '0:1/0:1:2/0:1:2:2');
  assert.equal(plan.definitions.length, 2, 'Geometrie wird je Definition einmal geführt');
  assert.equal(plan.definitions.find((definition) => definition.definitionId === '0:1:2:1').brep, BEARING_BREP);
});

test('Reader materialises local BRep and stats once per shared definition', () => {
  const tree = importCadStepTree(oc, occurrenceDocument()),
    [plate, drive] = tree[0].children,
    [first, second] = drive.children;
  near(plate.stats.volume, 30000);
  nearValues(plate.stats.bounds.min, [-50, -30, -2.5], 'Platte min');
  nearValues(plate.stats.bounds.max, [50, 30, 2.5], 'Platte max');
  for (const bearing of [first, second]) {
    near(bearing.stats.volume, 240);
    // Local definition geometry, not the rotated world extent.
    nearValues(bearing.stats.bounds.min, [-5, -3, -2], 'Lager min');
    nearValues(bearing.stats.bounds.max, [5, 3, 2], 'Lager max');
    assert.equal(bearing.brep.format, 'OpenCascade-BRep');
    assert.equal(bearing.brep.triangulation, false);
    assert.deepEqual(bearing.appearance, { color: '#2277cc', opacity: 1 });
  }
  assert.equal(first.brep.data, second.brep.data, 'gemeinsame Definitionsgeometrie');
  assert.notEqual(first.brep, second.brep, 'jedes Blatt besitzt einen eigenen Wrapper');
  assert.notEqual(first.stats, second.stats, 'Statistik ist je Blatt kopiert');
});

test('A repeated definition may omit the shared BRep text', () => {
  const document = occurrenceDocument();
  delete document[0].children[1].children[1].brep;
  const [first, second] = importCadStepTree(oc, document)[0].children[1].children;
  assert.equal(second.brep.data, first.brep.data);
  near(second.stats.volume, 240);
  assert.throws(() => planCadStepImportTree([leaf({ name: 'Ohne Form', brep: undefined })]), /besitzt keine Geometrie/);
});

test('World-baked leaves retain the legacy reader shape', () => {
  const tree = importCadStepTree(oc, [
    { name: 'Boden', appearance: {}, brep: PLATE_BREP, faceColors: [] },
    { name: 'Stift', appearance: {}, brep: BEARING_BREP },
  ]);
  for (const node of tree)
    assert.deepEqual(Object.keys(node).sort(), ['appearance', 'brep', 'faceColors', 'name', 'stats']);
  near(tree[0].stats.volume, 30000);
});

test('A world-baked BRep with unversioned identity fields keeps its original placement', () => {
  const original = readCadBrep(oc, BEARING_BREP);
  let placed;
  try {
    placed = transformCad(oc, original, stepColumnMajorTransform(DRIVE_3X4));
    const [bearing] = importCadStepTree(oc, [
      {
        name: 'Lager',
        brep: writeCadBrep(oc, placed),
        definitionId: '0:1',
        occurrencePath: '0:1',
        localTransform: DRIVE_3X4,
      },
    ]);
    nearValues(bearing.stats.bounds.min, [37, -5, -2], 'Lager min');
    nearValues(bearing.stats.bounds.max, [43, 5, 2], 'Lager max');
    assert.equal(bearing.worldTransform, undefined);
    assert.equal(bearing.definitionId, undefined);
  } finally {
    placed?.delete();
    original.delete();
  }
});

test('Row-major 3x4 becomes column-major 4x4 and Parent * Child multiplies', () => {
  assert.deepEqual(stepColumnMajorTransform(IDENTITY_3X4), IDENTITY_4X4);
  assert.deepEqual(stepColumnMajorTransform(DRIVE_3X4), [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 40, 0, 0, 1]);
  assert.deepEqual(
    composeStepTransforms(stepColumnMajorTransform(DRIVE_3X4), stepColumnMajorTransform(BEARING_OFFSET_3X4)),
    [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 40, 12, 0, 1],
  );
  assert.deepEqual(composeStepTransforms(IDENTITY_4X4, IDENTITY_4X4), IDENTITY_4X4);
  assert.throws(() => stepColumnMajorTransform([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), /singulär/);
  assert.throws(() => stepColumnMajorTransform([1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1]), /zwölf endliche/);
  assert.throws(() => stepColumnMajorTransform([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, NaN]), /zwölf endliche/);
});

test('Incomplete, mixed and conflicting occurrence contracts fail cleanly', () => {
  const plan = (document) => () => planCadStepImportTree(document),
    occurrence = (patch) =>
      leaf({ definitionId: '0:1', occurrencePath: '0:1', localTransform: IDENTITY_3X4, brepVersion: 2, ...patch });
  assert.throws(plan([leaf({ definitionId: '0:1', occurrencePath: '0:1' })]), /Vorkommensidentität unvollständig/);
  assert.throws(plan([leaf(), occurrence()]), /Vorkommensidentität nur teilweise/);
  assert.throws(plan([occurrence({ localTransform: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] })]), /singulär/);
  assert.throws(
    plan([occurrence({ occurrencePath: '0:1/0:1' }), occurrence({ definitionId: '0:2', occurrencePath: '0:1/0:1' })]),
    /nicht eindeutig/,
  );
  assert.throws(
    plan(occurrenceDocument({ secondBrep: 'andere Form' })),
    /Widersprüchliche STEP-Definition "0:1:2:1"[\s\S]*Definitionsform/,
  );
  const names = occurrenceDocument();
  names[0].children[1].children[1].definitionName = 'Anderes Lager';
  assert.throws(plan(names), /Widersprüchliche STEP-Definition "0:1:2:1"[\s\S]*Definitionsnamen/);
  // An explicit world document never applies the local placement again.
  const world = importCadStepTree(oc, {
    geometry: 'world',
    roots: [occurrence({ brepVersion: 1 })],
  });
  assert.equal(world[0].worldTransform, undefined);
  assert.equal(world[0].definitionId, undefined);
  assert.throws(plan([occurrence({ brepVersion: 3 })]), /Unbekannte STEP-BRep-Version/);
});

test('Tree, name, style and budget limits reject the document before any native read', () => {
  const plan = (document) => () => planCadStepImportTree(document);
  assert.throws(plan([]), /keine Bauteile/);
  assert.throws(plan({ roots: [], extra: 1 }), /unbekannte Dokumentfelder/);
  assert.throws(plan({ roots: [leaf()], geometry: 'mesh' }), /Geometriemodus/);
  assert.throws(plan([leaf({ name: '   ' })]), /Namen/);
  assert.throws(plan([leaf({ name: 'x'.repeat(201) })]), /Namen/);
  assert.throws(plan([leaf({ appearance: { color: 'rot' } })]), /STEP-Farbe/);
  assert.throws(plan([leaf({ appearance: { opacity: 2 } })]), /STEP-Transparenz/);
  assert.throws(plan([leaf({ faceColors: [{ faceIndex: 0, appearance: { color: '#112233' } }] })]), /Flächenfarbe/);
  assert.throws(plan([{ name: 'Leer', children: [] }]), /leeren Ast/);
  assert.throws(plan([{ name: 'Konflikt', brep: BEARING_BREP, children: [leaf()] }]), /Baugruppe und Körper/);
  const cycle = { name: 'Zyklus', children: [] };
  cycle.children.push(cycle);
  assert.throws(plan([cycle]), /Zyklus/);
  assert.throws(plan([leaf({ geometry: 'definition' })]), /benötigt definitionId/);
  assert.throws(
    plan({ geometry: 'world', roots: [{ ...leaf(), geometry: 'definition' }] }),
    /gemischte Geometrieverträge/,
  );
  // 500 bodies and 1000 entries are the documented project limits.
  const bodies = (count) => Array.from({ length: count }, (_, index) => leaf({ name: `Teil ${index}`, brep: 'x' }));
  assert.equal(planCadStepImportTree(bodies(500)).counts.parts, 500);
  assert.throws(plan(bodies(501)), /mehr als 500 Körper/);
  const branches = {
    name: 'Wurzel',
    children: Array.from({ length: 1000 }, (_, index) => ({ name: `Ast ${index}`, children: [leaf()] })),
  };
  assert.throws(plan([branches]), /Projektgrenzen/);
  const nest = (depth) => {
    let node = leaf({ brep: 'x' });
    for (let index = 0; index < depth; index++) node = { name: `Ast ${index}`, children: [node] };
    return node;
  };
  assert.equal(planCadStepImportTree([nest(11)]).counts.entries, 12);
  assert.throws(plan([nest(12)]), /12 Ebenen/);
});

test('Appearance and face colours are validated and passed through', () => {
  const [node] = importCadStepTree(oc, [
    {
      name: 'Teil',
      appearance: { color: '#AABBCC', opacity: 0.5 },
      faceColors: [{ faceIndex: 1, appearance: { color: '#112233', opacity: 1 } }],
      brep: BEARING_BREP,
    },
  ]);
  assert.deepEqual(node.appearance, { color: '#aabbcc', opacity: 0.5 });
  assert.deepEqual(node.faceColors, [{ faceIndex: 1, appearance: { color: '#112233', opacity: 1 } }]);
});
