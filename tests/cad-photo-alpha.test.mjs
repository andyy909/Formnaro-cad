import assert from 'node:assert/strict';
import test from 'node:test';
import { suggestPhotoAlphaContour } from '../src/cad-photo-images.js';

function raster(width, height, { opaque = false, disconnected = false } = {}) {
  const data = new Uint8ClampedArray(width * height * 4);
  const paint = (x, y) => {
    data.set([x % 255, y % 255, 120, 255], (y * width + x) * 4);
  };
  if (opaque) {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) paint(x, y);
  } else {
    for (let y = 10; y < 40; y++)
      for (let x = 10; x < 50; x++)
        if (!(y < 20 && x >= 30)) paint(x, y);
    if (disconnected)
      for (let y = 4; y < 8; y++) for (let x = 4; x < 8; x++) paint(x, y);
  }
  return { width, height, data };
}
function withCanvas(t, pixels, image) {
  const previous = globalThis.document;
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      return {
        getContext(kind) {
          assert.equal(kind, '2d');
          return {
            drawImage(original, x, y, width, height) {
              assert.deepEqual([original, x, y, width, height], [image, 0, 0, pixels.width, pixels.height]);
            },
            getImageData: () => pixels,
          };
        },
      };
    },
  };
  t.after(() => { globalThis.document = previous; });
}
const outline = [[10, 10], [30, 10], [30, 20], [50, 20], [50, 40], [10, 40]];

test('Alpha-based exterior proposal retains a recess and multicoloured foreground', t => {
  const image = { naturalWidth: 60, naturalHeight: 50 };
  const pixels = raster(60, 50);
  const original = Uint8ClampedArray.from(pixels.data);
  withCanvas(t, pixels, image);
  const candidate = suggestPhotoAlphaContour(image);
  assert.deepEqual(candidate.points, outline);
  assert.match(candidate.warnings[0], /bestätigen oder verwerfen/);
  assert.deepEqual(pixels.data, original);
});

test('An opaque photo has no automatic alpha proposal', t => {
  const image = { naturalWidth: 60, naturalHeight: 50 };
  withCanvas(t, raster(60, 50, { opaque: true }), image);
  assert.equal(suggestPhotoAlphaContour(image), null);
});

test('Separate opaque islands are ambiguous and have no automatic proposal', t => {
  const image = { naturalWidth: 60, naturalHeight: 50 };
  withCanvas(t, raster(60, 50, { disconnected: true }), image);
  assert.equal(suggestPhotoAlphaContour(image), null);
});

test('Alpha-boundary vertices from a rounded downsample map back to original pixels on each axis', t => {
  const image = { naturalWidth: 1000, naturalHeight: 803 };
  withCanvas(t, raster(640, 514), image);
  assert.deepEqual(suggestPhotoAlphaContour(image).points,
    outline.map(([x, y]) => [(x * 1000) / 640, (y * 803) / 514]));
});
