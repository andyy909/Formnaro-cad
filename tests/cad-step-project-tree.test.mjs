import test from 'node:test';
import assert from 'node:assert/strict';
import { cadStepProjectTree } from '../src/cad-step-project-tree.js';
import { loadCadKernel } from '../src/cad-kernel-loader.js';
import { createCadProject } from '../src/cad-project.js';
import { createCadService } from '../src/cad-service.js';
import { importCadStepAssembly } from '../src/cad-step-io.js';
import { cadIdentity } from '../src/cad-affine.js';

const oc = await loadCadKernel({ print: () => {}, printErr: () => {} });

test('Assembly export keeps component groups, finished machined parts and shared native definitions', async () => {
  const service = createCadService({ oc });
  try {
    const at = (x) => { const matrix = cadIdentity(); matrix[12] = x; return matrix; };
    const box = (id, name, x, color = '#112233') =>
      service.nativeNode({ type: 'box', size: [10, 6, 4] }, { id, name, color, transform: at(x) });
    const group = (id, name, children) => ({
      id, name, kind: 'cad', source: 'group', operation: 'union', solid: true, multicolor: true,
      transform: cadIdentity(), children, brep: children[0].brep, stats: children[0].stats,
    });
    const assembly = group('assembly', 'Getriebe und Führung mit zwei getrennten Lagerkörpern', [
      box('left', 'Lager links', 0), box('right', 'Lager rechts', 20, '#bb5500'),
    ]);
    const cutter = service.nativeNode({ type: 'cylinder', size: [2, 2, 10] }, { id: 'hole', solid: false });
    const machined = group('machined', 'Gebohrte Welle', [box('stock', 'Rohling', 0), cutter]);
    const first = box('first-copy', 'Abstandshalter vorne', 40);
    const second = { ...first, id: 'second-copy', name: 'Abstandshalter hinten', transform: at(60) };
    const project = await service.rebuild(createCadProject({ name: 'Präzisionsschraubstock', nodes: [assembly, machined, first, second] }));
    const bytes = service.exportModel(project, { format: 'step', stepAssembly: true }).data;
    const [root] = importCadStepAssembly(oc, bytes);
    assert.equal(root.name, project.name);
    const [drive, shaft, copy1, copy2] = root.children;
    assert.equal(drive.name, assembly.name);
    assert.deepEqual(drive.children.map(child => child.name), ['Lager links', 'Lager rechts']);
    assert.equal(drive.children[1].appearance.color, '#bb5500');
    assert.equal(shaft.name, 'Gebohrte Welle');
    assert.ok(Math.abs(shaft.stats.volume - project.nodes[1].stats.volume) < 1e-6);
    assert.deepEqual([copy1.name, copy2.name], [first.name, second.name]);
    assert.equal(copy1.definitionId, copy2.definitionId);
    assert.equal(copy2.worldTransform[12] - copy1.worldTransform[12], 20);
  } finally {
    service.dispose();
  }
});

// D5: productionNodes/cadColorPartsNative already decided visibility and
// selection. This fixture therefore only describes the selected parts, two
// folder levels, same-named parts and several colour regions of one root node.
// `Ersatzteile`, `Ausgeblendet` and `Unbenutzt` keep no selected part and must
// not appear in the export tree.
function fixture() {
  const project = {
      name: 'Prüfbaugruppe',
      folders: [
        { id: 'drive', name: 'Antrieb', parentId: null, hidden: false, layerId: 'default' },
        { id: 'bearing', name: 'Lagerung', parentId: 'drive', hidden: false, layerId: 'default' },
        { id: 'housing', name: 'Gehäuse', parentId: null, hidden: false, layerId: 'default' },
        { id: 'spare', name: 'Ersatzteile', parentId: 'drive', hidden: false, layerId: 'default' },
        { id: 'hidden', name: 'Ausgeblendet', parentId: null, hidden: true, layerId: 'default' },
        { id: 'unused', name: 'Unbenutzt', parentId: null, hidden: false, layerId: 'default' },
        { id: 'frame', name: 'Rahmen', parentId: null, hidden: false, layerId: 'default' },
        { id: 'frame-plates', name: 'Platten', parentId: 'frame', hidden: false, layerId: 'default' },
      ],
      nodes: [
        { id: 'base', name: 'Grundplatte', folderId: null },
        { id: 'motor', name: 'Motor', folderId: 'drive' },
        { id: 'bearing-a', name: 'Lager', folderId: 'bearing' },
        { id: 'bearing-b', name: 'Lager', folderId: 'bearing' },
        { id: 'housing', name: 'Gehäuse', folderId: 'housing' },
        { id: 'spare-bolt', name: 'Schraube', folderId: 'spare' },
        { id: 'hidden-part', name: 'Versteckt', folderId: 'hidden' },
        { id: 'plate', name: 'Platte', folderId: 'frame-plates' },
      ],
    },
    parts = [
      { id: 'base', name: 'Grundplatte', color: '#aa0000', opacity: 1 },
      { id: 'motor', name: 'Motor', color: '#00aa00', opacity: 1 },
      { id: 'bearing-a', name: 'Lager', color: '#0000aa', opacity: 1, definitionId: 'lager' },
      { id: 'housing', name: 'Gehäuse', color: '#999999', opacity: 1 },
      { id: 'bearing-b', name: 'Lager', color: '#0000aa', opacity: 1, definitionId: 'lager' },
      { id: 'housing', name: 'Gehäuse-Deckel', color: '#777777', opacity: 1 },
      { id: 'housing', name: 'Gehäuse', color: '#999999', opacity: 1 },
      { id: 'plate', name: 'Platte', color: '#cccccc', opacity: 1 },
    ];
  return { project, parts };
}

test('groups selected parts into stable project folders without empty or hidden folders', () => {
  const { project, parts } = fixture(),
    beforeProject = structuredClone(project),
    beforeParts = structuredClone(parts),
    tree = cadStepProjectTree(project, parts);

  assert.deepEqual(tree, {
    name: 'Prüfbaugruppe',
    children: [
      { partIndex: 0 },
      {
        name: 'Antrieb',
        children: [{ partIndex: 1 }, { name: 'Lagerung', children: [{ partIndex: 2 }, { partIndex: 4 }] }],
      },
      { name: 'Gehäuse', children: [{ partIndex: 3 }, { partIndex: 5 }, { partIndex: 6 }] },
      { name: 'Rahmen', children: [{ name: 'Platten', children: [{ partIndex: 7 }] }] },
    ],
  });

  // Same-named parts keep their own part index; colour regions of one rootId
  // stay separate leaves in input order. The helper never copies identity or
  // presentation data into the tree.
  const leaves = [];
  const collect = (node) => {
    assert.deepEqual(Object.keys(node).sort(), ['children', 'name']);
    for (const child of node.children) {
      if (Object.hasOwn(child, 'partIndex')) {
        assert.deepEqual(Object.keys(child), ['partIndex']);
        leaves.push(child.partIndex);
      } else collect(child);
    }
  };
  collect(tree);
  assert.deepEqual(leaves, [0, 1, 2, 4, 3, 5, 6, 7]);
  assert.deepEqual(
    [...leaves].sort((a, b) => a - b),
    parts.map((_, index) => index),
  );

  // Filtering only removes empty folders; parts, colours and STEP definition
  // inputs remain exactly as supplied.
  assert.deepEqual(project, beforeProject);
  assert.deepEqual(parts, beforeParts);
});

test('keeps a selected descendant through both folder levels and prunes the filtered sibling', () => {
  const { project, parts } = fixture(),
    tree = cadStepProjectTree(project, parts),
    drive = tree.children.find((child) => child.name === 'Antrieb');

  assert.equal(drive.children[0].partIndex, 1);
  assert.equal(drive.children[1].name, 'Lagerung');
  assert.equal(
    drive.children.some((child) => child.name === 'Ersatzteile'),
    false,
  );
  assert.equal(
    tree.children.some((child) => child.name === 'Ausgeblendet'),
    false,
  );
  assert.equal(
    tree.children.some((child) => child.name === 'Unbenutzt'),
    false,
  );
});

test('rejects an empty selection and parts outside the project', () => {
  const { project, parts } = fixture();
  assert.throws(() => cadStepProjectTree(project, []), /mindestens ein sichtbares Teil/);
  assert.throws(() => cadStepProjectTree(project, [{ id: 'missing', name: 'Fehlt' }]), /Unbekanntes Teil/);
});

test('rejects a part selected from a hidden folder instead of exposing that folder', () => {
  const { project, parts } = fixture();
  assert.throws(
    () => cadStepProjectTree(project, [...parts, { id: 'hidden-part', name: 'Versteckt' }]),
    /ausgeblendeten Projektordner/,
  );
});

test('falls back to one named root for a nameless project', () => {
  const { project, parts } = fixture();
  assert.equal(cadStepProjectTree({ ...project, name: '  ' }, parts).name, 'Baugruppe');
});

test('User export filters STEP assemblies by selection and retains their source folder and color', () => {
  const service = createCadService({ oc });
  try {
    const box = { type: 'box', size: [10, 6, 4] };
    const folders = [
      { id: 'drive', name: 'Antrieb', hidden: false, locked: false, layerId: 'default', parentId: null },
      { id: 'bearings', name: 'Lagerung', hidden: false, locked: false, layerId: 'default', parentId: 'drive' },
    ];
    const first = service.nativeNode(box, { id: 'first', name: 'Lager', folderId: 'bearings', color: '#2277cc' });
    const second = service.nativeNode(box, { id: 'second', name: 'Lager', folderId: 'bearings', color: '#bb5500' });
    const outside = service.nativeNode(box, { id: 'outside', name: 'Grundplatte' });
    const project = createCadProject({ name: 'Montage', folders, nodes: [outside, first, second] });
    const selected = importCadStepAssembly(
      oc,
      service.exportModel(project, {
        format: 'step',
        ids: ['first'],
        stepAssembly: true,
      }).data,
    );
    assert.equal(selected.length, 1);
    assert.equal(selected[0].name, 'Montage');
    const [drive] = selected[0].children;
    assert.equal(drive.name, 'Antrieb');
    assert.equal(drive.children[0].name, 'Lagerung');
    assert.equal(drive.children[0].children.length, 1);
    const [bearing] = drive.children[0].children;
    assert.equal(bearing.name, 'Lager');
    assert.equal(bearing.appearance.color, '#2277cc');
    const flat = importCadStepAssembly(oc, service.exportModel(project, { format: 'step', ids: ['first'] }).data);
    assert.equal(flat[0].name, 'Lager');
  } finally {
    service.dispose();
  }
});

test('User STEP assembly export emits a shared product for two placed STEP nodes of one definition', () => {
  const service = createCadService({ oc });
  try {
    const { recipe, ...base } = service.nativeNode(
      { type: 'box', size: [10, 6, 4] },
      { id: 'first', name: 'Lager', color: '#2277cc' },
    );
    const first = { ...base, source: 'step', definitionId: 'bearing' };
    const second = {
      ...first,
      id: 'second',
      color: '#bb5500',
      transform: [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 40, 20, 30, 1],
    };
    const partDefinitions = { version: 1, definitions: [{ id: 'bearing', name: 'Lager' }] };
    const project = createCadProject({
      name: 'Montage',
      nodes: [first, second],
      componentDefinitions: partDefinitions,
    });
    const bytes = service.exportModel(project, { format: 'step', stepAssembly: true }).data;
    const text = new TextDecoder().decode(bytes);
    assert.equal([...text.matchAll(/\bPRODUCT\('Lager',/g)].length, 1);
    assert.equal([...text.matchAll(/\bNEXT_ASSEMBLY_USAGE_OCCURRENCE\(/g)].length, 2);
    const [root] = importCadStepAssembly(oc, bytes);
    assert.deepEqual(
      root.children.map((part) => part.name),
      ['Lager', 'Lager'],
    );
    assert.deepEqual(
      root.children.map((part) => part.appearance.color),
      ['#2277cc', '#bb5500'],
    );
  } finally {
    service.dispose();
  }
});
