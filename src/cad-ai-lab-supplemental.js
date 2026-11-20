import { createTokenTotals, formatLabCost, formatTokenTotals, mergeTokenTotals } from '../ai/lab-token-totals.mjs';
import { measureLabRequests } from './cad-lab-request-usage.js';
import { fittingKind, fittingLadders } from './cad-lab-fitting-plan.js';
import { stlChallengeProfiles } from './cad-lab-stl-challenge-plan.js';
import { runSimpleBenchmark } from './cad-lab-simple-run.js';
import { frontierTaskCard } from './cad-lab-frontier-task-card.js';
import { frontiers, runDomainTrial, runFrontier } from './cad-lab-frontiers.js';
import { compactLadders } from './cad-lab-compact-plan.js';
import { recordLabReference, savedLabReferences } from './cad-lab-visual-record.js';
import frontierSettings from '../ai/lab-plate-frontier.json' with { type: 'json' };
import cases from '../ai/lab-supplemental-cases.json' with { type: 'json' };
import { generateDesktopAI } from './ai-desktop-client.js';

const variants = [
  ['quick', 'Schnellprüfung'],
  ['all', 'Alle Zusatzprüfungen'],
  ['CAD', 'CAD-Alltag'],
  ['STL', 'STL-zu-CAD'],
  ['Foto', 'Fotomodus'],
  ['Plugin', 'Plugins und Funktionen'],
];
const frontier = 'Plattengrenze';
function levelCase(level, repeat = false) {
  return {
    id: 'plate-frontier-' + level + (repeat ? '-b' : '-a'),
    level,
    repeat,
    group: frontier,
    label: 'Stufe ' + level + ' · ' + (level + 1) + ' Bohrungen' + (repeat ? ' · Kontrollvariante' : ''),
  };
}
const benchmarks = new Map([
  ...frontiers,
  ['Modellbau', 'Modellbau · Bohrungen im Verbund'],
  ['Konverter', 'STL-Konverter · Flächen erkennen und schützen'],
]);
const statusLabels = {
  passed: 'Bestanden',
  failed: 'Abweichung',
  error: 'Ausführungsfehler',
  cancelled: 'Abgebrochen',
};

async function runCheck(test, runtime) {
  if (test.group === frontier) {
    const { runPlateLevel } = await import('./cad-lab-plate-benchmark.js');
    return runPlateLevel(test, runtime);
  }
  if (test.group === 'Modellbau') {
    const { runMergeBenchmark } = await import('./cad-lab-merge-benchmark.js');
    return runMergeBenchmark(test, runtime);
  }
  if (test.group === 'Konverter') {
    const { runStlDevelopmentCheck } = await import('./cad-lab-converter-checks.js');
    return runStlDevelopmentCheck(test.id, runtime);
  }
  if (test.group === 'Plugin') {
    const { runPluginDevelopmentCheck } = await import('./cad-lab-plugin-checks.js');
    return runPluginDevelopmentCheck(test.id, runtime);
  }
  if (test.group === 'CAD') {
    const { runCadDevelopmentCheck } = await import('./cad-lab-development-checks.js');
    return runCadDevelopmentCheck(test.id, runtime);
  }
  if (test.group === 'STL') {
    const { runStlDevelopmentCheck } = await import('./cad-lab-converter-checks.js');
    return runStlDevelopmentCheck(test.id, runtime);
  }
  const { runPhotoDevelopmentCheck } = await import('./cad-lab-photo-checks.js');
  return runPhotoDevelopmentCheck(test.id, runtime);
}

const isOff = (effort) => ['none', 'disabled'].includes(effort);
const effortLabel = (effort) => (isOff(effort) ? 'Off' : effort);

async function makeRuntime({ desktop, signal, useAI, modeler, effort }) {
  const { createCadController } = await import('./cad-controller.js');
  const runtime = {
    desktop,
    signal,
    createController() {
      signal.throwIfAborted();
      return createCadController({
        createWorker: () => new Worker(new URL('./cad-worker.js', import.meta.url), { type: 'module' }),
      });
    },
  };
  if (!useAI) return runtime;

  const settings = await desktop.getAISettings();
  signal.throwIfAborted();
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(settings.baseUrl).hostname);
  if ((!settings.hasKey && !local) || !settings.model) throw Error('Für den Live-Test zuerst den aktuellen KI-Zugang einrichten.');
  if (
    modeler?.model &&
    (settings.model !== modeler.model ||
      (modeler.providerId !== 'current' && modeler.providerId !== settings.providerId))
  ) {
    throw Error('Für den Live-Test im KI-Chat dasselbe Modell und Zugangsprofil wählen wie im Labor.');
  }
  const keys = [
    'authMode',
    'protocol',
    'baseUrl',
    'model',
    'reasoningEffort',
    'openAIReasoningEffort',
    'mistralReasoningEffort',
    'providerReasoningEffort',
    'maxOutputTokens',
  ];
  const requestConfig = Object.fromEntries(keys.map((key) => [key, settings[key] ?? null]));
  runtime.webResearchAllowed = settings.webResearchAllowed === true;
  runtime.outputLimit = settings.authMode === 'api-key' ? settings.outputBudget ?? settings.maxOutputTokens : null;
  runtime.connection = {
    providerId: settings.providerId,
    protocol: settings.protocol,
    model: settings.model,
    reasoningEffort: settings.reasoningEffort,
    openAIReasoningEffort: settings.openAIReasoningEffort,
    mistralReasoningEffort: settings.mistralReasoningEffort,
    providerReasoningEffort: settings.providerReasoningEffort,
  };
  if (effort) runtime.connection.requestedEffort = effort;
  runtime.generate = async (args) => {
    signal.throwIfAborted();
    const requestId = args.requestId ?? crypto.randomUUID();
    const cancel = () => {
      void desktop.cancelAI({ requestId }).catch(() => {});
    };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const answer = await generateDesktopAI(desktop, {
        ...args,
        requestId,
        requestConfig,
        ...(effort ? { labEffort: effort } : {}),
      });
      if (args.benchmarkModelRequests === undefined) signal.throwIfAborted();
      return answer;
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  };
  return runtime;
}

export async function downloadSupplementalPackage(desktop, id, button, status) {
  button.disabled = true;
  try {
    const result = await desktop.developmentEvidence({ action: 'supplement-export', id });
    if (result?.saved) status('Benchmark-Paket gespeichert: ' + result.path);
  } catch (error) {
    status(error.message);
  } finally {
    button.disabled = false;
  }
}

export function mountLabSupplementalChecks({
  host,
  results,
  desktop,
  blocked,
  onBusy,
  status,
  showResults,
  getModeler,
  showTask,
  showReference,
}) {
  if (!desktop?.developmentEvidence) {
    host.hidden = true;
    return { busy: () => false, cancel() {}, startSimple() {}, chooseBenchmark() {}, refresh: async () => {}, sync() {}, clear() {} };
  }
  host.innerHTML = `<div class="lab-controls">
    <label class="lab-field">Prüfplan<select data-suite-plan aria-label="Prüfplan für Zusatzprüfungen"></select></label>
    <label class="lab-field">Modellantwort<select data-suite-mode>
      <option value="local">Fest vorgegeben</option>
      <option value="live">Live mit aktuellem KI-Zugang</option>
    </select></label>
  </div>
  <div class="lab-controls" data-suite-budgetfield><label>Denkstufen <select data-suite-efforts><option value="all">Alle unterstützten</option><option value="off">Nur Off</option></select></label><label>Versuche je Aufgabe <input type="number" data-suite-count min="1" max="8" value="${frontierSettings.attempts}"></label><label>Einheitliches Zeitbudget (Minuten, optional) <input type="number" data-suite-budget min="1" max="240" placeholder="Standard nach Denkstufe"></label><label><input type="checkbox" data-suite-unlimited> Ohne Zeitlimit</label></div>
  <p class="lab-subtle" data-suite-info aria-live="polite"></p>
  <div class="lab-checks" data-suite-cases></div>
  <button type="button" data-suite-start>Zusatzprüfung starten</button>`;
  const el = (key) => host.querySelector('[data-suite-' + key + ']');
  for (const [value, label] of variants) el('plan').append(new Option(label, value));
  for (const [value, label] of benchmarks) el('plan').append(new Option(label, value));
  let active = null;
  const selectedCases = () => {
    const selected = new Set([...el('cases').querySelectorAll('input:checked')].map((input) => input.value));
    return frontiers.has(el('plan').value) ? [levelCase(1)] : cases.filter((test) => selected.has(test.id));
  };
  const element = (tag, text) => Object.assign(document.createElement(tag), { textContent: text });
  function sync() {
    const busy = !!active || blocked();
    for (const input of host.querySelectorAll('select,input')) input.disabled = busy;
    el('budget').disabled = busy || el('unlimited').checked;
    el('start').disabled = busy || selectedCases().length === 0;
    const count = selectedCases().length;
    const isFrontier = frontiers.has(el('plan').value);
    el('budgetfield').hidden = !isFrontier || el('mode').value !== 'live';
    if (isFrontier && el('plan').value !== frontier) {
      el('mode').value = 'live';
      el('mode').disabled = true;
      el('budgetfield').hidden = false;
    }
    const explanation =
      el('mode').value === 'live'
        ? 'Verwendet den aktuellen Zugang und dessen Denkstufe für Fälle mit Modellantwort. Technische Prüfungen laufen lokal.'
        : 'Lokale Prüfung mit kontrollierten Antworten und synthetischen Testmodellen.';
    el('info').textContent = isFrontier
      ? el('mode').value === 'live'
        ? 'Frische Versuche je Aufgabe. Ein Erfolg genügt für den Aufstieg. Standardbudget pro Denkstufe: ' +
          frontierSettings.minutesByEffort.default + ' Min., High ' + frontierSettings.minutesByEffort.high +
          ' Min., XHigh und Max ' + frontierSettings.minutesByEffort.max + ' Min.'
        : 'Kalibrierung mit festen Modellantworten für Stufen 1 und 2.'
      : count + ' ausgewählt. ' + explanation;
  }
  function choose() {
    const variant = el('plan').value;
    el('cases').replaceChildren(
      ...cases
        .filter((test) =>
          variant === 'all' ? !benchmarks.has(test.group) : variant === 'quick' ? test.quick : test.group === variant,
        )
        .map((test) => {
          const label = element('label', '');
          const input = Object.assign(document.createElement('input'), {
            type: 'checkbox',
            value: test.id,
            checked: true,
          });
          label.append(input, element('span', test.label));
          return label;
        }),
    );
    sync();
  }
  function showSummary(run) {
    const card = element('section', '');
    card.dataset.simpleRunSummary = '';
    card.className = 'lab-card';
    const title = { running: 'läuft', finished: 'beendet', incomplete: 'unvollständig', cancelled: 'abgebrochen' };
    const quick = run.kind === 'quick';
    const compact = run.kind === 'compact';
    const detailed = ['detailed', 'stl-challenge', fittingKind].includes(run.kind);
    card.append(element('h3', (run.plan?.label ?? (detailed ? 'Ausführlicher Vergleichslauf' : compact ? 'Standardtest' : quick ? 'Kurztest' : 'Einfach-Benchmark')) + ' · ' + run.model + ' · ' + title[run.status]));
    if (run.plan?.modelCheckProfile) {
      const description = stlChallengeProfiles[run.plan.modelCheckProfile];
      if (description) card.append(element('p', description));
    }
    if (detailed && Number.isFinite(run.elapsedMs)) {
      card.append(element('p', run.solvedStages + '/' + run.plannedStages + ' gelöst · ' + run.failedStages +
        ' fehlgeschlagen · ' + run.openStages + ' offen · ' + run.providerRequests + ' Anbieteraufrufe (' +
        run.providerRetries + ' Wiederholungen)' + (run.stopReason ? ' · ' + run.stopReason : '')));
    }
    if ((compact || detailed) && Number.isFinite(run.elapsedMs)) {
      const seconds = (ms) => (ms / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' s';
      const duration = seconds(run.elapsedMs);
      const requests = run.tokens?.requests ?? 0;
      card.append(element('p', duration + ' · ' + requests + (requests === 1 ? ' Modellschritt' : ' Modellschritte') +
        (run.timedOut ? ' · Gesamtzeitbudget erreicht' : '')));
      if (Number.isFinite(run.modelMs) && Number.isFinite(run.localMs))
        card.append(element('p', 'Modellanfragen ' + seconds(run.modelMs) +
          ' · Lokale Ausführung und Prüfung ' + seconds(run.localMs)));
    }
    if (Number.isFinite(run.priceLimitEUR))
      card.append(element('p', (run.priceBudgetBasis === 'api-equivalent' ? 'Abo-Richtwert ' : 'Preisgrenze ') +
        run.priceLimitEUR.toLocaleString('de-DE', { minimumFractionDigits: 2 }) +
        ' EUR' + (run.priceStopReason ? ' · ' + run.priceStopReason : '')));
    if (compact && run.elapsedMs !== undefined && run.plan?.domains) {
      const planned = Object.values(run.plan.domains).reduce((sum, domain) => sum + domain.tasks.length, 0);
      const progress = run.efforts.map((effort) => {
        const solved = run.domains.reduce((sum, domain) => sum + (domain.results[effort]?.solvedStages ?? 0), 0);
        return effortLabel(effort) + ' ' + solved + '/' + planned;
      });
      card.append(element('p', 'Gelöste Stufen · ' + progress.join(' · ')));
    }
    const totalText = formatTokenTotals(run.tokens);
    if (totalText) card.append(element('p', 'Tokenverbrauch · ' + totalText));
    if ((compact || detailed) && run.tokens?.requests)
      card.append(element('p', 'Geschätzte Tarifkosten · ' + formatLabCost(run.tokens, run.exchangeRate)));
    if (run.priceReserveUSD) {
      const { maximumUSD, requests } = run.priceReserveUSD;
      const amount = (maximumUSD / run.exchangeRate.usdPerEur).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
      card.append(element('p', 'Preisreserve für ' + requests + (requests === 1 ? ' Aufruf' : ' Aufrufe') +
        ' ohne Verbrauchsdaten · bis ' + amount));
    }
    const list = element('ul', '');
    const phases = { pending: 'Wartet', running: 'Läuft', finished: 'Ausgewertet',
      cancelled: 'Abgebrochen', skipped: 'Übersprungen', error: 'Technischer Fehler', open: 'Offen' };
    for (const domain of run.domains) {
      const item = element('li', domain.label + ' · ' + phases[domain.status] + (domain.reason ? ' · ' + domain.reason : ''));
      const scores = Object.values(domain.results);
      if (detailed && domain.stages) {
        const levels = element('ul', '');
        for (const stage of domain.stages) {
          const line = element('li', stage.level + '. ' + stage.task + ' · ' +
            (stage.outcome === 'open' ? 'Offen' : statusLabels[stage.outcome]) + ' · ' + stage.note);
          if (stage.id && run.status !== 'running') line.append(referenceButton(stage.id));
          levels.append(line);
        }
        item.append(levels);
      } else if (scores.length || domain.openEfforts) {
        const levels = element('ul', '');
        for (const row of scores) {
          const task = row.task ? row.task + ' · ' : '';
          const outcome = quick ? statusLabels[row.trialTimes?.[0]?.status] ?? 'Offen'
            : compact && !row.passed && row.finished < row.planned ? 'Offen'
            : row.passed + '/' + row.finished + ' gelöst';
          const progress = Number.isInteger(row.solvedStages)
            ? row.solvedStages + '/' + row.plannedStages + ' Stufen geschafft · ' +
              (Number.isInteger(row.attemptedStages) ? row.attemptedStages + ' versucht · ' : '') : '';
          levels.append(element('li', effortLabel(row.effort) + ' · ' + progress +
            (quick ? '' : 'Stufe ' + row.level + ' · ') + task + outcome + (row.note ? ' · ' + row.note : '')));
          const usage = formatTokenTotals(row.effortTokens);
          if (usage) levels.lastChild.append(element('p', usage));
          if (row.id && run.status !== 'running') levels.lastChild.append(referenceButton(row.id));
        }
        for (const [effort, reason] of Object.entries(domain.openEfforts ?? {}))
          levels.append(element('li', effortLabel(effort) + ' · Offen · ' + reason));
        item.append(levels);
      }
      list.append(item);
    }
    card.append(list);
    const existing = results.querySelector('[data-simple-run-summary]');
    if (existing) existing.replaceWith(card);
    else results.prepend(card);
    results.hidden = false;
  }

  let archiveController;
  function cancelArchivePreview() {
    archiveController?.abort();
    archiveController = undefined;
  }
  async function openReference(source, selectedRow) {
    cancelArchivePreview();
    const request = new AbortController();
    archiveController = request;
    try {
      const value = typeof source === 'string'
        ? await desktop.developmentEvidence({ action: 'supplement-read', id: source }) : { report: source };
      if (request.signal.aborted || !value?.report) return;
      const report = value.report;
      const row = selectedRow ?? report.results.at(-1);
      const taskId = report.taskId ?? row?.id;
      const ladders = report.simpleRun?.kind === fittingKind ? fittingLadders : compactLadders;
      const task = ladders.get(report.benchmark?.id)?.tasks.find((item) => item.id === taskId);
      const label = report.task ?? cases.find((item) => item.id === taskId)?.label ?? row?.label ?? report.benchmark?.label;
      if (!label) return;
      showTask({ label }, !task && report.campaign && report.benchmark && report.level
        ? { domain: report.benchmark.id, level: report.level, version: report.benchmark.version } : null);
      const references = savedLabReferences(report, row);
      references.forEach(showReference);
      // Older fixture/drawing records can recreate the documented target without a provider call.
      if (!references.length && !active && ['fixture', 'drawing', 'spatial-bores', 'cad', 'fitting-pocket'].includes(task?.check)) {
        const runtime = await makeRuntime({ desktop, signal: request.signal, useAI: false });
        await runDomainTrial(report.benchmark.id, task, {
          ...runtime, previewOnly: true,
          showReference(reference) { if (!request.signal.aborted) showReference(reference); },
        });
      }
    } catch (error) {
      if (!request.signal.aborted) status(error.message);
    } finally {
      if (archiveController === request) archiveController = undefined;
    }
  }
  function referenceButton(source, row) {
    const button = element('button', 'Vorschau anzeigen');
    button.type = 'button';
    button.dataset.labOpenReference = '';
    button.onclick = () => void openReference(source, row);
    return button;
  }
  async function startSimple({ model, providerId, selectedEfforts, kind, priceLimitEUR, modelCheckProfile }) {
    if (active || blocked()) return;
    cancelArchivePreview();
    const controller = new AbortController();
    active = controller;
    onBusy();
    try {
      const current = await desktop.getAISettings();
      controller.signal.throwIfAborted();
      const settings = current.providerId === providerId && current.model === model.id
        ? current
        : await desktop.selectAIModel({ model: model.id, providerId });
      controller.signal.throwIfAborted();
      if (settings.providerId !== providerId || settings.model !== model.id)
        throw Error('Das ausgewählte Modell konnte nicht übernommen werden.');
      results.replaceChildren();
      showResults();
      await runSimpleBenchmark({
        modeler: { model: model.id, providerId }, model, selectedEfforts, kind, priceLimitEUR, modelCheckProfile, signal: controller.signal,
        desktop, makeRuntime, render, status, showSummary, showTask, showReference,
      });
    } catch (error) {
      status(controller.signal.aborted ? 'Einfach-Benchmark abgebrochen.' : error.message);
    } finally {
      active = null;
      onBusy();
    }
  }

  function render(report, file) {
    const heading = element('h3', report.benchmark?.label ?? 'Zusatzprüfungen');
    const passed = report.results.filter((row) => row.status === 'passed').length;
    const states = { running: 'Läuft', completed: 'Beendet', cancelled: 'Abgebrochen', interrupted: 'Unterbrochen' };
    const state = states[report.status];
    const model = report.connection?.model ?? report.model;
    const answerMode =
      report.mode === 'live' || model ? 'Live' + (model ? ' · ' + model : '') : 'Fest vorgegebene Antworten';
    const summary = element(
      'p',
      state + ' · ' + passed + ' von ' + report.caseIds.length + ' bestanden · ' + answerMode,
    );
    summary.setAttribute('role', 'status');
    const entries = report.caseIds.map((id, index) => {
      const test = cases.find((candidate) => candidate.id === id);
      const row = report.results.find((result) => result.id === id);
      const detail = document.createElement('details');
      const succeededEarly = report.stopAfterSuccess && report.results.at(-1)?.status === 'passed';
      const outcome = row ? statusLabels[row.status] : succeededEarly ? 'Entfällt · Erfolg bestätigt' : 'Offen';
      detail.append(element('summary', (row?.label ?? (report.campaign ? report.task + ' · Versuch ' + (index + 1) : test?.label ?? id)) + ' · ' + outcome));
      if (row && (row.reference || row.referencePictures || report.taskId))
        detail.append(referenceButton(report, row));
      if (row?.input?.route) detail.append(element('p', 'Ergebnisweg: ' + row.input.route));
      if (row?.input?.steps)
        for (const step of row.input.steps)
          detail.append(element('p', step.name + ' · ' + (step.elapsedMs / 1000).toFixed(1) + ' s'));
      if (row?.input?.prompts) for (const prompt of row.input.prompts) detail.append(element('p', '„' + prompt + '“'));
      if (test?.prompt) detail.append(element('p', '„' + test.prompt + '“'));
      if (Number.isFinite(row?.elapsedMs))
        detail.append(
          element(
            'p',
            'Gesamtzeit ' +
              (row.elapsedMs / 1000).toFixed(1) +
              ' s' +
              (Number.isFinite(row.modelMs) ? ' · Modellanfragen ' + (row.modelMs / 1000).toFixed(1) + ' s' : ''),
          ),
        );
      const usage = formatTokenTotals(row?.tokens);
      if (usage) detail.append(element('p', 'Tokenverbrauch · ' + usage));
      if (row?.error) detail.append(element('p', row.error));
      if (row?.converter) {
        const converter = row.converter;
        const labels = { passed: 'bestanden', failed: 'Abweichung', timeout: 'Zeitlimit', error: 'Ausführungsfehler' };
        const local = document.createElement('details');
        local.append(element('summary', 'Lokale STEP-Konvertierung · ' + labels[converter.status] +
          ' · ' + (converter.elapsedMs / 1000).toFixed(1) + ' s'));
        if (converter.message) local.append(element('p', converter.message));
        for (const check of converter.checks ?? [])
          local.append(element('p', (check.passed ? '✓ ' : '× ') + check.label));
        detail.append(local);
      }
      for (const [index, inspection] of (row?.modelChecks ?? []).entries()) {
        if (!inspection.automatic) continue;
        const check = document.createElement('details');
        check.append(element('summary', 'Automatische Modellprüfung · Entwurf ' + (index + 1)));
        if (!inspection.checks.length) check.append(element('p', 'Keine auswertbaren Prüfaufträge vorgeschlagen.'));
        for (const { kind, passed } of inspection.checks)
          check.append(element('p', (passed ? '✓ ' : '× ') + kind));
        if (inspection.freecad) check.append(element('p', inspection.freecad.passed === true ? 'FreeCAD · gültig'
          : inspection.freecad.passed === false ? 'FreeCAD · ungültig' : 'FreeCAD · ' + inspection.freecad.reason));
        detail.append(check);
      }
      if (row?.checks) {
        const items = row.checks.map((check) => {
          const li = element('li', (check.passed ? '✓ ' : '× ') + check.label);
          if (check.actual !== undefined) {
            const measured = element('pre', JSON.stringify(check.actual, null, 2));
            measured.className = 'lab-raw';
            li.append(measured);
          }
          return li;
        });
        const list = document.createElement('ul');
        list.append(...items);
        detail.append(element('p', row.requests + ' Modellanfragen'), list);
      }
      return detail;
    });
    results.hidden = false;
    results.replaceChildren(heading, summary, ...entries);
    if (report.simpleRun) showSummary(report.simpleRun);
    else {
      const total = createTokenTotals();
      for (const row of report.history?.length ? report.history : report.results) mergeTokenTotals(total, row.tokens);
      if (report.status === 'running' && report.history?.length)
        for (const row of report.results) mergeTokenTotals(total, row.tokens);
      const usage = formatTokenTotals(total);
      if (usage) heading.after(element('p', 'Tokenverbrauch · ' + usage));
    }
    if (report.campaign) {
      summary.textContent =
        state +
        ' · ' +
        answerMode +
        ' · ' +
        effortLabel(report.effort) +
        (['compact', 'detailed', 'stl-challenge', fittingKind].includes(report.simpleRun?.kind) ? ' · ' + Math.round(report.minutes * 60) + (report.simpleRun.kind === 'stl-challenge' ? ' s je Versuch' : ' s je Aufgabe')
          : report.minutes === null ? ' · Ohne Zeitlimit' : Number.isFinite(report.minutes) ? ' · ' + report.minutes + (report.simpleRun ? ' Min. je Stufe' : ' Min. Budget') : '') +
        ' · Stufe ' +
        report.level +
        ' · ' +
        report.results.length +
        '/' +
        report.caseIds.length +
        ' Versuche';
      const list = element('ul', '');
      for (const h of report.history) {
        const stage = element(
            'li',
            effortLabel(h.effort) +
              ' · Stufe ' +
              h.level +
              ' · ' +
              h.passed +
              '/' +
              h.finished +
              ' gelöst (' +
              h.planned +
              ' geplant) · Median ' +
              (h.medianMs === null ? '–' : (h.medianMs / 1000).toFixed(1) + ' s') +
              ' · ' +
              (h.trialTimes?.length
                ? 'Versuche ' +
                  h.trialTimes
                    .map((t) => (t.ms / 1000).toFixed(1) + ' s (' + (statusLabels[t.status] ?? t.status) + ')')
                    .join(', ') +
                  ' · '
                : '') +
              h.note +
              (h.routes
                ? ' · Bearbeitbar ' +
                  h.routes.editable +
                  ', direkt konvertiert ' +
                  h.routes.converter +
                  ', nach Netzreparatur ' +
                  h.routes.repaired +
                  ', offen ' +
                  h.routes.unconfirmed
                : ''),
        );
        if (report.status !== 'running' && h.id) stage.append(' ', referenceButton(h.id));
        list.append(stage);
      }
      const taskCard = ['compact', 'detailed', 'stl-challenge', fittingKind].includes(report.simpleRun?.kind) || report.status === 'running' ? null : frontierTaskCard(document, report.benchmark.id, report.level, report.benchmark.version);
      if (taskCard) summary.after(taskCard);
      if (report.history.length) (taskCard ?? summary).after(list);
    } else if (report.benchmark?.id === frontier) {
      const confirmed = report.results.filter((row) => row.status === 'passed' && !row.repeat).at(-1)?.level ?? 0;
      summary.textContent = state + ' · ' + answerMode + ' · Höchste bestandene Stufe: ' + confirmed;
      if (report.frontierNote) summary.after(element('p', report.frontierNote));
    } else if (report.benchmark && report.mode === 'live' && report.status !== 'running') {
      const first = report.results.find((row) => row.status === 'failed');
      const label = cases.find((test) => test.id === first?.id)?.label;
      const note = label
        ? 'Erste gemessene Abweichung in dieser Auswahl: ' + label
        : report.status === 'completed' && passed === report.caseIds.length
          ? 'Alle gewählten Stufen erreicht. Die obere Leistungsgrenze liegt außerhalb dieser Auswahl.'
          : 'Leistungsgrenze offen. Ausführungsfehler und offene Stufen sind eigene Befunde.';
      summary.after(element('p', note));
    }
    if (report.error) results.insertBefore(element('p', report.error), entries[0] ?? null);
    if (file && (report.simpleRun ? ['finished', 'incomplete'].includes(report.simpleRun.status) : report.status !== 'cancelled')) {
      const button = element('button', 'Benchmark-Paket herunterladen');
      button.type = 'button';
      button.dataset.supplementDownload = '';
      button.onclick = () => downloadSupplementalPackage(desktop, report.id, button, status);
      results.prepend(button);
    }
  }
  async function start() {
    if (active || blocked()) return;
    cancelArchivePreview();
    const domain = el('plan').value;
    if (frontiers.has(domain) && el('mode').value === 'live') {
      const minutes = el('unlimited').checked
        ? null
        : el('budget').value === '' ? undefined : Number(el('budget').value);
      const attempts = Number(el('count').value);
      if (!Number.isInteger(attempts) || attempts < 1 || attempts > 8) {
        status('Ein bis acht Versuche je Aufgabe wählen.');
        return;
      }
      if (
        !el('unlimited').checked &&
        (el('budget').validity.badInput ||
          (minutes !== undefined && (!Number.isInteger(minutes) || minutes < 1 || minutes > 240)))
      ) {
        status('Zeitbudget zwischen 1 und 240 Minuten wählen.');
        return;
      }
      const controller = new AbortController();
      active = controller;
      onBusy();
      try {
        const modeler = getModeler(),
          catalog = await desktop.diagnostics({ action: 'labRoleCatalog', providerId: modeler.providerId });
        const selected = catalog.models.find((m) => m.id === (modeler.model || catalog.defaultModel));
        if (!selected) throw Error('Modell fehlt im aktuellen Laborkatalog.');
        if (domain === 'Fotogrenze' && selected.vision === false)
          throw Error('Dieses Modell unterstützt keine Bildeingabe. Fotoreihe für dieses Modell nicht messbar.');
        const supported = selected.reasoningEfforts?.length ? [...new Set(selected.reasoningEfforts)] : ['auto'];
        const efforts = el('efforts').value === 'off' ? supported.filter(isOff) : supported;
        if (!efforts.length) throw Error('Für dieses Modell ist keine abschaltbare Denkphase bestätigt.');
        showResults();
        await runFrontier({
          domain,
          efforts,
          modeler,
          minutes,
          attempts,
          signal: controller.signal,
          desktop,
          makeRuntime,
          render,
          status,
          showTask,
          showReference,
        });
      } catch (error) {
        status(error.message);
      } finally {
        active = null;
        onBusy();
      }
      return;
    }
    const queue = selectedCases();
    if (!queue.length) return;
    const controller = new AbortController();
    active = controller;
    const report = {
      id: crypto.randomUUID(),
      caseIds: queue.map((test) => test.id),
      results: [],
      status: 'running',
      startedAt: new Date().toISOString(),
    };
    report.mode = el('mode').value;
    const planName = el('plan').value;
    if (benchmarks.has(planName))
      report.benchmark = {
        id: planName,
        label: benchmarks.get(planName),
        version: planName === frontier ? frontierSettings.version : planName === 'Modellbau' ? 4 : 1,
      };
    const useAI = report.mode === 'live';
    const adaptive = planName === frontier;
    onBusy();
    render(report);
    showResults();
    try {
      const runtime = await makeRuntime({ desktop, signal: controller.signal, useAI, modeler: getModeler() });
      if (runtime.connection) report.connection = runtime.connection;
      for (const test of queue) {
        if (controller.signal.aborted) break;
        showTask(test, adaptive ? { domain: frontier, level: test.level, version: 1 } : null);
        status('Zusatzprüfung · ' + test.label);
        const started = performance.now();
        const row = { id: test.id, requests: 0, ...(adaptive ? { level: test.level, repeat: test.repeat, label: test.label } : {}) };
        try {
          const outcome = await runCheck(test, {
            ...measureLabRequests(runtime, row),
            showReference(reference) {
              recordLabReference(report, row, reference);
              showReference(reference);
            },
          });
          controller.signal.throwIfAborted();
          if (!Array.isArray(outcome?.checks) || !outcome.checks.length)
            throw Error('Kein messbarer Prüfbefund vorhanden.');
          row.checks = outcome.checks;
          if (outcome.input) row.input = outcome.input;
          row.status = row.checks.every((check) => check.passed === true) ? 'passed' : 'failed';
        } catch (error) {
          row.status = controller.signal.aborted ? 'cancelled' : 'error';
          if (!controller.signal.aborted) row.error = String(error.message).slice(0, 1000);
          if (['AI_PROVIDER_QUOTA', 'AI_PROVIDER_RATE_LIMIT', 'AI_PROVIDER_CONNECTION'].includes(error.code))
            report.error = row.error;
        }
        row.elapsedMs = Math.round(performance.now() - started);
        report.results.push(row);
        render(report);
        if (adaptive && !controller.signal.aborted) {
          let next;
          if (row.status === 'error') report.error ??= row.error;
          else if (!useAI) {
            if (row.status === 'passed' && test.level === 1) next = levelCase(2);
            else report.frontierNote = 'Referenzlauf beendet.';
          }
          if (next) {
            queue.push(next);
            report.caseIds.push(next.id);
          }
        }
        if (report.error) break;
      }
    } catch (error) {
      if (!controller.signal.aborted) report.error = String(error.message).slice(0, 1000);
    }
    report.status = controller.signal.aborted ? 'cancelled' : report.error ? 'interrupted' : 'completed';
    report.endedAt = new Date().toISOString();
    render(report);
    try {
      const result = await desktop.developmentEvidence({ action: 'supplement-save', report });
      render(report, result.path);
      status(report.error ?? (report.status === 'cancelled' ? 'Zusatzprüfung abgebrochen.' : 'Zusatzprüfung beendet.'));
    } catch (error) {
      status(error.message);
    } finally {
      active = null;
      onBusy();
    }
  }
  el('plan').onchange = choose;
  el('mode').onchange = sync;
  el('unlimited').onchange = sync;
  el('cases').onchange = sync;
  el('start').onclick = () => void start();
  choose();
  return {
    busy: () => !!active,
    sync,
    startSimple,
    cancel: () => active?.abort(),
    chooseBenchmark(name) {
      if (!benchmarks.has(name) || active || blocked()) return;
      el('plan').value = name;
      el('mode').value = 'live';
      choose();
    },
    clear() {
      cancelArchivePreview();
      results.hidden = true;
      results.replaceChildren();
    },
    async refresh() {
      if (active) return;
      const last = await desktop.developmentEvidence({ action: 'supplement-recent' });
      if (last && !active) {
        render(last.report, last.path);
        await openReference(last.report);
      }
    },
  };
}
