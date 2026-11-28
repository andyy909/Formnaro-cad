import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4 } from 'three';
import load from '../cad-kernel-build/runtime/formnaro_cad.js';
import { faceSketchNative } from '../src/cad-face-sketch-native.js';
import { buildCadContours, cadRecipeVolume } from '../src/cad-recipes.js';
import { cadRayHits, transformCad, validateCadSolid, writeCadBrep } from '../src/cad-native-kernel.js';
import { cadPoint } from '../src/cad-affine.js';
import { resolveCadSketch } from '../src/cad-sketch.js';
import { referencePlate, referencePlateSketch } from './fixtures/cad-exchange-plate.mjs';

const oc = await load({ print: () => {}, printErr: () => {} });
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const sorted = (points) => [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
function points(element) {
  if (element.type === 'circle') {
    const [x, y] = element.center,
      radius = element.diameter / 2;
    return [
      [x - radius, y - radius],
      [x + radius, y + radius],
    ];
  }
  return element.type === 'line' ? [element.start, element.end] : [element.start, element.through, element.end];
}
function bounds(elements) {
  const all = elements.flatMap(points);
  return {
    min: [Math.min(...all.map((p) => p[0])), Math.min(...all.map((p) => p[1]))],
    max: [Math.max(...all.map((p) => p[0])), Math.max(...all.map((p) => p[1]))],
  };
}

test('Reference plate keeps one outer and five inner analytic loops through tilted native extraction', () => {
  const { size, thickness, holes, slot, placement } = referencePlate;
  const profile = resolveCadSketch(referencePlateSketch()),
    flat = buildCadContours(oc, { contours: [profile.native], height: thickness });
  const matrix = new Matrix4()
    .makeTranslation(...placement.translation)
    .multiply(new Matrix4().makeRotationX((placement.degrees * Math.PI) / 180))
    .toArray();
  const shape = transformCad(oc, flat, matrix);
  flat.delete();
  const origin = cadPoint(matrix, [0, 20, 50]),
    direction = cadPoint(matrix, [0, 0, -1]).map((value, index) => value - cadPoint(matrix, [0, 0, 0])[index]),
    hit = cadRayHits(oc, shape, { origin, direction, far: 1000 }).sort((a, b) => a.t - b.t)[0];
  assert.ok(hit, 'the tilted reference plate must be pickable from above');
  const before = writeCadBrep(oc, shape);
  try {
    const copy = faceSketchNative(oc, shape, hit.faceIndex, { height: thickness }),
      resolved = resolveCadSketch(copy.sketch),
      elements = copy.sketch.elements,
      byId = new Map(elements.map((element) => [element.id, element]));
    const count = (type) => elements.filter((element) => element.type === type).length;
    assert.equal(copy.sketch.version, 2);
    assert.equal(copy.elementCount, 12);
    assert.equal(count('line'), 6);
    assert.equal(count('circle'), 4);
    assert.equal(count('arc'), 2);
    assert.equal(copy.sketch.loops.filter((loop) => loop.role === 'outer').length, 1);
    assert.equal(copy.sketch.loops.filter((loop) => loop.role === 'hole').length, 5);

    // The outer loop keeps the exact 100 × 60 mm plate outline.
    const outer = copy.sketch.loops.find((loop) => loop.role === 'outer'),
      outerBounds = bounds(outer.elements.map((id) => byId.get(id)));
    near(outerBounds.max[0] - outerBounds.min[0], size[0]);
    near(outerBounds.max[1] - outerBounds.min[1], size[1]);
    near(outerBounds.min[0], -size[0] / 2);
    near(outerBounds.min[1], -size[1] / 2);
    near(resolved.size[0], size[0]);
    near(resolved.size[1], size[1]);
    near(resolved.height, thickness);

    // Four independent Ø6 circles at the reference centres.
    const circles = elements.filter((element) => element.type === 'circle'),
      centres = sorted(circles.map((element) => element.center)),
      expectedCentres = sorted(holes.centers);
    assert.equal(centres.length, holes.centers.length);
    centres.forEach((centre, index) => {
      near(centre[0], expectedCentres[index][0]);
      near(centre[1], expectedCentres[index][1]);
    });
    for (const element of circles) near(element.diameter, holes.diameter);

    // The slot stays analytic: two straight flanks and two semicircular arcs.
    const slotLoop = copy.sketch.loops.find(
      (loop) => loop.role === 'hole' && loop.elements.some((id) => byId.get(id)?.type === 'arc'),
    );
    assert.ok(slotLoop, 'the slot must be a separate inner loop');
    const slotElements = slotLoop.elements.map((id) => byId.get(id)),
      slotBounds = bounds(slotElements),
      slotLines = slotElements.filter((element) => element.type === 'line'),
      slotArcs = slotElements.filter((element) => element.type === 'arc');
    assert.equal(slotLines.length, 2);
    assert.equal(slotArcs.length, 2);
    near(slotBounds.max[0] - slotBounds.min[0], slot.overallLength);
    near(slotBounds.max[1] - slotBounds.min[1], slot.width);
    near((slotBounds.min[0] + slotBounds.max[0]) / 2, 0);
    near((slotBounds.min[1] + slotBounds.max[1]) / 2, 0);
    for (const element of slotLines) {
      near(Math.abs(element.start[1]), slot.width / 2);
      near(element.start[1], element.end[1]);
      near(Math.abs(element.end[0] - element.start[0]), slot.overallLength - slot.width);
    }
    for (const element of slotArcs) {
      near(Math.hypot(element.start[0] - element.end[0], element.start[1] - element.end[1]), slot.width);
      near(Math.abs(element.through[0]), slot.overallLength / 2);
      near(element.through[1], 0);
      near(Math.abs(element.start[0]), slot.overallLength / 2 - slot.width / 2);
      near(Math.abs(element.start[1]), slot.width / 2);
    }

    // Exact analytic area, including all four holes and the slot.
    const slotArea = (slot.overallLength - slot.width) * slot.width + Math.PI * (slot.width / 2) ** 2,
      expectedArea = size[0] * size[1] - holes.centers.length * Math.PI * (holes.diameter / 2) ** 2 - slotArea;
    near(copy.area, expectedArea);
    near(resolved.area, expectedArea);

    // The independent draft rebuilds the same material body at 5 mm.
    const rebuilt = buildCadContours(oc, { contours: [resolved.native], height: thickness });
    try {
      near(cadRecipeVolume(oc, rebuilt), expectedArea * thickness);
      validateCadSolid(oc, rebuilt);
    } finally {
      rebuilt.delete();
    }

    // Frame stays right-handed and maps the draft onto the tilted top face.
    const frame = new Matrix4().fromArray(copy.frame),
      normal = copy.frame.slice(8, 11),
      expectedNormal = cadPoint(matrix, [0, 0, 1]).map((value, index) => value - cadPoint(matrix, [0, 0, 0])[index]);
    near(frame.determinant(), 1);
    near(
      normal.reduce((sum, value, index) => sum + value * expectedNormal[index], 0),
      1,
    );
    near(
      normal.reduce((sum, value, index) => sum + value * hit.normal[index], 0),
      1,
    );
    const centre = cadPoint(copy.frame, [0, 0, 0]);
    near(
      (centre[0] - hit.point[0]) * hit.normal[0] +
        (centre[1] - hit.point[1]) * hit.normal[1] +
        (centre[2] - hit.point[2]) * hit.normal[2],
      0,
    );

    // Read-only extraction leaves the tilted native body untouched.
    assert.equal(writeCadBrep(oc, shape), before);
  } finally {
    shape.delete();
  }
});
