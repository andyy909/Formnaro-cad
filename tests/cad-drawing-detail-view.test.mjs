import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DOMParser } from '@xmldom/xmldom';
import {
  addCadDrawingDetailView,
  cadDrawingDefaultDetailCutout,
  cadDrawingDetailProjection,
  cadDrawingDimension,
  cadDrawingProblems,
  cadDrawingViewFrame,
  cadDrawingViewScale,
  createCadDrawingSheet,
  validateCadDrawingSheet,
} from '../src/cad-drawing-data.js';
import { cadDrawingAnnotationGeometry, cadDrawingSvg, cadDrawingDxf } from '../src/cad-drawing-export.js';
import {
  cadProjectStoredVersion,
  createCadProject,
  DRAWING_DETAIL_PROJECT_VERSION,
  parseCadProject,
  serializeCadProject,
} from '../src/cad-project.js';

const { drawingPdfInput } = createRequire(import.meta.url)('../backend/drawing-pdf.cjs');
const signature = 'a'.repeat(64),
  near = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const reference = (role) => ({ source: { rootId: 'body', path: ['child'] }, role });
const boreReference = reference('drill.bore.entry'),
  edgeReference = reference('box.edge.x.y');
const frontProjection = () => ({
  kind: 'cad-drawing-projection',
  view: 'front',
  frame: cadDrawingViewFrame('front'),
  curves: [
    { id: 'hole', kind: 'circle', hidden: false, center: [5, 5], radius: 3, sourceReferences: [boreReference] },
    { id: 'cut-line', kind: 'line', hidden: false, a: [-10, 5], b: [20, 5], sourceReferences: [edgeReference] },
    { id: 'outside', kind: 'line', hidden: false, a: [-10, 40], b: [20, 40] },
  ],
  bounds: { min: [-10, -5], max: [20, 15] },
  sourceSignatures: [{ id: 'body', signature }],
  tolerance: 1e-7,
  approximation: 'exact-native-curves',
});
function fixture() {
  const sheet = createCadDrawingSheet({ id: 'sheet', sourceIds: ['body'], scale: 1 }),
    detailSheet = structuredClone(sheet);
  detailSheet.views = [
    {
      id: 'front',
      kind: 'front',
      sourceIds: ['body'],
      position: [65, 100],
      projection: frontProjection(),
    },
  ];
  const withDetail = addCadDrawingDetailView(
    detailSheet,
    'front',
    { center: [5, 5], radius: 10 },
    { id: 'detail', scale: 2, position: [200, 100] },
  );
  const detail = withDetail.views.find((view) => view.kind === 'detail'),
    circle = detail.projection.curves.find((curve) => curve.kind === 'circle');
  withDetail.annotations = [
    {
      id: 'diameter',
      kind: 'diameter',
      viewId: detail.id,
      curveIds: [circle.id],
      sourceSignatures: [{ id: 'body', signature }],
      curveReferences: [{ sourceReferences: structuredClone(circle.sourceReferences) }],
      position: [200, 130],
    },
  ];
  return { sheet: withDetail, detail, circle };
}
function detailSvg(sheet) {
  const svg = cadDrawingSvg(sheet, { interactive: true }),
    document = new DOMParser({ onError: (error) => { throw Error(error); } }).parseFromString(svg, 'image/svg+xml'),
    groups = Array.from(document.getElementsByTagName('g')),
    group = groups.find((element) => element.getAttribute('data-drawing-view') === 'detail');
  assert.ok(group, 'detail view group');
  const transform = group.getAttribute('transform'),
    scale = Number(transform.match(/scale\(([-\d.]+) [-\d.]+\)/)[1]),
    circles = Array.from(group.getElementsByTagName('circle'));
  return { svg, transform, scale, circles };
}
function dxf(text) {
  const lines = text.trimEnd().split(/\r?\n/),
    pairs = [];
  assert.equal(lines.length % 2, 0);
  for (let i = 0; i < lines.length; i += 2) pairs.push([Number(lines[i]), lines[i + 1]]);
  const start = pairs.findIndex(
      (pair, index) => pair[0] === 2 && pair[1] === 'ENTITIES' && pairs[index - 1][1] === 'SECTION',
    ),
    entities = [];
  let current;
  for (const [code, value] of pairs.slice(start + 1)) {
    if (code === 0) {
      if (value === 'ENDSEC') break;
      current = { type: value, pairs: [] };
      entities.push(current);
    } else current?.pairs.push([code, value]);
  }
  return entities;
}
const get = (entity, code) => entity.pairs.find((pair) => pair[0] === code)?.[1];

test('Z05-01/03: a detail references its parent view and cutout and prints a Ø6 bore at 12 mm paper while its text stays Ø6', () => {
  const { sheet, detail, circle } = fixture();
  assert.equal(detail.kind, 'detail');
  assert.equal(detail.cutout.sourceViewId, 'front');
  assert.deepEqual(detail.cutout.center, [5, 5]);
  assert.equal(detail.cutout.radius, 10);
  assert.equal(detail.scale, 2);
  assert.equal(cadDrawingViewScale(detail, sheet), 2);
  assert.equal(cadDrawingViewScale(sheet.views[0], sheet), 1);
  assert.equal(circle.radius, 3);
  assert.deepEqual(cadDrawingProblems(sheet), []);
  const { transform, scale, circles } = detailSvg(sheet);
  assert.match(transform, /translate\(200 100\) scale\(2 -2\)/);
  assert.equal(scale, 2);
  const rendered = circles.find((element) => element.getAttribute('r') === '3');
  assert.ok(rendered, 'bore circle rendered from model radius 3');
  near(2 * Number(rendered.getAttribute('r')) * scale, 12);
  const annotation = cadDrawingAnnotationGeometry(sheet, sheet.annotations[0]),
    dim = cadDrawingDimension(sheet, sheet.annotations[0]);
  assert.equal(dim.value, 6);
  assert.equal(dim.text, 'Ø 6 mm');
  assert.doesNotMatch(dim.text, /12/);
  // The diameter leader spans the full paper diameter: 2 * model radius * 2:1.
  near(Math.hypot(...annotation.lines[0][1].map((value, index) => value - annotation.lines[0][0][index])), 12);
  assert.match(cadDrawingSvg(sheet), /Detail A · 2:1/);
});

test('Z05-02: analytic bore circle and cut line are clipped to the cutout and keep their source roles', () => {
  const { sheet, detail } = fixture(),
    line = detail.projection.curves.find((curve) => curve.kind === 'line'),
    borer = detail.projection.curves.find((curve) => curve.kind === 'circle');
  assert.ok(line && borer);
  near(Math.hypot(...line.a), 10);
  near(Math.hypot(...line.b), 10);
  near(line.a[1], 0);
  near(line.b[1], 0);
  assert.deepEqual(line.sourceReferences, [edgeReference]);
  assert.deepEqual(borer.sourceReferences, [boreReference]);
  assert.ok(!detail.projection.curves.some((curve) => curve.id === 'outside'));
  assert.deepEqual(sheet.views[0].projection.curves[1].a, [-10, 5]);
  assert.deepEqual(sheet.views[0].projection.curves[1].b, [20, 5]);
  const derived = cadDrawingDetailProjection(
    sheet.views[0].projection,
    { sourceViewId: 'front', center: [5, 5], radius: 10 },
  );
  assert.equal(derived.approximation, 'detail-clip');
  assert.deepEqual(derived.bounds, { min: [-10, -10], max: [10, 10] });
  const unsupported = frontProjection();
  unsupported.curves.push({
    id: 'spline',
    kind: 'bezier',
    hidden: false,
    poles: [[0, 0], [20, 0], [20, 20]],
    weights: [1, 1, 1],
  });
  assert.throws(
    () => cadDrawingDetailProjection(unsupported, { sourceViewId: 'front', center: [5, 5], radius: 10 }),
    /nicht unterstützte Kurvenart/,
  );
});

test('Z05: an off-axis flange arc stays inside the aperture and a tangent leaves no curve', () => {
  const parent = frontProjection(),
    cutout = { sourceViewId: 'front', center: [31, 12], radius: 10 },
    outline = { id: 'flange-outline', kind: 'circle', center: [0, 0], radius: 40, hidden: false },
    tangent = { id: 'external-tangent', kind: 'circle', center: [18, 12], radius: 3, hidden: false },
    bore = { id: 'bore-in-detail', kind: 'circle', center: [31, 12], radius: 3, hidden: false };
  for (const contour of [outline, {
    ...outline, kind: 'arc', startAngle: -Math.PI / 2, endAngle: Math.PI / 2, clockwise: false,
  }]) {
    const { curves } = cadDrawingDetailProjection({ ...parent, curves: [contour, tangent, bore] }, cutout);
    const [arc, circle] = curves;
    assert.equal(curves.length, 2, 'An isolated tangency is not a curve');
    assert.equal(arc.kind, 'arc');
    assert.equal(arc.radius, 40);
    assert.equal(circle.kind, 'circle');
    assert.equal(circle.radius, 3);
    const endpointRadius = (angle) => Math.hypot(
      arc.center[0] + arc.radius * Math.cos(angle), arc.center[1] + arc.radius * Math.sin(angle),
    );
    near(endpointRadius(arc.startAngle), cutout.radius);
    near(endpointRadius(arc.endAngle), cutout.radius);
    assert.ok(endpointRadius((arc.startAngle + arc.endAngle) / 2) < cutout.radius);
  }
});

test('Z05-04: saving and reopening keeps the 2:1 detail, and moving the parent adds no second scale', () => {
  const { sheet } = fixture(),
    project = createCadProject({ drawings: { version: 1, sheets: [sheet] } });
  assert.equal(cadProjectStoredVersion(project), DRAWING_DETAIL_PROJECT_VERSION);
  assert.equal(project.version, DRAWING_DETAIL_PROJECT_VERSION);
  const parsed = parseCadProject(serializeCadProject(project)),
    reopened = parsed.drawings.sheets[0],
    detail = reopened.views.find((view) => view.kind === 'detail');
  assert.equal(parsed.version, 38);
  assert.equal(detail.scale, 2);
  assert.deepEqual(detail.cutout, { sourceViewId: 'front', center: [5, 5], radius: 10 });
  reopened.views.find((view) => view.id === 'front').position = [80, 120];
  assert.deepEqual(cadDrawingProblems(reopened), [], 'moving paper is not a stale projection');
  const { scale, circles } = detailSvg(reopened),
    rendered = circles.find((element) => element.getAttribute('r') === '3');
  assert.equal(scale, 2);
  near(2 * Number(rendered.getAttribute('r')) * scale, 12);
  near(cadDrawingViewScale(detail, reopened), 2);
});

test('Z05-05: SVG/PDF use paper millimetres (12 mm) while DXF keeps the 6 mm model geometry', () => {
  const { sheet } = fixture(),
    svg = cadDrawingSvg(sheet),
    document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  assert.equal(document.documentElement.getAttribute('width'), '297mm');
  assert.equal(document.documentElement.getAttribute('height'), '210mm');
  assert.doesNotThrow(() => drawingPdfInput({ svg, widthMm: 297, heightMm: 210 }));
  const entities = dxf(cadDrawingDxf(sheet)),
    detailCircles = entities.filter((entity) => entity.type === 'CIRCLE' && get(entity, 8) === 'VIEW_2'),
    annotations = entities.filter((entity) => entity.type === 'TEXT' && get(entity, 8) === 'ANNOTATIONS'),
    labels = entities.filter((entity) => entity.type === 'TEXT');
  assert.equal(detailCircles.length, 1);
  near(Number(get(detailCircles[0], 40)), 3);
  near(2 * Number(get(detailCircles[0], 40)), 6);
  assert.ok(annotations.some((entity) => get(entity, 1) === '\\U+00D8 6 mm'));
  assert.ok(labels.some((entity) => get(entity, 1) === 'Detail A 2:1'));
});

test('Z05-06: a missing parent or invalid cutout is visibly invalid and blocks SVG/DXF export', () => {
  const { sheet } = fixture(),
    missing = structuredClone(sheet);
  missing.views = missing.views.filter((view) => view.id !== 'front');
  assert.doesNotThrow(() => validateCadDrawingSheet(missing));
  assert.ok(cadDrawingProblems(missing).some((problem) => problem.code === 'DETAIL_SOURCE_MISSING'));
  assert.throws(() => cadDrawingSvg(missing), (error) => error.code === 'CAD_DRAWING_UPDATE_REQUIRED');
  assert.throws(() => cadDrawingDxf(missing), (error) => error.code === 'CAD_DRAWING_UPDATE_REQUIRED');
  assert.doesNotThrow(() => cadDrawingSvg(missing, { allowStale: true, interactive: true }));

  const invalid = structuredClone(sheet);
  invalid.views.find((view) => view.kind === 'detail').cutout.radius = 0;
  assert.doesNotThrow(() => validateCadDrawingSheet(invalid));
  assert.ok(cadDrawingProblems(invalid).some((problem) => problem.code === 'INVALID_DETAIL_CUTOUT'));
  assert.throws(() => cadDrawingSvg(invalid), /Radius größer als 0/);
  assert.throws(() => cadDrawingDxf(invalid), /Radius größer als 0/);
  assert.throws(
    () => addCadDrawingDetailView(sheet, 'front', { center: [5, 5], radius: 0 }, { id: 'invalid' }),
    /Radius größer als 0/,
  );
});

test('Z05-06: detail projects require format 38 while older drawing files stay readable', () => {
  const { sheet } = fixture(),
    detailProject = createCadProject({ drawings: { version: 1, sheets: [sheet] } }),
    serialized = JSON.parse(serializeCadProject(detailProject));
  serialized.version = 37;
  assert.throws(() => parseCadProject(JSON.stringify(serialized)), /Projektformat 38/);

  const plain = createCadDrawingSheet({ id: 'plain', sourceIds: ['body'] });
  plain.views = [
    {
      id: 'front',
      kind: 'front',
      sourceIds: ['body'],
      position: [65, 100],
      projection: frontProjection(),
    },
  ];
  const legacyProject = createCadProject({ drawings: { version: 1, sheets: [plain] } });
  assert.ok(cadProjectStoredVersion(legacyProject) < DRAWING_DETAIL_PROJECT_VERSION);
  const reopened = parseCadProject(serializeCadProject(legacyProject));
  assert.equal(reopened.drawings.sheets[0].views[0].id, 'front');
  assert.equal(reopened.drawings.sheets[0].views[0].scale, undefined);
});

test('first detail cutout finds a corner hole when the view centre has no edge', () => {
  const holes = [
    [10, 10],
    [90, 10],
    [10, 50],
    [90, 50],
  ].map((center, i) => ({ id: 'hole-' + i, kind: 'circle', hidden: false, center, radius: 3 }));
  const plate = {
    ...frontProjection(),
    curves: [
      { id: 'bottom', kind: 'line', hidden: false, a: [0, 0], b: [100, 0] },
      { id: 'right', kind: 'line', hidden: false, a: [100, 0], b: [100, 60] },
      { id: 'top', kind: 'line', hidden: false, a: [100, 60], b: [0, 60] },
      { id: 'left', kind: 'line', hidden: false, a: [0, 60], b: [0, 0] },
      ...holes,
    ],
    bounds: { min: [0, 0], max: [100, 60] },
  };
  assert.throws(
    () => cadDrawingDetailProjection(plate, { sourceViewId: 'front', center: [50, 30], radius: 20 }),
    /keine darstellbaren Kurven/,
  );
  const cutout = cadDrawingDefaultDetailCutout(plate, 'front');
  near(cutout.radius, 20);
  assert.ok(holes.some((hole) => hole.center[0] === cutout.center[0] && hole.center[1] === cutout.center[1]));
  const detail = cadDrawingDetailProjection(plate, cutout);
  assert.ok(detail.curves.some((curve) => curve.kind === 'circle' && curve.radius === 3));
});

test('first detail cutout keeps the view centre when it shows curves', () => {
  const cutout = cadDrawingDefaultDetailCutout(frontProjection(), 'front');
  assert.deepEqual(cutout.center, [5, 5]);
  near(cutout.radius, 20 / 3);
});

test('first detail cutout rejects a degenerate source view', () => {
  const flat = { ...frontProjection(), bounds: { min: [0, 0], max: [10, 0] } };
  assert.throws(() => cadDrawingDefaultDetailCutout(flat, 'front'), /zu klein/);
});

test('first detail cutout lands on an arc even when its 0° point is not part of it', () => {
  const arcOnly = {
    ...frontProjection(),
    curves: [{ id: 'arc', kind: 'arc', hidden: false, center: [0, 0], radius: 50, startAngle: Math.PI, endAngle: 1.5 * Math.PI, clockwise: false }],
    bounds: { min: [-50, -50], max: [50, 50] },
  };
  const cutout = cadDrawingDefaultDetailCutout(arcOnly, 'front');
  near(cutout.center[0], -50, 1e-9);
  near(cutout.center[1], 0, 1e-9);
  assert.ok(cadDrawingDetailProjection(arcOnly, cutout).curves.length > 0);
});
