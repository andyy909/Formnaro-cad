import test from 'node:test';
import assert from 'node:assert/strict';
import { repairAdmissionSummary } from '../src/cad-stl-converter.js';

const direction = (max, point) => ({
  max_mm: max,
  max_point_mm: point,
  p95_mm: max / 2,
  mean_mm: max / 4,
  points: 6000,
  unit: 'mm',
});
const measurement = {
  unit: 'mm',
  samples_per_direction: 6000,
  max_mm: 0.000004,
  decided_by: 'outer-skin',
  directions: {
    original_to_repaired: direction(0.000004, [-33.6, 67.7, 82.6]),
    repaired_to_original: direction(0.000003, [-33.7, 67.8, 110.5]),
  },
  raw: {
    unit: 'mm',
    samples_per_direction: 6000,
    max_mm: 3,
    directions: {
      original_to_repaired: direction(3, [-23.88, 61.91, 9.037]),
      repaired_to_original: direction(0.000004, [-33.6, 67.7, 82.6]),
    },
  },
  outer_skin: {
    method: 'outer-skin-v1',
    proven: true,
    excluded_faces: 4,
    excluded_area_mm2: 212.37514340253568,
    excluded_neighbourhood_mm: 0.5,
  },
};
const report = {
  repairs: {
    admission: {
      accepted: true,
      kind: 'repaired',
      threshold_mm: 0.15,
      measurement,
      topology: {
        before: { faces: 22009, edges: 33017, openings: 0 },
        after: { faces: 22004, edges: 33006, openings: 0 },
      },
      outside_repair_region: { preserved: true, faces: 22004 },
    },
  },
};

test('N03-B summary names the outer-skin method, excluded zone and the raw comparison', () => {
  const summary = repairAdmissionSummary(report);
  assert.match(summary, /Außenhaut outer-skin-v1: 4 Dreiecke \/ 212\.375 mm² ausgeschlossen/);
  assert.match(summary, /Nachbarschaft 0,5 mm/);
  assert.match(summary, /Original→Reparatur 0\.000004 mm/);
  assert.match(summary, /Rohwert Original→Reparatur 3\.000000 mm, Reparatur→Original 0\.000004 mm/);
  assert.match(summary, /Schwelle 0,15 mm/);
  assert.match(summary, /Übernahme freigegeben/);
});

test('N03-B a raw decision keeps the previous summary without outer-skin text', () => {
  const rawReport = structuredClone(report);
  rawReport.repairs.admission.measurement = {
    ...measurement,
    decided_by: 'raw',
    max_mm: 0.012,
    directions: {
      original_to_repaired: direction(0.012, [1, 2, 3]),
      repaired_to_original: direction(0.004, [-1, -2, -3]),
    },
  };
  const summary = repairAdmissionSummary(rawReport);
  assert.doesNotMatch(summary, /Außenhaut/);
  assert.match(summary, /Original→Reparatur 0\.012000 mm/);
});
