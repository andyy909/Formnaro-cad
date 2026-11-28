import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { meshSectionContours } from '../src/mesh-section-contours.js';
import { resolveCadSketch } from '../src/cad-sketch.js';
import {
  ARM_HEAD_LIMITS,
  armHeadBodyNode,
  armHeadSketch,
  buildArmHeadBody,
  checkArmHeadBody,
  compareArmHeadBody,
  measureArmThickness,
  openArmHeadBody,
  rebuildArmHeadBody,
  setArmHeadDimension,
} from '../src/arm-head-rebuild.js';

const kernel = await Module();
kernel.setup();

// Small synthetic camera-holder arm: a 30 x 20 mm front arm from y = 10.729 to
// 16.8 with a 0.01 mm step on the back and a second (rear) arm 20..26. The
// measured section at y = 14.37 sees only the plain front arm; the retained
// z = 6 section is withheld from construction and used for R02-03.
function armFixture(kernel) {
  const owned = [];
  const own = (shape) => (owned.push(shape), shape);
  const M = kernel.Manifold;
  try {
    const front = own(M.cube([30, 4.771, 20]).translate([-40, 10.729, -10]));
    const step = own(M.cube([30.01, 1.3, 20]).translate([-40.01, 15.5, -10]));
    const rear = own(M.cube([30, 6, 20]).translate([-40, 20, -10]));
    const bore = own(M.cylinder(9, 4, 4, 64).rotate([90, 0, 0]).translate([-25, 18, 0]));
    let solid = own(M.union([front, step, rear]));
    solid = own(solid.subtract(bore));
    const raw = solid.getMesh(),
      verts = [];
    for (let i = 0; i < raw.vertProperties.length; i += raw.numProp) verts.push(...raw.vertProperties.slice(i, i + 3));
    return {
      id: 'synthetic-arm',
      kind: 'mesh',
      name: 'Synthetischer Arm',
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      meshRole: 'solid',
      color: '#7ba8bf',
      opacity: 1,
      hidden: false,
      locked: false,
      metadata: { notes: 'synthetic R02 fixture' },
      mesh: { verts, triangles: Array.from(raw.triVerts) },
    };
  } finally {
    for (const shape of owned.reverse()) shape.delete();
  }
}

const node = armFixture(kernel);
const measuredSection = () =>
  meshSectionContours(node, { normal: [0, 1, 0], planePoint: [0, 14.37, 0], includePoints: true });

test('R02-01: das geschlossene R01-Profil wird eine einzige native Skizze mit geprüften Stützpunkten', () => {
  const section = measuredSection();
  assert.equal(section.complete, true);
  assert.equal(section.totalLoops, 2);
  const prepared = armHeadSketch(section);
  assert.equal(prepared.kind, 'armHeadSketch');
  assert.equal(prepared.status, 'complete');
  assert.equal(prepared.sketch.version, 2);
  assert.equal(prepared.sketch.loops.length, 2);
  assert.deepEqual(
    prepared.sketch.loops.map((loop) => loop.role),
    ['outer', 'hole'],
  );
  assert.equal(prepared.sketch.elements.length, 5);
  assert.deepEqual(
    prepared.sketch.elements.map((element) => element.type),
    ['line', 'line', 'line', 'line', 'circle'],
  );
  // Exactly one named profile dimension drives the measured bore.
  assert.deepEqual(
    prepared.sketch.variables.map((variable) => variable.name),
    ['armkopf_bohrung'],
  );
  const bore = prepared.sketch.elements.find((element) => element.type === 'circle');
  assert.equal(bore.diameter, 'armkopf_bohrung');
  assert.ok(Number(prepared.sketch.variables[0].value) > 7.9 && Number(prepared.sketch.variables[0].value) < 8.1);
  const resolved = resolveCadSketch(prepared.sketch);
  assert.ok(Math.abs(resolved.area - (600 - Math.PI * 16)) < 0.1);
  assert.equal(resolved.height, 1, 'R02-01 keeps the disclosed 1 mm placeholder until R02-02');
  // Every support point lies back-calculated in the measured plane.
  assert.equal(prepared.supportPoints.count, 5);
  assert.equal(prepared.supportPoints.maxPlaneDistance, 0);
  assert.equal(prepared.supportPoints.maxSourceDistance, null);
  // Approximated measured sections are marked instead of silently trusted.
  assert.equal(prepared.uncertainSegments.length, 1);
  const uncertain = prepared.uncertainSegments[0];
  assert.equal(uncertain.role, 'hole');
  assert.deepEqual(uncertain.elements, ['s1e0']);
  assert.ok(uncertain.fitErrorBound > 0 && uncertain.fitErrorBound <= 0.02);
  assert.match(uncertain.reason, /angenähert/);
});

test('R02-01: R01-Belegformat (benannte Achsen, pointsWorld) wird rückgerechnet und offene Schnitte bleiben gekennzeichnet', () => {
  const section = measuredSection();
  const frame = {
    origin: section.origin,
    uAxis: section.uAxis,
    vAxis: section.vAxis,
    normal: section.normal,
    matrix: section.frame,
  };
  const points2D = section.outerProfile.points;
  // Simulate the stored R01 evidence: world points rounded to 1e-3 mm.
  const pointsWorld = points2D.map((point) => {
    const world = section.frame;
    return [
      world[12] + point[0] * world[0] + point[1] * world[4],
      world[13] + point[0] * world[1] + point[1] * world[5],
      world[14] + point[0] * world[2] + point[1] * world[6],
    ].map((value) => Number(value.toFixed(3)));
  });
  const evidence = {
    frame,
    status: 'complete',
    closed: true,
    measurementPlanePoint: section.origin,
    outerProfile: { ...section.outerProfile, points2D, pointsWorld },
    innerCircles: section.innerCircles,
  };
  const prepared = armHeadSketch(evidence);
  assert.equal(prepared.status, 'complete');
  assert.equal(prepared.supportPoints.sourcePointCount, points2D.length);
  assert.ok(prepared.supportPoints.maxPlaneDistance <= ARM_HEAD_LIMITS.planeTolerance);
  assert.ok(prepared.supportPoints.maxSourceDistance <= ARM_HEAD_LIMITS.sourceTolerance);

  // Open the outer border at the measured plane; the result must not invent a sketch.
  const broken = armFixture(kernel);
  const { verts, triangles } = broken.mesh;
  let removed = -1;
  for (let i = 0; i < triangles.length; i += 3) {
    const y = triangles.slice(i, i + 3).map((index) => verts[index * 3 + 1]),
      x = triangles.slice(i, i + 3).map((index) => verts[index * 3]);
    if (Math.min(...y) < 14.37 && Math.max(...y) > 14.37 && Math.max(...x) < -39) removed = i;
  }
  assert.ok(removed >= 0, 'Fixture besitzt ein Seitendreieck an der Messebene');
  triangles.splice(removed, 3);
  const incomplete = meshSectionContours(broken, { normal: [0, 1, 0], planePoint: [0, 14.37, 0], allowIncomplete: true });
  assert.equal(incomplete.status, 'incomplete');
  assert.equal(incomplete.outerProfile, null);
  const marked = armHeadSketch(incomplete);
  assert.equal(marked.status, 'incomplete');
  assert.equal(marked.complete, false);
  assert.equal(marked.sketch, null);
  assert.equal(marked.uncertainSegments.length, 1);
  assert.match(marked.uncertainSegments[0].reason, /Unterbrochen|offen/);
});

test('R02-02: die unabhängige Strahlmessung bestätigt die Armdicke, der Körper liegt am gewählten Arm', () => {
  const prepared = armHeadSketch(measuredSection());
  const measured = measureArmThickness(node, prepared);
  assert.equal(measured.kind, 'armHeadThickness');
  assert.equal(measured.normal.length, 3);
  assert.ok(Math.abs(measured.thickness - 6.071) < 1e-6, `Dicke ${measured.thickness}`);
  assert.ok(Math.abs(measured.near + 3.641) < 1e-3, `near ${measured.near}`);
  assert.ok(Math.abs(measured.far - 2.43) < 1e-3, `far ${measured.far}`);
  assert.ok(measured.probes.measured >= 100);
  assert.ok(measured.probes.share > 0.9, 'Die dominante Wanddicke ist eindeutig');
  assert.equal(measured.distribution[0].thickness, measured.thickness);
  // A caller-provided material point measures the same wall directly.
  const single = measureArmThickness(node, prepared, { probe: [5, 5] });
  assert.equal(single.probes.measured, 1);
  assert.ok(Math.abs(single.thickness - measured.thickness) < 1e-6);
  assert.ok(Math.abs(single.near - measured.near) < 1e-6 && Math.abs(single.far - measured.far) < 1e-6);

  const body = buildArmHeadBody(kernel, prepared, { measured, source: node });
  assert.equal(body.kind, 'armHeadBody');
  assert.equal(body.status, 'complete');
  assert.ok(body.volume > 0);
  assert.ok(body.mesh.triangles.length > 0);
  assert.ok(Math.abs(body.report.bodyThickness - 6.071) < 1e-6);
  assert.ok(body.report.spanDeviation <= ARM_HEAD_LIMITS.thicknessTolerance);
  assert.equal(body.extrusion.thickness, measured.thickness);
  assert.equal(body.sketch.dimensions.height, String(measured.thickness));

  const check = checkArmHeadBody(body, { measured, source: node });
  assert.equal(check.ok, true, JSON.stringify(check.problems));
  assert.ok(check.checks.every((item) => item.ok));
  assert.ok(check.checks.find((item) => item.id === 'ebene-im-arm').actual === true);
  assert.ok(check.checks.find((item) => item.id === 'normale').actual > 1 - 1e-9);

  // The saved body cuts the measured plane exactly like the measured section.
  const bodySection = meshSectionContours(armHeadBodyNode(body), { normal: [0, 1, 0], planePoint: [0, 14.37, 0], includePoints: true });
  assert.equal(bodySection.complete, true);
  assert.equal(bodySection.totalLoops, 2);
  const section = measuredSection();
  assert.ok(Math.abs(bodySection.outerProfile.area - section.outerProfile.area) < 1e-6);
  assert.ok(Math.abs(bodySection.innerCircles[0].diameter - section.innerCircles[0].diameter) < 1e-6);
  assert.ok(Math.abs(body.extrusion.near + 3.641) < 1e-3 && Math.abs(body.extrusion.far - 2.43) < 1e-3);
});

test('R02-03: der zurückgehaltene Schnitt nennt die größte Abweichung; umgekehrte Normale und falscher Arm fallen auf', () => {
  const prepared = armHeadSketch(measuredSection());
  const measured = measureArmThickness(node, prepared);
  const body = buildArmHeadBody(kernel, prepared, { measured, source: node });

  // Retained cut: withheld from construction, only used for the comparison.
  const retained = meshSectionContours(node, { normal: [0, 0, 1], planePoint: [0, 0, 6], includePoints: true });
  assert.equal(retained.complete, true);
  assert.equal(retained.outerProfile.area > 180, true, 'Der vordere Arm ist die größere Außenkontur');
  assert.notEqual(retained.outerProfile, null);
  const comparison = compareArmHeadBody(body, retained);
  assert.equal(comparison.mode, 'contour');
  assert.ok(comparison.maxDeviation > 0.0099 && comparison.maxDeviation < 0.0101, `Abweichung ${comparison.maxDeviation}`);
  assert.equal(comparison.bodyToRetained, 0);
  assert.ok(comparison.retainedToBody > 0.0099 && comparison.retainedToBody < 0.0101);
  assert.equal(comparison.ok, true);
  assert.equal(comparison.budget, ARM_HEAD_LIMITS.contourBudget);

  // Bounds-only evidence (R01 private retained cut) compares the section extents.
  const boundsOnly = {
    normal: retained.normal,
    frame: retained.frame,
    measurementPlanePoint: retained.measurementPlanePoint,
    outerBounds2D: retained.outerProfile.bounds,
  };
  const extent = compareArmHeadBody(body, boundsOnly);
  assert.equal(extent.mode, 'bounds');
  assert.ok(extent.maxDeviation < 0.0101);

  // Reversed normal is caught by the location proof, not hidden by the sketch.
  const invertedPlane = { ...prepared.plane, normal: prepared.plane.normal.map((value) => -value) };
  const inverted = buildArmHeadBody(kernel, { ...prepared, plane: invertedPlane }, { measured, source: node });
  const invertedCheck = checkArmHeadBody(inverted, { measured, source: node });
  assert.equal(invertedCheck.ok, false);
  assert.ok(invertedCheck.problems.some((problem) => problem.id === 'normale'));

  // Wrong arm: the independently measured span of the rear arm does not fit the front profile.
  const rearMeasured = {
    near: 20 - measured.origin[1],
    far: 26 - measured.origin[1],
    thickness: 6,
    normal: prepared.plane.normal,
    origin: prepared.plane.origin,
  };
  const wrong = buildArmHeadBody(kernel, prepared, { measured: rearMeasured, source: node });
  const wrongCheck = checkArmHeadBody(wrong, { measured, source: node });
  assert.equal(wrongCheck.ok, false);
  const ids = wrongCheck.problems.map((problem) => problem.id);
  assert.ok(ids.includes('lage-vorne') && ids.includes('lage-hinten'));
  assert.ok(ids.includes('dicke'));
  assert.ok(Math.abs(wrong.extrusion.near - (20 - measured.origin[1])) < 1e-6);
});

test('R02-04: gespeicherter Armkörper wird wieder geöffnet, ein Skizzenmaß ändert den neu gerechneten Körper', () => {
  const prepared = armHeadSketch(measuredSection());
  const measured = measureArmThickness(node, prepared);
  const body = buildArmHeadBody(kernel, prepared, { measured, source: node });

  // Persist as JSON, reopen and keep the native sketch as editable source.
  const saved = JSON.parse(JSON.stringify(body));
  const opened = openArmHeadBody(saved);
  assert.equal(opened.kind, 'armHeadBodySource');
  assert.equal(opened.status, 'editable');
  assert.deepEqual(
    opened.sketch.variables.map((variable) => variable.name),
    ['armkopf_bohrung'],
  );
  assert.equal(opened.sketch.dimensions.height, String(measured.thickness));
  assert.equal(opened.sketch.elements.find((element) => element.type === 'circle').diameter, 'armkopf_bohrung');
  const previousBore = Number(opened.sketch.variables[0].value);

  const edited = setArmHeadDimension(opened, 'armkopf_bohrung', '10');
  assert.equal(edited.sketch.variables[0].value, '10');
  assert.ok(edited.area < opened.area);
  assert.deepEqual(edited.edited, { name: 'armkopf_bohrung', from: opened.sketch.variables[0].value, to: '10' });
  // The source stays a formula, not a baked coordinate.
  assert.equal(edited.sketch.elements.find((element) => element.type === 'circle').diameter, 'armkopf_bohrung');

  const rebuilt = rebuildArmHeadBody(kernel, edited);
  assert.ok(rebuilt.volume < body.volume);
  assert.ok(rebuilt.volumeDelta < 0);
  const tessellatedDelta = ((Math.PI / 4) * (100 - previousBore ** 2)) * measured.thickness;
  assert.ok(Math.abs(rebuilt.volumeDelta + tessellatedDelta) < 0.5, `${rebuilt.volumeDelta} vs ${-tessellatedDelta}`);
  assert.ok(Math.abs(rebuilt.report.bodyThickness - measured.thickness) < 1e-6);
  assert.equal(rebuilt.sketch.variables[0].value, '10');
  assert.equal(checkArmHeadBody(rebuilt, { measured, source: node }).ok, true);

  // The rebuilt body is persistable again.
  const reopened = openArmHeadBody(JSON.parse(JSON.stringify(rebuilt)));
  assert.equal(reopened.sketch.variables[0].value, '10');
  assert.ok(Math.abs(reopened.volume - rebuilt.volume) < 1e-9);

  // An oversized bore is rejected before any body is rebuilt and leaves the source untouched.
  assert.throws(() => setArmHeadDimension(opened, 'armkopf_bohrung', '40'), { code: 'ARM_HEAD_DIMENSION' });
  assert.equal(opened.sketch.variables[0].value, String(previousBore));
});

test('Measured chamfer stays with the editable arm after a round trip', () => {
  const prepared = armHeadSketch(measuredSection());
  const measured = measureArmThickness(node, prepared);
  const cuts = [{ normal: [Math.SQRT1_2, Math.SQRT1_2, 0], point: [-38, 10.729, 0] }];
  const plain = buildArmHeadBody(kernel, prepared, { measured });
  const clipped = buildArmHeadBody(kernel, prepared, { measured, cuts });
  assert.ok(clipped.volume < plain.volume);
  assert.ok(clipped.volume > plain.volume - 50);
  assert.equal(checkArmHeadBody(clipped, { measured }).ok, true);
  const saved = JSON.parse(JSON.stringify(clipped));
  const opened = openArmHeadBody(saved);
  const edited = rebuildArmHeadBody(kernel, setArmHeadDimension(opened, 'armkopf_bohrung', '10'));
  assert.deepEqual(edited.cuts, cuts);
  assert.ok(edited.volume < clipped.volume);
  assert.throws(() => buildArmHeadBody(kernel, prepared, { measured, cuts: [null] }), { code: 'ARM_HEAD_CUT' });
});
