import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { validateCadExchangeManifest } from '../src/cad-exchange-manifest.js';
import { exportCadExchangeStep, importCadExchangeStep } from '../src/cad-exchange-package-step.js';
import { loadCadKernel } from '../src/cad-kernel-loader.js';
import { buildCadRecipe } from '../src/cad-recipes.js';

const catalog = {
  definitions: [
    { id: 'bearing-a', name: 'Läger' },
    { id: 'bearing-b', name: 'Läger' },
  ],
  occurrences: [
    { id: 'left', definitionId: 'bearing-a', name: 'Lager' },
    { id: 'right', definitionId: 'bearing-a', name: 'Lager' },
    { id: 'spare', definitionId: 'bearing-b', name: 'Lager' },
  ],
};

function manifest() {
  return {
    format: 'formnaro-cad-exchange',
    version: 1,
    units: { length: 'mm', angle: 'rad' },
    coordinates: { handedness: 'right', up: '+Z' },
    step: { sha256: '0'.repeat(64) },
    ...structuredClone(catalog),
  };
}

test('The v1 manifest has an explicit millimetre, radian and Z-up contract', () => {
  const input = manifest(),
    validated = validateCadExchangeManifest(input);
  assert.deepEqual(validated, input);
  input.occurrences[0].name = 'Changed';
  assert.equal(validated.occurrences[0].name, 'Lager');
});

test('The manifest rejects unsupported headers, ambiguous IDs and missing geometry references', () => {
  const cases = [
    [(m) => (m.format = 'fnpack'), /format/i],
    [(m) => (m.version = 2), /version/i],
    [(m) => (m.units.length = 'in'), /einheiten/i],
    [(m) => (m.coordinates.up = '+Y'), /koordinatensystem/i],
    [(m) => (m.step.sha256 = 'abc'), /SHA-256/],
    [(m) => (m.definitions[1].id = m.definitions[0].id), /Doppelte Definitionskennung/],
    [(m) => (m.occurrences[1].id = m.occurrences[0].id), /Doppelte Vorkommenskennung/],
    [(m) => (m.occurrences[0].definitionId = 'missing'), /Unbekannte Definition/],
    [(m) => (m.occurrences[2].definitionId = 'bearing-a'), /ohne Vorkommen/],
    [(m) => (m.occurrences[1] = null), /Vorkommen/],
    [(m) => delete m.occurrences[1], /Vorkommen/],
  ];
  for (const [change, error] of cases) {
    const input = manifest();
    change(input);
    assert.throws(() => validateCadExchangeManifest(input), error);
  }
});

test('Package STEP binds repeated and independent parts with identical display names', async () => {
  const oc = await loadCadKernel({ print: () => {}, printErr: () => {} }),
    shape = buildCadRecipe(oc, { type: 'box', size: [10, 6, 4] }),
    parts = [
      { occurrenceId: 'right', shape, placement: { translation: [30, 0, 0] } },
      { occurrenceId: 'spare', shape },
      { occurrenceId: 'left', shape },
    ],
    assemblyTree = {
      name: 'Baugruppe',
      children: [{ name: 'Antrieb', children: [{ partIndex: 2 }, { partIndex: 0 }] }, { partIndex: 1 }],
    };
  try {
    const result = await exportCadExchangeStep(oc, catalog, parts, assemblyTree),
      { manifest: document, stepBytes } = result;
    assert.equal(document.step.sha256, createHash('sha256').update(stepBytes).digest('hex'));

    const step = new TextDecoder().decode(stepBytes);
    assert.match(step, /PRODUCT\(\s*'FORMNARO-D-bearing-a'/);
    assert.match(step, /PRODUCT\(\s*'FORMNARO-D-bearing-b'/);
    assert.match(step, /NEXT_ASSEMBLY_USAGE_OCCURRENCE\(\s*'[^']*'\s*,\s*'FORMNARO-O-right'/);
    assert.equal([...step.matchAll(/MANIFOLD_SOLID_BREP/g)].length, 2);

    const [root] = await importCadExchangeStep(oc, document, stepBytes),
      [drive, spare] = root.children,
      [left, right] = drive.children;
    assert.equal(root.name, 'Baugruppe');
    assert.equal(drive.name, 'Antrieb');
    assert.deepEqual([left, right, spare].map((part) => part.name), ['Lager', 'Lager', 'Lager']);
    assert.deepEqual([left, right, spare].map((part) => part.definitionName), ['Läger', 'Läger', 'Läger']);
    assert.deepEqual([left, right, spare].map((part) => part.occurrenceId), ['left', 'right', 'spare']);
    assert.deepEqual([left, right, spare].map((part) => part.definitionId), ['bearing-a', 'bearing-a', 'bearing-b']);
    assert.deepEqual([left, right, spare].map((part) => part.worldTransform[12]), [0, 30, 0]);

    const changedBytes = new Uint8Array([...stepBytes, 32]);
    await assert.rejects(importCadExchangeStep(oc, document, changedBytes), /SHA-256/);

    const wrong = structuredClone(document);
    wrong.occurrences[0].definitionId = 'bearing-b';
    await assert.rejects(importCadExchangeStep(oc, wrong, stepBytes), /widersprüchliche STEP-Definition/);

    const missing = structuredClone(document);
    missing.occurrences.push({ id: 'missing', name: 'Lager', definitionId: 'bearing-a' });
    await assert.rejects(importCadExchangeStep(oc, missing, stepBytes), /fehlt in der STEP-Geometrie/);

    const extra = structuredClone(document);
    extra.occurrences.shift();
    await assert.rejects(importCadExchangeStep(oc, extra, stepBytes), /Unbekanntes STEP-Vorkommen/);
    await assert.rejects(
      exportCadExchangeStep(oc, catalog, [parts[0], parts[0], parts[2]], assemblyTree),
      /mehrfach belegtes CAD-Austauschvorkommen/,
    );
    await assert.rejects(
      exportCadExchangeStep(oc, catalog, parts, { ...assemblyTree, name: 'A'.repeat(201) }),
      /ungültigen Namen/,
    );

    const modified = new TextEncoder().encode(step.replaceAll('FORMNARO-O-right', 'FORMNARO-O-left')),
      modifiedManifest = structuredClone(document);
    modifiedManifest.step.sha256 = createHash('sha256').update(modified).digest('hex');
    await assert.rejects(importCadExchangeStep(oc, modifiedManifest, modified), /Unbekanntes STEP-Vorkommen/);

    const renamed = structuredClone(catalog);
    renamed.occurrences[1].name = 'Rücklager';
    const coincident = await exportCadExchangeStep(
      oc,
      renamed,
      [{ ...parts[0], placement: undefined }, parts[1], parts[2]],
      { name: 'Baugruppe', children: [{ partIndex: 1 }, { partIndex: 0 }, { partIndex: 2 }] },
    );
    const [coincidentRoot] = await importCadExchangeStep(oc, coincident.manifest, coincident.stepBytes);
    assert.deepEqual(coincidentRoot.children.map(({ occurrenceId }) => occurrenceId), ['spare', 'right', 'left']);
    assert.equal(coincidentRoot.children[1].name, 'Rücklager');
    assert.deepEqual(coincidentRoot.children[1].worldTransform, coincidentRoot.children[2].worldTransform);
  } finally {
    shape.delete();
  }
});
