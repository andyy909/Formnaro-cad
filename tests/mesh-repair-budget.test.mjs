import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAD_IDENTITY_MATRIX,
  createCadProject,
  cadProjectSnapshot,
  serializeCadProject,
  parseCadProject,
  validateCadProject,
} from '../src/cad-project.js';
import {
  MESH_REPAIR_FASSUNG_VERSION,
  meshRepairFassungSummary,
  repairFassungFromReport,
  validateMeshRepairFassung,
} from '../src/mesh-repair-fassung.js';
import { conversionSummary, repairAdmissionSummary } from '../src/cad-stl-converter.js';

const hex = (character) => character.repeat(64);
const fassung = () => ({
  version: MESH_REPAIR_FASSUNG_VERSION,
  id: hex('a'),
  origin_sha256: hex('b'),
  result_sha256: hex('c'),
  budget_mm: 0.15,
  samples: 6000,
  accepted: true,
});
function body(extra = {}) {
  return {
    id: 'body',
    kind: 'cad',
    name: 'Reparierter Halter',
    solid: true,
    transform: [...CAD_IDENTITY_MATRIX],
    source: 'step',
    brep: { format: 'OpenCascade-BRep', data: 'synthetic-brep-data', triangulation: false },
    stats: { bounds: { min: [-10, -10, 0], max: [10, 10, 10] }, volume: 1000, solids: 1 },
    ...extra,
  };
}
const report = (admission = {}) => ({
  version: '0.10.0',
  input_triangles: 22009,
  output_faces: 1042,
  solids: 1,
  bodies: [{ method: 'Originalfacetten', stage: 'exact' }],
  deviation: { sampled_max_mm: 0.005 },
  tessellation_allowance_mm: 0.01,
  options: { tolerance: 0.15 },
  repairs: {
    applied: true,
    admission: {
      version: 1,
      accepted: true,
      kind: 'repaired',
      reason: null,
      threshold_mm: 0.15,
      measurement: {
        samples_per_direction: 24000,
        directions: {
          original_to_repaired: {
            reference: 'original',
            max_mm: 0.012,
            max_point_mm: [1, 2, 3],
            points: 24000,
            unit: 'mm',
          },
          repaired_to_original: {
            reference: 'repaired',
            max_mm: 0.004,
            max_point_mm: [-1, -2, -3],
            points: 24000,
            unit: 'mm',
          },
        },
      },
      topology: {
        before: { faces: 22009, edges: 33017, openings: 2 },
        after: { faces: 22004, edges: 33006, openings: 0 },
      },
      openings: { before: 2, after: 0, boundary_edges_before: 10, boundary_edges_after: 0, bridged: false },
      outside_repair_region: { faces: 21921, changed_faces: 88, preserved: true, max_mm: 0 },
      fassung: fassung(),
      ...admission,
    },
  },
});

test('N03-04 result identifier and origin are read from the report and validated strictly', () => {
  const value = { ...fassung(), input: 'Haltér.stl', input_sha256: hex('d'), repaired_stl_sha256: hex('e') };
  const accepted = report();
  accepted.repair_fassung = value;
  assert.deepEqual(repairFassungFromReport(accepted), value);
  assert.deepEqual(repairFassungFromReport(report()), fassung());
  assert.equal(repairFassungFromReport({ repairs: { applied: false } }), null);
  assert.equal(repairFassungFromReport({ repairs: { applied: true, admission: { accepted: false } } }), null);
  for (const invalid of [
    { ...fassung(), id: 'not-a-hash' },
    { ...fassung(), origin_sha256: 'B'.repeat(64) },
    { ...fassung(), samples: 499 },
    { ...fassung(), budget_mm: 0 },
    { ...fassung(), version: 2 },
    { ...fassung(), extra: true },
    null,
  ])
    assert.throws(() => validateMeshRepairFassung(invalid));
  assert.match(meshRepairFassungSummary(fassung()), /Fassung a{12}…/);
  assert.match(meshRepairFassungSummary(fassung()), /Herkunft b{12}… → Ergebnis c{12}…/);
});

test('N03-02 summary shows faces, edges, holes, threshold and both measured directions before takeover', () => {
  const accepted = report();
  accepted.repair_fassung = fassung();
  const text = repairAdmissionSummary(accepted);
  assert.match(text, /Netz 22009→22004 Flächen, 33017→33006 Kanten, 2→0 Löcher/);
  assert.match(text, /Stichprobe 24\.000 Punkte je Richtung/);
  assert.match(text, /Original→Reparatur 0\.012000 mm/);
  assert.match(text, /Reparatur→Original 0\.004000 mm/);
  assert.match(text, /Schwelle 0,15 mm/);
  assert.match(text, /Übernahme freigegeben/);
  assert.match(text, /Außerhalb des Reparaturbereichs 21921 Flächen unverändert/);
  assert.match(text, /Reparaturfassung Fassung a{12}…/);
  assert.match(conversionSummary(accepted), /Stichproben-Abstand maximal 0\.005000 mm/);
  assert.match(conversionSummary(accepted), /Netz 22009→22004 Flächen/);
  const rejected = report({ accepted: false, reason: 'deviation_over_budget', fassung: null });
  assert.match(repairAdmissionSummary(rejected), /Abgelehnt \(deviation_over_budget\)/);
  assert.doesNotMatch(repairAdmissionSummary(rejected), /Reparaturfassung/);
  assert.equal(repairAdmissionSummary({}), '');
});

test('N03-04 an accepted Fassung persists additively in project format 38 and old files stay readable', () => {
  const stored = { ...fassung(), input: 'Haltér.stl', input_sha256: hex('d') };
  const project = createCadProject({ name: 'Reparatur', nodes: [body({ metadata: { meshRepair: stored } })] });
  assert.equal(project.version, 38);
  assert.deepEqual(project.nodes[0].metadata.meshRepair, stored);
  const reopened = parseCadProject(serializeCadProject(project));
  assert.deepEqual(reopened.nodes[0].metadata.meshRepair, stored);
  assert.deepEqual(cadProjectSnapshot(project).nodes[0].metadata.meshRepair, stored);
  const legacy = createCadProject({ name: 'Alt', nodes: [body()] });
  assert.equal(legacy.version, 5);
  assert.doesNotThrow(() => validateCadProject(legacy));
  assert.throws(
    () =>
      validateCadProject({ ...createCadProject({ nodes: [body({ metadata: { meshRepair: stored } })] }), version: 36 }),
    /Projektformat 38/,
  );
  assert.throws(
    () =>
      createCadProject({
        nodes: [
          {
            ...body(),
            kind: 'mesh',
            metadata: { meshRepair: stored },
            mesh: { verts: [0, 0, 0, 1, 0, 0, 0, 1, 0], triangles: [0, 1, 2] },
          },
        ],
      }),
    /CAD-Körper/,
  );
});
