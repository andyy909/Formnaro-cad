import { createTokenTotals, mergeTokenTotals } from '../ai/lab-token-totals.mjs';
import { compactLadders, compactLimits, detailedLadders, detailedLimits } from './cad-lab-compact-plan.js';
import { stlChallengeKind, stlChallengeLabel, stlChallengeLimits, stlChallengeLadders, stlChallengeModelChecks } from './cad-lab-stl-challenge-plan.js';
import { fittingKind, fittingLabel, fittingLimits, fittingLadders } from './cad-lab-fitting-plan.js';
import { createLabPriceBudget } from './cad-lab-price-budget.js';
import { frontiers, runFrontier } from './cad-lab-frontiers.js';

export function supportedSimpleEfforts(model) {
  return model?.reasoningEfforts?.length ? [...new Set(model.reasoningEfforts)] : ['auto'];
}

export function defaultQuickEffort(efforts) {
  return ['low', 'auto', 'minimal', 'none', 'disabled'].find((effort) => efforts.includes(effort)) ?? efforts[0];
}

export async function runSimpleBenchmark({
  modeler, model, selectedEfforts, kind = 'frontier', signal, desktop, makeRuntime, render, status, showSummary, showTask, showReference,
  run = runFrontier, trial, priceLimitEUR = null, modelCheckProfile = 'lab',
}) {
  const supported = supportedSimpleEfforts(model);
  const quick = kind === 'quick';
  const compact = kind === 'compact';
  const stlChallenge = kind === stlChallengeKind;
  const fitting = kind === fittingKind;
  const detailed = kind === 'detailed' || stlChallenge || fitting;
  const limits = fitting ? fittingLimits : stlChallenge ? stlChallengeLimits : detailedLimits;
  const detailedAreas = fitting ? fittingLadders : stlChallenge ? stlChallengeLadders : detailedLadders;
  const checks = stlChallenge ? { modelCheckProfile, modelCheckConfig: stlChallengeModelChecks(modelCheckProfile) } : {};
  const budgeted = compact || detailed;
  const efforts = selectedEfforts === undefined
    ? quick || budgeted ? [defaultQuickEffort(supported)] : supported
    : supported.filter((effort) => selectedEfforts.includes(effort));
  if (quick && efforts.length !== 1) throw Error('Wähle für den Kurztest genau eine Denkstufe.');
  if (detailed && efforts.length !== 1) throw Error('Wähle genau eine Denkstufe für den Vergleichslauf.');
  if (detailed && modeler.providerId === 'mistral-vibe')
    throw Error('Der Vergleichslauf benötigt einen Zugang mit zählbaren Modellaufrufen. Für Mistral Vibe ist der Standardtest verfügbar.');
  if (!efforts.length) throw Error('Wähle mindestens eine Denkstufe.');
  const exchangeRate = budgeted && priceLimitEUR !== null ? await desktop.getAIExchangeRate() : null;
  signal.throwIfAborted();
  const priceBudget = budgeted ? createLabPriceBudget(priceLimitEUR, exchangeRate, model.price, modeler.providerId) : null;
  const priceSettings = priceBudget ? { priceLimitEUR, priceBudgetBasis: priceBudget.basis } : {};
  const drawing = compactLadders.get('Zeichnungsgrenze');
  const areas = detailed ? detailedAreas : compact ? compactLadders : quick
    ? new Map([...frontiers].filter(([id]) => id !== 'Fotogrenze').concat([['Zeichnungsgrenze', drawing.label]]))
    : frontiers;
  const simpleRun = {
    id: crypto.randomUUID(),
    model: modeler.model,
    ...(detailed ? { providerId: modeler.providerId } : {}),
    efforts,
    kind,
    status: 'running',
    ...priceSettings,
    ...(priceBudget ? { exchangeRate } : {}),
    ...(compact ? { plan: { ...compactLimits, ...priceSettings, domains: Object.fromEntries(compactLadders) } } : {}),
    ...(detailed ? {
      plan: { ...limits, ...checks, ...priceSettings, domains: Object.fromEntries(detailedAreas) },
      providerRequests: 0,
      providerRetries: 0,
      plannedStages: [...detailedAreas.values()].reduce((sum, { tasks }) => sum + tasks.length, 0),
    } : {}),
    ...(quick ? { plan: { version: compactLimits.version, photos: false } } : {}),
    domains: [...areas].map(([id, value]) => ({
      id, label: budgeted ? value.label : value, status: 'pending', results: {},
    })),
  };
  const start = performance.now();
  let lastReport;
  async function runArea(domain, efforts, areaSignal, compactPlan) {
    if (domain.status === 'skipped') return;
    if (domain.id === 'Fotogrenze' && model.vision === false) {
      domain.status = 'skipped';
      domain.reason = 'Modell unterstützt keine Bildeingabe.';
      return;
    }
    if (areaSignal.aborted || compactPlan?.exhausted()) return;
    domain.status = 'running';
    showSummary(simpleRun);
    try {
      const quickTask = quick && domain.id === 'Zeichnungsgrenze' ? drawing.tasks[0] : null;
      await run({
        domain: domain.id, efforts, modeler, signal: areaSignal, desktop, makeRuntime, render,
        status, showTask, showReference, budgetPerLevel: true, stopAfterSuccess: stlChallenge || (!quick && !budgeted), simpleRun, trial, compact: compactPlan, quickTask,
        onStage(report) {
          lastReport = report;
          const latest = report.history.at(-1);
          domain.results[report.effort] = compactPlan ? {
            ...latest,
            solvedStages: report.history.filter((stage) => stage.passed > 0).length,
            plannedStages: compactPlan.tasks.length,
            attemptedStages: report.history.filter((stage) => stage.trialTimes.length > 0).length,
            failedStages: report.history.filter((stage) => detailed ? stage.outcome === 'failed' : stage.finished > 0 && stage.passed === 0).length,
            ...(detailed ? {
              openStages: compactPlan.tasks.length - report.history.filter((stage) => stage.outcome === 'passed' || stage.outcome === 'failed').length,
              stages: report.history.map(({ id, level, task, taskId, outcome, cause, failureOwner, note }) => ({ id, level, task, taskId, outcome, cause, failureOwner, note })),
            } : {}),
            modelMs: report.history.reduce((sum, stage) => sum + stage.modelMs, 0),
            localMs: report.history.reduce((sum, stage) => sum + stage.localMs, 0),
          } : latest;
          simpleRun.tokens = createTokenTotals();
          for (const area of simpleRun.domains)
            for (const effort of Object.values(area.results)) mergeTokenTotals(simpleRun.tokens, effort.effortTokens);
        },
      });
      domain.status = areaSignal.aborted && !budgeted ? 'cancelled' : 'finished';
    } catch (error) {
      if (!areaSignal.aborted) {
        domain.status = 'error';
        domain.reason = String(error.message).slice(0, 1000);
      }
    }
  }

  if (budgeted && !exchangeRate && desktop?.getAIExchangeRate) {
    void desktop.getAIExchangeRate().then((rate) => { simpleRun.exchangeRate = rate; }).catch(() => {});
  }
  showSummary(simpleRun);
  if (detailed) {
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(Error('Gesamtzeitbudget erreicht.')), limits.minutes * 60000);
    const combined = AbortSignal.any([signal, deadline.signal]);
    const effort = efforts[0];
    const remainingProviderRequests = () => limits.maxModelRequests - simpleRun.providerRequests;
    let transportStop = '';
    const stopReason = () => combined.reason?.message || (combined.aborted ? 'Abgebrochen.' : '')
      || transportStop || priceBudget?.reason || (remainingProviderRequests() === 0 ? 'Anbieterlimit erreicht.' : '');
    try {
      for (const domain of simpleRun.domains) {
        const ladder = detailedAreas.get(domain.id);
        const exhausted = () => !!stopReason();
        await runArea(domain, [effort], combined, {
          ...ladder, ...checks, ...(stlChallenge ? { independentAttempts: limits.attempts } : {}),
          version: limits.version, detailed: true, exhausted, priceBudget, remainingProviderRequests,
          stopTransport(message) { transportStop = message; },
          recordTransport(usage) {
            simpleRun.providerRequests += usage?.benchmarkModelRequests ?? 0;
            simpleRun.providerRetries += usage?.benchmarkModelRetries ?? 0;
          },
        });
        const result = domain.results[effort];
        if (!result) {
          domain.status = domain.status === 'error' ? 'error' : 'open';
          domain.openEfforts = { [effort]: domain.reason || stopReason() || 'Aufgaben konnten nicht gestartet werden.' };
        }
        domain.stages = ladder.tasks.map((task, index) => result?.stages[index] ?? {
          taskId: task.id, task: task.label, level: index + 1, outcome: 'open',
          cause: 'not-started', ...(priceBudget?.reason ? { blockingCause: 'price-limit' } : {}),
          note: domain.reason || (priceBudget?.reason ? 'Nicht bewertet · Preis. ' + priceBudget.reason : stopReason())
            || 'Aufgabe konnte nicht gestartet werden.',
        });
      }
    } finally {
      clearTimeout(timer);
    }
    simpleRun.timedOut = deadline.signal.aborted;
    simpleRun.stopReason = stopReason();
    if (priceBudget?.reason) simpleRun.priceStopReason = priceBudget.reason;
    const stages = simpleRun.domains.flatMap((domain) => domain.stages);
    simpleRun.solvedStages = stages.filter((stage) => stage.outcome === 'passed').length;
    simpleRun.failedStages = stages.filter((stage) => stage.outcome === 'failed').length;
    simpleRun.openStages = stages.filter((stage) => stage.outcome === 'open').length;
  }
  if (compact) {
    const deadline = new AbortController();
    const deadlineMs = compactLimits.minutes * 60000;
    const timer = setTimeout(() => deadline.abort(Error('Gesamtzeitbudget erreicht')), deadlineMs);
    const combined = AbortSignal.any([signal, deadline.signal]);
    let requestsLeft = compactLimits.requests;
    try {
      for (const [index, effort] of efforts.entries()) {
        if (combined.aborted || priceBudget?.reason) break;
        const remaining = efforts.length - index;
        const share = new AbortController();
        const timeLeft = Math.max(0, deadlineMs - (performance.now() - start));
        const effortBudget = timeLeft / remaining;
        const effortStarted = performance.now();
        const shareTimer = remaining === 1 ? null
          : setTimeout(() => share.abort(Error('Zeitanteil dieser Denkstufe erreicht')), effortBudget);
        const effortSignal = AbortSignal.any([combined, share.signal]);
        let quota = Math.floor(requestsLeft / remaining);
        try {
          const weight = (domain) => compactLadders.get(domain.id).weight;
          const eligible = simpleRun.domains;
          for (const domain of simpleRun.domains) {
            const areaStop = new AbortController();
            const areaSignal = AbortSignal.any([effortSignal, areaStop.signal]);
            const remainingAreas = eligible.slice(eligible.indexOf(domain));
            const areaTime = Math.max(0, effortBudget - (performance.now() - effortStarted));
            const weightShare = remainingAreas.length > 1
              ? weight(domain) / remainingAreas.reduce((sum, area) => sum + weight(area), 0)
              : 1;
            const areaTimer = weightShare < 1 ? setTimeout(
              () => areaStop.abort(Error('Zeitanteil dieses Prüfbereichs erreicht')), areaTime * weightShare,
            ) : null;
            // Unused shares roll forward. If the quota covers all remaining tasks,
            // preserve their first request before allowing extra work on a single task.
            let areaRequests = Math.min(quota, Math.max(1,
              Math.min(Math.floor(quota * weightShare), quota - Math.max(0, remainingAreas.length - 1)),
            ));
            const currentTasks = compactLadders.get(domain.id).tasks.length;
            const laterTasks = remainingAreas.slice(1).reduce((sum, area) => sum + compactLadders.get(area.id).tasks.length, 0);
            if (quota >= currentTasks + laterTasks)
              areaRequests = Math.max(currentTasks, Math.min(areaRequests, quota - laterTasks));
            const exhausted = () => areaRequests === 0 || !!priceBudget?.reason;
            const claimRequest = () => {
              if (exhausted()) return false;
              areaRequests--;
              quota--;
              requestsLeft--;
              return true;
            };
            try {
              await runArea(domain, [effort], areaSignal, {
                ...compactLadders.get(domain.id), version: compactLimits.version, exhausted, claimRequest, priceBudget,
                hasReserveForLater: (level) => areaRequests > currentTasks - level,
              });
            } finally {
              clearTimeout(areaTimer);
            }
            if (!Object.hasOwn(domain.results, effort) && (areaSignal.aborted || exhausted()) && domain.status !== 'skipped') {
              domain.openEfforts ??= {};
              domain.openEfforts[effort] = areaSignal.aborted
                ? areaSignal.reason.message : priceBudget?.reason || 'Anfrageanteil dieses Prüfbereichs erreicht';
            }
          }
        } finally {
          clearTimeout(shareTimer);
        }
      }
    } finally {
      clearTimeout(timer);
    }
    for (const domain of simpleRun.domains) {
      if (domain.status === 'pending' || domain.status === 'running') domain.status = 'open';
      if (domain.status !== 'skipped') {
        for (const effort of efforts) {
          if (Object.hasOwn(domain.results, effort) || Object.hasOwn(domain.openEfforts ?? {}, effort)) continue;
          if (!combined.aborted && !priceBudget?.reason) continue;
          domain.openEfforts ??= {};
          domain.openEfforts[effort] = combined.reason?.message ?? priceBudget.reason;
        }
      }
    }
    simpleRun.timedOut = deadline.signal.aborted;
    if (priceBudget?.reason) simpleRun.priceStopReason = priceBudget.reason;
  } else if (!detailed) {
    for (const domain of simpleRun.domains) await runArea(domain, efforts, signal);
  }
  if (budgeted) {
    simpleRun.elapsedMs = Math.round(performance.now() - start);
    const evaluated = simpleRun.domains.flatMap((domain) => Object.values(domain.results));
    simpleRun.modelMs = evaluated.reduce((sum, stage) => sum + stage.modelMs, 0);
    simpleRun.localMs = evaluated.reduce((sum, stage) => sum + stage.localMs, 0);
  }
  if (priceBudget?.reserve) simpleRun.priceReserveUSD = priceBudget.reserve;
  const incomplete = detailed && (simpleRun.timedOut ||
    (simpleRun.priceStopReason && simpleRun.openStages > 0) ||
    simpleRun.domains.some((domain) => domain.stages?.some((stage) => stage.cause === 'not-started')));
  simpleRun.status = signal.aborted ? 'cancelled' : incomplete ? 'incomplete' : 'finished';
  if (lastReport) {
    const receipt = await desktop.developmentEvidence({ action: 'supplement-save', report: lastReport });
    render(lastReport, receipt.path);
  } else {
    showSummary(simpleRun);
  }
  const label = fitting ? fittingLabel : stlChallenge ? stlChallengeLabel : detailed ? 'Ausführlicher Vergleichslauf' : quick ? 'Kurztest' : compact ? 'Kompakter Stufenbenchmark' : 'Leistungsgrenze';
  status(label + (signal.aborted ? ' abgebrochen.' : simpleRun.timedOut ? ' · Gesamtzeitbudget erreicht.' :
    incomplete ? ' · unvollständig.' : ' beendet.'));
  return simpleRun;
}
