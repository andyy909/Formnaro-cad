'use strict';
// Wiedergabe gespeicherter KI-Labor-Läufe ohne Anbieteranfrage.
//
// Ein gespeicherter Lauf enthält je Runde die wörtliche Modellantwort (`response`)
// und die Rückmeldung der Anwendung (`tool-result`, `format-feedback`,
// `practice-ui-feedback`). Die
// Wiedergabe setzt dieselben Antworten in derselben Reihenfolge gegen den
// aktuellen Programmstand ein. Die Anwendung rechnet, prüft und bewertet dabei
// vollständig neu; nur das Modell wird durch die Aufzeichnung ersetzt.
//
// Eine Wiedergabe ist niemals ein Modellergebnis: Die zurückgegebene
// Modellkennung lautet `replay:<modell>`, verbraucht keine Tokens und erfüllt
// deshalb nie die exakte Modellidentität, die Benchmarkerfolge verlangen.

const crypto = require('node:crypto'), fs = require('node:fs'), path = require('node:path');
const { failureClass } = require('./ai-lab-storage.cjs');

const REPLAY_PREFIX = 'replay:';

// Felder, die sich zwischen zwei identischen Abläufen ändern dürfen (Zeiten,
// Pfade, Bilder, Kennung des frischen Übungsfensters). Nur exakte Namen und
// schreibungsabhängige CamelCase-Suffixe; fachliche Felder wie `params`,
// `format`, `reason` oder `verification` bleiben erhalten.
const VOLATILE_KEYS = new Set(['ms', 'at', 'time', 'timestamp', 'nonce', 'runId', 'resultRef', 'path', 'file', 'directory', 'dataBase64', 'image', 'images', 'screenshot', 'duration', 'freshRevision']);
const VOLATILE_SUFFIX = /(?:Ms|At|Path|Seconds|Duration)$/;
const volatileKey = key => VOLATILE_KEYS.has(key) || VOLATILE_SUFFIX.test(key);

const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'string') return value.startsWith('data:image/') ? '<image>' : value;
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) if (!volatileKey(key)) out[key] = normalize(value[key]);
  return out;
}

const modelerEvent = e => e && e.role !== 'supervisor';
// Eine Modellantwort: regulär (`response`) oder am Ausgabelimit abgeschnitten
// (`incomplete-response`, nur mit gespeichertem Text wiedergabefähig).
const isAnswer = e => modelerEvent(e) && ['response', 'incomplete-response'].includes(e.type) && typeof e.text === 'string';

// Rückmeldungen der Anwendung je Runde, normalisiert und gehasht.
// Entscheidungsrelevant sind Werkzeug-/Formatrückmeldungen und die Korrektur-
// wege des Übungsfensters (`practice-ui-feedback`: reason/phase/verification und
// die tatsächlich übermittelten nativen Messwerte). `freshRevision` ist flüchtig
// (frisches Fenster) und geht nicht in den Vergleich ein.
const FEEDBACK_TYPES = ['tool-result', 'format-feedback', 'practice-ui-feedback'];

// Eine Rückmeldung in vergleichbarer Form; null = nicht entscheidungsrelevant.
const feedbackEntry = e => {
  if (!modelerEvent(e) || !FEEDBACK_TYPES.includes(e.type) || !Number.isInteger(e.round)) return null;
  return e.type === 'practice-ui-feedback'
    ? { type: e.type, phase: e.phase, reason: e.reason, verification: e.verification, measurements: e.measurements }
    : { type: e.type, tool: e.tool, result: e.result, error: e.error };
};
const hashFeedback = list => hash(normalize(list));

function feedbackByRound(record) {
  const rounds = new Map();
  for (const e of record.events ?? []) {
    const entry = feedbackEntry(e);
    if (!entry) continue;
    const list = rounds.get(e.round) ?? [];
    list.push(entry);
    rounds.set(e.round, list);
  }
  return new Map([...rounds].map(([round, list]) => [round, hashFeedback(list)]));
}

// Warum ein Lauf nicht wiedergegeben werden kann; null = wiedergabefähig.
function replayBlocker(record) {
  if (!record || !Array.isArray(record.events)) return 'Kein gespeicherter Lauf.';
  if (record.replay) return 'Eine Wiedergabe wird nicht erneut wiedergegeben.';
  if ((record.spec?.monitor?.mode ?? 'off') === 'active') return 'Aktiver Überwacher kann den Ablauf verändern.';
  if (record.events.some(e => modelerEvent(e) && e.type === 'incomplete-response' && typeof e.text !== 'string')) return 'Abgeschnittene Antwort ohne gespeicherten Text.';
  if (record.events.some(e => modelerEvent(e) && e.type === 'start-image')) return 'Startbilder werden in dieser Ausbaustufe nicht wiedergegeben.';
  if (!record.events.some(isAnswer)) return 'Keine gespeicherte Modellantwort.';
  if (record.status === 'running' || record.status === 'interrupted') return 'Lauf wurde nicht regulär beendet.';
  return null;
}

// Original-Fixture aus einem gespeicherten Lauf: Ausgangsprojekt, Hash,
// Ausgangsrevision, Objektbezüge und Herkunft. Fehlt sie oder widerspricht sie
// dem gespeicherten Hash, ist die Wiedergabe ausdrücklich nicht vergleichbar.
function replayFixture(record) {
  const fail = message => Object.assign(Error(message), { code: 'REPLAY_FIXTURE_MISSING' });
  const saved = record?.fixture;
  if (!saved || typeof saved !== 'object' || !saved.project || typeof saved.project !== 'object')
    throw fail('Ausgangsmodell fehlt im gespeicherten Lauf; die Wiedergabe ist nicht vergleichbar.');
  if (!record.initialState || typeof record.initialState.revision !== 'string')
    throw fail('Ausgangsrevision fehlt im gespeicherten Lauf; die Wiedergabe ist nicht vergleichbar.');
  const recordedHash = typeof record.fixtureHash === 'string' ? record.fixtureHash : typeof saved.hash === 'string' ? saved.hash : null;
  if (!recordedHash) throw fail('Fixture-Hash fehlt im gespeicherten Lauf; die Wiedergabe ist nicht vergleichbar.');
  if (hash(saved.project) !== recordedHash) throw fail('Ausgangsmodell stimmt nicht mit dem gespeicherten Fixture-Hash überein; die Wiedergabe ist nicht vergleichbar.');
  if (typeof saved.revision === 'string' && saved.revision !== record.initialState.revision)
    throw fail('Ausgangsrevision und gespeichertes Ausgangsmodell widersprechen sich; die Wiedergabe ist nicht vergleichbar.');
  return {
    format: 'FormnaroLabFixture',
    version: 1,
    project: saved.project,
    hash: recordedHash,
    revision: record.initialState.revision,
    objectCount: Number.isSafeInteger(saved.objectCount) ? saved.objectCount : record.initialState.objectCount,
    objects: Array.isArray(saved.objects) ? saved.objects : Array.isArray(record.initialState.objects) ? record.initialState.objects : [],
    truncated: saved.truncated === true || record.initialState.truncated === true,
    file: typeof saved.file === 'string' ? saved.file : null,
    origin: {
      runId: record.id ?? null,
      sourceHash: record.sourceHash ?? null,
      requestedModel: record.requestedModel ?? null,
      caseId: record.spec?.caseId ?? null,
      dataset: record.spec?.dataset ?? 'development',
      seriesId: record.spec?.seriesId ?? null,
    },
  };
}

function extractTranscript(record) {
  const blocker = replayBlocker(record);
  if (blocker) throw Object.assign(Error(blocker), { code: 'NOT_REPLAYABLE' });
  const fixture = replayFixture(record);
  const responses = record.events.filter(isAnswer)
    .map(e => ({ round: e.round, text: e.text, ...(e.type === 'incomplete-response' ? { incomplete: true } : {}) }));
  return {
    format: 'FormnaroReplayTranscript',
    version: 2,
    sourceRunId: record.id,
    sourceHash: record.sourceHash,
    requestedModel: record.requestedModel,
    spec: record.spec,
    fixture,
    responses,
    // Der Transcript-Hash deckt Antworten und Ausgangsmodell gemeinsam.
    transcriptHash: hash({ responses, fixtureHash: fixture.hash }),
  };
}

// Ersetzt `provider.completeModel` für genau einen Lauf.
// `beforeAnswer(index)` wird von replayRecords gesetzt: Liefert es eine Runde,
// weicht die bereits erfasste Rückmeldung vom Original ab. Die nächste
// gespeicherte Antwort wird dann NICHT mehr ausgegeben (früher Stopp).
function createReplayProvider(transcript) {
  let next = 0;
  const provider = {
    get used() { return next; },
    get remaining() { return transcript.responses.length - next; },
    beforeAnswer: null,
    stoppedBefore: null,
    // Bildfähig melden: Rückmeldungen des Übungsfensters können Bilder enthalten.
    testConnection: async () => ({ models: [transcript.requestedModel], details: [{ id: transcript.requestedModel, input_modalities: ['text', 'image'] }] }),
    async completeModel(config, key, envelope, signal) {
      signal?.throwIfAborted?.();
      if (envelope?.system?.includes('independent Formnaro experiment supervisor'))
        throw Object.assign(Error('Wiedergabe ohne Überwacher.'), { code: 'REPLAY_SUPERVISOR' });
      envelope?.onDiagnostic?.({ type: 'request', body: { model: REPLAY_PREFIX + transcript.requestedModel } });
      if (next >= transcript.responses.length)
        throw Object.assign(Error('Aufzeichnung erschöpft: Der aktuelle Programmstand verlangt mehr Runden als der Originallauf.'), { code: 'REPLAY_EXHAUSTED' });
      const round = transcript.responses[next].round;
      const divergentRound = typeof provider.beforeAnswer === 'function' ? provider.beforeAnswer(next) : null;
      if (divergentRound !== null && divergentRound !== undefined) {
        provider.stoppedBefore = { answerIndex: next, round: divergentRound };
        throw Object.assign(Error('Wiedergabe stoppt vor der nächsten gespeicherten Antwort: die Rückmeldung in Runde ' + divergentRound + ' weicht vom Originallauf ab.'), { code: 'REPLAY_EARLY_DIVERGENCE', divergentRound });
      }
      const { text, incomplete } = transcript.responses[next++];
      return { text, data: { model: REPLAY_PREFIX + transcript.requestedModel, replay: true, ...(incomplete ? { status: 'incomplete' } : {}), usage: { input_tokens: 0, output_tokens: 0 } } };
    },
  };
  return provider;
}

// Zugangsdaten für die Wiedergabe-Instanz. Sie enthalten keinen echten Schlüssel
// und zeigen auf localhost, damit weder Modellkatalog noch Anmeldung des echten
// Anbieters berührt werden. `connections` der Hauptinstanz NICHT weiterreichen.
function replayCredentials(transcript) {
  return () => ({ key: 'replay-no-key', config: { baseUrl: 'http://localhost', model: transcript.requestedModel } });
}

// Laborplan, der genau die Bedingung des Originallaufs erneut ausführt.
// Die Denkstufe geht nur an den Anbieter; die Wiedergabe nutzt deshalb `auto`,
// das für jedes Modell gültig ist.
function replayPlan(spec) {
  return {
    name: 'Wiedergabe · ' + (spec.caseId ?? 'Lauf'),
    preset: spec.workflow === 'practice' ? 'practice-functions' : 'pilot',
    caseIds: [spec.caseId],
    variants: [spec.variant ?? 'C'],
    efforts: ['auto'],
    repeats: 1,
    stage: spec.stage ?? 'full',
    dataset: spec.dataset ?? 'development',
    workflow: spec.workflow ?? 'agent',
    scopes: [spec.sceneScope ?? 'selection'],
    images: [spec.imageMode ?? 'none'],
    monitor: { ...(spec.monitor ?? {}), mode: 'off' },
    ...(spec.limits ? { limits: spec.limits } : {}),
    ...(spec.customContext ? { customContext: spec.customContext } : {}),
  };
}

const nativePassed = r => r?.verification?.passed === true && r?.cleanExit === true && !r?.error;

// Fehlerklassen, die keine Aussage über das Produkt erlauben: Infrastruktur und
// Abbruch. Sie werden im Ergebnis getrennt ausgewiesen und nie als Strecken-
// regression (`regression`) oder Behebung (`fixed`) ausgegeben.
const NON_PRODUCT_FAILURE = new Set(['infrastructure', 'interrupted']);

// Startfehler der Wiedergabe-Instanz, die keine Produktaussage erlauben. Sie
// beenden den Serienbericht nicht: bereits abgeschlossene Läufe bleiben
// erhalten, der Bericht wird als unvollständig gekennzeichnet (replaySeries).
// `LAB_INFRASTRUCTURE_FAILED` ist der Code, mit dem die Diagnostik eine Serie
// nach einem infrastrukturfehlgeschlagenen Lauf abbricht; `LAB_STORAGE_FAILED`
// ist der Code des Diagnostik-Schreibfehlers (`causeCode` trägt dann z. B.
// `EPERM`). Zusätzlich entscheidet die vorhandene `failureClass` eines bereits
// vorliegenden Laufprotokolls.
const INFRASTRUCTURE_START_CODES = new Set(['EPERM', 'EACCES', 'ENOSPC', 'EBUSY', 'EMFILE', 'ENFILE', 'EIO', 'EROFS', 'LAB_STORAGE_FAILED', 'LAB_INFRASTRUCTURE_FAILED']);

// Ordnet eine Wiedergabe gegenüber ihrem Originallauf ein.
//   reproduced     beide bestanden
//   regression     Original bestanden, Wiedergabe nicht – ohne vorherige Abweichung
//   fixed          Original nicht bestanden, Wiedergabe bestanden
//   still-failing  beide nicht bestanden
//   diverged       die Anwendung meldete dem Modell vor seiner letzten Antwort etwas
//                  anderes zurück; das Modell hätte anders reagieren können → Live-Lauf nötig.
//                  Auch Infrastruktur-/Abbruchfehler landen hier: keine Produktaussage,
//                  aber ein Live-Lauf ist nötig; `infrastructure` und `failureClass`
//                  benennen den Grund.
function compareReplay(original, replay, provider) {
  const before = feedbackByRound(original), after = feedbackByRound(replay);
  const responseRounds = (original.events ?? []).filter(isAnswer).map(e => e.round);
  const lastResponseRound = Math.max(-1, ...responseRounds);
  let divergedAtRound = null;
  for (const round of [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => a - b)) {
    if (round >= lastResponseRound) break; // Danach kommt keine Modellentscheidung mehr.
    if (before.get(round) !== after.get(round)) { divergedAtRound = round; break; }
  }
  const exhausted = replay?.error?.code === 'REPLAY_EXHAUSTED';
  const unused = provider ? provider.remaining : 0;
  const originalFailure = failureClass(original), replayFailure = replay ? failureClass(replay) : 'unverified';
  const infrastructure = NON_PRODUCT_FAILURE.has(originalFailure) || NON_PRODUCT_FAILURE.has(replayFailure);
  let outcome;
  if (divergedAtRound !== null || exhausted || unused > 0 || infrastructure) outcome = 'diverged';
  else if (nativePassed(original)) outcome = nativePassed(replay) ? 'reproduced' : 'regression';
  else outcome = nativePassed(replay) ? 'fixed' : 'still-failing';
  return {
    sourceRunId: original.id,
    replayRunId: replay?.id ?? null,
    caseId: original.spec?.caseId,
    outcome,
    divergedAtRound,
    exhausted,
    infrastructure,
    unusedResponses: unused,
    original: { passed: nativePassed(original), status: original.status, sourceHash: original.sourceHash, failureClass: originalFailure },
    replay: { passed: nativePassed(replay), status: replay?.status, sourceHash: replay?.sourceHash, error: replay?.error?.code ?? null, failureClass: replayFailure },
    tokens: 0,
  };
}

// Fehlende oder abweichende Ausgangsdaten sind kein Programmfehler: Sie werden
// als eigenes Ergebnis `not-comparable` ausgewiesen und nie stillschweigend als
// `reproduced` behandelt. Ohne geprüftes Original startet keine Wiedergabe.
function notComparable(original, reason, { transcript = null, run = null, problems = null } = {}) {
  return {
    sourceRunId: original?.id ?? null,
    caseId: original?.spec?.caseId ?? null,
    outcome: 'not-comparable',
    reason,
    fixtureHash: transcript?.fixture?.hash ?? original?.fixtureHash ?? null,
    expectedRevision: transcript?.fixture?.revision ?? original?.initialState?.revision ?? null,
    actualRevision: run?.initialState?.revision ?? null,
    actualFixtureHash: run?.fixtureHash ?? null,
    fixtureOrigin: transcript?.fixture?.origin ?? null,
    ...(problems ? { fixtureProblems: problems } : {}),
    tokens: 0,
  };
}

// Herkunft der Wiedergabe, die der gespeicherte Lauf selbst tragen muss. Sie
// wird vor dem Speichern in den Record geschrieben (`start({replay})`) und
// sperrt nach Neulesen von Platte ein erneutes Wiedergeben.
const replayMarker = (original, transcript) => ({ sourceRunId: original.id, transcriptHash: transcript.transcriptHash, fixtureHash: transcript.fixture.hash });

// Gibt mehrere gespeicherte Läufe nacheinander wieder.
// `records` müssen vollständige Protokolle mit `events` sein, also aus
// `diagnostics.read(id)` – `diagnostics.state().records` enthält keine Ereignisse.
// `createRunner(provider, transcript, {onEvent})` liefert eine eigene, getrennte
// Laborinstanz: eigenes Verzeichnis, `credentials: replayCredentials(transcript)`,
// kein `connections`, Abschlussauswerter aus. So werden Wiedergaben nie mit
// echten Modelldaten vermischt und es entsteht kein Netzzugriff.
// Die Original-Fixture und der Replay-Marker gehen über `start({fixture, replay})`
// an die Wiedergabe-Instanz; der Marker steht damit in jeder Speicherung.
// Reicht die Instanz `onEvent` an `createDiagnostics` weiter, erkennt die
// Wiedergabe eine abweichende Rückmeldung VOR der nächsten gespeicherten Antwort
// und stoppt (`REPLAY_EARLY_DIVERGENCE`, `earlyStop`); ohne `onEvent` bleibt es
// beim Nachher-Vergleich.
async function replayRecords(records, { createRunner, onProgress = () => {} }) {
  const results = [];
  for (const original of records) {
    const blocker = replayBlocker(original);
    if (blocker) { results.push({ sourceRunId: original?.id, caseId: original?.spec?.caseId, outcome: 'not-replayable', reason: blocker, tokens: 0 }); continue; }
    let transcript;
    try { transcript = extractTranscript(original); }
    catch (error) {
      if (error.code !== 'REPLAY_FIXTURE_MISSING') throw error;
      const result = notComparable(original, error.message);
      results.push(result); onProgress(result); continue;
    }
    // Live-Sammler: Rückmeldungen der Wiedergabe, wie sie während des Laufs
    // entstehen. Erlaubt den Stopp VOR der nächsten gespeicherten Antwort.
    const originalFeedback = feedbackByRound(original);
    const observed = new Map();
    // Trennt "kein Ereigniskanal angeschlossen" von "Kanal angeschlossen, aber
    // erwartete Rückmeldung ausgeblieben". Jedes eintreffende Ereignis zählt,
    // nicht nur Rückmeldungen.
    let channelConnected = false;
    const observe = event => {
      channelConnected = true;
      const entry = feedbackEntry(event);
      if (!entry) return;
      const list = observed.get(event.round) ?? [];
      list.push(entry);
      observed.set(event.round, list);
    };
    const beforeAnswer = answerIndex => {
      const nextRound = transcript.responses[answerIndex]?.round;
      if (!Number.isInteger(nextRound)) return null;
      // Ohne angeschlossenen Ereigniskanal (Aufrufer reicht `onEvent` nicht
      // weiter) bleibt es beim Nachher-Vergleich; so entsteht kein falscher
      // Früh-Stopp. Ist der Kanal angeschlossen, zählt eine ausgebliebene
      // erwartete Rückmeldung als Abweichung.
      if (!channelConnected && originalFeedback.size) return null;
      for (const round of [...new Set([...originalFeedback.keys(), ...observed.keys()])].sort((a, b) => a - b)) {
        if (round >= nextRound) continue;
        const current = observed.get(round);
        if ((current ? hashFeedback(current) : null) !== (originalFeedback.get(round) ?? null)) return round;
      }
      return null;
    };
    const provider = createReplayProvider(transcript);
    provider.beforeAnswer = beforeAnswer;
    const marker = replayMarker(original, transcript);
    // Auch das Anlegen der Laborinstanz ist ein Startschritt: ein Fehler hier
    // (z. B. EPERM beim Anlegen des Wiedergabeverzeichnisses) darf den
    // Serienbericht nicht verhindern. Unbekannte Fehler werfen weiterhin.
    let runner = null;
    let startError = null;
    try { runner = createRunner(provider, transcript, { onEvent: event => observe(event?.event ?? event) }); }
    catch (error) { startError = error; }
    if (runner) {
      try { await runner.start({ mode: 'lab', plan: replayPlan(original.spec), fixture: transcript.fixture, replay: marker }); }
      catch (error) { startError = error; }
    }
    const state = runner ? runner.state().records : [];
    const started = state[state.length - 1];
    if (startError) {
      const startCode = startError?.code ?? started?.error?.code ?? null;
      if (started?.error?.code === 'REPLAY_FIXTURE_MISMATCH') {
        const result = notComparable(original, started.error.message, { transcript, run: started });
        results.push(result); onProgress(result); continue;
      }
      // Infrastruktur beim Start: ausweisen, nicht abbrechen. Bereits
      // abgeschlossene Läufe bleiben im Bericht. Neben den bekannten Codes
      // genügt die vorhandene Fehlerklassifikation eines Laufprotokolls.
      const startedFailureClass = started ? failureClass(started) : null;
      if (INFRASTRUCTURE_START_CODES.has(startCode) || startedFailureClass === 'infrastructure') {
        const startCause = startError?.causeCode ?? started?.error?.causeCode ?? null;
        const result = notComparable(original, 'Wiedergabe konnte wegen eines Infrastrukturfehlers nicht gestartet werden; Ergebnis nicht vergleichbar.', { transcript });
        Object.assign(result, { infrastructure: true, error: { code: startCode, ...(startCause ? { causeCode: startCause } : {}), ...(startedFailureClass ? { failureClass: startedFailureClass } : {}), message: startError?.message ?? started?.error?.message ?? null } });
        results.push(result); onProgress(result); continue;
      }
      throw startError;
    }
    if (!started) {
      const result = notComparable(original, 'Wiedergabe hat keinen Lauf aufgezeichnet; Ergebnis nicht vergleichbar.', { transcript });
      results.push(result); onProgress(result); continue;
    }
    const replay = runner.read(started.id);
    // Schutz gegen einen Aufrufer, der die Fixture nicht an die Instanz reicht:
    // Auch dann wird kein Ergebnis behauptet.
    if (replay?.initialState?.revision !== transcript.fixture.revision || replay?.fixtureHash !== transcript.fixture.hash) {
      const result = notComparable(original, 'Wiedergabe startete mit einem anderen Ausgangsmodell als der Originallauf; Ergebnis nicht vergleichbar.', { transcript, run: replay });
      results.push(result); onProgress(result); continue;
    }
    // Ohne dauerhaft gespeicherte Herkunft keine verifizierbare Aussage.
    if (replay?.replay?.sourceRunId !== marker.sourceRunId || replay.replay.transcriptHash !== marker.transcriptHash) {
      const result = notComparable(original, 'Herkunft der Wiedergabe wurde nicht im gespeicherten Lauf hinterlegt; Ergebnis nicht vergleichbar.', { transcript, run: replay });
      results.push(result); onProgress(result); continue;
    }
    // Ein Früh-Stopp belegt die Abweichung auch dann, wenn der Ereigniskanal die
    // erwartete Rückmeldung nicht geliefert hat und das persistierte Protokoll
    // deshalb gleich aussieht; die Runde stammt dann aus dem Früh-Stopp.
    const comparison = compareReplay(original, replay, provider);
    if (comparison.divergedAtRound === null && provider.stoppedBefore) comparison.divergedAtRound = provider.stoppedBefore.round;
    const result = { ...comparison, transcriptHash: transcript.transcriptHash, fixtureHash: transcript.fixture.hash, fixtureFile: transcript.fixture.file, fixtureOrigin: transcript.fixture.origin, earlyStop: provider.stoppedBefore };
    results.push(result);
    onProgress(result);
  }
  return { format: 'FormnaroReplayReport', version: 3, results, summary: summarize(results) };
}

// Gibt alle Läufe einer gespeicherten Serie wieder und legt den Bericht in einem
// eigenen Serienunterverzeichnis ab: `<directory>/<seriesId>/Wiedergabe-<replayId>.json`.
// `diagnostics` ist die Hauptinstanz (nur lesend: state() und read()).
// Jede Wiedergabe erhält eine eigene Berichtskennung. Frühere Berichte – auch der
// alte feste Name `Wiedergabe-<seriesId>.json` – werden nie überschrieben.
// Infrastruktur-Startfehler einzelner Läufe erhalten den Bericht und werden als
// unvollständig gekennzeichnet.
async function replaySeries({ diagnostics, seriesId, createRunner, directory, onProgress }) {
  if (!/^[a-f0-9-]{36}$/.test(seriesId ?? '')) throw Error('Ungültige Serienkennung.');
  const ids = diagnostics.state().records.filter(r => r.spec?.seriesId === seriesId).map(r => r.id);
  if (!ids.length) throw Error('Serie nicht gefunden.');
  const replayId = crypto.randomUUID();
  const report = await replayRecords(ids.map(id => diagnostics.read(id)), { createRunner, onProgress });
  const infrastructureErrors = report.results.filter(r => r.infrastructure === true && r.error).map(r => ({ sourceRunId: r.sourceRunId, code: r.error.code ?? null, ...(r.error.causeCode ? { causeCode: r.error.causeCode } : {}), ...(r.error.failureClass ? { failureClass: r.error.failureClass } : {}), message: r.error.message ?? null }));
  const incomplete = infrastructureErrors.length > 0;
  Object.assign(report, {
    replayId, seriesId, sourceRuns: ids, createdAt: new Date().toISOString(), incomplete,
    ...(incomplete ? { incompleteReason: 'Infrastrukturfehler verhinderten einzelne Wiedergaben; der Bericht enthält nur die abgeschlossenen Läufe.', infrastructureErrors } : {}),
  });
  report.summary = { ...report.summary, incomplete };
  const folder = path.join(directory, seriesId);
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, 'Wiedergabe-' + replayId + '.json');
  fs.writeFileSync(file, JSON.stringify(report, null, 2), { flag: 'wx' });
  return { ...report, path: file };
}

function summarize(results) {
  const count = {};
  for (const r of results) count[r.outcome] = (count[r.outcome] ?? 0) + 1;
  return { total: results.length, ...count, tokens: 0, liveRetestNeeded: results.filter(r => r.outcome === 'diverged').map(r => r.sourceRunId), infrastructureFailures: results.filter(r => r.infrastructure === true).map(r => r.sourceRunId) };
}

module.exports = { REPLAY_PREFIX, replayBlocker, extractTranscript, createReplayProvider, replayCredentials, replayPlan, compareReplay, replayRecords, replaySeries, feedbackByRound, normalize };
