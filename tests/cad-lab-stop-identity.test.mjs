import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { createCadController } from '../src/cad-controller.js';
import { runLabFixture } from '../src/cad-lab-fixture.js';

const CANONICAL_STOP_NAME = 'Endanschlag';
const ARCHIVE_STOP_NAME = 'Endanschlag 4 × 24 × 6 mm';
const IDENTIFIED = 'Anschlag anhand von Ausgangsszene, Lage und fester Verbindung eindeutig identifiziert';
const STOP_DIMENSIONS = 'Anschlag · native Abmessungen und Lage';
const STOP_FIXED = 'Anschlag fest mit Führung verbunden';

function controller() {
  const native = new Worker(new URL('./fixtures/cad-node-worker.mjs', import.meta.url));
  const adapter = {
    onmessage: null,
    onerror: null,
    postMessage: (data) => native.postMessage(data),
    terminate: () => native.terminate(),
  };
  native.on('message', (data) => adapter.onmessage?.({ data }));
  native.on('error', (error) => adapter.onerror?.(error));
  return createCadController({ createWorker: () => adapter });
}

function fixture(name, cad, { size = [4, 24, 6], pos = [30, 0, 9], extra = [], joint } = {}) {
  const project = cad.snapshot();
  const guide = project.nodes.find((node) => node.name === 'Führung');
  const linear = project.joints.joints.find((entry) => entry.kind === 'prismatic');
  const rotary = project.joints.joints.find((entry) => entry.kind === 'revolute');
  return [
    { op: 'create', as: 'stop', type: 'box', name, size, pos, solid: true },
    ...extra,
    {
      op: 'joint',
      action: 'create',
      joint: joint ?? {
        id: 'stop-link', kind: 'fixed', parentId: guide.id, childId: '$stop', origin: [30, 0, 6],
      },
    },
    { op: 'joint', action: 'limits', jointId: linear.id, limits: { min: -24, max: 14 } },
    {
      op: 'joint',
      action: 'move',
      values: [{ jointId: linear.id, value: 10 }, { jointId: rotary.id, value: 45 }],
    },
  ];
}

function check(checks, label) {
  const entry = checks.find((item) => item.label === label);
  assert.ok(entry, 'Prüfung fehlt: ' + label);
  return entry;
}

function assertAllPassed(checks) {
  assert.deepEqual(checks.filter((entry) => !entry.passed), []);
}

// Retrofit: the answer creates the stop, so identification rests on the native
// geometry/place and the fixed connection - not on the display name.
for (const name of [CANONICAL_STOP_NAME, ARCHIVE_STOP_NAME, 'Führung']) {
  test('Nachrüsten besteht mit dem Anzeigenamen ' + JSON.stringify(name), async () => {
    const { checks } = await runLabFixture(8, {
      signal: new AbortController().signal,
      createController: controller,
    }, { referenceStopName: name });
    assertAllPassed(checks);
    for (const label of [
      IDENTIFIED,
      'Vier getrennte native Volumenkörper',
      'Vorhandene Körper und Quellen erhalten',
      STOP_DIMENSIONS,
      'Führung · Außenmaße und Materialvolumen erhalten',
      'Schlitten · Passung, Lage und Materialvolumen',
      'Führung · Öffnung frei bei X=-30',
      'Schlitten · Öffnung frei bei X=10',
      STOP_FIXED,
      'Schubgelenk · alte linke Grenze, neue rechte Grenze und Arbeitsstellung',
      'Drehgelenk und Fahne · Winkel und Lage',
      'Rechte Endlage · 2 mm nativer Abstand zum Anschlag',
      'Gelenk weist Überfahren der neuen Endlage ab',
      'Undo stellt den Ausgangszustand wieder her',
    ]) check(checks, label);
  });
}

// Revision: the stop exists in the initial scene. It is continued by its stable
// id, so a renamed stop must survive the revision and be identified without a
// name lookup.
for (const name of [CANONICAL_STOP_NAME, ARCHIVE_STOP_NAME, 'Führung']) {
  test('Revision besteht mit vorhandenem Anschlag ' + JSON.stringify(name), async () => {
    const { checks } = await runLabFixture(9, {
      signal: new AbortController().signal,
      createController: controller,
    }, { referenceStopName: name });
    assertAllPassed(checks);
    for (const label of [
      IDENTIFIED,
      'Vorhandene Körper und Quellen erhalten',
      STOP_DIMENSIONS,
      STOP_FIXED,
      'Schubgelenk · alte linke Grenze, neue rechte Grenze und Arbeitsstellung',
      'Vorhandene Blätter und Ansichtskennungen mit Revision B',
      'Aktuelles natives Zeichnungsblatt Vorrichtung',
      'Aktuelles natives Zeichnungsblatt Schlitten',
      'Undo stellt den Ausgangszustand wieder her',
    ]) check(checks, label);
    const identified = check(checks, IDENTIFIED);
    assert.ok(identified.actual.some((entry) =>
      entry.name === name && entry.reasons.includes('stabile Identität aus der Ausgangsszene')),
    'Der vorhandene Anschlag muss über seine stabile Identität erkannt werden: ' + JSON.stringify(identified.actual));
  });
}

test('Falsche Position des Anschlags scheitert an Abmessungen und Lage', async () => {
  let cad;
  const { checks } = await runLabFixture(8, {
    signal: new AbortController().signal,
    createController: () => (cad = controller()),
    async generate() {
      return { revision: cad.revision(), commands: fixture(CANONICAL_STOP_NAME, cad, { pos: [36, 0, 9] }) };
    },
  });
  assert.equal(check(checks, IDENTIFIED).passed, true);
  const dimensions = check(checks, STOP_DIMENSIONS);
  assert.equal(dimensions.passed, false);
  assert.deepEqual(
    { min: dimensions.actual.min, max: dimensions.actual.max },
    { min: [34, -12, 6], max: [38, 12, 12] },
  );
  // The connection is correct; only the place is wrong. The gap check reports
  // the same wrong place independently.
  assert.equal(check(checks, STOP_FIXED).passed, true);
  assert.equal(check(checks, 'Rechte Endlage · 2 mm nativer Abstand zum Anschlag').passed, false);
});

test('Falsches Gelenk scheitert an der festen Verbindung zur Führung', async () => {
  let cad;
  const { checks } = await runLabFixture(8, {
    signal: new AbortController().signal,
    createController: () => (cad = controller()),
    async generate() {
      const guide = cad.snapshot().nodes.find((node) => node.name === 'Führung');
      return {
        revision: cad.revision(),
        commands: fixture(CANONICAL_STOP_NAME, cad, {
          joint: { id: 'stop-link', kind: 'revolute', parentId: guide.id, childId: '$stop', origin: [30, 0, 6], axis: [1, 0, 0] },
        }),
      };
    },
  });
  assert.equal(check(checks, IDENTIFIED).passed, true);
  assert.equal(check(checks, STOP_DIMENSIONS).passed, true);
  assert.equal(check(checks, STOP_FIXED).passed, false);
});

test('Mehrere plausible Anschlagkörper scheitern nachvollziehbar als mehrdeutig', async () => {
  let cad;
  const { checks } = await runLabFixture(8, {
    signal: new AbortController().signal,
    createController: () => (cad = controller()),
    async generate() {
      return {
        revision: cad.revision(),
        commands: fixture(CANONICAL_STOP_NAME, cad, {
          extra: [{
            op: 'create', as: 'second', type: 'box', name: 'Zweiter Anschlag', size: [4, 24, 6], pos: [30, 0, 9], solid: true,
          }],
        }),
      };
    },
  });
  const identified = check(checks, IDENTIFIED);
  assert.equal(identified.passed, false);
  assert.equal(identified.actual.length, 2);
  assert.deepEqual(identified.actual.map((entry) => entry.name).sort(), ['Endanschlag', 'Zweiter Anschlag']);
  assert.equal(check(checks, 'Vier getrennte native Volumenkörper').passed, false);
});

test('Falsche Position ohne Gelenk bleibt als einziges Zusatzbauteil prüfbar', async () => {
  let cad;
  const { checks } = await runLabFixture(8, {
    signal: new AbortController().signal,
    createController: () => (cad = controller()),
    async generate() {
      const commands = fixture(CANONICAL_STOP_NAME, cad, { pos: [36, 0, 9] });
      return {
        revision: cad.revision(),
        commands: commands.filter((command) => command.op !== 'joint' || command.action !== 'create'),
      };
    },
  });
  assert.equal(check(checks, IDENTIFIED).passed, true);
  assert.equal(check(checks, STOP_DIMENSIONS).passed, false);
  assert.equal(check(checks, STOP_FIXED).passed, false);
});
