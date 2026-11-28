import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { resolveSketchProfile } from '../src/sketch-profile.js';
import { sketchExpression } from '../src/sketch-expression.js';
import {
  BASE_PLATE_LIMITS,
  basePlateBodyNode,
  basePlateSketch,
  buildBasePlateBody,
  checkBasePlateBody,
  compareBasePlateBody,
  compareBasePlateSection,
  largestBasePlateDeviation,
  measureBasePlateHeight,
  openBasePlateBody,
  rebuildBasePlateBody,
  setBasePlateDimension,
} from '../src/base-plate-rebuild.js';

const kernel = await Module();
kernel.setup();

// Synthetic R03 fixture (no private camera-holder data): a 46 x 54 mm octagon
// with four different corner chamfers on the measured plane Z = 7 and a
// plate height of 9 mm. The real part is measured by
// work/rueckgabe/probe-r03-real.mjs outside the repository.
const FRAME = {
  origin: [10, 20, 7],
  uAxis: [1, 0, 0],
  vAxis: [0, 1, 0],
  normal: [0, 0, 1],
};
const POINTS_2D = [
  [-15, -27],
  [20, -27],
  [23, -24],
  [23, 22],
  [18, 27],
  [-17, 27],
  [-23, 23],
  [-23, -21],
];
const PLATE_HEIGHT = 9;
const AREA = 2431; // 46 * 54 minus the four chamfer triangles (4.5 + 12.5 + 12 + 24)
const pointsWorld = () => POINTS_2D.map((point) => [FRAME.origin[0] + point[0], FRAME.origin[1] + point[1], FRAME.origin[2]]);
const perimeter = () =>
  POINTS_2D.reduce((sum, point, i) => {
    const next = POINTS_2D[(i + 1) % POINTS_2D.length];
    return sum + Math.hypot(next[0] - point[0], next[1] - point[1]);
  }, 0);
const measuredProfile = () => ({
  role: 'outer',
  frame: FRAME,
  normal: [0, 0, 1],
  status: 'complete',
  closed: true,
  measurementPlanePoint: FRAME.origin,
  outerProfile: {
    role: 'outer',
    area: AREA,
    pointCount: POINTS_2D.length,
    bounds2D: { min: [-23, -27], max: [23, 27] },
    elements: POINTS_2D.map((start, i) => ({
      id: 's0e' + i,
      type: 'line',
      start,
      end: POINTS_2D[(i + 1) % POINTS_2D.length],
    })),
    points2D: POINTS_2D,
    pointsWorld: pointsWorld(),
  },
});

function meshNode(id, verts, triangles) {
  return {
    id,
    kind: 'mesh',
    name: id,
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    meshRole: 'solid',
    color: '#7ba8bf',
    opacity: 1,
    hidden: false,
    locked: false,
    metadata: { notes: 'synthetic R03 fixture' },
    mesh: { verts, triangles },
  };
}

// Synthetic source body: the measured contour extruded from Z = 0 to 9.
function plateSource(prepared, thickness = PLATE_HEIGHT) {
  const resolved = resolveSketchProfile(prepared.sketch, sketchExpression),
    solid = kernel.Manifold.extrude(resolved.polygons, thickness, 0, 0, [1, 1], false);
  try {
    const raw = solid.getMesh(),
      verts = [],
      numProp = raw.numProp ?? 3;
    for (let i = 0; i < raw.vertProperties.length; i += numProp)
      verts.push(FRAME.origin[0] + raw.vertProperties[i], FRAME.origin[1] + raw.vertProperties[i + 1], raw.vertProperties[i + 2]);
    return meshNode('synthetic-base-plate', verts, Array.from(raw.triVerts));
  } finally {
    solid.delete();
  }
}

const prepared = basePlateSketch(measuredProfile());
const source = plateSource(prepared);

test('R03-01: die gemessene Grundplattenkontur wird eine native Außenskizze ohne erfundene Punkte', () => {
  assert.equal(prepared.kind, 'basePlateSketch');
  assert.equal(prepared.status, 'complete');
  assert.equal(prepared.complete, true);
  assert.equal(prepared.sketch.version, 2);
  assert.equal(prepared.sketch.loops.length, 1);
  assert.equal(prepared.sketch.loops[0].role, 'outer');
  assert.equal(prepared.sketch.elements.length, 8);
  assert.ok(prepared.sketch.elements.every((element) => element.type === 'line'));
  assert.deepEqual(
    prepared.sketch.variables.map((variable) => variable.name),
    ['grundplatte_hoehe'],
  );
  assert.equal(prepared.sketch.dimensions.height, 'grundplatte_hoehe');
  assert.equal(prepared.sketch.variables[0].value, '1', 'R03-01 keeps the disclosed 1 mm placeholder');
  assert.ok(Math.abs(prepared.area - AREA) < 1e-6, `Fläche ${prepared.area}`);
  assert.equal(prepared.supportPoints.count, 8);
  assert.equal(prepared.supportPoints.maxPlaneDistance, 0);
  assert.ok(prepared.supportPoints.maxSourceDistance <= BASE_PLATE_LIMITS.sourceTolerance);
  assert.equal(prepared.supportPoints.sourcePointCount, 8);
  assert.equal(prepared.uncertainSegments.length, 0);
  assert.equal(prepared.measuredContour.area, AREA);
});

test('R03-01: ein offener Schnitt erfindet keine Grundplattenkontur', () => {
  const open = basePlateSketch({ status: 'incomplete', ...measuredProfile(), outerProfile: undefined, openProfile: { role: 'outer', uncertainty: 'Unterbrochener oder offener Schnitt' } });
  assert.equal(open.status, 'incomplete');
  assert.equal(open.complete, false);
  assert.equal(open.sketch, null);
  assert.match(open.uncertainSegments[0].reason, /Unterbrochen|offen/);
});

test('R03-02: Strahlmessung liefert Höhe und Übergangsfläche aus dem Körper, nicht geschätzt', () => {
  const measured = measureBasePlateHeight(source, prepared);
  assert.equal(measured.kind, 'basePlateHeight');
  assert.ok(Math.abs(measured.height - PLATE_HEIGHT) < 1e-6, `Höhe ${measured.height}`);
  assert.ok(Math.abs(measured.near + 7) < 1e-6, `near ${measured.near}`);
  assert.ok(Math.abs(measured.far - 2) < 1e-6, `far ${measured.far}`);
  assert.ok(measured.probes.measured >= 100);
  assert.ok(measured.probes.share > 0.99);
  assert.equal(measured.distribution[0].height, measured.height);
  assert.ok(Math.abs(measured.surfaces.top.area - AREA) < 1e-3);
  assert.ok(Math.abs(measured.surfaces.bottom.area - AREA) < 1e-3);

  const body = buildBasePlateBody(kernel, prepared, { measured, source });
  assert.equal(body.kind, 'basePlateBody');
  assert.equal(body.status, 'complete');
  assert.ok(body.volume > 0);
  assert.ok(Math.abs(body.report.bodyHeight - PLATE_HEIGHT) < 1e-6);
  assert.ok(body.report.spanDeviation <= BASE_PLATE_LIMITS.thicknessTolerance);
  assert.equal(body.extrusion.height, measured.height);
  assert.equal(body.sketch.dimensions.height, 'grundplatte_hoehe');
  assert.equal(body.sketch.variables[0].value, String(measured.height));
  assert.ok(Math.abs(body.volume - AREA * measured.height) < 0.1, `Volumen ${body.volume}`);
  assert.ok(Math.abs(body.report.transitionArea - AREA) < 1e-3, `Übergangsfläche ${body.report.transitionArea}`);
  assert.ok(Math.abs(body.report.sideArea - perimeter() * measured.height) < 1, `Mantelfläche ${body.report.sideArea}`);
  assert.ok(Math.abs(body.report.sourceTopSurfaceArea - AREA) < 1e-3);

  const check = checkBasePlateBody(body, { measured, source });
  assert.equal(check.ok, true, JSON.stringify(check.problems));
  assert.ok(check.checks.every((item) => item.ok));
  assert.equal(check.checks.find((item) => item.id === 'ebene-im-material').actual, true);
  assert.ok(check.checks.find((item) => item.id === 'normale').actual > 1 - 1e-9);

  // A wrong (estimated) height is caught by the independent ray proof.
  const wrong = buildBasePlateBody(kernel, prepared, { measured: { ...measured, far: measured.near + 8 }, source });
  assert.equal(checkBasePlateBody(wrong, { measured, source }).ok, false);
});

test('R03-03: Ebenenvergleich gegen die Vorlage nennt die größte Abweichung in mm', () => {
  const measured = measureBasePlateHeight(source, prepared);
  const body = buildBasePlateBody(kernel, prepared, { measured, source });
  for (const planePoint of [
    [0, 0, 7],
    [0, 0, 2.5],
    [0, 0, 4.5],
    [0, 0, 8.5],
  ]) {
    const comparison = compareBasePlateSection(body, source, { normal: [0, 0, 1], planePoint });
    assert.ok(comparison.ok, `z=${planePoint[2]}: ${comparison.error ?? comparison.maxDeviation}`);
    assert.ok(comparison.maxDeviation <= BASE_PLATE_LIMITS.contourBudget, `z=${planePoint[2]}: ${comparison.maxDeviation}`);
    assert.equal(typeof comparison.maxDeviation, 'number');
    assert.equal(largestBasePlateDeviation(body, source, { normal: [0, 0, 1], planePoint }), comparison.maxDeviation);
  }
  // An impossible plane reports a finite failure instead of inventing a value.
  const outside = compareBasePlateSection(body, source, { normal: [0, 0, 1], planePoint: [0, 0, 50] });
  assert.equal(outside.ok, false);
  assert.equal(outside.maxDeviation, null);
});

test('R03-Gegenprobe: ein Ersatzrechteck mit gleichen Außenmaßen fällt an Z = 7,0 sichtbar durch', () => {
  const measured = measureBasePlateHeight(source, prepared);
  const min = [Math.min(...POINTS_2D.map((point) => point[0])), Math.min(...POINTS_2D.map((point) => point[1]))],
    max = [Math.max(...POINTS_2D.map((point) => point[0])), Math.max(...POINTS_2D.map((point) => point[1]))],
    rectangle = [min, [max[0], min[1]], max, [min[0], max[1]]],
    rectangleProfile = {
      frame: FRAME,
      status: 'complete',
      closed: true,
      measurementPlanePoint: FRAME.origin,
      outerProfile: {
        role: 'outer',
        elements: rectangle.map((start, i) => ({ id: 'r' + i, type: 'line', start, end: rectangle[(i + 1) % 4] })),
        points2D: rectangle,
        pointsWorld: rectangle.map((point) => [FRAME.origin[0] + point[0], FRAME.origin[1] + point[1], FRAME.origin[2]]),
      },
    },
    rectanglePrepared = basePlateSketch(rectangleProfile, { name: 'Ersatzrechteck' }),
    rectangleBody = buildBasePlateBody(kernel, rectanglePrepared, { measured });
  assert.deepEqual([max[0] - min[0], max[1] - min[1]], [46, 54]);
  const retained = { ...measuredProfile(), outerProfile: { ...measuredProfile().outerProfile } };
  const comparison = compareBasePlateBody(rectangleBody, retained);
  assert.equal(comparison.ok, false);
  assert.ok(comparison.maxDeviation > 2 * BASE_PLATE_LIMITS.contourBudget, `Abweichung ${comparison.maxDeviation}`);
  assert.ok(comparison.bodyToRetained > 0.5, `Rechteck -> Messpunkte ${comparison.bodyToRetained}`);
  assert.ok(comparison.retainedToBody > 0.5, `Messpunkte -> Rechteck ${comparison.retainedToBody}`);
  // The real plate passes the very same check.
  const plateBody = buildBasePlateBody(kernel, prepared, { measured, source });
  const plateComparison = compareBasePlateBody(plateBody, retained);
  assert.equal(plateComparison.ok, true, `Platte ${plateComparison.maxDeviation}`);
  assert.ok(plateComparison.maxDeviation <= BASE_PLATE_LIMITS.contourBudget);
});

test('R03-04: gespeicherte Grundplattenquelle wird nach JSON-Rundlauf nativ neu berechnet', () => {
  const measured = measureBasePlateHeight(source, prepared);
  const body = buildBasePlateBody(kernel, prepared, { measured, source });
  const saved = JSON.parse(JSON.stringify(body));
  const opened = openBasePlateBody(saved);
  assert.equal(opened.kind, 'basePlateBodySource');
  assert.equal(opened.status, 'editable');
  assert.deepEqual(
    opened.sketch.variables.map((variable) => variable.name),
    ['grundplatte_hoehe'],
  );
  assert.equal(opened.sketch.dimensions.height, 'grundplatte_hoehe');
  assert.equal(opened.sketch.variables[0].value, String(measured.height));

  const edited = setBasePlateDimension(opened, 'grundplatte_hoehe', '12');
  assert.equal(edited.sketch.variables[0].value, '12');
  assert.deepEqual(edited.edited, { name: 'grundplatte_hoehe', from: String(measured.height), to: '12' });
  const rebuilt = rebuildBasePlateBody(kernel, edited);
  assert.ok(rebuilt.volume > body.volume);
  assert.ok(Math.abs(rebuilt.volumeDelta - AREA * (12 - measured.height)) < 1, `${rebuilt.volumeDelta}`);
  assert.ok(Math.abs(rebuilt.report.bodyHeight - 12) < 1e-6);
  assert.equal(rebuilt.report.heightEdited, true);
  assert.equal(rebuilt.sketch.variables[0].value, '12');
  assert.equal(rebuilt.source.geometryDigest, body.source.geometryDigest);
  assert.equal(checkBasePlateBody(rebuilt, { measured }).ok, true);

  const reopened = openBasePlateBody(JSON.parse(JSON.stringify(rebuilt)));
  assert.equal(reopened.sketch.variables[0].value, '12');
  assert.ok(Math.abs(reopened.volume - rebuilt.volume) < 1e-9);

  assert.throws(() => setBasePlateDimension(opened, 'grundplatte_hoehe', '0'), { code: 'BASE_PLATE_DIMENSION' });
  assert.equal(opened.sketch.variables[0].value, String(measured.height));
  assert.throws(() => setBasePlateDimension(opened, 'unbekannt', '5'), { code: 'BASE_PLATE_DIMENSION' });
});

test('basePlateBodyNode keeps the saved plate mesh addressable for section checks', () => {
  const measured = measureBasePlateHeight(source, prepared);
  const body = buildBasePlateBody(kernel, prepared, { measured });
  const node = basePlateBodyNode(body);
  assert.equal(node.kind, 'mesh');
  assert.equal(node.meshRole, 'solid');
  assert.deepEqual(node.mesh.verts, body.mesh.verts);
  assert.equal(node.mesh.triangles.length, body.mesh.triangles.length);
  assert.throws(() => basePlateBodyNode({ kind: 'basePlateBody' }), { code: 'BASE_PLATE_BODY' });
});
