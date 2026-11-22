import { frontierChartComparisons, frontierChartRuns, reasoningLabel } from '../ai/lab-frontier-chart-data.mjs';
import { renderBenchmarkChart } from './cad-ai-model-benchmarks.js';

export function mountFrontierCharts({ host, desktop }) {
  if (!desktop?.developmentEvidence) return { refresh() {} };
  const card = document.createElement('details');
  card.className = 'lab-card';
  card.innerHTML = `<summary>Säulendiagramme</summary>
    <div class="lab-controls">
      <label class="lab-field">Ansicht <select data-frontier-chart-mode>
        <option value="single">Einzelner Testlauf</option>
        <option value="compare">Modellvergleich · Durchschnitt</option>
      </select></label>
      <label class="lab-field"><span data-frontier-chart-label>Testlauf</span>
        <select data-frontier-chart-selection aria-label="Testlauf oder Vergleichsbedingung"></select>
      </label>
    </div>
    <p class="lab-subtle" data-frontier-chart-note role="status"></p>
    <div class="lab-benchmark-chart" data-frontier-chart></div>`;
  host.append(card);
  const mode = card.querySelector('[data-frontier-chart-mode]');
  const selection = card.querySelector('[data-frontier-chart-selection]');
  const label = card.querySelector('[data-frontier-chart-label]');
  const note = card.querySelector('[data-frontier-chart-note]');
  const plot = card.querySelector('[data-frontier-chart]');
  let rows = [];
  let loading = false;
  let group = [];
  const date = (value) => new Date(value).toLocaleString('de-DE');
  function condition(row) {
    const time = row.minutes == null ? 'ohne Zeitlimit' : row.minutes + ' Min. ' + (row.budgetScope === 'task' ? 'je Aufgabe' : 'je Denkstufe');
    return row.label + ' · ' + row.task + ' · ' + reasoningLabel(row.effort) + ' · ' +
      (row.stopAfterSuccess ? 'bis zu ' : '') + row.attempts + ' Versuche · ' + time + ' · Reihe v' + row.version;
  }
  function entry(row, options = {}) {
    return {
      id: row.id, modelName: row.model, label: row.task, date: date(row.date),
      effort: reasoningLabel(row.effort), passed: row.passed, total: row.finished,
      kind: 'frontier', status: row.attempts === row.finished ? 'completed' : 'partial',
      ...options,
    };
  }
  function render() {
    const chosen = group.find((item) => item.key === selection.value);
    if (!chosen) {
      note.textContent = 'Hier erscheinen gespeicherte Leistungsreihen.';
      renderBenchmarkChart(plot, []);
      return;
    }
    if (mode.value === 'single') {
      const valid = chosen.rows.filter((row) => row.finished).sort((a, b) => a.level - b.level);
      note.textContent = chosen.sample.stopAfterSuccess
        ? 'Die Säulen zeigen ausgewertete Versuche bis zum ersten Erfolg oder bis zum Limit.'
        : 'Anteil gelöster Aufgabenversuche je Stufe und Denkstufe. Es zählen die fachlich ausgewerteten Versuche.';
      renderBenchmarkChart(plot, valid.map((row) => entry(row, {
        label: 'Stufe ' + row.level + ' · ' + row.task,
        status: row.successfulAttempt || row.finished === row.attempts ? 'completed' : 'partial',
        note: row.successfulAttempt
          ? 'Gelöst im Versuch ' + row.successfulAttempt + ' von maximal ' + row.attempts + '.'
          : row.finished + ' von ' + row.attempts + ' geplanten Versuchen ausgewertet.',
      })));
      return;
    }
    note.textContent = chosen.models.length < 2
      ? 'Für diese Bedingung liegt bisher ein Modell vor.'
      : chosen.sample.stopAfterSuccess
        ? 'Die Säulen zeigen, wie oft das Modell die Aufgabe innerhalb der erlaubten Versuche löst.'
        : 'Jede Säule zeigt die mittlere Erfolgsquote aus vollständigen Läufen derselben Bedingung.';
    renderBenchmarkChart(plot, chosen.models.map(({ sample, passed, total, runs }) => entry(sample, {
      id: JSON.stringify([sample.provider, sample.model]),
      modelName: sample.model + (sample.provider ? ' · ' + sample.provider.replace(/^https?:\/\//, '') : ''),
      label: runs + (runs === 1 ? ' Lauf' : ' Läufe'), date: '',
      passed, total, status: 'completed',
      valueLabel: (100 * passed / total).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %',
      note: passed + ' von ' + total + (sample.stopAfterSuccess ? ' Aufgaben gelöst.' : ' Versuchen gelöst.'),
    })));
  }
  function fill() {
    const previous = selection.value;
    const compare = mode.value === 'compare';
    label.textContent = compare ? 'Vergleichsbedingung' : 'Testlauf';
    group = compare ? frontierChartComparisons(rows) : frontierChartRuns(rows);
    selection.replaceChildren(...group.map((item) => new Option(compare
      ? condition(item.sample)
      : item.sample.label + ' · ' + item.sample.model + ' · ' + date(item.sample.date), item.key)));
    if (group.some((item) => item.key === previous)) selection.value = previous;
    selection.disabled = !group.length;
    render();
  }
  async function refresh() {
    if (!card.open || loading) return;
    loading = true;
    note.textContent = 'Gespeicherte Läufe werden geladen …';
    try {
      rows = await desktop.developmentEvidence({ action: 'supplement-chart-data' });
      fill();
    } catch (error) {
      note.textContent = error.message;
    } finally {
      loading = false;
    }
  }
  card.ontoggle = refresh;
  mode.onchange = fill;
  selection.onchange = render;
  return { refresh };
}
