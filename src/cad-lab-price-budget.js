const subscriptionInitialOutputReserve = 4096;

export function labPriceUsesApiEquivalent(providerId) {
  return providerId === 'chatgpt' || providerId === 'mistral-vibe';
}

export function createLabPriceBudget(limitEUR, rate, price, providerId) {
  if (limitEUR == null) return null;
  if (!Number.isFinite(limitEUR) || limitEUR <= 0) throw Error('Preisgrenze in Euro muss größer als null sein.');
  const subscription = labPriceUsesApiEquivalent(providerId);
  const label = subscription ? 'Abo-Richtwert' : 'Preisgrenze';
  if (![price?.input, price?.output].every((number) => Number.isFinite(number) && number >= 0))
    throw Error('Preisgrenze kann für diesen Zugang ohne bekannten API-Tarif nicht geprüft werden.');
  if (!Number.isFinite(rate?.usdPerEur) || rate.usdPerEur <= 0)
    throw Error('Preisgrenze kann ohne Euro-Wechselkurs nicht geprüft werden.');
  const ceilingUSD = limitEUR * rate.usdPerEur;
  let accountedUSD = 0;
  let reservedUSD = 0;
  let reservedRequests = 0;
  let observedOutput = subscriptionInitialOutputReserve;
  let stopReason = '';
  const stop = (message) => {
    stopReason ||= message;
    throw Object.assign(Error(stopReason), { code: 'LAB_PRICE_BUDGET', feedback: { retryable: false } });
  };
  return {
    basis: subscription ? 'api-equivalent' : 'api',
    get reason() {
      return stopReason;
    },
    get reserve() {
      return reservedRequests ? { maximumUSD: reservedUSD, requests: reservedRequests, costEstimated: true } : null;
    },
    prepare(runtime) {
      if (stopReason) stop(stopReason);
      if (providerId === 'mistral-vibe' && runtime.webResearchAllowed)
        stop('Der Abo-Richtwert erfordert in Mistral Vibe ausgeschaltete Webrecherche.');
      return { remainingUSD: Math.max(0, ceilingUSD - accountedUSD), usdPerEur: rate.usdPerEur, outputReserve: observedOutput };
    },
    stop,
    record(usage) {
      if (usage?.benchmarkPriceAllRejected) return;
      const estimated = usage?.estimatedCostUSD;
      const reserve = usage?.benchmarkPriceReserve;
      const hasCost = Number.isFinite(estimated?.max) && estimated.max >= 0 &&
        (estimated.subscription === true) === subscription;
      const hasReserve = !subscription && Number.isFinite(reserve?.maximumUSD) && reserve.maximumUSD >= 0 &&
        Number.isSafeInteger(reserve.requests) && reserve.requests > 0 && reserve.costEstimated === true;
      if (usage?.benchmarkPriceUnfunded || (!hasCost && !hasReserve)) {
        stopReason ||= label + ' offen. Für einen Modellschritt fehlt eine auswertbare Verbrauchsschätzung.';
        return;
      }
      if (subscription && Number.isSafeInteger(usage.outputTokens))
        observedOutput = Math.max(observedOutput, usage.outputTokens);
      if (hasCost) accountedUSD += estimated.max;
      if (hasReserve) {
        reservedUSD += reserve.maximumUSD;
        reservedRequests += reserve.requests;
        accountedUSD += reserve.maximumUSD;
      }
      if (accountedUSD >= ceilingUSD) stopReason ||= label + ' erreicht.';
    },
  };
}
