import { dimensionSketchElement } from './sketch-tools.js';
import { sketchExpression } from './sketch-expression.js';

const MIN_DIAMETER = 0.01,
  MAX_DIAMETER = 10000;

function diameter(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < MIN_DIAMETER || value > MAX_DIAMETER)
    throw Error('Durchmesser muss eine endliche Zahl zwischen 0,01 und 10000 mm sein.');
  return value;
}
// Free dimensions are literals or constant arithmetic written by this editor.
// Names and functions resolve variables or other dimensions and therefore stay
// bindings that must not be replaced silently.
function free(value) {
  try {
    return Number.isFinite(
      sketchExpression(value, () => {
        throw Error('gebunden');
      }),
    );
  } catch {
    return false;
  }
}
function assertCircle(element) {
  if (!element) throw Error('Kreiselement fehlt.');
  if (element.type !== 'circle') throw Error('Nur ein Kreis kann über seinen Durchmesser geändert werden.');
}
function assertFreeDiameter(sketch, element) {
  if (!free(element.diameter))
    throw Error('Der Kreisdurchmesser ist über eine Formel gebunden. Zuerst das Ausgangsmaß ändern.');
  for (const constraint of sketch.constraints ?? []) {
    const refs = constraint.refs ?? [];
    if (!refs.some((ref) => ref.element === element.id)) continue;
    if (constraint.type === 'fixed' && !refs[0]?.point)
      throw Error('Der Kreis ist als Ganzes fixiert. Die Fixierung zuerst lösen.');
    if (constraint.type === 'equalRadius')
      throw Error('Der Kreis ist über gleiche Radien gebunden. Die Bindung zuerst lösen.');
    if (constraint.type === 'radius' && !free(constraint.value))
      throw Error('Der Kreisradius ist über eine Formel gebunden. Zuerst das Ausgangsmaß ändern.');
  }
}
function resizeLegacyCircle(sketch, value) {
  if (!sketch || sketch.kind !== 'circle' || !sketch.dimensions || typeof sketch.dimensions !== 'object')
    throw Error('Alter Grundkreis fehlt oder ist kein Kreis.');
  if (!Object.hasOwn(sketch.dimensions, 'diameter')) throw Error('Durchmesser des alten Grundkreises fehlt.');
  if (!free(sketch.dimensions.diameter))
    throw Error('Der Grundkreis-Durchmesser ist über eine Formel gebunden. Zuerst das Ausgangsmaß ändern.');
  const out = structuredClone(sketch);
  out.dimensions.diameter = String(value);
  return out;
}
function resizeProfileCircle(sketch, elementId, value) {
  const element = sketch?.elements?.find((entry) => entry.id === elementId);
  assertCircle(element);
  assertFreeDiameter(sketch, element);
  const out = dimensionSketchElement(sketch, elementId, 'radius', String(value / 2)),
    changed = out.elements.find((entry) => entry.id === elementId);
  if (!changed || changed.type !== 'circle' || JSON.stringify(changed.center) !== JSON.stringify(element.center))
    throw Error('Elementkennung oder Kreismittelpunkt würde verändert.');
  for (const entry of out.elements)
    if (entry.id !== elementId && JSON.stringify(entry) !== JSON.stringify(sketch.elements.find((e) => e.id === entry.id)))
      throw Error('Nachbarelemente würden verändert.');
  if (out.version >= 3) changed.diameter = String(value);
  return out;
}
/** Resize a selected circle by diameter in millimetres. `null` addresses the
 * legacy base circle; otherwise `elementId` must name a profile circle. The
 * geometry stays untouched apart from the circle dimension, and the returned
 * sketch is a copy. Solving constraints remains the editor's step. */
export function resizeSelectedCircle(sketch, elementId, value) {
  const target = diameter(value);
  return elementId == null ? resizeLegacyCircle(sketch, target) : resizeProfileCircle(sketch, elementId, target);
}
