// Einmalige Maßeingabe im Skizzierer: Zahl oder einfacher Rechenausdruck.
// Kein eval, keine Variablen, keine gespeicherte Formel, nur ein Zahlenwert.
const MAX_LENGTH = 200;

function finite(value) {
  if (!Number.isFinite(value)) throw Error('Ungültiges oder zu großes Maßergebnis.');
  return value;
}

// Zahl mit Punkt oder Komma als Dezimaltrennzeichen.
const NUMBER = /^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;

export function parseSketchDirectMeasure(input, currentValue) {
  if (typeof input === 'number') return finite(input);
  if (typeof input !== 'string') throw Error('Maß muss eine Zahl oder ein Rechenausdruck sein.');
  const text = input.replaceAll('−', '-').trim();
  if (!text) throw Error('Maß darf nicht leer sein.');
  if (text.length > MAX_LENGTH) throw Error(`Maß: höchstens ${MAX_LENGTH} Zeichen erlaubt.`);
  const tokens = text.match(/(?:\d+(?:[.,]\d*)?|[.,]\d+)|[+\-*/]/g) ?? [];
  if (tokens.join('') !== text.replace(/\s+/g, ''))
    throw Error('Nur Zahlen und + − * / verwenden.');

  // Führendes * / oder + bezieht sich auf den aktuellen Wert; ein führendes
  // Minus ist dagegen das Vorzeichen der ersten Zahl.
  if (tokens[0] === '*' || tokens[0] === '/' || tokens[0] === '+') {
    const base =
      typeof currentValue === 'string' && currentValue.trim() ? Number(currentValue) : currentValue;
    if (typeof base !== 'number' || !Number.isFinite(base))
      throw Error('Aktueller Wert fehlt für diese Rechnung.');
    // Als Zahl einsetzen, damit auch Exponentialschreibweise wie 1e-7 gültig bleibt.
    tokens.unshift(base);
  }

  let at = 0;
  const number = () => {
    const token = tokens[at];
    if (typeof token === 'number') {
      at++;
      return finite(token);
    }
    if (token === undefined || !NUMBER.test(token)) throw Error('Unvollständiger Rechenausdruck.');
    at++;
    return finite(Number(token.replace(',', '.')));
  };
  const unary = () => {
    let negative = false;
    while (tokens[at] === '+' || tokens[at] === '-') {
      if (tokens[at] === '-') negative = !negative;
      at++;
    }
    const value = number();
    return negative ? -value : value;
  };
  const product = () => {
    let value = unary();
    while (tokens[at] === '*' || tokens[at] === '/') {
      const op = tokens[at++],
        right = unary();
      if (op === '/' && right === 0) throw Error('Division durch null.');
      value = finite(op === '*' ? value * right : value / right);
    }
    return value;
  };
  const sum = () => {
    let value = product();
    while (tokens[at] === '+' || tokens[at] === '-') {
      const op = tokens[at++],
        right = product();
      value = finite(op === '+' ? value + right : value - right);
    }
    return value;
  };

  const result = sum();
  if (at !== tokens.length) throw Error('Ungültiger Rechenausdruck.');
  return result;
}
