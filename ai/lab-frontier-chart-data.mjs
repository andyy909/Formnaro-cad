export function frontierChartRow(report) {
  if (!report || typeof report !== 'object') return null;
  const { benchmark, connection, history, caseIds, campaign, task } = report;
  const row = Array.isArray(history) ? history.at(-1) : null;
  if (report.mode !== 'live' || typeof campaign !== 'string' || !benchmark ||
      typeof connection?.model !== 'string' || typeof task !== 'string' || !row ||
      row.level !== report.level || row.effort !== report.effort || !caseIds?.length ||
      !Number.isInteger(row.finished) || !Number.isInteger(row.passed) ||
      row.passed < 0 || row.finished < row.passed || row.finished > caseIds.length) return null;
  return {
    id: report.id, campaign, domain: benchmark.id, label: benchmark.label, version: benchmark.version,
    provider: connection.providerId ?? '', model: connection.model, effort: row.effort, level: row.level,
    task, attempts: caseIds.length, passed: row.passed, finished: row.finished, date: report.startedAt,
    minutes: report.minutes ?? null, budgetScope: report.simpleRun ? 'task' : 'effort',
    quickBenchmark: report.simpleRun?.kind === 'quick',
    compactBenchmark: report.simpleRun?.kind === 'compact',
    ...(report.simpleRun?.kind === 'detailed' ? { detailedBenchmark: true, contextVariant: report.results?.[0]?.context?.variant } : {}),
    ...(report.simpleRun?.kind === 'stl-challenge' ? { modelCheckProfile: report.simpleRun.plan?.modelCheckProfile } : {}),
    ...(report.fittingVariant ? { fittingVariant: report.fittingVariant } : {}),
    requestLimit: report.requestLimit,
    outputLimit: report.outputLimit,
    effortCount: report.simpleRun?.efforts?.length,
    stopAfterSuccess: report.stopAfterSuccess === true,
    successfulAttempt: report.stopAfterSuccess && Array.isArray(report.results)
      ? report.results.findIndex((result) => result?.status === 'passed') + 1 || null
      : null,
  };
}

const byDate = (a, b) => String(b.date).localeCompare(String(a.date));
const runKey = (row) => JSON.stringify([row.campaign, row.domain]);
const conditionKey = (row) => JSON.stringify([
  row.domain, row.version, row.level, row.task, row.effort, row.attempts, row.minutes, row.budgetScope,
  row.stopAfterSuccess, row.quickBenchmark === true, row.compactBenchmark === true,
  ...(row.compactBenchmark || row.detailedBenchmark || row.fittingVariant ? [row.requestLimit, row.outputLimit, row.effortCount] : []),
  ...(row.detailedBenchmark ? [row.contextVariant] : []),
  ...(row.fittingVariant ? [row.fittingVariant] : []),
  ...(row.modelCheckProfile ? [row.modelCheckProfile, row.requestLimit, row.outputLimit] : []),
]);
export const reasoningLabel = (effort) => ['none', 'disabled'].includes(effort) ? 'Off' : effort;

export function frontierChartRuns(rows) {
  const groups = new Map();
  for (const row of [...rows].sort(byDate)) {
    const key = runKey(row);
    if (!groups.has(key)) groups.set(key, { key, sample: row, rows: [] });
    groups.get(key).rows.push(row);
  }
  return [...groups.values()];
}
export function frontierChartComparisons(rows) {
  const conditions = new Map();
  for (const row of [...rows].sort(byDate)) {
    if (row.finished !== row.attempts && !(row.stopAfterSuccess && row.passed > 0)) continue;
    const key = conditionKey(row);
    if (!conditions.has(key)) conditions.set(key, { key, sample: row, models: new Map() });
    const models = conditions.get(key).models;
    const identity = JSON.stringify([row.provider, row.model]);
    if (!models.has(identity)) models.set(identity, { sample: row, passed: 0, total: 0, runs: 0 });
    const result = models.get(identity);
    result.passed += row.stopAfterSuccess ? Number(row.passed > 0) : row.passed;
    result.total += row.stopAfterSuccess ? 1 : row.finished;
    result.runs++;
  }
  return [...conditions.values()].map(({ key, sample, models }) => ({
    key, sample,
    models: [...models.values()].sort((a, b) => b.passed / b.total - a.passed / a.total),
  })).sort((a, b) => Number(b.models.length > 1) - Number(a.models.length > 1) || byDate(a.sample, b.sample));
}
