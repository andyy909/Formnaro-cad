const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { expandPlan } = require('./ai-test-lab-plan.cjs');

const key = (row) => JSON.stringify([
  row.caseId, row.effort, row.variant, row.imageMode, row.workflow,
  row.sceneScope, row.repeat, row.dataset, row.stage,
]);

function resolveEffectivePlan(input, { roles, campaign = false, supported } = {}) {
  const requested = input.efforts;
  const efforts = requested.filter((effort) => !campaign || !supported || supported.includes(effort));
  if (!efforts.length) throw Error('Keine der geplanten Denkstufen wird vom Modell unterstützt.');
  const expanded = expandPlan({ ...input, efforts, ...(roles ? { roles } : {}) });
  return {
    ...expanded,
    efforts: [...new Set(expanded.rows.map((row) => row.effort))],
    droppedEfforts: requested.filter((effort) => !efforts.includes(effort)),
  };
}

function findStartedSeries(directory, previousFiles, name) {
  const matches = [];
  for (const file of fs.readdirSync(directory)) {
    if (previousFiles.has(file) || !/^Serie-[a-f0-9-]{36}\.json$/.test(file)) continue;
    try {
      const series = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
      if (file === 'Serie-' + series.id + '.json' && series.format === 'FormnaroLabSeries' &&
          series.version === 1 && series.plan?.name === name &&
          series.planHash === expandPlan(series.plan).planHash) matches.push(series);
    } catch {
      // The phase requires one valid persisted receipt.
    }
  }
  return matches.length === 1 ? matches[0] : undefined;
}

function samePlan(expected, actual) {
  if (!actual) return false;
  const { roles: expectedRoles, ...expectedPlan } = expected;
  const { roles: actualRoles, ...actualPlan } = actual;
  return isDeepStrictEqual(expectedPlan, actualPlan) &&
    Object.entries(expectedRoles ?? {}).every(([role, selection]) => {
      const chosen = actualRoles?.[role];
      // The starter canonicalizes model aliases and resolves the current provider.
      return chosen?.effort === selection.effort &&
        (selection.providerId === 'current' || chosen.providerId === selection.providerId);
    });
}

function matchSeriesRows(expanded, records, series, before) {
  const expected = new Set(expanded.rows.map(key));
  const recorded = new Map();
  let duplicate = 0;
  let foreign = 0;
  let unattributed = 0;
  for (const record of records) {
    if (before.has(record.id)) continue;
    if (!series || record.spec?.seriesId !== series.id) {
      unattributed++;
      continue;
    }
    const condition = key(record.spec);
    if (record.spec.planHash !== series.planHash || !expected.has(condition)) foreign++;
    else if (recorded.has(condition)) duplicate++;
    else recorded.set(condition, record);
  }
  const missing = expected.size - recorded.size;
  const receiptMatches = !!series && samePlan(expanded.plan, series.plan) && series.plannedTrials === expected.size &&
    Array.isArray(series.rows) && series.rows.length === expected.size &&
    new Set(series.rows.map(key)).size === expected.size &&
    series.rows.every((row) => row.seriesId === series.id && row.planHash === series.planHash && expected.has(key(row)));
  return {
    seriesId: series?.id,
    rows: [...recorded.values()],
    ok: receiptMatches && !missing && !duplicate && !foreign,
    integrity: { expected: expected.size, found: recorded.size, missing, duplicate, foreign, unattributed, receiptMatches },
  };
}

module.exports = { resolveEffectivePlan, findStartedSeries, matchSeriesRows };
