import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPONENT_DEFINITIONS_VERSION,
  validateComponentDefinition,
  validateComponentDefinitions,
  findComponentDefinition,
  findComponentInstances,
  getComponentIdentity,
  isSameComponent,
  registerComponentDefinition,
  removeComponentDefinition,
  attachComponentDefinition,
  detachComponentDefinition,
  hasComponentDefinitions,
  placeComponentInstance,
  moveComponentInstance,
  removeComponentInstance,
  createComponentDefinitionFromNode,
  updateComponentDefinition,
  unlinkComponentInstance,
  isNodeLocked,
} from '../src/cad-component-definitions.js';
import {
  createCadProject,
  cadProjectSnapshot,
  parseCadProject,
  serializeCadProject,
  cadProjectStoredVersion,
  COMPONENT_DEFINITION_PROJECT_VERSION,
  PART_NUMBER_PROJECT_VERSION,
} from '../src/cad-project.js';
import { createCadPersistence } from '../src/cad-persistence.js';
import { createCadTransactions } from '../src/cad-transactions.js';
import {
  encodeFnpackProject,
  createFnpackResolver,
  materializedFnpackProject,
} from '../src/cad-fnpack-data.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateIndex } = require('../backend/fnpack.cjs');

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const sampleCube = (id = 'cube-1', name = 'Würfel') => ({
  id,
  kind: 'cad',
  name,
  solid: true,
  transform: [...identity],
  brep: { format: 'OpenCascade-BRep', data: 'DBRep_TaskModel\n1\n', triangulation: false },
  stats: { volume: 1000, bounds: { min: [0, 0, 0], max: [10, 10, 10] }, solids: 1 },
  recipe: { type: 'box', size: [10, 10, 10] },
  source: 'native',
  layerId: 'default',
  folderId: null,
});

test('Component definition validation enforces stable IDs, names and optional fields', () => {
  const valid = validateComponentDefinition({
    id: 'def-huelse-1',
    name: 'Distanzhülse 10mm',
    sourceNodeId: 'cube-1',
    partNumber: 'DH-010',
    description: 'Messing-Distanzhülse',
    metadata: { supplier: 'Normteile' },
  });
  assert.equal(valid.id, 'def-huelse-1');
  assert.equal(valid.name, 'Distanzhülse 10mm');
  assert.equal(valid.sourceNodeId, 'cube-1');
  assert.equal(valid.partNumber, 'DH-010');
  assert.equal(valid.description, 'Messing-Distanzhülse');
  assert.deepEqual(valid.metadata, { supplier: 'Normteile' });

  // Rejections
  assert.throws(() => validateComponentDefinition(null), /Ungültige Bauteildefinition/);
  assert.throws(() => validateComponentDefinition({ id: '', name: 'Test' }), /Ungültige Definitionskennung/);
  assert.throws(() => validateComponentDefinition({ id: 'd1', name: '' }), /Definitionsname mit 1–200 Zeichen/);
  assert.throws(() => validateComponentDefinition({ id: 'd1', name: 'Test', unknown: true }), /Unbekanntes Definitionsfeld/);
  assert.throws(
    () => validateComponentDefinition({ id: 'd1', name: 'Test', partNumber: 'A\nB' }),
    /Teilenummer mit 1–120 Zeichen in einer Zeile/
  );
});

test('Component definitions directory validates version, unique IDs and node references', () => {
  const defs = validateComponentDefinitions({
    version: 1,
    definitions: [
      { id: 'def-1', name: 'Teil 1' },
      { id: 'def-2', name: 'Teil 2', partNumber: 'P-002' },
    ],
  });
  assert.equal(defs.version, 1);
  assert.equal(defs.definitions.length, 2);

  // Duplicate ID rejection
  assert.throws(
    () =>
      validateComponentDefinitions({
        version: 1,
        definitions: [
          { id: 'def-1', name: 'Teil A' },
          { id: 'def-1', name: 'Teil B' },
        ],
      }),
    /Doppelte Definitionskennung def-1/
  );

  // Version mismatch rejection
  assert.throws(
    () =>
      validateComponentDefinitions({
        version: 2,
        definitions: [],
      }),
    /Unbekannte Version des Definitionsverzeichnisses/
  );

  // Dangling definitionId rejection against project nodes
  const nodes = [{ ...sampleCube('part-1'), definitionId: 'def-unbekannt' }];
  assert.throws(
    () =>
      validateComponentDefinitions(
        {
          version: 1,
          definitions: [{ id: 'def-1', name: 'Teil 1' }],
        },
        nodes
      ),
    /Referenzierte Definition def-unbekannt ist im Projekt nicht definiert/
  );
});

test('Definition anlegen und über stabile Kennung wiederfinden', () => {
  const p0 = createCadProject({
    nodes: [sampleCube('part-1', 'Hülse A')],
  });
  assert.equal(findComponentDefinition(p0, 'def-huelse'), null);

  const defInput = {
    id: 'def-huelse',
    name: 'Distanzhülse M5',
    partNumber: 'DIN-912-M5',
  };
  const p1 = registerComponentDefinition(p0, defInput);
  assert.equal(p1.componentDefinitions.version, COMPONENT_DEFINITIONS_VERSION);
  assert.equal(p1.componentDefinitions.definitions.length, 1);

  const found = findComponentDefinition(p1, 'def-huelse');
  assert.ok(found);
  assert.equal(found.id, 'def-huelse');
  assert.equal(found.name, 'Distanzhülse M5');
  assert.equal(found.partNumber, 'DIN-912-M5');

  // Instance attachment and discovery
  attachComponentDefinition(p1.nodes[0], 'def-huelse');
  const instances = findComponentInstances(p1, 'def-huelse');
  assert.equal(instances.length, 1);
  assert.equal(instances[0].id, 'part-1');
});

test('Gleichnamiges Fremdteil ohne diese Definition besitzt eindeutig eine andere Identität', () => {
  const nodeA = sampleCube('sleeve-1', 'Distanzhülse');
  nodeA.transform[12] = 0;
  attachComponentDefinition(nodeA, 'def-distanz');

  const nodeB = sampleCube('sleeve-2', 'Distanzhülse');
  nodeB.transform[12] = 50; // Versetzte zweite Platzierung
  attachComponentDefinition(nodeB, 'def-distanz');

  const foreignNode = sampleCube('sleeve-foreign', 'Distanzhülse');
  foreignNode.transform[12] = 100; // Fremdteil: gleicher Name, keine Definition!

  const otherDefNode = sampleCube('sleeve-other', 'Distanzhülse');
  attachComponentDefinition(otherDefNode, 'def-other');

  const project = cadProjectSnapshot({
    format: 'OfflineCAD',
    version: 36,
    name: 'Baugruppe Distanzen',
    nodes: [nodeA, nodeB, foreignNode, otherDefNode],
    componentDefinitions: {
      version: 1,
      definitions: [
        { id: 'def-distanz', name: 'Distanzhülse', partNumber: 'DH-50' },
        { id: 'def-other', name: 'Distanzhülse Variante 2', partNumber: 'DH-VAR' },
      ],
    },
    bed: [200, 200],
    workplane: { origin: [0, 0, 0], orientation: [0, 0, 0, 1], reference: null },
    coordinateMode: 'plane',
    layers: [{ id: 'default', name: 'Standard', hidden: false, locked: false }],
    folders: [],
    activeLayerId: 'default',
    activeFolderId: null,
    ruler: null,
  });

  // Placements with the same definition share component identity
  assert.equal(isSameComponent(project, nodeA, nodeB), true);

  // Foreign part with the same name does NOT share component identity
  assert.equal(isSameComponent(project, nodeA, foreignNode), false);
  assert.equal(isSameComponent(project, nodeB, foreignNode), false);

  // Part with a different definition does NOT share component identity
  assert.equal(isSameComponent(project, nodeA, otherDefNode), false);

  // Verify identity descriptor structure
  const idA = getComponentIdentity(project, nodeA);
  assert.equal(idA.kind, 'definition');
  assert.equal(idA.definitionId, 'def-distanz');
  assert.equal(idA.partNumber, 'DH-50');

  const idForeign = getComponentIdentity(project, foreignNode);
  assert.equal(idForeign.kind, 'standalone');
  assert.equal(idForeign.nodeId, 'sleeve-foreign');
  assert.equal(idForeign.name, 'Distanzhülse');
  assert.equal(idForeign.definition, null);
});

test('Projekte ohne Definitionen bleiben beim alten Format (5/8/35); Definitionen verlangen Format 36', () => {
  // Plain project without definitions -> format 5
  const plain = createCadProject({
    nodes: [sampleCube('c1')],
  });
  assert.equal(plain.version, 5);
  assert.equal(cadProjectStoredVersion(plain), 5);

  // Project with part number from B01 -> format 35
  const numbered = createCadProject({
    nodes: [
      {
        ...sampleCube('c2'),
        metadata: { partProperties: { version: 1, partNumber: 'NR-100' } },
      },
    ],
  });
  assert.equal(numbered.version, PART_NUMBER_PROJECT_VERSION);
  assert.equal(cadProjectStoredVersion(numbered), PART_NUMBER_PROJECT_VERSION);

  // Project with component definitions -> format 36
  const defNode = sampleCube('c3');
  attachComponentDefinition(defNode, 'def-box');
  const withDefs = cadProjectSnapshot({
    format: 'OfflineCAD',
    version: 5, // Lower declaration will be upgraded to 36
    name: 'Baugruppe',
    nodes: [defNode],
    componentDefinitions: {
      version: 1,
      definitions: [{ id: 'def-box', name: 'Kasten' }],
    },
    bed: [200, 200],
    workplane: { origin: [0, 0, 0], orientation: [0, 0, 0, 1], reference: null },
    coordinateMode: 'plane',
    layers: [{ id: 'default', name: 'Standard', hidden: false, locked: false }],
    folders: [],
    activeLayerId: 'default',
    activeFolderId: null,
    ruler: null,
  });

  assert.equal(withDefs.version, COMPONENT_DEFINITION_PROJECT_VERSION);
  assert.equal(cadProjectStoredVersion(withDefs), COMPONENT_DEFINITION_PROJECT_VERSION);
  assert.equal(hasComponentDefinitions(withDefs), true);

  // Strict parser rejects definition with lower declared format
  assert.throws(
    () => parseCadProject({ ...withDefs, version: 35 }),
    /Bauteildefinitionen benötigen Projektformat 36/
  );
  assert.throws(
    () => parseCadProject({ ...withDefs, version: 34 }),
    /Bauteildefinitionen benötigen Projektformat 36/
  );
  assert.throws(
    () => parseCadProject({ ...withDefs, version: 5 }),
    /Bauteildefinitionen benötigen Projektformat 36/
  );

  // Serializing and deserializing roundtrip preserves component definitions and node definitionIds
  const roundtripped = parseCadProject(serializeCadProject(withDefs));
  assert.equal(roundtripped.version, 36);
  assert.equal(roundtripped.componentDefinitions.definitions.length, 1);
  assert.equal(roundtripped.componentDefinitions.definitions[0].id, 'def-box');
  assert.equal(roundtripped.nodes[0].definitionId, 'def-box');
});

test('Library and FNPACK persistence with component definitions', async () => {
  const node = sampleCube('cube-lib');
  attachComponentDefinition(node, 'def-lib-1');
  const project = cadProjectSnapshot({
    format: 'OfflineCAD',
    version: 36,
    name: 'LibPart',
    nodes: [node],
    componentDefinitions: {
      version: 1,
      definitions: [{ id: 'def-lib-1', name: 'Bibliotheksteil' }],
    },
    bed: [200, 200],
    workplane: { origin: [0, 0, 0], orientation: [0, 0, 0, 1], reference: null },
    coordinateMode: 'plane',
    layers: [{ id: 'default', name: 'Standard', hidden: false, locked: false }],
    folders: [],
    activeLayerId: 'default',
    activeFolderId: null,
    ruler: null,
  });

  // Library version 35 rejects component definitions
  const storage = new Map();
  const persistence = createCadPersistence({
    storage: {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, v),
    },
    transactions: {
      snapshot: () => project,
      preview: async (p) => p,
      revision: () => 'r1',
    },
    verify: async (p) => p,
  });

  const lib35 = {
    format: 'FormnaroCADLibrary',
    version: 35,
    items: [{ id: 'item-1', name: 'Teil 1', project: serializeCadProject(project) }],
  };
  await assert.rejects(
    async () => persistence.importLibrary(JSON.stringify(lib35)),
    /Bauteildefinitionen benötigen Bibliotheksversion 36/
  );

  // Library version 36 accepts it
  const lib36 = {
    format: 'FormnaroCADLibrary',
    version: 36,
    items: [{ id: 'item-1', name: 'Teil 1', project: serializeCadProject(project) }],
  };
  await persistence.importLibrary(JSON.stringify(lib36));
  const listed = persistence.listTemplates();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].project.version, 36);

  // FNPACK package export
  const encoded = encodeFnpackProject(project);
  assert.ok(encoded.blocks.length >= 1);
  assert.equal(encoded.project.version, 36);
  assert.equal(encoded.project.componentDefinitions.definitions[0].id, 'def-lib-1');
  assert.equal(encoded.project.nodes[0].definitionId, 'def-lib-1');
});

test('B02-02: Ergänze einen Einfügeweg für eine zweite Platzierung derselben Definition', () => {
  const firstPlacement = sampleCube('sleeve-1', 'Distanzhülse');
  const baseProject = createCadProject({
    nodes: [firstPlacement],
  });

  // Create definition from existing node
  const { project: pWithDef, definition } = createComponentDefinitionFromNode(baseProject, 'sleeve-1', {
    id: 'def-sleeve-m5',
    name: 'Distanzhülse M5',
    partNumber: 'DH-005',
    description: 'Messinghülse 5mm',
  });

  assert.equal(pWithDef.componentDefinitions.definitions.length, 1);
  assert.equal(pWithDef.nodes[0].definitionId, 'def-sleeve-m5');
  assert.equal(pWithDef.nodes[0].metadata?.partProperties?.partNumber, 'DH-005');

  // Insert second placement with independent transform
  const transform2 = [...identity];
  transform2[12] = 25; // X +25mm
  transform2[13] = 40; // Y +40mm

  const { project: pWithTwo, instance: secondPlacement } = placeComponentInstance(
    pWithDef,
    'def-sleeve-m5',
    {
      id: 'sleeve-2',
      transform: transform2,
    }
  );

  // Verification B02-02
  assert.equal(pWithTwo.nodes.length, 2);
  const [node1, node2] = pWithTwo.nodes;

  // 1. Different node IDs
  assert.equal(node1.id, 'sleeve-1');
  assert.equal(node2.id, 'sleeve-2');
  assert.notEqual(node1.id, node2.id);

  // 2. Both reference the same definition
  assert.equal(node1.definitionId, 'def-sleeve-m5');
  assert.equal(node2.definitionId, 'def-sleeve-m5');

  // 3. Independent transform
  assert.deepEqual(node1.transform, identity);
  assert.deepEqual(node2.transform, transform2);

  // 4. Inherited part properties and geometry
  assert.equal(node1.metadata?.partProperties?.partNumber, 'DH-005');
  assert.equal(node2.metadata?.partProperties?.partNumber, 'DH-005');
  assert.deepEqual(node1.recipe, node2.recipe);
  assert.equal(node1.stats.volume, node2.stats.volume);

  // 5. isSameComponent returns true
  assert.equal(isSameComponent(pWithTwo, node1, node2), true);
});

test('B02-03: Verschiebe die zweite Platzierung unabhängig, Entfernen lässt die erste erhalten', () => {
  const node1 = sampleCube('huelse-1', 'Distanzhülse');
  const node2 = sampleCube('huelse-2', 'Distanzhülse');
  node2.transform[12] = 30;
  attachComponentDefinition(node1, 'def-huelse');
  attachComponentDefinition(node2, 'def-huelse');

  // Fremdteil mit demselben Namen, aber ohne diese Definition
  const foreign = sampleCube('huelse-fremd', 'Distanzhülse');
  foreign.transform[13] = 80;

  let project = cadProjectSnapshot({
    format: 'OfflineCAD',
    version: 36,
    name: 'Baugruppe Test B02-03',
    nodes: [node1, node2, foreign],
    componentDefinitions: {
      version: 1,
      definitions: [{ id: 'def-huelse', name: 'Distanzhülse', partNumber: 'DH-12' }],
    },
    bed: [200, 200],
    workplane: { origin: [0, 0, 0], orientation: [0, 0, 0, 1], reference: null },
    coordinateMode: 'plane',
    layers: [{ id: 'default', name: 'Standard', hidden: false, locked: false }],
    folders: [],
    activeLayerId: 'default',
    activeFolderId: null,
    ruler: null,
  });

  const node1SnapshotBefore = JSON.stringify(project.nodes[0]);
  const foreignSnapshotBefore = JSON.stringify(project.nodes[2]);

  // Unabhängiges Verschieben der zweiten Platzierung
  const movedTransform2 = [...identity];
  movedTransform2[12] = 95;
  movedTransform2[13] = -20;
  movedTransform2[14] = 15;

  const movedProject = moveComponentInstance(project, 'huelse-2', movedTransform2);

  // Nur die Transformationsmatrix von huelse-2 hat sich geändert!
  assert.deepEqual(movedProject.nodes[1].transform, movedTransform2);

  // Erste Platzierung ist bytegleich erhalten geblieben!
  assert.equal(JSON.stringify(movedProject.nodes[0]), node1SnapshotBefore);

  // Fremdteil ist bytegleich erhalten geblieben!
  assert.equal(JSON.stringify(movedProject.nodes[2]), foreignSnapshotBefore);
  assert.equal(isSameComponent(movedProject, movedProject.nodes[0], movedProject.nodes[2]), false);

  // Entfernen der zweiten Platzierung lässt die erste erhalten
  const removedProject = removeComponentInstance(movedProject, 'huelse-2');

  assert.equal(removedProject.nodes.length, 2);
  assert.equal(removedProject.nodes[0].id, 'huelse-1');
  assert.equal(removedProject.nodes[1].id, 'huelse-fremd');
  assert.equal(JSON.stringify(removedProject.nodes[0]), node1SnapshotBefore);

  // Definition im Projektverzeichnis bleibt erhalten
  assert.equal(removedProject.componentDefinitions.definitions.length, 1);
  assert.equal(removedProject.componentDefinitions.definitions[0].id, 'def-huelse');
});

test('B02-04: Führe Definition und Platzierungen durch den OCAD-Dateirundlauf', () => {
  const nodeA = sampleCube('inst-1', 'Bolzen');
  const nodeB = sampleCube('inst-2', 'Bolzen');
  nodeB.transform[12] = 60;
  nodeB.transform[13] = 15;
  attachComponentDefinition(nodeA, 'def-bolzen');
  attachComponentDefinition(nodeB, 'def-bolzen');

  const foreign = sampleCube('foreign-bolzen', 'Bolzen');
  foreign.transform[12] = -40;

  const original = cadProjectSnapshot({
    format: 'OfflineCAD',
    version: 36,
    name: 'OCAD Rundlauf Baugruppe',
    nodes: [nodeA, nodeB, foreign],
    componentDefinitions: {
      version: 1,
      definitions: [{ id: 'def-bolzen', name: 'Zylinderbolzen', partNumber: 'BOLT-8X40' }],
    },
    bed: [200, 200],
    workplane: { origin: [0, 0, 0], orientation: [0, 0, 0, 1], reference: null },
    coordinateMode: 'plane',
    layers: [{ id: 'default', name: 'Standard', hidden: false, locked: false }],
    folders: [],
    activeLayerId: 'default',
    activeFolderId: null,
    ruler: null,
  });

  // OCAD Dateirundlauf
  const serialized = serializeCadProject(original);
  assert.equal(typeof serialized, 'string');
  assert.ok(serialized.includes('"componentDefinitions"'));
  assert.ok(serialized.includes('"definitionId":"def-bolzen"'));

  const restored = parseCadProject(serialized);

  assert.equal(restored.version, 36);
  assert.equal(restored.componentDefinitions.definitions.length, 1);
  assert.equal(restored.componentDefinitions.definitions[0].id, 'def-bolzen');
  assert.equal(restored.componentDefinitions.definitions[0].partNumber, 'BOLT-8X40');

  assert.equal(restored.nodes.length, 3);
  assert.equal(restored.nodes[0].id, 'inst-1');
  assert.equal(restored.nodes[0].definitionId, 'def-bolzen');
  assert.deepEqual(restored.nodes[0].transform, identity);

  assert.equal(restored.nodes[1].id, 'inst-2');
  assert.equal(restored.nodes[1].definitionId, 'def-bolzen');
  assert.deepEqual(restored.nodes[1].transform, nodeB.transform);

  assert.equal(restored.nodes[2].id, 'foreign-bolzen');
  assert.equal(restored.nodes[2].definitionId, undefined);
  assert.deepEqual(restored.nodes[2].transform, foreign.transform);

  // Beide Platzierungen verweisen weiterhin auf dieselbe Definition
  assert.equal(isSameComponent(restored, restored.nodes[0], restored.nodes[1]), true);
  assert.equal(isSameComponent(restored, restored.nodes[0], restored.nodes[2]), false);

  // Alte Einzelteile ohne Definitionen behalten ihr Mindestformat (keine Zwangsmigration)
  const legacy5 = createCadProject({ nodes: [sampleCube('leg-5')] });
  assert.equal(parseCadProject(serializeCadProject(legacy5)).version, 5);

  const legacy35 = createCadProject({
    nodes: [{ ...sampleCube('leg-35'), metadata: { partProperties: { version: 1, partNumber: 'P-35' } } }],
  });
  assert.equal(parseCadProject(serializeCadProject(legacy35)).version, 35);
});

test('B02-05: Wiederhole den Rundlauf mit nachgeladenen FNPACK-Blöcken', async () => {
  const node1 = sampleCube('pack-inst-1', 'Stift');
  const node2 = sampleCube('pack-inst-2', 'Stift');
  node2.transform[12] = 120;
  attachComponentDefinition(node1, 'def-stift');
  attachComponentDefinition(node2, 'def-stift');

  const foreign = sampleCube('pack-foreign', 'Stift');
  foreign.transform[13] = 45;

  const project = cadProjectSnapshot({
    format: 'OfflineCAD',
    version: 36,
    name: 'FNPACK Rundlauf Baugruppe',
    nodes: [node1, node2, foreign],
    componentDefinitions: {
      version: 1,
      definitions: [{ id: 'def-stift', name: 'Zylinderstift', partNumber: 'ISO-2338-6x30' }],
    },
    bed: [200, 200],
    workplane: { origin: [0, 0, 0], orientation: [0, 0, 0, 1], reference: null },
    coordinateMode: 'plane',
    layers: [{ id: 'default', name: 'Standard', hidden: false, locked: false }],
    folders: [],
    activeLayerId: 'default',
    activeFolderId: null,
    ruler: null,
  });

  // 1. In FNPACK-Paket kodieren
  const encoded = encodeFnpackProject(project);
  assert.equal(encoded.project.version, 36);

  // 2. Paketindex über backend/fnpack.cjs validateIndex prüfen
  let blockOffset = 0;
  const blocks = encoded.blocks.map((b) => {
    const entry = { bytes: b.bytes.length, kind: 'brep', offset: blockOffset, sha256: b.sha256 };
    blockOffset += b.bytes.length;
    return entry;
  });
  const index = validateIndex({
    format: 'FormnaroPackage',
    version: 1,
    project: encoded.project,
    blocks,
  });
  assert.equal(index.project.version, 36);
  assert.equal(index.project.componentDefinitions.definitions.length, 1);

  // 3. Geometrieblöcke nachladen über Resolver
  const blockMap = new Map(encoded.blocks.map((b) => [b.sha256, b.bytes]));
  const resolver = createFnpackResolver({
    readBlock: async (hash) => {
      const bytes = blockMap.get(hash);
      if (!bytes) throw Error('Block nicht gefunden: ' + hash);
      return bytes;
    },
  });

  const hydrated = await resolver.hydrate(encoded.project);
  assert.equal(hydrated.nodes[0].brep.format, 'OpenCascade-BRep');
  assert.equal(hydrated.nodes[1].brep.format, 'OpenCascade-BRep');

  // 4. Als sauberes Projekt materialisieren
  const materialized = materializedFnpackProject(hydrated);

  // Verifikation B02-05
  assert.equal(materialized.version, 36);
  assert.equal(materialized.componentDefinitions.definitions.length, 1);
  assert.equal(materialized.componentDefinitions.definitions[0].id, 'def-stift');
  assert.equal(materialized.componentDefinitions.definitions[0].partNumber, 'ISO-2338-6x30');

  assert.equal(materialized.nodes.length, 3);
  assert.equal(materialized.nodes[0].id, 'pack-inst-1');
  assert.equal(materialized.nodes[0].definitionId, 'def-stift');
  assert.deepEqual(materialized.nodes[0].transform, identity);

  assert.equal(materialized.nodes[1].id, 'pack-inst-2');
  assert.equal(materialized.nodes[1].definitionId, 'def-stift');
  assert.deepEqual(materialized.nodes[1].transform, node2.transform);

  assert.equal(materialized.nodes[2].id, 'pack-foreign');
  assert.equal(materialized.nodes[2].definitionId, undefined);

  // Beide Platzierungen teilen dieselbe Definition
  assert.equal(isSameComponent(materialized, materialized.nodes[0], materialized.nodes[1]), true);
  assert.equal(isSameComponent(materialized, materialized.nodes[0], materialized.nodes[2]), false);
});

test('B03-01: Ändere die Länge einer Definition mit vier platzierten Distanzhülsen', () => {
  // 4 Distanzhülsen mit unabhängigen Positionen (Transform-Matrizen)
  const sleeves = [0, 25, 50, 75].map((xOffset, idx) => {
    const node = sampleCube(`huelse-${idx + 1}`, 'Distanzhülse');
    node.transform = [...identity];
    node.transform[12] = xOffset;
    node.recipe = { type: 'cylinder', size: [12, 12, 20] };
    node.stats = { volume: 2261.9, bounds: { min: [-6, -6, 0], max: [6, 6, 20] }, solids: 1 };
    attachComponentDefinition(node, 'def-distanz');
    return node;
  });

  // Fremdteil mit gleichem Namen 'Distanzhülse', aber ohne Bauteildefinition
  const foreignSleeve = sampleCube('huelse-fremd', 'Distanzhülse');
  foreignSleeve.transform = [...identity];
  foreignSleeve.transform[13] = 100;
  foreignSleeve.recipe = { type: 'cylinder', size: [16, 16, 15] };
  foreignSleeve.stats = { volume: 3015.9, bounds: { min: [-8, -8, 0], max: [8, 8, 15] }, solids: 1 };

  const project = cadProjectSnapshot({
    format: 'OfflineCAD',
    version: 36,
    name: 'Baugruppe Distanzhülsen B03-01',
    nodes: [...sleeves, foreignSleeve],
    componentDefinitions: {
      version: 1,
      definitions: [{ id: 'def-distanz', name: 'Distanzhülse', partNumber: 'DH-020' }],
    },
    bed: [200, 200],
    workplane: { origin: [0, 0, 0], orientation: [0, 0, 0, 1], reference: null },
    coordinateMode: 'plane',
    layers: [{ id: 'default', name: 'Standard', hidden: false, locked: false }],
    folders: [],
    activeLayerId: 'default',
    activeFolderId: null,
    ruler: null,
  });

  const foreignSnapshotBefore = JSON.stringify(project.nodes[4]);

  // Gemeinsame Änderung der Definition: Länge von 20 auf 35 mm (size[2])
  const { project: updatedProject } = updateComponentDefinition(project, 'def-distanz', {
    name: 'Distanzhülse 35mm',
    partNumber: 'DH-035',
    recipe: { type: 'cylinder', size: [12, 12, 35] },
    stats: { volume: 3958.4, bounds: { min: [-6, -6, 0], max: [6, 6, 35] }, solids: 1 },
  });

  // Verifikation B03-01:
  // 1. Alle 4 Längen ändern sich synchron
  for (let i = 0; i < 4; i++) {
    const node = updatedProject.nodes[i];
    assert.equal(node.id, `huelse-${i + 1}`);
    assert.equal(node.definitionId, 'def-distanz');
    assert.equal(node.recipe.size[2], 35);
    assert.equal(node.stats.volume, 3958.4);
    assert.equal(node.metadata?.partProperties?.partNumber, 'DH-035');
    // 2. Die vier Platzierungen (Transforms) bleiben exakt erhalten
    assert.equal(node.transform[12], i * 25);
  }

  // 3. Fremdteil bleibt unberührt
  assert.equal(JSON.stringify(updatedProject.nodes[4]), foreignSnapshotBefore);
  assert.equal(updatedProject.nodes[4].recipe.size[2], 15);
  assert.equal(isSameComponent(updatedProject, updatedProject.nodes[0], updatedProject.nodes[4]), false);
});

test('B03-02: Löse eine einzelne Platzierung in eine eigene Definition', () => {
  // 4 Distanzhülsen auf Format 36
  const sleeves = [0, 25, 50, 75].map((xOffset, idx) => {
    const node = sampleCube(`huelse-${idx + 1}`, 'Distanzhülse');
    node.transform = [...identity];
    node.transform[12] = xOffset;
    node.recipe = { type: 'cylinder', size: [12, 12, 35] };
    node.stats = { volume: 3958.4, bounds: { min: [-6, -6, 0], max: [6, 6, 35] }, solids: 1 };
    attachComponentDefinition(node, 'def-distanz');
    return node;
  });

  const foreignSleeve = sampleCube('huelse-fremd', 'Distanzhülse');
  foreignSleeve.transform = [...identity];
  foreignSleeve.transform[13] = 100;
  foreignSleeve.recipe = { type: 'cylinder', size: [16, 16, 15] };

  let project = cadProjectSnapshot({
    format: 'OfflineCAD',
    version: 36,
    name: 'Baugruppe Distanzhülsen B03-02',
    nodes: [...sleeves, foreignSleeve],
    componentDefinitions: {
      version: 1,
      definitions: [{ id: 'def-distanz', name: 'Distanzhülse', partNumber: 'DH-035' }],
    },
    bed: [200, 200],
    workplane: { origin: [0, 0, 0], orientation: [0, 0, 0, 1], reference: null },
    coordinateMode: 'plane',
    layers: [{ id: 'default', name: 'Standard', hidden: false, locked: false }],
    folders: [],
    activeLayerId: 'default',
    activeFolderId: null,
    ruler: null,
  });

  // 1. Löse eine einzelne Platzierung (huelse-4) in eine eigene Definition
  const unlinkedResult = unlinkComponentInstance(project, 'huelse-4', {
    newDefinitionId: 'def-distanz-huelse-4',
    name: 'Distanzhülse Sonderlänge',
    partNumber: 'DH-SONDER',
  });

  const projectAfterUnlink = unlinkedResult.project ?? unlinkedResult;

  // Verifikation des Lösens:
  assert.equal(projectAfterUnlink.componentDefinitions.definitions.length, 2);
  const def1 = findComponentDefinition(projectAfterUnlink, 'def-distanz');
  const def2 = findComponentDefinition(projectAfterUnlink, 'def-distanz-huelse-4');
  assert.ok(def1);
  assert.ok(def2);
  assert.equal(def2.partNumber, 'DH-SONDER');

  // Genau 3 verknüpfte Hülsen und 1 gelöste Hülse
  const instancesDef1 = findComponentInstances(projectAfterUnlink, 'def-distanz');
  const instancesDef2 = findComponentInstances(projectAfterUnlink, 'def-distanz-huelse-4');
  assert.equal(instancesDef1.length, 3);
  assert.equal(instancesDef2.length, 1);
  assert.equal(instancesDef2[0].id, 'huelse-4');

  // Identitätsprüfung: huelse-1..3 teilen Identität, huelse-4 hat neue Identität
  assert.equal(isSameComponent(projectAfterUnlink, projectAfterUnlink.nodes[0], projectAfterUnlink.nodes[1]), true);
  assert.equal(isSameComponent(projectAfterUnlink, projectAfterUnlink.nodes[0], projectAfterUnlink.nodes[3]), false);

  // 2. Zweite Längenänderung an der ursprünglichen Definition (Länge 35 -> 50 mm)
  const { project: projectAfterSecondUpdate } = updateComponentDefinition(projectAfterUnlink, 'def-distanz', {
    name: 'Distanzhülse 50mm',
    partNumber: 'DH-050',
    recipe: { type: 'cylinder', size: [12, 12, 50] },
    stats: { volume: 5654.8, bounds: { min: [-6, -6, 0], max: [6, 6, 50] }, solids: 1 },
  });

  // Verifikation B03-02:
  // Die zweite Längenänderung erreicht genau die 3 verknüpften Hülsen:
  for (let i = 0; i < 3; i++) {
    const node = projectAfterSecondUpdate.nodes[i];
    assert.equal(node.recipe.size[2], 50);
    assert.equal(node.stats.volume, 5654.8);
    assert.equal(node.metadata?.partProperties?.partNumber, 'DH-050');
  }

  // Die 1 gelöste Hülse (huelse-4) bleibt unverändert auf Länge 35 mm!
  const unlinkedNode = projectAfterSecondUpdate.nodes[3];
  assert.equal(unlinkedNode.id, 'huelse-4');
  assert.equal(unlinkedNode.definitionId, 'def-distanz-huelse-4');
  assert.equal(unlinkedNode.recipe.size[2], 35);
  assert.equal(unlinkedNode.stats.volume, 3958.4);
  assert.equal(unlinkedNode.metadata?.partProperties?.partNumber, 'DH-SONDER');

  // Fremdteil bleibt unberührt
  assert.equal(projectAfterSecondUpdate.nodes[4].recipe.size[2], 15);
});

test('B03-03: Prüfe Undo und Wiederöffnen für die gelöste Verwendung', async () => {
  // Basis-Projekt mit 4 Distanzhülsen
  const sleeves = [0, 25, 50, 75].map((xOffset, idx) => {
    const node = sampleCube(`huelse-${idx + 1}`, 'Distanzhülse');
    node.transform = [...identity];
    node.transform[12] = xOffset;
    node.recipe = { type: 'cylinder', size: [12, 12, 20] };
    node.stats = { volume: 2261.9, bounds: { min: [-6, -6, 0], max: [6, 6, 20] }, solids: 1 };
    attachComponentDefinition(node, 'def-distanz');
    return node;
  });

  const foreignSleeve = sampleCube('huelse-fremd', 'Distanzhülse');
  foreignSleeve.transform = [...identity];
  foreignSleeve.transform[13] = 100;
  foreignSleeve.recipe = { type: 'cylinder', size: [16, 16, 15] };

  const initialProject = cadProjectSnapshot({
    format: 'OfflineCAD',
    version: 36,
    name: 'Baugruppe Distanzhülsen B03-03',
    nodes: [...sleeves, foreignSleeve],
    componentDefinitions: {
      version: 1,
      definitions: [{ id: 'def-distanz', name: 'Distanzhülse', partNumber: 'DH-020' }],
    },
    bed: [200, 200],
    workplane: { origin: [0, 0, 0], orientation: [0, 0, 0, 1], reference: null },
    coordinateMode: 'plane',
    layers: [{ id: 'default', name: 'Standard', hidden: false, locked: false }],
    folders: [],
    activeLayerId: 'default',
    activeFolderId: null,
    ruler: null,
  });

  // Transaktionsspeicher mit Snapshot-Undo
  const store = createCadTransactions({
    initial: initialProject,
    build: async (draft) => draft,
  });

  // Schritt 1: Längenänderung aller 4 Hülsen auf 35 mm
  const { project: pStep1 } = updateComponentDefinition(store.snapshot(), 'def-distanz', {
    recipe: { type: 'cylinder', size: [12, 12, 35] },
    stats: { volume: 3958.4, bounds: { min: [-6, -6, 0], max: [6, 6, 35] }, solids: 1 },
  });
  const preview1 = await store.preview({ revision: store.revision(), project: pStep1, label: 'Länge 35mm' });
  store.apply(preview1);
  assert.equal(store.snapshot().nodes[0].recipe.size[2], 35);
  assert.equal(store.snapshot().nodes[3].recipe.size[2], 35);

  // Schritt 2: Eine Hülse (huelse-4) lösen
  const { project: pStep2 } = unlinkComponentInstance(store.snapshot(), 'huelse-4', {
    newDefinitionId: 'def-distanz-huelse-4',
    name: 'Distanzhülse Sonderlänge',
    partNumber: 'DH-SONDER',
  });
  const preview2 = await store.preview({ revision: store.revision(), project: pStep2, label: 'Hülse 4 lösen' });
  store.apply(preview2);
  assert.equal(store.snapshot().componentDefinitions.definitions.length, 2);
  assert.equal(store.snapshot().nodes[3].definitionId, 'def-distanz-huelse-4');

  // Schritt 3: Zweite Längenänderung für def-distanz auf 50 mm
  const { project: pStep3 } = updateComponentDefinition(store.snapshot(), 'def-distanz', {
    recipe: { type: 'cylinder', size: [12, 12, 50] },
    stats: { volume: 5654.8, bounds: { min: [-6, -6, 0], max: [6, 6, 50] }, solids: 1 },
  });
  const preview3 = await store.preview({ revision: store.revision(), project: pStep3, label: 'Länge 50mm' });
  store.apply(preview3);
  assert.equal(store.snapshot().nodes[0].recipe.size[2], 50);
  assert.equal(store.snapshot().nodes[3].recipe.size[2], 35);

  // --- UNDO PRÜFUNG ---
  // Undo Schritt 3: stellt Stand nach Schritt 2 wieder her (Länge der verknüpften Hülsen wieder 35)
  const undoResult1 = store.undo();
  assert.equal(undoResult1.changed, true);
  assert.equal(store.snapshot().nodes[0].recipe.size[2], 35);
  assert.equal(store.snapshot().nodes[3].recipe.size[2], 35);
  assert.equal(store.snapshot().nodes[3].definitionId, 'def-distanz-huelse-4');

  // Undo Schritt 2: stellt frühere Zuordnung wieder her (alle 4 wieder verknüpft mit def-distanz)
  const undoResult2 = store.undo();
  assert.equal(undoResult2.changed, true);
  assert.equal(store.snapshot().componentDefinitions.definitions.length, 1);
  assert.equal(store.snapshot().nodes[3].definitionId, 'def-distanz');
  assert.equal(isSameComponent(store.snapshot(), store.snapshot().nodes[0], store.snapshot().nodes[3]), true);

  // --- REDO PRÜFUNG ---
  // Redo Schritt 2: Hülse 4 wieder gelöst
  store.redo();
  assert.equal(store.snapshot().componentDefinitions.definitions.length, 2);
  assert.equal(store.snapshot().nodes[3].definitionId, 'def-distanz-huelse-4');

  // Redo Schritt 3: Länge 50mm für die 3 verknüpften
  store.redo();
  assert.equal(store.snapshot().nodes[0].recipe.size[2], 50);
  assert.equal(store.snapshot().nodes[3].recipe.size[2], 35);

  // --- WIEDERÖFFNEN PRÜFUNG (OCAD Rundlauf) ---
  // Die gespeicherte gelöste Fassung öffnet exakt mit 3 verknüpften + 1 gelösten Verwendung
  const serialized = serializeCadProject(store.snapshot());
  const reopened = parseCadProject(serialized);

  assert.equal(reopened.version, 36);
  assert.equal(reopened.componentDefinitions.definitions.length, 2);

  // 3 verknüpfte Hülsen
  const def1Instances = findComponentInstances(reopened, 'def-distanz');
  assert.equal(def1Instances.length, 3);
  for (const inst of def1Instances) {
    assert.equal(inst.recipe.size[2], 50);
  }

  // 1 gelöste Hülse
  const def2Instances = findComponentInstances(reopened, 'def-distanz-huelse-4');
  assert.equal(def2Instances.length, 1);
  assert.equal(def2Instances[0].id, 'huelse-4');
  assert.equal(def2Instances[0].recipe.size[2], 35);
  assert.equal(def2Instances[0].metadata?.partProperties?.partNumber, 'DH-SONDER');

  // Fremdteil intakt
  const foreignNode = reopened.nodes.find((n) => n.id === 'huelse-fremd');
  assert.ok(foreignNode);
  assert.equal(foreignNode.definitionId, undefined);
  assert.equal(foreignNode.recipe.size[2], 15);
});

test('B03-04: Prüfe eine gesperrte Abhängigkeit und ein gleichnamiges Fremdteil', () => {
  // 4 Distanzhülsen mit Organization (Layer und Folder)
  const sleeves = [0, 25, 50, 75].map((xOffset, idx) => {
    const node = sampleCube(`huelse-${idx + 1}`, 'Distanzhülse');
    node.transform = [...identity];
    node.transform[12] = xOffset;
    node.recipe = { type: 'cylinder', size: [12, 12, 20] };
    node.stats = { volume: 2261.9, bounds: { min: [-6, -6, 0], max: [6, 6, 20] }, solids: 1 };
    attachComponentDefinition(node, 'def-distanz');
    return node;
  });

  const foreignSleeve = sampleCube('huelse-fremd', 'Distanzhülse');
  foreignSleeve.transform = [...identity];
  foreignSleeve.transform[13] = 100;
  foreignSleeve.recipe = { type: 'cylinder', size: [16, 16, 15] };
  foreignSleeve.stats = { volume: 3015.9, bounds: { min: [-8, -8, 0], max: [8, 8, 15] }, solids: 1 };

  const project = cadProjectSnapshot({
    format: 'OfflineCAD',
    version: 36,
    name: 'Baugruppe Distanzhülsen B03-04',
    nodes: [...sleeves, foreignSleeve],
    componentDefinitions: {
      version: 1,
      definitions: [{ id: 'def-distanz', name: 'Distanzhülse', partNumber: 'DH-020' }],
    },
    bed: [200, 200],
    workplane: { origin: [0, 0, 0], orientation: [0, 0, 0, 1], reference: null },
    coordinateMode: 'plane',
    layers: [
      { id: 'default', name: 'Standard', hidden: false, locked: false },
      { id: 'locked-layer', name: 'Gesperrter Layer', hidden: false, locked: true },
    ],
    folders: [
      { id: 'locked-folder', name: 'Gesperrter Ordner', layerId: 'default', parentId: null, hidden: false, locked: true },
    ],
    activeLayerId: 'default',
    activeFolderId: null,
    ruler: null,
  });

  const projectSnapshotOriginal = JSON.stringify(project);

  // 1. Gesperrter Knoten: node.locked = true
  const projectWithLockedNode = structuredClone(project);
  projectWithLockedNode.nodes[1].locked = true; // huelse-2 ist gesperrt
  const lockedNodeSnapshotBefore = JSON.stringify(projectWithLockedNode);

  assert.throws(
    () =>
      updateComponentDefinition(projectWithLockedNode, 'def-distanz', {
        recipe: { type: 'cylinder', size: [12, 12, 99] },
      }),
    /Platzierung huelse-2 der Definition def-distanz ist gesperrt/
  );
  // Atomare Ablehnung: Projekt bleibt byteidentisch
  assert.equal(JSON.stringify(projectWithLockedNode), lockedNodeSnapshotBefore);

  // 2. Gesperrter Layer: Node auf gesperrtem Layer
  const projectWithLockedLayer = structuredClone(project);
  projectWithLockedLayer.nodes[2].layerId = 'locked-layer'; // huelse-3 liegt auf gesperrtem Layer
  const lockedLayerSnapshotBefore = JSON.stringify(projectWithLockedLayer);

  assert.throws(
    () =>
      updateComponentDefinition(projectWithLockedLayer, 'def-distanz', {
        recipe: { type: 'cylinder', size: [12, 12, 99] },
      }),
    /Platzierung huelse-3 der Definition def-distanz ist gesperrt/
  );
  assert.equal(JSON.stringify(projectWithLockedLayer), lockedLayerSnapshotBefore);

  // 3. Gesperrter Ordner: Node in gesperrtem Ordner
  const projectWithLockedFolder = structuredClone(project);
  projectWithLockedFolder.nodes[2].folderId = 'locked-folder'; // huelse-3 in gesperrtem Ordner
  const lockedFolderSnapshotBefore = JSON.stringify(projectWithLockedFolder);

  assert.throws(
    () =>
      updateComponentDefinition(projectWithLockedFolder, 'def-distanz', {
        recipe: { type: 'cylinder', size: [12, 12, 99] },
      }),
    /Platzierung huelse-3 der Definition def-distanz ist gesperrt/
  );
  assert.equal(JSON.stringify(projectWithLockedFolder), lockedFolderSnapshotBefore);

  // 4. Gesperrter Knoten beim Lösen: unlinkComponentInstance verweigert atomar
  const projectToUnlinkLocked = structuredClone(project);
  projectToUnlinkLocked.nodes[3].locked = true; // huelse-4 gesperrt
  const unlinkedLockedBefore = JSON.stringify(projectToUnlinkLocked);

  assert.throws(
    () => unlinkComponentInstance(projectToUnlinkLocked, 'huelse-4'),
    /Platzierung huelse-4 ist gesperrt und kann nicht geändert oder gelöst werden/
  );
  assert.equal(JSON.stringify(projectToUnlinkLocked), unlinkedLockedBefore);

  // 5. Unauflösbare Abhängigkeit (unbekannte Definition / defekte Referenz)
  assert.throws(
    () => updateComponentDefinition(project, 'def-unbekannt', { recipe: { type: 'cylinder', size: [12, 12, 99] } }),
    /Referenzierte Definition def-unbekannt ist im Projekt nicht definiert/
  );

  assert.throws(
    () => unlinkComponentInstance(project, 'huelse-fremd'),
    /Knoten huelse-fremd ist keiner Bauteildefinition zugeordnet/
  );

  assert.throws(
    () => unlinkComponentInstance(project, 'unbekannter-knoten'),
    /Instanz unbekannter-knoten nicht im Projekt gefunden/
  );

  const projectWithBrokenNode = structuredClone(project);
  projectWithBrokenNode.nodes[0].brokenReference = true;
  assert.throws(
    () => updateComponentDefinition(projectWithBrokenNode, 'def-distanz', { recipe: { type: 'cylinder', size: [12, 12, 99] } }),
    /Platzierung huelse-1 besitzt eine unauflösbare Abhängigkeit/
  );

  // 6. Gleichnamiges Fremdteil: wird niemals mitgeändert
  const { project: validUpdateProject } = updateComponentDefinition(project, 'def-distanz', {
    recipe: { type: 'cylinder', size: [12, 12, 42] },
  });
  const foreignAfter = validUpdateProject.nodes.find((n) => n.id === 'huelse-fremd');
  assert.ok(foreignAfter);
  assert.equal(foreignAfter.recipe.size[2], 15); // Behält sein Maß 15 mm!
  assert.equal(foreignAfter.stats.volume, 3015.9);
  assert.equal(foreignAfter.definitionId, undefined);

  // Ursprungsprojekt bleibt vollkommen unberührt
  assert.equal(JSON.stringify(project), projectSnapshotOriginal);
});
