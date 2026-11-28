import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCadKernel } from '../src/cad-kernel-loader.js';
import { createCadService } from '../src/cad-service.js';
import { createCadProject } from '../src/cad-project.js';
import { stepOccurrenceFixture } from './fixtures/cad-exchange-step-occurrences.mjs';
import { importStepWorldTree } from './fixtures/cad-step-world-tree.mjs';

// Independent target values from work/Referenz-Baugruppe.json:
// one 100x60x5 plate at the origin, one subassembly "Antrieb" at [40,0,0]
// rotated 90 degrees about Z, and two occurrences of the same bearing
// definition, both named "Lager", at local [0,0,0] and [12,0,0]. The bearing is
// 10x6x4, so the rotation swaps its X/Y extents and turns the 12 mm local
// spacing into a 12 mm world offset on Y.
const oc = await loadCadKernel({ print: () => {}, printErr: () => {} }),
  bytes = stepOccurrenceFixture(oc),
  near = (actual, expected, message) =>
    assert.ok(Math.abs(actual - expected) < 1e-5, message ?? `${actual} != ${expected}`),
  nearBounds = (stats, min, max) => {
    min.forEach((value, index) => near(stats.bounds.min[index], value, `min[${index}]`));
    max.forEach((value, index) => near(stats.bounds.max[index], value, `max[${index}]`));
  },
  extents = (stats) => stats.bounds.max.map((value, index) => value - stats.bounds.min[index]);

test('Fixture STEP declares one shared Lager definition used by two occurrences', () => {
  // The fixture is written through the real XCAF writer, so this also fixes the
  // source-side precondition: the file itself carries definition identity.
  const text = new TextDecoder().decode(bytes),
    products = [...text.matchAll(/PRODUCT\(\s*'Lager'/g)],
    usages = [
      ...text.matchAll(
        /NEXT_ASSEMBLY_USAGE_OCCURRENCE\(\s*'[^']*'\s*,\s*'Lager'\s*,\s*''\s*,\s*#\d+\s*,\s*#(\d+)\s*,\s*\$\)/g,
      ),
    ];
  assert.equal(products.length, 1, 'genau eine Lager-Definition im STEP-Text');
  assert.equal(usages.length, 2, 'genau zwei Lager-Vorkommen im STEP-Text');
  assert.equal(usages[0][1], usages[1][1], 'beide Vorkommen referenzieren dieselbe Definition');
});

test('Import resolves two same-named occurrences, subassembly and rotated placement to fixed values', () => {
  const tree = importStepWorldTree(oc, bytes);
  assert.equal(tree.length, 1);
  const root = tree[0];
  assert.equal(root.name, 'Prüfbaugruppe');
  assert.deepEqual(
    root.children.map((child) => child.name),
    ['Grundplatte', 'Antrieb'],
  );
  const [plate, drive] = root.children;
  assert.equal(drive.children.length, 2);
  assert.deepEqual(
    drive.children.map((child) => child.name),
    ['Lager', 'Lager'],
  );
  // Plate: 100 x 60 x 5 centred at the origin.
  near(plate.stats.volume, 30000);
  nearBounds(plate.stats, [-50, -30, -2.5], [50, 30, 2.5]);
  // Bearing: 10 x 6 x 4. A 90-degree Z rotation makes the world extents 6 x 10.
  const [first, second] = drive.children;
  near(first.stats.volume, 240);
  near(second.stats.volume, 240);
  for (const part of [first, second])
    [6, 10, 4].forEach((value, index) => near(extents(part.stats)[index], value, `Ausdehnung[${index}]`));
  nearBounds(first.stats, [37, -5, -2], [43, 5, 2]);
  nearBounds(second.stats, [37, 7, -2], [43, 17, 2]);
  const delta = second.stats.bounds.min.map((value, index) => value - first.stats.bounds.min[index]);
  [0, 12, 0].forEach((value, index) => near(delta[index], value, `Weltversatz[${index}]`));
});

test('Native STEP occurrences bind to one project definition with two independent placements', () => {
  const path = '/occurrence-identity.step';
  oc.FS.writeFile(path, bytes);
  let raw;
  try {
    raw = JSON.parse(oc.FormnaroCadBridge.ReadStepAssemblyJson(path));
  } finally {
    try {
      oc.FS.unlink(path);
    } catch {}
  }
  const drive = raw[0].children[1];
  assert.equal(drive.name, 'Antrieb');
  const [first, second] = drive.children;
  if (first.brepVersion === 2) {
    assert.equal(second.brepVersion, 2);
    assert.ok(first.definitionId);
    assert.equal(first.definitionId, second.definitionId);
    assert.notEqual(first.occurrencePath, second.occurrencePath);
    assert.equal(first.brep, second.brep);

    const service = createCadService({ oc }),
      project = createCadProject();
    try {
      service.stepAssembly(project, bytes);
      const [plate, left, right] = project.nodes;
      assert.equal(project.componentDefinitions.definitions.length, 2);
      assert.notEqual(plate.definitionId, left.definitionId);
      assert.equal(left.definitionId, right.definitionId);
      assert.notEqual(left.id, right.id);
      assert.equal(left.brep.data, right.brep.data);
      for (const [node, xyz] of [
        [left, [40, 0, 0]],
        [right, [40, 12, 0]],
      ])
        xyz.forEach((value, axis) => near(node.transform[12 + axis], value));
      return;
    } finally {
      service.dispose();
    }
  }
  assert.ok(
    !process.env.FORMNARO_REQUIRE_STEP_IDENTITIES,
    'Der geprüfte Kernel muss lokale STEP-Definitionen liefern.',
  );
  assert.deepEqual(Object.keys(drive).sort(), ['appearance', 'children', 'name']);
  // The bridge contract has no field for a definition or occurrence id: both
  // leaves only carry their own name, style and a fully materialised BRep.
  for (const leaf of [first, second])
    assert.deepEqual(Object.keys(leaf).sort(), ['appearance', 'brep', 'faceColors', 'name']);
  assert.notEqual(first.brep, second.brep);

  // The source geometry is stored twice. Both serialised BReps are identical
  // except for exactly one location row whose value differs by the 12 mm
  // occurrence offset, so the shared definition geometry itself is unchanged.
  const left = first.brep.split('\n'),
    right = second.brep.split('\n');
  assert.equal(left.length, right.length, 'BRep-Layout der beiden Vorkommen');
  const rows = left.map((line, index) => [line, right[index]]).filter(([a, b]) => a !== b);
  assert.equal(rows.length, 1, 'BReps unterscheiden sich nur in der Platzierung');
  const numbers = (line) => line.trim().split(/\s+/).map(Number),
    [a, b] = [numbers(rows[0][0]), numbers(rows[0][1])];
  assert.equal(a.length, b.length);
  const changed = a.map((value, index) => (value === b[index] ? -1 : index)).filter((index) => index >= 0);
  assert.equal(changed.length, 1, 'genau eine geänderte Platzierungszahl');
  near(Math.abs(b[changed[0]] - a[changed[0]]), 12);

  // The importer turns each occurrence into its own CAD node. Both siblings
  // have the same name and their own BRep, but nothing links them to a shared
  // definition, so editing one cannot reach the other.
  const service = createCadService({ oc }),
    project = createCadProject();
  try {
    service.stepAssembly(project, bytes);
    assert.deepEqual(
      project.nodes.map((node) => node.name),
      ['Grundplatte', 'Lager', 'Lager'],
    );
    const [plateNode, firstNode, secondNode] = project.nodes;
    assert.notEqual(plateNode, firstNode);
    for (const node of [firstNode, secondNode]) {
      assert.ok(node.brep?.data);
      for (const key of ['definition', 'definitionId', 'occurrence', 'occurrenceId', 'componentId', 'instanceOf'])
        assert.equal(key in node, false, `Importknoten trägt keine Definitionsidentität (${key})`);
    }
    assert.notEqual(firstNode.brep, secondNode.brep);
    assert.notEqual(firstNode.brep.data, secondNode.brep.data);
  } finally {
    service.dispose();
  }
});
