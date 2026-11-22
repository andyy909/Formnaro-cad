import { cadIdentity, cadPoint, inverseCadMatrix, multiplyCadMatrices } from './cad-affine.js';
import { stlChallengeTasks } from './cad-lab-stl-challenge-plan.js';

const box = (as, size, pos, solid = true) => ({ op: 'create', type: 'box', as, size, pos, solid });
const cyl = (as, diameter, height, pos, rot = [0, 0, 0], solid = false) =>
  ({ op: 'create', type: 'cylinder', as, size: [diameter, diameter, height], pos, rot, solid });
const cone = (as, diameter, topDiameter, height, pos) => ({
  op: 'create', type: 'cone', as, size: [diameter, diameter, height], pos, rot: [180, 0, 0],
  params: { topDiameter }, solid: false,
});
const right = [1, 0, 0], left = [-1, 0, 0], down = [0, 0, -1], up = [0, 0, 1], forward = [0, 1, 0];
const ray = (label, origin, direction, distance) => ({ label, origin, direction, distance });
// Use an off-seam azimuth for round STEP faces. Keep the probe on a radius.
const flangeRadial = [Math.cos(0.31), Math.sin(0.31), 0];
const ring = (label, z, radius) => ray(label,
  [26 * flangeRadial[0], 26 * flangeRadial[1], z], flangeRadial.map((n) => -n), 26 - radius);

const fixtures = {
  'stl-single-seat': {
    parts: [
      box('plate', [32, 22, 8], [0, 0, 4]),
      cyl('bore', 4, 10, [4, -3, 4]),
      cone('seat', 10.4, 3.6, 3.4, [4, -3, 6.5]),
    ],
    probes: [
      ray('Bohrung vollständig durchgängig', [4, -3, 10], down, null),
      ray('Senkung beginnt oberhalb von Z=5 mm', [4, -3, 4.8], right, 2),
      ray('Senkung mit 45° Flankenwinkel', [4, -3, 6], right, 3),
      ray('Öffnung der Senkung nach oben', [4, -3, 7.8], right, 4.8),
    ],
  },
  'stl-rotated-key': {
    parts: [
      box('plate', [44, 30, 10], [0, 0, 5]),
      box('notch', [10, 10, 12], [20, 13, 5], false),
      cyl('bore', 5, 12, [-10, 3, 5]),
      cyl('seat', 10, 5, [-10, 3, 9.5]),
      cyl('blind', 6, 6, [9, -5, 1]),
    ],
    transform: { rotate: [17, -11, 31], translate: [33, -16, 15] },
    probes: [
      ray('Kerbe bleibt in der gedrehten Ecke offen', [20, 12, 13], down, null),
      ray('Kleine Stufe Ø5 in ursprünglicher Weltlage', [-10, 3, 3], right, 2.5),
      ray('Große Stufe Ø10 in ursprünglicher Weltlage', [-10, 3, 8], right, 5),
      ray('Unterseitiges Sackloch endet bei Z=4 der Platte', [9, -5, -2], up, 6),
      ray('Sackloch bleibt auf der Gegenseite geschlossen', [9, -5, 13], down, 3),
    ],
  },
  'stl-blind-junction': {
    parts: [
      box('base', [48, 32, 16], [0, 0, 8]),
      cyl('top', 8, 14, [-8, 1, 11]),
      cyl('side', 5, 25, [-8, -5.5, 7], [-90, 0, 0]),
      cyl('separate', 7, 9, [11, -5, 1.5]),
    ],
    probes: [
      ray('Oberes Sackloch mit flachem Boden bei Z=4', [-8, 1, 20], down, 16),
      ray('Seitliches Sackloch durchstößt die obere Bohrung und endet bei Y=7', [-8, -18, 7], forward, 25),
      ray('Seitlicher Zugang Ø5', [-8, -12, 7], up, 2.5),
      ray('Getrenntes Sackloch öffnet nach unten', [11, -5, -2], up, 8),
      ray('Decke über dem getrennten Sackloch bleibt erhalten', [11, -5, 20], down, 4),
    ],
  },
  'stl-nested-pocket': {
    parts: [
      box('base', [48, 36, 14], [0, 0, 7]),
      { op: 'create', type: 'roundbox', as: 'pocket', size: [34, 24, 10], pos: [0, 0, 14],
        params: { edgeStyle: 'round', edgeSize: 3, edgeScope: 'vertical' }, solid: false },
      box('deep', [18, 12, 13], [5, -2, 10.5], false),
      cyl('hole', 4, 8, [7, -3, 3]),
      cyl('blind', 5, 13, [-9, 3, 13.5]),
    ],
    probes: [
      ray('Erster Taschenboden bei Z=9', [-12, -3, 17], down, 8),
      ray('Versetzter zweiter Taschenboden bei Z=4', [4, 2, 17], down, 13),
      ray('Durchgang am zweiten Boden', [7, -3, 17], down, null),
      ray('Sackloch unter dem ersten Boden', [-9, 3, 17], down, 10),
      ray('Gerundete Ecke lässt Material stehen', [16.8, 11.8, 17], down, 3),
    ],
  },
  'stl-grooved-flange': {
    parts: [
      cyl('core', 20, 22, [0, 0, 11], undefined, true),
      cyl('bottom', 38, 4, [0, 0, 2], undefined, true),
      cyl('middle', 30, 8, [0, 0, 10], undefined, true),
      cyl('top', 34, 5, [0, 0, 19.5], undefined, true),
      cyl('bore', 6, 26, [0, 0, 11]),
      cone('seat', 12.4, 5.6, 3.4, [0, 0, 20.5]),
      cyl('cross', 4, 34, [0, 0, 10], [0, 90, 0]),
    ],
    probes: [
      ring('Untere Ringnut hat Durchmesser 20', 5, 10),
      ring('Mittlerer Bund hat Durchmesser 30', 13, 15),
      ring('Obere Ringnut hat Durchmesser 20', 15, 10),
      ring('Unterer Bund hat Durchmesser 38', 2, 19),
      ray('Querbohrung durchdringt den mittleren Bund', [26, 0.27, 10.19], left, null),
      ray('Obere Kegelsenkung öffnet nach oben', [0, 0, 21.5], flangeRadial, 5.5),
    ],
  },
};

export async function buildStlChallenge(id, { createController, signal }) {
  const task = stlChallengeTasks.find((item) => item.id === id);
  if (!task) throw Error('Unbekannte STL-Diagnoseaufgabe.');
  const { parts, transform, probes } = fixtures[id];
  const commands = [...parts, { op: 'group', targets: parts.map(({ as }) => '$' + as), as: 'result', name: task.label }];
  const cad = createController();
  const stop = () => cad.cancel();
  signal.addEventListener('abort', stop, { once: true });
  try {
    await cad.execute({ kind: 'batch', commands }, { signal });
    let [body] = cad.snapshot().nodes;
    let frame = cadIdentity();
    if (transform) {
      const original = body.transform;
      await cad.execute({ kind: 'batch', commands: [{ op: 'transform', target: body.id, space: 'world', ...transform }] }, { signal });
      [body] = cad.snapshot().nodes;
      frame = multiplyCadMatrices(body.transform, inverseCadMatrix(original));
      commands.push({ op: 'transform', target: '$result', space: 'world', ...transform });
    }
    if (body.stats?.solids !== 1) throw Error('Die STL-Diagnosevorlage enthält keinen einzelnen Volumenkörper.');
    const output = await cad.exportModel({ format: 'stl', quality: { deflection: 0.02, angleDegrees: 8 } });
    const bytes = await new Blob([output.data]).arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const verify = async (controller, target, add, querySignal = signal) => {
      for (const { label, origin, direction, distance } of probes) {
        const worldOrigin = cadPoint(frame, origin);
        const worldEnd = cadPoint(frame, origin.map((value, i) => value + direction[i]));
        const hit = await controller.query('rayPick', {
          ids: [target.id],
          ray: { origin: worldOrigin, direction: worldEnd.map((value, i) => value - worldOrigin[i]) },
        }, { signal: querySignal });
        const actualMM = hit ? Math.hypot(...hit.point.map((value, i) => value - worldOrigin[i])) : null;
        add(label, distance === null ? actualMM === null : actualMM !== null && Math.abs(actualMM - distance) <= 0.08,
          { expectedMM: distance, actualMM, toleranceMM: 0.08 });
      }
    };
    const referenceChecks = [];
    await verify(cad, body, (label, passed, actual) => referenceChecks.push({ label, passed, actual }));
    if (!referenceChecks.every(({ passed }) => passed))
      throw Error('Native Referenzprüfung fehlgeschlagen: ' + referenceChecks.filter(({ passed }) => !passed)
        .map(({ label, actual }) => label + ' (' + actual.actualMM + ')').join(', '));
    return { name: task.file, bytes, sha256, commands, verify, referenceChecks, volumeMM3: body.stats.volume };
  } finally {
    signal.removeEventListener('abort', stop);
    cad.dispose();
  }
}
