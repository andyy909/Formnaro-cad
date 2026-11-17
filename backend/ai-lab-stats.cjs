'use strict';

// Wilson-Score-Intervall für Anteile (95 % als Standard).
// Gibt die ungerundeten Grenzen {low, high} zurück; 0/0 ist null.
// Gerundet wird erst bei der Anzeige.

const Z_95 = 1.96;

function checkInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(name + ' muss eine ganze nichtnegative Zahl sein.');
}

function wilson(passed, total, z = Z_95) {
  checkInteger(passed, 'passed');
  checkInteger(total, 'total');
  if (passed > total) throw new RangeError('passed darf total nicht überschreiten.');
  if (!Number.isFinite(z) || z <= 0) throw new RangeError('z muss eine positive endliche Zahl sein.');
  if (total === 0) return null;

  const p = passed / total;
  const d = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / d;

  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

function isInterval(value) {
  return Boolean(value) && Number.isFinite(value.low) && Number.isFinite(value.high) && value.low <= value.high;
}

function rateInterval(value, z) {
  if (isInterval(value)) return value;
  if (!value || typeof value !== 'object') throw new RangeError('Quote muss passed/total oder ein Intervall enthalten.');
  return wilson(value.passed, value.total, z);
}

function compareRates(first, second, { z = Z_95, paired = false } = {}) {
  if (paired) {
    return { first: null, second: null, separated: false, relation: 'not-applicable', applicable: false,
      statement: 'Die Intervall-Heuristik ist für gepaarte Sprachversuche nicht anwendbar.',
      caveat: 'Nicht für gepaarte Vergleiche verwenden; eine fehlende Trennung belegt keine Gleichwertigkeit.' };
  }
  const a = rateInterval(first, z), b = rateInterval(second, z);
  if (!a || !b) {
    return { first: a, second: b, separated: false, relation: 'not-applicable', applicable: false,
      statement: 'Mindestens eine Quote hat keine Beobachtung (0/0); ein Vergleich ist nicht möglich.',
      caveat: 'Ohne Beobachtung ist keine Aussage über die Quote möglich.' };
  }
  let relation, separated;
  if (a.high < b.low) { relation = 'second-higher'; separated = true; }
  else if (b.high < a.low) { relation = 'first-higher'; separated = true; }
  else { relation = 'not-distinguishable'; separated = false; }
  const statements = {
    'first-higher': 'Die Intervalle sind disjunkt; die erste Quote liegt höher.',
    'second-higher': 'Die Intervalle sind disjunkt; die zweite Quote liegt höher.',
    'not-distinguishable': 'Die Intervalle überschneiden sich oder berühren sich; die Quoten sind mit dieser Heuristik nicht unterscheidbar. Das belegt keine Gleichwertigkeit.',
  };
  return { first: a, second: b, separated, relation, applicable: true, statement: statements[relation],
    caveat: 'Disjunkte Intervalle sind eine Anzeigeheuristik und kein Signifikanztest; sich berührende Grenzen gelten als nicht unterscheidbar. Die Regel gilt nicht für gepaarte Sprachversuche.' };
}

function perSuccess({ passed, costMin = 0, costMax = 0, priceUnknown = false, totalMs = 0 } = {}) {
  if (!Number.isInteger(passed) || passed < 0) throw new RangeError('passed muss eine ganze nichtnegative Zahl sein.');
  if (!Number.isFinite(costMin) || !Number.isFinite(costMax) || costMin < 0 || costMax < costMin) throw new RangeError('Kosten müssen endliche, nichtnegative Zahlen mit costMax >= costMin sein.');
  if (!Number.isFinite(totalMs) || totalMs < 0) throw new RangeError('totalMs muss eine nichtnegative endliche Zahl sein.');
  if (passed === 0) return null;
  return {
    costMin: costMin / passed,
    costMax: costMax / passed,
    priceUnknown: Boolean(priceUnknown),
    seconds: totalMs / 1000 / passed,
  };
}

module.exports = { wilson, compareRates, perSuccess };
