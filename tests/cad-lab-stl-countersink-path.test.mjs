import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import Module from 'manifold-3d';
import { readFileSync } from 'node:fs';
import { createCadController } from '../src/cad-controller.js';
import { prepareImportStl } from '../src/mesh-import-core.js';
import { cadPoint, inverseCadMatrix, multiplyCadMatrices } from '../src/cad-affine.js';
import { remodelStl } from '../src/cad-lab-stl-remodel.js';
import { directedCountersinks } from '../src/cad-lab-opening-profile.js';
import { measureCountersinks } from '../src/cad-lab-converter-checks.js';
import { buildStlChallenge } from '../src/cad-lab-stl-challenge-fixtures.js';
import { cadStlAscii } from '../src/cad-mesh-formats.js';
import { lidHousing } from './fixtures/mesh-lid-fixtures.mjs';

// Usage: node --test --test-concurrency=1 tests/cad-lab-stl-countersink-path.test.mjs
// Provider answers are FIXED REPLAYS (no inference, no provider call): the recorded part of an answer is the
// base plate; every countersink command is derived only from scene.stlCountersinks (the measurements).
// Target geometry (probes) lives only in the independent checkers below and never enters the model context.

// prepareMeshImport expects a browser worker: run the same import core in-process.
globalThis.Worker = class {
  constructor(url) {
    // The surface comparison runs in its own worker: use the node fixture of the existing tests.
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

const sub = (a, b) => a.map((v, k) => v - b[k]);
const mul = (a, s) => a.map((v) => v * s);
const add = (a, b) => a.map((v, k) => v + b[k]);

const plateFromScene = (scene) => {
  const { min, max, center } = scene.objects[0].worldBounds;
  return [{ op: 'create', type: 'box', size: sub(max, min), pos: center, solid: true, as: 'plate' }];
};

/** Fixed provider answer; `prelude` builds the plate (alias plate), the drills come from measurements only. */
function fixedAnswer(prelude = plateFromScene, { reverse = false, thickness = 0, repeat = false } = {}) {
  const seen = { requests: 0, measurements: null, drills: [] };
  const generate = async (args) => {
    seen.requests++;
    if (seen.requests > 1 && !repeat) throw Error('Feste Antwort: keine zweite Anfrage vorgesehen.');
    seen.measurements = args.scene.stlCountersinks ?? null;
    seen.contextText = JSON.stringify(args.scene);
    const commands = [...(typeof prelude === 'function' ? prelude(args.scene) : prelude)];
    let target = '$plate';
    (seen.measurements?.countersinks ?? []).forEach((s, i) => {
      const reference = reverse
        ? { ray: { origin: sub(s.entryPoint, mul(s.openingDirection, thickness + 2)), direction: s.openingDirection } }
        : { ray: s.referenceRay };
      const drill = {
        op: 'drill', target, reference, kind: 'countersink', associative: true, through: true,
        diameter: s.boreDiameter, headDiameter: s.headDiameter, angle: s.includedAngleDegrees, as: 'sink' + i,
      };
      seen.drills.push(drill);
      commands.push(drill);
      target = '$sink' + i; // consecutive drills target the last result alias
    });
    return { revision: args.scene.revision, commands, message: 'Nachbau mit gemessenen Senkungen.' };
  };
  return { generate, seen };
}

const run = (bytes, answer, verify, name = 'test.stl') =>
  remodelStl(bytes, { createController, generate: answer.generate, signal: new AbortController().signal }, name, verify, '');

const box = (as, size, pos) => ({ op: 'create', type: 'box', as, size, pos, solid: true });
const bore = (as, d, h, pos) => ({ op: 'create', type: 'cylinder', as, size: [d, d, h], pos, solid: false });
const cone = (as, d, top, h, pos, rot) => ({ op: 'create', type: 'cone', as, size: [d, d, h], pos, rot, params: { topDiameter: top }, solid: false });
const right = [1, 0, 0];
const ray = (label, origin, distance) => ({ label, origin, direction: right, distance });

/** Independent local checker for fresh variants: same 0.08 mm probe criterion as the challenge fixtures. */
async function buildVariant({ parts, transform, probes }) {
  const cad = createController();
  try {
    await cad.execute({ kind: 'batch', commands: [...parts, { op: 'group', targets: parts.map(({ as }) => '$' + as), as: 'result' }] });
    let [body] = cad.snapshot().nodes;
    const original = body.transform;
    if (transform) {
      await cad.execute({ kind: 'batch', commands: [{ op: 'transform', target: body.id, space: 'world', ...transform }] });
      [body] = cad.snapshot().nodes;
    }
    const delta = multiplyCadMatrices(body.transform, inverseCadMatrix(original));
    const output = await cad.exportModel({ format: 'stl', quality: { deflection: 0.02, angleDegrees: 8 } });
    const bytes = await new Blob([output.data]).arrayBuffer();
    const verify = async (controller, target, _result, addCheck) => {
      for (const { label, origin, direction, distance } of probes) {
        const o = cadPoint(delta, origin),
          e = cadPoint(delta, add(origin, direction)),
          hit = await controller.query('rayPick', { ids: [target.id], ray: { origin: o, direction: sub(e, o) } });
        const actualMM = hit ? Math.hypot(...sub(hit.point, o)) : null;
        addCheck(label, distance === null ? actualMM === null : actualMM !== null && Math.abs(actualMM - distance) <= 0.08,
          { expectedMM: distance, actualMM, toleranceMM: 0.08 });
      }
    };
    return { bytes, verify, delta };
  } finally {
    cad.dispose();
  }
}

// Target: bore Ø4, 45° half angle, radius 3 at 2 mm and 4.8 at 0.2 mm from the nearest outer face.
const upSink = (n, x, y) => [
  bore('bore' + n, 4, 10, [x, y, 4]),
  cone('seat' + n, 10.4, 3.6, 3.4, [x, y, 6.5], [180, 0, 0]),
];
const downSink = (n, x, y) => [
  bore('bore' + n, 4, 10, [x, y, 4]),
  cone('seat' + n, 10.4, 3.6, 3.4, [x, y, 1.5], [0, 0, 0]),
];
const upProbes = (x, y, n) => [
  ray('Bohrung Ø4 ' + n, [x, y, 4], 2), ray('Senkung oben r=3 ' + n, [x, y, 6], 3), ray('Senkung oben r=4.8 ' + n, [x, y, 7.8], 4.8),
];
const downProbes = (x, y, n) => [
  ray('Bohrung Ø4 ' + n, [x, y, 4], 2), ray('Senkung unten r=3 ' + n, [x, y, 2], 3), ray('Senkung unten r=4.8 ' + n, [x, y, 0.2], 4.8),
];
const plate = (w = 36, d = 24) => box('plate', [w, d, 8], [0, 0, 4]);
const opposed = {
  parts: [plate(), ...upSink(0, -8, 3), ...downSink(1, 8, -3)],
  probes: [...upProbes(-8, 3, 'A'), ...downProbes(8, -3, 'B')],
};
const rotation = { rotate: [-23, 14, 52], translate: [-21, 9, 17] };
const rotated = {
  parts: [plate(34, 22), ...upSink(0, 6, 2), ...downSink(1, -7, -4)],
  transform: rotation,
  probes: [...upProbes(6, 2, 'A'), ...downProbes(-7, -4, 'B')],
};
// The recorded answer for the fresh rotated plate carries its own base part (never the countersinks):
// the plate centre in world space and its rotation, as a model would measure from the STL sections.
const rotatedBase = (delta) => () => [{ ...plate(34, 22), pos: cadPoint(delta, [0, 0, 4]), rot: rotation.rotate }];

const failed = (result) => (result.features ?? []).filter((f) => !f.passed);
const expectPassed = (result, answer, count) => {
  assert.deepEqual(failed(result), [], JSON.stringify(result));
  assert.equal(result.passed, true, JSON.stringify(result));
  assert.equal(result.probeSource, 'countersink');
  assert.equal(result.measuredCountersinks, count);
  assert.ok(result.deviation <= 0.15, 'Oberflächenabweichung ' + result.deviation);
  assert.equal(answer.seen.drills.length, count);
  assert.ok(result.volumeChangeMM3 > 0);
  // Soll/Ist report: the independent probes' deviation per feature plus the measured hints
  console.log('# Ist', JSON.stringify({
    deviationMM: Number(result.deviation.toFixed(4)),
    probes: result.features.map((f) => [f.label, f.actual?.expectedMM, f.actual?.actualMM && Number(f.actual.actualMM.toFixed(4))]),
    measured: answer.seen.measurements.countersinks.map((s) => ({
      entryPoint: s.entryPoint, openingDirection: s.openingDirection, d: s.boreDiameter, head: s.headDiameter,
      angle: s.includedAngleDegrees, uncertaintyMM: s.uncertaintyMM,
    })),
  }));
};

test('Einzel-Senkung: Challenge-Sollprüfer, 0,15 mm, Merkmalsprobe, Undo und Wiederöffnen', async () => {
  const fixture = await buildStlChallenge('stl-single-seat', { createController, signal: new AbortController().signal });
  const answer = fixedAnswer();
  const result = await run(fixture.bytes, answer, (c, body, _r, addCheck) => fixture.verify(c, body, addCheck), fixture.name);
  expectPassed(result, answer, 1);
  const [m] = answer.seen.measurements.countersinks;
  // measured in the world frame with uncertainty, not copied reference values
  assert.ok(Math.abs(m.entryPoint[0] - 4) < 0.05 && Math.abs(m.entryPoint[1] + 3) < 0.05 && Math.abs(m.entryPoint[2] - 8) < 0.05);
  assert.deepEqual(m.openingDirection.map((v) => Math.round(v) + 0), [0, 0, 1]);
  assert.ok(Math.abs(m.boreDiameter - 4) <= m.uncertaintyMM.boreDiameter + 0.02);
  assert.ok(Math.abs(m.headDiameter - 10) <= m.uncertaintyMM.headDiameter + 0.02);
  assert.equal(m.includedAngleDegrees, 90);
});

test('Doppel-Senkung (Standard): zweite Senkung zielt auf den Alias der ersten', async () => {
  const bytes = readFileSync(new URL('../converter/examples/platte-mit-zwei-senkungen.stl', import.meta.url));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  // Recorded base part: the example plate has vertically rounded corners (R3), taken from its corner sections.
  const rounded = (scene) => plateFromScene(scene).map((c) => ({ ...c, params: { edgeStyle: 'round', edgeSize: 3, edgeScope: 'vertical' } }));
  const answer = fixedAnswer(rounded);
  const result = await run(buffer, answer, async (controller, target, _result, addCheck) =>
    measureCountersinks((kind, origin, direction) =>
      controller.query(kind, { ids: [target.id], ray: { origin, direction } }), addCheck), 'platte-mit-zwei-senkungen.stl');
  expectPassed(result, answer, 2);
  assert.deepEqual(answer.seen.drills.map((d) => d.target), ['$plate', '$sink0']);
  assert.equal(result.features.length, 2);
  // the model context carries measurements, not reference parameters or probe lists
  assert.doesNotMatch(answer.seen.contextText, /expectedMM|toleranceMM|probe|stlBoreSteps/i);
});

test('Gegenrichtung: eine Senkung öffnet nach oben, die andere nach unten', async () => {
  const variant = await buildVariant(opposed);
  const answer = fixedAnswer();
  const result = await run(variant.bytes, answer, variant.verify);
  expectPassed(result, answer, 2);
  const dirs = answer.seen.measurements.countersinks.map((s) => Math.round(s.openingDirection[2])).sort();
  assert.deepEqual(dirs, [-1, 1]);
});

test('Frisch gedrehte Variante mit zwei Öffnungsrichtungen', async () => {
  const variant = await buildVariant(rotated);
  const answer = fixedAnswer(rotatedBase(variant.delta));
  const result = await run(variant.bytes, answer, variant.verify);
  const tilt = answer.seen.measurements?.countersinks.map((s) => s.openingDirection.map((v) => Number(v.toFixed(2))));
  assert.equal(answer.seen.measurements?.countersinks.length, 2, JSON.stringify(answer.seen.measurements));
  assert.ok(tilt.every((d) => Math.abs(d[2]) < 0.99), 'Achse ist räumlich gedreht: ' + JSON.stringify(tilt));
  expectPassed(result, answer, 2);
});

test('Absichtlich umgekehrtes Modell fällt durch', async () => {
  const variant = await buildVariant(opposed);
  const answer = fixedAnswer(plateFromScene, { reverse: true, thickness: 8, repeat: true });
  const result = await run(variant.bytes, answer, variant.verify);
  assert.equal(result.passed, false);
  assert.ok(answer.seen.requests >= 2 && answer.seen.requests <= 3);
  assert.match(result.reason, /Abstand zur unveränderten STL nicht bestätigt|Merkmalsprüfung/);
});

test('Unklarer Fall: reine Bohrung liefert keinen Hinweis und der Nachbau läuft ohne ihn weiter', async () => {
  const variant = await buildVariant({
    parts: [plate(), bore('b', 4, 10, [0, 0, 4])],
    probes: [ray('Bohrung Ø4', [0, 0, 4], 2)],
  });
  const answer = fixedAnswer(scene => [
    ...plateFromScene(scene),
    bore('b', 4, 10, [0, 0, 4]),
    { op: 'group', targets: ['$plate', '$b'], as: 'result' },
  ]);
  const result = await run(variant.bytes, answer, variant.verify);
  assert.equal(answer.seen.requests, 1);
  assert.equal(answer.seen.measurements, null);
  assert.doesNotMatch(answer.seen.contextText, /stlBoreSteps/);
  assert.equal(result.passed, true, JSON.stringify(result));
});

test('Begrenzung: zu große Netze werden nicht gemessen', () => {
  const huge = { id: 'm', kind: 'mesh', transform: [], mesh: { verts: [], triangles: new Array(3 * 100001) } };
  assert.deepEqual(directedCountersinks(huge), []);
});

test('The measured-section lab variant still reaches the model when a source cut is incomplete',async () => {
  const kernel = await Module();
  kernel.setup();
  const { verts: vertices, triangles } = lidHousing(kernel).mesh;
  const index = vertices.length / 3;
  vertices.push(55, 12, 0, 58, 12, 18, 55, 12, 18);
  triangles.push(index, index + 1, index + 2);
  const bytes = new TextEncoder().encode(cadStlAscii([{ name: 'Gehäuse mit offenem Rand', mesh: { vertices, triangles } }])).buffer;
  let context;
  await remodelStl(bytes, {
    createController,
    generate: async ({ scene }) => {
      context = scene.stlSectionProfiles;
      return { message: 'Messdaten empfangen.' };
    },
    signal: new AbortController().signal,
    sectionProfiles: true,
  }, 'Gehäuse mit offenem Rand', async () => {});
  assert.ok(context?.profiles.length);
  const partial = context.profiles.find(p => p.kind === 'meshSectionMeasurements' && !p.complete);
  assert.ok(partial?.rejectedComponents);
  assert.ok(partial.measurements.some(m => m.kind === 'circle' && Math.abs(m.diameter - 3.5) < .01));
  assert.equal(partial.sketch, null);
});

test('STL lab sends leftover CAD objects back for correction before judging the draft', async () => {
  const sized = [20, 12, 6], pos = [2, 3, 3];
  const halves = [box('left', [10.1, 12, 6], [-2.95, 3, 3]), box('right', [10.1, 12, 6], [6.95, 3, 3])];
  const variant = await buildVariant({ parts: halves, probes: [] });
  let calls = 0, correction;
  const result = await run(variant.bytes, {
    generate: async args => {
      if (++calls === 1) return {
        revision: args.scene.revision,
        commands: [box('plate', sized, pos), { ...box('scrap', [1, 1, 1], [50, 60, 7]), name: 'Loses Restobjekt' }],
      };
      correction = args.correction;
      return {
        revision: args.scene.revision,
        commands: [
          ...halves,
          { op: 'group', targets: ['$left', '$right'], as: 'result' },
        ],
      };
    },
  }, variant.verify);
  assert.equal(calls, 2);
  assert.match(correction, /Loses Restobjekt/);
  assert.equal(result.passed, true, JSON.stringify(result));
});

test('STL lab keeps measured features after a technical repair and a regressing correction', async () => {
  const halves = [box('left', [10.1, 12, 6], [-2.95, 3, 3]), box('right', [10.1, 12, 6], [6.95, 3, 3])];
  const variant = await buildVariant({ parts: halves, probes: [
    ray('Armwand oben', [1, 3, 5], 11),
    ray('Seitenwand unten', [1, 3, 2], 11),
  ] });
  const group = { op: 'group', targets: ['$left', '$right'], as: 'result' };
  const low = halves.map(({ pos, size, ...part }) => ({ ...part, pos: [pos[0], pos[1], 1.5], size: [size[0], size[1], 3] }));
  const shifted = halves.map(({ pos, ...part }) => ({ ...part, pos: [pos[0] - 1, pos[1], pos[2]] }));
  const attempts = [[halves[0], group], [...low, group], [...shifted, group], [...halves, group]];
  const received = [];
  let initialRevision;
  const answer = {
    generate: async args => {
      initialRevision ??= args.scene.revision;
      assert.equal(args.scene.revision, initialRevision);
      assert.equal(args.scene.objects.length, 1);
      assert.equal(args.scene.objects[0].kind, 'mesh');
      received.push(args.correction ? JSON.parse(args.correction.split('\n')[1]) : null);
      return { revision: args.scene.revision, commands: attempts[received.length - 1] };
    },
  };
  const result = await run(variant.bytes, answer, variant.verify);
  assert.equal(result.passed, true, JSON.stringify(result));
  assert.equal(received.length, 4);
  assert.notEqual(received[1].feedback.code, 'AI_STL_RESULT_MEASUREMENTS');
  const first = received[2].feedback;
  assert.equal(first.code, 'AI_STL_RESULT_MEASUREMENTS');
  assert.equal(first.allowedTolerance, 0.15);
  assert.ok(first.measuredTolerance > 0.15);
  assert.match(first.message, /Entwurf min .*max \[12, 9, 3\]/);
  assert.match(first.failures[0].message, /Armwand oben.*"actualMM":null/);
  assert.ok(first.confirmedMeasurements.some(item => item.startsWith('Seitenwand unten')));
  const { feedback: retry, rejectedBatch } = received[3];
  assert.match(retry.message, /Bereits bestätigte Maße/);
  assert.ok(retry.failures.some(f => f.code === 'AI_STL_MEASURE_REGRESSION' && f.message.startsWith('Seitenwand unten')));
  assert.ok(retry.failures.some(f => f.code === 'AI_STL_FEATURE_CHECK' && f.message.startsWith('Armwand oben')));
  assert.deepEqual(rejectedBatch.commands[0].pos, low[0].pos);
  assert.equal(result.features.every(feature => feature.passed), true);
});

test('STL reconstruction sends stepped hole intervals in world coordinates', async () => {
  const variant = await buildVariant({ parts: [
    box('plate', [20, 12, 6], [0, 0, 3]),
    bore('small', 4, 8, [0, 0, 3]),
    bore('large', 8, 4, [0, 0, 6]),
  ], probes: [] });
  let measured;
  await remodelStl(variant.bytes, {
    createController, signal: new AbortController().signal,
    generate: async ({ scene }) => {
      measured = scene.stlBoreSteps;
      return { message: 'Messwerte gelesen.' };
    },
  }, 'Stufenbohrung', variant.verify);
  assert.equal(measured.steps.length, 1);
  const [step] = measured.steps;
  assert.deepEqual(step.axis, [0, 0, 1]);
  for (const [stage, diameter, z0, z1] of [[step.stages[0], 4, 0, 4], [step.stages[1], 8, 4, 6]]) {
    assert.ok(Math.abs(stage.diameterMM - diameter) < 0.005, JSON.stringify(stage));
    assert.ok(Math.abs(stage.from[2] - z0) < 0.005 && Math.abs(stage.to[2] - z1) < 0.005);
    assert.ok(stage.diameterFitBoundMM <= 0.04);
    assert.equal(stage.includesUnclassifiedSections, undefined);
  }
});
