import { downloadSupplementalPackage } from './cad-ai-lab-supplemental.js';
import { defaultQuickEffort, supportedSimpleEfforts } from './cad-lab-simple-run.js';
import { stlChallengeKind, stlChallengeLabel, stlChallengeLimits, stlChallengeProfiles } from './cad-lab-stl-challenge-plan.js';
import { fittingKind, fittingLabel, fittingLimits } from './cad-lab-fitting-plan.js';
import { compactLimits, detailedLimits } from './cad-lab-compact-plan.js';
import { labPriceUsesApiEquivalent } from './cad-lab-price-budget.js';
import { formatLabCost } from '../ai/lab-token-totals.mjs';
import { frontierChartComparisons, reasoningLabel } from '../ai/lab-frontier-chart-data.mjs';

const effortLabels = {
  auto: 'Automatisch', none: 'Off', disabled: 'Off', enabled: 'On',
  minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'XHigh', max: 'Max',
};

export function mountSimpleBenchmark({ host, desktop, start }) {
  if (!desktop?.getAIModels || !desktop.developmentEvidence || !desktop.selectAIModel)
    return { sync() {}, load() {} };

  const expert = document.createElement('details');
  expert.className = 'lab-card';
  const expertHeading = document.createElement('summary');
  expertHeading.textContent = 'Einzelreihen und feste Vergleichstests';
  expert.append(expertHeading, ...host.children);

  const root = document.createElement('section');
  root.className = 'lab-card';
  root.innerHTML = `<h3>KI-Modelle vergleichen</h3>
    <p data-simple-benchmark-scope class="lab-subtle"></p>
    <label class="lab-field">KI-Modell <select data-simple-benchmark-model></select></label>
    <details data-simple-model-bars hidden>
      <summary>Vorhandene Ergebnisse vergleichen</summary>
      <label class="lab-field">Vergleichsaufgabe <select data-simple-bar-condition></select></label>
      <div class="lab-model-bars" data-simple-bar-list role="group" aria-label="Modell über Ergebnisbalken auswählen"></div>
    </details>
    <fieldset class="lab-simple-efforts" data-simple-benchmark-efforts hidden>
      <legend>Denkstufe</legend>
      <div class="lab-checks"></div>
      <p class="lab-subtle" data-simple-effort-note aria-live="polite" hidden>Wähle mindestens eine Denkstufe.</p>
    </fieldset>
    <p class="lab-subtle" data-simple-benchmark-status aria-live="polite"></p>
    <label class="lab-field" data-simple-price-field><span data-simple-price-label>Preisgrenze für den Lauf (EUR)</span>
      <input type="number" data-simple-price-limit min="0.01" step="0.01" placeholder="z. B. 5,00" aria-describedby="lab-price-note">
    </label>
    <p class="lab-subtle" id="lab-price-note">Optional für alle gewählten Denkstufen zusammen. Erfordert einen bekannten API-Tarif und einen Euro-Wechselkurs.</p>
    <button type="button" class="lab-primary lab-standard-start" data-simple-benchmark-start>Standardtest</button>
    <details class="lab-benchmark-options">
      <summary>Testumfang ändern</summary>
      <label class="lab-field">Umfang <select data-simple-benchmark-kind>
        <option value="compact">Allgemeiner Stufenbenchmark</option><option value="detailed">Ausführlicher Vergleichslauf (v14)</option><option value="quick">Vier Einstiegsaufgaben</option><option value="${stlChallengeKind}">${stlChallengeLabel}</option><option value="${fittingKind}">${fittingLabel}</option>
      </select></label>
      <label class="lab-field" data-simple-model-check-field hidden>Prüfkonfiguration <select data-simple-model-check-profile>
        ${Object.entries(stlChallengeProfiles).map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}
      </select></label>
    </details>
    <details class="lab-benchmark-options" data-benchmark-equal-budget hidden>
      <summary>Läufe mit gleichem Budget vergleichen</summary>
      <label class="lab-field">Budget und Denkstufen <select data-benchmark-budget-choice></select></label>
      <div class="lab-table-wrap"><table class="lab-table">
        <thead><tr><th>Modell / Zugang</th><th>Gelöste Stufen</th><th>Laufzeit</th><th>Geschätzte Tarifkosten</th><th>Budgetstatus</th></tr></thead>
        <tbody data-benchmark-budget-results></tbody>
      </table></div>
    </details>
    <details class="lab-benchmark-options" data-benchmark-downloads hidden>
      <summary>Abgeschlossene Läufe herunterladen</summary>
      <label class="lab-field">Benchmark-Lauf <select data-benchmark-download-selection></select></label>
      <button type="button" data-benchmark-download>Benchmark-Paket herunterladen</button>
      <p class="lab-subtle" data-benchmark-download-status role="status"></p>
    </details>`;
  host.append(root, expert);
  const budgetPanel = root.querySelector('[data-benchmark-equal-budget]');
  const budgetChoice = budgetPanel.querySelector('[data-benchmark-budget-choice]');
  const budgetRows = budgetPanel.querySelector('[data-benchmark-budget-results]');
  const euro = (value) => value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  let budgetGroups = new Map();
  function renderBudgetComparison() {
    budgetRows.replaceChildren(...(budgetGroups.get(budgetChoice.value) ?? []).map((run) => {
      const b = run.budget;
      const values = [
        run.model + ' · ' + (b.basis === 'api-equivalent' ? 'Abo' : (run.provider?.replace('https://', '') || 'API')),
        b.efforts.map((effort, i) => reasoningLabel(effort) + ' ' + b.solved[i] + '/' + b.stages).join(' · '),
        (b.elapsedMs / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' s',
        formatLabCost(b.tokens, b.exchangeRate),
        b.priceStopReason || '–',
      ];
      const row = document.createElement('tr');
      row.append(...values.map((value) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        return cell;
      }));
      return row;
    }));
  }
  budgetChoice.onchange = renderBudgetComparison;
  function loadBudgetComparison(runs) {
    const previous = budgetChoice.value;
    budgetGroups = new Map();
    for (const run of runs) {
      if (!run.budget) continue;
      const key = JSON.stringify([run.budget.eur, run.budget.version, run.budget.efforts]);
      if (!budgetGroups.has(key)) budgetGroups.set(key, []);
      budgetGroups.get(key).push(run);
    }
    budgetChoice.replaceChildren(...[...budgetGroups].map(([key, [run]]) => new Option(
      [euro(run.budget.eur), run.budget.efforts.map(reasoningLabel).join(' + '), 'v' + run.budget.version].join(' · '), key,
    )));
    budgetPanel.hidden = !budgetGroups.size;
    if (budgetGroups.has(previous)) budgetChoice.value = previous;
    renderBudgetComparison();
  }
  const downloads = root.querySelector('[data-benchmark-downloads]');
  const downloadSelection = downloads.querySelector('[data-benchmark-download-selection]');
  const download = downloads.querySelector('[data-benchmark-download]');
  const downloadStatus = downloads.querySelector('[data-benchmark-download-status]');
  download.onclick = () => downloadSupplementalPackage(desktop, downloadSelection.value, download,
    (message) => { downloadStatus.textContent = message; });
  const kind = root.querySelector('[data-simple-benchmark-kind]');
  const profile = root.querySelector('[data-simple-model-check-profile]');
  const profileField = root.querySelector('[data-simple-model-check-field]');
  const scope = root.querySelector('[data-simple-benchmark-scope]');
  const priceField = root.querySelector('[data-simple-price-field]');
  const priceLimit = root.querySelector('[data-simple-price-limit]');
  const priceLabel = root.querySelector('[data-simple-price-label]');
  const priceNote = root.querySelector('#lab-price-note');
  const models = root.querySelector('[data-simple-benchmark-model]');
  const button = root.querySelector('[data-simple-benchmark-start]');
  const barArea = root.querySelector('[data-simple-model-bars]');
  const barCondition = root.querySelector('[data-simple-bar-condition]');
  const barList = root.querySelector('[data-simple-bar-list]');
  const note = root.querySelector('[data-simple-benchmark-status]');
  const effortField = root.querySelector('[data-simple-benchmark-efforts]');
  const effortList = effortField.querySelector('.lab-checks');
  const effortNote = effortField.querySelector('[data-simple-effort-note]');
  const selectedEfforts = () => [...effortList.querySelectorAll('input:checked')].map((checkbox) => checkbox.value);
  const savedEfforts = new Map();
  let effortKey;
  let choices = new Map();
  let measuredModels = new Map();
  let comparisons = [];
  let busy = false;
  let loading = false;
  let ready = false;

  function sync(value = busy) {
    busy = value;
    kind.disabled = busy;
    profileField.hidden = kind.value !== stlChallengeKind;
    profile.disabled = busy || profileField.hidden;
    priceField.hidden = kind.value === 'quick';
    priceLimit.disabled = busy || priceField.hidden;
    priceNote.hidden = priceField.hidden;
    const choice = choices.get(models.value);
    const subscription = labPriceUsesApiEquivalent(choice?.providerId);
    const rate = choice?.model.price;
    const age = Date.now() - Date.parse(rate?.rateDate);
    priceLabel.textContent = subscription ? 'Abo-Richtwert für den Lauf (EUR)' : 'Preisgrenze für den Lauf (EUR)';
    priceNote.textContent = (subscription
      ? 'Geschätzter API-Gegenwert für alle gewählten Denkstufen. Das Abo-Kontingent wird vom Anbieter separat gemessen.'
      : 'Optional für alle gewählten Denkstufen zusammen. Erfordert einen bekannten API-Tarif und einen Euro-Wechselkurs.') +
      (Number.isFinite(age) ? ' Tarifstand ' + rate.rateDate + (age > 45 * 86400000 ? ' · Bitte mit dem Anbieter abgleichen.' : '.') : '');
    models.disabled = busy || loading || !choices.size;
    effortField.disabled = models.disabled;
    barCondition.disabled = busy || loading || !comparisons.length;
    for (const tile of barList.children) {
      tile.disabled = models.disabled || !choices.has(tile.dataset.modelKey);
      tile.setAttribute('aria-pressed', String(tile.dataset.modelKey === models.value));
    }
    const hasEffort = selectedEfforts().length > 0;
    effortNote.hidden = !models.value || hasEffort;
    const unavailable = ['detailed', stlChallengeKind, fittingKind].includes(kind.value) && choice?.providerId === 'mistral-vibe';
    if (unavailable) note.textContent = 'Mistral Vibe stellt die Zahl tatsächlicher Modellaufrufe nicht bereit. Wähle für diesen Zugang den Standardtest.';
    else if (note.textContent.startsWith('Mistral Vibe stellt')) note.textContent = '';
    button.disabled = unavailable || models.disabled || !models.value || !hasEffort || (!priceLimit.disabled && !priceLimit.validity.valid);
  }
  function renderEfforts() {
    const key = models.value;
    const choice = choices.get(key);
    if (effortKey !== undefined) savedEfforts.set(effortKey, selectedEfforts());
    const quick = kind.value === 'quick';
    const detailed = kind.value === 'detailed';
    const diagnose = kind.value === stlChallengeKind;
    const fitting = kind.value === fittingKind;
    const singleEffort = quick || detailed || diagnose || fitting;
    effortKey = JSON.stringify([key, kind.value]);
    const previous = savedEfforts.get(effortKey);
    scope.textContent = fitting
      ? 'Zwei CAD-Passungen jeweils mit heutigem Kontext und mit Skill. Eine Denkstufe. Bis zu ' +
        fittingLimits.minutes + ' Minuten und ' + fittingLimits.maxModelRequests + ' Anbieteraufrufe.'
      : diagnose
      ? 'Fünf STL-Aufgaben mit lokaler STEP-Konvertierung und bearbeitbarem CAD-Nachbau. Bis zu zwei Versuche je STL, weiter nach Erfolg. Eine Denkstufe. Bis zu ' +
        stlChallengeLimits.minutes + ' Minuten und ' + stlChallengeLimits.maxModelRequests + ' Anbieteraufrufe.'
      : quick ? 'Ohne Fotos. Je eine Aufgabe für Modellbau, Vorführen, STL und technisches Zeichnen. Bis zu 4 Minuten Prüfzeit und 11 Modellanfragen insgesamt.'
      : detailed
        ? '25 Aufgaben in CAD, STL und Zeichnen. Eine Denkstufe, eigene Zeit- und Schrittgrenzen je Aufgabe. Insgesamt bis zu ' +
          detailedLimits.minutes + ' Minuten und ' + detailedLimits.maxModelRequests + ' Anbieteraufrufe einschließlich Wiederholungen.'
        : 'Ohne Fotos. CAD-Modellieren, STL-Nachbau und technisches Zeichnen in aufsteigenden Stufen. ' + compactLimits.minutes + ' Minuten und bis zu ' +
        compactLimits.requests + ' Modellschritte insgesamt. Jede Stufe erhält innerhalb des Budgets einen Versuch. Nach einer ungelösten Aufgabe geht es weiter. Gewählte Denkstufen teilen sich das Budget.';
    effortField.querySelector('legend').textContent = singleEffort ? 'Denkstufe' : 'Denkstufen';
    button.textContent = fitting ? 'Skill-Vergleich starten' : diagnose ? 'STL-Diagnose starten' : quick ? 'Kurztest starten' : detailed ? 'Vergleichslauf starten' : 'Standardtest';
    effortField.hidden = !choice;
    effortList.replaceChildren();
    if (!choice) return;
    const efforts = supportedSimpleEfforts(choice.model, choice.providerId);
    const defaults = [choice.providerId === 'mistral-vibe' ? 'auto' : defaultQuickEffort(efforts)];
    for (const effort of efforts) {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = singleEffort ? 'radio' : 'checkbox';
      if (singleEffort) checkbox.name = 'lab-single-effort';
      checkbox.value = effort;
      checkbox.checked = (previous ?? defaults).includes(effort);
      label.append(checkbox, effortLabels[effort] ?? effort);
      effortList.append(label);
    }
  }
  function renderBars() {
    const comparison = comparisons.find((item) => item.key === barCondition.value);
    const results = new Map((comparison?.models ?? []).map((row) =>
      [JSON.stringify([row.sample.provider, row.sample.model]), row]));
    const visible = new Map(measuredModels);
    const current = choices.get(models.value);
    if (current) visible.set(models.value, { model: current.model.id, provider: current.providerLabel });
    barArea.hidden = !measuredModels.size;
    barCondition.parentElement.hidden = !comparisons.length;
    barList.replaceChildren();
    for (const [key, identity] of visible) {
      const choice = choices.get(key);
      const name = choice?.model.name || identity.model;
      const provider = choice?.providerLabel || identity.provider.replace(/^https?:\/\//, '');
      const score = results.get(key);
      const percentage = score ? 100 * score.passed / score.total : null;
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.dataset.modelKey = key;
      tile.className = 'lab-model-bar';
      const track = document.createElement('span');
      track.className = 'lab-model-bar-track';
      track.setAttribute('aria-hidden', 'true');
      if (percentage !== null) {
        const fill = document.createElement('span');
        fill.style.width = percentage + '%';
        track.append(fill);
      }
      const caption = document.createElement('strong');
      caption.textContent = name;
      const value = document.createElement('small');
      value.textContent = [provider, percentage === null
        ? 'Ohne auswertbaren Versuch für diese Aufgabe'
        : percentage.toLocaleString('de-DE', { maximumFractionDigits: 1 }) +
          ' % · ' + score.passed + '/' + score.total + ' gelöst',
        !choice ? 'Zugang nicht verfügbar' : ''].filter(Boolean).join(' · ');
      tile.append(track, caption, value);
      tile.onclick = () => {
        models.value = key;
        renderEfforts();
        sync();
      };
      barList.append(tile);
    }
  }
  function loadBars(rows) {
    const previous = barCondition.value;
    comparisons = frontierChartComparisons(rows);
    measuredModels = new Map(rows.map((row) => [JSON.stringify([row.provider, row.model]), row]));
    barCondition.replaceChildren(...comparisons.map((item) => {
      const row = item.sample;
      const mode = row.fittingVariant ? fittingLabel : row.modelCheckProfile ? stlChallengeLabel + ' · ' + stlChallengeProfiles[row.modelCheckProfile] : row.detailedBenchmark ? 'Ausführlicher Vergleichslauf' : row.compactBenchmark ? 'Kompakter Stufenbenchmark' : row.quickBenchmark ? 'Kurztest' : 'Leistungsgrenze';
      const time = row.compactBenchmark || row.detailedBenchmark || row.modelCheckProfile || row.fittingVariant ? Math.round(row.minutes * 60) + (row.modelCheckProfile ? ' s je Versuch' : ' s je Aufgabe') : row.minutes === null ? 'ohne Zeitlimit' : row.minutes + ' Min. je ' +
        (row.budgetScope === 'task' ? 'Aufgabe' : 'Denkstufe');
      return new Option([row.task, reasoningLabel(row.effort), mode, time,
        (row.stopAfterSuccess ? 'bis zu ' : '') + row.attempts + ' Vers.', 'v' + row.version].join(' · '), item.key);
    }));
    const matching = comparisons.find(({ sample }) => kind.value === 'quick' ? sample.quickBenchmark
      : kind.value === 'detailed' ? sample.detailedBenchmark : kind.value === stlChallengeKind
        ? sample.modelCheckProfile === profile.value : kind.value === fittingKind ? !!sample.fittingVariant : sample.compactBenchmark);
    if (comparisons.some((item) => item.key === previous)) barCondition.value = previous;
    else if (matching) barCondition.value = matching.key;
    renderBars();
  }
  async function load({ refresh = false } = {}) {
    if (loading || busy || (ready && !refresh)) return;
    loading = true;
    void desktop.developmentEvidence({ action: 'supplement-completed' }).then((runs) => {
      if (!Array.isArray(runs)) return;
      const previous = downloadSelection.value;
      downloadSelection.replaceChildren(...runs.map((run) => new Option(
        [run.label, run.model, new Date(run.endedAt).toLocaleString('de-DE')].filter(Boolean).join(' · '), run.id,
      )));
      if (runs.some(run => run.id === previous)) downloadSelection.value = previous;
      downloads.hidden = runs.length === 0;
      loadBudgetComparison(runs);
    }).catch((error) => { downloadStatus.textContent = error.message; });
    const previous = models.value;
    note.textContent = 'Modelle werden geladen …';
    sync();
    try {
      const [settings, { catalogs }, chartRows] = await Promise.all([
        desktop.getAISettings(),
        desktop.getAIModels({ all: true }),
        desktop.developmentEvidence({ action: 'supplement-chart-data' }).catch(() => []),
      ]);
      choices = new Map();
      models.replaceChildren();
      for (const entry of catalogs) {
        const available = new Set(entry.availableModelIds ?? []);
        if (!entry.hasKey || entry.error || !available.size) continue;
        const group = document.createElement('optgroup');
        group.label = entry.provider?.label || entry.providerId;
        for (const model of entry.models) {
          if (!available.has(model.id)) continue;
          const key = JSON.stringify([entry.providerId, model.id]);
          choices.set(key, { providerId: entry.providerId, model, providerLabel: group.label });
          group.append(new Option(model.name || model.id, key));
        }
        if (group.children.length) models.append(group);
      }
      const currentModel = catalogs
        .find((entry) => entry.providerId === settings.providerId)
        ?.models.find((model) => model.id === settings.model || model.aliases?.includes(settings.model));
      const current = JSON.stringify([settings.providerId, currentModel?.id ?? settings.model]);
      if (choices.has(previous)) models.value = previous;
      else if (choices.has(current)) models.value = current;
      ready = choices.size > 0;
      loadBars(Array.isArray(chartRows) ? chartRows : []);
      note.textContent = ready
        ? 'Die Modellauswahl gilt auch im KI-Chat.'
        : 'Richte unter Einstellungen → KI / API einen Zugang ein und öffne das Labor erneut.';
    } catch (error) {
      ready = false;
      choices.clear();
      models.replaceChildren();
      renderBars();
      note.textContent = error.message;
    } finally {
      loading = false;
      renderEfforts();
      sync();
    }
  }
  models.onchange = () => {
    renderEfforts();
    renderBars();
    sync();
  };
  kind.onchange = () => {
    const matching = comparisons.find(({ sample }) => kind.value === 'quick' ? sample.quickBenchmark
      : kind.value === 'detailed' ? sample.detailedBenchmark : kind.value === stlChallengeKind
        ? sample.modelCheckProfile === profile.value : kind.value === fittingKind ? !!sample.fittingVariant : sample.compactBenchmark);
    if (matching) barCondition.value = matching.key;
    renderEfforts();
    renderBars();
    sync();
  };
  profile.onchange = kind.onchange;
  barCondition.onchange = () => {
    renderBars();
    sync();
  };
  effortList.onchange = () => sync();
  priceLimit.oninput = () => sync();
  button.onclick = () => {
    if (button.disabled) return;
    const selection = choices.get(models.value);
    if (selection) void start({ ...selection, kind: kind.value, selectedEfforts: selectedEfforts(), modelCheckProfile: profile.value,
      priceLimitEUR: !priceLimit.disabled && priceLimit.value !== '' ? priceLimit.valueAsNumber : null,
    });
  };
  renderEfforts();
  sync();
  return { sync, load };
}
