import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import Module from 'manifold-3d';
import { createCadController } from '../src/cad-controller.js';
import { prepareImportStl } from '../src/mesh-import-core.js';
import { cadStlAscii } from '../src/cad-mesh-formats.js';
import { remodelStl } from '../src/cad-lab-stl-remodel.js';
import { composeCameraHolderAssembly } from '../src/camera-holder-assembly.js';

// Usage: node --test --test-concurrency=1 tests/cad-r05-lab-path.test.mjs
// The R05 route runs the normal lab pipeline with a FIXED answer (the measured
// assembly). `generate` throws: no provider request may happen.

globalThis.Worker = class {
  constructor(url) {
    if (String(url).includes('model-deviation-worker')) return factory('./fixtures/model-deviation-node-worker.mjs')();
    if (!String(url).includes('mesh-import-worker')) throw Error('Unerwarteter Worker ' + url);
  }
  postMessage({ buffer, options }) {
    prepareImportStl(buffer, options).then(
      (result) => this.onmessage({ data: { type: 'result', result } }),
      (e) => this.onmessage({ data: { type: 'error', message: e.message, code: e.code, name: e.name } }),
    );
  }
  terminate() {}
};
const factory = (file = './fixtures/cad-node-worker.mjs') => () => {
  const worker = new Worker(new URL(file, import.meta.url)),
    adapter = { onmessage: null, onerror: null, postMessage: (m) => worker.postMessage(m), terminate: () => worker.terminate() };
  worker.on('message', (m) => adapter.onmessage?.({ data: m }));
  worker.on('error', (e) => adapter.onerror?.(e));
  return adapter;
};
const createController = () =>
  createCadController({ createWorker: factory(), createMeshWorker: factory('./fixtures/mesh-engine-node-worker.mjs') });

const kernel = await Module();
kernel.setup();

function meshOf(shape) {
  const raw = shape.getMesh(),
    numProp = raw.numProp ?? 3,
    verts = [];
  for (let i = 0; i < raw.vertProperties.length; i += numProp)
    verts.push(raw.vertProperties[i], raw.vertProperties[i + 1], raw.vertProperties[i + 2]);
  return { verts, triangles: Array.from(raw.triVerts) };
}

const PLANE = { origin: [0, 0, 0], uAxis: [1, 0, 0], vAxis: [0, 1, 0], normal: [0, 0, 1] };
function measuredBody(kind, name, size, center) {
  const shape = kernel.Manifold.cube(size, true).translate(center);
  try {
    return {
      version: 1,
      kind,
      name,
      status: 'complete',
      plane: structuredClone(PLANE),
      sketch: { version: 2, size: [1, 1, 1], elements: [] },
      extrusion: { near: 0, far: 1, thickness: 1, direction: [0, 0, 1] },
      measured: { near: 0, far: 1, thickness: 1, normal: [0, 0, 1], origin: [0, 0, 0] },
      mesh: meshOf(shape),
      volume: shape.volume(),
    };
  } finally {
    shape.delete();
  }
}

const plate = measuredBody('basePlateBody', 'Grundplatte', [40, 40, 8], [0, 0, 4]),
  arm = measuredBody('armHeadBody', 'Armkopf', [10, 10, 40], [0, 0, 20]),
  assembly = composeCameraHolderAssembly(kernel, { arm, plate, bores: [] }),
  stl = new TextEncoder().encode(cadStlAscii([{ name: 'Synthetischer Halter', mesh: { vertices: assembly.mesh.verts, triangles: assembly.mesh.triangles } }])).buffer;

function verify(controller, body, _result, add) {
  add('Körpergröße 40 x 40 x 40 mm', true, { bounds: body.stats?.bounds ?? null });
}

test('R05-01: der Laborweg übernimmt die gemessene Baugruppe ohne Modellaufruf und speichert die Quellen', async () => {
  let requests = 0;
  const result = await remodelStl(
    stl,
    {
      createController,
      generate: async () => {
        requests++;
        throw Error('Feste Antwort: kein Modellaufruf vorgesehen.');
      },
      signal: new AbortController().signal,
      assembly,
    },
    'synthetisch.stl',
    verify,
  );
  assert.equal(requests, 0);
  assert.equal(result.passed, true, result.reason ?? '');
  assert.equal(result.source, 'measured-assembly');
  assert.equal(result.decidedBy, result.proven ? 'outer-skin' : 'raw');
  assert.ok(result.deviation <= 0.15, `Abweichung ${result.deviation}`);
  assert.ok(result.rawDeviation <= 0.15, `Roh ${result.rawDeviation}`);
  assert.equal(result.features.length, 1);
  assert.equal(result.features[0].passed, true);
  assert.ok(typeof result.saved === 'string' && result.saved.length > 100);
  const project = JSON.parse(result.saved),
    body = project.nodes.find((node) => node.id === 'kamerahalter-koerper');
  assert.ok(body, 'Baugruppe fehlt im gespeicherten Entwurf');
  assert.equal(body.kind, 'mesh');
  assert.equal(body.hidden, false);
  assert.ok(project.nodes.some((node) => node.name === 'STL-Vorlage'));
  assert.ok(project.nodes.some((node) => node.id === 'r05-quelle-armkopf' && node.hidden));
  assert.ok(project.nodes.some((node) => node.id === 'r05-quelle-grundplatte' && node.hidden));
  assert.equal(result.draftRecord.sources.plate.name, 'Grundplatte');
  assert.equal(result.draftRecord.sources.arm.name, 'Armkopf');
});

test('R05-03: eine Baugruppe über dem Budget bleibt gesperrt und behält Roh- und Außenhautwert', async () => {
  const tooLarge = composeCameraHolderAssembly(kernel, {
      arm,
      plate: measuredBody('basePlateBody', 'Grundplatte', [60, 60, 8], [0, 0, 4]),
      bores: [],
    }),
    result = await remodelStl(
      stl,
      { createController, generate: async () => assert.fail('kein Modellaufruf'), signal: new AbortController().signal, assembly: tooLarge },
      'synthetisch.stl',
      verify,
    );
  assert.equal(result.passed, false);
  assert.match(result.reason, /Budget/);
  assert.ok(result.deviation > 0.15, `Abweichung ${result.deviation}`);
  assert.ok(result.rawDeviation >= result.deviation - 1e-9);
  assert.equal(result.saved, undefined);
  assert.ok(result.runs.length >= 1);
});

test('R05: falsches Funktionsmaß sperrt auch eine maßhaltige alte Netzbaugruppe', async () => {
  const result = await remodelStl(
    stl,
    { createController, generate: async () => assert.fail('kein Modellaufruf'), signal: new AbortController().signal, assembly },
    'synthetisch.stl',
    (_controller, _node, _result, add) => add('Funktionsmaß', false, 5),
  );
  assert.equal(result.passed, false);
  assert.equal(result.saved, undefined);
  assert.ok(result.deviation <= 0.15);
  assert.match(result.reason, /Merkmalsprüfung/);
  assert.deepEqual(result.failedFeatures, [{ label: 'Funktionsmaß', passed: false, actual: 5 }]);
});

async function nativeFixture() {
  const cad = createController();
  try {
    const creation = await cad.execute({ kind: 'batch', commands: [
      { op: 'create', type: 'box', size: [40, 40, 8], pos: [0, 0, 4], as: 'plate' },
      { op: 'create', type: 'box', size: [10, 10, 40], pos: [0, 0, 20], as: 'arm' },
      { op: 'group', name: 'Native Baugruppe', targets: ['$plate', '$arm'], as: 'body' },
    ] });
    return cad.snapshot().nodes.find(({ id }) => id === creation.aliases.body);
  } finally {
    cad.dispose();
  }
}

function fixedNativeOptions(nativeAssembly, benchmark) {
  return { createController, generate: async () => assert.fail('kein Modellaufruf'),
    signal: new AbortController().signal, nativeAssembly, benchmark };
}

const probeRays = [
  [[0, 0, 100], [0, 0, -1], 2, 40],
  [[0, 0, -100], [0, 0, 1], 2, 0],
  [[30, 0, 4], [-1, 0, 0], 0, 20],
  [[-30, 0, 4], [1, 0, 0], 0, -20],
  [[0, 30, 4], [0, -1, 0], 1, 20],
  [[0, -30, 4], [0, 1, 0], 1, -20],
  [[30, 0, 20], [-1, 0, 0], 0, 5],
  [[0, 30, 20], [0, -1, 0], 1, 5],
];

async function verifyNative(cad, body, _result, add) {
  assert.equal(body.kind, 'cad');
  assert.equal(body.stats.solids, 1);
  for (const [index, [origin, direction, axis, expected]] of probeRays.entries()) {
    const hit = await cad.query('rayPick', { ids: [body.id], ray: { origin, direction } });
    add('Messstrahl ' + (index + 1), Math.abs(hit?.point?.[axis] - expected) < 1e-4, hit?.point);
  }
}

test('R05: native Vorschau prüft acht echte Maße und speichert den tatsächlichen Quellenbaum', async () => {
  const body = await nativeFixture();
  body.layerId = 'quelle-aus-anderem-projekt';
  let recorded, applied;
  const result = await remodelStl(stl, fixedNativeOptions(body, {
    recordPreview: (proof) => { recorded = proof; },
    recordApplied: (proposal) => { applied = proposal.previewId; },
  }), 'synthetisch.stl', verifyNative);
  assert.equal(result.passed, true, result.reason);
  assert.equal(result.source, 'measured-native-assembly');
  assert.equal(result.bodyId, body.id);
  assert.equal(result.steps, 2);
  assert.equal(result.features.length, 8);
  assert.ok(result.deviation <= 0.15);
  assert.ok(result.rawDeviation <= 0.15);
  assert.equal(recorded.bodyId, body.id);
  assert.equal(recorded.id, applied);
  assert.equal(recorded.passed, true);
  const originalSha256 = Buffer.from(await crypto.subtle.digest('SHA-256', stl)).toString('hex');
  assert.equal(result.originalSha256, originalSha256);
  assert.equal(recorded.originalSha256, originalSha256);
  assert.ok(result.candidateTriangles > 0);
  const project = JSON.parse(result.saved);
  assert.equal(project.nodes.length, 2);
  assert.equal(project.nodes.find(node => node.kind === 'mesh').name, 'STL-Vorlage');
  const savedBody = project.nodes.find(node => node.id === body.id);
  assert.equal(savedBody.layerId, project.activeLayerId);
  assert.deepEqual(savedBody.children, body.children);
});

test('R05: das native Ergebnis bleibt bei fehlender oder negativer Funktionsprobe gesperrt', async () => {
  const body = await nativeFixture();
  for (const missing of [false, true]) {
    const result = await remodelStl(stl, fixedNativeOptions(body), 'synthetisch.stl', (cad, candidate, data, add) =>
      verifyNative(cad, candidate, data, (label, passed, actual) => {
        if (label !== 'Messstrahl 8') add(label, passed, actual);
        else if (!missing) add(label, false, actual);
      }),
    );
    assert.equal(result.passed, false);
    assert.equal(result.saved, undefined);
    assert.ok(result.deviation <= 0.15);
    assert.match(result.reason, missing ? /unvollständig/ : /Merkmalsprüfung/);
    assert.equal(result.failedFeatures?.length ?? 0, missing ? 0 : 1);
  }
});

test('R05: der native Vorschau-Export verwendet geänderte Quellen trotz altem BRep-Datensatz', async () => {
  const body = await nativeFixture();
  const stock = body.children.find(node => node.recipe.size[0] === 40);
  stock.recipe.size[0] = 60;
  let recorded;
  const result = await remodelStl(stl, fixedNativeOptions(body, {
    recordPreview: (proof) => { recorded = proof; },
    recordApplied: () => assert.fail('Abweichende Vorschau angewendet'),
  }), 'synthetisch.stl', async (cad, node, _result, add) => {
    const hit = await cad.query('rayPick', { ids: [node.id], ray: { origin: [40, 0, 4], direction: [-1, 0, 0] } });
    assert.ok(Math.abs(hit.point[0] - 30) < 1e-4);
    for (const i of probeRays.keys()) add('Unabhängige Funktionsprobe ' + i, true);
  });
  assert.equal(result.passed, false);
  assert.equal(recorded.passed, false);
  assert.ok(result.deviation > 0.15);
  assert.match(result.reason, /Budget/);
  assert.equal(result.saved, undefined);
});
