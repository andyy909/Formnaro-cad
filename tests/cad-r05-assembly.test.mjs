import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { steppedBoreSource } from '../src/mesh-stepped-bores.js';
import {
  ASSEMBLY_LIMITS,
  admitCameraHolderDraft,
  assemblyRegions,
  cameraHolderBodyNode,
  cameraHolderProjectNodes,
  composeCameraHolderAssembly,
  evaluateAssemblyDeviation,
  grooveCutterFromSections,
  groupAssemblyDeviations,
  openCameraHolderAssembly,
  rayMeshDistance,
  rebuildCameraHolderAssembly,
  runFunctionalProbes,
  setAssemblyBoreDiameter,
} from '../src/camera-holder-assembly.js';

// Usage: node --test --test-concurrency=1 tests/cad-r05-assembly.test.mjs
// All geometry is synthetic: no private camera-holder data enters the repository.
// The real holder is measured by work/rueckgabe/probe-r05-real.mjs only.

const kernel = await Module();
kernel.setup();

function shapeMesh(shape) {
  const raw = shape.getMesh(),
    numProp = raw.numProp ?? 3,
    verts = [];
  for (let i = 0; i < raw.vertProperties.length; i += numProp)
    verts.push(raw.vertProperties[i], raw.vertProperties[i + 1], raw.vertProperties[i + 2]);
  return { verts, triangles: Array.from(raw.triVerts) };
}

function boxMesh(size, center) {
  const shape = kernel.Manifold.cube(size, true).translate(center);
  try {
    return { mesh: shapeMesh(shape), volume: shape.volume() };
  } finally {
    shape.delete();
  }
}

const PLANE = { origin: [0, 0, 0], uAxis: [1, 0, 0], vAxis: [0, 1, 0], normal: [0, 0, 1] };
const measuredBody = (kind, name, { mesh, volume }) => ({
  version: 1,
  kind,
  name,
  status: 'complete',
  plane: structuredClone(PLANE),
  sketch: { version: 2, size: [1, 1, 1], elements: [] },
  extrusion: { near: 0, far: 1, thickness: 1, direction: [0, 0, 1] },
  measured: { near: 0, far: 1, thickness: 1, normal: [0, 0, 1], origin: [0, 0, 0] },
  mesh,
  volume,
});

// Synthetic pair: a 10 x 10 x 40 arm standing on a 40 x 40 x 8 plate.
const plate = measuredBody('basePlateBody', 'Grundplatte', boxMesh([40, 40, 8], [0, 0, 4]));
const arm = measuredBody('armHeadBody', 'Armkopf', boxMesh([10, 10, 40], [0, 0, 20]));
const bore = steppedBoreSource(
  {
    axis: [0, 0, 1],
    stages: [{ diameterMM: 4, from: [0, 0, -1], to: [0, 0, 9], depthBetweenPlanesMM: 10 }],
  },
  { id: 'bohrung-test', name: 'Synthetische Durchgangsbohrung' },
);

function assembly(options = {}) {
  return composeCameraHolderAssembly(kernel, { arm, plate, bores: [bore], ...options });
}

test('R05-01: Arm und Grundplatte werden ein geschlossener Körper mit erhaltenen Quellen', () => {
  const built = assembly();
  assert.equal(built.kind, 'cameraHolderAssembly');
  assert.equal(built.solids, 1);
  assert.equal(built.status, 'complete');
  assert.ok(Math.abs(built.volume - (16000 - Math.PI * 4 * 9)) < 1, `Volumen ${built.volume}`);
  assert.equal(built.sources.arm.kind, 'armHeadBody');
  assert.equal(built.sources.plate.kind, 'basePlateBody');
  assert.equal(built.sources.bores[0].id, 'bohrung-test');
  assert.equal(built.cuts.filter((cut) => cut.kind === 'bore').length, 1);
  const node = cameraHolderBodyNode(built);
  assert.equal(node.kind, 'mesh');
  assert.deepEqual(node.mesh.verts.length, built.mesh.verts.length);
  assert.ok(node.metadata.notes.includes('gemessenen Quellen'));
  const nodes = cameraHolderProjectNodes(built);
  assert.equal(nodes.length, built.sources.bores.reduce((sum, source) => sum + source.stages.length, 0) + 3);
  assert.ok(nodes.some((entry) => entry.id === 'r05-quelle-armkopf'));
  assert.ok(nodes.some((entry) => entry.id === 'r05-quelle-grundplatte'));
  assert.ok(nodes.some((entry) => entry.name.includes('Stufe 1')));
});

test('R05-01: gespeicherte Quellen bleiben nach JSON-Rundlauf änderbar, Rebuild wirkt am Körper', () => {
  const built = assembly(),
    saved = JSON.parse(JSON.stringify(built)),
    opened = openCameraHolderAssembly(saved);
  assert.equal(opened.sources.bores[0].id, 'bohrung-test');
  const before = rebuildCameraHolderAssembly(kernel, opened);
  assert.ok(Math.abs(before.volume - built.volume) < 1e-3);
  const edited = setAssemblyBoreDiameter(opened, 'bohrung-test', 1, 8),
    after = rebuildCameraHolderAssembly(kernel, edited);
  const removed = before.volume - after.volume,
    expected = (Math.PI * (64 - 16) / 4) * 9;
  assert.ok(Math.abs(removed - expected) < 1, `entfernt ${removed} statt ${expected}`);
  assert.throws(() => setAssemblyBoreDiameter(opened, 'fehlt', 1, 4), /nicht gefunden/);
});

test('R05-04: gemessene STL-Nut wird eine benannte Schneidquelle und schneidet den Körper', () => {
  const plateSection = {
      frame: { origin: [0, 0, 8], uAxis: [1, 0, 0], vAxis: [0, 1, 0] },
      normal: [0, 0, 1],
      outerProfile: { points2D: [[-20, -20], [20, -20], [20, 20], [-20, 20]] },
    },
    grooveSection = {
      frame: { origin: [0, 0, 0.5], uAxis: [1, 0, 0], vAxis: [0, 1, 0] },
      normal: [0, 0, 1],
      outerProfile: {
        points2D: [[-20, -20], [20, -20], [20, 20], [10, 20], [10, 18], [-10, 18], [-10, 20], [-20, 20]],
      },
    },
    groove = grooveCutterFromSections({ plateSection, grooveSection });
  assert.equal(groove.kind, 'grooveCutter');
  assert.equal(groove.edge, 2);
  assert.ok(Math.abs(groove.mouthLengthMM - 20) <= 0.15, `Mund ${groove.mouthLengthMM}`);
  assert.ok(Math.abs(groove.depthMM - 2) <= 0.01, `Tiefe ${groove.depthMM}`);
  assert.ok(Math.abs(groove.heightMM - 7.5) <= 1e-6);
  assert.ok(Math.abs(groove.areaDifferenceMM2 - 40) < 0.01);
  assert.ok(groove.areaConsistency < 0.02);
  const cut = assembly({ groove }),
    removed = assembly().volume - cut.volume;
  assert.ok(Math.abs(removed - 20 * 2 * 7.5) < 2, `Nut entfernt ${removed}`);
  assert.equal(cut.cuts.find((entry) => entry.kind === 'groove').name, 'STL-Nut');
});

test('R05-03: Außenhaut entscheidet, Roh-Wert bleibt sichtbar, Abweichungen werden nach Bereich gruppiert', () => {
  const reference = boxMesh([40, 40, 8], [0, 0, 4]),
    bump = boxMesh([6, 6, 5], [14, 14, 10.5]);
  const candidateShape = kernel.Manifold.union([
    kernel.Manifold.cube([40, 40, 8], true).translate([0, 0, 4]),
    kernel.Manifold.cube([6, 6, 5], true).translate([14, 14, 10.5]),
  ]);
  const candidate = { mesh: shapeMesh(candidateShape), volume: candidateShape.volume() };
  candidateShape.delete();
  const regions = [{ id: 'grundplatte', label: 'Grundplatte', bounds: { min: [-20, -20, 0], max: [20, 20, 8] } }],
    admission = admitCameraHolderDraft({ original: reference.mesh, candidate: candidate.mesh, regions, samples: [4000, 8000], collectWorst: true });
  assert.equal(admission.admitted, false);
  assert.match(admission.blockedReason, /Budget/);
  assert.ok(admission.evaluation.outerSkinMaximumMM >= 4.5, `max ${admission.evaluation.outerSkinMaximumMM}`);
  assert.ok(admission.evaluation.rawMaximumMM >= admission.evaluation.outerSkinMaximumMM - 1e-9);
  assert.ok(['outer-skin', 'raw'].includes(admission.evaluation.decidedBy));
  assert.equal(admission.evaluation.decidedBy, admission.evaluation.proven ? 'outer-skin' : 'raw');
  assert.ok(admission.largest.amountMM >= 4.5);
  assert.ok(admission.largest.locationMM[0] > 5 && admission.largest.locationMM[1] > 5);
  const groups = groupAssemblyDeviations(admission.evaluation.worstPoints, regions);
  assert.ok(groups.length >= 1);
  assert.ok(groups.some((group) => group.id === 'sonstiges'));
  const clean = admitCameraHolderDraft({ original: reference.mesh, candidate: reference.mesh, regions, samples: [2000, 4000] });
  assert.equal(clean.admitted, true);
  assert.ok(clean.evaluation.outerSkinMaximumMM <= ASSEMBLY_LIMITS.budgetMM);
});

test('R05-02: Funktionsproben liefern je einen tatsächlichen Befund', () => {
  const sideBore = steppedBoreSource(
      { axis: [0, 0, 1], stages: [{ diameterMM: 4, from: [12, 12, -1], to: [12, 12, 9], depthBetweenPlanesMM: 10 }] },
      { id: 'bohrung-seite', name: 'Synthetische Seitenbohrung' },
    ),
    built = assembly({ bores: [bore, sideBore] }),
    probes = [
      { label: 'Außenmaß', kind: 'bounds', expected: { min: [-20, -20, 0], max: [20, 20, 40] } },
      { label: 'Durchgangsbohrung', kind: 'clear', origin: [12, 12, -5], direction: [0, 0, 1], distanceMM: 50 },
      { label: 'Grundplatte unten/oben', kind: 'thickness', origin: [16, 16, 4], direction: [0, 0, 1], thicknessMM: 8 },
      { label: 'Armwand', kind: 'thickness', origin: [0, 0, 30], direction: [1, 0, 0], thicknessMM: 10 },
    ],
    findings = runFunctionalProbes(built, probes);
  assert.equal(findings.length, 4);
  for (const finding of findings) {
    assert.ok(finding.actual !== null, finding.label);
    assert.equal(finding.passed, true, `${finding.label}: ${JSON.stringify(finding.actual)}`);
  }
  assert.equal(findings[1].actual.hitMM, null);
  assert.ok(Math.abs(findings[2].actual.thicknessMM - 8) < 1e-6);
  assert.equal(rayMeshDistance(built.mesh, [12, 12, -5], [0, 0, 1], 50), null);
  assert.ok(Math.abs(rayMeshDistance(built.mesh, [16, 16, 10], [0, 0, -1]) - 2) < 1e-6);
  assert.equal(assemblyRegions(built).find((region) => region.id === 'armkopf').label, 'Armkopf');
});
