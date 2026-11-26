import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { meshSectionContours } from '../src/mesh-section-contours.js';
import {
  BORE_SOURCE_LIMITS,
  boreSourceFromOpening,
  checkBoreSourceSection,
  measureBoreSourceStages,
  measuredBoreOpenings,
  openBoreSources,
  saveBoreSources,
  setBoreSourceStageDiameter,
  steppedBoreSource,
  transformBoreSource,
  validateBoreSource,
} from '../src/mesh-stepped-bores.js';
import { cadBoreCutter, cadBoreCutters } from '../src/cad-tools-native.js';

// Usage: node --test --test-concurrency=1 tests/cad-r04-bore-sources.test.mjs
// All inputs are synthetic fixtures created in this file (like the R02
// "synthetic R02 fixture"): the repository stays free of private holder data.
// The real r7 measurement is checked separately by
// work/rueckgabe/probe-r04-real.mjs, which is not committed.

const kernel = await Module();
kernel.setup();

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const close = (actual, expected, epsilon = 1e-6, what = 'Punkt') => {
  assert.equal(actual.length, expected.length, what);
  for (let i = 0; i < expected.length; i++)
    assert.ok(Math.abs(actual[i] - expected[i]) <= epsilon, `${what}[${i}]: ${actual[i]} statt ${expected[i]}`);
};

// Synthetic front/rear openings with a known lateral offset of 0.19 mm.
const FRONT = Object.freeze({ x: -33.14, y: 14.37, z: 96.5, diameter: 19.5 });
const REAR = Object.freeze({ x: FRONT.x + 0.19, y: 60.19, z: FRONT.z, diameter: 22.2 });

// Synthetic stepped bore: two diameters, two depths and 0.06 mm lateral offset.
const STEPPED_BORE = Object.freeze({
  axis: [0, 0, 1],
  stages: [
    {
      diameterMM: 3.3,
      diameterFitBoundMM: 0.001,
      from: [-19.54, 51.64, 0],
      to: [-19.54, 51.64, 4],
      depthBetweenPlanesMM: 4,
    },
    {
      diameterMM: 6.8,
      diameterFitBoundMM: 0.002,
      from: [-19.48, 51.64, 4],
      to: [-19.48, 51.64, 8.5],
      depthBetweenPlanesMM: 4.5,
    },
  ],
});

const frontSection = {
  cut: { normal: [0, 1, 0], planePoint: [0, FRONT.y, 0] },
  innerCircles: [
    { role: 'hole', center: [FRONT.x, FRONT.y, FRONT.z], diameter: FRONT.diameter, fitErrorBound: 0.002 },
  ],
};
const rearSection = {
  cut: { normal: [0, 1, 0], planePoint: [0, REAR.y, 0] },
  innerCircles: [
    { role: 'hole', center: [REAR.x, REAR.y, REAR.z], diameter: REAR.diameter, fitErrorBound: 0.002 },
  ],
};
const frontCheck = {
  measuredCircle: { center: [FRONT.x, FRONT.y, FRONT.z], diameter: FRONT.diameter },
};
const boreSteps = {
  steps: [
    {
      axis: [0, 1, 0],
      stages: [
        {
          diameterMM: REAR.diameter,
          diameterFitBoundMM: 0.004,
          from: [REAR.x, 58.9, REAR.z],
          to: [REAR.x, 67.1, REAR.z],
          depthBetweenPlanesMM: 8.2,
        },
      ],
    },
  ],
};

const r7 = measuredBoreOpenings({ frontSection, rearSection, frontCheck, boreSteps });

function meshNode(kernel, id, build) {
  const owned = [];
  const own = (shape) => (owned.push(shape), shape);
  try {
    const shape = build(kernel.Manifold, own);
    const raw = shape.getMesh(),
      verts = [];
    for (let i = 0; i < raw.vertProperties.length; i += raw.numProp)
      verts.push(...raw.vertProperties.slice(i, i + 3));
    return {
      id,
      kind: 'mesh',
      name: id,
      transform: [...identity],
      meshRole: 'solid',
      color: '#7ba8bf',
      opacity: 1,
      hidden: false,
      locked: false,
      metadata: { notes: 'synthetic R04 fixture' },
      mesh: { verts, triangles: Array.from(raw.triVerts) },
    };
  } finally {
    for (const shape of owned.reverse()) shape.delete();
  }
}

// A 24 x 12 x 22 mm synthetic arm block with the measured front bore along +Y.
function armNode({ x, z }, diameterMM) {
  return meshNode(kernel, 'r04-arm', (M, own) => {
    const block = own(M.cube([24, 12, 22]).translate([-45.2, 8, 86]));
    const bore = own(
      M.cylinder(14, diameterMM / 2, diameterMM / 2, 96)
        .rotate([90, 0, 0])
        .translate([x, 21, z]),
    );
    return own(block.subtract(bore));
  });
}

// A synthetic plate around the stepped bore. Every stage keeps its own centre
// unless `coaxial` is requested explicitly.
function steppedNode(source, { coaxial = false } = {}) {
  const [small, large] = source.stages,
    bottom = Math.min(...source.stages.map((stage) => stage.from[2])),
    top = Math.max(...source.stages.map((stage) => stage.to[2])),
    x0 = Math.min(...source.stages.map((stage) => stage.from[0])) - 6,
    y0 = Math.min(...source.stages.map((stage) => stage.from[1])) - 6;
  return meshNode(kernel, 'r04-plate', (M, own) => {
    const plate = own(M.cube([12, 12, top - bottom]).translate([x0, y0, bottom]));
    const lower = own(
      M.cylinder(small.to[2] - small.from[2], small.diameterMM / 2, small.diameterMM / 2, 96).translate([
        small.from[0],
        small.from[1],
        small.from[2],
      ]),
    );
    const upper = own(
      M.cylinder(large.to[2] - large.from[2], large.diameterMM / 2, large.diameterMM / 2, 96).translate([
        coaxial ? small.from[0] : large.from[0],
        coaxial ? small.from[1] : large.from[1],
        large.from[2],
      ]),
    );
    return own(plate.subtract(lower).subtract(upper));
  });
}

const frontSource = () => boreSourceFromOpening(r7.openings[0]);
const steppedSource = () => steppedBoreSource(STEPPED_BORE);

test('R04-01: vordere und hintere Öffnung werden getrennt aus der Messung gelesen', () => {
  assert.equal(r7.kind, 'measuredBoreOpenings');
  assert.equal(r7.ok, true);
  assert.equal(r7.openings.length, 2);
  const [front, rear] = r7.openings;
  assert.equal(front.id, 'bohrung-vorne');
  assert.equal(rear.id, 'bohrung-hinten');
  assert.notEqual(front.label, rear.label);
  // Two separately named world points, each in its own cut.
  assert.deepEqual(front.point, [FRONT.x, FRONT.y, FRONT.z]);
  assert.deepEqual(front.cut.planePoint, [0, FRONT.y, 0]);
  assert.deepEqual(front.axis, [0, 1, 0]);
  assert.equal(front.diameterMM, FRONT.diameter);
  assert.deepEqual(rear.point, [REAR.x, REAR.y, REAR.z]);
  assert.deepEqual(rear.cut.planePoint, [0, REAR.y, 0]);
  assert.deepEqual(rear.axis, [0, 1, 0]);
  assert.equal(rear.diameterMM, REAR.diameter);
  // Each point lies in the plane of the cut that measured it.
  for (const opening of r7.openings) {
    const offset = opening.point
      .map((value, k) => value - opening.cut.planePoint[k])
      .reduce((sum, value, k) => sum + value * opening.axis[k], 0);
    assert.ok(Math.abs(offset) < 1e-5, `${opening.id}: ${offset} mm neben dem Schnitt`);
  }
  // The rear point is cross-checked against its measured stage.
  assert.deepEqual(rear.measuredStage.from, [REAR.x, 58.9, REAR.z]);
  assert.deepEqual(rear.measuredStage.to, [REAR.x, 67.1, REAR.z]);
  assert.equal(rear.measuredStage.depthMM, 8.2);
  // The front point is confirmed by its independent counter-check.
  const frontCheckResult = r7.checks.find((entry) => entry.id === 'gegenprobe-vorne');
  assert.equal(frontCheckResult.centerDistanceMM, 0);
  assert.equal(frontCheckResult.diameterDifferenceMM, 0);
  // The synthetic openings are 0.19 mm beside each other: not interchangeable.
  assert.equal(r7.lateralOffsetMM, 0.19);
  assert.ok(Math.abs(r7.offsetMM - Math.hypot(0.19, REAR.y - FRONT.y)) < 1e-5);
  assert.ok(r7.offsetMM > 40, 'Die Öffnungen liegen in verschiedenen Schnitten');

  // A rear-bore section cannot impersonate the front opening.
  const mixed = () =>
    measuredBoreOpenings({ frontSection: rearSection, rearSection, frontCheck, boreSteps });
  assert.throws(mixed, { code: 'BORE_SOURCE_MEASUREMENT' });
});

test('R04-02: vordere Bohrquelle liegt am eigenen Messpunkt; ein vertauschter hinterer Punkt fällt durch', () => {
  const source = frontSource();
  assert.equal(source.kind, 'boreSource');
  assert.equal(validateBoreSource(source).id, 'bohrung-vorne');
  assert.deepEqual(source.point, [FRONT.x, FRONT.y, FRONT.z]);
  assert.deepEqual(source.axis, [0, 1, 0]);
  assert.equal(source.stages[0].diameterMM, FRONT.diameter);
  assert.deepEqual(source.open, ['axiale Enden']);

  // A section through the finished front opening confirms the measured location.
  const arm = armNode({ x: source.point[0], z: source.point[2] }, source.stages[0].diameterMM);
  const section = meshSectionContours(arm, {
    normal: source.cut.normal,
    planePoint: source.cut.planePoint,
    summaryOnly: true,
  });
  const confirmed = checkBoreSourceSection(source, section);
  assert.equal(confirmed.ok, true, JSON.stringify(confirmed.problems));
  const centerCheck = confirmed.checks.find((entry) => entry.id === 'mitte'),
    diameterCheck = confirmed.checks.find((entry) => entry.id === 'durchmesser');
  assert.ok(centerCheck.distanceMM <= BORE_SOURCE_LIMITS.pointToleranceMM);
  assert.ok(diameterCheck.differenceMM <= BORE_SOURCE_LIMITS.diameterToleranceMM);
  assert.ok(centerCheck.distanceMM < 0.01, `Schnittmitte ${centerCheck.actual}`);
  assert.ok(diameterCheck.differenceMM < 0.02, `Schnittdurchmesser ${diameterCheck.actualMM}`);

  // The native cutting source sits on the measured point and axis.
  const cutter = cadBoreCutter(source, { lengthMM: 20 });
  assert.equal(cutter.recipe.type, 'cylinder');
  assert.deepEqual(cutter.recipe.size, [FRONT.diameter, FRONT.diameter, 20]);
  assert.deepEqual(cutter.axis, [0, 1, 0]);
  close([cutter.transform[12], cutter.transform[13], cutter.transform[14]], source.point);
  const localZ = [cutter.transform[8], cutter.transform[9], cutter.transform[10]].map((value) => Math.round(value));
  assert.deepEqual(localZ, [0, 1, 0]);
  close(cutter.from, [FRONT.x, FRONT.y - 10, FRONT.z]);
  close(cutter.to, [FRONT.x, FRONT.y + 10, FRONT.z]);
  assert.equal(cadBoreCutters(source, { lengthMM: 20 }).length, 1);

  // Deliberately swapped: the rear measured centre (X/Z) is used in the front
  // cut. Only the lateral point is swapped; the cut plane stays the front one.
  const rear = r7.openings[1];
  const swappedCutter = cadBoreCutter(
    { ...source, point: [rear.point[0], source.point[1], rear.point[2]] },
    { lengthMM: 20 },
  );
  const swappedArm = meshNode(kernel, 'r04-arm-swapped', (M, own) => {
    const block = own(M.cube([24, 12, 22]).translate([-45.2, 8, 86]));
    const bore = own(
      M.cylinder(swappedCutter.lengthMM, swappedCutter.diameterMM / 2, swappedCutter.diameterMM / 2, 96)
        .rotate([90, 0, 0])
        .translate([swappedCutter.from[0], swappedCutter.to[1], swappedCutter.from[2]]),
    );
    return own(block.subtract(bore));
  });
  const swappedSection = meshSectionContours(swappedArm, {
    normal: source.cut.normal,
    planePoint: source.cut.planePoint,
    summaryOnly: true,
  });
  const swapped = checkBoreSourceSection(source, swappedSection);
  assert.equal(swapped.ok, false);
  assert.ok(swapped.problems.some((problem) => problem.id === 'mitte'));
  const swappedCenter = swapped.checks.find((entry) => entry.id === 'mitte');
  assert.ok(swappedCenter.distanceMM > BORE_SOURCE_LIMITS.pointToleranceMM);
  assert.ok(Math.abs(swappedCenter.distanceMM - 0.19) < 0.005, `Versatz ${swappedCenter.distanceMM}`);
});

test('R04-03: Durchmesser und Tiefe beider Stufen messbar, seitlicher Versatz bleibt erhalten', () => {
  const source = steppedSource();
  assert.equal(source.kind, 'boreSource');
  assert.deepEqual(source.axis, [0, 0, 1]);
  assert.deepEqual(source.stages.map((stage) => stage.diameterMM), [3.3, 6.8]);
  assert.deepEqual(source.stages.map((stage) => stage.depthMM), [4, 4.5]);
  assert.deepEqual(source.stages[0].from, [-19.54, 51.64, 0]);
  assert.deepEqual(source.stages[0].to, [-19.54, 51.64, 4]);
  assert.deepEqual(source.stages[1].from, [-19.48, 51.64, 4]);
  assert.deepEqual(source.stages[1].to, [-19.48, 51.64, 8.5]);
  assert.equal(source.totalDepthMM, 8.5);
  // The measured stages are not coaxial: 0.06 mm lateral offset.
  assert.equal(source.lateralOffsets.length, 1);
  assert.equal(source.lateralOffsets[0].offsetMM, 0.06);

  const measured = measureBoreSourceStages(steppedNode(source), source);
  assert.equal(measured.ok, true, JSON.stringify(measured.problems));
  for (const stage of measured.stages) {
    assert.ok(stage.deviations.diameterMM <= BORE_SOURCE_LIMITS.diameterToleranceMM, `Ø ${stage.index}`);
    assert.ok(stage.deviations.depthMM <= BORE_SOURCE_LIMITS.depthToleranceMM, `Tiefe ${stage.index}`);
  }
  assert.equal(measured.stages[0].samples >= 20, true);
  assert.ok(Math.abs(measured.stages[0].actual.diameterMM - 3.3) < 0.05);
  assert.ok(Math.abs(measured.stages[1].actual.diameterMM - 6.8) < 0.05);
  assert.ok(Math.abs(measured.stages[0].actual.depthMM - 4) <= 0.15, `Tiefe 1 ${measured.stages[0].actual.depthMM}`);
  assert.ok(Math.abs(measured.stages[1].actual.depthMM - 4.5) <= 0.15, `Tiefe 2 ${measured.stages[1].actual.depthMM}`);
  assert.ok(measured.lateralOffsets[0].offsetMM > 0.03);
  assert.ok(
    Math.abs(measured.lateralOffsets[0].offsetMM - 0.06) <= BORE_SOURCE_LIMITS.offsetToleranceMM,
    `gemessener Versatz ${measured.lateralOffsets[0].offsetMM}`,
  );

  // Forcing the stages coaxial destroys the measured offset and is caught.
  const forced = measureBoreSourceStages(steppedNode(source, { coaxial: true }), source);
  assert.equal(forced.ok, false);
  const offsetCheck = forced.checks.find((entry) => entry.id === 'seitlicher-versatz');
  assert.equal(offsetCheck.ok, false);
  assert.ok(Math.abs(offsetCheck.actualMM) < 0.005);
  assert.equal(offsetCheck.expectedMM, 0.06);
  assert.ok(offsetCheck.differenceMM > BORE_SOURCE_LIMITS.offsetToleranceMM);
  // Dimensions alone stay confirmed: only the offset is wrong.
  assert.ok(forced.checks.filter((entry) => entry.id.endsWith('durchmesser')).every((entry) => entry.ok));
  assert.ok(forced.checks.filter((entry) => entry.id.endsWith('tiefe')).every((entry) => entry.ok));
});

test('R04-04: Achsen und Endpunkte drehen mit, die Quelle bleibt nach JSON-Rundlauf änderbar', () => {
  const source = steppedSource(),
    front = frontSource(),
    // 90° about Z plus a translation (column-major, as in the CAD project).
    rotation = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 100, 50, 0, 1],
    rotated = transformBoreSource(source, rotation),
    rotatedFront = transformBoreSource(front, rotation);

  assert.deepEqual(rotated.axis, [0, 0, 1]);
  close(rotated.stages[0].from, [100 - 51.64, 50 - 19.54, 0]);
  close(rotated.stages[1].from, [100 - 51.64, 50 - 19.48, 4]);
  close(rotated.stages[1].to, [100 - 51.64, 50 - 19.48, 8.5]);
  assert.equal(rotated.totalDepthMM, 8.5);
  assert.deepEqual(rotatedFront.axis, [-1, 0, 0]);
  close(rotatedFront.point, [100 - FRONT.y, 50 + FRONT.x, FRONT.z]);
  assert.deepEqual(rotatedFront.cut.normal, [-1, 0, 0]);
  for (const [stage, rotatedStage] of source.stages.map((stage, i) => [stage, rotated.stages[i]]))
    assert.ok(Math.abs(stage.depthMM - rotatedStage.depthMM) < 1e-9);

  // The rotated source still measures the same stages on the rotated body.
  const rotatedNode = { ...steppedNode(source), transform: rotation, id: 'r04-plate-rotated' };
  const measured = measureBoreSourceStages(rotatedNode, rotated);
  assert.equal(measured.ok, true, JSON.stringify(measured.problems));
  assert.ok(Math.abs(measured.lateralOffsets[0].offsetMM - 0.06) <= BORE_SOURCE_LIMITS.offsetToleranceMM);

  // Only rigid placements: no scale, no mirror.
  assert.throws(() => transformBoreSource(source, [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), {
    code: 'BORE_SOURCE_TRANSFORM',
  });
  assert.throws(() => transformBoreSource(source, [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), {
    code: 'BORE_SOURCE_TRANSFORM',
  });

  // Save, reopen, edit and rebuild: the source stays a source, not a measurement snapshot.
  const saved = saveBoreSources([source, front]);
  const text = JSON.stringify(saved);
  const reopened = openBoreSources(JSON.parse(text));
  assert.equal(reopened.kind, 'boreSourceLibrary');
  assert.equal(reopened.status, 'editable');
  assert.equal(reopened.sources.length, 2);
  assert.deepEqual(reopened.sources[0], source);
  const edited = setBoreSourceStageDiameter(reopened.sources[0], 2, 7);
  assert.equal(edited.stages[1].diameterMM, 7);
  assert.deepEqual(edited.edited, { stage: 2, name: 'durchmesser', from: 6.8, to: 7 });
  // Provenance stays untouched; the stage is the editable design value.
  assert.deepEqual(edited.stages[0], source.stages[0]);
  assert.equal(reopened.sources[0].stages[1].diameterMM, 6.8);
  assert.throws(() => setBoreSourceStageDiameter(reopened.sources[0], 3, 7), { code: 'BORE_SOURCE_DIMENSION' });
  assert.throws(() => setBoreSourceStageDiameter(reopened.sources[0], 2, -1), { code: 'BORE_SOURCE_INPUT' });

  // The edited source builds a measurable 7 mm stage; depth and offset survive.
  const rebuilt = measureBoreSourceStages(steppedNode(edited), edited);
  assert.equal(rebuilt.ok, true, JSON.stringify(rebuilt.problems));
  assert.ok(Math.abs(rebuilt.stages[1].actual.diameterMM - 7) < 0.05);
  assert.ok(Math.abs(rebuilt.stages[1].actual.depthMM - 4.5) <= BORE_SOURCE_LIMITS.depthToleranceMM);
  assert.ok(
    Math.abs(rebuilt.lateralOffsets[0].offsetMM - 0.06) <= BORE_SOURCE_LIMITS.offsetToleranceMM,
    `Versatz nach Rundlauf ${rebuilt.lateralOffsets[0].offsetMM}`,
  );

  // A reopened source is persistable again.
  const again = openBoreSources(JSON.parse(JSON.stringify(saveBoreSources([edited, ...reopened.sources.slice(1)]))));
  assert.equal(again.sources[0].stages[1].diameterMM, 7);
});
