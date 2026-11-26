const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
// Fixture for N04-B: the repair is confirmed, the STEP step failed.
// Selected through options.target_faces, like the other converter fixtures.
const root = process.argv.at(-1),
  request = JSON.parse(fs.readFileSync(path.join(root, 'request.json'), 'utf8')),
  mode = {
    500: 'partial',
    506: 'unaccepted',
    507: 'tampered',
    508: 'missing',
    509: 'threshold',
  }[request.options.target_faces];
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const direction = (max, point) => ({
  max_mm: max,
  max_point_mm: point,
  p95_mm: max / 2,
  mean_mm: max / 4,
  points: 6000,
  unit: 'mm',
});
const admission = () => ({
  version: 1,
  accepted: true,
  kind: 'repaired',
  reasons: [],
  reason: null,
  threshold_mm: mode === 'threshold' ? 0.2 : request.options.tolerance,
  measurement: {
    unit: 'mm',
    samples_per_direction: 6000,
    max_mm: 0.000004,
    decided_by: 'raw',
    directions: {
      original_to_repaired: direction(0.000004, [-33.6, 67.7, 82.6]),
      repaired_to_original: direction(0.000003, [-33.7, 67.8, 110.5]),
    },
  },
  topology: {
    before: { faces: 13, edges: 21, openings: 1 },
    after: { faces: 14, edges: 21, openings: 0 },
  },
  openings: {
    before: 1,
    after: 0,
    boundary_edges_before: 3,
    boundary_edges_after: 0,
    bridged: false,
    adds_new_surface: false,
  },
  bounds_change_max_mm: 0,
  outside_repair_region: { faces: 12, changed_faces: 1, preserved: true, method: 'coordinate_triangle_match', max_mm: 0 },
  fassung: {
    version: 1,
    accepted: true,
    id: 'a'.repeat(64),
    origin_sha256: 'b'.repeat(64),
    result_sha256: 'c'.repeat(64),
    budget_mm: request.options.tolerance,
    samples: 6000,
  },
});
const repairedStl = Buffer.from('repaired-stl-after-step-failure');
const repaired3mf = Buffer.from('repaired-3mf-after-step-failure');
fs.writeFileSync(path.join(root, 'result.repariert.stl'), repairedStl);
fs.writeFileSync(path.join(root, 'result.repariert.3mf'), repaired3mf);
const artifacts = {
  repaired_stl: { file: 'result.repariert.stl', size: repairedStl.length, sha256: hash(repairedStl) },
  repaired_3mf: { file: 'result.repariert.3mf', size: repaired3mf.length, sha256: hash(repaired3mf) },
};
if (mode === 'tampered') artifacts.repaired_3mf.sha256 = 'd'.repeat(64);
if (mode === 'missing') delete artifacts.repaired_3mf;
const report = {
  version: '0.10.0',
  valid: false,
  repair_valid: true,
  status: 'repair_only',
  input: 'input.stl',
  output: null,
  options: request.options,
  input_triangles: 13,
  input_bounds_mm: [[-3.5, -12.5, -11.5], [6.5, 7.5, 18.5]],
  original: { triangles: 13, bounds_mm: [[-3.5, -12.5, -11.5], [6.5, 7.5, 18.5]], volume_mm3: 6000, unit: 'mm' },
  repair: {
    accepted: mode !== 'unaccepted',
    changed: true,
    backend: 'local.split_collinear_seams',
    triangles: 14,
    bounds_mm: [[-3.5, -12.5, -11.5], [6.5, 7.5, 18.5]],
    volume_mm3: 6000,
    unit: 'mm',
    repaired_mesh: 'result.repariert.stl',
    repaired_3mf: 'result.repariert.3mf',
  },
  step: { status: 'failed', message: 'STEP-Aufbau im Test fehlgeschlagen.' },
  repairs: {
    requested: true,
    applied: true,
    deviation: { sampled_max_mm: 0.000004 },
    admission: admission(),
  },
  repaired_mesh: 'result.repariert.stl',
  repaired_3mf: 'result.repariert.3mf',
  report: 'result.bericht.json',
  preview: null,
};
fs.writeFileSync(
  path.join(root, 'response.json'),
  JSON.stringify({
    ok: false,
    version: 2,
    engine: '0.10.0',
    error: 'STEP-Aufbau im Test fehlgeschlagen.',
    report,
    artifacts,
  }),
);
// A failed STEP keeps the process exit code non-zero, like bridge.py does.
process.exit(2);
