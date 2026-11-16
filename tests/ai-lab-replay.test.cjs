'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { createDiagnostics } = require('../backend/ai-diagnostics.cjs');
const { preset } = require('../backend/ai-test-lab-plan.cjs');
const replay = require('../backend/ai-lab-replay.cjs');

const revision = '0123456789abcdef', model = 'deepseek-flash';

// Gleiche Kindprozess-Attrappe wie in ai-diagnostic-integration.test.cjs.
// `onEvent` wird von replayRecords als dritter createRunner-Parameter geliefert
// und erlaubt der Wiedergabe den Stopp vor der nächsten gespeicherten Antwort.
function labIn(directory, provider, credentials = () => ({ key: 'private-test-secret', config: { baseUrl: 'https://api.deepseek.com', model } }), onEvent = undefined) {
  const scene = { revision, objects: [], selectionTargets: [] }, project = { nodes: [{ id: 'protected', name: 'Unbeteiligtes Teil' }] };
  return createDiagnostics({
    app: {}, directory, reviewerEnabled: false, provider,
    credentials, onEvent,
    openChild: () => ({
      call: async method => method === 'setup' ? { scene, context: {}, validationContext: {}, project }
        : method === 'snapshot' ? { scene, project } : method === 'providerScene' ? scene : method === 'capture' ? 'data:image/png;base64,AAAA' : {},
      cancel() {}, async close() { return { code: 0, signal: null }; },
    }),
  });
}

function lab(t, provider, credentials = () => ({ key: 'private-test-secret', config: { baseUrl: 'https://api.deepseek.com', model } }), onEvent = undefined) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'formnaro-replay-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return labIn(directory, provider, credentials, onEvent);
}

// Denkstufe `max`: gültig beim Originalanbieter, bei der Wiedergabe ohne Bedeutung.
const plan = () => ({ ...preset(), caseIds: ['drill'], variants: ['A'], efforts: ['max'], workflow: 'practice', stage: 'start' });
const answers = [{ toolReference: { section: 'modeling' } }, { message: 'Die benötigte freie Bohrposition fehlt im gewählten sichtbaren Werkzeug.' }];

// Ein echter Originallauf mit zwei Modellrunden (Werkzeugauskunft, dann Rückfrage).
async function recordOriginal(t) {
  let i = 0;
  const runner = lab(t, {
    testConnection: async () => ({ models: [model] }),
    completeModel: async (c, k, e) => { e.onDiagnostic({ type: 'request' }); return { data: { model, usage: { input_tokens: 500, output_tokens: 80 } }, text: JSON.stringify(answers[i++]) }; },
  });
  await runner.start({ mode: 'lab', plan: plan() });
  return runner.read(runner.state().records[0].id);
}

// Wie im Programm: eigene Instanz mit Wiedergabe-Zugangsdaten statt des echten Profils.
const replayAgainst = (t, records) => replay.replayRecords(records, { createRunner: (provider, transcript, live = {}) => lab(t, provider, replay.replayCredentials(transcript), live.onEvent) });

// Kindprozess-Attrappe mit zufälligen IDs wie das echte Labor: Ohne übergebenes
// Projekt entsteht im frischen Verzeichnis ein neues Ausgangsmodell mit neuen
// Objektkennungen. Genau dieser Unterschied war Fehler 1.
function randomLab(t, provider, credentials = () => ({ key: 'private-test-secret', config: { baseUrl: 'https://api.deepseek.com', model } }), onEvent = undefined) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'formnaro-replay-ids-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const setups = []; let scene, project;
  const revisionOf = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
  const runner = createDiagnostics({
    app: {}, directory, reviewerEnabled: false, provider, credentials, onEvent,
    openChild: () => ({
      call: async (method, args = {}) => {
        if (method === 'setup') {
          setups.push({ projectProvided: !!args.project });
          project = args.project ? structuredClone(args.project) : { nodes: [{ id: crypto.randomUUID(), name: 'Unbeteiligtes Teil' }] };
          scene = { revision: revisionOf(project), objects: project.nodes.map(n => ({ id: n.id, name: n.name, worldBounds: { center: [0, 0, 0], size: [1, 1, 1] } })), selectionTargets: [] };
          return { scene, project, context: {}, validationContext: {} };
        }
        if (method === 'snapshot') return { scene, project };
        if (method === 'providerScene') return scene;
        if (method === 'capture') return 'data:image/png;base64,AAAA';
        return {};
      },
      cancel() {},
      async close() { return { code: 0, signal: null }; },
    }),
  });
  return { runner, setups };
}

// Originallauf, dessen Ausgangsmodell wechselnde IDs trägt.
async function randomOriginal(t) {
  let i = 0;
  const run = randomLab(t, {
    testConnection: async () => ({ models: [model] }),
    completeModel: async (c, k, e) => { e.onDiagnostic({ type: 'request' }); return { data: { model, usage: { input_tokens: 500, output_tokens: 80 } }, text: JSON.stringify(answers[i++]) }; },
  });
  await run.runner.start({ mode: 'lab', plan: plan() });
  return { original: run.runner.read(run.runner.state().records[0].id), setups: run.setups };
}

// N1: Wiedergabe mit steuerbarem Ereigniskanal.
//   'suppressed-feedback' – Kanal angeschlossen, Rückmeldungen durch neutrales
//                           Ereignis ersetzt (erwartete Rückmeldung fehlt)
//   'identical'           – Kanal angeschlossen, Ereignisse unverändert
//   'no-channel'          – kein Kanal (createRunner nutzt keinen dritten Parameter)
async function replayChannelCase(t, original, mode) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'formnaro-replay-channel-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let served = 0;
  const counted = provider => ({ ...provider, completeModel: async (...args) => { const value = await provider.completeModel(...args); served++; return value; } });
  const createRunner = (provider, transcript, live = {}) => {
    const instrumented = counted(provider);
    if (mode === 'no-channel') return labIn(directory, instrumented, replay.replayCredentials(transcript));
    return labIn(directory, instrumented, replay.replayCredentials(transcript), event => {
      const inner = event?.event ?? event;
      const forwarded = mode === 'suppressed-feedback' && ['tool-result', 'format-feedback', 'practice-ui-feedback'].includes(inner?.type)
        ? { type: 'heartbeat', round: inner.round }
        : inner;
      live.onEvent?.(forwarded);
    });
  };
  const report = await replay.replayRecords([original], { createRunner });
  return { result: report.results[0], served };
}

test('Wiedergabe spielt dieselben Antworten ohne Tokens ab und erkennt keinen Unterschied', async t => {
  const original = await recordOriginal(t);
  assert.equal(original.status, 'needs-input');
  const transcript = replay.extractTranscript(original);
  assert.deepEqual(transcript.responses.map(r => JSON.parse(r.text)), answers);

  const report = await replayAgainst(t, [original]);
  const [result] = report.results;
  assert.equal(result.outcome, 'still-failing', 'Rückfrage ist kein Erfolg – weder im Original noch in der Wiedergabe');
  assert.equal(result.divergedAtRound, null);
  assert.equal(result.unusedResponses, 0);
  assert.equal(result.tokens, 0);
  assert.equal(report.summary.liveRetestNeeded.length, 0);
});

test('Wiedergabe kann nie als Modellerfolg zählen', async t => {
  const original = await recordOriginal(t);
  let replayed;
  await replay.replayRecords([original], { createRunner: (provider, transcript, live = {}) => { const r = lab(t, provider, replay.replayCredentials(transcript), live.onEvent); const read = r.read; r.read = id => (replayed = read(id)); return r; } });
  assert.equal(replayed.returnedModel, replay.REPLAY_PREFIX + model);
  assert.equal(replayed.modelIdentity.exactMatch, false);
  const usage = replayed.events.filter(e => e.type === 'usage');
  assert.ok(usage.length > 0 && usage.every(e => e.usage.input_tokens === 0 && e.usage.output_tokens === 0));
  assert.deepEqual(replayed.replay.sourceRunId, original.id);
  assert.equal(replayed.spec.effort, 'auto', 'Denkstufe hängt nicht vom Originalanbieter ab');
  assert(!JSON.stringify(replayed).includes('private-test-secret'), 'Kein echter Schlüssel in der Wiedergabe');
});

test('Geänderte Rückmeldung vor der letzten Modellantwort gilt als Abweichung', async t => {
  const original = await recordOriginal(t);
  const older = structuredClone(original);
  const feedback = older.events.find(e => e.type === 'tool-result' && e.round === 0);
  feedback.result = { ...feedback.result, kind: 'older-contract' };
  const [result] = (await replayAgainst(t, [older])).results;
  assert.equal(result.outcome, 'diverged');
  assert.equal(result.divergedAtRound, 0);
});

test('Verlangt der Programmstand mehr Runden als aufgezeichnet, ist das eine Abweichung', async t => {
  const original = await recordOriginal(t);
  const shortened = structuredClone(original);
  shortened.events = shortened.events.filter(e => !(e.type === 'response' && e.round === 1));
  const report = await replayAgainst(t, [shortened]);
  assert.equal(report.results[0].outcome, 'diverged');
  assert.equal(report.results[0].exhausted, true);
  assert.deepEqual(report.summary.liveRetestNeeded, [original.id]);
});

test('Nicht wiedergabefähige Läufe werden benannt statt still übersprungen', async () => {
  const base = { id: 'x', status: 'completed', spec: { caseId: 'drill' }, events: [{ type: 'response', round: 0, text: '{}' }] };
  assert.equal(replay.replayBlocker(base), null);
  assert.match(replay.replayBlocker({ ...base, spec: { monitor: { mode: 'active' } } }), /Überwacher/);
  assert.match(replay.replayBlocker({ ...base, events: [...base.events, { type: 'incomplete-response', round: 1 }] }), /Abgeschnittene/, 'alte Läufe ohne gespeicherten Text');
  assert.match(replay.replayBlocker({ ...base, replay: { sourceRunId: 'y' } }), /nicht erneut/);
  assert.match(replay.replayBlocker({ ...base, events: [] }), /Keine gespeicherte/);
  const report = await replay.replayRecords([{ ...base, status: 'interrupted' }], { createRunner: () => assert.fail('darf nicht starten') });
  assert.equal(report.results[0].outcome, 'not-replayable');
});

test('Einordnung: reproduziert, Regression, behoben', () => {
  const run = (passed, round = 0) => ({ id: 'r' + passed, status: 'completed', cleanExit: true, verification: { passed },
    events: [{ type: 'response', round, text: '{}' }, { type: 'tool-result', round, result: { ok: passed, ms: Math.random() } }] });
  assert.equal(replay.compareReplay(run(true), run(true)).outcome, 'reproduced');
  assert.equal(replay.compareReplay(run(true), run(false)).outcome, 'regression', 'Rückmeldung nach der letzten Antwort ist keine Abweichung, sondern das Ergebnis');
  assert.equal(replay.compareReplay(run(false), run(true)).outcome, 'fixed');
});

test('Vergleich ignoriert Zeiten, Pfade und Bilder', () => {
  const a = replay.normalize({ ok: true, ms: 12, elapsedMs: 3, outputPath: 'C:/a', image: 'data:image/png;base64,AAA', nested: { startedAt: 'x', value: 1 } });
  const b = replay.normalize({ ok: true, ms: 99, elapsedMs: 7, outputPath: 'D:/b', image: 'data:image/png;base64,BBB', nested: { startedAt: 'y', value: 1 } });
  assert.deepEqual(a, b);
  assert.notDeepEqual(replay.normalize({ value: 1 }), replay.normalize({ value: 2 }));
});

test('Abgeschnittene Antwort mit gespeichertem Text wird als abgeschnitten wiedergegeben', async () => {
  // Mechanisch an den R1-Vertrag angepasst: ein wiedergabefähiger Lauf führt
  // Ausgangsmodell, Hash und Ausgangsrevision mit. Erwartung unverändert.
  const project = { nodes: [{ id: 'fixture-node', name: 'Unbeteiligtes Teil' }] };
  const fixtureHash = crypto.createHash('sha256').update(JSON.stringify(project)).digest('hex');
  const record = { id: 'x', status: 'completed', requestedModel: model, spec: { caseId: 'drill' },
    fixtureHash,
    initialState: { revision: '0123456789abcdef', objectCount: 1, objects: [{ id: 'fixture-node', name: 'Unbeteiligtes Teil' }], truncated: false },
    fixture: { format: 'FormnaroLabFixture', version: 1, file: 'fixture-drill.json', hash: fixtureHash, revision: '0123456789abcdef', objectCount: 1, objects: [{ id: 'fixture-node', name: 'Unbeteiligtes Teil' }], truncated: false, project },
    events: [{ type: 'incomplete-response', round: 0, text: '{"abg' }, { type: 'response', round: 1, text: '{}' }] };
  assert.equal(replay.replayBlocker(record), null);
  const transcript = replay.extractTranscript(record), provider = replay.createReplayProvider(transcript);
  assert.equal(transcript.fixture.hash, fixtureHash);
  assert.equal(transcript.fixture.revision, '0123456789abcdef');
  const first = await provider.completeModel({}, '', {}), second = await provider.completeModel({}, '', {});
  assert.equal(first.data.status, 'incomplete');
  assert.equal(first.text, '{"abg');
  assert.equal(second.data.status, undefined);
});

test('Ganze Serie: liest vollständige Protokolle, schreibt den Bericht, lässt die Hauptinstanz unberührt', async t => {
  const original = await recordOriginal(t);
  const seriesId = original.spec.seriesId, directory = fs.mkdtempSync(path.join(os.tmpdir(), 'formnaro-replay-series-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  // Wie die echte Hauptinstanz: state() ohne Ereignisse, read() mit Ereignissen.
  const { events, ...summary } = original, reads = [];
  const diagnostics = { state: () => ({ records: [summary, { id: 'other', spec: { seriesId: 'x' } }] }), read: id => { reads.push(id); return original; } };
  const report = await replay.replaySeries({ diagnostics, seriesId, directory, createRunner: (provider, transcript, live = {}) => lab(t, provider, replay.replayCredentials(transcript), live.onEvent) });
  assert.deepEqual(reads, [original.id]);
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0].divergedAtRound, null);
  // R3: eigener Bericht je Wiedergabe im Serienunterverzeichnis, kein fester Altname.
  assert.equal(typeof report.replayId, 'string');
  assert.equal(path.basename(path.dirname(report.path)), seriesId);
  const saved = JSON.parse(fs.readFileSync(report.path, 'utf8'));
  assert.equal(saved.replayId, report.replayId);
  assert.equal(saved.seriesId, seriesId);
  assert.equal(saved.summary.tokens, 0);
  assert.equal(saved.results[0].fixtureHash, original.fixtureHash);
  assert.equal(saved.results[0].fixtureOrigin.runId, original.id);
  assert.equal(typeof saved.results[0].transcriptHash, 'string');
  assert(!fs.existsSync(path.join(directory, 'Wiedergabe-' + seriesId + '.json')), 'kein fester Berichtsname');
  await assert.rejects(replay.replaySeries({ diagnostics, seriesId: '00000000-0000-0000-0000-000000000000', directory, createRunner: () => assert.fail() }), /nicht gefunden/);
  await assert.rejects(replay.replaySeries({ diagnostics, seriesId: '../x', directory, createRunner: () => assert.fail() }), /Ungültige/);
});

test('Wiedergabe übernimmt das Original-Ausgangsmodell trotz wechselnder IDs', async t => {
  const { original, setups: originalSetups } = await randomOriginal(t);
  assert.equal(originalSetups[0].projectProvided, false, 'Originallauf erzeugt das Ausgangsmodell selbst');
  const { fixtureHash, initialState } = original;
  assert.equal(typeof fixtureHash, 'string');
  assert.equal(typeof initialState?.revision, 'string');

  // Das Transcript führt Ausgangsmodell, Hash, Revision und Herkunft mit.
  const transcript = replay.extractTranscript(original);
  assert.equal(transcript.version, 2);
  assert.equal(transcript.fixture.hash, fixtureHash);
  assert.equal(transcript.fixture.revision, initialState.revision);
  assert.equal(transcript.fixture.origin.runId, original.id);
  assert.equal(transcript.fixture.origin.sourceHash, original.sourceHash);
  assert.equal(transcript.fixture.origin.caseId, 'drill');
  assert.deepEqual(transcript.fixture.project.nodes.map(n => n.id), initialState.objects.map(o => o.id), 'Fixture trägt die Original-IDs');

  const before = structuredClone(original);
  let replayRun, replaySetups;
  const report = await replay.replayRecords([original], {
    createRunner: (provider, transcript, live = {}) => {
      const run = randomLab(t, provider, replay.replayCredentials(transcript), live.onEvent);
      replaySetups = run.setups;
      const read = run.runner.read; run.runner.read = id => (replayRun = read(id));
      return run.runner;
    },
  });
  assert.deepEqual(original, before, 'Der historische Lauf wird nicht verändert');
  assert.deepEqual(replaySetups.map(setup => setup.projectProvided), [true], 'Wiedergabe öffnet die Original-Fixture');
  assert.equal(replayRun.initialState.revision, initialState.revision, 'Ausgangsrevision der Wiedergabe entspricht dem Original');
  assert.equal(replayRun.fixtureHash, fixtureHash, 'Wiedergabe belegt dasselbe Ausgangsmodell');
  assert.deepEqual(replayRun.initialState.objects, initialState.objects, 'Objektbezüge der Wiedergabe entsprechen dem Original');
  assert.equal(replayRun.fixtureOrigin?.runId, original.id, 'Herkunft der Fixture steht im Wiedergabelauf');
  const [result] = report.results;
  assert.equal(result.outcome, 'still-failing');
  assert.equal(result.fixtureHash, fixtureHash);
  assert.equal(result.fixtureOrigin.runId, original.id);
});

test('Ohne gespeichertes Ausgangsmodell ist die Wiedergabe ausdrücklich nicht vergleichbar', async t => {
  const { original } = await randomOriginal(t);
  const legacy = structuredClone(original);
  delete legacy.fixture;
  let started = false;
  const report = await replay.replayRecords([legacy], { createRunner: () => { started = true; throw Error('ohne Ausgangsmodell darf keine Wiedergabe starten'); } });
  const [result] = report.results;
  assert.equal(started, false, 'Ohne Ausgangsmodell startet keine Wiedergabe');
  assert.equal(result.outcome, 'not-comparable');
  assert.match(result.reason, /Ausgangsmodell/);
  assert.equal(report.summary['not-comparable'], 1);
  assert.equal(report.summary.reproduced, undefined);
  assert.equal(report.summary.tokens, 0);
});

test('Abweichendes Ausgangsmodell wird vor jeder Modellanfrage als nicht vergleichbar erkannt', async t => {
  const { original } = await randomOriginal(t);
  let providerCalls = 0;
  const report = await replay.replayRecords([original], {
    createRunner: (provider, transcript, live = {}) => {
      const counting = { ...provider, completeModel: (...args) => { providerCalls++; return provider.completeModel(...args); } };
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'formnaro-replay-mismatch-'));
      t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
      // Die Attrappe ignoriert das übergebene Projekt und erzeugt neue IDs.
      const runner = createDiagnostics({
        app: {}, directory, reviewerEnabled: false, provider: counting, credentials: replay.replayCredentials(transcript), onEvent: live.onEvent,
        openChild: () => ({
          call: async method => method === 'setup'
            ? (project => ({ scene: { revision: 'abweichende-revision', objects: [], selectionTargets: [] }, project, context: {}, validationContext: {} }))({ nodes: [{ id: crypto.randomUUID(), name: 'Unbeteiligtes Teil' }] })
            : method === 'snapshot' ? { scene: { revision: 'abweichende-revision', objects: [] }, project: { nodes: [] } }
              : method === 'capture' ? 'data:image/png;base64,AAAA' : {},
          cancel() {},
          async close() { return { code: 0, signal: null }; },
        }),
      });
      return runner;
    },
  });
  const [result] = report.results;
  assert.equal(providerCalls, 0, 'Abweichung wird vor der ersten Modellanfrage geprüft');
  assert.equal(result.outcome, 'not-comparable', 'Kein stilles reproduced bei anderem Ausgangsmodell');
  assert.match(result.reason, /nicht vergleichbar/);
  assert.equal(result.expectedRevision, original.initialState.revision);
  assert.notEqual(result.actualRevision, result.expectedRevision);
});

test('Verliert die Wiedergabe das Ausgangsmodell, wird kein Ergebnis behauptet', async t => {
  const { original } = await randomOriginal(t);
  // Aufrufer reicht die Fixture versehentlich nicht an die Wiedergabe-Instanz:
  // Die Instanz erzeugt neue IDs; das darf nie als Ergebnis gelten.
  const report = await replay.replayRecords([original], {
    createRunner: (provider, transcript, live = {}) => {
      const run = randomLab(t, provider, replay.replayCredentials(transcript), live.onEvent);
      const start = run.runner.start;
      run.runner.start = input => start({ ...input, fixture: undefined });
      return run.runner;
    },
  });
  const [result] = report.results;
  assert.equal(result.outcome, 'not-comparable');
  assert.match(result.reason, /Ausgangsmodell/);
  assert.equal(result.fixtureHash, original.fixtureHash);
  assert.notEqual(result.actualRevision, result.expectedRevision);
});

// Rückmeldungsprotokoll mit einer Korrektur vor der zweiten Modellantwort.
const feedbackRecord = (feedback, verification = { passed: true }) => ({
  id: 'feedback', status: 'completed', cleanExit: true, verification,
  events: [
    { type: 'response', round: 0, text: '{}' },
    { type: 'practice-ui-feedback', round: 0, ...feedback },
    { type: 'response', round: 1, text: '{}' },
  ],
});

test('Andere native Prüfrückmeldung vor der nächsten Antwort gilt als Abweichung', () => {
  const original = feedbackRecord({ phase: 'native-verification', verification: { passed: false, checks: [{ name: 'Kante', actual: 6 }] }, freshRevision: 'frisch-A' });
  const changed = feedbackRecord({ phase: 'native-verification', verification: { passed: false, checks: [{ name: 'Kante', actual: 8 }] }, freshRevision: 'frisch-B' });
  const result = replay.compareReplay(original, changed);
  assert.equal(result.outcome, 'diverged');
  assert.equal(result.divergedAtRound, 0);
  assert.deepEqual([...replay.feedbackByRound(original).keys()], [0], 'practice-ui-feedback zählt je Runde');
});

test('freshRevision ist flüchtig, reason und phase aber entscheidungsrelevant', () => {
  const base = { phase: 'native-verification', verification: { passed: false, checks: [{ actual: 6 }] }, freshRevision: 'frisch-A' };
  assert.equal(replay.compareReplay(feedbackRecord(base), feedbackRecord({ ...base, freshRevision: 'frisch-B' })).outcome, 'reproduced', 'frisches Fenster allein ist keine Abweichung');
  assert.equal(replay.compareReplay(feedbackRecord(base), feedbackRecord({ ...base, phase: undefined })).outcome, 'diverged', 'phase gehört zum Vergleich');
  assert.equal(replay.compareReplay(feedbackRecord({ reason: 'Ursache A' }), feedbackRecord({ reason: 'Ursache B' })).outcome, 'diverged', 'reason gehört zum Vergleich');
});

test('Normalisierung entfernt nur nachweislich flüchtige Felder', () => {
  const first = replay.normalize({ format: 'practice', reason: 'Kante fehlt', params: { diameter: 6 }, verification: { passed: false, checks: [{ actual: 6 }] },
    ms: 1, elapsedMs: 2, outputPath: 'C:/a', image: 'data:image/png;base64,AAA', freshRevision: 'frisch-A', nested: { startedAt: 'x', duration: 3, value: 1 } });
  assert.deepEqual(first, { format: 'practice', reason: 'Kante fehlt', params: { diameter: 6 }, verification: { passed: false, checks: [{ actual: 6 }] }, nested: { value: 1 } });
  assert.notDeepEqual(replay.normalize({ params: { diameter: 6 } }), replay.normalize({ params: { diameter: 8 } }), 'fachliche Parameter bleiben sichtbar');
  assert.notDeepEqual(replay.normalize({ format: 'practice' }), replay.normalize({ format: 'agent' }), 'format wird nicht als Zeitfeld entfernt');
  assert.deepEqual(replay.normalize({ elapsedMs: 1, startedAt: 'a', outputPath: 'C:/a', image: 'data:image/png;base64,AAA', freshRevision: 'frisch-A' }),
    replay.normalize({ elapsedMs: 9, startedAt: 'b', outputPath: 'D:/b', image: 'data:image/png;base64,BBB', freshRevision: 'frisch-B' }), 'Zeiten, Pfade, Bilder und Fensterkennung bleiben neutral');
});

test('Infrastruktur- und Abbruchfehler werden nicht als Produktregression gemeldet', () => {
  const passed = { id: 'orig', status: 'completed', cleanExit: true, verification: { passed: true }, events: [{ type: 'response', round: 0, text: '{}' }] };
  const brokenReplay = { id: 'rep', status: 'failed', cleanExit: false, error: { code: 'EPERM', message: 'gesperrt' }, events: [{ type: 'response', round: 0, text: '{}' }] };
  const replayResult = replay.compareReplay(passed, brokenReplay);
  assert.equal(replayResult.outcome, 'diverged', 'Infrastruktur der Wiedergabe ist keine regression');
  assert.equal(replayResult.infrastructure, true);
  assert.equal(replayResult.replay.failureClass, 'infrastructure');
  const cancelledReplay = { ...brokenReplay, id: 'rep-cancelled', status: 'cancelled', cleanExit: true, error: undefined };
  assert.equal(replay.compareReplay(passed, cancelledReplay).outcome, 'diverged', 'Abbruch ist keine regression');
  const brokenOriginal = { id: 'orig-b', status: 'failed', cleanExit: false, error: { code: 'HOST_EXIT', message: 'unterbrochen' }, verification: { passed: false }, events: [{ type: 'response', round: 0, text: '{}' }] };
  const originalResult = replay.compareReplay(brokenOriginal, passed);
  assert.equal(originalResult.outcome, 'diverged', 'Infrastruktur des Originals ist kein fixed');
  assert.equal(originalResult.infrastructure, true);
  assert.equal(originalResult.original.failureClass, 'infrastructure');
  assert.equal(replay.compareReplay(passed, { ...passed, id: 'rep-native', verification: { passed: false } }).outcome, 'regression', 'echter nativer Unterschied bleibt regression');
});

test('Wiedergabe-Marker wird vor dem Speichern persistiert und sperrt nach Neulesen', async t => {
  const original = await recordOriginal(t);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'formnaro-replay-marker-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const report = await replay.replayRecords([original], { createRunner: (provider, transcript, live = {}) => labIn(directory, provider, replay.replayCredentials(transcript), live.onEvent) });
  const replayRunId = report.results[0].replayRunId;
  assert.equal(typeof replayRunId, 'string');
  const disk = JSON.parse(fs.readFileSync(path.join(directory, 'run-' + replayRunId + '.json'), 'utf8'));
  assert.equal(disk.replay?.sourceRunId, original.id, 'Marker steht auf Platte');
  assert.equal(disk.replay?.transcriptHash, report.results[0].transcriptHash);
  assert.equal(disk.replay?.fixtureHash, original.fixtureHash);
  assert.match(replay.replayBlocker(disk), /nicht erneut/, 'gespeicherter Wiedergabelauf ist gesperrt');

  // Neustart/Neulesen: neue Instanz über dasselbe Verzeichnis liest den Marker von Platte.
  const reloaded = createDiagnostics({
    app: {}, directory, reviewerEnabled: false,
    provider: { testConnection: async () => ({ models: [model] }), completeModel: async () => { throw Error('Kein Modell im Test.'); } },
    credentials: () => ({ key: 'kein-schluessel', config: { baseUrl: 'http://localhost', model } }),
    openChild: () => ({ call: async () => ({}), cancel() {}, async close() { return { code: 0, signal: null }; } }),
  });
  const loaded = reloaded.read(replayRunId);
  assert.equal(loaded.replay?.sourceRunId, original.id, 'Neulesen liefert denselben Marker');
  assert.equal(replay.replayBlocker(loaded), replay.replayBlocker(disk));
  const blocked = await replay.replayRecords([loaded], { createRunner: () => { throw Error('Ein Wiedergabelauf darf nicht erneut starten.'); } });
  assert.equal(blocked.results[0].outcome, 'not-replayable');
  assert.match(blocked.results[0].reason, /nicht erneut/);
});

test('Zwei Wiedergaben erhalten eigene Berichte, frühere Berichte bleiben bytegleich', async t => {
  const original = await recordOriginal(t);
  const seriesId = original.spec.seriesId, directory = fs.mkdtempSync(path.join(os.tmpdir(), 'formnaro-replay-reports-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const legacyFile = path.join(directory, 'Wiedergabe-' + seriesId + '.json');
  fs.writeFileSync(legacyFile, '{"alt":"unveraendert"}\n');
  const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const legacyHash = sha(legacyFile);
  const { events, ...summary } = original;
  const diagnostics = { state: () => ({ records: [summary] }), read: () => original };
  const createRunner = (provider, transcript) => lab(t, provider, replay.replayCredentials(transcript));
  const first = await replay.replaySeries({ diagnostics, seriesId, directory, createRunner });
  const firstBytes = fs.readFileSync(first.path);
  const firstReplayRunId = JSON.parse(firstBytes.toString('utf8')).results[0].replayRunId;
  const second = await replay.replaySeries({ diagnostics, seriesId, directory, createRunner });
  assert.notEqual(first.path, second.path, 'eigener Bericht je Wiedergabe');
  assert.notEqual(first.replayId, second.replayId);
  assert.equal(path.basename(path.dirname(first.path)), seriesId);
  assert.deepEqual(fs.readFileSync(first.path), firstBytes, 'erster Bericht bleibt bytegleich');
  assert.equal(sha(legacyFile), legacyHash, 'früherer fester Bericht bleibt bytegleich');
  const saved = JSON.parse(firstBytes.toString('utf8'));
  assert.equal(saved.replayId, first.replayId);
  assert.equal(saved.seriesId, seriesId);
  assert.equal(saved.results[0].replayRunId, firstReplayRunId);
  assert.equal(typeof saved.results[0].transcriptHash, 'string');
  assert.equal(saved.results[0].fixtureHash, original.fixtureHash);
  assert.equal(saved.results[0].fixtureFile, original.fixture.file);
  assert.equal(saved.results[0].fixtureOrigin.runId, original.id);
  const savedSecond = JSON.parse(fs.readFileSync(second.path, 'utf8'));
  assert.equal(savedSecond.replayId, second.replayId);
  assert.notEqual(savedSecond.results[0].replayRunId, firstReplayRunId, 'eigene Wiedergabe-ID je Lauf');
});

test('Unvollständiger Wiedergabeabschluss wird gespeichert und sperrt erneut', async t => {
  const project = { nodes: [{ id: 'protected', name: 'Unbeteiligtes Teil' }] };
  const fixtureHash = crypto.createHash('sha256').update(JSON.stringify(project)).digest('hex');
  const record = {
    id: 'incomplete-source', status: 'completed', requestedModel: model, spec: { caseId: 'drill', workflow: 'practice', stage: 'start' },
    fixtureHash,
    initialState: { revision, objectCount: 1, objects: [], truncated: false },
    fixture: { format: 'FormnaroLabFixture', version: 1, file: 'fixture-drill.json', hash: fixtureHash, revision, objectCount: 1, objects: [], truncated: false, project },
    events: [{ type: 'incomplete-response', round: 0, text: '{"abg' }],
  };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'formnaro-replay-incomplete-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const report = await replay.replayRecords([record], { createRunner: (provider, transcript, live = {}) => labIn(directory, provider, replay.replayCredentials(transcript), live.onEvent) });
  const [result] = report.results;
  assert.equal(typeof result.replayRunId, 'string');
  assert.equal(result.replay.status, 'truncated', 'unvollständiger Abschluss bleibt als solcher erkennbar');
  const disk = JSON.parse(fs.readFileSync(path.join(directory, 'run-' + result.replayRunId + '.json'), 'utf8'));
  assert.equal(disk.status, 'truncated');
  assert.equal(disk.replay?.sourceRunId, record.id, 'auch unvollständige Wiedergaben tragen den Marker');
  assert.match(replay.replayBlocker(disk), /nicht erneut/);
});

// Korrekturpfad: Antwort in Runde 0, native Rückmeldung mit Messwerten in
// Runde 0, nächste Antwort in Runde 1 (wie ai-diagnostics.cjs:149–153).
const measurementRecord = (volume, freshRevision = 'frisch-1') => ({
  id: 'korrektur', status: 'completed', cleanExit: true, verification: { passed: true },
  events: [
    { type: 'response', round: 0, text: '{}' },
    { type: 'practice-ui-feedback', round: 0, phase: 'native-verification', verification: { passed: false, checks: [{ name: 'worldBounds.size', actual: [20, 10, 8] }] },
      measurements: [{ id: 'original', name: 'Aufgabenteil', worldBounds: { center: [0, 0, 0], size: [10, 10, 10] }, volume }], freshRevision },
    { type: 'response', round: 1, text: '{}' },
  ],
});

test('Geänderte native Messwerte vor der nächsten Antwort gelten als Abweichung', () => {
  const result = replay.compareReplay(measurementRecord(100, 'frisch-A'), measurementRecord(200, 'frisch-B'));
  assert.equal(result.outcome, 'diverged', 'Volumen 100 vs 200 muss eine Abweichung ergeben');
  assert.equal(result.divergedAtRound, 0, 'Abweichung wird vor der nächsten Antwort erkannt');
  assert.deepEqual([...replay.feedbackByRound(measurementRecord(100)).keys()], [0]);
  assert.equal(replay.compareReplay(measurementRecord(100, 'frisch-A'), measurementRecord(100, 'frisch-B')).outcome, 'reproduced', 'freshRevision bleibt flüchtig');
});

test('Korrekturpfad speichert die übermittelten nativen Messwerte im Ereignis', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'formnaro-replay-measurements-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const project = { nodes: [{ id: 'original', name: 'Aufgabenteil' }, { id: 'guard-private-id', name: 'Unbeteiligtes Teil', locked: true }] };
  const snapshot = {
    scene: {
      revision,
      objects: [
        { id: 'original', name: 'Aufgabenteil', target: { path: [] }, kind: 'cad', solid: true, solids: 1, worldBounds: { center: [0, 0, 0], size: [10, 10, 10] }, volume: 100 },
        { id: 'guard-private-id', name: 'private-unselected-name', target: { path: [] } },
      ],
      selectionTargets: [{ rootId: 'original', path: [] }], selection: ['original'],
    },
    project, context: {},
  };
  let turns = 0;
  const runner = createDiagnostics({
    app: {}, directory, reviewerEnabled: false,
    credentials: () => ({ key: 'fixture', config: { baseUrl: 'https://api.deepseek.com', model } }),
    provider: {
      testConnection: async () => ({ models: [model] }),
      completeModel: async (c, k, e) => {
        e.onDiagnostic?.({ type: 'request' });
        turns++;
        return {
          data: { model, usage: { input_tokens: 1, output_tokens: 1 } },
          text: JSON.stringify({ revision, ...(turns === 2 ? { diagnosis: 'The native result has the wrong center and size.' } : {}), assistant: { kind: 'practice', plan: { version: 1, title: 'Native correction', actions: [{ kind: 'shape', type: 'box', as: 'body' }] } } }),
        };
      },
    },
    openChild: () => ({
      call: async method => method === 'setup' ? structuredClone(snapshot)
        : method === 'snapshot' ? structuredClone(snapshot) : method === 'capture' ? 'data:image/png;base64,AQID' : {},
      close: async () => ({ code: 0, signal: null }), cancel() {},
    }),
    runPractice: async () => ({ result: { ok: true, steps: [{ observation: {} }] }, project: structuredClone(project) }),
  });
  await runner.start({ mode: 'lab', plan: { ...preset('practice-functions'), caseIds: ['practice-01'], efforts: ['low'], monitor: { mode: 'off' } }, deferReview: true });
  const record = runner.read(runner.state().records[0].id);
  const feedback = record.events.find(e => e.type === 'practice-ui-feedback' && e.phase === 'native-verification');
  assert.ok(feedback, 'native Korrekturrückmeldung fehlt');
  assert.ok(Array.isArray(feedback.measurements) && feedback.measurements.length > 0, 'Messwerte müssen im Ereignis gespeichert sein');
  assert.equal(feedback.measurements[0].id, 'original');
  assert.equal(feedback.measurements[0].name, 'Aufgabenteil');
  assert.equal(typeof feedback.measurements[0].volume, 'number');
  assert.ok(feedback.measurements[0].worldBounds);
  assert.equal(feedback.verification.passed, false);
  assert.equal(typeof feedback.freshRevision, 'string');
  assert(!JSON.stringify(feedback.measurements).includes('guard-private-id'), 'unbeteiligte Teile bleiben außen vor');
});

test('Infrastruktur-Startfehler sichern den Serienbericht als unvollständig', async t => {
  const first = await recordOriginal(t);
  const second = { ...structuredClone(first), id: crypto.randomUUID() };
  const seriesId = first.spec.seriesId, directory = fs.mkdtempSync(path.join(os.tmpdir(), 'formnaro-replay-infra-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const records = [first, second];
  const diagnostics = { state: () => ({ records: records.map(({ id, spec }) => ({ id, spec })) }), read: id => records.find(record => record.id === id) };
  let calls = 0;
  const createRunner = (provider, transcript) => {
    calls++;
    if (calls === 2) return { async start() { throw Object.assign(Error('EPERM: Zugriff auf das Wiedergabeverzeichnis verweigert'), { code: 'EPERM' }); }, state: () => ({ records: [] }), read() { throw Error('kein Wiedergabelauf'); } };
    return lab(t, provider, replay.replayCredentials(transcript));
  };
  const report = await replay.replaySeries({ diagnostics, seriesId, directory, createRunner });
  assert.equal(fs.existsSync(report.path), true, 'Bericht existiert trotz Infrastrukturfehler');
  const saved = JSON.parse(fs.readFileSync(report.path, 'utf8'));
  assert.equal(saved.incomplete, true);
  assert.equal(typeof saved.incompleteReason, 'string');
  assert.deepEqual(saved.infrastructureErrors.map(entry => [entry.sourceRunId, entry.code]), [[second.id, 'EPERM']]);
  assert.equal(saved.results.length, 2, 'abgeschlossener Lauf und Startfehler stehen im Bericht');
  assert.equal(typeof saved.results[0].replayRunId, 'string', 'bereits abgeschlossener Lauf bleibt erhalten');
  assert.notEqual(saved.results[0].outcome, 'not-comparable');
  assert.equal(saved.results[1].outcome, 'not-comparable');
  assert.equal(saved.results[1].infrastructure, true);
  assert.equal(saved.results[1].error.code, 'EPERM');
  assert.equal(saved.summary.incomplete, true);
  assert.ok(saved.summary.infrastructureFailures.includes(second.id));
  assert(!saved.results.some(result => result.outcome === 'reproduced'), 'keine stille Erfolgsmeldung');
});

test('Diagnostik-Schreibfehler (LAB_STORAGE_FAILED) bricht die Serie nicht ab', async t => {
  const first = await recordOriginal(t);
  const second = { ...structuredClone(first), id: crypto.randomUUID() };
  const seriesId = first.spec.seriesId, directory = fs.mkdtempSync(path.join(os.tmpdir(), 'formnaro-replay-storage-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const records = [first, second];
  const diagnostics = { state: () => ({ records: records.map(({ id, spec }) => ({ id, spec })) }), read: id => records.find(record => record.id === id) };
  let calls = 0;
  const createRunner = (provider, transcript) => {
    calls++;
    if (calls === 2) return { async start() { throw Object.assign(Error('Laborprotokoll konnte nicht gespeichert werden.'), { code: 'LAB_STORAGE_FAILED', causeCode: 'EPERM' }); }, state: () => ({ records: [] }), read() { throw Error('kein Wiedergabelauf'); } };
    return lab(t, provider, replay.replayCredentials(transcript));
  };
  const report = await replay.replaySeries({ diagnostics, seriesId, directory, createRunner });
  assert.equal(fs.existsSync(report.path), true, 'Bericht existiert trotz Schreibfehler');
  const saved = JSON.parse(fs.readFileSync(report.path, 'utf8'));
  assert.equal(saved.incomplete, true);
  assert.deepEqual(saved.infrastructureErrors.map(entry => [entry.sourceRunId, entry.code, entry.causeCode]), [[second.id, 'LAB_STORAGE_FAILED', 'EPERM']], 'zugrunde liegender Schreibfehler bleibt sichtbar');
  assert.equal(saved.results.length, 2);
  assert.equal(saved.results[1].outcome, 'not-comparable');
  assert.equal(saved.results[1].infrastructure, true);
  assert.equal(saved.results[1].error.code, 'LAB_STORAGE_FAILED');
  assert.equal(saved.results[1].error.causeCode, 'EPERM');
  assert.ok(saved.summary.infrastructureFailures.includes(second.id));
  assert(!saved.results.some(result => result.outcome === 'reproduced'), 'keine stille Erfolgsmeldung');
});

test('EPERM beim Anlegen der Laborinstanz erhält den unvollständigen Serienbericht', async t => {
  const first = await recordOriginal(t);
  const second = { ...structuredClone(first), id: crypto.randomUUID() };
  const seriesId = first.spec.seriesId, directory = fs.mkdtempSync(path.join(os.tmpdir(), 'formnaro-replay-create-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const records = [first, second];
  const diagnostics = { state: () => ({ records: records.map(({ id, spec }) => ({ id, spec })) }), read: id => records.find(record => record.id === id) };
  let calls = 0;
  const createRunner = (provider, transcript) => {
    calls++;
    if (calls === 2) throw Object.assign(Error('EPERM: Wiedergabeverzeichnis konnte nicht angelegt werden'), { code: 'EPERM' });
    return lab(t, provider, replay.replayCredentials(transcript));
  };
  const report = await replay.replaySeries({ diagnostics, seriesId, directory, createRunner });
  assert.equal(fs.existsSync(report.path), true, 'Bericht existiert trotz Anlegefehler');
  const saved = JSON.parse(fs.readFileSync(report.path, 'utf8'));
  assert.equal(saved.incomplete, true);
  assert.deepEqual(saved.infrastructureErrors.map(entry => [entry.sourceRunId, entry.code]), [[second.id, 'EPERM']]);
  assert.equal(saved.results.length, 2);
  assert.equal(typeof saved.results[0].replayRunId, 'string', 'bereits abgeschlossener Lauf bleibt erhalten');
  assert.equal(saved.results[1].outcome, 'not-comparable');
  assert.equal(saved.results[1].infrastructure, true);
  assert.equal(saved.results[1].error.code, 'EPERM');
  assert.equal(saved.summary.incomplete, true);
  assert(!saved.results.some(result => result.outcome === 'reproduced'), 'keine stille Erfolgsmeldung');
});

test('Nicht-infrastrukturelle Startfehler brechen die Serie weiterhin ab', async t => {
  const original = await recordOriginal(t);
  const seriesId = original.spec.seriesId, directory = fs.mkdtempSync(path.join(os.tmpdir(), 'formnaro-replay-fatal-start-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const diagnostics = { state: () => ({ records: [{ id: original.id, spec: original.spec }] }), read: () => original };
  const createRunner = () => ({ async start() { throw Object.assign(Error('BOOM: unbekannter Startfehler'), { code: 'REPLAY_BROKEN' }); }, state: () => ({ records: [] }), read() { throw Error('kein Wiedergabelauf'); } });
  await assert.rejects(replay.replaySeries({ diagnostics, seriesId, directory, createRunner }), /BOOM: unbekannter Startfehler/);
  assert.equal(fs.existsSync(path.join(directory, seriesId)), false, 'kein als vollständig erscheinender Bericht');
});

test('Wiedergabe stoppt vor der nächsten gespeicherten Antwort bei früher Abweichung', async t => {
  const original = await recordOriginal(t);
  const older = structuredClone(original);
  older.events.find(e => e.type === 'tool-result' && e.round === 0).result = { kind: 'older-contract' };
  let served = 0, replayRun = null;
  const report = await replay.replayRecords([older], {
    createRunner: (provider, transcript, live = {}) => {
      const counting = { ...provider, completeModel: async (...args) => { const value = await provider.completeModel(...args); served++; return value; } };
      const runner = lab(t, counting, replay.replayCredentials(transcript), live.onEvent);
      const read = runner.read; runner.read = id => (replayRun = read(id));
      return runner;
    },
  });
  const [result] = report.results;
  assert.equal(result.outcome, 'diverged');
  assert.equal(result.divergedAtRound, 0);
  assert.equal(served, 1, 'die zweite gespeicherte Antwort darf nicht mehr ausgegeben werden');
  assert.deepEqual(result.earlyStop, { answerIndex: 1, round: 0 }, 'Früh-Stopp vor Antwort-Index 1 in Runde 0');
  assert.equal(result.unusedResponses, 1);
  assert.equal(result.replay.error, 'REPLAY_EARLY_DIVERGENCE');
  assert.deepEqual([...replay.feedbackByRound(replayRun).keys()], [0], 'Runde 1 wurde nicht mehr gespielt');
});

test('Ohne Live-Ereignisse bleibt es beim Nachher-Vergleich ohne Früh-Stopp', async t => {
  const original = await recordOriginal(t);
  const older = structuredClone(original);
  older.events.find(e => e.type === 'tool-result' && e.round === 0).result = { kind: 'older-contract' };
  let served = 0;
  const report = await replay.replayRecords([older], {
    // Aufrufer reicht `onEvent` absichtlich nicht weiter.
    createRunner: (provider, transcript) => {
      const counting = { ...provider, completeModel: async (...args) => { const value = await provider.completeModel(...args); served++; return value; } };
      return lab(t, counting, replay.replayCredentials(transcript));
    },
  });
  const [result] = report.results;
  assert.equal(result.outcome, 'diverged');
  assert.equal(result.divergedAtRound, 0);
  assert.equal(served, 2, 'ohne Live-Ereignisse wird die Aufzeichnung vollständig gespielt');
  assert.equal(result.earlyStop, null);
  assert.equal(result.unusedResponses, 0);
});

test('N1: Fehlende Rückmeldung bei angeschlossenem Kanal stoppt die Wiedergabe früh', async t => {
  const original = await recordOriginal(t);
  const { result, served } = await replayChannelCase(t, original, 'suppressed-feedback');
  assert.equal(served, 1, 'genau eine gespeicherte Antwort bei ausgebliebener Rückmeldung');
  assert.equal(result.outcome, 'diverged');
  assert.equal(result.divergedAtRound, 0);
  assert.deepEqual(result.earlyStop, { answerIndex: 1, round: 0 });
  assert.equal(result.unusedResponses, 1);
  assert.equal(result.replay.error, 'REPLAY_EARLY_DIVERGENCE');
});

test('N1: Identische Rückmeldungen und fehlender Kanal spielen vollständig ohne Früh-Stopp', async t => {
  const original = await recordOriginal(t);
  const identical = await replayChannelCase(t, original, 'identical');
  assert.equal(identical.served, 2, 'identische Rückmeldungen: vollständige Wiedergabe');
  assert.equal(identical.result.earlyStop, null);
  const noChannel = await replayChannelCase(t, original, 'no-channel');
  assert.equal(noChannel.served, 2, 'ohne Kanal bleibt der Nachher-Vergleich');
  assert.equal(noChannel.result.earlyStop, null);
});

test('N2: LAB_INFRASTRUCTURE_FAILED mit Laufprotokoll erhält den unvollständigen Serienbericht', async t => {
  const first = await recordOriginal(t);
  const second = { ...structuredClone(first), id: crypto.randomUUID() };
  const seriesId = first.spec.seriesId, directory = fs.mkdtempSync(path.join(os.tmpdir(), 'formnaro-replay-lab-infra-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const records = [first, second];
  const diagnostics = { state: () => ({ records: records.map(({ id, spec }) => ({ id, spec })) }), read: id => records.find(record => record.id === id) };
  let calls = 0;
  const createRunner = (provider, transcript) => {
    calls++;
    if (calls !== 2) return lab(t, provider, replay.replayCredentials(transcript));
    // Protokoll vorhanden (cleanExit:false, kein error.code) => failureClass
    // 'infrastructure'; der Start wirft den Serienabbruch-Code der Diagnostik.
    const broken = { id: 'replay-broken', status: 'failed', cleanExit: false, events: [] };
    return {
      async start() { throw Object.assign(Error('Technischer Laborfehler; Serie gestoppt.'), { code: 'LAB_INFRASTRUCTURE_FAILED' }); },
      state() { return { records: [broken] }; },
      read() { return broken; },
    };
  };
  const report = await replay.replaySeries({ diagnostics, seriesId, directory, createRunner });
  const saved = JSON.parse(fs.readFileSync(report.path, 'utf8'));
  assert.equal(saved.incomplete, true);
  assert.deepEqual(saved.infrastructureErrors.map(entry => [entry.sourceRunId, entry.code, entry.failureClass]), [[second.id, 'LAB_INFRASTRUCTURE_FAILED', 'infrastructure']]);
  assert.equal(saved.results.length, 2);
  assert.equal(typeof saved.results[0].replayRunId, 'string', 'erster Lauf bleibt erhalten');
  assert.equal(saved.results[1].outcome, 'not-comparable');
  assert.equal(saved.results[1].infrastructure, true);
  assert.equal(saved.results[1].error.code, 'LAB_INFRASTRUCTURE_FAILED');
  assert.equal(saved.results[1].error.failureClass, 'infrastructure');
  assert.equal(saved.summary.incomplete, true);
});