import cases from '../ai/lab-supplemental-cases.json' with { type: 'json' };
import { generateDesktopAI } from './ai-desktop-client.js';

const variants = [
  ['quick', 'Schnellprüfung'],
  ['all', 'Alle Zusatzprüfungen'],
  ['CAD', 'CAD-Alltag'],
  ['STL', 'STL-zu-CAD'],
  ['Foto', 'Fotomodus'],
];
const statusLabels = {
  passed: 'Bestanden',
  failed: 'Abweichung',
  error: 'Ausführungsfehler',
  cancelled: 'Abgebrochen',
};

async function runCheck(test, runtime) {
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

async function makeRuntime({ desktop, signal, useAI, modeler }) {
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
  if (!settings.hasKey || !settings.model) throw Error('Für den Live-Test zuerst den aktuellen KI-Zugang einrichten.');
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
  runtime.connection = {
    providerId: settings.providerId,
    protocol: settings.protocol,
    model: settings.model,
    reasoningEffort: settings.reasoningEffort,
    openAIReasoningEffort: settings.openAIReasoningEffort,
    mistralReasoningEffort: settings.mistralReasoningEffort,
    providerReasoningEffort: settings.providerReasoningEffort,
  };
  runtime.generate = async (args) => {
    signal.throwIfAborted();
    const requestId = args.requestId ?? crypto.randomUUID();
    const cancel = () => {
      void desktop.cancelAI({ requestId }).catch(() => {});
    };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const answer = await generateDesktopAI(desktop, { ...args, requestId, requestConfig });
      signal.throwIfAborted();
      return answer;
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  };
  return runtime;
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
}) {
  if (!desktop?.developmentEvidence) {
    host.hidden = true;
    return { busy: () => false, cancel() {}, refresh: async () => {}, sync() {}, clear() {} };
  }
  host.innerHTML = `<div class="lab-controls">
    <label class="lab-field">Prüfplan<select data-suite-plan aria-label="Prüfplan für Zusatzprüfungen"></select></label>
    <label class="lab-field">Modellantwort<select data-suite-mode>
      <option value="local">Fest vorgegeben</option>
      <option value="live">Live mit aktuellem KI-Zugang</option>
    </select></label>
  </div>
  <p class="lab-subtle" data-suite-info aria-live="polite"></p>
  <div class="lab-checks" data-suite-cases></div>
  <button type="button" data-suite-start>Zusatzprüfung starten</button>`;
  const el = (key) => host.querySelector('[data-suite-' + key + ']');
  for (const [value, label] of variants) el('plan').append(new Option(label, value));
  let active = null;
  const selectedCases = () => {
    const selected = new Set([...el('cases').querySelectorAll('input:checked')].map((input) => input.value));
    return cases.filter((test) => selected.has(test.id));
  };
  const element = (tag, text) => Object.assign(document.createElement(tag), { textContent: text });
  function sync() {
    const busy = !!active || blocked();
    for (const input of host.querySelectorAll('select,input')) input.disabled = busy;
    el('start').disabled = busy || selectedCases().length === 0;
    const count = selectedCases().length;
    const explanation =
      el('mode').value === 'live'
        ? 'Verwendet den aktuellen Zugang und dessen Denkstufe für Fälle mit Modellantwort. Technische Prüfungen laufen lokal.'
        : 'Lokale Prüfung mit kontrollierten Antworten und synthetischen Testmodellen.';
    el('info').textContent = count + ' ausgewählt. ' + explanation;
  }
  function choose() {
    const variant = el('plan').value;
    el('cases').replaceChildren(
      ...cases
        .filter((test) => variant === 'all' || (variant === 'quick' ? test.quick : test.group === variant))
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
  function render(report, file) {
    const heading = element('h3', 'Zusatzprüfungen');
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
    const entries = report.caseIds.map((id) => {
      const test = cases.find((candidate) => candidate.id === id);
      const row = report.results.find((result) => result.id === id);
      const detail = document.createElement('details');
      const outcome = row ? statusLabels[row.status] : 'Offen';
      detail.append(element('summary', (test?.label ?? id) + ' · ' + outcome));
      if (test?.prompt) detail.append(element('p', '„' + test.prompt + '“'));
      if (row?.error) detail.append(element('p', row.error));
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
    if (report.error) results.insertBefore(element('p', report.error), entries[0] ?? null);
    if (file) results.append(element('p', 'Protokoll gespeichert in ' + file));
  }
  async function start() {
    if (active || blocked()) return;
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
    const useAI = report.mode === 'live';
    onBusy();
    render(report);
    showResults();
    try {
      const runtime = await makeRuntime({ desktop, signal: controller.signal, useAI, modeler: getModeler() });
      if (runtime.connection) report.connection = runtime.connection;
      for (const test of queue) {
        if (controller.signal.aborted) break;
        status('Zusatzprüfung · ' + test.label);
        const started = performance.now();
        let requests = 0;
        const row = { id: test.id };
        try {
          const outcome = await runCheck(test, {
            ...runtime,
            generate:
              runtime.generate &&
              ((args) => {
                requests++;
                return runtime.generate(args);
              }),
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
        Object.assign(row, { requests, elapsedMs: Math.round(performance.now() - started) });
        report.results.push(row);
        render(report);
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
  el('cases').onchange = sync;
  el('start').onclick = () => void start();
  choose();
  return {
    busy: () => !!active,
    sync,
    cancel: () => active?.abort(),
    clear() {
      results.hidden = true;
      results.replaceChildren();
    },
    async refresh() {
      if (active) return;
      const last = await desktop.developmentEvidence({ action: 'supplement-recent' });
      if (last && !active) render(last.report, last.path);
    },
  };
}
