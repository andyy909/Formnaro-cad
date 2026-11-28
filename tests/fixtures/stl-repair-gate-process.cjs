const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const root = process.argv.at(-1),
  request = JSON.parse(fs.readFileSync(path.join(root, 'request.json'), 'utf8')),
  mode = request.options.mode,
  rounds = request.options.rounds,
  fallback = request.options.fallback;
const fassung = (over = {}) => ({
  version: 1,
  accepted: true,
  ...over,
});
const admission = (over = {}) => ({
  version: 1,
  accepted: true,
  kind: 'repaired',
  reasons: [],
  reason: null,
  threshold_mm: request.options.tolerance,
  measurement: {
    unit: 'mm',
    samples_per_direction: 6000,
    max_mm: 0.02,
    directions: {
      original_to_repaired: {
        reference: 'original',
        measured_on: 'reference_surface',
        max_mm: 0.02,
        max_point_mm: [1.5, 2.5, 3.5],
        p95_mm: 0.01,
        mean_mm: 0.005,
        points: 24000,
        unit: 'mm',
      },
      repaired_to_original: {
        reference: 'repaired',
        measured_on: 'repaired_surface',
        max_mm: 0.01,
        max_point_mm: [-1.5, -2.5, -3.5],
        p95_mm: 0.005,
        mean_mm: 0.002,
        points: 24000,
        unit: 'mm',
      },
    },
  },
  topology: {
    before: { faces: 100, edges: 150, openings: 2 },
    after: { faces: 98, edges: 147, openings: 0 },
  },
  openings: { before: 2, after: 0, boundary_edges_before: 8, boundary_edges_after: 0, bridged: false, adds_new_surface: false },
  bounds_change_max_mm: 0.001,
  repair_region: { changed_faces: 2, preserved_faces: 98, outside_faces: 98 },
  outside_repair_region: { faces: 98, changed_faces: 2, preserved: true, method: 'coordinate_triangle_match', max_mm: 0 },
  fassung: fassung({ id: 'a'.repeat(64), origin_sha256: 'b'.repeat(64), result_sha256: 'c'.repeat(64), budget_mm: request.options.tolerance, samples: 6000 }),
  ...over,
});
let repair = admission();
let repaired = false;
if (mode === 'planar') {
  repair = admission({
    measurement: {
      ...repair.measurement,
      max_mm: 0.3,
      directions: {
        ...repair.measurement.directions,
        original_to_repaired: { ...repair.measurement.directions.original_to_repaired, max_mm: 0.3 },
      },
    },
    reasons: ['deviation_over_budget'],
    accepted: true,
  });
} else if (mode === 'smooth') {
  repair = admission({ openings: { before: 2, after: 0, boundary_edges_before: 8, boundary_edges_after: 0, bridged: true, adds_new_surface: true } });
} else if (mode === 'exact') {
  repair = admission({ fassung: null });
} else if (rounds === 'chamfer') {
  repair = admission({ threshold_mm: 0.2 });
} else if (fallback === false) {
  repair = admission({
    measurement: {
      ...repair.measurement,
      directions: { original_to_repaired: repair.measurement.directions.original_to_repaired },
    },
  });
} else {
  repaired = true;
}
const bytes = Buffer.from('ISO-10303-21;\nfixture\nEND-ISO-10303-21;');
fs.writeFileSync(path.join(root, 'result.step'), bytes);
const preview = Buffer.from('preview');
fs.writeFileSync(path.join(root, 'result.vorschau.stl'), preview);
const artifacts = { preview: { file: 'result.vorschau.stl', size: preview.length, sha256: crypto.createHash('sha256').update(preview).digest('hex') } };
if (repaired) {
  const mesh = Buffer.from('repaired');
  fs.writeFileSync(path.join(root, 'result.repariert.stl'), mesh);
  artifacts.repaired_stl = { file: 'result.repariert.stl', size: mesh.length, sha256: crypto.createHash('sha256').update(mesh).digest('hex') };
}
fs.writeFileSync(
  path.join(root, 'response.json'),
  JSON.stringify({
    ok: true,
    version: 2,
    engine: '0.10.0',
    report: {
      version: '0.10.0',
      valid: true,
      solids: 1,
      options: request.options,
      input_triangles: 100,
      output_faces: 12,
      bodies: [{ method: 'Iso', stage: 'exact' }],
      deviation: { sampled_max_mm: 0.02 },
      tessellation_allowance_mm: 0.01,
      repairs: { requested: true, applied: true, deviation: { sampled_max_mm: repair.measurement.max_mm }, admission: repair },
    },
    step_sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    artifacts,
    deviation: { face_indices: [0], distances_mm: [0.01], unit: 'mm' },
  }),
);
