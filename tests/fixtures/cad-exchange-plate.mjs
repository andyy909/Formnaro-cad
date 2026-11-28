// Synthetic reference plate from work/Referenz-Montageplatte.json.
// Test-only fixture so the native extraction check does not depend on the
// local, uncommitted work directory. All coordinates are millimetres.
import {appendProfileLoop} from '../../src/sketch-profile.js';

export const referencePlate = Object.freeze({
  size: [100, 60],
  thickness: 5,
  holes: {
    diameter: 6,
    centers: [[-40, -20], [-40, 20], [40, -20], [40, 20]],
  },
  slot: {
    centers: [[-8, 0], [8, 0]],
    width: 6,
    overallLength: 22,
  },
  placement: {
    translation: [17, -31, 20],
    axis: [1, 0, 0],
    degrees: 35,
  },
  drawingScale: 0.5,
});

const line = (id, start, end) => ({id, type: 'line', start, end});
const arc = (id, start, through, end) => ({id, type: 'arc', start, through, end});
const circle = (id, center, diameter) => ({id, type: 'circle', center, diameter});

/** Version-2 profile with one outer loop, four Ø6 holes and one analytic slot
 * made of two straight flanks and two semicircular arcs. */
export function referencePlateSketch({thickness = referencePlate.thickness} = {}) {
  let sketch = {
    version: 2,
    kind: 'profile',
    variables: [{name: 'hoehe', value: String(thickness)}],
    dimensions: {height: 'hoehe'},
    elements: [],
    loops: [],
  };
  sketch = appendProfileLoop(sketch, [
    line('outer-bottom', [-50, -30], [50, -30]),
    line('outer-right', [50, -30], [50, 30]),
    line('outer-top', [50, 30], [-50, 30]),
    line('outer-left', [-50, 30], [-50, -30]),
  ], 'outer');
  referencePlate.holes.centers.forEach((center, index) => {
    sketch = appendProfileLoop(sketch, [circle(`hole-${index + 1}`, center, referencePlate.holes.diameter)]);
  });
  sketch = appendProfileLoop(sketch, [
    arc('slot-right', [8, 3], [11, 0], [8, -3]),
    line('slot-bottom', [8, -3], [-8, -3]),
    arc('slot-left', [-8, -3], [-11, 0], [-8, 3]),
    line('slot-top', [-8, 3], [8, 3]),
  ]);
  return sketch;
}
