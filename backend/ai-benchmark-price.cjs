const { rateFor } = require('./ai-token-prices.cjs');
const { aiUsage } = require('./ai-usage.cjs');

function createBenchmarkPriceGuard(budget, config) {
  const { usdPerEur, outputReserve } = budget;
  let { remainingUSD } = budget;
  if (!Number.isFinite(remainingUSD) || remainingUSD < 0 ||
      !Number.isFinite(usdPerEur) || usdPerEur <= 0 ||
      !Number.isSafeInteger(outputReserve) || outputReserve < 1)
    throw Error('Ungültige Preisvorgabe für den Benchmark.');

  const subscription = config.authMode === 'chatgpt' || config.authMode === 'mistral-vibe';
  const label = subscription ? 'Abo-Richtwert' : 'Preisgrenze';
  const rows = [];
  let adjustedLimit;
  let plannedReserve = null;
  let pendingReserve = null;
  let reservedUSD = 0;
  let reservedRequests = 0;
  let dispatchedRequests = 0;
  let rejectedRequests = 0;
  let unpricedWithoutReserve = false;
  const release = () => {
    if (pendingReserve === null) return;
    remainingUSD += pendingReserve;
    reservedUSD -= pendingReserve;
    reservedRequests--;
    pendingReserve = null;
  };
  const stop = message => {
    throw Object.assign(Error(message), { code: 'LAB_PRICE_BUDGET', feedback: { retryable: false } });
  };
  const euro = value => (value / usdPerEur).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  return {
    authorize({ system, user, input, outputBudget, extraContext }) {
      if (unpricedWithoutReserve)
        stop(label + ' offen. Für eine Modellanfrage fehlt eine auswertbare Verbrauchsschätzung.');
      if (remainingUSD <= 0) stop(label + ' erreicht.');

      // Price only the prepared input of this round. UTF-8 bytes provide a conservative
      // text estimate. The allowance covers message framing and transport additions.
      const inputEstimate = Buffer.byteLength(system) + Buffer.byteLength(user) +
        Buffer.byteLength(JSON.stringify(input)) + (extraContext ? Buffer.byteLength(extraContext) : 0) + 12000;
      const rate = rateFor(config, inputEstimate);
      if (!rate) stop(label + ' offen. Für die nächste Modellanfrage fehlt ein bekannter Tarif.');
      const inputRate = Math.max(rate.input, rate.cached ?? 0,
        ...(subscription ? [] : [rate.write5 ?? 0, rate.write60 ?? 0]));
      const scale = Math.max(1, rate.peakMultiplier ?? 1) / 1000000;
      const inputUSD = inputEstimate * inputRate * scale;
      const outputUSD = rate.output * scale;
      const minOutput = subscription ? outputReserve : 1;
      const requiredUSD = inputUSD + minOutput * outputUSD;
      if (requiredUSD > remainingUSD)
        stop(`${label}: Preisreserve für die nächste Modellanfrage zu klein (${euro(requiredUSD)} geschätzt, ${euro(remainingUSD)} verfügbar).`);
      if (subscription) return outputBudget;
      const limit = outputUSD === 0 ? outputBudget
        : Math.min(outputBudget, Math.max(1, Math.floor((remainingUSD - inputUSD) / outputUSD)));
      plannedReserve = Math.min(remainingUSD, inputUSD + limit * outputUSD);
      if (limit < outputBudget) adjustedLimit = Math.min(adjustedLimit ?? limit, limit);
      return limit;
    },
    dispatch() {
      if (subscription) return;
      if (plannedReserve > remainingUSD) stop(label + ' erreicht.');
      dispatchedRequests++;
      pendingReserve = plannedReserve;
      remainingUSD -= pendingReserve;
      reservedUSD += pendingReserve;
      reservedRequests++;
    },
    rejectDispatch() {
      if (subscription) return;
      rejectedRequests++;
      release();
    },
    record(data) {
      const row = aiUsage(data, config, 0);
      if (row.estimatedCostUSD) {
        release();
        rows.push(row);
        remainingUSD -= row.estimatedCostUSD.max;
      } else {
        unpricedWithoutReserve ||= pendingReserve === null;
      }
      pendingReserve = null;
    },
    usage() {
      const totals = benchmarkUsageTotals(rows);
      if (!totals && !dispatchedRequests && !unpricedWithoutReserve) return undefined;
      const usage = totals ?? {};
      if (unpricedWithoutReserve) {
        usage.estimatedCostUSD = null;
        usage.benchmarkPriceUnfunded = true;
      }
      if (reservedRequests) usage.benchmarkPriceReserve = {
        maximumUSD: Math.max(0, reservedUSD), requests: reservedRequests, costEstimated: true,
      };
      if (dispatchedRequests && rejectedRequests === dispatchedRequests)
        usage.benchmarkPriceAllRejected = true;
      if (adjustedLimit !== undefined) usage.benchmarkOutputLimit = adjustedLimit;
      return usage;
    },
  };
}

function benchmarkUsageTotals(rows) {
  if (!rows.length) return undefined;
  const totals = { ...rows.at(-1) };
  for (const key of ['inputTokens', 'outputTokens', 'cachedInputTokens', 'reasoningTokens'])
    totals[key] = rows.every(row => Number.isSafeInteger(row[key]))
      ? rows.reduce((sum, row) => sum + row[key], 0) : null;
  const prices = rows.map(row => row.estimatedCostUSD);
  totals.estimatedCostUSD = prices.every(Boolean) ? {
    ...prices.at(-1),
    min: prices.reduce((sum, price) => sum + price.min, 0),
    max: prices.reduce((sum, price) => sum + price.max, 0),
    cacheAssumed: prices.some(price => price.cacheAssumed),
    longContext: prices.some(price => price.longContext),
  } : null;
  return totals;
}

module.exports = { createBenchmarkPriceGuard, benchmarkUsageTotals };
