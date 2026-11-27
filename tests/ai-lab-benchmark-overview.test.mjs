import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  benchmarkOverview, benchmarkPlans, benchmarkRunsFromReports, stageOutcome,
} from '../ai/lab-benchmark-overview.mjs';
import { sampleReports } from './fixtures/lab-benchmark-v13-sample.mjs';

const near = (actual, expected, digits = 3) => assert.equal(Number(actual.toFixed(digits)), expected);

test('saved stage reports become one run per benchmark and effort with all 25 tasks', () => {
  const runs = benchmarkRunsFromReports(sampleReports());
  assert.equal(runs.length, 8);
  for (const run of runs) assert.equal(run.tasks.length, 25);
  const sol = runs.find((run) => run.runId.startsWith('21fe9f9e'));
  assert.equal(sol.solved, 24);
  assert.equal(sol.version, 13);
  assert.equal(sol.kind, 'compact');
  assert.equal(sol.costUSD, 1.7347, 'upper cost estimate');
  assert.equal(sol.outputTokens, 22088);
  assert.equal(sol.elapsedMs, 679600);
  const mistral = runs.find((run) => run.runId.startsWith('45754961'));
  assert.equal(mistral.solved, 17);
  assert.equal(mistral.tasks.find((task) => task.id === 'stl-cross-drilled').outcome, 'not-started');
  assert.equal(mistral.tasks.find((task) => task.id === 'drawing-revision').outcome, 'open');
  assert.equal(mistral.tasks.find((task) => task.id === 'fixture-7').outcome, 'failed');
});

test('groups by model and effort, averages solved tasks and per-solved values per run', () => {
  const overview = benchmarkOverview(benchmarkRunsFromReports(sampleReports()));
  assert.equal(overview.taskCount, 25);
  assert.equal(overview.runs.length, 8);
  assert.deepEqual(overview.groups.map((group) => [group.model, group.effort, group.runs.length]), [
    ['GPT-6.2 Sol', 'medium', 1], ['GPT-6.1 Terra', 'medium', 2], ['DeepSeek Flash', 'high', 1],
    ['Mistral Large 4', 'medium', 1], ['DeepSeek Flash', 'low', 3],
  ]);
  const [sol, terra, flashHigh, mistral, flashLow] = overview.groups;
  assert.equal(sol.meanSolved, 24);
  assert.equal(terra.meanSolved, 21);
  assert.deepEqual(terra.solved, [22, 20]);
  near(flashLow.meanSolved, 15.667);
  assert.equal(flashHigh.meanSolved, 20);
  assert.equal(mistral.meanSolved, 17);
  near(sol.costPerSolved, 0.072);
  near(terra.costPerSolved, 0.028);
  near(flashLow.costPerSolved, 0.01);
  near(flashHigh.costPerSolved, 0.009);
  near(mistral.costPerSolved, 0.022);
  assert.equal(Math.round(sol.secondsPerSolved), 28);
  assert.equal(Math.round(terra.secondsPerSolved), 24);
  assert.equal(Math.round(mistral.secondsPerSolved), 64);
  assert.equal(Math.round(flashLow.tokensPerSolved), 6013);
  assert.equal(Math.round(flashHigh.tokensPerSolved), 5911);
  assert.deepEqual(sol.domainShares.map((share) => [share.label, Math.round(100 * share.share)]), [['CAD', 100], ['STL', 83], ['Zeichnen', 100]]);
  assert.deepEqual(flashLow.domainShares.map((share) => Math.round(100 * share.share)), [53, 67, 76]);
  assert.equal(overview.headline.text, 'GPT-6.2 Sol löst am meisten, DeepSeek Flash High am günstigsten');
});

test('the task landscape runs from easy to hard and keeps plan order for ties', () => {
  const { landscape, runs, groups } = benchmarkOverview(benchmarkRunsFromReports(sampleReports()));
  assert.deepEqual(landscape.filter((row) => row.solved === 8).map((row) => row.id), [
    'fixture-3', 'fixture-5', 'bore-oblique', 'converter-selected', 'converter-cone', 'drawing-views', 'drawing-section', 'drawing-assembly',
  ]);
  assert.deepEqual(landscape.map((row) => row.solved), [...landscape.map((row) => row.solved)].sort((a, b) => b - a));
  assert.equal(landscape.at(-1).id, 'stl-rim');
  assert.equal(landscape.at(-1).solved, 0);
  assert.equal(landscape.at(-2).id, 'stl-countersinks');
  for (const row of landscape) assert.equal(row.total, runs.length);
  // Columns follow the group order so runs of one group stay together.
  assert.deepEqual(runs.map((run) => run.group), [0, 1, 1, 2, 3, 4, 4, 4]);
  assert.equal(groups.length, 5);
});

test('missing values stay unknown instead of becoming zero', () => {
  const reports = sampleReports().filter((report) => report.connection.model === 'GPT-6.2 Sol');
  for (const report of reports) {
    for (const domain of report.simpleRun.domains) {
      const tokens = domain.results.medium.effortTokens;
      delete tokens.costUSD;
      tokens.outputTokens = { tokens: 0, reported: 0 };
      delete domain.results.medium.modelMs;
    }
    delete report.simpleRun.elapsedMs;
  }
  const [run] = benchmarkRunsFromReports(reports);
  assert.equal(run.costUSD, null);
  assert.equal(run.outputTokens, null);
  assert.equal(run.elapsedMs, null);
  const [group] = benchmarkOverview([run]).groups;
  assert.equal(group.costPerSolved, null);
  assert.equal(group.secondsPerSolved, null);
  assert.equal(group.tokensPerSolved, null);
  assert.equal(benchmarkOverview([run]).headline.text, 'GPT-6.2 Sol löst am meisten');
});

test('plan versions are never mixed and unsettled runs are left out', () => {
  const reports = sampleReports();
  const v14 = sampleReports({ startedAt: Date.parse('2026-11-22T08:00:00Z') })
    .filter((report) => report.connection.model === 'DeepSeek Flash' && report.effort === 'high')
    .map((report) => {
      const copy = structuredClone(report);
      copy.simpleRun.id = copy.simpleRun.id.replace(/^3/, '4');
      copy.simpleRun.kind = 'detailed';
      copy.simpleRun.plan.version = 14;
      copy.outcome = copy.results[0]?.status === 'passed' ? 'passed' : copy.results[0]?.status === 'failed' ? 'failed' : 'open';
      return copy;
    });
  const running = structuredClone(reports.filter((report) => report.connection.model === 'Mistral Large 4'));
  for (const report of running) {
    report.simpleRun.id = 'ffffffff-0000-4000-8000-000000000000';
    report.simpleRun.status = 'running';
  }
  const runs = benchmarkRunsFromReports([...reports, ...v14, ...running]);
  assert.equal(runs.length, 9);
  const plans = benchmarkPlans(runs);
  assert.deepEqual(plans.map((plan) => [plan.key, plan.runs]), [['detailed:14', 1], ['compact:13', 8]]);
  const newest = benchmarkOverview(runs);
  assert.equal(newest.plan.key, 'detailed:14');
  assert.equal(newest.runs.length, 1);
  assert.equal(newest.runs[0].solved, 20);
  const older = benchmarkOverview(runs, 'compact:13');
  assert.equal(older.runs.length, 8);
  assert.ok(older.runs.every((run) => run.version === 13));
});

test('an empty store yields an empty overview without groups', () => {
  const overview = benchmarkOverview([]);
  assert.equal(overview.plan, null);
  assert.deepEqual(overview.groups, []);
  assert.equal(overview.headline, null);
  assert.deepEqual(benchmarkRunsFromReports(undefined), []);
});

test('compact stage outcomes separate a failed check from errors and stops', () => {
  assert.equal(stageOutcome({ caseIds: ['a'], results: [{ status: 'passed' }] }), 'passed');
  assert.equal(stageOutcome({ caseIds: ['a'], results: [{ status: 'failed' }] }), 'failed');
  assert.equal(stageOutcome({ caseIds: ['a'], results: [{ status: 'error' }] }), 'open');
  assert.equal(stageOutcome({ caseIds: ['a', 'b'], results: [{ status: 'failed' }] }), 'open');
  assert.equal(stageOutcome({ caseIds: ['a'], results: [] }), 'open');
  assert.equal(stageOutcome({ outcome: 'failed', results: [{ status: 'error' }] }), 'failed');
});

test('the desktop store returns overview runs from saved receipts', () => {
  const require = createRequire(import.meta.url);
  const { createSupplementalEvidence } = require('../backend/ai-lab-supplemental-evidence.cjs');
  const directory = mkdtempSync(path.join(tmpdir(), 'formnaro-overview-'));
  try {
    const store = createSupplementalEvidence(directory);
    assert.deepEqual(store.benchmarkRuns(), []);
    for (const report of sampleReports())
      writeFileSync(path.join(directory, 'Zusatzpruefung-' + report.id + '.json'), JSON.stringify(report));
    const runs = store.benchmarkRuns();
    assert.equal(runs.length, 8);
    assert.equal(benchmarkOverview(runs).groups[0].meanSolved, 24);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the overview markup shows all six blocks, escapes model names and marks unknown values', async () => {
  const { renderBenchmarkOverview } = await import('../src/cad-ai-lab-benchmark-overview.js');
  const runs = benchmarkRunsFromReports(sampleReports());
  runs[0].model = '<img src=x onerror=alert(1)>';
  runs[1].costUSD = null;
  runs[2].costUSD = null;
  const box = { innerHTML: '' };
  renderBenchmarkOverview(box, benchmarkOverview(runs));
  for (const block of ['solved', 'costs', 'scatter', 'domains', 'landscape'])
    assert.match(box.innerHTML, new RegExp('data-overview-' + block));
  assert.match(box.innerHTML, /25 Aufgaben · 8 Läufe/);
  assert.doesNotMatch(box.innerHTML, /<img/);
  assert.match(box.innerHTML, /&lt;img src=x/);
  assert.match(box.innerHTML, /lab-ov-unknown">unbekannt/);
  assert.match(box.innerHTML, /nicht eingezeichnet: 2 Läufe/);
  assert.match(box.innerHTML, /\$0,072/);
  assert.match(box.innerHTML, /6\.013/);
  assert.equal((box.innerHTML.match(/class="lab-ov-cell /g) ?? []).length, 25 * 8);
  renderBenchmarkOverview(box, benchmarkOverview([]));
  assert.match(box.innerHTML, /data-overview-empty/);
  assert.doesNotMatch(box.innerHTML, /<svg/);
});
