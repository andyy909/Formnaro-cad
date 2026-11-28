import { circleThrough } from './sketch-profile.js';

const EPS = 1e-7;
const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= EPS;
const reverse = (element) => ({ ...element, start: element.end, end: element.start });

function extend(chain, remaining) {
  while (!near(chain[0].start, chain.at(-1).end)) {
    const tail = chain.at(-1).end;
    const candidates = remaining.filter((element) => near(tail, element.start) || near(tail, element.end));
    if (candidates.length !== 1) return;
    const element = candidates[0];
    remaining.splice(remaining.indexOf(element), 1);
    const next = near(tail, element.start) ? element : reverse(element);
    chain.push({ ...next, start: tail });
  }
}

function area(chain) {
  let sum = 0;
  for (const element of chain) {
    if (element.type === 'circle') return Math.PI * (element.diameter / 2) ** 2;
    const { start, end } = element;
    sum += (start[0] * end[1] - start[1] * end[0]) / 2;
    if (element.type === 'arc') {
      const { radius, sweep } = circleThrough(start, element.through, end);
      sum += (radius * radius * (sweep - Math.sin(sweep))) / 2;
    }
  }
  return Math.abs(sum);
}

function analyticElement(entity, id) {
  const pair = (point) => {
    if (!Array.isArray(point) || point.length !== 2 || point.some((n) => !Number.isFinite(n) || Math.abs(n) > 100000))
      throw Error('2D-Koordinate außerhalb der Modellgrenzen.');
    return [...point];
  };
  if (entity.type === 'circle') {
    if (!Number.isFinite(entity.diameter) || entity.diameter < 0.01 || entity.diameter > 10000)
      throw Error('Kreisdurchmesser außerhalb 0,01–10000 mm.');
    return { id, type: 'circle', center: pair(entity.center), diameter: entity.diameter };
  }
  const start = pair(entity.start),
    end = pair(entity.end);
  if (near(start, end)) throw Error('2D-Element besitzt keine Länge.');
  if (entity.type === 'line') return { id, type: 'line', start, end };
  if (entity.type === 'arc') {
    const through = pair(entity.through);
    circleThrough(start, through, end);
    return { id, type: 'arc', start, through, end };
  }
  throw Error('Nicht unterstütztes 2D-Skizzenelement.');
}

/** Preserve unclosed paths in the sketch editor. The usual profile validator checks cut contours. */
export function cadSketchFromExchange(entities) {
  if (!entities.length || entities.length > 128) throw Error('Die Skizze benötigt 1–128 2D-Elemente.');
  const elements = entities.map((entity, index) => analyticElement(entity, 'import-edge-' + (index + 1)));
  const chains = elements.filter((element) => element.type === 'circle').map((element) => [element]);
  const remaining = elements.filter((element) => element.type !== 'circle');
  while (remaining.length) {
    let chain = [remaining.shift()];
    extend(chain, remaining);
    if (!near(chain[0].start, chain.at(-1).end)) {
      chain = chain.toReversed().map(reverse);
      extend(chain, remaining);
    }
    if (near(chain[0].start, chain.at(-1).end)) chain.at(-1).end = chain[0].start;
    chains.push(chain);
  }
  if (chains.length > 64) throw Error('Die Skizze unterstützt höchstens 64 Konturen.');
  let outer = chains[0],
    largest = -1;
  for (const chain of chains) {
    if (chain[0].type !== 'circle' && !near(chain[0].start, chain.at(-1).end)) continue;
    const size = area(chain);
    if (size > largest) {
      largest = size;
      outer = chain;
    }
  }
  return {
    version: 2,
    kind: 'profile',
    variables: [],
    dimensions: { height: '3' },
    elements: chains.flat(),
    loops: chains.map((chain, index) => ({
      id: 'import-loop-' + (index + 1),
      role: chain === outer ? 'outer' : 'hole',
      elements: chain.map((element) => element.id),
    })),
  };
}
