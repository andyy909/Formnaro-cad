import { showLabProject, showLabProposal } from './cad-lab-preview-assets.js';
import { Euler, Quaternion, Vector3 } from 'three';
import { createCadAutomationAccess } from './cad-automation-access.js';
import { runCadAIRequest } from './cad-ai-request.js';

const boxSize = [100, 64, 28];
const top = (x, y, diameter) => ({ from: [x, y, 0], to: [x, y, 28], diameter });
const initial = [top(-26, -13, 5), top(22, 14, 8)];
const pattern = [top(-25, 16, 4), top(24, -17, 10)];
const sides = [
  { from: [0, -32, 9], to: [0, 32, 9], diameter: 6, rot: [-90, 0, 0] },
  { from: [-50, 0, 19], to: [50, 0, 19], diameter: 5, rot: [0, 90, 0] },
];
const oblique = {
  from: [-18, 23, 0], to: [-5, 23, 28], diameter: 6, inclined: true,
  rot: [0, Math.atan2(13, 28) * 180 / Math.PI, 0],
};
const through = [...initial, ...pattern, ...sides, oblique];
const blind = (from, to, diameter, minBottom, inclined = false) => ({
  from, to, diameter, minBottom, inclined, stopAtEnd: true,
});
const shoulder = (from, to, diameter, inclined = false) => ({ from, to, diameter, inclined, stopAtEnd: true });
const depthPair = [
  blind([-9, -18, 28], [-9, -18, 21], 5, 4),
  blind([4, -18, 28], [4, -18, 21], 5, 4),
];
const twinSideBores = [
  { from: [50, 22, 18], to: [-50, 22, 18], diameter: 5 },
  { from: [50, -22, 18], to: [-50, -22, 18], diameter: 5 },
];
const cases = {
  'bore-pattern': { existing: initial, added: pattern },
  'bore-sides': { existing: [...initial, ...pattern], added: sides },
  'bore-oblique': { existing: [...initial, ...pattern, ...sides], added: [oblique] },
  'bore-opposed': {
    existing: through,
    added: [
      blind([-12, -24, 0], [-12, -24, 11], 6, 3.99),
      blind([-12, -24, 28], [-12, -24, 15], 9, 3.99),
    ],
    instruction: 'Die beiden Achsen sind deckungsgleich. Zwischen den flachen Böden bleibt exakt 4 mm Material.',
  },
  'bore-stepped': {
    existing: through,
    added: [
      shoulder([50, 24, 11], [43, 24, 11], 12),
      blind([43, 24, 11], [28, 24, 11], 6, 2),
      blind([34, 22, 28], [34, 22, 18], 5, 3.9),
    ],
    instruction: 'Die beiden ersten Abschnitte bilden eine koaxiale Stufen-Sackbohrung. Die Bohrung von oben bleibt separat.',
  },
  'bore-compound-angle': {
    existing: through,
    added: [blind([-35, 22, 28], [-32, 13, 14], 6, 2, true)],
    instruction: 'Die schräge Achse hat Anteile in X, Y und Z. Der Boden steht senkrecht auf dieser Achse.',
  },
  'bore-target-depth': {
    existing: [...through, ...depthPair],
    added: [],
    edit: {
      index: through.length,
      bore: blind([-9, -18, 28], [-9, -18, 13], 5, 4),
    },
    instruction: 'Die rechte der beiden gleichartigen Sackbohrungen und ihre Quelle bleiben erhalten.',
  },
  'bore-target-counterbore': {
    existing: [...initial, ...sides, ...twinSideBores],
    added: [shoulder([50, 22, 18], [43, 22, 18], 10)],
    coveredEntry: { index: initial.length + sides.length, from: [43, 22, 18] },
    instruction: 'Nur die Querbohrung bei Y=22 bekommt den Absatz auf der rechten Seite. Die übrige Durchgangsbohrung und die andere Querbohrung behalten Ø5.',
  },
  'bore-crossed-blind': {
    existing: [...initial, ...pattern, sides[0], oblique],
    added: [
      blind([50, -7.5, 22], [18, -7.5, 22], 6, 3),
      blind([34, 32, 21], [34, -1, 21], 6, 3),
    ],
    instruction: 'Die Achsen kreuzen sich in der Draufsicht. Zwischen den Bohrungen müssen mindestens 3 mm Material bleiben.',
  },
  'bore-final-fit': {
    existing: [...through, ...depthPair],
    added: [
      shoulder([-34, -32, 16], [-32, -28, 18], 8, true),
      blind([-32, -28, 18], [-28, -20, 22], 4, 2, true),
    ],
    edit: {
      index: through.length + 1,
      bore: blind([4, -18, 28], [4, -18, 16], 5, 4),
    },
    instruction: 'Bilde auf der zweifach geneigten Seitenachse die zwei koaxialen Stufen mit flachem Boden. Das bestehende linke Sackloch von oben bleibt unverändert.',
  },
};

const delta = ({ from, to }) => to.map((value, i) => value - from[i]);
const length = (bore) => Math.hypot(...delta(bore));
const direction = (bore) => delta(bore).map((value) => value / length(bore));
const describe = ({ from, to, diameter }) => 'Ø' + diameter + ' mm von (' + from.join(', ') +
  ') nach (' + to.join(', ') + ')';
const batch = (commands) => ({ kind: 'batch', commands });

function cutter(bore) {
  const axis = direction(bore);
  const rotation = new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(
    new Vector3(0, 0, 1), new Vector3(...axis),
  ), 'ZYX');
  const depth = length(bore) + (bore.stopAtEnd ? 3 : 6);
  return {
    size: [bore.diameter, bore.diameter, depth],
    pos: bore.from.map((value, i) => (value + bore.to[i]) / 2 - (bore.stopAtEnd ? 1.5 * axis[i] : 0)),
    rot: bore.rot ?? rotation.toArray().slice(0, 3).map((value) => value * 180 / Math.PI),
  };
}

function cutCommands(root, bores) {
  if (!bores.length) return [];
  const cutters = bores.map((bore, index) => ({
    op: 'create', type: 'cylinder', solid: false, as: 'cutter' + index,
    name: 'Bohrung ' + describe(bore),
    ...cutter(bore),
  }));
  return [...cutters, {
    op: 'group', targets: [root, ...cutters.map(({ as }) => '$' + as)],
    as: 'workpiece', name: 'Bohrplatte',
  }];
}

function geometryAfter({ existing, added, edit, coveredEntry }) {
  return [...existing.map((bore, index) => {
    if (index === edit?.index) return edit.bore;
    if (index === coveredEntry?.index) return { ...bore, from: coveredEntry.from };
    return bore;
  }), ...added];
}

function referenceCommands(root, sources, { existing, edit, added }) {
  const commands = [];
  if (edit) {
    const before = existing[edit.index];
    const source = sources.find((node) => node.name === 'Bohrung ' + describe(before));
    const target = { rootId: root, path: [source.id] };
    const { size, pos } = cutter(edit.bore);
    const oldPos = cutter(before).pos;
    commands.push(
      { op: 'update', target, set: { size, sizeAnchor: 'center' } },
      { op: 'transform', target, translate: pos.map((value, i) => value - oldPos[i]), space: 'world' },
    );
  }
  return [...commands, ...cutCommands(root, added)];
}
function engineeringTask({ existing, added, edit, instruction }) {
  const words = ['Bearbeite die vorhandene Bohrplatte als einen nativen bearbeitbaren Volumenkörper.'];
  if (edit) {
    words.push('Ändere nur die bezeichnete vorhandene Bohrung (' + describe(existing[edit.index]) +
      ') auf ' + describe(edit.bore) + '.');
  }
  if (added.length) {
    words.push('Ergänze diese zylindrischen Abschnitte. Die Punkte sind Achsmittelpunkte in Weltkoordinaten (mm): ' +
      added.map((bore) => describe(bore) + (bore.minBottom ? ' mit flachem Sacklochboden' : '')).join('; ') + '.');
  }
  if (instruction) words.push(instruction);
  words.push('Außenmaße und alle übrigen Bohrungen bleiben unverändert.');
  return words.join(' ');
}

async function measure(cad, target, spec, checks, label, expectMismatch = false) {
  let actual;
  let matches = true;
  try {
    const result = await cad.query('aiResultChecks', { checks: [{ target, ...spec }], aliases: {} });
    actual = result.checks?.[0]?.actual;
  } catch (error) {
    if (error.code !== 'AI_RESULT_MISMATCH') throw error;
    matches = false;
    actual = error.feedback?.actual;
  }
  checks.push({ label, passed: matches !== expectMismatch, actual });
}

async function verifyPart(cad, bores, checks) {
  const [body, ...others] = cad.snapshot().nodes;
  const oneSolid = body?.kind === 'cad' && body.stats?.solids === 1 && !others.length;
  checks.push({ label: 'Genau ein nativer Volumenkörper', passed: oneSolid });
  if (!oneSolid) return;
  const target = body.id;
  for (const [edge, expected] of [['min', [-50, -32, 0]], ['max', [50, 32, 28]]])
    await measure(cad, target, { kind: 'bounds', edge, expected }, checks, 'Außengrenze ' + edge);
  const removed = bores.reduce((sum, bore) => sum + Math.PI * (bore.diameter / 2) ** 2 * length(bore), 0);
  await measure(cad, target, { kind: 'volume', expected: boxSize.reduce((a, b) => a * b) - removed,
    tolerance: 0.05 }, checks, 'Exaktes Restvolumen aller Bohrungen');
  for (const bore of bores) {
    const { from, to, diameter, inclined, minBottom } = bore;
    const label = describe({ from, to, diameter });
    if (!inclined) {
      await measure(cad, target, { kind: 'bore', from, to, diameter, minWall: 1, ...(minBottom ? { minBottom } : {}) }, checks, label);
      continue;
    }
    // Oblique mouths are ellipses, so check the through-corridor instead of circular rims.
    await measure(cad, target, { kind: 'clearance', from, to, diameter }, checks, 'Schräge Achse frei · ' + label);
    await measure(cad, target, { kind: 'clearance', from, to, diameter: diameter + 0.12 }, checks,
      'Schräger Durchgang bleibt im Durchmesser', true);
    if (minBottom) {
      const axis = direction(bore);
      const afterBottom = to.map((value, i) => value + axis[i] * 0.05);
      const end = to.map((value, i) => value + axis[i] * minBottom);
      await measure(cad, target, { kind: 'clearance', from: afterBottom, to: end, diameter }, checks,
        'Material bleibt hinter dem schrägen Sacklochboden', true);
    }
  }
}

export async function runSpatialBoreCheck(id, { createController, signal, generate, showReference, previewOnly, benchmark }) {
  const definition = cases[id];
  const bores = geometryAfter(definition);
  showReference?.({ size: boxSize, from: [-50, -32, 0], bores, spatial: true });
  signal.throwIfAborted();
  const cad = createController();
  const cancel = () => cad.cancel();
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const fixture = await cad.execute(batch([
      { op: 'create', type: 'box', as: 'blank', size: boxSize, pos: [0, 0, 14], name: 'Rohplatte' },
      ...cutCommands('$blank', definition.existing),
    ]));
    const root = fixture.aliases.workpiece;
    const sources = cad.snapshot().nodes.find((node) => node.id === root).children;
    const visual = { signal, showReference };
    await showLabProposal(visual, cad, () => cad.preview(batch(referenceCommands(root, sources, definition))));
    if (previewOnly) return { checks: [] };
    signal.throwIfAborted();
    const before = cad.serialize();
    const scene = await cad.describe();
    const prompt = engineeringTask(definition);
    const access = createCadAutomationAccess({
      controller: cad, getScene: () => scene, getSelection: () => [{ rootId: root, path: [] }],
    });
    const answer = await runCadAIRequest({
      input: { prompt, modelChecks: false },
      benchmark,
      access, isCurrent: () => !signal.aborted, visualReview: false, maxCorrections: 1,
      generate: generate ?? (async () => ({ revision: scene.revision, commands: referenceCommands(root, sources, definition) })),
    });
    signal.throwIfAborted();
    const proposal = answer.proposal;
    if (!proposal) return { checks: [{ label: 'Native Bohrungsvorschau erstellt', passed: false }], input: { prompts: [prompt] } };
    const checks = [{ label: 'Vorschau lässt Ausgangsmodell unverändert', passed: cad.serialize() === before }];
    cad.apply(proposal);
    benchmark?.recordApplied(proposal);
    await showLabProject(visual, cad, { role: 'result' });
    await verifyPart(cad, bores, checks);
    cad.undo();
    checks.push({ label: 'Undo stellt die vorherige Platte mitsamt Bohrungen wieder her', passed: cad.serialize() === before });
    return { checks, input: { prompts: [prompt] } };
  } finally {
    signal.removeEventListener('abort', cancel);
    cad.dispose();
  }
}
