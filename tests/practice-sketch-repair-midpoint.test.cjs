const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Script } = require('node:vm');

const helper = require('../backend/practice-sketch-verification.cjs');
const nativeChecks = require('../backend/practice-native-verification-checks.cjs');

const MAIN_PATH = path.join(__dirname, '..', 'backend', 'practice-verification.cjs');
const HELPER_PATH = path.join(__dirname, '..', 'backend', 'practice-sketch-verification.cjs');
const mainSource = fs.readFileSync(MAIN_PATH, 'utf8');
const helperSource = fs.readFileSync(HELPER_PATH, 'utf8');
const TEMP_ROOT = path.join(__dirname, '..', 'work', 'tmp', 'temp');
fs.mkdirSync(TEMP_ROOT, { recursive: true });

const clone = (value) => JSON.parse(JSON.stringify(value));

const PRELUDE = 'Parent practice button prefixes without sending and is disabled while busy';
const VARIANT_LINE = '  const variant=process.env.FORMNARO_VERIFY_PRACTICE_SKETCH;\r\n';
const DELEGATE_LINE =
  "  return require('./practice-sketch-verification.cjs').verifyPracticeSketchRepairMidpoint({js,directory,checks,before,parentSnapshot,livePractice,variant:process.env.FORMNARO_VERIFY_PRACTICE_SKETCH});";
const SIGNATURE =
  'async function verifyPracticeSketchRepairMidpoint({js,directory,checks,before,parentSnapshot,livePractice,variant}){\r\n';
const N2_BODY_SHA256 = 'cb4070c42cfd5ee4ec22b01e5c8468569a2b7de69b2728e30bc3c544b04cb674';

function repairMidpointBody() {
  const signature = helperSource.indexOf(SIGNATURE);
  assert(signature >= 0, 'the N2 function signature is present');
  const start = signature + SIGNATURE.length;
  const end = helperSource.indexOf('\r\n}\r\n', start);
  assert(end > start, 'the N2 function has a closing brace');
  return helperSource.slice(start, end + 2);
}

const PARENT_SNAPSHOT =
  "(()=>{const visible=[{id:'parent-preview-root',geometry:'g',root:null}];return {serialized:'{}',state:{},selection:[],previewId:'parent-preview-1',visiblePreviewRoots:visible};})()";

const SKETCH = {
  version: 2,
  kind: 'profile',
  dimensions: { height: '5' },
  variables: [
    { name: 'breite', value: '60' },
    { name: 'tiefe', value: '40' },
  ],
  elements: [
    { id: 'front', type: 'line', start: ['0', '0'], end: ['breite', '0'] },
    { id: 'right', type: 'line', start: ['breite', '0'], end: ['breite', 'tiefe'] },
    { id: 'back', type: 'line', start: ['breite', 'tiefe'], end: ['0', 'tiefe'] },
    { id: 'left', type: 'line', start: ['0', 'tiefe'], end: ['0', '0'] },
    { id: 'bore', type: 'circle', center: ['breite/2', 'tiefe/2'], diameter: '8' },
  ],
  loops: [
    { id: 'outer', role: 'outer', elements: ['front', 'right', 'back', 'left'] },
    { id: 'hole', role: 'hole', elements: ['bore'] },
  ],
};
const BRIDGE = { id: 'line-1', type: 'line', start: ['breite', '0'], end: ['breite', 'tiefe'] };
const REPAIR_SKETCH = {
  ...clone(SKETCH),
  elements: [
    clone(SKETCH.elements[0]),
    clone(BRIDGE),
    clone(SKETCH.elements[2]),
    clone(SKETCH.elements[3]),
    clone(SKETCH.elements[4]),
  ],
  loops: [{ id: 'outer', role: 'outer', elements: ['front', 'line-1', 'back', 'left'] }, clone(SKETCH.loops[1])],
};
const MIDPOINT_SKETCH = {
  ...clone(SKETCH),
  variables: [
    { name: 'breite', value: '70' },
    { name: 'tiefe', value: '40' },
  ],
};
const BEFORE = {
  serialized: '{"nodes":[{"id":"existing-1"}]}',
  state: { undo: 2, redo: 1, previews: 3, revision: 7 },
  selection: [{ rootId: 'existing-1', path: [] }],
  previewId: 'parent-preview-1',
  visiblePreviewRoots: [{ id: 'parent-preview-root', geometry: 'g', root: null }],
};
const LIVE_PARENT = {
  serialized: '{"nodes":[{"id":"sketch-root"}]}',
  state: { undo: 3, redo: 0, previews: 4, revision: 8 },
  selection: [{ rootId: 'sketch-root', path: [] }],
  previewId: 'live-preview-1',
  visiblePreviewRoots: [{ id: 'live-preview-root', geometry: 'lg', root: 'sketch-root' }],
};

function preparedProject() {
  return {
    version: 1,
    nodes: [
      {
        id: 'sketch-root',
        kind: 'cad',
        recipe: { type: 'sketch', sketch: clone(SKETCH) },
        stats: { solids: 1, volume: 1000 },
      },
    ],
  };
}

function finalProject(actual, width) {
  return {
    version: 1,
    nodes: [
      {
        id: 'sketch-root',
        kind: 'cad',
        recipe: { type: 'sketch', sketch: clone(actual) },
        stats: { solids: 1, volume: (width * 40 - Math.PI * 16) * 5 },
      },
    ],
  };
}

function nativeScene(width) {
  return {
    objects: [
      {
        id: 'sketch-root',
        worldBounds: {
          min: [-width / 2, -20, 0],
          max: [width / 2, 20, 5],
          size: [width, 40, 5],
        },
      },
    ],
  };
}

function startPracticeResult(variant, options) {
  if (variant === 'repair') {
    if (options.repairFirstOk)
      return {
        ok: true,
        continuationId: 'continuation-1',
        resultRef: 'unexpected-ref',
        report: { confirmedCount: 4, sketch: { gaps: [{ role: 'outer', from: [60, 0], to: [60, 40], distance: 40 }] } },
      };
    return {
      ok: false,
      continuationId: 'continuation-1',
      reason: 'Kontur ist offen: die rechte Kante fehlt',
      report: {
        confirmedCount: 4,
        sketch: { gaps: [{ role: 'outer', from: [60, 0], to: [60, 40], distance: 40 }] },
        revision: 11,
      },
    };
  }
  return { ok: true, resultRef: 'midpoint-ref-1', reason: '', report: {} };
}

function livePracticeResult(variant, options) {
  if (variant !== 'repair-live') return { ok: true, resultRef: 'midpoint-live-ref-1', reason: '', report: {} };
  const attempts = options.liveMissingFailure
    ? []
    : [
        {
          injected: 'sketch-gap',
          reason: 'Kontur ist offen: die rechte Kante fehlt',
          report: {
            failedAction: { target: 'ui:id:sketch-preview' },
            sketch: { gaps: [{ role: 'outer', from: [60, 0], to: [60, 40], distance: 40 }] },
            revision: 11,
            confirmedCount: 4,
          },
        },
      ];
  return {
    ok: true,
    resultRef: 'repair-live-ref-1',
    reason: '',
    attempts,
    report: { confirmedCount: 8, quality: { items: [{ status: 'skipped' }] } },
  };
}

function createAdapter(variant, options, directory) {
  const scripts = [];
  const liveCalls = [];
  const prepared = { revision: 7, project: preparedProject(), rootId: 'sketch-root' };
  const start = startPracticeResult(variant, options);
  const continued = {
    ok: true,
    resultRef: 'repair-ref-1',
    reason: 'repaired',
    report: { confirmedCount: 7 },
  };
  const live = livePracticeResult(variant, options);
  const actual = variant.startsWith('repair')
    ? (options.actualRepair ?? REPAIR_SKETCH)
    : (options.actualMidpoint ?? MIDPOINT_SKETCH);
  const width = variant.startsWith('repair') ? 60 : 70;
  const project = finalProject(actual, width);
  const native = nativeScene(width);
  let parentReads = 0;

  const parentValue = () => {
    parentReads += 1;
    const base = variant.endsWith('-live') ? LIVE_PARENT : BEFORE;
    if (options.parentChanged && parentReads === (variant.endsWith('-live') ? 2 : 1))
      return { ...clone(base), serialized: base.serialized + '-changed' };
    return clone(base);
  };

  const js = async (script) => {
    new Script(script);
    scripts.push(script);
    if (script.includes("op:'sketch'")) return clone(prepared);
    if (script.includes('clearPreview')) return undefined;
    if (script.includes('visiblePreviewRoots')) return parentValue();
    if (script.includes('startPractice(')) return clone(start);
    if (script.includes('continuePractice(')) return clone(continued);
    if (script.includes('practiceProjectResult(')) return clone(project);
    if (script.includes('controller.describe(')) return clone(native);
    if (script.includes('restoreAITaskCandidate')) return { center: true, shifted: false };
    throw Error('Unexpected renderer program in the repair/midpoint fixture: ' + script);
  };

  const livePractice = async (...args) => {
    liveCalls.push(clone(args));
    return clone(live);
  };

  if (variant === 'repair-live' && !options.missingWire)
    fs.writeFileSync(
      path.join(directory, 'vibe-rounds.json'),
      JSON.stringify([
        {
          applicationFeedback: { kind: 'practice-step-failed', exerciseRevision: 11 },
          images: ['synthetic-child-image'],
        },
      ]),
    );

  return { js, livePractice, scripts, liveCalls };
}

async function invokeReference(adapter, directory, variant) {
  const body = repairMidpointBody();
  const referenceBody = VARIANT_LINE + body;
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const reference = new AsyncFunction(
    'js',
    'directory',
    'checks',
    'before',
    'parentSnapshot',
    'livePractice',
    'fs',
    'path',
    'assert',
    'checkPlateOpening',
    referenceBody,
  );
  const checks = [PRELUDE];
  const previous = process.env.FORMNARO_VERIFY_PRACTICE_SKETCH;
  process.env.FORMNARO_VERIFY_PRACTICE_SKETCH = variant;
  try {
    const result = await reference(
      adapter.js,
      directory,
      checks,
      clone(BEFORE),
      PARENT_SNAPSHOT,
      adapter.livePractice,
      fs,
      path,
      assert,
      nativeChecks.checkPlateOpening,
    );
    return { result, checks };
  } finally {
    if (previous === undefined) delete process.env.FORMNARO_VERIFY_PRACTICE_SKETCH;
    else process.env.FORMNARO_VERIFY_PRACTICE_SKETCH = previous;
  }
}

async function invokeCandidate(adapter, directory, variant) {
  const checks = [PRELUDE];
  const previous = process.env.FORMNARO_VERIFY_PRACTICE_SKETCH;
  // A divergent sentinel proves the helper does not read the environment.
  process.env.FORMNARO_VERIFY_PRACTICE_SKETCH = 'draft';
  try {
    const result = await helper.verifyPracticeSketchRepairMidpoint({
      js: adapter.js,
      directory,
      checks,
      before: clone(BEFORE),
      parentSnapshot: PARENT_SNAPSHOT,
      livePractice: adapter.livePractice,
      variant,
    });
    return { result, checks };
  } finally {
    if (previous === undefined) delete process.env.FORMNARO_VERIFY_PRACTICE_SKETCH;
    else process.env.FORMNARO_VERIFY_PRACTICE_SKETCH = previous;
  }
}

async function guardedInvoke(invoke, adapter, directory, variant) {
  const hostFetch = global.fetch;
  let fetchCalls = 0;
  const guard = async () => {
    fetchCalls += 1;
    throw Error('No provider or cloud call is allowed in the extraction test.');
  };
  global.fetch = guard;
  let fetchUnchanged;
  let error;
  let outcome;
  try {
    outcome = await invoke(adapter, directory, variant);
  } catch (caught) {
    error = caught;
  } finally {
    fetchUnchanged = global.fetch === guard;
    global.fetch = hostFetch;
  }
  return { ...outcome, error, fetchCalls, fetchUnchanged };
}

function filesOf(directory) {
  const files = {};
  for (const name of fs.readdirSync(directory).sort()) files[name] = fs.readFileSync(path.join(directory, name));
  return files;
}

function normalize(message, directories) {
  let value = message;
  for (const directory of directories) value = value.split(directory).join('<dir>');
  return value;
}

async function compareScenario(t, variant, options = {}) {
  const refDir = fs.mkdtempSync(path.join(TEMP_ROOT, `p34n2-ref-${variant}-`));
  const candDir = fs.mkdtempSync(path.join(TEMP_ROOT, `p34n2-cand-${variant}-`));
  t.after(() => {
    fs.rmSync(refDir, { recursive: true, force: true });
    fs.rmSync(candDir, { recursive: true, force: true });
  });

  const referenceAdapter = createAdapter(variant, options, refDir);
  const candidateAdapter = createAdapter(variant, options, candDir);
  const reference = await guardedInvoke(invokeReference, referenceAdapter, refDir, variant);
  const candidate = await guardedInvoke(invokeCandidate, candidateAdapter, candDir, variant);

  assert.equal(reference.fetchCalls, 0, 'the N1 reference makes no fetch call');
  assert.equal(candidate.fetchCalls, 0, 'the extracted helper makes no fetch call');
  assert.equal(reference.fetchUnchanged, true, 'the reference leaves the fetch guard installed');
  assert.equal(candidate.fetchUnchanged, true, 'the helper leaves the fetch guard installed');

  assert.deepEqual(referenceAdapter.scripts, candidateAdapter.scripts, 'renderer programs are identical');
  assert.deepEqual(referenceAdapter.liveCalls, candidateAdapter.liveCalls, 'live calls are identical');
  assert.deepEqual(filesOf(refDir), filesOf(candDir), 'written files are identical');

  if (reference.error || candidate.error) {
    assert(reference.error, 'the reference must fail where the candidate fails');
    assert(candidate.error, 'the candidate must fail where the reference fails');
    assert.equal(candidate.error.code, reference.error.code, 'error codes match');
    assert.equal(
      normalize(candidate.error.message, [candDir]),
      normalize(reference.error.message, [refDir]),
      'error messages match after substituting the temporary directory',
    );
    assert.equal(reference.result, undefined);
    assert.equal(candidate.result, undefined);
    return { reference, candidate, failed: true };
  }

  assert.deepEqual(candidate.result, reference.result, 'return objects are identical');
  assert.deepEqual(candidate.checks, reference.checks, 'checks are identical');
  assert.equal(reference.result.checks, reference.checks, 'the N1 reference returns the same checks array');
  assert.equal(candidate.result.checks, candidate.checks, 'the extracted helper returns the same checks array');
  return { reference, candidate, failed: false };
}

// ---------------------------------------------------------------------------
// Static extraction proof
// ---------------------------------------------------------------------------

test('The extracted N2 body preserves the reference used for the adapter comparisons', () => {
  assert.equal(createHash('sha256').update(repairMidpointBody()).digest('hex'), N2_BODY_SHA256);
});

test('The dispatcher connects the four N2 variants at their gate', () => {
  const lines = mainSource.split(/\r?\n/);
  const gate =
    " if(['repair','midpoint','repair-live','midpoint-live'].includes(process.env.FORMNARO_VERIFY_PRACTICE_SKETCH)){";
  const at = lines.indexOf(gate);
  assert(at >= 0);
  assert.deepEqual(lines.slice(at + 1, at + 3), [DELEGATE_LINE, ' }']);
  assert.equal(mainSource.split('verifyPracticeSketchRepairMidpoint(').length - 1, 1);
});

test('The helper exposes both functions and the new one takes exactly one argument', () => {
  assert.equal(typeof helper.verifyPracticeSketchDraft, 'function');
  assert.equal(typeof helper.verifyPracticeSketchRepairMidpoint, 'function');
  assert.equal(helper.verifyPracticeSketchRepairMidpoint.length, 1);
  assert.equal(typeof nativeChecks.checkPlateOpening, 'function');
});

// ---------------------------------------------------------------------------
// Behavioural extraction equivalence
// ---------------------------------------------------------------------------

for (const variant of ['repair', 'midpoint', 'repair-live', 'midpoint-live']) {
  test(`The ${variant} variant behaves exactly like the compiled N1 reference`, async (t) => {
    const { reference, candidate, failed } = await compareScenario(t, variant);
    assert.equal(failed, false);
    assert.equal(candidate.result.ok, true);
    assert.equal(candidate.result.variant, variant);
    const expected = variant.startsWith('repair') ? 5 : 3;
    assert.equal(candidate.result.checks.length, expected, 'checks include the shared prelude');
    assert.equal(candidate.checks.length, expected);
    if (variant.startsWith('repair'))
      assert(candidate.result.checks.some((line) => line.includes('Only one bridge is inserted')));
    else
      assert.equal(
        candidate.result.checks.some((line) => line.includes('Only one bridge is inserted')),
        false,
      );
    assert.equal(Object.keys(candidate.result).sort().join(','), 'bounds,checks,clearance,ok,variant,volume');
    assert.deepEqual(reference.result, candidate.result);
  });
}

test('The extracted helper keeps the first-round failure contract for repair', async (t) => {
  const { candidate, failed } = await compareScenario(t, 'repair');
  assert.equal(failed, false);
  assert.equal(candidate.checks.length, 5);
  assert.equal(candidate.result.checks[0], PRELUDE);
  assert.equal(
    candidate.result.checks[1],
    'The real preview rejects an internal gap, reports its sketch coordinates and permits continuing in the same editor',
  );
});

test('The extracted helper rejects a repair first round that is already successful', async (t) => {
  const { candidate, failed } = await compareScenario(t, 'repair', { repairFirstOk: true });
  assert.equal(failed, true);
  assert.equal(candidate.error.code, 'ERR_ASSERTION');
});

test('The extracted helper rejects midpoint variables that were not changed', async (t) => {
  const wrong = {
    ...clone(SKETCH),
    variables: [
      { name: 'breite', value: '60' },
      { name: 'tiefe', value: '40' },
    ],
  };
  const { candidate, failed } = await compareScenario(t, 'midpoint', { actualMidpoint: wrong });
  assert.equal(failed, true);
  assert.equal(candidate.error.code, 'ERR_ASSERTION');
});

test('The extracted helper rejects a live repair run without the injected fault', async (t) => {
  const { candidate, failed } = await compareScenario(t, 'repair-live', { liveMissingFailure: true });
  assert.equal(failed, true);
  assert.equal(candidate.error.code, 'ERR_ASSERTION');
  assert.match(candidate.error.message, /fixed CAD fault/);
});

test('The extracted helper rejects a changed parent state', async (t) => {
  const { candidate, failed } = await compareScenario(t, 'repair', { parentChanged: true });
  assert.equal(failed, true);
  assert.equal(candidate.error.code, 'ERR_ASSERTION');
});
