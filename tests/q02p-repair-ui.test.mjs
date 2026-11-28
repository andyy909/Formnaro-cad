import test from 'node:test';
import assert from 'node:assert/strict';
import { MESH_INSPECTION_CATEGORIES } from '../src/mesh-inspector.js';
import { importRendererModule, installTestDocument } from './fixtures/renderer-test-support.mjs';

const { createCadMeshRepairUI } = await importRendererModule(
  new URL('../src/cad-mesh-repair-ui.js', import.meta.url),
);

function harness(report) {
  const node = {
      id: 'mesh',
      kind: 'mesh',
      name: 'Naht',
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      layerId: 'default',
      folderId: null,
      mesh: { verts: [0, 0, 0, 10, 0, 0, 0, 10, 0], triangles: [0, 1, 2] },
    },
    project = { nodes: [node], layers: [{ id: 'default', hidden: false, locked: false }], folders: [] },
    controls = new Map(),
    make = (id) => ({
      id,
      value: '',
      checked: false,
      disabled: false,
      dataset: {},
      textContent: '',
      classList: { toggle() {} },
      setAttribute() {},
      get innerHTML() {
        return this.html ?? '';
      },
      set innerHTML(value) {
        this.html = value;
      },
    }),
    panel = {
      hidden: true,
      setAttribute() {},
      addEventListener() {},
      remove() {},
      querySelector: (selector) => controls.get(selector.slice(1)),
      querySelectorAll: () => [],
      set innerHTML(value) {
        controls.clear();
        for (const match of value.matchAll(/id="([^"]+)"/g)) controls.set(match[1], make(match[1]));
      },
    },
    controller = {
      readSnapshot: () => project,
      revision: () => 'one',
      cancel() {},
      discard() {},
      preview: async () => ({ previewId: 'p1', revision: 'one', report }),
    };
  const restore = installTestDocument({ createElement: () => panel });
  let ui;
  try {
    ui = createCadMeshRepairUI({
      controller,
      view: { canvas: { parentElement: { append() {} } }, allows: () => true },
      getSelection: () => [{ rootId: 'mesh', path: [] }],
      showPreview: async () => {},
      applyProposal: async () => {},
      service: {
        repairCatalog: async () => ({ geometryDigest: 'a'.repeat(64), components: [], total: 0, offset: 0 }),
        cancel() {},
        dispose() {},
      },
    });
  } finally {
    restore();
  }
  return { ui, controls, panel };
}

const counts = () => Object.fromEntries(Object.keys(MESH_INSPECTION_CATEGORIES).map((key) => [key, 0]));
const baseReport = {
  removedDegenerate: 0,
  removedDuplicates: 0,
  flippedFaces: 0,
  removedComponents: 0,
  removedComponentFaces: 0,
  removedUnusedVertices: 12,
  beforeTriangles: 22009,
  afterTriangles: 22002,
  skippedOrientationComponents: 0,
  repairedPlanarSeams: 1,
  planarSeamChanges: 6,
  holesFilled: 1,
  before: counts(),
  after: counts(),
};

test('Q02-P-D: the repair result shows method, both directions, exclusion and hashes of the outer skin', async () => {
  const { ui, controls } = harness({
    ...baseReport,
    outerSkin: {
      method: 'outer-skin-v1',
      budgetMm: 0.15,
      samples: [24000],
      probe: { samplePointsPerDirection: 24000 },
      passed: true,
      durationMs: 6144,
      skin: { originalToCandidateMm: 0.0019979, candidateToOriginalMm: 0.0019841 },
      raw: { originalToCandidateMm: 3.0153348, candidateToOriginalMm: 0.0019979 },
      excludedFaces: 4,
      excludedAreaMm2: 212.3751434,
      originalDigest: 'a'.repeat(64),
      resultDigest: 'b'.repeat(64),
    },
  });
  await ui.open();
  assert.equal(await ui.preview(), true);
  const text = controls.get('mesh-repair-result').textContent;
  assert.match(text, /Restöffnung\(en\) auf der erkannten Nahtebene/);
  assert.match(text, /Außenhaut \(outer-skin-v1, Budget 0,15 mm, 24\.000 Punkte je Richtung\): bestanden/);
  assert.match(text, /Außenhaut 0,002 \/ 0,002 mm/);
  assert.match(text, /Roh 3,0153 \/ 0,002 mm/);
  assert.match(text, /Ausschluss 4 Dreiecke \/ 212,3751 mm²/);
  assert.match(text, /Original aaaaaaaaaaaa… → Ergebnis bbbbbbbbbbbb…/);
  ui.dispose();
});

test('Q02-P-D: a repair without a seam repair shows no outer-skin line', async () => {
  const { ui, controls } = harness({ ...baseReport, repairedPlanarSeams: 0, holesFilled: 0, outerSkin: null });
  await ui.open();
  assert.equal(await ui.preview(), true);
  assert.doesNotMatch(controls.get('mesh-repair-result').textContent, /Außenhaut \(/);
  ui.dispose();
});
