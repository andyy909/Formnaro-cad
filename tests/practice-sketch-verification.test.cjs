const test = require('node:test');
const { writeEmptyBenchmarkManifests } = require('./fixtures/portable-benchmark-manifests.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const helper = require('../backend/practice-sketch-verification.cjs');
const mainSource = fs.readFileSync(path.join(__dirname, '..', 'backend', 'practice-verification.cjs'), 'utf8');
const helperSource = fs.readFileSync(path.join(__dirname, '..', 'backend', 'practice-sketch-verification.cjs'), 'utf8');

// Use an explicit local directory for fixture artifacts.
const TEMP_ROOT = path.join(__dirname, '..', 'work', 'tmp', 'temp');
fs.mkdirSync(TEMP_ROOT, { recursive: true });

const ROOT = 'parent-body-1';
const SKETCH_ROOT = 'sketch-root-1';
const OPEN_PATH = 'M 0 0 L 60 0 M 60 -40 L 0 -40 L 0 0';
const PROMPT = 'Hier ist die Kontur noch offen. Zeig mir, wie ich sie schließe.';
const PRELUDE_CHECK = 'Parent practice button prefixes without sending and is disabled while busy';
const MODEL = 'local-sketch-fixture';
const BASE = 'http://127.0.0.1:9197/v1';
const PRIVATE_ELEMENTS = [
  { id: 'draft-front-private', type: 'line', start: ['0', '0'], end: ['breite', '0'] },
  { id: 'draft-back-private', type: 'line', start: ['breite', 'tiefe'], end: ['0', 'tiefe'] },
  { id: 'draft-left-private', type: 'line', start: ['0', 'tiefe'], end: ['0', '0'] },
];
const CHECK_ROWS = [
  PRELUDE_CHECK,
  'The real editor starts an isolated exercise with the existing open draft and only bounded diagnostics reach the provider',
  'The first plan visibly closes the existing gap; the draft and project remain unchanged through review',
  'Explicit acceptance produces one native 12000 mm³ solid and one reversible project step',
];
const DRAFT_ONLY_CHECK =
  'Editing only the original draft blocks acceptance even when the project revision is unchanged';
const EDIT_ONLY_CHECKS = [
  'Discard restores the parent editor without any project or draft change',
  'An unrelated drawing remains byte-identical after explicit source acceptance',
];

function temporary(t, prefix) {
  const root = fs.mkdtempSync(path.join(TEMP_ROOT, prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function draftFixture() {
  return {
    version: 2,
    kind: 'profile',
    dimensions: { height: '5' },
    variables: [
      { name: 'breite', value: '60' },
      { name: 'tiefe', value: '40' },
    ],
    elements: clone(PRIVATE_ELEMENTS),
    loops: [
      {
        id: 'draft-outer-private',
        role: 'outer',
        elements: ['draft-front-private', 'draft-back-private', 'draft-left-private'],
      },
    ],
  };
}

function sketchBodyFixture() {
  return {
    version: 2,
    kind: 'profile',
    dimensions: { height: '5' },
    variables: [
      { name: 'breite', value: '60' },
      { name: 'tiefe', value: '40' },
    ],
    elements: [
      { id: 'draft-front-private', type: 'line', start: ['0', '0'], end: ['breite', '0'] },
      { id: 'draft-right-private', type: 'line', start: ['breite', '0'], end: ['breite', 'tiefe'] },
      { id: 'draft-back-private', type: 'line', start: ['breite', 'tiefe'], end: ['0', 'tiefe'] },
      { id: 'draft-left-private', type: 'line', start: ['0', 'tiefe'], end: ['0', '0'] },
    ],
    loops: [
      {
        id: 'draft-outer-private',
        role: 'outer',
        elements: ['draft-front-private', 'draft-right-private', 'draft-back-private', 'draft-left-private'],
      },
    ],
  };
}

function originalProject(variant) {
  const project = {
    version: 1,
    nodes: [{ id: ROOT, kind: 'cad', recipe: { type: 'box' }, stats: { solids: 1, volume: 1000 } }],
    drawings: { version: 1, sheets: [] },
  };
  if (variant === 'draft-edit')
    project.nodes.push({
      id: SKETCH_ROOT,
      kind: 'cad',
      recipe: { type: 'sketch', sketch: sketchBodyFixture() },
      stats: { solids: 1, volume: 12000 },
    });
  return project;
}

function appliedProject(variant, draft) {
  const project = originalProject(variant);
  const node = {
    id: variant === 'draft-edit' ? SKETCH_ROOT : 'sketch-created-1',
    kind: 'cad',
    recipe: {
      type: 'sketch',
      sketch: {
        version: 2,
        kind: 'profile',
        dimensions: { height: '5' },
        variables: [
          { name: 'breite', value: '60' },
          { name: 'tiefe', value: '40' },
        ],
        elements: [
          { id: 'line-1', type: 'line', start: ['breite', '0'], end: ['breite', 'tiefe'] },
          ...draft.elements.map((element) => ({ ...clone(element), construction: false })),
        ],
        loops: [
          {
            id: 'draft-outer-private',
            role: 'outer',
            elements: ['draft-front-private', 'line-1', 'draft-back-private', 'draft-left-private'],
          },
        ],
      },
    },
    stats: { solids: 1, volume: 12000 },
  };
  if (variant === 'draft-edit') project.nodes[1] = node;
  else project.nodes.push(node);
  return project;
}

function stateOf(project, revision, undo) {
  return { serialized: JSON.stringify(project), revision, undo };
}

// The embedded chat fixture mirrors the provider contract: bounded diagnostics
// only, the exact 40 mm gap, the registered variable target and two counted
// chat responses.
function systemDiagnostic() {
  return [
    'The supplied draft already open in the sketch editor has one gap.',
    '{"gapCount":1,"gaps":[{"role":"outer","from":[60,0],"to":[60,40],"distance":40}]}',
    '{"name":"breite","target":"ui:id:sketch-variable-value-1"}',
  ].join('\n');
}

function createHarness({ variant, draft, fail, mutations = {} }) {
  const editing = variant === 'draft-edit';
  const original = stateOf(originalProject(variant), 7, 4);
  const appliedProjectValue = appliedProject(variant, draft);
  const appliedNode = appliedProjectValue.nodes.find((node) =>
    editing ? node.id === SKETCH_ROOT : node.recipe?.type === 'sketch',
  );
  if (mutations.solids !== undefined) appliedNode.stats.solids = mutations.solids;
  if (mutations.volume !== undefined) appliedNode.stats.volume = mutations.volume;
  if (mutations.loops !== undefined)
    appliedNode.recipe.sketch.loops[0].elements = appliedNode.recipe.sketch.loops[0].elements.slice(0, mutations.loops);
  const applied = stateOf(appliedProjectValue, 8, 5);
  const draft64 = clone(draft);
  draft64.variables = [
    { name: 'breite', value: '64' },
    { name: 'tiefe', value: '40' },
  ];
  const projectReturns = [
    original, // setup
    original, // first run: review visible
    original, // first run: after Review
    original, // draft: rejected Apply at 64 mm / draft-edit: discard
    original, // second run: review visible
    original, // second run: after Review
    applied, // explicit Apply
    original, // Undo
    applied, // Redo
  ];
  const draftReturns = [draft, draft, draft, editing ? draft : draft64, draft, draft];
  const events = [];
  const scripts = [];
  const widths = [];
  const chatResponses = [];
  const state = { setup: 0, models: 0, chats: 0 };

  const chat = async () => {
    events.push('chat');
    assert.notEqual(global.fetch, guard, 'the helper installs its local adapter before the chat runs');
    if (!state.models) {
      const response = await global.fetch(BASE + '/models');
      assert.deepEqual(await response.json(), { data: [{ id: MODEL, input_modalities: ['text'] }] });
      state.models += 1;
    }
    const fake = fail === 'host' ? 'http://127.0.0.1:9198/v1' : BASE;
    let system = systemDiagnostic();
    if (fail === 'gap')
      system = system.replace(
        '"gapCount":1,"gaps":[{"role":"outer","from":[60,0],"to":[60,40],"distance":40}]',
        '"gapCount":0,"gaps":[]',
      );
    if (fail === 'private') system += '\ndraft-front-private';
    const request = {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: PROMPT },
      ],
      model: MODEL,
    };
    const response = await global.fetch(fake + '/chat/completions', { method: 'POST', body: JSON.stringify(request) });
    const payload = await response.json();
    const content = JSON.parse(payload.choices[0].message.content);
    assert.equal(content.revision, original.revision, 'the fixture answers on the captured project revision');
    assert.deepEqual(content.assistant.plan, {
      version: 1,
      title: 'Offenen Entwurf schließen',
      actions: [
        { kind: 'ui', action: 'click', target: 'ui:id:sketch-profile-close' },
        { kind: 'ui', action: 'click', target: 'ui:id:sketch-preview' },
        { kind: 'ui', action: 'click', target: 'ui:id:sketch-apply' },
      ],
    });
    assert.equal(content.message, 'Kontur in der Übung geschlossen.');
    chatResponses.push(content);
    state.chats += 1;
  };

  const project = () => {
    assert(projectReturns.length, 'unexpected project state read');
    return clone(projectReturns.shift());
  };
  const draftState = () => {
    assert(draftReturns.length, 'unexpected draft state read');
    return clone(draftReturns.shift());
  };

  const js = async (script) => {
    scripts.push(script);
    if (script.includes('sketch-profile-delete')) {
      events.push('setup');
      state.setup += 1;
      assert(script.includes(JSON.stringify(sketchBodyFixture())), 'the setup program carries the profile fixture');
      assert(script.includes('draft-right-private'), 'the setup program removes the right private line through the UI');
      if (editing) {
        assert(script.includes('if(true){'), 'the editing branch prepares a real body');
        assert(
          script.includes("controller.preview({kind:'batch',commands:[{op:'sketch',name:'Platte für Entwurfsübung'"),
        );
        assert(script.includes('previewDrawings'));
        assert(script.includes('Unbeteiligtes Blatt'), 'the unrelated drawing sheet is created in the branch');
        assert(
          script.includes('"sourceIds":["' + ROOT + '"]'),
          'the drawing sheet references the captured parent body',
        );
        assert(script.includes('sketchUI.open(true)'), 'the existing sketch is opened for editing');
      } else {
        assert(script.includes('if(false){'), 'a new draft skips the body preparation branch');
        assert(script.includes('sketchUI.openPracticeDraft({sketch})'), 'draft starts as a new editor draft');
      }
      return editing ? SKETCH_ROOT : null;
    }
    if (script.includes('saveAISettings')) {
      events.push('saveAISettings');
      assert(script.includes('127.0.0.1:9197'), 'the local provider base URL is installed');
      return undefined;
    }
    if (script.includes('a.undoDepth()')) return project();
    if (script.includes('sketchUI.state()?.sketch')) return draftState();
    if (script.includes('contour-open')) {
      events.push('openPath');
      return mutations.openPath ?? OPEN_PATH;
    }
    if (script.includes('sketch-practice-start')) {
      events.push('start');
      assert(script.includes(PROMPT), 'the visible sketch practice form receives the prompt');
      await chat();
      return undefined;
    }
    if (script.includes("getElementById('sketch-practice-review')") && script.includes('!n.hidden')) {
      events.push('readyReview');
      return true;
    }
    if (script.includes("getElementById('sketch-practice-review').click()")) {
      events.push('reviewClick');
      return undefined;
    }
    if (script.includes("getElementById('sketch-practice-apply')") && script.includes('!n.hidden')) {
      events.push('readyApply');
      return true;
    }
    if (script.includes("getElementById('sketch-practice-apply').hidden")) {
      events.push('applyHidden');
      return true;
    }
    if (script.includes("getElementById('sketch-practice-apply').textContent")) {
      events.push('applyText');
      return 'Folgeänderungen werden geprüft.';
    }
    if (script.includes("getElementById('sketch-practice-apply').click()")) {
      events.push('applyClick');
      return undefined;
    }
    if (script.includes('sketch-practice-status.ai-error')) {
      events.push('rejectedApply');
      assert(script.includes('Ausgangsskizze wurde geändert'), 'the rejected Apply is detected through the status');
      return true;
    }
    if (script.includes('sketch-variable-value-1')) {
      const width = /field\.value='(\d+)'/.exec(script);
      assert(width, 'the visible variable field receives a width value');
      widths.push(width[1]);
      return undefined;
    }
    if (script.includes('sketch-practice-discard')) {
      events.push('discard');
      return undefined;
    }
    if (script.includes("document.getElementById('modal')")) {
      events.push('modalClosed');
      return true;
    }
    if (script.includes('__cadTest.settled()')) {
      events.push('settled');
      return undefined;
    }
    if (script.includes('sketch-practice') && script.includes('scrollIntoView')) {
      events.push('scroll');
      return undefined;
    }
    if (script.includes('actions.undo()')) {
      events.push('undo');
      return undefined;
    }
    if (script.includes('actions.redo()')) {
      events.push('redo');
      return undefined;
    }
    throw Error('Unexpected renderer program in the local sketch fixture: ' + script);
  };

  const win = {
    webContents: {
      capturePage: async () => {
        events.push('capture');
        return { toPNG: () => Buffer.from('synthetic-draft-review-png') };
      },
    },
  };
  let guardCalls = 0;
  const guard = async () => {
    guardCalls += 1;
    throw Error('No cloud calls allowed during sketch verification.');
  };
  return {
    js,
    win,
    guard,
    guardCalls: () => guardCalls,
    events,
    scripts,
    widths,
    chatResponses,
    original,
    applied,
    draft,
    draft64,
    state,
  };
}

function assertRendererPrograms(run) {
  assert(run.harness.scripts.length > 0);
  for (const script of run.harness.scripts)
    assert.doesNotThrow(() => new vm.Script(script), 'the embedded renderer program compiles: ' + script);
}

async function runFixture(t, variant, options = {}) {
  const directory = temporary(t, 'formnaro-sketch-' + variant + '-');
  const draft = draftFixture();
  const harness = createHarness({ variant, draft, fail: options.fail, mutations: options.mutations });
  const checks = [PRELUDE_CHECK];
  const before = { serialized: JSON.stringify(originalProject(variant)) };
  const hostFetch = global.fetch;
  global.fetch = harness.guard;
  const previousVariant = process.env.FORMNARO_VERIFY_PRACTICE_SKETCH;
  process.env.FORMNARO_VERIFY_PRACTICE_SKETCH = variant;
  let result;
  let error;
  let fetchAfter;
  try {
    try {
      result = await helper.verifyPracticeSketchDraft({
        win: harness.win,
        js: harness.js,
        directory,
        before,
        checks,
      });
    } catch (caught) {
      error = caught;
    }
  } finally {
    fetchAfter = global.fetch;
    global.fetch = hostFetch;
    if (previousVariant === undefined) delete process.env.FORMNARO_VERIFY_PRACTICE_SKETCH;
    else process.env.FORMNARO_VERIFY_PRACTICE_SKETCH = previousVariant;
  }
  return {
    directory,
    before,
    checks,
    harness,
    result,
    error,
    fetch: { hostFetch, guard: harness.guard, fetchAfter, restored: global.fetch },
  };
}

function assertRestored(run) {
  assert.equal(run.fetch.restored, run.fetch.hostFetch, 'the previous fetch function is restored exactly');
  assert.equal(run.fetch.fetchAfter, run.fetch.guard, 'the helper restores the fetch adapter supplied by its caller');
  assert.equal(String(run.fetch.restored), String(run.fetch.hostFetch), 'the restored function is the original one');
}

function reviewScreenshot(run) {
  const file = path.join(run.directory, 'sketch-draft-review.png');
  assert(fs.existsSync(file), 'sketch-draft-review.png is written at the previous capture point');
  assert.equal(fs.readFileSync(file, 'utf8'), 'synthetic-draft-review-png');
}

test('The sketch verifier exposes the draft entry point', () => {
  assert.equal(typeof helper.verifyPracticeSketchDraft, 'function');
});

test('The dispatcher keeps the draft gate after drawing, delegates once and retains the shared prelude', () => {
  const gate = " if(['draft','draft-edit'].includes(process.env.FORMNARO_VERIFY_PRACTICE_SKETCH)){";
  assert(mainSource.includes(gate));
  const delegation =
    "  return require('./practice-sketch-verification.cjs').verifyPracticeSketchDraft({win,js,directory,before,checks});";
  assert(mainSource.includes(delegation));
  assert.equal(
    mainSource.split("require('./practice-sketch-verification.cjs').verifyPracticeSketchDraft(").length - 1,
    1,
  );
  assert.equal(mainSource.split('verifyPracticeSketchDraft({win,js,directory,before,checks})').length - 1, 1);
  for (const marker of [
    'chat-practice-button.png',
    'parent-preview-before.png',
    'const js=s=>win.webContents.executeJavaScript(s),checks=[];',
    'const parentSnapshot=',
    'const before=await js(parentSnapshot);',
    'const drawingVariant=process.env.FORMNARO_VERIFY_PRACTICE_DRAWING;',
    'const livePractice=',
    "if(['repair','midpoint','repair-live','midpoint-live'].includes(process.env.FORMNARO_VERIFY_PRACTICE_SKETCH)){",
    "if(['1','mode-recovery'].includes(process.env.FORMNARO_VERIFY_PRACTICE_SKETCH)){",
  ])
    assert(mainSource.includes(marker), 'the dispatcher retains the shared prelude: ' + marker);

  const lines = mainSource.replace(/\r\n/g, '\n').split('\n');
  const delegationLine = lines.findIndex((line) =>
    line.includes("require('./practice-sketch-verification.cjs').verifyPracticeSketchDraft({"),
  );
  assert(delegationLine >= 0);
  assert.equal(lines[delegationLine + 1].trim(), '}', 'the draft gate closes after the delegation');
  assert.equal(
    lines[delegationLine + 2].trim(),
    "if(['repair','midpoint','repair-live','midpoint-live'].includes(process.env.FORMNARO_VERIFY_PRACTICE_SKETCH)){",
  );
  const drawingLine = lines.findIndex((line) =>
    line.includes("require('./practice-drawing-verification.cjs').verifyPracticeDrawing({"),
  );
  assert(drawingLine >= 0 && delegationLine > drawingLine, 'the draft gate follows the drawing gate');

  for (const marker of [
    'sketch-practice',
    'sketch-draft-review.png',
    'createCadDrawingSheet',
    'draft-front-private',
    'draft-outer-private',
    'local-sketch-fixture',
    'Platte für Entwurfsübung',
  ]) {
    assert.equal(mainSource.includes(marker), false, 'the dispatcher no longer owns: ' + marker);
    assert(helperSource.includes(marker), 'the extracted helper owns: ' + marker);
  }
});

test('The portable package filter drops the extracted sketch verification module', async (t) => {
  const root = temporary(t, 'formnaro-sketch-portable-');
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
    'practice-sketch-verification.cjs',
    'practice-runner.cjs',
    'practice-files.cjs',
  ])
    fs.writeFileSync(path.join(source, 'backend', name), name);
  writeEmptyBenchmarkManifests(source);
  const { copyPortableApp } = await import('../scripts/portable-runtime-policy.mjs');
  copyPortableApp(source, stage);
  assert.deepEqual(fs.readdirSync(path.join(stage, 'backend')).sort(), ['practice-files.cjs', 'practice-runner.cjs']);
  assert.equal(fs.existsSync(path.join(stage, 'backend', 'practice-sketch-verification.cjs')), false);
});

for (const variant of ['draft', 'draft-edit']) {
  test(`The local ${variant} variant keeps the five/six ordered checks, both chat answers and fetch restoration`, async (t) => {
    const run = await runFixture(t, variant);
    assert.equal(run.error, undefined, run.error && run.error.message);
    assertRestored(run);
    assert.equal(run.harness.guardCalls(), 0, 'the previous fetch function is never called');
    assert.equal(run.harness.state.setup, 1, 'the branch prepares exactly one draft');
    assert.equal(run.harness.state.chats, 2, 'exactly two chat answers are counted');
    assert.equal(
      run.harness.widths.join(','),
      variant === 'draft' ? '64,60' : '',
      'the width is reset before the second run',
    );
    assert.equal(run.harness.chatResponses.length, 2);
    assertRendererPrograms(run);

    const result = run.result;
    assert.deepEqual(Object.keys(result).sort(), ['checks', 'editing', 'ok', 'requests', 'volume']);
    assert.equal(result.ok, true);
    assert.equal(result.editing, variant === 'draft-edit');
    assert.equal(result.requests, 2);
    assert.equal(result.volume, 12000);
    const expected = variant === 'draft' ? [...CHECK_ROWS, DRAFT_ONLY_CHECK] : [...CHECK_ROWS, ...EDIT_ONLY_CHECKS];
    assert.deepEqual(result.checks, expected);
    assert.equal(result.checks.length, variant === 'draft' ? 5 : 6);

    reviewScreenshot(run);
    const { events } = run.harness;
    assert(events.indexOf('capture') > events.indexOf('reviewClick'), 'the review capture happens after review');
    if (variant === 'draft') {
      assert(events.indexOf('capture') < events.indexOf('rejectedApply'), 'capture precedes the rejected Apply');
      assert.equal(events.includes('discard'), false);
    } else {
      assert(events.indexOf('capture') < events.indexOf('discard'), 'capture stays before the discard run');
      assert.equal(
        events.filter((event) => event === 'applyText').length,
        2,
        'the follow-up hint is read on both runs',
      );
    }
    assert.equal(events.filter((event) => event === 'undo').length, 1);
    assert.equal(events.filter((event) => event === 'redo').length, 1);
    assert.equal(
      fs.readFileSync(path.join(run.directory, 'sketch-draft-review.png'), 'utf8'),
      'synthetic-draft-review-png',
    );
  });
}

for (const [name, mutations, screenshotExpected] of [
  ['a false diagonal in the open draft view', { openPath: 'M 0 0 L 60 0 L 60 -40 L 0 -40 L 0 0' }, false],
  ['a candidate volume other than 12000 mm³', { volume: 11999 }, true],
  ['a candidate contour with three instead of four elements', { loops: 3 }, true],
  ['a candidate with two solids', { solids: 2 }, true],
]) {
  test(`The helper rejects ${name}`, async (t) => {
    const run = await runFixture(t, 'draft', { mutations });
    assert(run.error, 'the mutated fixture must fail the helper');
    assert.equal(run.error.code, 'ERR_ASSERTION');
    if (name.includes('false diagonal')) assert.match(run.error.message, /false diagonal/);
    assertRestored(run);
    assert.equal(run.result, undefined);
    assert.equal(
      fs.existsSync(path.join(run.directory, 'sketch-draft-review.png')),
      screenshotExpected,
      'capture position relative to the failing assertion',
    );
  });
}

for (const fail of ['host', 'gap', 'private']) {
  test(`The local adapter rejects unchanged provider checks (${fail}) and restores fetch on the error path`, async (t) => {
    const run = await runFixture(t, 'draft', { fail });
    assert(run.error, 'the adapter rejection must fail the helper');
    assert.equal(run.error.code, 'ERR_ASSERTION');
    if (fail === 'host') assert.match(run.error.message, /127\.0\.0\.1:9197/);
    if (fail === 'gap') assert.match(run.error.message, /gapCount/);
    if (fail === 'private') assert.match(run.error.message, /draft-front-private/);
    assertRestored(run);
    assert.equal(run.result, undefined);
    assert.equal(run.harness.state.chats, 0, 'no counted chat answer is produced by a rejected request');
  });
}

test('A wrong Apply result fails after the review capture and still restores fetch', async (t) => {
  const directory = temporary(t, 'formnaro-sketch-wrong-apply-');
  const draft = draftFixture();
  const harness = createHarness({ variant: 'draft', draft });
  harness.applied.undo = harness.original.undo;
  const checks = [PRELUDE_CHECK];
  const hostFetch = global.fetch;
  const previousVariant = process.env.FORMNARO_VERIFY_PRACTICE_SKETCH;
  global.fetch = harness.guard;
  process.env.FORMNARO_VERIFY_PRACTICE_SKETCH = 'draft';
  let error;
  let fetchAfter;
  try {
    await helper.verifyPracticeSketchDraft({
      win: harness.win,
      js: harness.js,
      directory,
      before: { serialized: JSON.stringify(originalProject('draft')) },
      checks,
    });
  } catch (caught) {
    error = caught;
  } finally {
    fetchAfter = global.fetch;
    global.fetch = hostFetch;
    if (previousVariant === undefined) delete process.env.FORMNARO_VERIFY_PRACTICE_SKETCH;
    else process.env.FORMNARO_VERIFY_PRACTICE_SKETCH = previousVariant;
  }
  assert(error, 'a missing undo step must fail the helper');
  assert.equal(error.code, 'ERR_ASSERTION');
  assert.match(error.message, /4 !== 5|Expected values to be strictly equal/);
  assert.equal(fetchAfter, harness.guard, 'the local adapter is restored on the late error path');
  assert.equal(global.fetch, hostFetch);
  assert(fs.existsSync(path.join(directory, 'sketch-draft-review.png')), 'the capture precedes the late failure');
});
