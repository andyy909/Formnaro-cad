// Prepares saved staged benchmark runs (compact v13 or detailed v14) for the
// laboratory overview. Pure data code: shared by the desktop store and the UI.

const kinds = new Set(['compact', 'detailed']);
const settled = (run) => ['finished', 'incomplete'].includes(run?.status);
const finite = (value) => Number.isFinite(value) && value >= 0;
const end = (report) => String(report?.endedAt ?? report?.startedAt ?? '');

export const outcomeLabels = {
  passed: 'gelöst', failed: 'fachlich gescheitert', open: 'offen oder Fehler', 'not-started': 'ohne Versuch',
};
export const domainShortLabels = { Plattengrenze: 'CAD', 'STL-Grenze': 'STL', Zeichnungsgrenze: 'Zeichnen' };
export const kindLabels = { compact: 'Stufenbenchmark', detailed: 'Vergleichslauf' };
const effortNames = {
  auto: 'Automatisch', none: 'Off', disabled: 'Off', enabled: 'On', minimal: 'Minimal',
  low: 'Low', medium: 'Medium', high: 'High', xhigh: 'XHigh', max: 'Max',
};
export const effortLabel = (effort) => effortNames[effort] ?? String(effort ?? 'unbekannt');

// Outcome of one saved stage report. Detailed runs store it; compact runs are
// derived from the attempts: a pass wins, all evaluated without pass is a
// technical failure of the task, anything else (error, stop) stays open.
export function stageOutcome(report) {
  if (['passed', 'failed', 'open'].includes(report?.outcome)) return report.outcome;
  const results = Array.isArray(report?.results) ? report.results : [];
  if (results.some((row) => row?.status === 'passed')) return 'passed';
  const planned = Array.isArray(report?.caseIds) ? report.caseIds.length : results.length;
  if (results.length && results.length === planned && results.every((row) => row?.status === 'failed')) return 'failed';
  return 'open';
}

function sumTokens(simpleRun, effort) {
  let cost = 0, costKnown = false, partial = false, output = 0, outputKnown = false, ms = 0, msKnown = false;
  for (const domain of simpleRun.domains ?? []) {
    const result = domain?.results?.[effort];
    if (!result) continue;
    const tokens = result.effortTokens;
    if (tokens?.costUSD?.reported > 0 && finite(tokens.costUSD.max)) {
      cost += tokens.costUSD.max;
      costKnown = true;
      if (tokens.costUSD.reported < tokens.requests) partial = true;
    } else if (tokens?.requests > 0) partial = true;
    if (tokens?.outputTokens?.reported > 0 && finite(tokens.outputTokens.tokens)) {
      output += tokens.outputTokens.tokens;
      outputKnown = true;
    }
    if (finite(result.modelMs) && finite(result.localMs)) {
      ms += result.modelMs + result.localMs;
      msKnown = true;
    }
  }
  if (!msKnown && simpleRun.efforts?.length === 1 && finite(simpleRun.elapsedMs)) {
    ms = simpleRun.elapsedMs;
    msKnown = true;
  }
  return {
    costUSD: costKnown ? cost : null, costPartial: costKnown && partial,
    outputTokens: outputKnown ? output : null, elapsedMs: msKnown ? ms : null,
  };
}

// One entry per (simpleRun, effort): a "Lauf" in the overview.
export function benchmarkRunsFromReports(reports) {
  const groups = new Map();
  for (const report of Array.isArray(reports) ? reports : []) {
    const run = report?.simpleRun;
    if (!run || typeof run.id !== 'string' || !kinds.has(run.kind)) continue;
    if (!groups.has(run.id)) groups.set(run.id, []);
    groups.get(run.id).push(report);
  }
  const runs = [];
  for (const [id, group] of groups) {
    group.sort((a, b) => end(a).localeCompare(end(b)));
    const latest = group.findLast((report) => settled(report.simpleRun));
    if (!latest) continue;
    const simpleRun = latest.simpleRun;
    const planDomains = simpleRun.plan?.domains && typeof simpleRun.plan.domains === 'object' ? simpleRun.plan.domains : {};
    const plannedTasks = Object.entries(planDomains).flatMap(([domain, area]) =>
      (Array.isArray(area?.tasks) ? area.tasks : []).map((task) => ({ id: task.id, label: task.label ?? task.id, domain })));
    const efforts = Array.isArray(simpleRun.efforts) ? simpleRun.efforts : [];
    for (const effort of efforts) {
      const stages = new Map();
      for (const report of group) {
        if (report.effort !== effort || typeof report.taskId !== 'string') continue;
        if (report.status === 'running') continue;
        stages.set(report.taskId, { outcome: stageOutcome(report), domain: report.benchmark?.id, label: report.task });
      }
      const detailedStages = new Map((simpleRun.domains ?? []).flatMap((domain) =>
        (domain?.stages ?? []).map((stage) => [stage.taskId, { ...stage, domain: domain.id }])));
      const known = plannedTasks.length ? plannedTasks
        : [...stages].map(([taskId, stage]) => ({ id: taskId, label: stage.label ?? taskId, domain: stage.domain }));
      const tasks = known.map((task) => {
        const saved = stages.get(task.id);
        const detailed = detailedStages.get(task.id);
        const outcome = saved?.outcome ?? (detailed?.cause === 'not-started' ? 'not-started'
          : ['passed', 'failed', 'open'].includes(detailed?.outcome) ? detailed.outcome : 'not-started');
        return { id: task.id, label: task.label, domain: task.domain, outcome };
      });
      runs.push({
        id: id + ':' + effort, runId: id, kind: simpleRun.kind,
        version: Number.isFinite(simpleRun.plan?.version) ? simpleRun.plan.version : latest.benchmark?.version ?? null,
        model: latest.connection?.model ?? simpleRun.model ?? 'unbekannt',
        provider: latest.connection?.providerId ?? simpleRun.providerId ?? '',
        effort, status: simpleRun.status, endedAt: end(latest),
        solved: tasks.filter((task) => task.outcome === 'passed').length,
        ...sumTokens(simpleRun, effort), tasks,
      });
    }
  }
  return runs.sort((a, b) => a.endedAt.localeCompare(b.endedAt));
}

const planKey = (run) => run.kind + ':' + run.version;
const mean = (values) => {
  const known = values.filter((value) => Number.isFinite(value));
  return known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
};
const perSolved = (value, solved) => (Number.isFinite(value) && solved > 0 ? value / solved : null);

// Plan versions are never mixed: each selectable plan is one kind and version.
export function benchmarkPlans(runs) {
  const plans = new Map();
  for (const run of runs) {
    const key = planKey(run);
    if (!plans.has(key)) plans.set(key, { key, kind: run.kind, version: run.version, runs: 0, latest: '' });
    const plan = plans.get(key);
    plan.runs++;
    if (run.endedAt > plan.latest) plan.latest = run.endedAt;
  }
  return [...plans.values()].sort((a, b) => b.latest.localeCompare(a.latest));
}

export function benchmarkOverview(runs, planChoice) {
  const plans = benchmarkPlans(runs ?? []);
  const plan = plans.find((item) => item.key === planChoice) ?? plans[0];
  if (!plan) return { plans, plan: null, groups: [], runs: [], landscape: [], taskCount: 0, domains: [], headline: null };
  const chosen = runs.filter((run) => planKey(run) === plan.key);
  const taskOrder = new Map();
  for (const run of chosen) for (const task of run.tasks) {
    if (!taskOrder.has(task.id)) taskOrder.set(task.id, { ...task, index: taskOrder.size });
  }
  const domains = [...new Set([...taskOrder.values()].map((task) => task.domain))].filter(Boolean)
    .map((id) => ({ id, label: domainShortLabels[id] ?? id, tasks: [...taskOrder.values()].filter((task) => task.domain === id).length }));
  const groups = new Map();
  for (const run of chosen) {
    const key = JSON.stringify([run.provider, run.model, run.effort]);
    if (!groups.has(key)) groups.set(key, { key, model: run.model, provider: run.provider, effort: run.effort, version: run.version, kind: run.kind, runs: [] });
    groups.get(key).runs.push(run);
  }
  const summarized = [...groups.values()].map((group, index) => {
    const solved = group.runs.map((run) => run.solved);
    return {
      ...group, index,
      solved, meanSolved: mean(solved),
      costPerSolved: mean(group.runs.map((run) => perSolved(run.costUSD, run.solved))),
      secondsPerSolved: mean(group.runs.map((run) => perSolved(run.elapsedMs === null ? null : run.elapsedMs / 1000, run.solved))),
      tokensPerSolved: mean(group.runs.map((run) => perSolved(run.outputTokens, run.solved))),
      costPartial: group.runs.some((run) => run.costPartial),
      domainShares: domains.map((domain) => {
        const shares = group.runs.map((run) => {
          const tasks = run.tasks.filter((task) => task.domain === domain.id);
          return tasks.length ? tasks.filter((task) => task.outcome === 'passed').length / tasks.length : null;
        });
        return { id: domain.id, label: domain.label, share: mean(shares) };
      }),
    };
  }).sort((a, b) => (b.meanSolved ?? -1) - (a.meanSolved ?? -1) || a.index - b.index)
    .map((group, index) => ({ ...group, index }));
  const columns = summarized.flatMap((group) => group.runs.map((run) => ({ ...run, group: group.index })));
  const landscape = [...taskOrder.values()].map((task) => {
    const cells = columns.map((run) => run.tasks.find((item) => item.id === task.id)?.outcome ?? 'not-started');
    return { id: task.id, label: task.label, domain: task.domain, index: task.index, cells,
      solved: cells.filter((cell) => cell === 'passed').length, total: cells.length };
  }).sort((a, b) => b.solved - a.solved || a.index - b.index);
  return {
    plans, plan, groups: summarized, runs: columns, landscape, domains,
    taskCount: taskOrder.size, headline: benchmarkHeadline(summarized),
  };
}

export function groupName(group) {
  return String(group.model);
}

export function benchmarkHeadline(groups) {
  if (!groups.length) return null;
  const best = groups.reduce((a, b) => ((b.meanSolved ?? -1) > (a.meanSolved ?? -1) ? b : a));
  const priced = groups.filter((group) => Number.isFinite(group.costPerSolved));
  const cheapest = priced.length ? priced.reduce((a, b) => (b.costPerSolved < a.costPerSolved ? b : a)) : null;
  const name = (group) => groupName(group) + (groups.filter((item) => item.model === group.model).length > 1 ? ' ' + effortLabel(group.effort) : '');
  if (!cheapest) return { best, cheapest: null, text: name(best) + ' löst am meisten' };
  if (cheapest === best) return { best, cheapest, text: name(best) + ' löst am meisten und am günstigsten' };
  return { best, cheapest, text: name(best) + ' löst am meisten, ' + name(cheapest) + ' am günstigsten' };
}
