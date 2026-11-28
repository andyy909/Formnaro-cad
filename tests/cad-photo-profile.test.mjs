import assert from 'node:assert/strict';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import { cadIdentity } from '../src/cad-affine.js';
import { createCadController } from '../src/cad-controller.js';
import { photoPlane, projectPhotoPoint } from '../src/cad-photo-perspective.js';
import { photoProfileCommand } from '../src/cad-photo-profile.js';
import { createCadProject } from '../src/cad-project.js';
import { resolveCadSketch } from '../src/cad-sketch.js';

const digest = 'a'.repeat(64);
const outline = [[100,350],[500,350],[500,150],[300,150],[300,50],[100,50]];
const opening = [[150,300],[200,300],[200,250],[150,250]];
const calibration = {
  mm: 40, points: [[50,30],[450,30]], referenceErrorMm: 0.01, pickErrorPx: 0.25,
  source: 'user', note: 'Kalibriertes Prüffoto',
};
const reference = () => ({
  version: 1, imageId: 'photo-' + digest.slice(0,16), digest,
  name: 'Platte', width: 600, height: 400, view: 'front', scale: structuredClone(calibration),
  outline: structuredClone(outline), holes: [structuredClone(opening)], dimensions: [], unknowns: [],
});
const batch = (...commands) => ({ kind: 'batch', commands });
const near = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-6, `${value} ≠ ${expected}`);
const pointsNear = (actual, expected) => actual.forEach((value, axis) => near(value, expected[axis]));
function controller(t) {
  const cad = createCadController({ initial: createCadProject(), createWorker: () => {
    const worker = new Worker(new URL('./fixtures/cad-node-worker.mjs', import.meta.url));
    const port = { postMessage: message => worker.postMessage(message), terminate: () => worker.terminate() };
    worker.on('message', data => port.onmessage?.({ data }));
    worker.on('error', error => port.onerror?.(error));
    return port;
  } });
  t.after(() => cad.dispose());
  return cad;
}

test('A calibrated concave photo outline and its confirmed opening become a separate editable native solid', async t => {
  const cad = controller(t);
  await cad.execute(batch({ op: 'create', type: 'box', name: 'Existing', size: [3,4,5] }));
  const original = cad.serialize(), undo = cad.state().undo, oldBody = cad.snapshot().nodes[0];
  const frame = [0,1,0,0,-1,0,0,0,0,0,1,0,40,-10,3,1], photo = reference(), beforePhoto = structuredClone(photo);
  const command = photoProfileCommand(photo, 4, frame);
  assert.deepEqual(photo, beforePhoto);
  const resolved = resolveCadSketch(command.sketch);
  pointsNear(resolved.bottom, [0,0,0]);
  pointsNear(resolved.size, [40,30,4]);
  near(resolved.area, 975);
  const candidate = await cad.preview(batch(command), { revision: cad.revision() });
  assert.equal(cad.serialize(), original);
  assert.equal(cad.state().undo, undo);
  assert.deepEqual(candidate.project.nodes[0], oldBody);
  const id = candidate.aliases.photo_profile;
  const body = candidate.project.nodes.find(node => node.id === id);
  assert.ok(body?.solid && body.kind === 'cad' && body.source === 'native');
  assert.equal(body.stats.solids, 1);
  assert.equal(body.brep.format, 'OpenCascade-BRep');
  assert.equal(body.recipe.type, 'sketch');
  assert.equal(body.recipe.sketch.version, 2);
  assert.deepEqual(body.recipe.sketch.loops.map(loop => loop.role), ['outer','hole']);
  assert.deepEqual(body.transform, frame);
  near(body.stats.volume, 3900);
  cad.apply(candidate);
  assert.equal(cad.state().undo, undo + 1);
  const accepted = cad.serialize();
  const edited = structuredClone(body.recipe.sketch);
  edited.dimensions.height = '7';
  const update = await cad.preview(batch({ op: 'sketch', target: id, sketch: edited }));
  const next = update.project.nodes.find(node => node.id === id);
  near(next.stats.volume, 6825);
  assert.deepEqual(next.transform, frame);
  assert.deepEqual(next.recipe.sketch.loops, body.recipe.sketch.loops);
  cad.apply(update);
  assert.equal(cad.state().undo, undo + 2);
  assert.equal(cad.snapshot().nodes.find(node => node.id === id).recipe.sketch.dimensions.height, '7');
  cad.undo();
  assert.equal(cad.serialize(), accepted);
  cad.undo();
  assert.equal(cad.serialize(), original);
});

test('Perspective calibration rectifies both profile loops in millimetres before native extrusion', async t => {
  const cad = controller(t), photo = reference();
  const perspective = { kind: 'rectangle', points: [[100,90],[510,115],[470,350],[70,320]], sizeMm: [50,30],
    referenceErrorMm: 0.01, pickErrorPx: 0.25, source: 'user', note: calibration.note };
  const plane = photoPlane(perspective, photo.width, photo.height);
  const toImage = points => points.map(point => projectPhotoPoint(plane.toOriginal, point));
  Object.assign(photo, {
    version: 2, perspective, scale: { ...photo.scale, points: perspective.points.slice(0,2), mm: 50 },
    outline: toImage([[5,7],[30,7],[30,20],[5,20]]),
    holes: [toImage([[10,10],[14,10],[14,14],[10,14]])],
  });
  const duplicate = await cad.preview(batch(photoProfileCommand(photo, 3, cadIdentity())));
  const body = duplicate.project.nodes.find(node => node.id === duplicate.aliases.photo_profile);
  pointsNear(body.recipe.size, [25,13,3]);
  near(body.stats.volume, 927);
  cad.apply(await cad.preview(batch({ op: 'create', type: 'box', size: [3,4,5] })));
  const changed = cad.serialize();
  assert.throws(() => cad.apply(duplicate), { code: 'STALE_REVISION' });
  assert.equal(cad.serialize(), changed);
  assert.equal(cad.snapshot().nodes.length, 1);
});

test('Missing contours, unsupported dimensions and contours above the native segment limit fail explicitly', () => {
  assert.throws(() => photoProfileCommand({ ...reference(), outline: [], holes: [] }, 2), /Außenkontur/);
  for (const height of [0, -2, NaN, 0.008, 10001]) {
    assert.throws(() => photoProfileCommand(reference(), height), /Extrusionshöhe/);
  }
  const belowScale = reference();
  Object.assign(belowScale.scale, { mm: 0.001, referenceErrorMm: 0 });
  assert.throws(() => photoProfileCommand(belowScale, 2), /Profilabmessungen/);
  const invalidFrame = cadIdentity();
  invalidFrame[0] = 0;
  assert.throws(() => photoProfileCommand(reference(), 2, invalidFrame), /Singuläre/);
  const manyPoints = Array.from({ length: 129 }, (_, index) => {
    const angle = (index / 129) * 2 * Math.PI;
    return [200 + Math.cos(angle) * 90, 200 + Math.sin(angle) * 90];
  });
  assert.throws(() => photoProfileCommand({ ...reference(), outline: manyPoints, holes: [] }, 2), /128 Segmente/);
});
