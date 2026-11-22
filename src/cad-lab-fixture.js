import { createCadAutomationAccess } from './cad-automation-access.js';
import { runCadAIRequest } from './cad-ai-request.js';
import { createCadDrawingSheet, cadDrawingProblems, cadDrawingSourceSignatures } from './cad-drawing-data.js';
import { exportCadDrawing, previewCadDrawingCommands } from './cad-drawing-automation.js';
import { cadJointProblems } from './cad-joints-data.js';
import { showLabProject, showLabProposal } from './cad-lab-preview-assets.js';

const names = ['Führung', 'Schlitten', 'Anschlagfahne'];
const prompts = [
  'Erstelle die Führung als ein natives Teil. Grundplatte 80 × 40 × 6, Mittelpunkt (0,0,3). Zwei durchgehende Längsleisten auf der Platte, je 6 breit und 10 hoch, außen bündig. Zwei vertikale Ø6-Befestigungsbohrungen bei X=±30 und Y=0 durch die Grundplatte. Nenne das Teil Führung.',
  'Ergänze den separaten Schlitten mittig zwischen den vorhandenen Leisten. Er ist 24 lang und 8 hoch, mit 0,5 mm seitlichem Spiel je Seite und 1 mm Luft zum Boden. Mittig ein durchgängiges Langloch, in X insgesamt 12 lang und 4 breit, mit runden Enden. Nenne das Teil Schlitten. Erhalte die Führung.',
  'Verbinde Führung und Schlitten mit einem nativen Schubgelenk in X. Führung ist der feste Elternkörper, der Schlitten bleibt mittig als Nullstellung. Die Schlittenenden sollen an beiden Anschlägen noch 4 mm vor den Stirnseiten der Führung bleiben. Erhalte beide Bauteile.',
  'Ergänze die Anschlagfahne als separates Teil 12 × 8 × 2 mit linkem unteren Gelenkdatum bei (8,0,16) und mittig in Y. Sie ist bei Null waagerecht nach rechts ausgerichtet. Verbinde sie über ein Drehgelenk mit dem Schlitten, Achse in Y und positive Bewegung hebt die Fahne. Erlaubter Winkel 0 bis 60 Grad. Erhalte das Schubgelenk und beide Körper.',
  'Stelle die Arbeitsposition ein. Die linke Schlittenkante soll bei X=6 liegen. Schwenke die Fahne gleichzeitig auf 30 Grad. Verwende die bestehenden Gelenke, erhalte die Geometrie und beide Fahrgrenzen.',
  'Erstelle ein aktuelles A4-Querformat-Zeichnungsblatt namens Vorrichtung. Vorder-, Seiten- und Draufsicht müssen alle drei Bauteile der vorhandenen Vorrichtung enthalten. Aktualisiere das Blatt mit nativen Projektionen in der bestätigten Arbeitsstellung.',
  'Stelle eine zweite Prüfposition ein. Die rechte Schlittenkante soll 6 mm vor der positiven Stirnseite der Führung liegen. Die Fahne soll dabei in ihrer höchsten zulässigen Stellung stehen. Erhalte die beiden Gelenke, die Grenzen und alle drei Bauteile.',
];
const drawingPrompt =
  'Erzeuge für diese Prüfposition zwei aktuelle A4-Blätter. Blatt Vorrichtung zeigt alle drei Teile in Vorder-, Seiten- und Draufsicht. Blatt Schlitten zeigt ausschließlich den Schlitten in diesen drei Ansichten. Aktualisiere beide aus dem aktuellen nativen Modell.';

const batch = (commands) => ({ kind: 'batch', commands });
const near = (a, b, tolerance = 0.015) => Number.isFinite(a) && Math.abs(a - b) <= tolerance;
const eq = (a, b) => Array.isArray(a) && a.length === b.length && a.every((x, i) => near(x, b[i]));
const box = (as, size, pos, solid = true, name) => ({
  op: 'create',
  as,
  type: 'box',
  size,
  pos,
  solid,
  ...(name ? { name } : {}),
});
const cylinder = (as, d, h, pos) => ({ op: 'create', as, type: 'cylinder', size: [d, d, h], pos, solid: false });

function parts(cad) {
  const nodes = cad.snapshot().nodes;
  return names.map((name) => nodes.find((node) => node.name === name));
}
function connections(cad, guide, slide, flag) {
  const joints = cad.snapshot().joints?.joints ?? [];
  return [
    joints.find((joint) => joint.parentId === guide?.id && joint.childId === slide?.id && joint.kind === 'prismatic'),
    joints.find((joint) => joint.parentId === slide?.id && joint.childId === flag?.id && joint.kind === 'revolute'),
  ];
}
function flagCentre(shift, angle) {
  const radians = (angle * Math.PI) / 180;
  return [shift + 8 + 6 * Math.cos(radians) - Math.sin(radians), 0, 16 + 6 * Math.sin(radians) + Math.cos(radians)];
}

function poseCommands(cad, shift, angle) {
  const [guide, slide, flag] = parts(cad);
  const [linear, rotary] = connections(cad, guide, slide, flag);
  return [
    {
      op: 'joint',
      action: 'move',
      values: [
        { jointId: linear.id, value: shift },
        { jointId: rotary.id, value: angle },
      ],
    },
  ];
}
function drawingCommands(ids, name, id) {
  const sheet = createCadDrawingSheet({ id, name, sourceIds: ids });
  return [
    { op: 'drawing', action: 'put', sheet },
    { op: 'drawing', action: 'update', sheetId: sheet.id },
  ];
}

function reference(cad, step) {
  const [guide, slide] = parts(cad);
  if (step === 1)
    return [
      box('bed', [80, 40, 6], [0, 0, 3]),
      box('railA', [80, 6, 10], [0, -17, 11]),
      box('railB', [80, 6, 10], [0, 17, 11]),
      cylinder('bedA', 6, 10, [-30, 0, 3]),
      cylinder('bedB', 6, 10, [30, 0, 3]),
      { op: 'group', targets: ['$bed', '$railA', '$railB', '$bedA', '$bedB'], name: names[0] },
    ];
  if (step === 2)
    return [
      box('blank', [24, 27, 8], [0, 0, 11]),
      box('slot', [8, 4, 12], [0, 0, 11], false),
      cylinder('slotA', 4, 12, [-4, 0, 11]),
      cylinder('slotB', 4, 12, [4, 0, 11]),
      { op: 'group', targets: ['$blank', '$slot', '$slotA', '$slotB'], name: names[1] },
    ];
  if (step === 3)
    return [
      {
        op: 'joint',
        action: 'create',
        joint: {
          id: 'slide-link',
          kind: 'prismatic',
          parentId: guide.id,
          childId: slide.id,
          origin: [0, 0, 11],
          axis: [1, 0, 0],
          limits: { min: -24, max: 24 },
        },
      },
    ];
  if (step === 4)
    return [
      box('flag', [12, 8, 2], [14, 0, 17], true, names[2]),
      {
        op: 'joint',
        action: 'create',
        joint: {
          id: 'flag-link',
          kind: 'revolute',
          parentId: slide.id,
          childId: '$flag',
          origin: [8, 0, 16],
          axis: [0, -1, 0],
          limits: { min: 0, max: 60 },
        },
      },
    ];
  return step === 5 ? poseCommands(cad, 18, 30) : poseCommands(cad, 22, 60);
}

export async function checkedRequest(cad, runtime, prompt, scripted, checks) {
  const before = cad.serialize();
  const scene = await cad.describe();
  const access = createCadAutomationAccess({ controller: cad, getScene: () => scene });
  const outcome = await runCadAIRequest({
    input: { prompt, modelChecks: false },
    access,
    visualReview: false,
    maxCorrections: 1,
    benchmark: runtime.benchmark,
    isCurrent: () => !runtime.signal.aborted,
    generate: runtime.generate ?? (async () => ({ revision: scene.revision, commands: scripted() })),
  });
  const preserved = cad.serialize() === before;
  if (outcome.proposal || !runtime.benchmark) {
    checks.push({ label: 'Vorschau erhält den bestätigten Stand', passed: preserved });
    runtime.benchmark?.recordProgramCheck('Vorschau erhält den bestätigten Stand', preserved);
  }
  if (!outcome.proposal) {
    checks.push({ label: 'Native Vorschau erstellt', passed: false });
    return false;
  }
  await access.apply(outcome.proposal);
  runtime.benchmark?.recordApplied(outcome.proposal);
  return true;
}

async function clearanceAt(cad, target, from, to, diameter) {
  try {
    await cad.query('aiResultChecks', { checks: [{ kind: 'clearance', target, from, to, diameter }] });
    return true;
  } catch (error) {
    if (error.code === 'AI_RESULT_MISMATCH') return false;
    throw error;
  }
}
async function verifyGeometry(cad, level, checks) {
  const [guide, slide, flag] = parts(cad);
  const count = level === 1 ? 1 : level < 4 ? 2 : 3;
  const add = (label, passed, actual) => checks.push({ label, passed: !!passed, actual });
  const bodies = parts(cad).slice(0, count);
  add(
    'Erwartete getrennte native Volumenkörper',
    cad.snapshot().nodes.length === count && bodies.every((node) => node?.kind === 'cad' && node.stats?.solids === 1),
  );
  if (!checks.at(-1).passed) return;
  const angle = level === 7 ? 60 : level >= 5 ? 30 : 0;
  const shift = level === 7 ? 22 : level >= 5 ? 18 : 0;
  add(
    'Führung · Außenmaße und Materialvolumen',
    eq(guide.stats.bounds.min, [-40, -20, 0]) &&
      eq(guide.stats.bounds.max, [40, 20, 16]) &&
      near(guide.stats.volume, 28800 - 108 * Math.PI, 0.05),
    guide.stats.volume,
  );
  for (const x of [-30, 30])
    add('Befestigungsbohrung frei bei X=' + x, await clearanceAt(cad, guide.id, [x, 0, 0], [x, 0, 6], 6));
  const scene = await cad.describe();
  const bounds = (node) =>
    scene.objects.find((object) => object.id === node.id && !object.target.path.length)?.worldBounds;
  if (slide) {
    add(
      'Schlitten · Lage, Spiel und Langlochvolumen',
      eq(bounds(slide)?.min, [shift - 12, -13.5, 7]) &&
        eq(bounds(slide)?.max, [shift + 12, 13.5, 15]) &&
        near(slide.stats.volume, 5184 - 8 * (32 + 4 * Math.PI), 0.05),
      slide.stats.volume,
    );
    for (const x of [shift - 4, shift, shift + 4])
      add('Langloch frei bei X=' + x, await clearanceAt(cad, slide.id, [x, 0, 7], [x, 0, 15], 4));
  }
  const [linear, rotary] = connections(cad, guide, slide, flag);
  if (level >= 3) {
    add(
      'Schubgelenk · richtige Teile und Grenzen',
      !!linear && linear.limits?.min === -24 && linear.limits?.max === 24 && near(linear.value, shift),
    );
    if (linear) {
      for (const value of [24, -24]) {
        const result = await cad.checkJointCollision(
          {
            leftId: guide.id,
            rightId: slide.id,
            values: [{ jointId: linear.id, value }],
            minimumDistance: 0.49,
          },
          { record: false },
        );
        add('Seitliches Spiel bei Schubposition ' + value, result.passed, result.brepDistance);
      }
      let limit = false;
      try {
        const preview = await cad.previewJoints({ action: 'move', values: [{ jointId: linear.id, value: 25 }] });
        cad.discard(preview.previewId);
      } catch (error) {
        limit = error.code === 'JOINT_LIMIT';
      }
      add('Überfahren des Anschlags wird abgewiesen', limit);
    }
  }
  if (flag) {
    const flagBounds = bounds(flag);
    const centre = flagBounds?.max.map((v, i) => (v + flagBounds.min[i]) / 2);
    add(
      'Fahne folgt Schlitten und Drehachse',
      !!rotary &&
        rotary.limits?.min === 0 &&
        rotary.limits?.max === 60 &&
        near(rotary.value, angle) &&
        near(flag.stats.volume, 192, 0.05) &&
        eq(centre, flagCentre(shift, angle)),
      centre,
    );
  }
}

async function verifyDrawings(cad, expected, checks) {
  const project = cad.snapshot();
  const sourceSignatures = cadDrawingSourceSignatures(project);
  for (const [name, ids] of expected) {
    const sheet = project.drawings.sheets.find((sheet) => sheet.name === name);
    const views = sheet?.views ?? [];
    const correct =
      views.length === 3 &&
      ['front', 'side', 'top'].every((kind) =>
        views.some(
          (view) =>
            view.kind === kind &&
            view.sourceIds.length === ids.length &&
            ids.every((id) => view.sourceIds.includes(id)) &&
            view.projection?.curves?.length,
        ),
      );
    const valid = correct && !cadDrawingProblems(sheet, { sourceSignatures }).length;
    let svg = false;
    if (valid)
      svg = new TextDecoder()
        .decode((await exportCadDrawing(cad, { format: 'drawing-svg', sheetId: sheet.id })).data)
        .includes('<svg');
    checks.push({ label: 'Aktuelles natives Zeichnungsblatt ' + name, passed: svg });
  }
}

export function labDrawingDefinition(sheet) {
  return {
    ...sheet,
    views: sheet.views.map(({ projection, ...view }) => view),
    annotations: sheet.annotations.map(({ curveReferences, unresolved, ...annotation }) => annotation),
  };
}

const stopName = 'Endanschlag';
const stopCentre = [30, 0, 9];
const slideSourceNames = ['Schlittenrohling', 'Langloch-Steg', 'Langloch-Rundung links', 'Langloch-Rundung rechts'];
const stopTasks = {
  8: {
    prompt: 'Ergänze einen separaten nativen Endanschlag 4 × 24 × 6 mm mit Mittelpunkt (30,0,9). Verbinde ihn fest mit der Führung. Beim rechten Endanschlag müssen zwischen der rechten Schlittenkante und dem Anschlag 2 mm Luft bleiben. Passe nur die rechte Grenze des vorhandenen Schubgelenks an. Stelle danach den Schlitten auf X=10 und die Fahne auf 45 Grad. Erhalte Führung, Schlitten, Fahne und ihre Verbindungen.',
    width: 4, slotLength: 12, limit: 14, shift: 10, angle: 45,
  },
  9: {
    prompt: 'Revidiere die vorhandene Vorrichtung. Verbreitere den Endanschlag in X von 4 auf 12 mm um seinen aktuellen Mittelpunkt. Verlängere das mittige Langloch im Schlitten von 12 auf 16 mm, bei gleicher Breite und mit runden Enden. Bearbeite die bestehenden Quellen und erneuere bei Bedarf den Bezug der festen Verbindung am Punkt (30,0,6) mit Achse X. Lasse rechts in der Endlage wieder 2 mm Abstand zum Anschlag und erhalte die linke Grenze. Stelle den Schlitten auf X=8 und die Fahne auf 55 Grad. Erhalte die vorhandenen Körper, ihre Verbindungen und die Bohrungen.',
    width: 12, slotLength: 16, limit: 10, shift: 8, angle: 55,
    drawingPrompt: 'Aktualisiere die beiden vorhandenen A4-Blätter Vorrichtung und Schlitten auf Revision B. Behalte Blattkennungen und Ansichten bei. Das Baugruppenblatt muss alle vier vorhandenen Teile in Vorder-, Seiten- und Draufsicht zeigen. Auf dem Blatt Schlitten darf nur der revidierte Schlitten erscheinen. Berechne beide Blätter aus dem aktuellen nativen Modell neu.',
  },
};

function motionWithStop(cad, { limit, shift, angle }) {
  const linear = connections(cad, ...parts(cad))[0];
  return [
    { op: 'joint', action: 'limits', jointId: linear.id, limits: { min: -24, max: limit } },
    ...poseCommands(cad, shift, angle),
  ];
}

function installStop(cad, name = stopName) {
  const [guide] = parts(cad);
  return [
    box('stop', [4, 24, 6], stopCentre, true, name),
    {
      op: 'joint',
      action: 'create',
      joint: { id: 'stop-link', kind: 'fixed', parentId: guide.id, childId: '$stop', origin: [30, 0, 6] },
    },
    ...motionWithStop(cad, stopTasks[8]),
  ];
}

// The revision continues the part that already exists. Name it by the scene
// identity (the single body beside the three fixture parts), never by label,
// so a renamed stop is revised in place.
function existingStop(project, partIds) {
  const stops = project.nodes.filter((node) => !partIds.includes(node.id));
  if (stops.length !== 1) throw Error('Revisionsfixture braucht genau einen vorhandenen Anschlag.');
  return stops[0];
}

function revisedStop(cad, partIds) {
  const project = cad.snapshot();
  const stop = existingStop(project, partIds);
  const [guideId, slideId] = partIds;
  const fixed = project.joints.joints.find((joint) =>
    joint.kind === 'fixed' && joint.parentId === guideId && joint.childId === stop.id);
  if (!fixed) throw Error('Feste Verbindung des vorhandenen Anschlags fehlt.');
  const slide = project.nodes.find((node) => node.id === slideId);
  const target = (name) => ({ rootId: slide.id, path: [slide.children.find((node) => node.name === name).id] });
  return [
    { op: 'update', target: stop.id, set: { size: [12, 24, 6], sizeAnchor: 'center' } },
    { op: 'joint', action: 'rebind', jointId: fixed.id, origin: [30, 0, 6], axis: [1, 0, 0] },
    { op: 'update', target: target(slideSourceNames[1]), set: { size: [12, 4, 12], sizeAnchor: 'center' } },
    { op: 'transform', target: target(slideSourceNames[2]), translate: [-2, 0, 0], space: 'world' },
    { op: 'transform', target: target(slideSourceNames[3]), translate: [2, 0, 0], space: 'world' },
    ...motionWithStop(cad, stopTasks[9]),
  ];
}

async function updateFixtureDrawings(cad, commands) {
  cad.apply(await previewCadDrawingCommands(cad, { revision: cad.revision(), commands }));
}

async function seedRevision(cad, name = stopName) {
  await cad.execute(batch(installStop(cad, name)));
  const slide = parts(cad)[1];
  await cad.execute(batch(slide.children.map((child, index) => ({
    op: 'update',
    target: { rootId: slide.id, path: [child.id] },
    set: { name: slideSourceNames[index] },
  }))));
  const ids = cad.snapshot().nodes.map((node) => node.id);
  const commands = [
    ...drawingCommands(ids, 'Vorrichtung', 'assembly-sheet'),
    ...drawingCommands([slide.id], 'Schlitten', 'slide-sheet'),
  ].map((command) => command.action === 'put'
    ? { ...command, sheet: { ...command.sheet, titleBlock: { ...command.sheet.titleBlock, revision: 'A' } } }
    : command);
  await updateFixtureDrawings(cad, commands);
}

function revisionDrawings(cad) {
  return cad.snapshot().drawings.sheets.flatMap((stored) => {
    const sheet = labDrawingDefinition(stored);
    sheet.titleBlock.revision = 'B';
    return [{ op: 'drawing', action: 'put', sheet }, { op: 'drawing', action: 'update', sheetId: sheet.id }];
  });
}

function stopTargetBounds(task) {
  return {
    min: [stopCentre[0] - task.width / 2, -12, 6],
    max: [stopCentre[0] + task.width / 2, 12, 12],
  };
}

// The display name is not part of the part identity: the archived and the
// canonical names describe the same stop. Prefer the initial scene (a stable
// id for the revision), the fixed connection to the guide and the native
// geometry and place. Only when none of those signals matches, accept the
// single separate body; two plausible candidates stay unresolved on purpose.
function identifyStop({ project, scene, before, guide, excludedIds, expected }) {
  const candidates = new Map();
  const include = (node, reason) => {
    if (!node || excludedIds.has(node.id)) return;
    const entry = candidates.get(node.id) ?? { node, reasons: [] };
    if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
    candidates.set(node.id, entry);
  };
  for (const source of before.nodes)
    if (!excludedIds.has(source.id))
      include(project.nodes.find((node) => node.id === source.id), 'stabile Identität aus der Ausgangsszene');
  for (const joint of project.joints?.joints ?? [])
    if (joint.kind === 'fixed' && joint.parentId === guide?.id)
      include(project.nodes.find((node) => node.id === joint.childId), 'feste Verbindung zur Führung');
  for (const node of project.nodes) {
    if (excludedIds.has(node.id)) continue;
    const bounds = scene.objects.find((object) => object.id === node.id)?.worldBounds;
    if (bounds && eq(bounds.min, expected.min) && eq(bounds.max, expected.max))
      include(node, 'Geometrie und Lage');
  }
  const separate = project.nodes.filter((node) => !excludedIds.has(node.id));
  if (!candidates.size && separate.length === 1) include(separate[0], 'einziges zusätzliches Bauteil');
  const entries = [...candidates.values()];
  return { entries, stop: entries.length === 1 ? entries[0].node : undefined };
}

async function verifyStopFixture(cad, before, task, checks, partIds) {
  const project = cad.snapshot();
  const [guide, slide, flag] = partIds.map((id) => project.nodes.find((node) => node.id === id));
  const scene = await cad.describe();
  const expected = stopTargetBounds(task);
  const identification = identifyStop({ project, scene, before, guide, excludedIds: new Set(partIds), expected });
  const stop = identification.stop;
  const add = (label, passed, actual) => checks.push({ label, passed: !!passed, actual });
  add(
    'Anschlag anhand von Ausgangsszene, Lage und fester Verbindung eindeutig identifiziert',
    !!stop,
    identification.entries.map(({ node, reasons }) => ({ id: node.id, name: node.name, reasons })),
  );
  const fourBodies = project.nodes.length === 4 &&
    [guide, slide, flag, stop].every((node) => node?.kind === 'cad' && node.stats?.solids === 1);
  add('Vier getrennte native Volumenkörper', fourBodies);
  if (!fourBodies) return;
  const sameSources = (node) => {
    const original = before.nodes.find((source) => source.id === node?.id);
    const old = original?.children ?? [];
    const updated = node?.children ?? [];
    return !!original && old.length === updated.length &&
      old.every((child) => updated.some((source) => source.id === child.id));
  };
  add('Vorhandene Körper und Quellen erhalten', [guide, slide, flag].every(sameSources) && (!task.drawingPrompt || sameSources(stop)));

  const bounds = (node) => scene.objects.find((object) => object.id === node.id)?.worldBounds;
  const { width, limit, shift, angle, slotLength } = task;
  const placedStop = scene.objects.find((object) => object.id === stop.id);
  add('Anschlag · native Abmessungen und Lage',
    eq(bounds(stop)?.min, expected.min) &&
    eq(bounds(stop)?.max, expected.max) &&
    near(placedStop?.volume, width * 24 * 6, 0.05), placedStop?.worldBounds);
  const guideInPlace = eq(bounds(guide)?.min, [-40, -20, 0]) && eq(bounds(guide)?.max, [40, 20, 16]);
  const slideInPlace = eq(bounds(slide)?.min, [shift - 12, -13.5, 7]) && eq(bounds(slide)?.max, [shift + 12, 13.5, 15]);
  add('Führung · Außenmaße und Materialvolumen erhalten',
    guideInPlace && near(guide.stats.volume, 28800 - 108 * Math.PI, 0.05), guide.stats.volume);
  add('Schlitten · Passung, Lage und Materialvolumen',
    slideInPlace && near(slide.stats.volume, 5184 - 8 * (4 * (slotLength - 4) + 4 * Math.PI), 0.05), slide.stats.volume);

  for (const [part, x, from, to, diameter] of [
    [guide, -30, 0, 6, 6], [guide, 30, 0, 6, 6],
    ...[-1, 0, 1].map((side) => [slide, shift + side * (slotLength - 4) / 2, 7, 15, 4]),
  ]) {
    const inPlace = part === guide ? guideInPlace : slideInPlace;
    add(part.name + ' · Öffnung frei bei X=' + x, inPlace && await clearanceAt(cad, part.id, [x, 0, from], [x, 0, to], diameter));
  }

  const [linear, rotary] = connections(cad, guide, slide, flag);
  const fixed = project.joints?.joints.find((joint) =>
    joint.kind === 'fixed' && joint.parentId === guide.id && joint.childId === stop.id);
  add('Anschlag fest mit Führung verbunden', fixed && project.joints.joints.length === 3);
  const ready = linear?.limits?.min === -24 && linear?.limits?.max === limit && near(linear.value, shift);
  add('Schubgelenk · alte linke Grenze, neue rechte Grenze und Arbeitsstellung', ready);
  add('Drehgelenk und Fahne · Winkel und Lage',
    rotary?.limits?.min === 0 && rotary?.limits?.max === 60 && near(rotary.value, angle) &&
    near(flag.stats.volume, 192, 0.05) && eq(bounds(flag)?.center, flagCentre(shift, angle)), bounds(flag)?.center);
  const jointProblems = cadJointProblems(project);
  add('Alle Gelenkbezüge sind aktuell', !jointProblems.length, jointProblems);
  if (ready && !jointProblems.length) {
    const values = (value) => [{ jointId: linear.id, value }];
    const gap = await cad.checkJointCollision(
      { leftId: slide.id, rightId: stop.id, values: values(limit), minimumDistance: 1.99 }, { record: false });
    add('Rechte Endlage · 2 mm nativer Abstand zum Anschlag', gap.passed && near(gap.distance, 2), gap.distance);
    let refused = false;
    try {
      const preview = await cad.previewJoints({ action: 'move', values: values(limit + 1) });
      cad.discard(preview.previewId);
    } catch (error) {
      if (error.code !== 'JOINT_LIMIT') throw error;
      refused = true;
    }
    add('Gelenk weist Überfahren der neuen Endlage ab', refused);
  }
  if (task.drawingPrompt) {
    add('Vorhandene Blätter und Ansichtskennungen mit Revision B',
      project.drawings.sheets.length === 2 && before.drawings.sheets.every((original) => {
        const sheet = project.drawings.sheets.find((item) => item.id === original.id);
        return sheet?.titleBlock.revision === 'B' && original.views.every((view) =>
          sheet.views.some((entry) => entry.id === view.id && entry.kind === view.kind));
      }));
    await verifyDrawings(cad, [['Vorrichtung', [guide.id, slide.id, flag.id, stop.id]], ['Schlitten', [slide.id]]], checks);
  }
}

async function runStopFixture(level, runtime, cad, checks, { referenceStopName = stopName } = {}) {
  const task = stopTasks[level];
  const partIds = parts(cad).map((node) => node.id);
  const build = level === 8
    ? (controller) => installStop(controller, referenceStopName)
    : (controller) => revisedStop(controller, partIds);
  if (task.drawingPrompt) await seedRevision(cad, referenceStopName);
  const baseline = cad.serialize();
  const before = cad.snapshot();
  const undo = cad.state().undo;
  const input = { prompts: [task.prompt] };
  if (runtime.showReference && typeof document !== 'undefined') {
    const expected = runtime.createController();
    try {
      await expected.open(baseline);
      await expected.execute(batch(build(expected)));
      if (task.drawingPrompt) await updateFixtureDrawings(expected, revisionDrawings(expected));
      await showLabProject(runtime, expected, { drawings: !!task.drawingPrompt });
    } catch { /* Reference pictures are separate from native verification. */ }
    finally { expected.dispose(); }
  }
  if (runtime.previewOnly) return { checks, input };
  runtime.signal.throwIfAborted();
  if (!(await checkedRequest(cad, runtime, task.prompt, () => build(cad), checks))) return { checks, input };
  if (task.drawingPrompt) {
    input.prompts.push(task.drawingPrompt);
    const drawingRuntime = runtime.generate ? {
      ...runtime,
      generate: (args) => runtime.generate({
        ...args,
        scene: { ...args.scene, drawings: cad.snapshot().drawings.sheets.map(labDrawingDefinition) },
      }),
    } : runtime;
    if (!(await checkedRequest(cad, drawingRuntime, task.drawingPrompt, () => revisionDrawings(cad), checks)))
      return { checks, input };
  }
  await showLabProject(runtime, cad, { role: 'result', drawings: !!task.drawingPrompt });
  await verifyStopFixture(cad, before, task, checks, partIds);
  while (cad.state().undo > undo) cad.undo();
  const restored = cad.serialize() === baseline;
  checks.push({ label: 'Undo stellt den Ausgangszustand wieder her', passed: restored });
  runtime.benchmark?.recordProgramCheck('Undo stellt den Ausgangszustand wieder her', restored);
  return { checks, input };
}
export async function runLabFixture(level, runtime, { checkOriginalGuide = false, referenceStopName = stopName } = {}) {
  const { signal } = runtime;
  signal.throwIfAborted();
  const cad = runtime.createController();
  const cancel = () => cad.cancel();
  signal.addEventListener('abort', cancel, { once: true });
  const checks = [];
  try {
    for (let step = 1; step < Math.min(level, stopTasks[level] ? 5 : 6); step++) {
      signal.throwIfAborted();
      await cad.execute(batch(reference(cad, step)));
    }
    if (stopTasks[level]) return await runStopFixture(level, runtime, cad, checks, { referenceStopName });
    const before = cad.serialize(),
      undo = cad.state().undo;
    const originalGuide = checkOriginalGuide ? JSON.stringify(parts(cad)[0]) : undefined;
    const run = (prompt, script) => checkedRequest(cad, runtime, prompt, script, checks);
    const input = { prompts: [] };
    const ask = async (prompt, script) => {
      input.prompts.push(prompt);
      return run(prompt, script);
    };
    const drawings = () => {
      const ids = parts(cad).map((node) => node.id);
      return [
        ...drawingCommands(ids, 'Vorrichtung', 'assembly-sheet'),
        ...(level === 7 ? drawingCommands([ids[1]], 'Schlitten', 'slide-sheet') : []),
      ];
    };
    if (level < 6) {
      await showLabProposal(runtime, cad, () => cad.preview(batch(reference(cad, level))));
    } else if (level === 6) {
      await showLabProposal(runtime, cad,
        () => previewCadDrawingCommands(cad, { revision: cad.revision(), commands: drawings() }),
        { drawings: true });
    } else if (runtime.showReference && typeof document !== 'undefined') {
      const expected = runtime.createController();
      try {
        await expected.open(before);
        await expected.execute(batch(reference(expected, level)));
        const ids = parts(expected).map((node) => node.id);
        const commands = [
          ...drawingCommands(ids, 'Vorrichtung', 'assembly-sheet'),
          ...drawingCommands([ids[1]], 'Schlitten', 'slide-sheet'),
        ];
        await showLabProposal(runtime, expected,
          () => previewCadDrawingCommands(expected, { revision: expected.revision(), commands }),
          { drawings: true });
      } catch { /* The reference image runs outside the measured solution. */ }
      finally { expected.dispose(); }
    }
    if (runtime.previewOnly) return { checks, input };
    signal.throwIfAborted();
    if (level === 6) {
      if (!(await ask(prompts[5], drawings))) return { checks, input };
    } else {
      const prompt = level === 4 && runtime.benchmark
        ? prompts[3] + ' Die Fahne liegt bewusst 1 mm über der Schlittenoberkante (Z=15). Erhalte diesen Abstand.'
        : prompts[level - 1];
      if (!(await ask(prompt, () => reference(cad, level)))) return { checks, input };
      if (level === 7 && !(await ask(drawingPrompt, drawings))) return { checks, input };
    }
    await showLabProject(runtime, cad, { role: 'result', drawings: level >= 6 });
    await verifyGeometry(cad, level, checks);
    if (checkOriginalGuide) checks.push({
      label: 'Unveränderte Führung mit allen Quellen',
      passed: JSON.stringify(parts(cad)[0]) === originalGuide,
    });
    if (level >= 6) {
      const all = parts(cad).map((node) => node?.id);
      await verifyDrawings(cad, level === 7 ? [['Vorrichtung', all], ['Schlitten', [all[1]]]] : [['Vorrichtung', all]], checks);
    }
    while (cad.state().undo > undo) cad.undo();
    const restored = cad.serialize() === before;
    checks.push({ label: 'Undo stellt den Ausgangszustand wieder her', passed: restored });
    runtime.benchmark?.recordProgramCheck('Undo stellt den Ausgangszustand wieder her', restored);
    return { checks, input };
  } finally {
    signal.removeEventListener('abort', cancel);
    cad.dispose();
  }
}
