const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const helper = require('../backend/practice-drawing-verification.cjs');
const mainSource = fs.readFileSync(path.join(__dirname, '..', 'backend', 'practice-verification.cjs'), 'utf8');
const helperSource = fs.readFileSync(
  path.join(__dirname, '..', 'backend', 'practice-drawing-verification.cjs'),
  'utf8',
);

// Use an explicit local directory for fixture artifacts.
const TEMP_ROOT = path.join(__dirname, '..', 'work', 'tmp', 'temp');
fs.mkdirSync(TEMP_ROOT, { recursive: true });

const ROOT = 'practice-drawing-root-1';
const PARENT_SNAPSHOT = 'PARENT_SNAPSHOT';
const DRAWING_SIZE = [20, 26, 32];
const CREATE_PROMPT =
  'Erstelle im Übungsfenster eine bearbeitbare technische Zeichnung des ausgewählten Halters mit Vorder-, Drauf- und Seitenansicht und den drei Außenmaßen. Der Titel soll „Übung Zeichnungsblatt“ sein. Speichere das Blatt im Übungsprojekt.';
const UPDATE_PROMPT =
  'Zeig mir im Übungsfenster, wie ich die X-Breite des ausgewählten Halters auf 44 mm ändere und das vorhandene Zeichnungsblatt nachführe. Aktualisiere das bestehende Blatt mit seinen verknüpften Maßen und speichere es. Erhalte die übrigen Maße und Blattangaben.';
const INITIAL_DIMENSIONS = [
  { id: 'dim-width', text: '20 mm', status: 'ok' },
  { id: 'dim-depth', text: '26 mm', status: 'ok' },
  { id: 'dim-height', text: '32 mm', status: 'ok' },
];
const UPDATED_DIMENSIONS = [
  { id: 'dim-width', text: '44 mm', status: 'ok' },
  { id: 'dim-depth', text: '26 mm', status: 'ok' },
  { id: 'dim-height', text: '32 mm', status: 'ok' },
];
const EDIT_CHECK = 'The same dimension ID follows a source edit from 20 to 44 mm, with all references intact';
const CREATE_CHECK = 'Visible controls create an editable sheet with three native projections and linked dimensions';
const NATIVE_CHECK = 'Native projection and main-window state independently verified';

function temporary(t, prefix) {
  const root = fs.mkdtempSync(path.join(TEMP_ROOT, prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function snapshot() {
  return {
    serialized: JSON.stringify({ version: 1, nodes: [{ id: ROOT, kind: 'cad', size: [20, 26, 32] }] }),
    state: { undo: 4, redo: 0, previews: 2, revision: 7 },
    selection: [{ rootId: ROOT, path: [] }],
    previewId: 'preview-parent-7',
    visiblePreviewRoots: [{ id: 'preview-node-1', geometry: 'geometry-1', root: null }],
  };
}

// The live update path reads its starting dimensions from a real sheet fixture.
// cadDrawingDimension must therefore resolve three genuine length references.
function originalSheetFixture() {
  const specs = [
    { kind: 'front', viewId: 'view-front-live-1', curveId: 'curve-front-live-1', length: 20, dimensionId: 'dim-width' },
    { kind: 'top', viewId: 'view-top-live-1', curveId: 'curve-top-live-1', length: 26, dimensionId: 'dim-depth' },
    { kind: 'side', viewId: 'view-side-live-1', curveId: 'curve-side-live-1', length: 32, dimensionId: 'dim-height' },
  ];
  const sheet = {
    id: 'sheet-live-1',
    name: 'Übung Zeichnungsblatt',
    paper: 'A3',
    orientation: 'portrait',
    scale: 2,
    titleBlock: {
      title: 'Übung Zeichnungsblatt',
      number: 'Z-1',
      revision: 'A',
      author: 'Prüfung',
      date: '2026-11-17',
    },
    views: [],
    annotations: [],
  };
  for (const spec of specs) {
    sheet.views.push({
      id: spec.viewId,
      kind: spec.kind,
      sourceIds: [ROOT],
      position: [0, 0],
      projection: {
        kind: 'cad-drawing-projection',
        view: spec.kind,
        frame: new Array(16).fill(0),
        curves: [{ id: spec.curveId, kind: 'line', hidden: false, a: [0, 0], b: [spec.length, 0] }],
        bounds: { min: [0, 0], max: [spec.length, spec.kind === 'side' ? 32 : 26] },
        sourceSignatures: [],
        tolerance: 0.001,
        approximation: 'fixture',
      },
    });
    sheet.annotations.push({
      id: spec.dimensionId,
      kind: 'length',
      viewId: spec.viewId,
      curveIds: [spec.curveId],
      position: [spec.length / 2, -5],
    });
  }
  return sheet;
}

function sheetMetaOf(sheet) {
  return {
    id: sheet.id,
    name: sheet.name,
    paper: sheet.paper,
    orientation: sheet.orientation,
    scale: sheet.scale,
    titleBlock: sheet.titleBlock,
  };
}

function viewIdsOf(sheet) {
  return Object.fromEntries(sheet.views.map((view) => [view.kind, view.id]));
}

function projectFixture({ width, sheetMeta, viewIds }) {
  const meta = sheetMeta ?? {
    id: 'sheet-local-1',
    name: 'Zeichnungsblatt',
    paper: 'A4',
    orientation: 'landscape',
    scale: 1,
    titleBlock: { title: 'Übung Zeichnungsblatt', number: '', revision: '', author: '', date: '' },
  };
  const ids = viewIds ?? { front: 'view-front-1', top: 'view-top-1', side: 'view-side-1' };
  const sizes = { front: [width, 32], top: [width, 26], side: [26, 32] };
  const sheet = {
    ...meta,
    views: ['front', 'top', 'side'].map((kind) => ({
      id: ids[kind],
      kind,
      sourceIds: [ROOT],
      position: [0, 0],
      projection: { curves: [{ id: 'curve-' + kind }], bounds: { min: [0, 0], max: sizes[kind] } },
    })),
    annotations: [],
  };
  return { nodes: [{ id: ROOT, kind: 'cad', size: [width, 26, 32] }], drawings: { version: 1, sheets: [sheet] } };
}

function createHarness({ variant, before, mutate = {} }) {
  const live = variant !== '1';
  const creating = variant === 'create-live';
  const events = [];
  const scripts = [];
  const parentSnapshots = [];
  const liveCalls = [];
  const originalSheet = originalSheetFixture();
  let parentCalls = 0;

  const changedParent = () => {
    const next = clone(before);
    next.state = { ...next.state, undo: next.state.undo + 1, revision: next.state.revision + 1 };
    next.serialized = JSON.stringify({
      ...JSON.parse(before.serialized),
      drawings: { version: 1, sheets: [originalSheet] },
    });
    return next;
  };
  const expectedParent = live && !creating ? changedParent() : clone(before);
  const afterParent = () => {
    const next = clone(expectedParent);
    if (mutate.parent === 'revision') next.state.revision += 1;
    else if (mutate.parent === 'serialized') next.serialized += ' ';
    return next;
  };

  const width = creating ? DRAWING_SIZE[0] : 44;
  const project =
    variant === 'update-live'
      ? projectFixture({ width, sheetMeta: sheetMetaOf(originalSheet), viewIds: viewIdsOf(originalSheet) })
      : projectFixture({ width });
  const native = { objects: [{ id: ROOT, worldBounds: { size: [width, 26, 32] } }] };

  const initialDrawing = {
    views: ['front', 'top', 'side'],
    annotationCount: 3,
    dimensions: clone(mutate.initialDimensions ?? INITIAL_DIMENSIONS),
  };
  const updatedDrawing = {
    views: ['front', 'top', 'side'],
    annotationCount: 3,
    dimensions: clone(mutate.updatedDimensions ?? UPDATED_DIMENSIONS),
  };
  const failure = { ok: false, reason: mutate.reason ?? 'The child rejected the drawing steps.' };
  const localResult =
    mutate.ok === false
      ? failure
      : {
          ok: true,
          resultRef: 'drawing-result-local-1',
          steps: [
            { kind: 'ui', action: 'point', target: 'view:fit' },
            { kind: 'drawing-apply', drawing: initialDrawing },
            { kind: 'drawing-apply', drawing: updatedDrawing },
          ],
        };
  const createResult =
    mutate.ok === false
      ? failure
      : {
          ok: true,
          resultRef: 'drawing-result-create-1',
          attempts: [
            {
              steps: [
                { kind: 'ui', action: 'point', target: 'view:fit' },
                { kind: 'drawing-apply', drawing: initialDrawing },
              ],
            },
          ],
        };
  const updateResult =
    mutate.ok === false
      ? failure
      : {
          ok: true,
          resultRef: 'drawing-result-update-1',
          attempts: [{ steps: [{ kind: 'drawing-apply', drawing: updatedDrawing }] }],
        };
  const expectedResult =
    mutate.ok === false ? failure : variant === '1' ? localResult : creating ? createResult : updateResult;
  const resultRef =
    variant === '1' ? 'drawing-result-local-1' : creating ? 'drawing-result-create-1' : 'drawing-result-update-1';

  const js = async (script) => {
    scripts.push(script);
    if (script === PARENT_SNAPSHOT) {
      parentCalls += 1;
      events.push('parentSnapshot');
      const value = live && !creating && parentCalls === 1 ? clone(expectedParent) : afterParent();
      parentSnapshots.push(clone(value));
      return value;
    }
    if (script.includes('startPractice')) {
      events.push('startPractice');
      assert.equal(variant, '1', 'the local startPractice program belongs to variant 1');
      assert(script.includes('projectCopy'), 'the embedded program carries the project copy');
      assert(
        script.includes('"title":"Zeichnungsblatt erstellen und nachführen"'),
        'the embedded program carries the drawing plan',
      );
      assert(script.includes('"value":"Übung Zeichnungsblatt"'), 'the embedded plan sets the title block');
      assert(script.includes('"targets":["existing-1"]'), 'the embedded plan edits the copied body');
      return clone(localResult);
    }
    if (script.includes('drawingUI.open')) {
      events.push('originalSheet');
      assert.equal(variant, 'update-live', 'only the update variant prepares an original sheet');
      assert(script.includes('drawingUI.automatic'), 'the original sheet is prepared through the visible drawing UI');
      return clone(originalSheet);
    }
    if (script.includes('practiceProjectResult')) {
      events.push('project');
      assert(script.includes(resultRef), 'the helper reads the child result through the returned reference');
      return clone(project);
    }
    if (script.includes('controller.describe(')) {
      events.push('describe');
      return clone(native);
    }
    throw Error('Unexpected renderer program in the local drawing fixture: ' + script);
  };

  const livePractice = async (prompt, files, options) => {
    events.push('live');
    liveCalls.push({ prompt, files, options });
    if (!live) throw Error('livePractice must not run for the local drawing variant');
    assert.equal(files, undefined, 'the drawing live adapter receives no files');
    assert.equal(options, undefined, 'the drawing live adapter receives no options');
    if (creating) {
      assert.equal(prompt, CREATE_PROMPT, 'the exact creation prompt is requested');
      return clone(createResult);
    }
    assert.equal(variant, 'update-live');
    assert.equal(prompt, UPDATE_PROMPT, 'the exact follow-up prompt is requested');
    return clone(updateResult);
  };

  return {
    js,
    livePractice,
    events,
    scripts,
    parentSnapshots,
    liveCalls,
    originalSheet,
    expectedParent,
    expectedResult,
    project,
  };
}

async function runFixture(t, variant, mutate = {}) {
  const directory = temporary(t, 'formnaro-drawing-' + variant + '-');
  const before = snapshot();
  const checks = [];
  const harness = createHarness({ variant, before, mutate });
  const hostFetch = global.fetch;
  let guardCalls = 0;
  const guard = async () => {
    guardCalls += 1;
    throw Error('No cloud calls allowed during drawing verification.');
  };
  global.fetch = guard;
  let result;
  let error;
  let fetchAfter;
  try {
    try {
      result = await helper.verifyPracticeDrawing({
        js: harness.js,
        directory,
        checks,
        before,
        parentSnapshot: PARENT_SNAPSHOT,
        drawingSize: DRAWING_SIZE,
        variant,
        livePractice: harness.livePractice,
      });
    } catch (caught) {
      error = caught;
    }
  } finally {
    fetchAfter = global.fetch;
    global.fetch = hostFetch;
  }
  return {
    directory,
    before,
    checks,
    harness,
    result,
    error,
    fetch: { hostFetch, guard, fetchAfter, guardCalls, restored: global.fetch },
  };
}

function assertNoCloud(run) {
  assert.equal(run.fetch.guardCalls, 0, 'the drawing helper must not attempt a network call');
  assert.equal(run.fetch.fetchAfter, run.fetch.guard, 'the run leaves the installed fetch function untouched');
  assert.equal(run.fetch.restored, run.fetch.hostFetch, 'the previous fetch function is restored exactly');
  assert.equal(String(run.fetch.restored), String(run.fetch.hostFetch));
}

function assertRendererPrograms(run) {
  assert(run.harness.scripts.length > 0);
  for (const script of run.harness.scripts) {
    if (script === PARENT_SNAPSHOT) continue;
    assert.doesNotThrow(() => new vm.Script(script), 'the embedded renderer program compiles');
  }
}

function assertDrawingSteps(run) {
  const file = path.join(run.directory, 'drawing-steps.json');
  assert(fs.existsSync(file), 'drawing-steps.json is written before the result check');
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), run.harness.expectedResult);
}

test('The extracted drawing helper exports exactly the one-argument entry point and imports only node builtins', () => {
  assert.deepEqual(Object.keys(helper), ['verifyPracticeDrawing']);
  assert.equal(typeof helper.verifyPracticeDrawing, 'function');
  assert.equal(helper.verifyPracticeDrawing.length, 1);
  assert(
    helperSource.includes(
      'async function verifyPracticeDrawing({js,directory,checks,before,parentSnapshot,drawingSize,variant:drawingVariant,livePractice}){',
    ),
  );
  assert.equal(helperSource.includes('process.env'), false, 'the helper takes the effective variant as an argument');
  assert.deepEqual(
    [...helperSource.matchAll(/require\((['"])([^'"]+)\1\)/g)].map((match) => match[2]),
    ['node:fs', 'node:path', 'node:assert/strict'],
  );
  assert.equal((helperSource.match(/require\(/g) || []).length, 3);
  assert(helperSource.includes('module.exports={verifyPracticeDrawing};'));
});

test('The dispatcher keeps the drawing gate, delegates exactly once and retains the shared prelude', () => {
  assert(mainSource.includes('if(drawingCase){'));
  const delegation =
    "return require('./practice-drawing-verification.cjs').verifyPracticeDrawing({js,directory,checks,before,parentSnapshot,drawingSize,variant:drawingVariant,livePractice});";
  assert(mainSource.includes(delegation));
  assert.equal(mainSource.split("require('./practice-drawing-verification.cjs').verifyPracticeDrawing(").length - 1, 1);
  assert.equal(
    mainSource.split(
      'verifyPracticeDrawing({js,directory,checks,before,parentSnapshot,drawingSize,variant:drawingVariant,livePractice})',
    ).length - 1,
    1,
  );
  for (const marker of [
    'const drawingVariant=process.env.FORMNARO_VERIFY_PRACTICE_DRAWING;',
    "const drawingCase=['1','create-live','update-live'].includes(drawingVariant);",
    'const drawingSize=[20,26,32];',
    'const parentSnapshot=',
    'const before=await js(parentSnapshot);',
    'const livePractice=(prompt,files,options)=>',
  ])
    assert(mainSource.includes(marker), 'the dispatcher retains the shared prelude: ' + marker);

  const lines = mainSource.replace(/\r\n/g, '\n').split('\n');
  const delegationLine = lines.findIndex((line) =>
    line.includes("require('./practice-drawing-verification.cjs').verifyPracticeDrawing({"),
  );
  assert(delegationLine >= 0);
  assert.equal(lines[delegationLine + 1].trim(), '}', 'the drawing gate closes after the delegation');
  assert.equal(
    lines[delegationLine + 2].trim(),
    "if(['draft','draft-edit'].includes(process.env.FORMNARO_VERIFY_PRACTICE_SKETCH)){",
    'the sketch branch follows the drawing gate immediately',
  );

  for (const marker of [
    'drawing-steps.json',
    'cadDrawingDimension',
    'Übung Zeichnungsblatt',
    'drawing-title-block',
    'drawing-auto',
    'Erstelle im Übungsfenster',
    'X-Breite des ausgewählten Halters',
    'drawingUI.automatic',
  ]) {
    assert.equal(mainSource.includes(marker), false, 'the dispatcher no longer owns: ' + marker);
    assert(helperSource.includes(marker), 'the extracted helper owns: ' + marker);
  }
});

test('The portable package filter drops the extracted drawing verification module', async (t) => {
  const root = temporary(t, 'formnaro-drawing-portable-');
  const source = path.join(root, 'source');
  const stage = path.join(root, 'stage');
  for (const directory of ['backend', 'ai', 'licenses', 'dist'])
    fs.mkdirSync(path.join(source, directory), { recursive: true });
  for (const file of [
    'electron.cjs',
    'preload.cjs',
    'package.json',
    'LICENSE.txt',
    'LIES-MICH.txt',
    'THIRD-PARTY-LICENSES.txt',
  ])
    fs.writeFileSync(path.join(source, file), '');
  for (const name of [
    'practice-verification.cjs',
    'practice-drawing-verification.cjs',
    'practice-runner.cjs',
    'practice-files.cjs',
  ])
    fs.writeFileSync(path.join(source, 'backend', name), name);
  for (const suite of ['benchmark-core-v1.json', 'benchmark-advanced-v2.json'])
    fs.writeFileSync(path.join(source, 'ai', suite), JSON.stringify({ dependencies: [] }));
  const { copyPortableApp } = await import('../scripts/portable-runtime-policy.mjs');
  copyPortableApp(source, stage);
  assert.deepEqual(fs.readdirSync(path.join(stage, 'backend')).sort(), ['practice-files.cjs', 'practice-runner.cjs']);
  assert.equal(fs.existsSync(path.join(stage, 'backend', 'practice-drawing-verification.cjs')), false);
});

test('Local variant 1 drives the real helper through two persisted child drawing steps', async (t) => {
  const run = await runFixture(t, '1');
  assert.equal(run.error, undefined, run.error && run.error.message);
  assertNoCloud(run);
  assert.deepEqual(run.harness.events, ['startPractice', 'project', 'describe', 'parentSnapshot']);
  assert.deepEqual(run.harness.liveCalls, []);
  assertRendererPrograms(run);

  const startScript = run.harness.scripts.find((script) => script.includes('startPractice'));
  assert(startScript, 'the embedded startPractice program was supplied to the harness');
  assert(startScript.includes('projectCopy'));
  assert(startScript.includes('"title":"Zeichnungsblatt erstellen und nachführen"'));
  assert.doesNotThrow(() => new vm.Script(startScript));

  const result = run.result;
  assert.deepEqual(Object.keys(result).sort(), [
    'checks',
    'initial',
    'nativeSize',
    'ok',
    'projectedSizes',
    'updated',
    'variant',
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.variant, '1');
  assert.equal(result.checks, run.checks);
  assert.deepEqual(result.checks, [EDIT_CHECK, NATIVE_CHECK]);
  assert.deepEqual(result.initial, {
    views: ['front', 'top', 'side'],
    annotationCount: 3,
    dimensions: INITIAL_DIMENSIONS,
  });
  assert.deepEqual(result.updated, {
    views: ['front', 'top', 'side'],
    annotationCount: 3,
    dimensions: UPDATED_DIMENSIONS,
  });
  assert.notEqual(result.initial, result.updated);
  assert.deepEqual(result.nativeSize, [44, 26, 32]);
  assert.deepEqual(result.projectedSizes, { front: [44, 32], top: [44, 26], side: [26, 32] });
  assertDrawingSteps(run);

  assert.equal(run.harness.parentSnapshots.length, 1);
  assert.deepEqual(run.harness.parentSnapshots[0], run.before, 'the parent state stays unchanged');
});

test('Create-live passes the exact creation prompt and reads the child drawings from attempts', async (t) => {
  const run = await runFixture(t, 'create-live');
  assert.equal(run.error, undefined, run.error && run.error.message);
  assertNoCloud(run);
  assert.deepEqual(run.harness.events, ['live', 'project', 'describe', 'parentSnapshot']);
  assert.equal(run.harness.parentSnapshots.length, 1, 'no second parent snapshot is taken before the live call');
  assert.deepEqual(run.harness.parentSnapshots[0], run.before, 'expectedParent remains the supplied before state');
  assert.equal(run.harness.liveCalls.length, 1);
  assert.equal(run.harness.liveCalls[0].prompt, CREATE_PROMPT);
  assertRendererPrograms(run);

  const result = run.result;
  assert.equal(result.ok, true);
  assert.equal(result.variant, 'create-live');
  assert.equal(result.checks, run.checks);
  assert.deepEqual(result.checks, [CREATE_CHECK, NATIVE_CHECK]);
  assert.equal(result.updated, result.initial, 'the created sheet is both the initial and the updated evidence');
  assert.deepEqual(result.initial, {
    views: ['front', 'top', 'side'],
    annotationCount: 3,
    dimensions: INITIAL_DIMENSIONS,
  });
  assert.deepEqual(result.nativeSize, [20, 26, 32]);
  assert.deepEqual(result.projectedSizes, { front: [20, 32], top: [20, 26], side: [26, 32] });
  assertDrawingSteps(run);

  assert.deepEqual(run.harness.parentSnapshots[0], run.before);
});

test('Update-live follows the dimension IDs of the prepared original sheet and protects the changed parent', async (t) => {
  const run = await runFixture(t, 'update-live');
  assert.equal(run.error, undefined, run.error && run.error.message);
  assertNoCloud(run);
  assert.deepEqual(run.harness.events, [
    'originalSheet',
    'parentSnapshot',
    'live',
    'project',
    'describe',
    'parentSnapshot',
  ]);
  assert.equal(run.harness.parentSnapshots.length, 2);
  assert.notDeepEqual(run.harness.parentSnapshots[0], run.before, 'the update parent differs from the initial parent');
  assert.deepEqual(run.harness.parentSnapshots[0], run.harness.expectedParent);
  assert.deepEqual(
    run.harness.parentSnapshots[1],
    run.harness.expectedParent,
    'the prepared parent survives the live run',
  );
  assert.equal(run.harness.liveCalls.length, 1);
  assert.equal(run.harness.liveCalls[0].prompt, UPDATE_PROMPT);
  assertRendererPrograms(run);

  const { cadDrawingDimension } = await import('../src/cad-drawing-data.js');
  const originalSheet = run.harness.originalSheet;
  const originalDimensions = originalSheet.annotations.map((annotation) => ({
    id: annotation.id,
    text: cadDrawingDimension(originalSheet, annotation).text,
  }));
  assert.deepEqual(originalDimensions, [
    { id: 'dim-width', text: '20 mm' },
    { id: 'dim-depth', text: '26 mm' },
    { id: 'dim-height', text: '32 mm' },
  ]);

  const { project } = run.harness;
  const sheet = project.drawings.sheets[0];
  for (const key of ['id', 'name', 'paper', 'orientation', 'scale', 'titleBlock'])
    assert.deepEqual(sheet[key], originalSheet[key], 'the sheet keeps its ' + key);
  assert.deepEqual(
    sheet.views.map((view) => view.id),
    originalSheet.views.map((view) => view.id),
    'the sheet keeps its view IDs',
  );

  const result = run.result;
  assert.equal(result.ok, true);
  assert.equal(result.variant, 'update-live');
  assert.equal(result.checks, run.checks);
  assert.deepEqual(result.checks, [EDIT_CHECK, NATIVE_CHECK]);
  assert.deepEqual(result.initial, {
    views: ['front', 'top', 'side'],
    annotationCount: 3,
    dimensions: originalDimensions,
  });
  assert.deepEqual(result.updated, {
    views: ['front', 'top', 'side'],
    annotationCount: 3,
    dimensions: UPDATED_DIMENSIONS,
  });
  assert.deepEqual(result.nativeSize, [44, 26, 32]);
  assert.deepEqual(result.projectedSizes, { front: [44, 32], top: [44, 26], side: [26, 32] });
  assertDrawingSteps(run);
});

for (const variant of ['1', 'create-live', 'update-live']) {
  test(`A rejected child result fails after drawing-steps.json was written (${variant})`, async (t) => {
    const reason = 'Zeichnungsbeleg unvollständig für ' + variant + '.';
    const run = await runFixture(t, variant, { ok: false, reason });
    assert(run.error, 'a rejected child result must fail the helper');
    assert.equal(run.error.code, 'ERR_ASSERTION');
    assert.equal(run.error.message, reason);
    assert.equal(run.result, undefined);
    assertNoCloud(run);
    const file = path.join(run.directory, 'drawing-steps.json');
    assert.equal(fs.existsSync(file), true, 'drawing-steps.json is written before assert(result.ok)');
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), run.harness.expectedResult);
  });
}

test('A swapped dimension identity is rejected instead of silently passing', async (t) => {
  const run = await runFixture(t, '1', {
    updatedDimensions: [
      { id: 'dim-depth', text: '44 mm', status: 'ok' },
      { id: 'dim-width', text: '26 mm', status: 'ok' },
      { id: 'dim-height', text: '32 mm', status: 'ok' },
    ],
  });
  assert(run.error, 'the wrong dimension identity must fail');
  assert.equal(run.error.code, 'ERR_ASSERTION');
  assert.match(run.error.message, /Only the persisted width dimension changes after the source edit/);
  assertNoCloud(run);
});

test('A wrong dimension text in the update evidence is rejected instead of silently passing', async (t) => {
  const run = await runFixture(t, 'update-live', {
    updatedDimensions: [
      { id: 'dim-width', text: '43 mm', status: 'ok' },
      { id: 'dim-depth', text: '26 mm', status: 'ok' },
      { id: 'dim-height', text: '32 mm', status: 'ok' },
    ],
  });
  assert(run.error, 'the wrong dimension text must fail');
  assert.equal(run.error.code, 'ERR_ASSERTION');
  assert.match(run.error.message, /Only the persisted width dimension changes after the source edit/);
  assertNoCloud(run);
});

test('A changed parent serialization during the local run is rejected', async (t) => {
  const run = await runFixture(t, '1', { parent: 'serialized' });
  assert(run.error, 'a changed parent serialization must fail');
  assert.equal(run.error.code, 'ERR_ASSERTION');
  assert.match(run.error.message, /Expected values to be strictly equal/);
  assertNoCloud(run);
});

test('A changed parent revision during the update run is rejected', async (t) => {
  const run = await runFixture(t, 'update-live', { parent: 'revision' });
  assert(run.error, 'a changed parent revision must fail');
  assert.equal(run.error.code, 'ERR_ASSERTION');
  assert.match(run.error.message, /revision/);
  assertNoCloud(run);
});
