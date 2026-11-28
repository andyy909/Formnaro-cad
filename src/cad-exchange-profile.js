import { resolveCadSketch } from './cad-sketch.js';
import { profileFromLegacy } from './sketch-profile.js';

/** Resolve the existing sketch geometry in its own XY plane, in millimetres. */
export function cadExchangeProfile(sketch) {
  const resolved = resolveCadSketch(sketch);
  const profile = resolved.loops ? resolved : resolveCadSketch(profileFromLegacy(resolved.sketch, resolved));
  const { loops, bottom, size } = profile;
  if (loops.some((loop) => loop.entities.some((entity) => !['line', 'arc', 'circle'].includes(entity.type))))
    throw Error('Für diese Schnittkontur werden Linien, Kreise und Kreisbögen unterstützt.');
  const [x, y] = bottom;
  const [width, height] = size;
  return { loops, bounds: { x, y, width, height } };
}
