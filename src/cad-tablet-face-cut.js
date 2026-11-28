import { resolveCadSketch } from './cad-sketch.js';
import { prepareConstrainedSketch } from './sketch-constraints-solver.js';

const tolerance = 1e-7;
const normalOverlap = 0.02;
const fields = {
  line: ['start', 'end'],
  arc: ['start', 'through', 'end'],
  circle: ['center'],
};

function sameElement(first, second) {
  return second?.type === first.type &&
    fields[first.type].every(key => first[key].every((value, index) =>
      Math.abs(value - second[key][index]) <= tolerance)) &&
    (first.type !== 'circle' || Math.abs(first.radius - second.radius) <= tolerance);
}

// Only new closed inner loops become cutters. The outer contour and existing
// openings define the original material boundary.
export function prepareTabletFaceCut({originalSketch, sketch, frame, cut}, minimumZ) {
  const original = resolveCadSketch(originalSketch);
  const edited = resolveCadSketch(prepareConstrainedSketch(sketch));
  const previous = new Map(original.sketch.loops.map(loop => [loop.id, loop]));
  const newLoops = edited.sketch.loops.filter(loop => !previous.has(loop.id));
  const editedLoops = new Map(edited.sketch.loops.map(loop => [loop.id, loop]));
  const originalElements = new Map(original.elements.map(element => [element.id, element]));
  const editedElements = new Map(edited.elements.map(element => [element.id, element]));

  for (const loop of previous.values()) {
    const current = editedLoops.get(loop.id);
    if (current?.role !== loop.role || current.elements.length !== loop.elements.length ||
      loop.elements.some(id => !current.elements.includes(id) ||
        !sameElement(originalElements.get(id), editedElements.get(id)))) {
      throw Error('Der Schnitt braucht die ursprüngliche Außenkontur und vorhandenen Öffnungen. Zeichne neue Lochkonturen hinzu.');
    }
  }
  if (!newLoops.length || newLoops.some(loop => loop.role !== 'hole')) {
    throw Error('Zeichne auf dem Tablet eine neue geschlossene Lochkontur innerhalb der Fläche.');
  }

  const requestedDepth = cut?.mode === 'through' ? -minimumZ + normalOverlap : cut?.depth;
  if (!['through', 'depth'].includes(cut?.mode) || !Number.isFinite(requestedDepth) ||
    requestedDepth < 0.01 || requestedDepth > 10000) {
    throw Error('Die Schnitttiefe muss zwischen 0,01 und 10000 mm liegen.');
  }
  const overlap = Math.min(normalOverlap, 10000 - requestedDepth);
  const cutterFrame = frame.map((value, index) => {
    if (index >= 4 && index < 12) return -value;
    if (index >= 12 && index < 15) return value + overlap * frame[index - 4];
    return value;
  });
  const cutters = newLoops.map(loop => {
    const elements = loop.elements.map(id => {
      const element = editedElements.get(id);
      if (!Object.hasOwn(fields, element.type)) throw Error('Für direkte Schnitte Linien, Kreise oder Kreisbögen verwenden.');
      const copy = {id, type: element.type};
      for (const field of fields[element.type]) {
        const [x, y] = element[field];
        copy[field] = [x, -y];
      }
      if (element.type === 'circle') copy.diameter = 2 * element.radius;
      return copy;
    });
    const profile = resolveCadSketch({
      version: 2, kind: 'profile', variables: [], dimensions: {height: requestedDepth + overlap},
      elements, loops: [{...loop, role: 'outer'}],
    });
    return profile.sketch;
  });
  return {cutters, frame: cutterFrame, requestedDepth, overlap};
}
