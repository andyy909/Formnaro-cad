import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import Module from 'manifold-3d';
import { Matrix4, Euler, Vector3 } from 'three';
import {
  classifyRadiusProfile,
  measureOpenings,
  candidateAxes,
  directedCountersinks,
} from '../src/cad-lab-opening-profile.js';

const kernel = await Module();
kernel.setup();
const M = kernel.Manifold;

// Reference geometry lives only in this file. The module under test gets the mesh node.
function plate({ cuts, flip = false }) {
  const owned = [],
    own = (x) => (owned.push(x), x);
  try {
    let body = own(M.cube([60, 40, 8]));
    // plate occupies z 0..8, hole axis at (4,11,*)
    const tools = cuts.map((c) => own(c(own)));
    body = own(M.difference([body, ...tools]));
    if (flip) body = own(body.rotate([180, 0, 0]).translate([0, 40, 8]));
    const data = body.getMesh(),
      verts = [];
    for (let i = 0; i < data.vertProperties.length; i += data.numProp) verts.push(...data.vertProperties.slice(i, i + 3));
    return { verts, triangles: Array.from(data.triVerts) };
  } finally {
    for (const x of owned.reverse()) x.delete();
  }
}
const bore = (r) => (own) => own(M.cylinder(12, r, r, 128)).translate([30, 20,-2]);
// cone: radius r0 at height z0 widening with half-angle (deg) towards +z, reaching beyond the top
const cone = (r0, z0, angle) => (own) => {
  const h = 9 - z0, r1 = r0 + Math.tan((angle * Math.PI) / 180) * h;
  return own(M.cylinder(h, r0, r1, 128)).translate([30, 20,z0]);
};
const counterbore = (r, z0) => (own) => own(M.cylinder(9 - z0, r, r, 128)).translate([30, 20,z0]);

function node(mesh, matrix = new Matrix4()) {
  return { id: 'm', kind: 'mesh', transform: matrix.toArray(), mesh, meshRole: 'solid', metadata: {} };
}
function bake(mesh, matrix) {
  const verts = [];
  for (let i = 0; i < mesh.verts.length; i += 3) verts.push(...new Vector3(...mesh.verts.slice(i, i + 3)).applyMatrix4(matrix).toArray());
  return { verts, triangles: mesh.triangles };
}
const rot = new Matrix4().makeRotationFromEuler(new Euler(0.71, -0.43, 1.12)).setPosition(13, -7, 5);
const identity = new Matrix4();
const holeAxisWorld = (matrix, flip) => {
  const o = new Vector3(0, 0, flip ? -1 : 1).transformDirection(matrix);
  return o.toArray();
};
const angleBetween = (a, b) => (Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180) / Math.PI;

const variants = [
  ['identity', identity, false],
  ['node-transform', rot, false],
  ['baked rotation', rot, true],
];
function build(mesh, [name, matrix, baked]) {
  return baked ? node(bake(mesh, matrix), identity) : node(mesh, matrix);
}

for (const angle of [30, 45, 60]) {
  for (const flip of [false, true]) {
    for (const variant of variants) {
      test(`countersink ${angle}° flip=${flip} ${variant[0]} is positive with correct opening direction`, () => {
        const mesh = plate({ cuts: [bore(2), cone(2, 3.2, angle)], flip });
        const result = measureOpenings(build(mesh, variant));
        assert.equal(result.positives.length, 1, JSON.stringify(result.tracks.map((t) => [t.status, t.reason])));
        const p = result.positives[0];
        assert.ok(angleBetween(p.openingDirection, holeAxisWorld(variant[1], flip)) < 0.5);
        assert.ok(Math.abs(p.boreRadius - 2) < 0.01);
        assert.ok(Math.abs(p.halfAngleDegrees - angle) < 1.5, `${p.halfAngleDegrees}`);
        assert.ok(p.halfAngleRangeDegrees[0] <= angle + 0.2 && p.halfAngleRangeDegrees[1] >= angle - 0.2);
        // axis passes the world position of the hole centre
        const centre = new Vector3(30, 20, 4).applyMatrix4(variant[2] ? identity : variant[1]);
        const c = variant[2] ? new Vector3(30, 20, 4).applyMatrix4(variant[1]) : centre;
        const d = new Vector3(...p.axis.point).sub(flip ? new Vector3(30, 20, 4).applyMatrix4(new Matrix4().makeRotationX(Math.PI).setPosition(0, 40, 8)).applyMatrix4(variant[1]) : c);
        const along = new Vector3(...p.axis.direction);
        assert.ok(d.sub(along.clone().multiplyScalar(d.dot(along))).length() < 0.02);
      });
    }
  }
}

test('cylinder bore gives no countersink', () => {
  for (const variant of variants) {
    const result = measureOpenings(build(plate({ cuts: [bore(2)] }), variant));
    assert.equal(result.positives.length, 0);
    assert.equal(result.tracks.filter((t) => t.status === 'cylinder').length, 1);
  }
});

test('two-radius step (counterbore) is not a countersink', () => {
  for (const variant of variants) {
    for (const flip of [false, true]) {
      const result = measureOpenings(build(plate({ cuts: [bore(2), counterbore(5, 5.1)], flip }), variant));
      assert.equal(result.positives.length, 0);
      assert.equal(result.tracks.filter((t) => t.status === 'step').length, 1, JSON.stringify(result.tracks.map((t) => t.reason)));
    }
  }
});

test('too short ramp, double-sided countersink and ramp then wide counterbore stay unproven', () => {
  // ramp spans less than the sampling can resolve
  let r = measureOpenings(node(plate({ cuts: [bore(2), cone(2, 7.4, 45)] })));
  assert.equal(r.positives.length, 0, JSON.stringify(r.tracks));
  // opposing countersinks
  const mirrored = (own) => {
    const c = own(M.cylinder(5, 7, 2, 128));
    return c.translate([30, 20,-1]);
  };
  r = measureOpenings(node(plate({ cuts: [bore(2), cone(2, 5, 45), mirrored] })));
  assert.equal(r.positives.length, 0, JSON.stringify(r.tracks.map((t) => t.reason)));
  assert.ok(r.tracks.every((t) => t.status === 'ambiguous'));
});

test('a damaged section (open contour) leaves the track unproven', () => {
  const mesh = plate({ cuts: [bore(2), cone(2, 3.2, 45)] });
  const n = node(mesh);
  const z = 5;
  const tris = mesh.triangles;
  let cut = -1;
  for (let i = 0; i < tris.length; i += 3) {
    const zs = [0, 1, 2].map((k) => mesh.verts[tris[i + k] * 3 + 2]);
    const xs = [0, 1, 2].map((k) => mesh.verts[tris[i + k] * 3]);
    if (Math.min(...zs) < z && Math.max(...zs) > z && Math.max(...xs) < 35 && Math.min(...xs) > 25) { cut = i; break; }
  }
  assert.ok(cut >= 0);
  n.mesh = { verts: mesh.verts, triangles: [...tris.slice(0, cut), ...tris.slice(cut + 3)] };
  assert.equal(measureOpenings(n).positives.length, 0);
});

test('classifier: sparse, noisy or non-monotone radii never give a positive', () => {
  const mk = (rs, b = 0.001) => rs.map((radius, i) => ({ t: i * 0.5, radius, bound: b }));
  const cs = classifyRadiusProfile(mk([2, 2, 2, 2, 2.5, 3, 3.5, 4, 4.5]));
  assert.equal(cs.status, 'countersink');
  assert.equal(cs.openingSign, 1);
  assert.equal(classifyRadiusProfile(mk([4.5, 4, 3.5, 3, 2.5, 2, 2, 2, 2])).openingSign, -1);
  for (const rs of [
    [2, 2, 2, 2, 5, 5, 5, 5, 5], // step
    [2, 2, 2, 2, 2.5, 3, 3.5, 3.5, 3.5], // ramp followed by a cylindrical mouth
    [2, 2, 2, 2, 3.5, 5, 5, 5, 5], // one intermediate sample only
    [2, 2, 2, 3, 2, 3, 2, 3, 2], // non-monotone
    [4, 3, 2, 2, 2, 3, 4, 4.5, 5], // both ends open
    [2, 2.1, 2.3, 2.1, 2.0, 2.2, 2.4, 2.1, 2.0], // noise
  ]) assert.notEqual(classifyRadiusProfile(mk(rs)).status, 'countersink', rs.join());
  assert.equal(classifyRadiusProfile(mk([2, 2, 2, 3, 4])).status, 'ambiguous'); // too few sections
  // plausible ramp slope but with measurement bound as large as the rise
  assert.notEqual(classifyRadiusProfile(mk([2, 2, 2, 2, 2.1, 2.2, 2.3, 2.4, 2.5], 0.05)).status, 'countersink');
});

const archive = new URL('../work/Gegenpruefung-07a.json', import.meta.url);
test('accepted 07a native measurements: countersink positive, cylinder and step not', { skip: !existsSync(archive) }, () => {
  const expectedStatus = { countersink: 'countersink', cylinder: 'cylinder', step: 'step' };
  for (const c of JSON.parse(readFileSync(archive, 'utf8'))) {
    const r = classifyRadiusProfile(c.profiles.map((p) => ({ t: p.z, radius: p.radius, bound: p.fitErrorBound })));
    assert.equal(r.status, expectedStatus[c.id], c.id + ': ' + r.reason);
    if (c.id === 'countersink') {
      assert.equal(r.openingSign, 1);
      assert.ok(Math.abs(r.halfAngleDegrees - 45) < 1);
      assert.ok(Math.abs(r.boreRadius - 2) < 0.01);
    }
  }
});

test('candidate axes come from the measured feature catalog of rotated meshes', () => {
  const n = build(plate({ cuts: [bore(2), cone(2, 3.2, 45)] }), variants[1]);
  const axes = candidateAxes(n);
  const expected = holeAxisWorld(rot, false);
  assert.ok(axes.some((a) => Math.abs(a[0] * expected[0] + a[1] * expected[1] + a[2] * expected[2]) > 1 - 1e-6));
});

test('A ramp on a blind bore cannot establish a through countersink', () => {
  const blindBore = (own) => own(M.cylinder(7, 2, 2, 128)).translate([30, 20, 2]);
  const reference = plate({ cuts: [blindBore, cone(2, 5, 45)] });
  const result = measureOpenings(node(reference));
  assert.equal(result.positives.length, 0);
  assert.ok(result.tracks.some((track) => track.status === 'ambiguous' && track.reason.includes('Außenflächen')));
});

test('directed hints require an angle that the native countersink cutter can use', () => {
  for (const halfAngle of [12, 43.75, 77]) {
    const mesh = node(plate({ cuts: [bore(2), cone(2, halfAngle === 77 ? 5.2 : 3.2, halfAngle)] }));
    assert.equal(measureOpenings(mesh).positives.length, 1, String(halfAngle));
    assert.deepEqual(directedCountersinks(mesh), [], String(halfAngle));
  }
  const supported = node(plate({ cuts: [bore(2), cone(2, 3.2, 45)] }));
  assert.equal(directedCountersinks(supported)[0].includedAngleDegrees, 90);
});
