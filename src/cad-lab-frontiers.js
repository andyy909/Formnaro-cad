import { showLabProject } from './cad-lab-preview-assets.js';
import { recordLabReference } from './cad-lab-visual-record.js';
import { compactLimits } from './cad-lab-compact-plan.js';
import { compactLabCadRequest } from './cad-lab-provider-context.js';
import { createTokenTotals, mergeTokenTotals } from '../ai/lab-token-totals.mjs';
import { measureLabRequests } from './cad-lab-request-usage.js';
import settings from '../ai/lab-plate-frontier.json' with { type: 'json' };
import guided from '../ai/benchmark-guided-v1.json' with { type: 'json' };
import cases from '../ai/lab-supplemental-cases.json' with { type: 'json' };

export const frontiers = new Map([
  ['Plattengrenze', settings.label],
  ['Vorführgrenze', 'Leistungsgrenze · Vorführen'],
  ['Fotogrenze', 'Leistungsgrenze · Fotos'],
  ['STL-Grenze', 'Leistungsgrenze · STL zu CAD'],
]);
const quickLimits = {
  minutes: 1,
  requests: { Plattengrenze: 5, Zeichnungsgrenze: 2, 'STL-Grenze': 3 },
  guided: { seconds: 60, outputTokens: 4096, rounds: 1, formatRepairs: 0, requestBudget: 1 },
};

const caseOrder = {
  Vorführgrenze: guided.cases.map((c) => c.caseId),
  Fotogrenze: ['photo-calibrated', 'photo-perspective', 'photo-missing-scale'],
  'STL-Grenze': ['stl-bores', 'stl-countersinks', 'stl-rim', 'stl-cone', 'stl-freeform'],
};
function linearTask(domain, level) {
  if (domain === 'Plattengrenze') return { id: 'plate', label: level + 1 + ' Bohrungen', level };
  if (domain === 'Fotogrenze' && level > 18)
    return { id: 'photo-set', level, size: level - 17, label: level - 17 + ' verschiedene Fotos mit je 16 Öffnungen' };
  if (domain === 'Vorführgrenze' && level > guided.cases.length)
    return { id: 'guided-set', level, size: level - guided.cases.length + 1,
      label: level - guided.cases.length + 1 + ' anspruchsvolle Vorführungen in Folge' };
  if (domain === 'Fotogrenze' && level >= 4)
    return {
      id: 'photo-openings-' + (level - 2),
      level,
      label: 'Kalibrierte Platte mit ' + (level - 2) + ' versetzten Öffnungen',
    };
  if (domain === 'STL-Grenze' && level > 5)
    return { id: 'stl-stepped-' + (level - 2), level, label: level - 2 + ' versetzte Stufenbohrungen' };
  const id = caseOrder[domain]?.[level - 1];
  if (!id) return null;
  return {
    id,
    level,
    label: guided.cases.find((c) => c.caseId === id)?.label ?? cases.find((c) => c.id === id)?.label ?? id,
  };
}
function growthSteps(first, last) {
  const steps = [first];
  const factor = Math.max(2, Math.trunc(settings.progression.factor));
  while (steps.at(-1) < last) steps.push(Math.min(last, steps.at(-1) * factor));
  return steps;
}
const plateBores = growthSteps(2, settings.progression.plateBores);
const steppedBores = growthSteps(4, settings.progression.steppedBores);
const photoOpenings = growthSteps(2, 16);
const photoSetSize = growthSteps(2, settings.progression.photoSetSize);
const guidedSetSize = growthSteps(2, settings.progression.guidedSetSize);
const guidedExercises = guided.cases.slice(3);

export function taskAt(domain, level, version = settings.version) {
  if (version < 4) return linearTask(domain, level);
  if (domain === 'Plattengrenze') {
    const holes = plateBores[level - 1];
    return holes ? linearTask(domain, holes - 1) : null;
  }
  if (domain === 'STL-Grenze' && level > 5) {
    const holes = steppedBores[level - 6];
    return holes ? linearTask(domain, holes + 2) : null;
  }
  if (domain === 'Fotogrenze' && level > 3) {
    const holes = photoOpenings[level - 4];
    if (holes) return linearTask(domain, holes + 2);
    const size = photoSetSize[level - 4 - photoOpenings.length];
    return size ? linearTask(domain, 17 + size) : null;
  }
  if (domain === 'Vorführgrenze' && level > 3) {
    const size = guidedSetSize[level - 4];
    return size ? {
      id: 'guided-set', level, size, exercises: guidedExercises,
      label: size + ' anspruchsvolle Vorführungen in Folge',
    } : null;
  }
  return linearTask(domain, level);
}
export async function runDomainTrial(domain, task, runtime, modeler, effort) {
  if (task.check === 'fitting-pocket') {
    const { runLabFittingPocket } = await import('./cad-lab-fitting-pocket.js');
    return runLabFittingPocket(runtime);
  }
  if (task.check === 'cad') {
    const { runCadDevelopmentCheck } = await import('./cad-lab-development-checks.js');
    return runCadDevelopmentCheck(task.id, runtime);
  }
  if (task.check === 'spatial-bores') {
    const { runSpatialBoreCheck } = await import('./cad-lab-spatial-bores.js');
    return runSpatialBoreCheck(task.id, runtime);
  }
  if (task.check === 'fixture') {
    const { runLabFixture } = await import('./cad-lab-fixture.js');
    return runLabFixture(task.fixtureStage, runtime, { checkOriginalGuide: !!task.fittingVariant });
  }
  if (task.check === 'drawing') {
    const { runDrawingBenchmark } = await import('./cad-lab-drawing.js');
    return runDrawingBenchmark(task.drawingStage, runtime);
  }
  if (task.check === 'stl-challenge') {
    const { runStlChallenge } = await import('./cad-lab-converter-checks.js');
    return runStlChallenge(task.id, runtime);
  }
  if (task.check === 'converter') {
    const { runStlDevelopmentCheck } = await import('./cad-lab-converter-checks.js');
    return runStlDevelopmentCheck(task.id, runtime);
  }
  if (task.id === 'guided-set' || task.id === 'photo-set') {
    const exercises = task.exercises ?? guided.cases.slice(-3);
    const checks = [];
    let requests = 0;
    for (let index = 0; index < task.size; index++) {
      runtime.signal.throwIfAborted();
      const next = task.id === 'photo-set'
        ? { id: 'photo-openings-16', photoVariant: index + 1, label: 'Fotomotiv ' + (index + 1) }
        : { id: exercises[index % exercises.length].caseId, label: exercises[index % exercises.length].label };
      runtime.showTask?.(next);
      const result = await runDomainTrial(domain, next, runtime, modeler, effort);
      requests += result.requests ?? 0;
      const failure = result.checks.find((check) => !check.passed);
      checks.push({ label: next.label, passed: !failure, ...(failure ? { actual: failure.label } : {}) });
      if (failure) break;
    }
    return task.id === 'guided-set' ? { checks, requests } : { checks };
  }
  if (domain === 'Plattengrenze') {
    const { runPlateLevel } = await import('./cad-lab-plate-benchmark.js');
    return runPlateLevel({ ...task, repeat: false }, runtime);
  }
  if (domain === 'Fotogrenze') {
    const { runPhotoDevelopmentCheck } = await import('./cad-lab-photo-checks.js');
    return runPhotoDevelopmentCheck(task.id, { ...runtime, photoVariant: task.photoVariant });
  }
  if (domain === 'STL-Grenze') {
    const { runStlDevelopmentCheck } = await import('./cad-lab-converter-checks.js');
    return runStlDevelopmentCheck(task.id, {
      ...runtime, remodelFirst: true, editableOnly: task.check === 'stl-editable', sectionProfiles: task.contextSectionProfiles,
    });
  }
  const abort = () => void runtime.desktop.diagnostics({ action: 'cancel' }).catch(() => {});
  runtime.signal.addEventListener('abort', abort, { once: true });
  try {
    const name = 'Vorführung ' + crypto.randomUUID();
    const state = await runtime.desktop.diagnostics({
      action: 'start',
      mode: 'lab',
      deferReview: true,
      plan: {
        name,
        caseIds: [task.id],
        preset: 'practice-functions',
        variants: ['C'],
        efforts: [effort],
        repeats: 1,
        stage: 'full',
        dataset: 'development',
        workflow: 'practice',
        scopes: ['selection'],
        images: ['none'],
        monitor: { mode: 'off' },
        limits: runtime.quickBenchmark ? quickLimits.guided : guided.limits,
        roles: { modeler: { ...modeler, effort } },
      },
    });
    const record = state.records.find((r) => r.spec?.seriesName === name);
    if (!record) throw Error('Prüfprotokoll der Vorführung fehlt.');
    const { model, ...result } = await runtime.desktop.developmentEvidence({
      action: 'guided-result', id: record.id, ...(runtime.showReference ? { visual: true } : {}),
    });
    if (model && runtime.showReference) {
      const cad = runtime.createController();
      try {
        await cad.open(model);
        await showLabProject(runtime, cad, { role: 'result', drawings: true });
      } catch { /* Saved practice evidence still contains the scored result. */ }
      finally { cad.dispose(); }
    }
    runtime.guidedUsage?.(result);
    if (!['passed', 'failed'].includes(result.outcome)) throw Error('Vorführung nicht auswertbar: ' + result.outcome);
    return {
      checks: [
        { label: 'Sichtbare Übung mit nativer Abschlussprüfung', passed: result.outcome === 'passed', actual: result },
      ],
      requests: result.requests,
    };
  } finally {
    runtime.signal.removeEventListener('abort', abort);
  }
}
export async function runFrontier({
  domain,
  efforts,
  modeler,
  minutes: overrideMinutes,
  budgetPerLevel = false,
  stopAfterSuccess = false,
  simpleRun,
  compact,
  quickTask,
  onStage = () => {},
  showTask,
  showReference,
  attempts = simpleRun?.kind === 'quick' ? 1 : compact ? (compact.detailed ? (compact.independentAttempts ?? 1) : compactLimits.attempts) : settings.attempts,
  trial = runDomainTrial,
  signal,
  desktop,
  makeRuntime,
  render,
  status,
}) {
  const campaign = simpleRun?.id ?? crypto.randomUUID(),
    history = [];
  const getTask = (level) => compact ? compact.tasks[level - 1] : quickTask ?? taskAt(domain, level);
  const detailed = compact?.detailed;
  const independentAttempts = compact?.independentAttempts !== undefined;
  const quick = simpleRun?.kind === 'quick';
  for (const effort of efforts) {
    if (signal.aborted) break;
    const effortStop = new AbortController();
    const effortSignal = AbortSignal.any([signal, effortStop.signal]);
    const effortMinutes = quick ? quickLimits.minutes
      : overrideMinutes === undefined ? (settings.minutesByEffort[effort] ?? settings.minutesByEffort.default)
      : overrideMinutes;
    const timer = (controller, minutes) => minutes == null ? null : setTimeout(() => controller.abort(), minutes * 60000);
    const budget = budgetPerLevel ? null : timer(effortStop, effortMinutes);
    let remaining = true;
    const effortTokens = createTokenTotals();
    try {
      for (let level = 1; remaining && !effortSignal.aborted; level++) {
        const task = getTask(level);
        if (!task || compact?.exhausted()) break;
        const minutes = compact ? task.seconds / 60 : effortMinutes;
        const stop = budgetPerLevel ? new AbortController() : effortStop;
        const combined = budgetPerLevel ? AbortSignal.any([effortSignal, stop.signal]) : effortSignal;
        const levelBudget = budgetPerLevel && !independentAttempts ? timer(stop, minutes) : null;
        try {
          const buildRuntime = (signal = combined) => makeRuntime({ desktop, signal, useAI: true, modeler, effort });
          const runtime = detailed ? null : await buildRuntime();
          const requestLimit = compact ? task.requests : quick ? quickLimits.requests[domain] : undefined;
          const id = crypto.randomUUID();
          const report = {
            id,
            mode: 'live',
            connection: runtime?.connection,
            benchmark: { id: domain, label: compact?.label ?? (domain === 'Zeichnungsgrenze' ? 'Technisches Zeichnen' : frontiers.get(domain)), version: compact?.version ?? (quick ? simpleRun.plan.version : settings.version) },
            ...(compact ? { requestLimit, outputLimit: runtime?.outputLimit ?? null } : {}),
            campaign,
            ...(simpleRun ? { simpleRun } : {}),
            ...(stopAfterSuccess ? { stopAfterSuccess: true } : {}),
            effort,
            level,
            minutes,
            task: task.label,
            taskId: task.id,
            ...(task.fittingVariant ? { fittingVariant: task.fittingVariant } : {}),
            history: [...history],
            caseIds: Array.from({ length: attempts }, (_, i) => 'ladder-' + level + '-' + (i + 1)),
            results: [],
            status: 'running',
            startedAt: new Date().toISOString(),
          };
          showTask?.(task, compact || quickTask ? null : { domain, level, version: settings.version });
          render(report);
          for (const [i, trialId] of report.caseIds.entries()) {
            if ((combined.aborted && (!detailed || independentAttempts)) || (independentAttempts && compact.exhausted())) break;
            const attemptStop = independentAttempts ? new AbortController() : null;
            const attemptSignal = attemptStop ? AbortSignal.any([combined, attemptStop.signal]) : combined;
            const row = {
              id: trialId,
              label: task.label + ' · Versuch ' + (i + 1),
              level,
              effort,
              requests: 0,
              modelMs: 0,
            };
            const start = performance.now();
            status(
              (detailed ? report.benchmark.label : frontiers.get(domain)) + ' · ' + effort + ' · Stufe ' + level + ' · Versuch ' + (i + 1) + '/' + attempts,
            );
            const attemptTimer = attemptStop ? timer(attemptStop, minutes) : null;
            try {
              const activeRuntime = runtime ?? await buildRuntime(attemptSignal);
              if (detailed) {
                const { providerId, protocol, model, requestedEffort, ...profileDefaults } = activeRuntime.connection ?? {};
                report.connection = { providerId, protocol, model, requestedEffort, profileDefaults };
                report.outputLimit = activeRuntime.outputLimit ?? null;
              }
              const stlChallenge = task.check === 'stl-challenge';
              const measured = measureLabRequests(activeRuntime, row, { trackTiming: !!compact, detailed, captureContextSize: stlChallenge || !!task.fittingVariant });
              if (stlChallenge) measured.modelCheckConfig = compact.modelCheckConfig;
              let lastReply;
              let constructionProposed = false;
              if (detailed) {
                Object.assign(row, { taskSteps: 0, analysisSteps: 0, bonusAnalysisSteps: 0, providerRequests: 0, providerRetries: 0 });
                const latestRequest = () => row.requestEvidence.at(-1);
                measured.benchmark = {
                  recordCandidate(proposal) {
                    const response = latestRequest();
                    if (!response) return;
                    response.accepted = true;
                    response.preview = { id: proposal.previewId ?? null, created: true };
                    constructionProposed = true;
                  },
                  recordApplied(proposal = {}) {
                    const response = row.requestEvidence.findLast((entry) =>
                      entry.preview?.created && entry.preview.id === (proposal.previewId ?? null));
                    if (response) response.applied = true;
                  },
                  recordProgramCheck(label, passed) {
                    (row.programChecks ??= []).push({ label, passed });
                  },
                  recordFailure(error) {
                    const response = latestRequest();
                    if (!response || response.error) return;
                    response.validation = { code: error.code ?? 'MODEL_VALIDATION', message: String(error.message).slice(0, 1600) };
                  },
                  recordContext(context) {
                    row.context = context;
                  },
                  recordConverter(result) {
                    row.converter = result;
                  },
                  recordModelChecks(result) {
                    (row.modelChecks ??= []).push(result);
                  },
                  recordPreview(proof) {
                    row.preview = proof;
                  },
                  acceptMeasurement(measurement) {
                    if (!lastReply?.analysis) return;
                    const response = latestRequest();
                    row.analysisSteps++;
                    if (response) {
                      response.accepted = true;
                      response.measurement = measurement;
                    }
                    if (!constructionProposed && row.bonusAnalysisSteps < (task.freeAnalysisRequests ?? 0)) {
                      row.taskSteps--;
                      row.bonusAnalysisSteps++;
                      if (response) response.measurementBonus = true;
                    }
                    lastReply = null;
                  },
                };
              }
              measured.quickBenchmark = quick;
              measured.showTask = showTask;
              measured.showReference = showReference || detailed ? (reference) => {
                recordLabReference(report, row, reference);
                showReference?.(reference);
              } : undefined;
              const generate = measured.generate;
              if (generate && requestLimit) {
                measured.generate = async (args) => {
                  if (task.fittingVariant) args = compactLabCadRequest(args, 'geometry', task.fittingVariant);
                  else if (task.check === 'drawing') args = compactLabCadRequest(args, 'drawing');
                  else if (compact && domain === 'Plattengrenze') {
                    const scope = task.check === 'spatial-bores' ? 'geometry'
                      : task.check === 'fixture' && task.fixtureStage < 3 ? 'geometry'
                      : task.check === 'fixture' && task.fixtureStage < 6 ? 'motion'
                      : task.check === 'fixture' && task.fixtureStage === 6 ? 'drawing' : undefined;
                    args = compactLabCadRequest(args, scope);
                  }
                  const outOfRequests = (message = 'Anfragebudget erreicht.') => {
                    row.requestBudgetReached = true;
                    return Object.assign(Error(message), {
                      code: 'LAB_QUICK_REQUEST_BUDGET', feedback: { retryable: false },
                    });
                  };
                  if ((detailed ? row.taskSteps : row.requests) >= requestLimit) throw outOfRequests();
                  if (detailed && compact.remainingProviderRequests() === 0) {
                    row.providerBudgetReached = true;
                    throw Object.assign(Error('Anbieterlimit erreicht.'), { code: 'LAB_MODEL_REQUEST_BUDGET', feedback: { retryable: false } });
                  }
                  if (detailed && compact.priceBudget?.reason) {
                    row.priceBudgetReached = true;
                    compact.priceBudget.stop(compact.priceBudget.reason);
                  }
                  if (compact?.exhausted()) throw outOfRequests();
                  if (row.requests > 0 && compact?.hasReserveForLater && !compact.hasReserveForLater(level)) {
                    row.reservedRequests = true;
                    throw outOfRequests('Verbleibende Anfragen sind für spätere Stufen reserviert.');
                  }
                  const priceBudget = compact?.priceBudget;
                  if (compact?.claimRequest && !compact.claimRequest()) throw outOfRequests();
                  let usage;
                  let rejectedBeforeSend = false;
                  try {
                    if (detailed) {
                      row.taskSteps++;
                      args = {
                        ...args,
                        context: { ...args.context, benchmarkWithoutResearch: true },
                        benchmarkModelRequests: compact.remainingProviderRequests(),
                      };
                    }
                    if (priceBudget) args = {
                      ...args,
                      context: { ...args.context, benchmarkWithoutResearch: true },
                      benchmarkPrice: priceBudget.prepare(activeRuntime),
                    };
                    const answer = await generate(args);
                    usage = answer.usage;
                    if (detailed) {
                      if (!Number.isSafeInteger(usage?.benchmarkModelRequests))
                        throw Object.assign(Error('Aufrufzählung des Anbieters fehlt.'), { code: 'LAB_MODEL_REQUEST_UNAVAILABLE', feedback: { retryable: false } });
                      lastReply = answer;
                    }
                    return answer;
                  } catch (error) {
                    usage ??= error.aiUsage;
                    if (detailed && error.code === 'LAB_MODEL_REQUEST_BUDGET') row.providerBudgetReached = true;
                    if (detailed && error.code === 'LAB_MODEL_REQUEST_UNAVAILABLE') compact.stopTransport(error.message);
                    if (detailed && !Number.isSafeInteger(usage?.benchmarkModelRequests) && error.code !== 'LAB_PRICE_BUDGET') {
                      compact.stopTransport('Anbieteraufrufe konnten nach der Unterbrechung nicht vollständig bestätigt werden.');
                    }
                    if (error.code === 'LAB_PRICE_BUDGET' && priceBudget) {
                      row.priceBudgetReached = true;
                      rejectedBeforeSend = !usage || usage.benchmarkModelRequests === 0;
                      priceBudget.stop(error.message);
                    }
                    throw error;
                  } finally {
                    if (usage?.benchmarkPriceReserve) {
                      row.priceReserveUSD ??= { maximumUSD: 0, requests: 0, costEstimated: true };
                      row.priceReserveUSD.maximumUSD += usage.benchmarkPriceReserve.maximumUSD;
                      row.priceReserveUSD.requests += usage.benchmarkPriceReserve.requests;
                    }
                    if (Number.isSafeInteger(usage?.benchmarkOutputLimit))
                      row.priceAdjustedOutputLimit = usage.benchmarkOutputLimit;
                    if (detailed) {
                      compact.recordTransport(usage);
                      row.providerRequests += usage?.benchmarkModelRequests ?? 0;
                      row.providerRetries += usage?.benchmarkModelRetries ?? 0;
                      if (usage?.benchmarkModelRequests === 0) row.taskSteps--;
                    }
                    if (!rejectedBeforeSend && !(detailed && usage?.benchmarkModelRequests === 0)) priceBudget?.record(usage);
                  }
                };
              }
              const result = await trial(domain, task, measured, modeler, effort);
              attemptSignal.throwIfAborted();
              if (!result.checks?.length) throw Error('Kein messbarer Befund.');
              const passed = result.checks.every((c) => c.passed === true);
              Object.assign(row, result, { status: passed ? 'passed'
                : row.requestBudgetReached || (!detailed && row.outputLimitReached) || row.priceBudgetReached ? 'error' : 'failed' });
              if (detailed && result.checks.some((check) => check.actual?.kind === 'unevaluable')) row.status = 'error';
              if (domain === 'Vorführgrenze') row.modelMs = null;
            } catch (error) {
              const outputLimitReached = compact && error.code === 'AI_OUTPUT_INVALID' && /output was truncated/i.test(error.message);
              if (outputLimitReached) row.outputLimitReached = true;
              if (compact && attemptSignal.aborted) row.interruptedDuring ??= 'local';
              const invalidReply = !outputLimitReached && !row.requestBudgetReached && (
                ['AI_OUTPUT_INVALID', 'AI_FEATURE_SCOPE_VIOLATION', 'STALE_CAD_REFERENCE', 'INVALID_SIZE_ANCHOR'].includes(error.code) ||
                (Array.isArray(error.aiResponse?.commands) && /^(INVALID_|UNSUPPORTED_)/.test(error.code)));
              row.status = attemptSignal.aborted ? 'cancelled' : invalidReply ? 'failed' : 'error';
              if (invalidReply)
                row.checks = [
                  { label: 'Ausführbare Antwort im erlaubten Bearbeitungsumfang', passed: false, actual: error.code },
                ];
              row.error = String(error.message).slice(0, 1000);
              if (detailed) row.errorCode = error.code;
            } finally {
              clearTimeout(attemptTimer);
            }
            if (detailed) {
              if (row.status !== 'passed' && row.preview?.runGeometryCheck === true && row.preview.passed === false)
                row.status = 'failed';
              const programFailure = row.programChecks?.some((check) => !check.passed) &&
                row.requestEvidence?.some((response) => response.preview?.created);
              if (programFailure) row.status = 'error';
              const cause = row.status === 'passed' ? 'passed'
                : row.status === 'failed' ? row.preview?.passed === false || !row.errorCode ? 'local-check' : 'invalid-response'
                : programFailure ? 'program-check'
                : row.priceBudgetReached ? 'price-limit' : row.providerBudgetReached ? 'provider-limit'
                : row.requestBudgetReached ? 'task-step-limit'
                : row.outputLimitReached && row.errorCode === 'AI_OUTPUT_INVALID' && /output was truncated/i.test(row.error)
                  ? 'output-limit'
                : stop.signal.aborted || attemptStop?.signal.aborted ? 'task-time-limit' : effortSignal.aborted ? 'run-interrupted'
                : /^AI_PROVIDER_/.test(row.errorCode ?? '') ? 'provider-error'
                : row.checks?.some((check) => check.actual?.kind === 'unevaluable') ? 'no-candidate'
                : 'execution-error';
              row.cause = cause;
              if (row.status !== 'passed') {
                row.failureOwner = programFailure ? 'program'
                  : row.status === 'failed' || cause === 'no-candidate' ? 'model' : null;
              }
            }
            row.elapsedMs = Math.round(performance.now() - start);
            report.results.push(row);
            render(report);
            if ((stopAfterSuccess && row.status === 'passed') ||
                (independentAttempts ? combined.aborted || compact.exhausted() :
                  row.status === 'cancelled' || detailed || (compact && (row.status !== 'failed' || compact.exhausted())))) break;
          }
          const finished = report.results.filter((r) => ['passed', 'failed'].includes(r.status));
          const passed = finished.filter((r) => r.status === 'passed').length;
          const all = finished.length === attempts;
          const solved = stopAfterSuccess && passed > 0;
          remaining = compact ? !effortSignal.aborted && !compact.exhausted() : !quick && passed > 0 && !signal.aborted && (
            solved || (budgetPerLevel && stop.signal.aborted) ||
            (report.results.length === attempts && !combined.aborted)
          );
          report.status = signal.aborted ? 'cancelled' : (all || solved) ? 'completed' : 'interrupted';
          report.endedAt = new Date().toISOString();
          const lastPassed = history.findLast((row) => row.effort === effort && row.passed > 0);
          const interruption = report.results.findLast((row) => row.interruptedDuring)?.interruptedDuring;
          const stoppedAt = interruption === 'model' ? ' während einer Modellanfrage'
            : interruption === 'local' ? ' während der lokalen Ausführung' : '';
          const nextStage = remaining && getTask(level + 1);
          const reserved = report.results.some((row) => row.reservedRequests);
          const row = report.results.at(-1);
          if (detailed) {
            report.outcome = passed ? 'passed' : all ? 'failed' : 'open';
            report.failureOwner = row?.failureOwner;
            report.cause = row?.cause ?? 'task-time-limit';
          }
          report.frontierNote = detailed
            ? (passed ? 'Stufe gelöst.' : all
              ? row.cause === 'invalid-response' ? 'Modellantwort nicht ausführbar.' : 'Stufe im lokalen Test fehlgeschlagen.'
              : row?.cause === 'price-limit' ? 'Nicht bewertet · Preis. ' + (compact.priceBudget?.reason ?? '')
              : (row?.error || row?.checks?.find((check) => !check.passed)?.actual?.reason ||
                (row?.cause === 'task-time-limit' ? 'Zeitbudget' + stoppedAt + ' erreicht.' : 'Versuch nicht auswertbar.')) + ' Aufgabe offen.')
                + (nextStage ? ' Nächste Stufe folgt.' : '')
            : compact?.priceBudget?.reason
            ? compact.priceBudget.reason + ' Grenze offen.'
            : compact && signal.aborted
            ? (signal.reason?.message || 'Abgebrochen') + stoppedAt + ' · Grenze offen.'
            : compact && report.results.some((row) => row.outputLimitReached)
            ? (report.results.some((row) => row.priceAdjustedOutputLimit)
              ? 'Antwortbudget durch Preisgrenze erreicht. Grenze offen.' : 'Ausgabelimit erreicht. Grenze offen.')
            : compact && (report.results.some((row) => row.requestBudgetReached && row.status !== 'passed') || (!all && !solved && compact.exhausted()))
            ? (reserved ? 'Weitere Anfragen sind für spätere Stufen reserviert.' : 'Anfragebudget erreicht.') + ' Aufgabe offen.'
            : compact
            ? (passed ? 'Stufe gelöst.' : all ? 'Stufe im Einzelversuch nicht gelöst.'
              : stop.signal.aborted ? 'Zeitbudget' + stoppedAt + ' erreicht. Aufgabe offen.'
              : 'Versuch nicht auswertbar. Aufgabe offen.') + (nextStage ? ' Nächste Stufe folgt.' : '')
            : quick
            ? stop.signal.aborted ? 'Zeitbudget erreicht. Aufgabe offen.'
              : report.results.some((row) => row.requestBudgetReached && row.status !== 'passed')
                ? 'Anfragebudget erreicht. Aufgabe offen.'
              : ''
            : solved
            ? 'Gelöst im Versuch ' + report.results.length + ' von maximal ' + attempts + '. ' +
              (!getTask(level + 1) ? 'Höchste vorbereitete Stufe gelöst. Grenze offen.'
                : compact?.exhausted() ? 'Anfragebudget erreicht. Weitere Stufen offen.' : 'Nächste Stufe folgt.')
            : stop.signal.aborted
            ? remaining && getTask(level + 1)
              ? 'Erfolg bestätigt. Zeitbudget erreicht. Nächste Stufe folgt.'
              : 'Zeitbudget' + stoppedAt + ' erreicht. Grenze offen.'
            : !all
              ? remaining && getTask(level + 1)
                ? 'Erfolg bestätigt. Einzelne Versuche nicht auswertbar. Nächste Stufe folgt.'
                : 'Lauf unvollständig. Grenze offen.'
              : !passed
                ? 'Erste getestete ungelöste Stufe: ' + level + ' · ' + task.label +
                  (lastPassed ? ' · Zuletzt gelöst: ' + lastPassed.task : '')
                : !getTask(level + 1)
                  ? 'Höchste vorbereitete Stufe gelöst. Grenze offen.'
                  : 'Nächste Stufe folgt.';
          const times = finished.map((r) => r.elapsedMs).sort((a, b) => a - b),
            n = times.length;
          const tokens = createTokenTotals();
          for (const row of report.results) mergeTokenTotals(tokens, row.tokens);
          mergeTokenTotals(effortTokens, tokens);
          history.push({
            tokens,
            effortTokens: structuredClone(effortTokens),
            effort,
            level,
            task: task.label,
            passed,
            finished: n,
            planned: attempts,
            medianMs: n ? (times[Math.floor((n - 1) / 2)] + times[Math.floor(n / 2)]) / 2 : null,
            trialTimes: report.results.map((row) => ({ status: row.status, ms: row.elapsedMs })),
            totalMs: report.results.reduce((a, r) => a + r.elapsedMs, 0),
            ...(compact ? {
              modelMs: report.results.reduce((a, r) => a + (r.modelMs ?? 0), 0),
              localMs: report.results.reduce((a, r) => a + Math.max(0, r.elapsedMs - (r.modelMs ?? 0)), 0),
            } : {}),
            ...(detailed ? { taskId: task.id, outcome: report.outcome, cause: report.cause, failureOwner: report.failureOwner } : {}),
            note: report.frontierNote,
            id,
          });
          if (domain === 'STL-Grenze') {
            const routes = { editable: 0, converter: 0, repaired: 0, unconfirmed: 0 };
            for (const row of report.results) {
              if (row.status === 'passed' && row.input?.route === 'editable') routes.editable++;
              else if (
                row.input?.route &&
                row.checks?.slice(1).length &&
                row.checks.slice(1).every((c) => c.passed === true)
              ) {
                if (row.input.route === 'converter-after-mesh-repair') routes.repaired++;
                else routes.converter++;
              } else routes.unconfirmed++;
            }
            history.at(-1).routes = routes;
          }
          report.history = [...history];
          onStage(report);
          const receipt = await desktop.developmentEvidence({ action: 'supplement-save', report });
          render(report, receipt.path);
        } finally {
          clearTimeout(levelBudget);
        }
      }
    } finally {
      clearTimeout(budget);
    }
  }
  status(signal.aborted ? 'Benchmark abgebrochen.' : 'Benchmark beendet.');
}
