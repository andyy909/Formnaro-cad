const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const root = process.argv.at(-1),
  request = JSON.parse(fs.readFileSync(path.join(root, 'request.json'), 'utf8')),
  mode = {
    500: 'valid',
    501: 'method',
    502: 'neighbourhood',
    503: 'budget',
    504: 'raw',
    505: 'skinover',
    506: 'abort',
  }[request.options.target_faces];
const fassung = (over = {}) => ({
  version: 1,
  accepted: true,
  id: 'a'.repeat(64),
  origin_sha256: 'b'.repeat(64),
  result_sha256: 'c'.repeat(64),
  budget_mm: request.options.tolerance,
  samples: 6000,
  ...over,
});
const direction = (max, point) => ({
  max_mm: max,
  max_point_mm: point,
  p95_mm: max / 2,
  mean_mm: max / 4,
  points: 6000,
  unit: 'mm',
});
const admission = (over = {}) => {
  const raw = {
    unit: 'mm',
    samples_per_direction: 6000,
    max_mm: 3,
    decided_by: 'raw',
    directions: {
      original_to_repaired: direction(3, [-23.88, 61.91, 9.037]),
      repaired_to_original: direction(0.000004, [-33.6, 67.7, 82.6]),
    },
  };
  const outer = {
    method: 'outer-skin-v1',
    budget_mm: request.options.tolerance,
    proven: true,
    decided_by: 'outer-skin',
    excluded_faces: 4,
    excluded_area_mm2: 212.37514340253568,
    excluded_neighbourhood_mm: 0.5,
    excluded_face_ids: [4033, 4034, 4035, 4036],
    min_patch_area_mm2: 20,
    epsilon_mm: 0.02,
    samples_per_direction: 6000,
    raw_max_mm: 3,
    skin_max_mm: 0.000004,
    skin_reference_to_candidate_mm: 0.000004,
    skin_candidate_to_reference_mm: 0.000003,
  };
  return {
    version: 1,
    accepted: true,
    kind: 'repaired',
    reasons: [],
    reason: null,
    threshold_mm: request.options.tolerance,
    measurement: {
      unit: 'mm',
      samples_per_direction: 6000,
      max_mm: 0.000004,
      decided_by: 'outer-skin',
      directions: {
        original_to_repaired: direction(0.000004, [-33.6, 67.7, 82.6]),
        repaired_to_original: direction(0.000003, [-33.7, 67.8, 110.5]),
      },
      raw,
      outer_skin: outer,
      kind: 'outer_skin_v1_decides_raw_comparison_reported',
    },
    topology: {
      before: { faces: 22009, edges: 33017, openings: 0 },
      after: { faces: 22004, edges: 33006, openings: 0 },
    },
    openings: {
      before: 0,
      after: 0,
      boundary_edges_before: 0,
      boundary_edges_after: 0,
      bridged: false,
      adds_new_surface: false,
    },
    bounds_change_max_mm: 0,
    repair_region: { changed_faces: 5, preserved_faces: 22004, outside_faces: 22004 },
    outside_repair_region: {
      faces: 22004,
      changed_faces: 5,
      preserved: true,
      method: 'coordinate_triangle_match',
      max_mm: 0,
    },
    fassung: fassung(),
    ...over,
  };
};
let repair = admission();
if (mode === 'method') repair.measurement.outer_skin.method = 'raw-v0';
if (mode === 'neighbourhood') repair.measurement.outer_skin.excluded_neighbourhood_mm = 0.6;
if (mode === 'budget') repair.measurement.outer_skin.budget_mm = 0.2;
if (mode === 'raw') delete repair.measurement.raw;
if (mode === 'skinover') {
  repair.measurement.directions.original_to_repaired = direction(0.3, [-23.88, 61.91, 9.037]);
  repair.measurement.max_mm = 0.3;
  repair.measurement.outer_skin.skin_max_mm = 0.3;
}
if (mode === 'abort') repair.accepted = false;
const bytes = Buffer.from('ISO-10303-21;\nfixture\nEND-ISO-10303-21;');
fs.writeFileSync(path.join(root, 'result.step'), bytes);
const preview = Buffer.from('preview');
fs.writeFileSync(path.join(root, 'result.vorschau.stl'), preview);
const repairedStl = Buffer.from('repaired-stl');
const repaired3mf = Buffer.from('repaired-3mf-package');
fs.writeFileSync(path.join(root, 'result.repariert.stl'), repairedStl);
fs.writeFileSync(path.join(root, 'result.repariert.3mf'), repaired3mf);
const artifacts = {
  preview: { file: 'result.vorschau.stl', size: preview.length, sha256: crypto.createHash('sha256').update(preview).digest('hex') },
  repaired_stl: { file: 'result.repariert.stl', size: repairedStl.length, sha256: crypto.createHash('sha256').update(repairedStl).digest('hex') },
  repaired_3mf: { file: 'result.repariert.3mf', size: repaired3mf.length, sha256: crypto.createHash('sha256').update(repaired3mf).digest('hex') },
};
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
      input_triangles: 22009,
      output_faces: 1042,
      bodies: [{ method: 'Iso', stage: 'exact' }],
      deviation: { sampled_max_mm: 0.000004 },
      tessellation_allowance_mm: 0.01,
      repairs: {
        requested: true,
        applied: true,
        deviation: { sampled_max_mm: 3 },
        admission: repair,
      },
    },
    step_sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    artifacts,
    deviation: { face_indices: [0], distances_mm: [0.01], unit: 'mm' },
  }),
);
