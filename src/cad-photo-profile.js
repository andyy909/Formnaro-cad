import { photoMetricReference } from './cad-photo-multiview-data.js';
import { validateAffineMatrix } from './cad-project.js';
import { appendProfileLoop, profileLines } from './sketch-profile.js';

export function photoProfileCommand(reference, height, frame) {
  if (!Number.isFinite(height) || height < 0.01 || height > 10000)
    throw Error('Die Extrusionshöhe muss zwischen 0,01 und 10.000 mm liegen.');
  const metric = photoMetricReference(reference);
  if (!metric.bounds) throw Error('Zuerst eine Außenkontur im Foto bestätigen.');
  if (metric.outline.length + metric.holes.reduce((sum, hole) => sum + hole.length, 0) > 128)
    throw Error('Außenkontur und Öffnungen dürfen zusammen höchstens 128 Segmente enthalten.');
  const { min, max } = metric.bounds;
  if (max.some((value, axis) => value - min[axis] < 0.01 || value - min[axis] > 10000))
    throw Error('Die Profilabmessungen müssen zwischen 0,01 und 10.000 mm liegen.');
  const local = (points) => points.map(([x, y]) => [x - min[0], max[1] - y]);
  let sketch = {
    version: 2,
    kind: 'profile',
    variables: [],
    dimensions: { height: String(height) },
    elements: [],
    loops: [],
  };
  sketch = appendProfileLoop(sketch, profileLines(local(metric.outline)), 'outer');
  for (const hole of metric.holes) sketch = appendProfileLoop(sketch, profileLines(local(hole)), 'hole');
  return {
    op: 'sketch',
    as: 'photo_profile',
    name: ('Fotoprofil · ' + metric.reference.name).slice(0, 160),
    sketch,
    ...(frame === undefined ? {} : { frame: validateAffineMatrix(frame) }),
  };
}
