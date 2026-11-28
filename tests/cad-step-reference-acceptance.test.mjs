import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { loadCadKernel } from '../src/cad-kernel-loader.js';
import { buildCadRecipe } from '../src/cad-recipes.js';
import { exportCadStep, importCadStepAssembly } from '../src/cad-step-io.js';
import { createCadService } from '../src/cad-service.js';
import { createCadProject, serializeCadProject } from '../src/cad-project.js';
import {
  stepReferenceAssembly,
  stepSameNameDefinitions,
  stepReusedSubgroup,
  stepOtherRotationAxis,
  stepFlatSheet,
} from './fixtures/cad-step-acceptance-fixtures.mjs';

// E1-E3 independent acceptance. The expectations below are derived analytically
// from the dimensions and placements, not from the reader or exporter under
// test. Reader inputs are written by the OCCT XCAF/STEP writers only, and the
// foreign sample was written by FreeCAD (see scripts/step-freecad-foreign-sample.mjs).
//
// Reference assembly (the existing rotated assembly):
//   plate 100 x 60 x 5 at [0,0,0]
//   "Antrieb" at [40,0,0], rotated 90 degrees about Z
//   one 10 x 6 x 4 "Lager" definition at local [0,0,0] and [12,0,0]
// The 90 degree rotation maps local (x,y) to world (-y,x), so the 12 mm local
// X spacing becomes 12 mm world Y spacing. With the bearing centred at its local
// origin, the occurrence origins in world millimetres are exactly
// [40,0,0] and [40,12,0].
const oc = await loadCadKernel({ print: () => {}, printErr: () => {} }),
  near = (actual, expected, message) =>
    assert.ok(Math.abs(actual - expected) < 1e-6, message ?? `${actual} != ${expected}`),
  nearVector = (actual, expected, message) =>
    expected.forEach((value, index) => near(actual[index], value, `${message ?? 'Vektor'}[${index}]`)),
  text = (bytes) => new TextDecoder().decode(bytes),
  products = (value, name) => [...value.matchAll(new RegExp(`PRODUCT\\(\\s*'${name}'`, 'g'))],
  usages = (value, name) => [
    ...value.matchAll(
      new RegExp(
        `NEXT_ASSEMBLY_USAGE_OCCURRENCE\\(\\s*'[^']*'\\s*,\\s*'${name}'\\s*,\\s*''\\s*,\\s*#\\d+\\s*,\\s*#(\\d+)\\s*,\\s*\\$`,
        'g',
      ),
    ),
  ],
  worldLeafBounds = (leaf) => {
    const bounds = leaf.stats.bounds;
    if (!leaf.worldTransform) return bounds;
    assert.equal(leaf.worldTransform.length, 16, 'worldTransform muss eine 4x4-Matrix sein');
    const m = leaf.worldTransform,
      corners = [];
    for (const x of [bounds.min[0], bounds.max[0]])
      for (const y of [bounds.min[1], bounds.max[1]])
        for (const z of [bounds.min[2], bounds.max[2]])
          corners.push([
            m[0] * x + m[4] * y + m[8] * z + m[12],
            m[1] * x + m[5] * y + m[9] * z + m[13],
            m[2] * x + m[6] * y + m[10] * z + m[14],
          ]);
    return {
      min: [0, 1, 2].map((axis) => Math.min(...corners.map((corner) => corner[axis]))),
      max: [0, 1, 2].map((axis) => Math.max(...corners.map((corner) => corner[axis]))),
    };
  },
  center = (bounds) => bounds.min.map((value, index) => (value + bounds.max[index]) / 2),
  extents = (bounds) => bounds.max.map((value, index) => value - bounds.min[index]),
  assertBody = (leaf, { min, max, volume, origin }, label) => {
    const bounds = worldLeafBounds(leaf);
    nearVector(bounds.min, min, `${label} min`);
    nearVector(bounds.max, max, `${label} max`);
    near(leaf.stats.volume, volume, `${label} Volumen`);
    if (origin) nearVector(center(bounds), origin, `${label} Ursprung`);
    return bounds;
  },
  // World geometry through the public service contract. `inspect` applies the
  // node placement, so the same assertions hold before and after the reader
  // starts returning local definition geometry plus a world transform.
  inspectWorld = (service, project) => project.nodes.map((node) => ({ node, measured: service.inspect(node) })),
  assertInspected = (measured, { min, max, volume, origin }, label) => {
    nearVector(measured.worldBounds.min, min, `${label} Weltminimum`);
    nearVector(measured.worldBounds.max, max, `${label} Weltmaximum`);
    near(measured.volume, volume, `${label} Weltvolumen`);
    if (origin) nearVector(measured.worldBounds.center, origin, `${label} Weltursprung`);
  };

test('Reference assembly: independent STEP keeps bearing origins at [40,0,0] and [40,12,0] mm', () => {
  const bytes = stepReferenceAssembly(oc),
    step = text(bytes),
    // The fixture itself must carry the intended structure before any reader
    // sees it: one shared Lager definition with two usage occurrences.
    lagerProducts = products(step, 'Lager'),
    lagerUsages = usages(step, 'Lager');
  assert.equal(lagerProducts.length, 1, 'genau eine Lager-Definition in der unabhängigen Datei');
  assert.equal(lagerUsages.length, 2, 'genau zwei Lager-Vorkommen');
  assert.equal(lagerUsages[0][1], lagerUsages[1][1], 'beide Vorkommen nutzen dieselbe Definition');
  assert.equal(
    [...step.matchAll(/MANIFOLD_SOLID_BREP/g)].length,
    2,
    'zwei Definitionskörper, keine Kopie je Vorkommen',
  );
  assert.doesNotMatch(step, /TRIANGULATED_FACE|TESSELLATED_SHAPE|POLYGONAL_FACE_SET/);

  const tree = importCadStepAssembly(oc, bytes);
  assert.equal(tree.length, 1);
  const [root] = tree;
  assert.equal(root.name, 'Referenzbaugruppe');
  assert.deepEqual(
    root.children.map((child) => child.name),
    ['Grundplatte', 'Antrieb'],
  );
  const [plate, drive] = root.children;
  assert.equal(drive.stats, undefined, 'die Untergruppe bleibt reine Organisation');
  assert.deepEqual(
    drive.children.map((child) => child.name),
    ['Lager', 'Lager'],
  );
  assertBody(plate, { min: [-50, -30, -2.5], max: [50, 30, 2.5], volume: 30000 }, 'Grundplatte');
  const [first, second] = drive.children;
  const firstBounds = assertBody(
    first,
    { min: [37, -5, -2], max: [43, 5, 2], volume: 240, origin: [40, 0, 0] },
    'Lager links',
  );
  const secondBounds = assertBody(
    second,
    { min: [37, 7, -2], max: [43, 17, 2], volume: 240, origin: [40, 12, 0] },
    'Lager rechts',
  );
  for (const bounds of [firstBounds, secondBounds])
    nearVector(extents(bounds), [6, 10, 4], 'Weltausdehnung der gedrehten Lager');
  nearVector(
    secondBounds.min.map((value, index) => value - firstBounds.min[index]),
    [0, 12, 0],
    'Weltversatz zwischen den Lagerursprüngen',
  );
  nearVector(center(firstBounds), [40, 0, 0], 'Lagerursprung 1');
  nearVector(center(secondBounds), [40, 12, 0], 'Lagerursprung 2');
});

test('Reference assembly: project import exposes the same fixed world values and folder tree', () => {
  const service = createCadService({ oc }),
    project = createCadProject();
  try {
    const bytes = stepReferenceAssembly(oc),
      ids = service.stepAssembly(project, bytes, { name: 'Referenz.step', id: 'referenz' });
    assert.equal(ids.length, 3);
    assert.equal(project.nodes.length, 3);
    assert.equal(project.folders.length, 3);
    assert.deepEqual(
      project.nodes.map((node) => node.name),
      ['Grundplatte', 'Lager', 'Lager'],
    );
    assert.equal(new Set(project.nodes.map((node) => node.id)).size, 3, 'jedes Vorkommen erhält eine eigene Knoten-ID');
    // STEP-Datei -> Referenzbaugruppe -> Antrieb; the leaf nodes sit in the
    // nested subassembly folder.
    const [fileFolder, groupFolder, driveFolder] = project.folders;
    assert.equal(fileFolder.name, 'Referenz.step');
    assert.equal(groupFolder.name, 'Referenzbaugruppe');
    assert.equal(driveFolder.name, 'Antrieb');
    assert.equal(groupFolder.parentId, fileFolder.id);
    assert.equal(driveFolder.parentId, groupFolder.id);
    assert.equal(project.nodes[0].folderId, groupFolder.id);
    assert.equal(project.nodes[1].folderId, driveFolder.id);
    assert.equal(project.nodes[2].folderId, driveFolder.id);

    const inspected = inspectWorld(service, project);
    assertInspected(inspected[0].measured, { min: [-50, -30, -2.5], max: [50, 30, 2.5], volume: 30000 }, 'Grundplatte');
    assertInspected(
      inspected[1].measured,
      { min: [37, -5, -2], max: [43, 5, 2], volume: 240, origin: [40, 0, 0] },
      'Lager links',
    );
    assertInspected(
      inspected[2].measured,
      { min: [37, 7, -2], max: [43, 17, 2], volume: 240, origin: [40, 12, 0] },
      'Lager rechts',
    );
    nearVector(
      inspected[2].measured.worldBounds.center.map(
        (value, index) => value - inspected[1].measured.worldBounds.center[index],
      ),
      [0, 12, 0],
      'Weltversatz im Projekt',
    );
    for (const { measured } of inspected) assert.equal(measured.solids, 1);
  } finally {
    service.dispose();
  }
});

test('Reference assembly: export writes one shared definition and reimports the fixed world values', () => {
  const shapes = [],
    shape = (size) => {
      const part = buildCadRecipe(oc, { type: 'box', size });
      shapes.push(part);
      return part;
    };
  try {
    const plate = shape([100, 60, 5]),
      bearing = () => shape([10, 6, 4]),
      parts = [
        { shape: plate, name: 'Grundplatte', color: '#cc3322', opacity: 1 },
        {
          shape: bearing(),
          name: 'Lager',
          color: '#2277cc',
          opacity: 1,
          definitionId: 'lager-10x6x4',
          placement: { translation: [40, 0, 0], rotationZ: Math.PI / 2 },
        },
        {
          shape: bearing(),
          name: 'Lager',
          color: '#2277cc',
          opacity: 1,
          definitionId: 'lager-10x6x4',
          placement: { translation: [40, 12, 0], rotationZ: Math.PI / 2 },
        },
      ],
      tree = {
        name: 'Referenzbaugruppe',
        children: [{ partIndex: 0 }, { name: 'Antrieb', children: [{ partIndex: 1 }, { partIndex: 2 }] }],
      },
      bytes = exportCadStep(oc, parts, { assemblyTree: tree }),
      step = text(bytes),
      lagerProducts = products(step, 'Lager'),
      lagerUsages = usages(step, 'Lager');
    assert.equal(lagerProducts.length, 1, 'genau eine geschriebene Lager-Definition');
    assert.equal(lagerUsages.length, 2, 'genau zwei geschriebene Lager-Vorkommen');
    assert.equal(lagerUsages[0][1], lagerUsages[1][1], 'beide Vorkommen referenzieren dieselbe Definition');
    assert.equal([...step.matchAll(/MANIFOLD_SOLID_BREP/g)].length, 2, 'die Definition wird nur einmal geschrieben');

    const round = importCadStepAssembly(oc, bytes);
    assert.equal(round[0].name, 'Referenzbaugruppe');
    assertBody(round[0].children[0], { min: [-50, -30, -2.5], max: [50, 30, 2.5], volume: 30000 }, 'Grundplatte');
    assertBody(
      round[0].children[1].children[0],
      { min: [37, -5, -2], max: [43, 5, 2], volume: 240, origin: [40, 0, 0] },
      'Lager links',
    );
    assertBody(
      round[0].children[1].children[1],
      { min: [37, 7, -2], max: [43, 17, 2], volume: 240, origin: [40, 12, 0] },
      'Lager rechts',
    );
  } finally {
    for (const part of shapes) part.delete();
  }
});

test('Repeated export keeps the caller-owned shared definition stable', () => {
  const shapes = [],
    shape = (size) => {
      const part = buildCadRecipe(oc, { type: 'box', size });
      shapes.push(part);
      return part;
    };
  try {
    const parts = [
        { shape: shape([100, 60, 5]), name: 'Grundplatte', color: '#cc3322', opacity: 1 },
        {
          shape: shape([10, 6, 4]),
          name: 'Lager',
          color: '#2277cc',
          opacity: 1,
          definitionId: 'lager-10x6x4',
          placement: { translation: [40, 0, 0], rotationZ: Math.PI / 2 },
        },
        {
          shape: shape([10, 6, 4]),
          name: 'Lager',
          color: '#2277cc',
          opacity: 1,
          definitionId: 'lager-10x6x4',
          placement: { translation: [40, 12, 0], rotationZ: Math.PI / 2 },
        },
      ],
      tree = {
        name: 'Referenzbaugruppe',
        children: [{ partIndex: 0 }, { name: 'Antrieb', children: [{ partIndex: 1 }, { partIndex: 2 }] }],
      };
    exportCadStep(oc, parts, { assemblyTree: tree });
    assert.doesNotThrow(() => exportCadStep(oc, parts, { assemblyTree: tree }));
  } finally {
    for (const part of shapes) part.delete();
  }
});

test('Counterexample: two same-named independent definitions stay two distinct bodies', () => {
  const bytes = stepSameNameDefinitions(oc),
    step = text(bytes),
    lagerProducts = products(step, 'Lager'),
    lagerUsages = usages(step, 'Lager');
  assert.equal(lagerProducts.length, 2, 'zwei unabhängige Lager-Definitionen im STEP-Text');
  assert.equal(lagerUsages.length, 2);
  assert.notEqual(lagerUsages[0][1], lagerUsages[1][1], 'die Vorkommen dürfen nicht dieselbe Definition teilen');
  assert.equal([...step.matchAll(/MANIFOLD_SOLID_BREP/g)].length, 2, 'zwei unterschiedliche Körper');

  const tree = importCadStepAssembly(oc, bytes),
    [root] = tree;
  assert.equal(root.name, 'Namensgleiche Teile');
  assert.deepEqual(
    root.children.map((child) => child.name),
    ['Lager', 'Lager'],
  );
  const [small, large] = root.children;
  assertBody(small, { min: [-5, -3, -2], max: [5, 3, 2], volume: 240, origin: [0, 0, 0] }, 'Lager 10x6x4');
  assertBody(large, { min: [15, -4, -2], max: [25, 4, 2], volume: 320, origin: [20, 0, 0] }, 'Lager 10x8x4');
  nearVector(extents(worldLeafBounds(small)), [10, 6, 4]);
  nearVector(extents(worldLeafBounds(large)), [10, 8, 4]);

  const service = createCadService({ oc }),
    project = createCadProject();
  try {
    service.stepAssembly(project, bytes);
    assert.equal(project.nodes.length, 2);
    assert.equal(new Set(project.nodes.map((node) => node.id)).size, 2);
    const inspected = inspectWorld(service, project);
    assertInspected(inspected[0].measured, { min: [-5, -3, -2], max: [5, 3, 2], volume: 240 }, 'Lager 10x6x4');
    assertInspected(inspected[1].measured, { min: [15, -4, -2], max: [25, 4, 2], volume: 320 }, 'Lager 10x8x4');
  } finally {
    service.dispose();
  }
});

test('Equal names, dimensions and colours keep independent native definitions', () => {
  const bytes = stepSameNameDefinitions(oc, { identicalGeometry: true });
  const bodies = importCadStepAssembly(oc, bytes)[0].children;
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].name, bodies[1].name);
  assert.deepEqual(bodies[0].appearance, bodies[1].appearance);
  nearVector(extents(worldLeafBounds(bodies[0])), extents(worldLeafBounds(bodies[1])));
  if (!bodies[0].worldTransform) {
    assert.ok(!process.env.FORMNARO_REQUIRE_STEP_IDENTITIES, 'Der Prüfkern muss die beiden Definitionen liefern.');
    return;
  }
  const service = createCadService({ oc });
  try {
    const project = createCadProject();
    service.stepAssembly(project, bytes);
    assert.equal(project.componentDefinitions.definitions.length, 2);
    assert.notEqual(project.nodes[0].definitionId, project.nodes[1].definitionId);
    assert.notEqual(project.nodes[0].id, project.nodes[1].id);
  } finally {
    service.dispose();
  }
});

test('Counterexample: one reused subgroup expands both occurrences with child geometry', () => {
  const bytes = stepReusedSubgroup(oc),
    step = text(bytes),
    groupProducts = products(step, 'Antrieb'),
    groupUsages = usages(step, 'Antrieb'),
    lagerProducts = products(step, 'Lager');
  assert.equal(groupProducts.length, 1, 'genau eine Antrieb-Definition');
  assert.equal(groupUsages.length, 2, 'die Untergruppe wird zweimal eingebaut');
  assert.equal(groupUsages[0][1], groupUsages[1][1], 'beide Einbauten referenzieren dieselbe Untergruppe');
  assert.equal(lagerProducts.length, 1, 'das Lager ist innerhalb der Gruppe nur einmal definiert');
  assert.equal([...step.matchAll(/MANIFOLD_SOLID_BREP/g)].length, 1, 'die Kindgeometrie existiert nur einmal');

  const tree = importCadStepAssembly(oc, bytes),
    [root] = tree;
  assert.equal(root.name, 'Wiederverwendete Gruppe');
  assert.equal(root.children.length, 2, 'beide Einbauten der Untergruppe erscheinen im Baum');
  assert.deepEqual(
    root.children.map((child) => child.name),
    ['Antrieb', 'Antrieb'],
  );
  for (const group of root.children) {
    assert.equal(group.children.length, 1);
    assert.equal(group.children[0].name, 'Lager');
  }
  const [first, second] = root.children.map((group) => group.children[0]);
  const firstBounds = assertBody(
    first,
    { min: [35, -3, -2], max: [45, 3, 2], volume: 240, origin: [40, 0, 0] },
    'Lager im ersten Antrieb',
  );
  const secondBounds = assertBody(
    second,
    { min: [-3, 35, -2], max: [3, 45, 2], volume: 240, origin: [0, 40, 0] },
    'Lager im zweiten Antrieb',
  );
  nearVector(extents(firstBounds), [10, 6, 4]);
  nearVector(extents(secondBounds), [6, 10, 4], 'die zweite Gruppe ist um 90 Grad gedreht');

  const service = createCadService({ oc }),
    project = createCadProject();
  try {
    service.stepAssembly(project, bytes);
    assert.equal(project.nodes.length, 2);
    assert.equal(
      project.folders.filter((folder) => folder.name === 'Antrieb').length,
      2,
      'jede Einbaulage erhält einen eigenen Projektordner',
    );
    const inspected = inspectWorld(service, project);
    assertInspected(inspected[0].measured, { min: [35, -3, -2], max: [45, 3, 2], volume: 240 }, 'Lager 1');
    assertInspected(inspected[1].measured, { min: [-3, 35, -2], max: [3, 45, 2], volume: 240 }, 'Lager 2');
  } finally {
    service.dispose();
  }
});

test('Counterexample: placement about X composes through parent and child', () => {
  const bytes = stepOtherRotationAxis(oc),
    tree = importCadStepAssembly(oc, bytes),
    [root] = tree;
  assert.equal(root.name, 'Drehachse X');
  const [drive] = root.children;
  assert.equal(drive.name, 'Antrieb X');
  assert.equal(drive.children.length, 2);
  // A Z-only placement keeps the 4 mm Z extent of the 10x6x4 box. The observed
  // 6 mm Z extent and 4 mm Y extent can only come from a 90 degree X rotation.
  const bounds = drive.children.map((leaf, index) => {
    const value = worldLeafBounds(leaf);
    nearVector(extents(value), [10, 4, 6], `Lager ${index + 1} Ausdehnung`);
    return value;
  });
  assertBody(drive.children[0], { min: [35, -2, -3], max: [45, 2, 3], volume: 240, origin: [40, 0, 0] }, 'Lager 1');
  assertBody(drive.children[1], { min: [35, -2, 9], max: [45, 2, 15], volume: 240, origin: [40, 0, 12] }, 'Lager 2');
  nearVector(
    bounds[1].min.map((value, index) => value - bounds[0].min[index]),
    [0, 0, 12],
    'Versatz entlang der gedrehten Y-Achse',
  );

  const service = createCadService({ oc }),
    project = createCadProject();
  try {
    service.stepAssembly(project, bytes);
    const inspected = inspectWorld(service, project);
    assertInspected(inspected[0].measured, { min: [35, -2, -3], max: [45, 2, 3], volume: 240 }, 'Lager 1');
    assertInspected(inspected[1].measured, { min: [35, -2, 9], max: [45, 2, 15], volume: 240 }, 'Lager 2');
  } finally {
    service.dispose();
  }
});

test('Counterexample: an open flat STEP is rejected atomically', () => {
  const bytes = stepFlatSheet(oc),
    step = text(bytes);
  assert.match(step, /SHELL_BASED_SURFACE_MODEL|OPEN_SHELL/, 'die Probe ist eine offene Fläche');
  assert.equal([...step.matchAll(/MANIFOLD_SOLID_BREP/g)].length, 0, 'die Probe enthält keinen Volumenkörper');
  assert.throws(
    () => importCadStepAssembly(oc, bytes),
    /Keine gültigen CAD-Körper|STEP-Baugruppe konnte nicht vollständig gelesen werden/,
  );

  const service = createCadService({ oc }),
    project = createCadProject(),
    before = serializeCadProject(project);
  try {
    assert.throws(
      () => service.stepAssembly(project, bytes),
      /Keine gültigen CAD-Körper|STEP-Baugruppe konnte nicht vollständig gelesen werden/,
    );
    assert.equal(serializeCadProject(project), before, 'ein abgewiesener Import verändert das Projekt nicht');
    assert.equal(project.nodes.length, 0);
    assert.equal(project.folders.length, 0);
  } finally {
    service.dispose();
  }
});

test('Foreign sample: FreeCAD-written plate keeps analytic bounds and volume', async () => {
  const fixtures = new URL('./fixtures/', import.meta.url),
    bytes = await fs.readFile(new URL('freecad-step-foreign-plate.step', fixtures)),
    expected = JSON.parse(await fs.readFile(new URL('freecad-step-foreign-plate.json', fixtures), 'utf8')),
    step = text(bytes);
  assert.equal(expected.generator, 'FreeCAD');
  assert.ok(expected.freeCadVersion.length, 'FreeCAD-Version ist belegt');
  assert.equal(expected.solidCount, 1);
  // The fixture's own expectation is analytic, not a copy of any measured value.
  near(expected.volume, 40 * 30 * 6 - Math.PI * 4 * 4 * 6, 'analytisches FreeCAD-Volumen');
  nearVector(expected.bounds.min, [-20, -15, 0], 'analytisches FreeCAD-Minimum');
  nearVector(expected.bounds.max, [20, 15, 6], 'analytisches FreeCAD-Maximum');
  assert.match(step, /Open CASCADE STEP processor/, 'die Probe stammt vom unabhängigen FreeCAD/OCCT-Schreiber');
  assert.match(step, /FILE_SCHEMA\(\(/);
  assert.match(step, /MANIFOLD_SOLID_BREP/);
  assert.doesNotMatch(step, /TESSELLATED_SHAPE|TRIANGULATED_FACE/);

  const tree = importCadStepAssembly(oc, bytes);
  assert.equal(tree.length, 1, 'die Fremdprobe ist ein einzelner Körper');
  const [leaf] = tree;
  assert.equal(leaf.children, undefined);
  near(leaf.stats.volume, expected.volume, 'FreeCAD-Volumen');
  nearVector(leaf.stats.bounds.min, expected.bounds.min, 'FreeCAD-Minimum');
  nearVector(leaf.stats.bounds.max, expected.bounds.max, 'FreeCAD-Maximum');
  assert.equal(leaf.stats.solids, expected.solidCount);
});
