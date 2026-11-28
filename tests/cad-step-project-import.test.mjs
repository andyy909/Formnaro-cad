import test from 'node:test';
import assert from 'node:assert/strict';
import { createCadProject, parseCadProject, serializeCadProject } from '../src/cad-project.js';
import { createCadService } from '../src/cad-service.js';
import { importStepProject } from '../src/cad-step-project-import.js';
import { findComponentDefinition, findComponentInstances } from '../src/cad-component-definitions.js';
import { cadIdentity, inverseCadMatrix } from '../src/cad-affine.js';
import { readCadBrep, transformCad, validateCadSolid, writeCadBrep } from '../src/cad-native-kernel.js';
import { loadCadKernel } from '../src/cad-kernel-loader.js';
import { importCadStepAssembly } from '../src/cad-step-io.js';
import { stepOccurrenceFixture } from './fixtures/cad-exchange-step-occurrences.mjs';
import {
  stepProjectReaderTree,
  stepProjectReaderWorlds,
  stepProjectReaderAmbiguousTree,
  stepProjectReaderOldTree,
  rotationZ,
  identity,
  bearingStats,
} from './fixtures/cad-step-project-reader.mjs';

const oc = await loadCadKernel({ print: () => {}, printErr: () => {} }),
  near = (actual, expected, message) =>
    assert.ok(Math.abs(actual - expected) < 1e-5, message ?? `${actual} != ${expected}`),
  nearBounds = (bounds, min, max, label = 'Grenzen') => {
    min.forEach((value, index) => near(bounds.min[index], value, `${label}.min[${index}]`));
    max.forEach((value, index) => near(bounds.max[index], value, `${label}.max[${index}]`));
  },
  extents = (stats) => stats.bounds.max.map((value, index) => value - stats.bounds.min[index]),
  byName = (project, name) => project.nodes.filter((node) => node.name === name),
  folder = (project, name) => project.folders.find((entry) => entry.name === name);

test('New reader contract keeps local definition geometry, world placement, instance names and one shared definition', () => {
  const project = createCadProject(),
    ids = importStepProject(project, stepProjectReaderTree(), {
      name: 'Referenz.step',
      id: 'imported',
      metadata: { importedFile: { name: 'Referenz.step', type: 'step' } },
    }),
    worlds = stepProjectReaderWorlds();

  assert.deepEqual(
    project.nodes.map((node) => node.name),
    ['Grundplatte', 'Lager', 'Lager rechts'],
  );
  assert.equal(ids.length, 3);
  assert.equal(ids[0], 'imported');
  assert.equal(new Set(ids).size, 3, 'jede Instanz erhält eine eigene Knoten-ID');
  assert.deepEqual(
    project.nodes.map((node) => node.id),
    ids,
  );

  // One folder per import, then the occurrence tree: the plate lives in the
  // assembly root, both bearings in the "Antrieb" subassembly. Every instance
  // is filed into the folder of its own occurrence path.
  assert.deepEqual(
    project.folders.map((entry) => entry.name),
    ['Referenz.step', 'Prüfbaugruppe', 'Antrieb'],
  );
  const top = folder(project, 'Referenz.step'),
    root = folder(project, 'Prüfbaugruppe'),
    drive = folder(project, 'Antrieb');
  assert.equal(top.parentId, null);
  assert.equal(root.parentId, top.id);
  assert.equal(drive.parentId, root.id);
  assert.equal(project.nodes[0].folderId, root.id);
  assert.equal(project.nodes[1].folderId, drive.id);
  assert.equal(project.nodes[2].folderId, drive.id);

  // The node transform is the reader's column-major world placement, not the
  // identity and not a second copy of the placement inside the BRep.
  project.nodes.forEach((node, index) => assert.deepEqual(node.transform, worlds[index]));
  assert.deepEqual(project.nodes[0].transform, identity());
  near(project.nodes[1].transform[12], 40);
  near(project.nodes[2].transform[13], 12);

  // Local definition geometry: both bearings carry the same local body and
  // local 10x6x4 statistics instead of world-baked copies.
  assert.equal(project.nodes[1].brep.data, project.nodes[2].brep.data);
  assert.notEqual(project.nodes[0].brep.data, project.nodes[1].brep.data);
  for (const node of [project.nodes[1], project.nodes[2]]) {
    near(node.stats.volume, 240);
    assert.deepEqual(
      extents(node.stats).map((value) => Math.round(value)),
      [10, 6, 4],
    );
  }
  near(project.nodes[0].stats.volume, 30000);

  // Format 36: one definition, the first occurrence is its source body.
  assert.equal(project.version, 36);
  assert.equal(project.componentDefinitions.version, 1);
  assert.equal(project.componentDefinitions.definitions.length, 1);
  const definition = project.componentDefinitions.definitions[0];
  assert.equal(definition.name, 'Lager');
  assert.equal(definition.sourceNodeId, ids[1]);
  assert.equal(findComponentDefinition(project, definition.id)?.id, definition.id);
  assert.deepEqual(
    findComponentInstances(project, definition.id).map((node) => node.id),
    [ids[1], ids[2]],
  );
  assert.equal(project.nodes[1].definitionId, definition.id);
  assert.equal(project.nodes[2].definitionId, definition.id);
  assert.equal('definitionId' in project.nodes[0], false, 'ein Teil ohne Definition bleibt eigenständig');

  // Colours are kept per part and per face, including the 5 % opacity floor.
  assert.equal(project.nodes[0].color, '#cc3322');
  assert.deepEqual(project.nodes[0].metadata.stepFaceColors, [{ faceIndex: 3, color: '#2277cc', opacity: 1 }]);
  assert.equal(project.nodes[2].opacity, 0.8);
  assert.equal(project.nodes[1].opacity, 1);

  const parsed = parseCadProject(serializeCadProject(project));
  assert.deepEqual(parsed, project, 'Projektformat 36 übersteht Speichern und Öffnen');
  assert.equal(parsed.version, 36);
});

test('Every file import creates a fresh definition mapping instead of reusing names or geometry', () => {
  const project = createCadProject(),
    firstIds = importStepProject(project, stepProjectReaderTree(), { name: 'erst.step' }),
    firstDefinitions = structuredClone(project.componentDefinitions),
    secondIds = importStepProject(project, stepProjectReaderTree(), { name: 'zweit.step' });

  assert.equal(project.nodes.length, 6);
  assert.equal(project.folders.length, 6);
  assert.equal(project.componentDefinitions.definitions.length, 2);
  const [first, second] = project.componentDefinitions.definitions;
  assert.notEqual(first.id, second.id, 'kein Namensabgleich zwischen Importen');
  assert.equal(first.name, 'Lager');
  assert.equal(second.name, 'Lager');
  assert.deepEqual(firstDefinitions, {
    version: 1,
    definitions: [first],
  });
  assert.equal(first.sourceNodeId, firstIds[1]);
  assert.equal(second.sourceNodeId, secondIds[1]);

  const nodes = new Map(project.nodes.map((node) => [node.id, node]));
  assert.equal(nodes.get(firstIds[1]).definitionId, first.id);
  assert.equal(nodes.get(firstIds[2]).definitionId, first.id);
  assert.equal(nodes.get(secondIds[1]).definitionId, second.id);
  assert.equal(nodes.get(secondIds[2]).definitionId, second.id);
  assert.notEqual(nodes.get(firstIds[1]).brep, nodes.get(secondIds[1]).brep);
  // Two imports of the same file never share a folder either.
  assert.notEqual(project.folders[2].id, project.folders[5].id);
});

test('Same names and equal geometry never imply a definition', () => {
  const project = createCadProject();
  importStepProject(project, stepProjectReaderAmbiguousTree(), { name: 'Namen.step' });
  assert.deepEqual(
    project.nodes.map((node) => node.name),
    ['Lager', 'Lager', 'Lager'],
  );
  assert.equal(project.componentDefinitions.definitions.length, 2);
  assert.equal('definitionId' in project.nodes[0], false, 'gleicher Name ohne Kennung bleibt eigenständig');
  const [a, b] = project.componentDefinitions.definitions;
  assert.notEqual(a.id, b.id, 'gleiche Geometrie mit anderer Kennung bleibt getrennt');
  assert.equal(project.nodes[1].definitionId, a.id);
  assert.equal(project.nodes[2].definitionId, b.id);
  assert.equal(a.sourceNodeId, project.nodes[1].id);
  assert.equal(b.sourceNodeId, project.nodes[2].id);
});

test('Old reader contract stays world-baked and receives the import placement', () => {
  const project = createCadProject(),
    ids = importStepProject(project, stepProjectReaderOldTree(), { name: 'Alt.step' }),
    placement = [...cadIdentity()];
  placement[12] = 5;
  placement[13] = 6;
  placement[14] = 7;
  const moved = createCadProject();
  importStepProject(moved, stepProjectReaderOldTree(), { name: 'Alt.step', transform: placement });

  assert.equal(ids.length, 3);
  assert.equal(project.componentDefinitions, undefined, 'der alte Leser liefert keine Definition');
  for (const node of project.nodes) {
    assert.deepEqual(node.transform, cadIdentity());
    assert.equal('definitionId' in node, false);
  }
  assert.deepEqual(
    project.folders.map((entry) => entry.name),
    ['Alt.step', 'Prüfbaugruppe', 'Baugruppe'],
  );
  assert.equal(project.version, 5, 'ohne Definition bleibt das bisherige Mindestformat');
  for (const node of moved.nodes)
    assert.deepEqual([node.transform[12], node.transform[13], node.transform[14]], [5, 6, 7]);
});

test('Import placement composes the optional base transform with the occurrence world frame', () => {
  const base = cadIdentity();
  base[12] = 5;
  base[13] = 6;
  base[14] = 7;
  const project = createCadProject(),
    worlds = stepProjectReaderWorlds();
  importStepProject(project, stepProjectReaderTree(), { name: 'Platz.step', transform: base });

  project.nodes.forEach((node, index) => {
    const world = worlds[index];
    // A pure base translation only shifts the placement, never its axes.
    for (const index of [0, 1, 2, 4, 5, 6, 8, 9, 10]) near(node.transform[index], world[index]);
    [0, 1, 2].forEach((axis) => near(node.transform[12 + axis], world[12 + axis] + [5, 6, 7][axis]));
  });
  assert.deepEqual(project.nodes[1].transform, [...rotationZ(Math.PI / 2, [45, 6, 7])]);
});

test('Malformed reader values and duplicate ids are rejected without touching the project', () => {
  const project = createCadProject(),
    ids = importStepProject(project, stepProjectReaderTree(), { name: 'Gut.step' }),
    before = serializeCadProject(project),
    definitions = structuredClone(project.componentDefinitions),
    tree = stepProjectReaderTree(),
    bearing = tree[0].children[1].children[0],
    rejected = (value, pattern) =>
      assert.throws(() => importStepProject(project, value, { name: 'Schlecht.step' }), pattern);

  rejected([], /keinen Baumbestand/);
  rejected([bearing, { ...bearing, worldTransform: [1, 0, 0, 0] }], /STEP-weltTransform/);
  rejected([bearing, { ...bearing, worldTransform: [...identity().slice(0, 15), 2] }], /STEP-weltTransform/);
  rejected(
    [bearing, { ...bearing, worldTransform: identity().map((value, index) => (index === 1 ? NaN : value)) }],
    /STEP-weltTransform/,
  );
  rejected([bearing, { ...bearing, extra: true }], /unbekanntes Feld extra/);
  rejected([bearing, { ...bearing, definitionId: null, definitionName: 'Lager' }], /Definitionsname benötigt/);
  rejected([bearing, { ...bearing, name: 'x'.repeat(201) }], /STEP-Teilname/);
  rejected([{ name: 'Leer', children: [] }], /leeren Ast/);
  rejected([bearing, { ...bearing, occurrencePath: Array(13).fill('x').join('/') }], /Vorkommenspfad/);
  rejected([bearing, { ...bearing, definitionName: 'Lager rechts' }], /Widersprüchliche STEP-Definitionsnamen/);
  assert.throws(
    () => importStepProject(project, stepProjectReaderTree(), { name: 'Doppelt.step', id: ids[0] }),
    /bereits vergeben/,
  );

  assert.equal(serializeCadProject(project), before, 'das bestätigte Projekt bleibt unverändert');
  assert.deepEqual(project.componentDefinitions, definitions);
});

test('Real geometry keeps its local definition body and world placement through rebuild and re-import', async () => {
  const service = createCadService({ oc });
  try {
    const baked = importCadStepAssembly(oc, stepOccurrenceFixture(oc)),
      worlds = stepProjectReaderWorlds(),
      leaves = [];
    const walk = (item) => (item.children ? item.children.forEach(walk) : leaves.push(item));
    baked.forEach(walk);
    assert.equal(leaves.length, 3);
    // Once the new native reader exists it already returns the local body and
    // the world frame. Today's reader is world-baked, so this test derives the
    // same contract values locally without changing the reader.
    const parts = leaves.map((leaf, index) => {
      const world = Array.isArray(leaf.worldTransform) ? leaf.worldTransform : worlds[index];
      if (Array.isArray(leaf.worldTransform)) return { brep: leaf.brep, stats: leaf.stats, world, name: leaf.name };
      const shape = readCadBrep(oc, leaf.brep.data);
      let local;
      try {
        local = transformCad(oc, shape, inverseCadMatrix(world));
        const checked = validateCadSolid(oc, local);
        return {
          name: leaf.name,
          world,
          brep: { format: 'OpenCascade-BRep', data: writeCadBrep(oc, local), triangulation: false },
          stats: {
            bounds: { min: checked.bounds.min, max: checked.bounds.max },
            volume: checked.volume,
            solids: checked.solids,
          },
        };
      } finally {
        local?.delete();
        shape.delete();
      }
    });
    // The local definition body is 10x6x4 although the world body is rotated.
    near(parts[1].stats.volume, 240);
    assert.deepEqual(
      extents(parts[1].stats).map((value) => Math.round(value)),
      [10, 6, 4],
    );

    const leafOf = (part, definitionId, definitionName) => ({
      name: part.name,
      appearance: { color: definitionId ? '#2277cc' : '#cc3322', opacity: 1 },
      brep: part.brep,
      stats: part.stats,
      definitionId,
      ...(definitionName ? { definitionName } : {}),
      occurrencePath: '0:1/0:1:' + parts.indexOf(part),
      worldTransform: part.world,
    });
    const tree = [
      {
        name: 'Prüfbaugruppe',
        appearance: {},
        children: [
          leafOf(parts[0], null),
          {
            name: 'Antrieb',
            appearance: {},
            children: [leafOf(parts[1], 'native-lager', 'Lager'), leafOf(parts[2], 'native-lager', 'Lager')],
          },
        ],
      },
    ];

    const project = createCadProject(),
      ids = importStepProject(project, tree, {
        name: 'Referenz.step',
        id: 'imported',
        metadata: { importedFile: { name: 'Referenz.step', type: 'step' } },
      });
    assert.equal(project.nodes.length, 3);
    const rebuilt = await service.rebuild(project);
    nearBounds(service.inspect(rebuilt.nodes[0]).worldBounds, [-50, -30, -2.5], [50, 30, 2.5], 'Grundplatte');
    nearBounds(service.inspect(rebuilt.nodes[1]).worldBounds, [37, -5, -2], [43, 5, 2], 'Lager links');
    nearBounds(service.inspect(rebuilt.nodes[2]).worldBounds, [37, 7, -2], [43, 17, 2], 'Lager rechts');
    assert.equal(project.componentDefinitions.definitions[0].sourceNodeId, ids[1]);

    const display = service.display(rebuilt);
    assert.equal(display.length, 3);
    display.forEach((entry, index) => assert.deepEqual(entry.transform, rebuilt.nodes[index].transform));

    // The placed body survives a selected STEP export and a fresh import.
    const copy = createCadProject();
    service.stepAssembly(copy, service.exportStep(rebuilt, { ids: [ids[1]] }), { name: 'Einzel.step' });
    const round = await service.rebuild(copy);
    assert.equal(round.nodes.length, 1);
    nearBounds(service.inspect(round.nodes[0]).worldBounds, [37, -5, -2], [43, 5, 2], 'Rückimport');
  } finally {
    service.dispose();
  }
});
