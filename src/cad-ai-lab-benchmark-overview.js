import {
  benchmarkOverview, effortLabel, groupName, kindLabels, outcomeLabels,
} from '../ai/lab-benchmark-overview.mjs';

export const overviewPalette = ['#7b93f5', '#f2a65a', '#2e8b78', '#b38cf5', '#f57fae', '#5cc8d8', '#e3cf5a', '#9ad16b'];
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const de = (value, digits = 0, min = digits) => value.toLocaleString('de-DE', { minimumFractionDigits: min, maximumFractionDigits: digits });
const unknown = '<span class="lab-ov-unknown">unbekannt</span>';
const color = (group) => overviewPalette[group.index % overviewPalette.length];
const usd = (value) => '$' + de(value, value < 1 ? 3 : 2);
const solvedText = (group) => (group.runs.length > 1 ? de(group.meanSolved, 1, 1) : de(group.meanSolved));
const runWord = (n) => n + (n === 1 ? ' Lauf' : ' Läufe');
const planText = (plan) => 'v' + (plan.version ?? '?');
const short = (id) => String(id).split(':')[0].slice(0, 4);

function subtitle(group, overview) {
  return effortLabel(group.effort) + ' · ' + planText(overview.plan) + ' · ' + runWord(group.runs.length);
}
function legendName(group, overview) {
  const twins = overview.groups.filter((item) => item.model === group.model).length > 1;
  return groupName(group) + (twins ? ' ' + effortLabel(group.effort) : '');
}

function headerBlock(overview) {
  const { groups, headline, taskCount, runs, plan } = overview;
  const best = headline.best;
  const parts = [esc(legendName(best, overview)) + ' schafft ' + solvedText(best) + ' von ' + taskCount + ' Aufgaben' +
    (best.runs.length > 1 ? ' im Mittel' : '') + '.'];
  const cheapest = headline.cheapest;
  if (cheapest && cheapest !== best && Number.isFinite(best.costPerSolved))
    parts.push(esc(legendName(best, overview)) + ' kostet je gelöster Aufgabe etwa ' +
      de(best.costPerSolved / cheapest.costPerSolved, 1) + '-mal so viel wie ' + esc(legendName(cheapest, overview)) + '.');
  const timed = groups.filter((group) => Number.isFinite(group.secondsPerSolved));
  if (timed.length > 1) {
    const fastest = timed.reduce((a, b) => (b.secondsPerSolved < a.secondsPerSolved ? b : a));
    parts.push(esc(legendName(fastest, overview)) + ' braucht je gelöster Aufgabe die wenigste Zeit.');
  }
  return `<header class="lab-ov-head">
    <p class="lab-ov-eyebrow">Formnaro KI-Labor · ${taskCount} Aufgaben · ${runWord(runs.length)}</p>
    <h3 class="lab-ov-title">${esc(headline.text)}</h3>
    <p class="lab-ov-lead">${parts.join(' ')}</p>
    <p class="lab-ov-note">Plan ${esc(planText(plan))} · ${esc(kindLabels[plan.kind] ?? plan.kind)}. Läufe anderer Plan-Versionen haben andere Budgets oder Aufgabentexte und sind nur getrennt auswählbar. Kosten sind die Obergrenze der API-Schätzung in US-Dollar.</p>
  </header>`;
}

function solvedBlock(overview) {
  const n = overview.taskCount || 1;
  const rows = overview.groups.map((group) => {
    const dots = group.runs.map((run) => `<span class="lab-ov-dot" style="left:${(100 * run.solved / n).toFixed(2)}%" title="${esc(short(run.runId))} · ${run.solved}/${overview.taskCount}"></span>`).join('');
    return `<div class="lab-ov-name"><strong>${esc(groupName(group))}</strong><small>${esc(subtitle(group, overview))}</small></div>
      <div class="lab-ov-track" style="--c:${color(group)}"><span class="lab-ov-fill" style="width:${(100 * group.meanSolved / n).toFixed(2)}%"></span>${dots}</div>
      <div class="lab-ov-value">${solvedText(group)}</div>`;
  }).join('');
  const ticks = [0, 1, 2, 3, 4, 5].map((i) => Math.round(i * overview.taskCount / 5))
    .filter((value, i, all) => all.indexOf(value) === i)
    .map((value) => `<span style="left:${(100 * value / n).toFixed(2)}%">${value}</span>`).join('');
  return `<section class="lab-ov-card" data-overview-solved>
    <h4>Wie viele der ${overview.taskCount} Aufgaben werden gelöst?</h4>
    <p class="lab-ov-sub">Jeder Punkt ist ein Lauf, die Fläche reicht bis zum Mittelwert.</p>
    <div class="lab-ov-bars">${rows}<span></span><div class="lab-ov-axis">${ticks}</div><span></span></div>
  </section>`;
}

function metricColumn(overview, title, unit, key, format) {
  const values = overview.groups.map((group) => group[key]).filter(Number.isFinite);
  const max = values.length ? Math.max(...values) : 0;
  const rows = overview.groups.map((group) => {
    const value = group[key];
    const known = Number.isFinite(value);
    const width = known && max > 0 ? Math.max(4, 100 * value / max) : 0;
    const prefix = key === 'costPerSolved' && group.costPartial ? 'mind. ' : '';
    return `<div class="lab-ov-mini-name">${esc(groupName(group))}<small>${esc(effortLabel(group.effort))} ${esc(planText(overview.plan))}</small></div>
      <div class="lab-ov-mini-bar">${known ? `<span style="width:${width.toFixed(1)}%;background:${color(group)}"></span><b>${prefix}${format(value)}</b>` : unknown}</div>`;
  }).join('');
  return `<div class="lab-ov-mini"><h5>${title}</h5><p class="lab-ov-sub">${unit}</p><div class="lab-ov-mini-grid">${rows}</div></div>`;
}

function costBlock(overview) {
  return `<section class="lab-ov-card" data-overview-costs>
    <h4>Was kostet es, wie lange dauert es, wie viel schreibt das Modell?</h4>
    <p class="lab-ov-sub">Alle drei Werte je gelöster Aufgabe, gemittelt über die Läufe der Gruppe. Kürzer ist hier besser. Fehlende Messwerte bleiben unbekannt.</p>
    <div class="lab-ov-minis">
      ${metricColumn(overview, 'Preis', 'US-Dollar je gelöster Aufgabe', 'costPerSolved', usd)}
      ${metricColumn(overview, 'Tempo', 'Sekunden je gelöster Aufgabe', 'secondsPerSolved', (v) => de(v) + ' s')}
      ${metricColumn(overview, 'Redseligkeit', 'Ausgabetokens je gelöster Aufgabe', 'tokensPerSolved', (v) => de(v))}
    </div>
  </section>`;
}

function niceStep(span) {
  const raw = span / 4;
  const power = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 2.5, 5, 10].map((f) => f * power).find((step) => step >= raw) ?? raw;
}

function scatterBlock(overview) {
  const points = overview.runs.filter((run) => Number.isFinite(run.costUSD));
  const missing = overview.runs.length - points.length;
  if (!points.length) {
    return `<section class="lab-ov-card" data-overview-scatter><h4>Mehr bezahlen, mehr bekommen?</h4>
      <p class="lab-ov-sub">Für keinen Lauf liegt eine Kostenschätzung vor. Kosten bleiben unbekannt.</p></section>`;
  }
  const W = 760, H = 330, L = 64, R = 24, T = 18, B = 52;
  const xStep = niceStep(Math.max(...points.map((p) => p.costUSD)) || 1);
  const xMax = Math.max(xStep, Math.ceil(Math.max(...points.map((p) => p.costUSD)) / xStep) * xStep);
  const yValues = points.map((p) => p.solved);
  const yStep = Math.max(1, Math.round(niceStep(Math.max(1, overview.taskCount - Math.min(...yValues)))));
  const yMin = Math.max(0, Math.floor((Math.min(...yValues) - 1) / yStep) * yStep);
  const yMax = Math.max(yMin + yStep, Math.ceil(overview.taskCount / yStep) * yStep);
  const x = (v) => L + (W - L - R) * v / xMax;
  const y = (v) => T + (H - T - B) * (1 - (v - yMin) / (yMax - yMin));
  const grid = [];
  for (let v = 0; v <= xMax + 1e-9; v += xStep)
    grid.push(`<line x1="${x(v)}" x2="${x(v)}" y1="${T}" y2="${H - B}"/><text class="lab-ov-tick" x="${x(v)}" y="${H - B + 20}" text-anchor="middle">$${esc(de(v, xStep < 0.1 ? 2 : 1, 1))}</text>`);
  for (let v = yMin; v <= yMax; v += yStep)
    grid.push(`<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="lab-ov-tick" x="${L - 10}" y="${y(v) + 4}" text-anchor="end">${v}</text>`);
  const dots = points.map((run) => {
    const group = overview.groups[run.group];
    return `<circle cx="${x(run.costUSD).toFixed(1)}" cy="${y(run.solved).toFixed(1)}" r="7" fill="${color(group)}"><title>${esc(groupName(group))} · ${esc(effortLabel(run.effort))} · ${esc(short(run.runId))}: ${run.solved} gelöst, ${esc(usd(run.costUSD))}</title></circle>`;
  }).join('');
  // One label per group beside its mean point; labels are pushed apart vertically.
  const placed = overview.groups.flatMap((group) => {
    const own = points.filter((run) => run.group === group.index);
    if (!own.length) return [];
    const cx = x(own.reduce((sum, run) => sum + run.costUSD, 0) / own.length);
    const cy = y(own.reduce((sum, run) => sum + run.solved, 0) / own.length);
    return [{ group, cx, cy, ly: cy + 5, anchor: cx > W * 0.7 ? 'end' : 'start' }];
  }).sort((a, b) => a.ly - b.ly);
  for (let i = 1; i < placed.length; i++) placed[i].ly = Math.max(placed[i].ly, placed[i - 1].ly + 19);
  const labels = placed.map(({ group, cx, cy, ly, anchor }) => {
    const lx = cx + (anchor === 'end' ? -16 : 16);
    return `<line class="lab-ov-leader" x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${(lx + (anchor === 'end' ? 4 : -4)).toFixed(1)}" y2="${(ly - 5).toFixed(1)}"/>` +
      `<text class="lab-ov-point-label" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}">${esc(groupName(group))} ${esc(effortLabel(group.effort))} ${esc(planText(overview.plan))}${group.runs.length > 1 ? ' · Ø ' + group.runs.length + ' Läufe' : ''}</text>`;
  }).join('');
  return `<section class="lab-ov-card" data-overview-scatter>
    <h4>Mehr bezahlen, mehr bekommen?</h4>
    <p class="lab-ov-sub">Jeder Lauf als Punkt: rechts teurer, oben mehr gelöste Aufgaben. Kosten sind die Obergrenze der API-Schätzung in US-Dollar.${missing ? ' Ohne Kostenangabe und daher nicht eingezeichnet: ' + runWord(missing) + '.' : ''}</p>
    <svg class="lab-ov-scatter" viewBox="0 0 ${W} ${H}" role="img" aria-label="Kosten je Lauf gegen gelöste Aufgaben">
      <rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" class="lab-ov-plot"/>
      <g class="lab-ov-grid">${grid.join('')}</g>${dots}${labels}
      <text class="lab-ov-axis-label" x="${(L + W - R) / 2}" y="${H - 8}" text-anchor="middle">Kosten je Lauf (Obergrenze)</text>
      <text class="lab-ov-axis-label" transform="translate(16 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">gelöste Aufgaben</text>
    </svg>
  </section>`;
}

function domainBlock(overview) {
  const heads = overview.domains.map((domain) => `<span class="lab-ov-domain-head">${esc(domain.label)}</span>`).join('');
  const rows = overview.groups.map((group) => `<div class="lab-ov-name"><strong>${esc(groupName(group))}</strong><small>${esc(effortLabel(group.effort))} · ${esc(planText(overview.plan))}</small></div>` +
    group.domainShares.map((share) => Number.isFinite(share.share)
      ? `<div class="lab-ov-share"><span class="lab-ov-share-track"><span style="width:${(100 * share.share).toFixed(1)}%;background:${color(group)}"></span></span><small>${de(100 * share.share)} %</small></div>`
      : `<div class="lab-ov-share">${unknown}</div>`).join('')).join('');
  return `<section class="lab-ov-card" data-overview-domains>
    <h4>Wofür sind die Modelle gut?</h4>
    <p class="lab-ov-sub">Anteil gelöster Aufgaben je Bereich, gemittelt über die Läufe.</p>
    <div class="lab-ov-domains" style="--domains:${overview.domains.length}"><span></span>${heads}${rows}</div>
  </section>`;
}

function landscapeBlock(overview) {
  const columns = overview.runs;
  const heads = columns.map((run) => `<span class="lab-ov-run-head" style="--c:${color(overview.groups[run.group])}" title="${esc(groupName(overview.groups[run.group]))} · ${esc(effortLabel(run.effort))}">${esc(short(run.runId))}</span>`).join('');
  let previous = null;
  const rows = overview.landscape.map((row) => {
    const band = row.solved === row.total ? 'all' : row.solved === 0 ? 'none' : 'some';
    const gap = previous !== null && band !== previous ? ' lab-ov-gap' : '';
    previous = band;
    return `<code class="lab-ov-task${gap}" title="${esc(row.label)}">${esc(row.id)}</code>` +
      row.cells.map((cell, i) => `<span class="lab-ov-cell lab-ov-${cell}${gap}" title="${esc(row.id)} · ${esc(short(columns[i].runId))}: ${esc(outcomeLabels[cell])}"></span>`).join('') +
      `<span class="lab-ov-count${gap}">${row.solved}/${row.total}</span>`;
  }).join('');
  const legend = ['passed', 'failed', 'open', 'not-started'].map((key) => `<span><i class="lab-ov-${key}"></i>${outcomeLabels[key]}</span>`).join('');
  return `<section class="lab-ov-card" data-overview-landscape>
    <h4>Die Aufgabenlandschaft</h4>
    <p class="lab-ov-sub">Oben die Aufgaben, die fast alle Läufe lösen, unten die hartnäckigen. Jede Spalte ist ein Lauf.</p>
    <p class="lab-ov-legend">${legend}</p>
    <div class="lab-ov-landscape-wrap"><div class="lab-ov-landscape" style="--runs:${columns.length}"><span></span>${heads}<span></span>${rows}</div></div>
  </section>`;
}

export function renderBenchmarkOverview(container, overview) {
  if (!overview?.plan || !overview.groups.length) {
    container.innerHTML = `<p class="lab-ov-empty" data-overview-empty>Noch keine abgeschlossenen Benchmark-Läufe. Starte oben einen Standardtest oder einen ausführlichen Vergleichslauf. Die Auswertung erscheint danach hier.</p>`;
    return;
  }
  container.innerHTML = headerBlock(overview) + solvedBlock(overview) + costBlock(overview) +
    scatterBlock(overview) + domainBlock(overview) + landscapeBlock(overview);
}

export function mountBenchmarkOverview({ host, desktop, before = null }) {
  if (!desktop?.developmentEvidence) return { refresh() {} };
  const card = document.createElement('section');
  card.className = 'lab-card lab-overview';
  card.dataset.benchmarkOverview = '';
  card.innerHTML = `<div class="lab-ov-toolbar"><h3>Auswertung eigener Benchmark-Läufe</h3>
    <label class="lab-field">Plan <select data-overview-plan aria-label="Plan-Version der Auswertung"></select></label></div>
    <p class="lab-ov-status" data-overview-status role="status"></p><div data-overview-body></div>`;
  host.insertBefore(card, before);
  const select = card.querySelector('[data-overview-plan]');
  const statusLine = card.querySelector('[data-overview-status]');
  const body = card.querySelector('[data-overview-body]');
  let runs = [];
  let loading = false;
  function draw() {
    const overview = benchmarkOverview(runs, select.value);
    const previous = select.value;
    select.replaceChildren(...overview.plans.map((plan) => new Option(
      'Plan v' + (plan.version ?? '?') + ' · ' + (kindLabels[plan.kind] ?? plan.kind) + ' · ' + runWord(plan.runs), plan.key)));
    select.value = overview.plans.some((plan) => plan.key === previous) ? previous : overview.plan?.key ?? '';
    select.parentElement.hidden = overview.plans.length < 2;
    renderBenchmarkOverview(body, overview);
  }
  async function refresh() {
    if (loading) return;
    loading = true;
    statusLine.textContent = 'Gespeicherte Läufe werden ausgewertet …';
    try {
      const value = await desktop.developmentEvidence({ action: 'supplement-benchmark-runs' });
      runs = Array.isArray(value) ? value : [];
      statusLine.textContent = '';
      draw();
    } catch (error) {
      statusLine.textContent = error.message;
    } finally {
      loading = false;
    }
  }
  select.onchange = draw;
  return { refresh, card };
}
