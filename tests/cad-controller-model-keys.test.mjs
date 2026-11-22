import test from 'node:test';
import assert from 'node:assert/strict';
import {
  drawingModelKey,
  parameterModelKey,
  contourModelKey,
  mergeDrawingUpdateReports,
} from '../src/cad-controller-model-keys.js';

test('drawingModelKey ignores drawings and version only and keeps the remaining field order', () => {
  const project = {
    version: 3,
    nodes: [{ id: 'body' }],
    drawings: { sheets: [{ id: 'sheet' }] },
    layers: [{ id: 'default' }],
    activeLayerId: 'default',
  };
  assert.equal(
    drawingModelKey(project),
    JSON.stringify({ nodes: [{ id: 'body' }], layers: [{ id: 'default' }], activeLayerId: 'default' }),
  );
  assert.equal(drawingModelKey({ ...project, drawings: { sheets: [] } }), drawingModelKey(project));
  assert.equal(drawingModelKey({ ...project, version: 4 }), drawingModelKey(project));
  assert.notEqual(drawingModelKey({ ...project, activeLayerId: 'other' }), drawingModelKey(project));
});

test('parameterModelKey ignores project parameters and version only', () => {
  const project = {
    version: 1,
    nodes: [{ id: 'body' }],
    projectParameters: { variables: [{ name: 'breite', value: 40 }] },
    activeLayerId: 'default',
  };
  assert.equal(parameterModelKey(project), JSON.stringify({ nodes: [{ id: 'body' }], activeLayerId: 'default' }));
  assert.equal(parameterModelKey({ ...project, projectParameters: { variables: [] } }), parameterModelKey(project));
  assert.equal(parameterModelKey({ ...project, version: 2 }), parameterModelKey(project));
  assert.notEqual(parameterModelKey({ ...project, nodes: [] }), parameterModelKey(project));
});

test('contourModelKey ignores contour links and version only', () => {
  const project = {
    version: 7,
    nodes: [{ id: 'body' }],
    contourLinks: { links: [{ id: 'link-1' }] },
    activeLayerId: 'default',
  };
  assert.equal(contourModelKey(project), JSON.stringify({ nodes: [{ id: 'body' }], activeLayerId: 'default' }));
  assert.equal(contourModelKey({ ...project, contourLinks: { links: [] } }), contourModelKey(project));
  assert.equal(contourModelKey({ ...project, version: 8 }), contourModelKey(project));
  assert.notEqual(contourModelKey({ ...project, activeLayerId: 'other' }), contourModelKey(project));
});

test('mergeDrawingUpdateReports keeps a missing side and otherwise lets the later report win', () => {
  const before = { kind: 'drawing', message: 'before', metadataOnly: true };
  const after = { kind: 'parameter', message: 'after', metadataOnly: false };
  assert.equal(mergeDrawingUpdateReports(undefined, after), after);
  assert.equal(mergeDrawingUpdateReports(before, undefined), before);
  assert.deepEqual(mergeDrawingUpdateReports(before, after), {
    kind: 'parameter',
    message: 'after',
    metadataOnly: false,
  });
});

test('mergeDrawingUpdateReports unions id lists in report order, sums counts and joins metadataOnly with and', () => {
  const merged = mergeDrawingUpdateReports(
    {
      affectedIds: ['b', 'a'],
      rebuiltIds: ['a'],
      updatedLinkIds: [],
      counts: { rebuilt: 1, updated: 2 },
      metadataOnly: true,
      headline: 'before',
    },
    {
      affectedIds: ['a', 'c'],
      rebuiltIds: ['b'],
      removedLinkIds: ['link-1'],
      counts: { rebuilt: 2, removed: 1 },
      metadataOnly: true,
      headline: 'after',
    },
  );
  assert.deepEqual(merged.affectedIds, ['b', 'a', 'c']);
  assert.deepEqual(merged.rebuiltIds, ['a', 'b']);
  assert.deepEqual(merged.updatedLinkIds, []);
  assert.deepEqual(merged.removedLinkIds, ['link-1']);
  assert.deepEqual(merged.counts, { rebuilt: 3, updated: 2, removed: 1 });
  assert.equal(merged.metadataOnly, true);
  assert.equal(merged.headline, 'after');
});

test('mergeDrawingUpdateReports leaves unknown arrays alone and keeps metadataOnly only when both sides agree', () => {
  const merged = mergeDrawingUpdateReports(
    { customIds: ['a'], metadataOnly: true },
    { customIds: ['b'], metadataOnly: undefined },
  );
  assert.deepEqual(merged.customIds, ['b']);
  assert.equal(merged.metadataOnly, false);
});
