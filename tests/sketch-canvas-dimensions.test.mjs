import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// The module imports its stylesheet. Keep this Node-only test independent of a
// browser by resolving that single CSS import to an empty module.
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier.endsWith('.css')) return {url: 'data:text/javascript,export default {}', shortCircuit: true};
  return next(specifier, context);
}
`));

const { createSketchCanvasDimensions, dimensionLabel, layoutDimensionLabels, projectDimensions } =
  await import('../src/sketch-canvas-dimensions.js');

class FakeElement {
  constructor(tag, document) {
    this.tagName = tag;
    this.ownerDocument = document;
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this.dataset = {};
    this.textContent = '';
    this.classList = { add() {} };
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  toggleAttribute(name, force) { if (force) this.setAttribute(name, ''); else this.removeAttribute(name); }
  append(...nodes) {
    for (const node of nodes) {
      node.parentNode = this;
      this.children.push(node);
    }
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((node) => node !== this);
    this.parentNode = null;
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  dispatch(type) {
    const event = { key: 'Enter', preventDefault() {}, stopPropagation() {} };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
  getComputedTextLength() { return 40; }
}

function fakeBoard() {
  const document = {
    documentElement: { lang: 'de' },
    createElementNS(namespace, tag) { return new FakeElement(tag, document); },
  };
  const matrix = {
    a: 1, b: 0, c: 0, d: -1, e: 0, f: 0,
    inverse() { return this; },
    translate() { return this; },
  };
  const board = new FakeElement('svg', document);
  board.getScreenCTM = () => matrix;
  board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 320, height: 200 });
  return board;
}

function renderedLabels(board) {
  const layer = board.children[0];
  return layer.children.map((group) => group.children[2]).filter((anchor) => anchor.dataset.sketchCanvasDimension);
}

test('Signed delta labels use ΔX/ΔY and accessible names', () => {
  const positive = dimensionLabel('dx', 12.5, 'de');
  assert.equal(positive.title, 'ΔX +12,5 mm');
  assert.equal(positive.accessibleName, 'ΔX Verschiebung X +12,5 mm');

  const negative = dimensionLabel('dy', -3.25, 'de');
  assert.equal(negative.title, 'ΔY -3,25 mm');
  assert.equal(negative.accessibleName, 'ΔY Verschiebung Y -3,25 mm');

  const zero = dimensionLabel('dx', 0, 'de');
  assert.equal(zero.title, 'ΔX 0 mm');
  assert.equal(zero.accessibleName, 'ΔX Verschiebung X 0 mm');

  const english = dimensionLabel('dx', 12.5, 'en');
  assert.equal(english.title, 'ΔX +12.5 mm');
  assert.equal(english.accessibleName, 'ΔX X offset +12.5 mm');

  const width = dimensionLabel('x', 12.5, 'de');
  assert.equal(width.title, 'X 12,5 mm');
  assert.equal(width.accessibleName, 'Breite 12,5 mm');

  assert.equal(dimensionLabel('dx', NaN), null);
  assert.equal(dimensionLabel('missing', 1), null);
});

test('Delta projection follows the reference point and the current position', () => {
  const data = projectDimensions([100, 80], [160, 140], { dx: 60, dy: 60 }, 400, 300);
  assert.deepEqual([data.dx.from, data.dx.to], [[100, 80], [160, 80]]);
  assert.deepEqual([data.dy.from, data.dy.to], [[160, 80], [160, 140]]);
  assert.match(data.dx.guides, /100 80/);
  assert.match(data.dy.guides, /160 140/);

  const vertical = projectDimensions([50, 50], [50, 120], { dx: 0, dy: 70 }, 400, 300);
  assert.deepEqual([vertical.dx.from, vertical.dx.to], [[50, 50], [50, 50]]);
  assert.deepEqual([vertical.dy.from, vertical.dy.to], [[50, 50], [50, 120]]);

  const horizontal = projectDimensions([50, 50], [120, 50], { dx: 70, dy: 0 }, 400, 300);
  assert.deepEqual([horizontal.dx.from, horizontal.dx.to], [[50, 50], [120, 50]]);
  assert.deepEqual([horizontal.dy.from, horizontal.dy.to], [[120, 50], [120, 50]]);

  const negative = projectDimensions([200, 200], [140, 150], { dx: -60, dy: -50 }, 400, 300);
  assert.deepEqual([negative.dx.from, negative.dx.to], [[200, 200], [140, 200]]);
  assert.deepEqual([negative.dy.from, negative.dy.to], [[140, 200], [140, 150]]);

  const dxOnly = projectDimensions([10, 10], [20, 10], { dx: 10 }, 400, 300);
  assert.ok(dxOnly.dx);
  assert.equal(dxOnly.dy, undefined);
});

test('Existing x/y/radius/length projections remain available without deltas', () => {
  const data = projectDimensions([100, 100], [200, 180], { x: 100, y: 80, radius: 50, length: 80 }, 400, 300);
  for (const key of ['x', 'y', 'radius', 'length']) {
    assert.ok(data[key], key);
    assert.ok(Number.isFinite(data[key].center[0]), key);
    assert.ok(Number.isFinite(data[key].center[1]), key);
  }
  assert.equal(data.dx, undefined);
  assert.equal(data.dy, undefined);
});

test('Both delta labels stay reachable and separate at zero axis, small drags, edges and zoom extremes', () => {
  const width = 320;
  const height = 200;
  const cases = [
    { name: 'zero at top left', start: [0, 0], end: [0, 0] },
    { name: 'small drag at top left', start: [0, 0], end: [2, 1] },
    { name: 'zero at center', start: [160, 100], end: [160, 100] },
    { name: 'zero at bottom right', start: [320, 200], end: [320, 200] },
    { name: 'negative deltas at bottom right', start: [300, 180], end: [250, 120] },
    { name: 'coordinates outside the viewport', start: [-500, -500], end: [900, 700] },
  ];
  for (const { name, start, end } of cases) {
    const data = projectDimensions(start, end, { dx: end[0] - start[0], dy: end[1] - start[1] }, width, height);
    const labels = ['dx', 'dy'].map((key) => ({ key, center: data[key].center, width: 72, height: 44 }));
    const [first, second] = layoutDimensionLabels(labels, width, height);
    for (const label of [first, second]) {
      assert.ok(Number.isFinite(label.center[0]), name + ' x');
      assert.ok(Number.isFinite(label.center[1]), name + ' y');
      assert.ok(label.center[0] >= 40 && label.center[0] <= width - 40, name + ' x bounds');
      assert.ok(label.center[1] >= 26 && label.center[1] <= height - 26, name + ' y bounds');
    }
    const horizontalGap = Math.abs(first.center[0] - second.center[0]);
    const verticalGap = Math.abs(first.center[1] - second.center[1]);
    assert.ok(
      horizontalGap >= (first.width + second.width) / 2 + 4 - 1e-9
        || verticalGap >= (first.height + second.height) / 2 + 4 - 1e-9,
      name + ' labels overlap',
    );
  }
});

test('Preview keeps delta labels accessible without resize and editable mode exposes buttons', () => {
  const board = fakeBoard();
  const edits = [];
  const dimensions = createSketchCanvasDimensions(board, {
    edit(anchor, key, measurement) { edits.push([key, measurement]); },
  });
  const preview = { start: [0, 0], end: [40, 30], values: { dx: 40, dy: 30 } };

  dimensions.render(preview);
  let labels = renderedLabels(board);
  assert.deepEqual(labels.map((label) => label.dataset.sketchCanvasDimension), ['dx', 'dy']);
  for (const label of labels) {
    assert.equal(label.getAttribute('role'), 'img');
    assert.match(label.getAttribute('aria-label'), /^Δ[XY] Verschiebung [XY] \+/);
    assert.equal(label.getAttribute('tabindex'), undefined);
  }
  assert.notEqual(labels[0].getAttribute('transform'), labels[1].getAttribute('transform'));

  dimensions.render({ start: [0, 0], end: [40, 30], values: { x: 40, y: 30 } });
  labels = renderedLabels(board);
  assert.deepEqual(labels.map((label) => label.dataset.sketchCanvasDimension), ['x', 'y']);
  for (const label of labels) {
    assert.equal(label.getAttribute('role'), undefined);
    assert.equal(label.getAttribute('aria-label'), undefined);
  }

  const editable = { ...preview, resize() {} };
  dimensions.render(editable);
  labels = renderedLabels(board);
  for (const label of labels) {
    assert.equal(label.getAttribute('role'), 'button');
    assert.equal(label.getAttribute('tabindex'), '0');
  }
  labels[0].dispatch('click');
  assert.deepEqual(edits.map(([key]) => key), ['dx']);
  assert.equal(edits[0][1], editable);
});
