const fields = ['inputTokens', 'outputTokens', 'cachedInputTokens', 'reasoningTokens'];
const valid = (value) => Number.isSafeInteger(value) && value >= 0;

export function createTokenTotals() {
  return { requests: 0, ...Object.fromEntries(fields.map((key) => [key, { tokens: 0, reported: 0 }])) };
}
export function addTokenUsage(total, usage) {
  total.requests++;
  const cost = usage?.estimatedCostUSD;
  if (Number.isFinite(cost?.min) && Number.isFinite(cost?.max) && cost.min >= 0 && cost.max >= cost.min) {
    mergeCost(total, { min: cost.min, max: cost.max, reported: 1, subscription: cost.subscription === true });
  }
  for (const key of fields) {
    if (!valid(usage?.[key])) continue;
    total[key].tokens += usage[key];
    total[key].reported++;
  }
  return total;
}
function mergeCost(total, cost) {
  if (!cost) return;
  const sum = total.costUSD ??= { min: 0, max: 0, reported: 0, subscription: false };
  sum.min += cost.min;
  sum.max += cost.max;
  sum.reported += cost.reported;
  sum.subscription ||= cost.subscription;
}

export function mergeTokenTotals(total, incoming) {
  if (!incoming) return total;
  total.requests += incoming.requests;
  mergeCost(total, incoming.costUSD);
  for (const key of fields) {
    total[key].tokens += incoming[key].tokens;
    total[key].reported += incoming[key].reported;
  }
  return total;
}
export function tokenEvents(requestCount, usageEvents) {
  const total = createTokenTotals();
  for (const event of usageEvents) {
    const raw = event.usage;
    addTokenUsage(total, event.billing ?? {
      inputTokens: raw?.input_tokens ?? raw?.prompt_tokens,
      outputTokens: raw?.output_tokens ?? raw?.completion_tokens,
      cachedInputTokens: raw?.input_tokens_details?.cached_tokens ??
        raw?.prompt_tokens_details?.cached_tokens ?? raw?.prompt_cache_hit_tokens,
      reasoningTokens: raw?.output_tokens_details?.reasoning_tokens ?? raw?.completion_tokens_details?.reasoning_tokens,
    });
  }
  total.requests = Math.max(total.requests, requestCount);
  return total;
}
export function formatTokenTotals(total) {
  if (!total?.requests) return '';
  const value = (key) => {
    const field = total[key];
    if (!field.reported) return 'unbekannt';
    const number = field.tokens.toLocaleString('de-DE');
    return field.reported < total.requests ? 'mind. ' + number + ' (' + field.reported + '/' + total.requests + ')' : number;
  };
  return 'Eingabe ' + value('inputTokens') + ' · Ausgabe ' + value('outputTokens') +
    ' · davon Eingabe aus Cache ' + value('cachedInputTokens');
}

export function formatLabCost(total, rate) {
  const cost = total?.costUSD;
  if (!cost?.reported) return 'unbekannt';
  const number = (value) => value.toLocaleString('de-DE', { maximumFractionDigits: 6 });
  const range = (factor) => number(cost.min * factor) + (cost.max > cost.min ? '–' + number(cost.max * factor) : '');
  const euro = Number.isFinite(rate?.usdPerEur) && rate.usdPerEur > 0
    ? ' (≈ ' + range(1 / rate.usdPerEur) + ' EUR)' : '';
  const coverage = cost.reported < total.requests ? ' · Teilbetrag aus ' + cost.reported + '/' + total.requests : '';
  return range(1) + ' USD' + euro + coverage + (cost.subscription ? ' · API-Gegenwert' : '');
}
