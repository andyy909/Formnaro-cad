// STEP D · Speicherung (D1–D4): bestehendes Bauteildefinitionsmodell in
// OCAD und FNPACK. Jeder Leser läuft in einem frischen Node-Prozess, damit
// kein Sitzungszustand als Beweis dient. Der Test ändert keine Produktion.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  createCadProject,
  cadProjectSnapshot,
  createCadWorkspaceSerializer,
  parseCadProject,
  serializeCadProject,
  COMPONENT_DEFINITION_PROJECT_VERSION,
} from '../src/cad-project.js';
import { findComponentInstances, isSameComponent } from '../src/cad-component-definitions.js';
import { cadIdentity, cadPoint, multiplyCadMatrices } from '../src/cad-affine.js';
import { encodeFnpackProject, materializedFnpackProject, createFnpackResolver } from '../src/cad-fnpack-data.js';
import { CAD_QUALITY_DEFAULTS } from '../src/cad-quality.js';
import { validateCadWorkspace } from '../src/cad-workspace.js';
import { defaultLayout } from '../src/layout-preferences.js';
import { loadCadKernel } from '../src/cad-kernel-loader.js';
import { createCadService } from '../src/cad-service.js';
import { stepOccurrenceFixture } from './fixtures/cad-exchange-step-occurrences.mjs';

const { openFnpack, writeFnpack } = createRequire(import.meta.url)('../backend/fnpack.cjs');
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const identity = cadIdentity();
const moduleUrl = (...parts) => pathToFileURL(path.join(ROOT, ...parts)).href;
const identityRows = [...identity];

function tempDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'formnaro-step-d-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

/** One reader process for all cases of this suite; nothing is shared with the writer. */
function freshReader(t, directory) {
  const script = `
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { parseCadProject, serializeCadProject } from ${JSON.stringify(moduleUrl('src', 'cad-project.js'))};
import { createFnpackResolver, materializedFnpackProject } from ${JSON.stringify(moduleUrl('src', 'cad-fnpack-data.js'))};
const { openFnpack } = createRequire(import.meta.url)(${JSON.stringify(path.join(ROOT, 'backend', 'fnpack.cjs'))});
const [command, ...files] = process.argv.slice(2);
async function packageState(file) {
  const reader = await openFnpack(file);
  try {
    const resolver = createFnpackResolver({ readBlock: (hash) => reader.read(hash) });
    const hydrated = await resolver.hydrate(reader.index.project);
    return { catalog: reader.index.project, blocks: reader.index.blocks, project: materializedFnpackProject(hydrated), stats: resolver.stats() };
  } finally {
    await reader.close();
  }
}
let result;
if (command === 'ocad') result = files.map((file) => parseCadProject(fs.readFileSync(file, 'utf8')));
else if (command === 'fnpack') result = await Promise.all(files.map(packageState));
else if (command === 'legacy')
  result = files.map((file) => {
    const opened = parseCadProject(fs.readFileSync(file, 'utf8'));
    const resaved = serializeCadProject(opened);
    const again = parseCadProject(resaved);
    return {
      opened,
      resaved,
      stable: serializeCadProject(again) === resaved,
      versions: [opened.version, again.version],
      names: [opened.name, again.name],
      nodeNames: [opened.nodes.map((node) => node.name), again.nodes.map((node) => node.name)],
      definitions: again.componentDefinitions ?? null,
    };
  });
else throw Error('Unbekannter Lesebefehl: ' + command);
process.stdout.write(JSON.stringify(result));
`;
  const file = path.join(directory, 'fresh-reader.mjs');
  fs.writeFileSync(file, script);
  return (command, files) => {
    const result = spawnSync(process.execPath, [file, command, ...files], {
      cwd: ROOT,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
    });
    assert.equal(result.status, 0, `Frischer Leser fehlgeschlagen: ${result.stderr}`);
    return JSON.parse(result.stdout);
  };
}

function workspace() {
  return {
    version: 2,
    view: { projection: 'perspective', position: [123, -200, 400], target: [2, 3, 4], up: [0, 0, 1], zoom: 2.5 },
    selection: [{ rootId: 'step-gruppe-1', path: ['step-gruppe-1'] }],
    mode: 'rotate',
    snap: 0.25,
    quality: structuredClone(CAD_QUALITY_DEFAULTS),
    layout: defaultLayout(),
    tree: { expanded: [{ kind: 'object', rootId: 'step-gruppe-1', path: ['step-gruppe-1'] }] },
  };
}

/** D1: two placements of one STEP definition plus two same-named independent parts. */
function stepProject() {
  const body = (
    id,
    { color, faceColors, layerId = 'default', folderId = null, data = 'DBRep STEP Lager 10x6x4' } = {},
  ) => ({
    id,
    kind: 'cad',
    name: 'Lager',
    source: 'step',
    solid: true,
    transform: identityRows,
    brep: { format: 'OpenCascade-BRep', triangulation: false, data },
    stats: { bounds: { min: [-5, -3, 0], max: [5, 3, 4] }, volume: 240, solids: 1 },
    layerId,
    folderId,
    ...(color ? { color } : {}),
    ...(faceColors ? { metadata: { stepFaceColors: faceColors } } : {}),
  });
  const occurrenceA = {
    ...body('step-lager-a', {
      color: '#b87333',
      folderId: 'folder-lager',
      faceColors: [
        { faceIndex: 1, color: '#b87333', opacity: 1 },
        { faceIndex: 2, color: '#101010', opacity: 0.35 },
      ],
    }),
    definitionId: 'def-step-lager',
  };
  // Zweiter Einbau derselben Definition: gleiche Geometrie, eigene Kennung,
  // eigene Darstellung und eigene lokale Lage.
  const occurrenceB = {
    ...body('step-lager-b', { color: '#2f6fb3', folderId: 'folder-lager' }),
    definitionId: 'def-step-lager',
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 12, 0, 0, 1],
  };
  const independent = {
    ...body('step-lager-fremd-1', {
      color: '#888888',
      layerId: 'layer-step',
      data: 'DBRep unabhaengig gefertigt',
    }),
    locked: true,
  };
  const independentDefinition = {
    ...body('step-lager-fremd-2', {
      color: '#44aa55',
      folderId: 'folder-fremd',
      data: 'DBRep zweite unabhaengige Fertigung',
    }),
    definitionId: 'def-step-lager-fremd',
    opacity: 0.6,
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 60, 0, 0, 1],
  };
  // Unterbaugruppe: +40 mm X und 90° um Z; Weltlagen der Lager [40,0,0] und [40,12,0].
  const group = {
    id: 'step-gruppe-1',
    kind: 'cad',
    name: 'Unterbaugruppe',
    source: 'group',
    solid: true,
    transform: [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 40, 0, 0, 1],
    brep: { format: 'OpenCascade-BRep', triangulation: false, data: 'DBRep STEP Baugruppe' },
    stats: { bounds: { min: [-5, -3, 0], max: [5, 15, 4] }, volume: 480, solids: 2 },
    operation: 'union',
    children: [occurrenceA, occurrenceB],
    layerId: 'default',
    folderId: 'folder-baugruppe',
  };
  return createCadProject({
    name: 'STEP Definitionen · Prüfung',
    nodes: [group, independent, independentDefinition],
    layers: [
      { id: 'default', name: 'Standard', hidden: false, locked: false },
      { id: 'layer-step', name: 'STEP-Import', hidden: false, locked: false },
    ],
    folders: [
      { id: 'folder-baugruppe', name: 'Baugruppe', hidden: false, locked: false, layerId: 'default', parentId: null },
      {
        id: 'folder-lager',
        name: 'Lager',
        hidden: false,
        locked: false,
        layerId: 'default',
        parentId: 'folder-baugruppe',
      },
      { id: 'folder-fremd', name: 'Fremdteile', hidden: false, locked: false, layerId: 'default', parentId: null },
    ],
    activeLayerId: 'default',
    activeFolderId: 'folder-fremd',
    componentDefinitions: {
      version: 1,
      definitions: [
        {
          id: 'def-step-lager',
          name: 'Lager',
          sourceNodeId: 'step-lager-a',
          partNumber: 'STEP-LAGER-10x6x4',
          description: 'Gemeinsame STEP-Definition für die Prüfung',
          metadata: { origin: 'STEP', fixture: 'step-d', source: { file: 'baugruppe.step', occurrences: 2 } },
        },
        { id: 'def-step-lager-fremd', name: 'Lager', sourceNodeId: 'step-lager-fremd-2', partNumber: 'FREMD-LAGER' },
      ],
    },
  });
}

function worldTransforms(project) {
  const world = new Map();
  const visit = (node, parent) => {
    const transform = parent ? multiplyCadMatrices(parent, node.transform) : node.transform;
    world.set(node.id, transform);
    for (const child of node.children ?? []) visit(child, transform);
  };
  for (const node of project.nodes) visit(node, null);
  return world;
}

function assertSameAssembly(actual, expected) {
  assert.equal(actual.version, expected.version);
  assert.equal(actual.name, expected.name);
  assert.deepEqual(actual.componentDefinitions, expected.componentDefinitions);
  assert.deepEqual(actual.folders, expected.folders);
  assert.deepEqual(actual.layers, expected.layers);
  assert.deepEqual(actual.nodes, expected.nodes);
  assert.deepEqual(Object.fromEntries(worldTransforms(actual)), Object.fromEntries(worldTransforms(expected)));
}

test('D1/D2: OCAD öffnet zwei Einbauten einer Definition und das gleichnamige unabhängige Teil unverändert', (t) => {
  const directory = tempDirectory(t),
    read = freshReader(t, directory),
    project = stepProject(),
    expected = cadProjectSnapshot(project),
    file = path.join(directory, 'step-baugruppe.ocad');
  fs.writeFileSync(file, createCadWorkspaceSerializer(project)(workspace()));

  const [reopened] = read('ocad', [file]);
  assert.equal(reopened.version, COMPONENT_DEFINITION_PROJECT_VERSION);
  assertSameAssembly(reopened, expected);
  assert.deepEqual(reopened.workspace, validateCadWorkspace(workspace()));

  // Feldweise Kontrolle der Kennungen, Ordner, Farben und Platzierungen.
  assert.deepEqual(
    reopened.componentDefinitions.definitions.map(({ id, name, sourceNodeId, partNumber }) => ({
      id,
      name,
      sourceNodeId,
      partNumber,
    })),
    [
      { id: 'def-step-lager', name: 'Lager', sourceNodeId: 'step-lager-a', partNumber: 'STEP-LAGER-10x6x4' },
      { id: 'def-step-lager-fremd', name: 'Lager', sourceNodeId: 'step-lager-fremd-2', partNumber: 'FREMD-LAGER' },
    ],
  );
  const ids = [];
  const collect = (node) => {
    ids.push(node.id);
    for (const child of node.children ?? []) collect(child);
  };
  reopened.nodes.forEach(collect);
  assert.equal(new Set(ids).size, ids.length, 'Projektkennungen bleiben eindeutig');
  assert.deepEqual(
    findComponentInstances(reopened, 'def-step-lager').map((node) => node.id),
    ['step-lager-a', 'step-lager-b'],
  );
  assert.deepEqual(
    findComponentInstances(reopened, 'def-step-lager-fremd').map((node) => node.id),
    ['step-lager-fremd-2'],
  );

  const [group, independent, separateDefinition] = reopened.nodes,
    [occurrenceA, occurrenceB] = group.children;
  assert.equal(occurrenceA.name, occurrenceB.name);
  assert.equal(occurrenceA.definitionId, occurrenceB.definitionId);
  assert.notEqual(occurrenceA.id, occurrenceB.id);
  assert.equal(independent.definitionId, undefined);
  assert.equal(separateDefinition.definitionId, 'def-step-lager-fremd');
  assert.equal(isSameComponent(reopened, occurrenceA, occurrenceB), true);
  assert.equal(isSameComponent(reopened, occurrenceA, separateDefinition), false);
  assert.equal(isSameComponent(reopened, independent, separateDefinition), false);
  assert.equal(occurrenceA.color, '#b87333');
  assert.equal(occurrenceB.color, '#2f6fb3');
  assert.equal(independent.color, '#888888');
  assert.deepEqual(occurrenceA.metadata.stepFaceColors, [
    { faceIndex: 1, color: '#b87333', opacity: 1 },
    { faceIndex: 2, color: '#101010', opacity: 0.35 },
  ]);
  assert.equal(occurrenceA.brep.data, 'DBRep STEP Lager 10x6x4');
  assert.equal(occurrenceA.folderId, 'folder-lager');
  assert.equal(group.folderId, 'folder-baugruppe');
  assert.equal(independent.folderId, null);
  assert.equal(independent.layerId, 'layer-step');
  assert.equal(reopened.folders.find((folder) => folder.id === 'folder-lager').parentId, 'folder-baugruppe');
  assert.equal(reopened.folders.find((folder) => folder.id === 'folder-fremd').layerId, 'default');
  assert.equal(independent.locked, true);
  assert.equal(separateDefinition.opacity, 0.6);

  // Weltlage: Eltern × Kind, geprüft an den beiden Lagerursprüngen.
  const world = worldTransforms(reopened);
  assert.deepEqual(group.transform.slice(12, 15), [40, 0, 0], 'Importposition der Baugruppe bleibt erhalten');
  assert.deepEqual(
    cadPoint(world.get('step-lager-a'), [0, 0, 0]).map((v) => Math.round(v * 1e9) / 1e9),
    [40, 0, 0],
  );
  assert.deepEqual(
    cadPoint(world.get('step-lager-b'), [0, 0, 0]).map((v) => Math.round(v * 1e9) / 1e9),
    [40, 12, 0],
  );
  assert.deepEqual(occurrenceA.transform, expected.nodes[0].children[0].transform);
  assert.deepEqual(occurrenceB.transform, expected.nodes[0].children[1].transform);
  assert.deepEqual(independent.transform, identityRows);
  assert.deepEqual(reopened.activeFolderId, 'folder-fremd');
});

test('D3: FNPACK löst die Definitionsgeometrie aus eigenen Blöcken auf und behält Katalog, Namen, Ordner und Farben', async (t) => {
  const directory = tempDirectory(t),
    read = freshReader(t, directory),
    project = stepProject(),
    expected = cadProjectSnapshot(project),
    encoded = encodeFnpackProject({ ...project, workspace: workspace() }),
    file = path.join(directory, 'step-baugruppe.fnpack');
  const written = await writeFnpack(file, { project: encoded.project, blocks: encoded.blocks });
  assert.equal(encoded.project.version, COMPONENT_DEFINITION_PROJECT_VERSION);

  // Beide Einbauten teilen dieselbe Definitionsgeometrie in genau einem Block.
  const occurrences = [encoded.project.nodes[0].children[0], encoded.project.nodes[0].children[1]];
  assert.match(JSON.stringify(encoded.project), /Formnaro-GeometryRef/);
  assert.ok(!JSON.stringify(encoded.project).includes('OpenCascade-BRep'), 'Katalog trägt keine Geometriepuffer');
  assert.equal(occurrences[0].brep.sha256, occurrences[1].brep.sha256);
  const distinct = new Set([
    occurrences[0].brep.sha256,
    encoded.project.nodes[0].brep.sha256,
    encoded.project.nodes[1].brep.sha256,
    encoded.project.nodes[2].brep.sha256,
  ]);
  assert.equal(written.geometryBlocks, distinct.size);

  const [firstRead] = read('fnpack', [file]);
  assert.equal(firstRead.catalog.version, COMPONENT_DEFINITION_PROJECT_VERSION);
  assert.deepEqual(firstRead.catalog.componentDefinitions, expected.componentDefinitions);
  assert.deepEqual(firstRead.catalog.folders, expected.folders);
  assert.deepEqual(firstRead.catalog.workspace, validateCadWorkspace(workspace()));
  assertSameAssembly(firstRead.project, expected);
  assert.equal(firstRead.project.nodes[0].children[0].brep.data, 'DBRep STEP Lager 10x6x4');
  assert.ok(firstRead.stats.reads >= distinct.size);

  // Kopie ohne Hydrierung: nie geladene Blöcke werden gestreamt, die Quelle
  // kann danach verschwinden und das Paket bleibt eigenständig lesbar.
  const reader = await openFnpack(file);
  const copy = path.join(directory, 'step-kopie.fnpack');
  try {
    const copied = await writeFnpack(copy, { project: reader.index.project, blocks: [], source: reader });
    assert.equal(copied.indexSha256, written.indexSha256);
    assert.equal(copied.geometryBlocks, written.geometryBlocks);
  } finally {
    await reader.close();
  }
  fs.rmSync(file);
  const [copiedRead] = read('fnpack', [copy]);
  assertSameAssembly(copiedRead.project, expected);

  // Eine aus dem Paket materialisierte .ocad-Ausgabe enthält wieder feste
  // Geometrie und keine ungelösten Verweise.
  const materialized = materializedFnpackProject(
    await createFnpackResolver({
      readBlock: async (hash) => encoded.blocks.find((block) => block.sha256 === hash).bytes,
    }).hydrate(encoded.project),
  );
  const ocadFile = path.join(directory, 'aus-paket.ocad'),
    ocad = serializeCadProject(materialized);
  fs.writeFileSync(ocadFile, ocad);
  assert.ok(!ocad.includes('Formnaro-GeometryRef'));
  assert.ok(!ocad.includes('geometryIdentity'));
  const [reopenedOcad] = read('ocad', [ocadFile]);
  assertSameAssembly(reopenedOcad, expected);
});

test('D4: unterstützte Altdateien öffnen und speichern ohne Format- oder Definitionserfindung', (t) => {
  const directory = tempDirectory(t),
    read = freshReader(t, directory),
    legacy = ['beispiele/lagerhalter.ocad', 'beispiele/getriebestudie.ocad', 'beispiele/elektronikgehaeuse.ocad'].map(
      (file) => path.join(ROOT, file),
    );
  const opened = read('legacy', legacy);
  assert.deepEqual(
    opened.map((entry) => entry.versions[0]),
    [5, 16, 5],
  );
  for (const [index, entry] of opened.entries()) {
    assert.equal(entry.versions[1], entry.versions[0], `Altdatei ${legacy[index]} behält ihr Format`);
    assert.equal(entry.names[1], entry.names[0]);
    assert.deepEqual(entry.nodeNames[1], entry.nodeNames[0]);
    assert.equal(entry.definitions, null, 'Altdateien erhalten kein leeres Definitionsverzeichnis');
    assert.equal(entry.stable, true, 'Wiederholtes Speichern ist bytegleich');
  }

  // Ein nicht unterstütztes Altformat wird erklärt abgewiesen statt still migriert.
  const unsupported = JSON.parse(fs.readFileSync(legacy[0], 'utf8'));
  unsupported.version = 4;
  assert.throws(() => parseCadProject(unsupported), /Nur die Projektformate 5, 7 bis 32 und 34 bis 42/);
});

test('D4: ein neu importiertes flaches STEP-Einzelteil bleibt ohne Definition in beiden Formaten erhalten', async (t) => {
  const directory = tempDirectory(t),
    read = freshReader(t, directory),
    flat = createCadProject({
      name: 'Flaches STEP-Einzelteil',
      nodes: [
        {
          id: 'step-flach-1',
          kind: 'cad',
          name: 'Flansch',
          source: 'step',
          solid: true,
          transform: identityRows,
          color: '#44aa55',
          brep: { format: 'OpenCascade-BRep', triangulation: false, data: 'DBRep flacher STEP-Flansch' },
          stats: { bounds: { min: [-20, -20, 0], max: [20, 20, 6] }, volume: 9600, solids: 1 },
          metadata: { importedFile: { name: 'flansch.step', type: 'step' } },
          layerId: 'default',
          folderId: null,
        },
      ],
    }),
    ocadFile = path.join(directory, 'flach.ocad');
  fs.writeFileSync(ocadFile, serializeCadProject(flat));
  const [ocad] = read('ocad', [ocadFile]);
  assert.deepEqual(
    ocad.nodes.map((node) => node.id),
    ['step-flach-1'],
  );
  assert.equal(ocad.componentDefinitions, undefined);
  assert.equal(ocad.nodes[0].definitionId, undefined);
  assert.equal(ocad.nodes[0].color, '#44aa55');
  assert.deepEqual(ocad.nodes[0].metadata.importedFile, { name: 'flansch.step', type: 'step' });
  assert.ok(ocad.version < COMPONENT_DEFINITION_PROJECT_VERSION);

  const encoded = encodeFnpackProject(flat),
    packFile = path.join(directory, 'flach.fnpack');
  await writeFnpack(packFile, { project: encoded.project, blocks: encoded.blocks });
  const [packed] = read('fnpack', [packFile]);
  assert.equal(packed.blocks.length, 1);
  assert.equal(packed.project.componentDefinitions, undefined);
  assert.equal(packed.project.nodes.length, 1);
  assert.equal(packed.project.nodes[0].id, 'step-flach-1');
  assert.equal(packed.project.nodes[0].brep.data, flat.nodes[0].brep.data);
  assert.deepEqual(packed.project.nodes[0].metadata.importedFile, { name: 'flansch.step', type: 'step' });
  assert.deepEqual(packed.project.nodes[0].transform, flat.nodes[0].transform);
  assert.equal(packed.project.nodes[0].geometryIdentity, undefined);
});

test('D5: real STEP import retains shared definitions and native positions after both fresh-process round trips', async (t) => {
  const oc = await loadCadKernel({ print: () => {}, printErr: () => {} });
  const service = createCadService({ oc });
  t.after(() => service.dispose());
  const project = createCadProject({ name: 'STEP-Rundlauf' });
  service.stepAssembly(project, stepOccurrenceFixture(oc), { name: 'Lagerbaugruppe.step' });
  const [, left, right] = project.nodes;
  assert.equal(project.version, COMPONENT_DEFINITION_PROJECT_VERSION);
  assert.equal(project.componentDefinitions.definitions.length, 2);
  assert.equal(left.definitionId, right.definitionId);
  assert.notEqual(left.id, right.id);
  assert.equal(left.brep.data, right.brep.data);

  const directory = tempDirectory(t),
    read = freshReader(t, directory);
  const ocad = path.join(directory, 'STEP-Rundlauf.ocad');
  const pack = path.join(directory, 'STEP-Rundlauf.fnpack');
  fs.writeFileSync(ocad, serializeCadProject(project));
  await writeFnpack(pack, encodeFnpackProject(project));
  const [reopened] = read('ocad', [ocad]);
  const [packed] = read('fnpack', [pack]);
  assert.equal(packed.blocks.length, 2);
  for (const model of [reopened, packed.project]) {
    assert.deepEqual(model.componentDefinitions, project.componentDefinitions);
    assert.deepEqual(model.folders, project.folders);
    assert.deepEqual(model.nodes, project.nodes);
    const [first, second] = model.nodes.slice(1).map((node) => service.inspect(node).worldBounds.min);
    for (const [actual, expected] of [
      [first, [37, -5, -2]],
      [second, [37, 7, -2]],
    ]) {
      actual.forEach((value, axis) => assert.ok(Math.abs(value - expected[axis]) < 1e-5));
    }
  }
});
