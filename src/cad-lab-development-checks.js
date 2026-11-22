import { showLabProject, showLabProposal } from './cad-lab-preview-assets.js';
import { createCadAutomationAccess } from './cad-automation-access.js';
import { cadAIFeatureScopeContext } from './cad-ai-feature-automation.js';
import { captureCadAISourceReference } from './cad-ai-feature-references.js';
import { runCadAIRequest } from './cad-ai-request.js';
import { exportCadDrawing } from './cad-drawing-automation.js';
import { cadDrawingDimension, createCadDrawingSheet } from './cad-drawing-data.js';
import { createCadProjectParameters } from './cad-project-parameters-data.js';

const plateCases = {
  'plate-length': {
    prompt: 'Mach die Platte rechts 20 mm länger. Lass die Bohrungen, wo sie sind.',
    size: 40,
    diameter: 4,
    centers: [-10, 10],
    finalSize: 60,
    finalDiameter: 4,
    finalCenters: [-10, 10],
  },
  'plate-diameter': {
    prompt: 'Mach beide Bohrungen auf 8 mm. Die Lage bleibt.',
    size: 60,
    diameter: 4,
    centers: [-10, 10],
    finalSize: 60,
    finalDiameter: 8,
    finalCenters: [-10, 10],
  },
  'plate-spacing': {
    prompt: 'Setz die Bohrungen 30 mm auseinander. Die Mitte zwischen ihnen bleibt gleich.',
    size: 60,
    diameter: 8,
    centers: [-10, 10],
    finalSize: 60,
    finalDiameter: 8,
    finalCenters: [-15, 15],
  },
  'plate-drawing': {
    prompt: 'Mach die Platte rechts noch 5 mm länger. Lass die Bohrungen, wo sie sind, und aktualisiere die Zeichnung.',
    size: 60,
    diameter: 8,
    centers: [-15, 15],
    finalSize: 65,
    finalDiameter: 8,
    finalCenters: [-15, 15],
  },
  'plate-step': {
    prompt: 'Mach die Platte rechts noch 5 mm länger. Lass die Bohrungen, wo sie sind.',
    size: 60,
    diameter: 8,
    centers: [-15, 15],
    finalSize: 65,
    finalDiameter: 8,
    finalCenters: [-15, 15],
  },
};

// 01 · Nur die gewählte Bohrung ändern. Every acceptance value lives here and
// drives both the fixture and the native checks. The plate is rotated about
// world Z and shifted so that the measurement cannot lean on the unrotated
// axes or on a single world-X root, as the older plate benchmark does.
const selectedBoreCase = {
  prompt: 'Vergrößere nur die ausgewählte Bohrung von Ø6 auf Ø8. Behalte alles andere bei.',
  plate: { size: [112, 44, 6], centers: [12, 100], diameter: 6, selectedDiameter: 8 },
  placement: { rotate: [0, 0, 90], translate: [200, -50, 8] },
  world: {
    min: [178, -50, 8],
    max: [222, 62, 14],
    bores: [
      { from: [200, -38, 8], to: [200, -38, 14], diameter: 6 },
      { from: [200, 50, 8], to: [200, 50, 14], diameter: 8 },
    ],
  },
  neighbor: {
    name: 'Bohrplatte Nachbar',
    size: [20, 8, 6],
    pos: [150, 0, 11],
    min: [140, -4, 8],
    max: [160, 4, 14],
    volume: 960,
  },
  faceDistance: 12,
};

const near = (actual, expected, tolerance = 1e-6) =>
  Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const target = (rootId, path = []) => ({ rootId, path });
const findNode = (cad, id) => cad.snapshot().nodes.find((node) => node.id === id);

function check(label, passed, actual) {
  return { label, passed: !!passed, ...(actual === undefined ? {} : { actual }) };
}

async function createPlate(cad, { size, diameter, centers }) {
  const middle = size / 2 - 20;
  const { aliases } = await cad.execute({
    kind: 'batch',
    commands: [
      { op: 'create', type: 'box', name: 'Platte', size: [size, 30, 10], pos: [middle, 0, 5], as: 'base' },
      ...centers.map((x, i) => ({
        op: 'create',
        type: 'cylinder',
        name: 'Bohrungsquelle ' + (i + 1),
        size: [diameter, diameter, 20],
        pos: [x, 0, 5],
        solid: false,
        as: 'hole' + i,
      })),
      { op: 'group', name: 'Bohrplatte', targets: ['$base', '$hole0', '$hole1'], as: 'plate' },
      { op: 'create', type: 'box', name: 'Nachbarteil', size: [5, 6, 7], pos: [90, 0, 0], as: 'neighbor' },
    ],
  });
  const children = findNode(cad, aliases.plate).children;
  const holes = children.filter((node) => node.recipe.type === 'cylinder').map((node) => node.id);
  const base = children.find((node) => node.recipe.type === 'box').id;
  const parameters = {
    ...createCadProjectParameters(),
    parameters: [
      { id: 'radius', name: 'radius', value: diameter / 2 },
      { id: 'diameter', name: 'diameter', value: '2 * radius' },
    ],
    bindings: holes.flatMap((id, i) =>
      [0, 1].map((axis) => ({
        id: 'diameter-' + i + '-' + axis,
        parameterId: 'diameter',
        target: target(aliases.plate, [id]),
        field: 'size.' + axis,
      })),
    ),
  };
  cad.apply(await cad.previewProjectParameters(parameters));
  return {
    plate: aliases.plate,
    neighbor: aliases.neighbor,
    base,
    holes,
    bindings: cad.snapshot().projectParameters.bindings,
  };
}

async function cadBoreReference(cad, id, x) {
  const result = await cad.query('featureReference', {
    action: 'pick',
    kind: 'bore',
    ids: [id],
    ray: { origin: [x, 0, 5], direction: [0, 1, 0], far: 20 },
  });
  return result.reference;
}

function draftCommands(references, fieldValues) {
  return fieldValues.map(([i, field, value]) => ({
    op: 'feature',
    referenceId: references[i].id,
    field,
    value,
  }));
}

async function requestPlateEdit(cad, fixture, id, options, definition) {
  const project = cad.snapshot();
  const source = (id) => captureCadAISourceReference(project, target(fixture.plate, [id]));
  let references, fields;
  if (id === 'plate-diameter') {
    references = await Promise.all(definition.centers.map((x) => cadBoreReference(cad, fixture.plate, x)));
    fields = [
      [0, 'diameter', definition.finalDiameter],
      [1, 'diameter', definition.finalDiameter],
    ];
  } else if (id === 'plate-spacing') {
    references = fixture.holes.map(source);
    // Group sources use local coordinates relative to the group's placement.
    const localDelta = findNode(cad, fixture.plate).transform[12];
    fields = definition.finalCenters.map((x, i) => [i, 'pos.0', x - localDelta]);
  } else {
    references = [source(fixture.base)];
    const localDelta = findNode(cad, fixture.plate).transform[12];
    fields = [
      [0, 'size.0', definition.finalSize],
      [0, 'pos.0', definition.finalSize / 2 - 20 - localDelta],
    ];
  }
  const scene = await cad.describe();
  const featureScope = { version: 1, items: references };
  const context = cadAIFeatureScopeContext(project, featureScope);
  const access = createCadAutomationAccess({
    controller: cad,
    getScene: () => scene,
    getSelection: () => [target(fixture.plate)],
  });
  const scripted = async () => ({ revision: scene.revision, commands: draftCommands(references, fields) });
  return runCadAIRequest({
    input: { prompt: definition.prompt },
    visualReview: false,
    isCurrent: () => !options.signal?.aborted,
    maxCorrections: options.benchmark ? 1 : 0,
    benchmark: options.benchmark,
    access: {
      ...access,
      context: (request) => ({ ...access.context(request), featureScope: context }),
      restrictedFeatures: true,
      preview: (request, settings) => access.preview(request, { ...settings, featureScope }),
    },
    generate: options.generate ?? scripted,
  });
}

function measurementSpecs(id, definition) {
  const { finalSize, finalCenters, finalDiameter } = definition;
  return [
    { kind: 'bounds', target: id, expected: [finalSize, 30, 10], edge: 'size' },
    { kind: 'volume', target: id, expected: (finalSize * 30 - 2 * Math.PI * (finalDiameter / 2) ** 2) * 10 },
    ...finalCenters.map((x) => ({
      kind: 'bore',
      target: id,
      from: [x, 0, 0],
      to: [x, 0, 10],
      diameter: finalDiameter,
      minWall: 1,
    })),
  ];
}

async function readMeasurements(cad, proposal, id, definition, prefix = '') {
  const { checks } = await cad.checkPreview(proposal.previewId, measurementSpecs(id, definition), {
    collectFailures: true,
  });
  const labels = ['Außenmaß', 'Materialvolumen', 'Linke Bohrung', 'Rechte Bohrung'];
  return checks.map((result, i) => check(prefix + labels[i], result.passed ?? true, result.actual));
}

async function addPlateDrawing(cad, root, size) {
  const sheet = createCadDrawingSheet({ name: 'Bohrplatte', sourceIds: [root] });
  cad.apply(await cad.previewDrawings({ version: 1, sheets: [sheet] }));
  cad.apply(await cad.previewDrawingUpdate(cad.snapshot().drawings, { sheetIds: [sheet.id] }));
  const drawings = cad.snapshot().drawings;
  const nativeSheet = drawings.sheets[0];
  const view = nativeSheet.views.find((item) => item.kind === 'top');
  const curve = view.projection.curves.find(
    (item) => item.kind === 'line' && near(item.a[1], item.b[1]) && near(Math.abs(item.a[0] - item.b[0]), size),
  );
  if (!curve) throw Error('Bemaßbare Längskante fehlt in der Ausgangszeichnung.');
  const annotation = { id: 'length', kind: 'length', viewId: view.id, curveIds: [curve.id], position: [40, 40] };
  nativeSheet.annotations.push(annotation);
  cad.apply(await cad.previewDrawings(drawings));
  return cadDrawingDimension(nativeSheet, annotation).value;
}

async function runPlateCheck(cad, id, options) {
  const definition = plateCases[id];
  const fixture = await createPlate(cad, definition);
  const oldDimension = id === 'plate-drawing' ? await addPlateDrawing(cad, fixture.plate, definition.size) : null;
  await showLabProposal(options, cad, async () => {
    const { proposal } = await requestPlateEdit(cad, fixture, id, { ...options, generate: undefined, benchmark: undefined }, definition);
    return proposal && cad.getPreview(proposal.previewId);
  }, { drawings: id === 'plate-drawing' });
  if (options.previewOnly) return { checks: [] };
  options.signal?.throwIfAborted();
  const original = cad.serialize();
  const originalNeighbor = findNode(cad, fixture.neighbor);
  const proposal = (await requestPlateEdit(cad, fixture, id, options, definition)).proposal;
  const checks = [check('Vorschau lässt bestätigtes Modell unverändert', cad.serialize() === original)];
  if (!proposal) return { checks: [...checks, check('CAD-Vorschau erstellt', false)] };
  options.signal?.throwIfAborted();
  checks.push(...(await readMeasurements(cad, proposal, fixture.plate, definition)));
  cad.apply({ ...proposal, acceptFeatureDependencies: true });
  options.benchmark?.recordApplied(proposal);
  await showLabProject(options, cad, { role: 'result', drawings: id === 'plate-drawing' });
  const edited = findNode(cad, fixture.plate);
  checks.push(
    check('Linke Kante bleibt bei −20 mm', near(edited.stats.bounds.min[0], -20), edited.stats.bounds.min[0]),
    check('Nachbarteil unverändert', same(findNode(cad, fixture.neighbor), originalNeighbor)),
    check(
      'Bohrungsformel und Quellen erhalten',
      same(cad.snapshot().projectParameters.bindings, fixture.bindings) &&
        cad.snapshot().projectParameters.parameters.find((p) => p.id === 'diameter').value === '2 * radius',
    ),
  );
  if (id === 'plate-drawing') {
    const sheet = cad.snapshot().drawings.sheets[0];
    const annotation = sheet.annotations.find((item) => item.id === 'length');
    const dimension = annotation && !annotation.unresolved ? cadDrawingDimension(sheet, annotation)?.value : null;
    checks.push(
      check('Verknüpfte Zeichnung wechselt von 60 auf 65 mm', near(oldDimension, 60) && near(dimension, 65), {
        before: oldDimension,
        after: dimension,
      }),
    );
    const svg = await exportCadDrawing(cad, { format: 'drawing-svg', sheetId: sheet.id });
    const text = new TextDecoder().decode(svg.data);
    checks.push(check('Aktualisiertes Längenmaß im exportierten Blatt', />65(?:[.,]00)?(?: mm)?<\/text>/.test(text)));
  }
  if (id === 'plate-step') {
    const file = await cad.exportModel({ format: 'step', ids: [fixture.plate] });
    const imported = await cad.preview(
      { kind: 'importStep', bytes: file.data, options: { id: 'lab-step-readback' } },
      { project: { ...cad.snapshot(), nodes: [], projectParameters: createCadProjectParameters() } },
    );
    try {
      const native = imported.project.nodes.find((node) => node.id === 'lab-step-readback');
      checks.push(
        check('STEP-Import ergibt einen nativen Volumenkörper', native?.kind === 'cad' && native.stats.solids === 1),
      );
      checks.push(...(await readMeasurements(cad, imported, 'lab-step-readback', definition, 'STEP · ')));
      checks.push(
        check('Export und Importvorschau ändern den Originalkörper nicht', same(findNode(cad, fixture.plate), edited)),
      );
    } finally {
      cad.discard(imported.previewId);
    }
  }
  cad.undo();
  checks.push(check('Ein Undo stellt Projekt und Bezüge exakt wieder her', cad.serialize() === original));
  return { checks };
}

async function createSelectedBoreFixture(cad, definition) {
  const [length, , height] = definition.plate.size,
    { diameter, centers } = definition.plate;
  const { aliases } = await cad.execute({
    kind: 'batch',
    commands: [
      {
        op: 'create',
        type: 'box',
        name: 'Bohrplatte',
        size: definition.plate.size,
        pos: [length / 2, 0, height / 2],
        as: 'base',
      },
      ...centers.map((x, i) => ({
        op: 'create',
        type: 'cylinder',
        name: 'Bohrung ' + (i + 1),
        size: [diameter, diameter, 20],
        pos: [x, 0, height / 2],
        solid: false,
        as: 'hole' + i,
      })),
      { op: 'group', name: 'Bohrplatte', targets: ['$base', '$hole0', '$hole1'], as: 'plate' },
      {
        op: 'create',
        type: 'box',
        name: definition.neighbor.name,
        size: definition.neighbor.size,
        pos: definition.neighbor.pos,
        as: 'neighbor',
      },
      { op: 'transform', target: '$plate', rotate: definition.placement.rotate },
      { op: 'transform', target: '$plate', translate: definition.placement.translate, space: 'world' },
    ],
  });
  const draft = cad.snapshot();
  draft.nodes.find((node) => node.id === aliases.neighbor).locked = true;
  await cad.open(draft);
  const holes = findNode(cad, aliases.plate).children.filter((node) => node.recipe.type === 'cylinder');
  if (holes.length !== 2) throw Error('Die Probe benötigt zwei native Zylinderquellen.');
  return { plate: aliases.plate, neighbor: aliases.neighbor, holes: holes.map((node) => node.id) };
}

async function selectedBoreReference(cad, fixture, definition) {
  const selected = definition.world.bores[1],
    result = await cad.query('featureReference', {
      action: 'pick',
      kind: 'bore',
      ids: [fixture.plate],
      ray: {
        origin: [selected.from[0], selected.from[1], (selected.from[2] + selected.to[2]) / 2],
        direction: [1, 0, 0],
        far: 20,
      },
    }),
    origin = result.reference.origin?.target;
  return {
    reference: result.reference,
    secondBore:
      !!origin && origin.rootId === fixture.plate && origin.path.length === 1 && origin.path[0] === fixture.holes[1],
  };
}

function selectedBoreSpecs(fixture, definition, { selected = true } = {}) {
  const [length, width, height] = definition.plate.size,
    { diameter, selectedDiameter } = definition.plate,
    diameters = [diameter, selected ? selectedDiameter : diameter],
    rings = diameters.reduce((sum, value) => sum + (value / 2) ** 2, 0);
  return [
    { kind: 'size', target: fixture.plate, space: 'edit', expected: definition.plate.size },
    { kind: 'bounds', target: fixture.plate, edge: 'min', expected: definition.world.min },
    { kind: 'bounds', target: fixture.plate, edge: 'max', expected: definition.world.max },
    { kind: 'volume', target: fixture.plate, expected: height * (length * width - Math.PI * rings), tolerance: 0.05 },
    ...definition.world.bores.map((bore, index) => ({
      kind: 'bore',
      target: fixture.plate,
      from: bore.from,
      to: bore.to,
      diameter: diameters[index],
      minWall: 1,
    })),
    { kind: 'bounds', target: fixture.neighbor, edge: 'min', expected: definition.neighbor.min },
    { kind: 'bounds', target: fixture.neighbor, edge: 'max', expected: definition.neighbor.max },
    { kind: 'volume', target: fixture.neighbor, expected: definition.neighbor.volume, tolerance: 0.05 },
  ];
}

function editableBoreSources(project, fixture) {
  const plate = project.nodes.find((node) => node.id === fixture.plate),
    holes = plate?.children?.filter((node) => node.recipe?.type === 'cylinder') ?? [];
  return {
    plate,
    holes,
    editable:
      plate?.locked !== true &&
      holes.length === 2 &&
      holes.every((node) => node.kind === 'cad' && node.locked !== true && !!node.recipe),
  };
}

function sourceReadings(project, fixture) {
  const sources = editableBoreSources(project, fixture);
  return {
    editable: sources.editable,
    holes: sources.holes.map((node) => ({
      id: node.id,
      type: node.recipe?.type,
      diameter: node.recipe?.size?.[0],
      height: node.recipe?.size?.[2],
      locked: node.locked === true,
    })),
  };
}

function boreReadings(result, targetId) {
  return result.checks
    .filter((entry) => entry.target.rootId === targetId && entry.kind === 'bore')
    .map(({ actual }) => ({ diameter: actual?.diameter, from: actual?.from, to: actual?.to }));
}

function neighborReadings(result, fixture, neighbor, original) {
  const measured = (kind, edge) =>
    result.checks.find(
      (entry) =>
        entry.target.rootId === fixture.neighbor &&
        entry.kind === kind &&
        (edge === undefined || entry.edge === edge),
    )?.actual;
  return {
    min: measured('bounds', 'min'),
    max: measured('bounds', 'max'),
    volume: measured('volume'),
    locked: neighbor?.locked === true,
    unchanged: same(neighbor, original),
  };
}

function selectedBoreLabels(definition) {
  const [first, second] = definition.world.bores;
  return [
    'Lokales Außenmaß ' + definition.plate.size.join(' × ') + ' mm',
    'Weltbegrenzung min (' + definition.world.min.join(', ') + ')',
    'Weltbegrenzung max (' + definition.world.max.join(', ') + ')',
    'Materialvolumen Platte',
    'Bohrung 1 Ø' + first.diameter + ' bei (' + first.from.slice(0, 2).join(', ') + ')',
    'Bohrung 2 Ø' + second.diameter + ' bei (' + second.from.slice(0, 2).join(', ') + ')',
    'Nachbar Weltbegrenzung min',
    'Nachbar Weltbegrenzung max',
    'Nachbar Materialvolumen',
  ];
}

async function runSelectedBoreCheck(cad, options) {
  const definition = selectedBoreCase,
    fixture = await createSelectedBoreFixture(cad, definition),
    plateChildren = () => findNode(cad, fixture.plate).children,
    child = (id) => plateChildren().find((node) => node.id === id),
    originalHoles = fixture.holes.map((id) => structuredClone(child(id))),
    originalNeighbor = structuredClone(findNode(cad, fixture.neighbor)),
    picked = await selectedBoreReference(cad, fixture, definition),
    featureScope = { version: 1, items: [picked.reference] },
    featureContext = cadAIFeatureScopeContext(cad.snapshot(), featureScope),
    diameterField = featureContext.references[0]?.fields?.find((item) => item.field === 'diameter'),
    checks = [
      check('Zweite Bohrung über nativen Merkmalsbezug gewählt', picked.secondBore),
      check(
        'Merkmalsbezug misst die ausgewählte Bohrung Ø' + definition.plate.diameter,
        diameterField?.value === definition.plate.diameter,
        diameterField?.value,
      ),
    ];
  let scene = await cad.describe(),
    requestPrompt = null,
    answer = null;
  const access = createCadAutomationAccess({
    controller: cad,
    getScene: () => scene,
    getSelection: () => [target(fixture.plate)],
    refresh: async () => {
      scene = await cad.describe();
    },
  });
  const fixedAnswer = (request) => {
    requestPrompt = request.prompt;
    answer = {
      revision: request.scene.revision,
      commands: [
        {
          op: 'feature',
          referenceId: picked.reference.id,
          field: 'diameter',
          value: definition.plate.selectedDiameter,
        },
      ],
    };
    return answer;
  };
  const generate = options.generate
    ? async (request) => {
        requestPrompt = request.prompt;
        answer = await options.generate(request);
        return answer;
      }
    : fixedAnswer;
  const original = cad.serialize(),
    revisionBefore = cad.revision(),
    undoBefore = cad.state().undo;
  const outcome = await runCadAIRequest({
    input: { prompt: definition.prompt },
    visualReview: false,
    isCurrent: () => !options.signal?.aborted,
    maxCorrections: 0,
    access: {
      ...access,
      context: (request) => ({ ...access.context(request), featureScope: featureContext }),
      restrictedFeatures: true,
      preview: (request, settings) => access.preview(request, { ...settings, featureScope }),
    },
    generate,
  });
  options.signal?.throwIfAborted();
  checks.push(
    check('Auftrag entspricht dem Testfall', requestPrompt === definition.prompt, requestPrompt),
    check('Vorschau lässt bestätigtes Modell unverändert', cad.serialize() === original),
  );
  if (!options.generate)
    checks.push(
      check(
        'Feste Modellantwort ändert nur den gewählten Bezug',
        same(answer?.commands, [
          {
            op: 'feature',
            referenceId: picked.reference.id,
            field: 'diameter',
            value: definition.plate.selectedDiameter,
          },
        ]),
        answer?.commands,
      ),
    );
  const proposal = outcome.proposal;
  if (!proposal) return { checks: [...checks, check('CAD-Vorschau erstellt', false)] };
  const specs = selectedBoreSpecs(fixture, definition),
    labels = selectedBoreLabels(definition),
    previewResult = await cad.checkPreview(proposal.previewId, specs, { collectFailures: true });
  checks.push(...previewResult.checks.map((result, i) => check(labels[i], result.passed ?? true, result.actual)));
  options.signal?.throwIfAborted();
  await access.apply({ previewId: proposal.previewId, revision: proposal.revision, acceptFeatureDependencies: true });
  options.signal?.throwIfAborted();
  const afterEdit = cad.serialize(),
    revisionAfterEdit = cad.revision();
  const applied = await cad.query('aiResultChecks', { checks: specs, aliases: {} }).catch((error) => {
    // A live model answer can miss; keep the measured mismatch visible as a
    // failed check instead of turning the whole lab case into an execution error.
    if (!/^AI_(RESULT_MISMATCH|CHECK_)/.test(error.code ?? '')) throw error;
    checks.push(
      check(
        'Bestätigtes Modell entspricht den Sollwerten',
        false,
        error.feedback?.actual === undefined
          ? error.message
          : { checkIndex: error.feedback.checkIndex, actual: error.feedback.actual },
      ),
    );
    return null;
  });
  if (!applied) return { checks, input: { prompt: definition.prompt } };
  const measured = (targetId, kind, edge) =>
      applied.checks.find(
        (result) =>
          result.target.rootId === targetId && result.kind === kind && (edge === undefined || result.edge === edge),
      ),
    measuredBores = applied.checks.filter((result) => result.target.rootId === fixture.plate && result.kind === 'bore'),
    distance = (actual, face) => Number(Math.abs(actual - face).toFixed(6)),
    faceDistances = [
      distance(measuredBores[0]?.actual?.from?.[1], measured(fixture.plate, 'bounds', 'min')?.actual?.[1]),
      distance(measured(fixture.plate, 'bounds', 'max')?.actual?.[1], measuredBores[1]?.actual?.from?.[1]),
    ];
  checks.push(
    check(
      'Erste Bohrung hält ' + definition.faceDistance + ' mm zur Stirnseite',
      near(faceDistances[0], definition.faceDistance),
      faceDistances[0],
    ),
    check(
      'Zweite Bohrung hält ' + definition.faceDistance + ' mm zur Stirnseite',
      near(faceDistances[1], definition.faceDistance),
      faceDistances[1],
    ),
    check('Erste Bohrungsquelle unverändert', same(child(fixture.holes[0]), originalHoles[0])),
    check(
      'Gewählte Bohrungsquelle Ø' + definition.plate.selectedDiameter + ' auf unveränderter Achse',
      same(child(fixture.holes[1])?.recipe?.size, [
        definition.plate.selectedDiameter,
        definition.plate.selectedDiameter,
        20,
      ]) && same(child(fixture.holes[1])?.transform, originalHoles[1].transform),
    ),
    check(
      'Nachbarteil gesperrt und unverändert in Geometrie und Lage',
      originalNeighbor.locked === true && same(findNode(cad, fixture.neighbor), originalNeighbor),
    ),
    check('Nachbarteil bleibt gesperrt', findNode(cad, fixture.neighbor).locked === true),
  );
  checks.push(
    ...applied.checks.map((result, i) => check('Bestätigt · ' + labels[i], result.passed ?? true, result.actual)),
  );
  // 03 · Save the accepted change as a project copy, reopen it in a fresh
  // working state, and then undo the change in the original session. The file
  // access stays with the caller so this lab module remains browser-safe.
  let copy = null;
  if (options.reopenProject) {
    let reopened = null;
    try {
      const saved = await options.reopenProject(afterEdit);
      reopened = saved.controller;
      const reopenedProject = reopened.snapshot(),
        reopenedMeasured = await reopened.query('aiResultChecks', { checks: specs, aliases: {} }),
        reopenedSources = sourceReadings(reopenedProject, fixture),
        reopenedBores = boreReadings(reopenedMeasured, fixture.plate),
        reopenedNeighbor = reopenedProject.nodes.find((node) => node.id === fixture.neighbor);
      checks.push(
        check(
          'Gespeicherte Kopie enthält zwei bearbeitbare Bohrungsquellen',
          reopenedSources.editable,
          reopenedSources.holes,
        ),
        check(
          'Wieder geöffnete Kopie misst Ø' + definition.plate.diameter + ' an der ersten Achse',
          reopenedBores[0]?.diameter === definition.plate.diameter &&
            same(reopenedBores[0]?.from, definition.world.bores[0].from) &&
            same(reopenedBores[0]?.to, definition.world.bores[0].to),
          reopenedBores[0],
        ),
        check(
          'Wieder geöffnete Kopie misst Ø' + definition.plate.selectedDiameter + ' an der zweiten Achse',
          reopenedBores[1]?.diameter === definition.plate.selectedDiameter &&
            same(reopenedBores[1]?.from, definition.world.bores[1].from) &&
            same(reopenedBores[1]?.to, definition.world.bores[1].to),
          reopenedBores[1],
        ),
        check(
          'Wieder geöffnete Kopie erhält Lage und Sperre des Nachbarn',
          reopenedNeighbor?.locked === true && same(reopenedNeighbor, originalNeighbor),
          { locked: reopenedNeighbor?.locked === true, unchanged: same(reopenedNeighbor, originalNeighbor) },
        ),
      );
      copy = {
        path: saved.path ?? null,
        sources: reopenedSources,
        bores: reopenedBores,
        neighbor: neighborReadings(reopenedMeasured, fixture, reopenedNeighbor, originalNeighbor),
      };
    } catch (error) {
      checks.push(check('Gespeicherte Kopie wieder geöffnet', false, error.message));
    } finally {
      reopened?.dispose();
    }
  }
  await showLabProject(options, cad, { role: 'result' });
  cad.undo();
  const afterUndo = cad.serialize(),
    revisionAfterUndo = cad.revision(),
    undoAfter = cad.state().undo,
    restoredProject = cad.snapshot(),
    restoredSources = sourceReadings(restoredProject, fixture),
    restoredNeighbor = restoredProject.nodes.find((node) => node.id === fixture.neighbor),
    restoredMeasured = await cad
      .query('aiResultChecks', { checks: selectedBoreSpecs(fixture, definition, { selected: false }), aliases: {} })
      .catch((error) => {
        if (!/^AI_(RESULT_MISMATCH|CHECK_)/.test(error.code ?? '')) throw error;
        return { checks: [] };
      }),
    restoredBores = boreReadings(restoredMeasured, fixture.plate);
  checks.push(
    check(
      'Ein Undo stellt Zustand und Revision vor der Änderung wieder her',
      afterUndo === original && revisionAfterUndo === revisionBefore && undoAfter === undoBefore,
      { revisionBefore, revisionAfterUndo, undoBefore, undoAfter },
    ),
    check(
      'Ein Undo stellt zwei Ø' + definition.plate.diameter + '-Bohrungen an unveränderten Achsen wieder her',
      restoredSources.editable &&
        restoredBores.length === 2 &&
        restoredBores.every(
          (bore, index) =>
            bore.diameter === definition.plate.diameter &&
            same(bore.from, definition.world.bores[index].from) &&
            same(bore.to, definition.world.bores[index].to),
        ),
      restoredBores,
    ),
    check(
      'Ein Undo erhält den gesperrten Nachbarn',
      restoredNeighbor?.locked === true && same(restoredNeighbor, originalNeighbor),
      { locked: restoredNeighbor?.locked === true, unchanged: same(restoredNeighbor, originalNeighbor) },
    ),
  );
  return {
    checks,
    input: { prompt: definition.prompt },
    evidence: {
      prompt: requestPrompt,
      selectedBore: picked.secondBore,
      selectedReferenceId: picked.reference.id,
      answerCommands: answer?.commands,
      localSize: measured(fixture.plate, 'size')?.actual,
      localBoreCenters: fixture.holes.map((id) => [child(id).transform[12], child(id).transform[13]]),
      worldMin: measured(fixture.plate, 'bounds', 'min')?.actual,
      worldMax: measured(fixture.plate, 'bounds', 'max')?.actual,
      bores: measuredBores.map((result) => ({
        diameter: result.actual?.diameter,
        from: result.actual?.from,
        to: result.actual?.to,
      })),
      faceDistances,
      neighbor: {
        min: measured(fixture.neighbor, 'bounds', 'min')?.actual,
        max: measured(fixture.neighbor, 'bounds', 'max')?.actual,
        volume: measured(fixture.neighbor, 'volume')?.actual,
        locked: findNode(cad, fixture.neighbor).locked === true,
        unchanged: same(findNode(cad, fixture.neighbor), originalNeighbor),
      },
      revisionAfterEdit,
      copy,
      undo: {
        projectBefore: original,
        afterUndo,
        exact: afterUndo === original,
        revisionBefore,
        revisionAfterUndo,
        undoBefore,
        undoAfter,
        sources: restoredSources,
        bores: restoredBores,
        neighbor: neighborReadings(restoredMeasured, fixture, restoredNeighbor, originalNeighbor),
      },
    },
  };
}

async function selectedBoreAccess(cad, fixture) {
  let scene = await cad.describe();
  return createCadAutomationAccess({
    controller: cad,
    getScene: () => scene,
    getSelection: () => [target(fixture.plate)],
    refresh: async () => {
      scene = await cad.describe();
    },
  });
}

async function selectedBoreOtherReference(cad, fixture, definition) {
  const first = definition.world.bores[0],
    result = await cad.query('featureReference', {
      action: 'pick',
      kind: 'bore',
      ids: [fixture.plate],
      ray: {
        origin: [first.from[0], first.from[1], (first.from[2] + first.to[2]) / 2],
        direction: [1, 0, 0],
        far: 20,
      },
    });
  return result.reference;
}

async function runSelectedBoreWrongTargetCheck(cad, options) {
  const definition = selectedBoreCase,
    fixture = await createSelectedBoreFixture(cad, definition),
    picked = await selectedBoreReference(cad, fixture, definition),
    other = await selectedBoreOtherReference(cad, fixture, definition),
    originalNeighbor = structuredClone(findNode(cad, fixture.neighbor)),
    original = cad.serialize(),
    revision = cad.revision(),
    undo = cad.state().undo,
    featureScope = { version: 1, items: [picked.reference] },
    featureContext = cadAIFeatureScopeContext(cad.snapshot(), featureScope),
    access = await selectedBoreAccess(cad, fixture);
  let requestPrompt = null,
    answer = null,
    rejection = null;
  try {
    await runCadAIRequest({
      input: { prompt: definition.prompt },
      visualReview: false,
      isCurrent: () => !options.signal?.aborted,
      maxCorrections: 0,
      access: {
        ...access,
        context: (request) => ({ ...access.context(request), featureScope: featureContext }),
        restrictedFeatures: true,
        preview: (request, settings) => access.preview(request, { ...settings, featureScope }),
      },
      generate: async (request) => {
        requestPrompt = request.prompt;
        answer = {
          revision: request.scene.revision,
          commands: [
            {
              op: 'feature',
              referenceId: other.id,
              field: 'diameter',
              value: definition.plate.selectedDiameter,
            },
          ],
        };
        return answer;
      },
    });
  } catch (error) {
    rejection = { code: error.code ?? error.message, message: error.message };
  }
  options.signal?.throwIfAborted();
  const afterReject = cad.serialize(),
    afterRevision = cad.revision(),
    afterUndo = cad.state().undo;
  // The controlled answer is rejected by the attached feature scope. As an
  // independent second guard, a deliberately wrong unrestricted preview shows
  // that the native bore checks would see Ø8 at the old axis and Ø6 at the new
  // one. That preview is discarded and never applied.
  const probe = await cad.preview({
    kind: 'featureEdits',
    references: { version: 1, items: [other] },
    edits: [
      {
        referenceId: other.id,
        field: 'diameter',
        value: definition.plate.selectedDiameter,
      },
    ],
  });
  const boreLabels = selectedBoreLabels(definition).filter((label) => label.startsWith('Bohrung ')),
    boreSpecs = selectedBoreSpecs(fixture, definition).filter((spec) => spec.kind === 'bore'),
    probeResult = await cad.checkPreview(probe.previewId, boreSpecs, { collectFailures: true }),
    independentCheck = probeResult.checks.map((result, index) => ({
      label: boreLabels[index] ?? 'Bohrung ' + (index + 1),
      passed: result.passed ?? true,
      actual: result.actual,
    }));
  cad.discard(probe.previewId);
  options.signal?.throwIfAborted();
  const afterDiscard = cad.serialize(),
    neighborAfter = findNode(cad, fixture.neighbor);
  const checks = [
    check(
      'Andere Bohrung ist ein eigener, nicht angehängter Merkmalsbezug',
      other.id !== picked.reference.id && other.origin?.target?.path?.[0] === fixture.holes[0],
      { id: other.id, origin: other.origin },
    ),
    check(
      'Kontrollierte Antwort zielt auf die andere Bohrung',
      answer?.commands?.length === 1 && answer.commands[0].referenceId === other.id,
      answer?.commands,
    ),
    check('Merkmalsbezug weist die Änderung zurück', rejection?.code === 'AI_FEATURE_REFERENCE_REQUIRED', rejection),
    check(
      'Fehlerhafte Antwort wird nicht übernommen',
      afterReject === original && afterRevision === revision && afterUndo === undo,
    ),
    check(
      'Unabhängige Prüfung erkennt Ø' +
        definition.plate.selectedDiameter +
        ' an der falschen Achse',
      independentCheck[0]?.passed === false &&
        independentCheck[0]?.actual?.diameter === definition.plate.selectedDiameter,
      independentCheck[0],
    ),
    check(
      'Unabhängige Prüfung erkennt Ø' + definition.plate.diameter + ' an der erwarteten Achse',
      independentCheck[1]?.passed === false && independentCheck[1]?.actual?.diameter === definition.plate.diameter,
      independentCheck[1],
    ),
    check('Fehlerhafte Vorschau wird verworfen', afterDiscard === original),
    check(
      'Gesperrter Nachbar bleibt erhalten',
      neighborAfter.locked === true && same(neighborAfter, originalNeighbor),
    ),
  ];
  return {
    checks,
    input: { prompt: definition.prompt },
    evidence: {
      prompt: requestPrompt,
      answerCommands: answer?.commands,
      attachedReferenceId: picked.reference.id,
      otherReferenceId: other.id,
      otherBoreSource: other.origin?.target,
      detectedBy: 'previewCadAIFeatureCommands: referenceId außerhalb des angehängten featureScope',
      rejection,
      project: {
        before: original,
        afterReject,
        afterDiscard,
        revisionBefore: revision,
        revisionAfterReject: afterRevision,
        undoBefore: undo,
        undoAfterReject: afterUndo,
      },
      independentCheck,
      neighbor: {
        locked: neighborAfter.locked === true,
        unchanged: same(neighborAfter, originalNeighbor),
        before: originalNeighbor,
        after: neighborAfter,
      },
    },
  };
}

async function runSelectedBoreStalePreviewCheck(cad, options) {
  const definition = selectedBoreCase,
    fixture = await createSelectedBoreFixture(cad, definition),
    picked = await selectedBoreReference(cad, fixture, definition),
    originalNeighbor = structuredClone(findNode(cad, fixture.neighbor)),
    original = cad.serialize(),
    featureScope = { version: 1, items: [picked.reference] },
    featureContext = cadAIFeatureScopeContext(cad.snapshot(), featureScope),
    access = await selectedBoreAccess(cad, fixture);
  let requestPrompt = null;
  const outcome = await runCadAIRequest({
    input: { prompt: definition.prompt },
    visualReview: false,
    isCurrent: () => !options.signal?.aborted,
    maxCorrections: 0,
    access: {
      ...access,
      context: (request) => ({ ...access.context(request), featureScope: featureContext }),
      restrictedFeatures: true,
      preview: (request, settings) => access.preview(request, { ...settings, featureScope }),
    },
    generate: async (request) => {
      requestPrompt = request.prompt;
      return {
        revision: request.scene.revision,
        commands: [
          {
            op: 'feature',
            referenceId: picked.reference.id,
            field: 'diameter',
            value: definition.plate.selectedDiameter,
          },
        ],
      };
    },
  });
  options.signal?.throwIfAborted();
  const proposal = outcome.proposal,
    previewId = proposal?.previewId ?? null,
    previewRevision = proposal?.revision ?? null,
    previewUnchanged = cad.serialize() === original,
    revisionBefore = cad.revision();
  if (!proposal)
    return {
      checks: [check('Gültige Vorschau für die ausgewählte Bohrung erzeugt', false, outcome)],
      input: { prompt: definition.prompt },
    };
  // A small permitted edit moves the plate by 3 mm and therefore advances the
  // project revision. The old preview must no longer be applicable.
  await cad.execute({
    kind: 'batch',
    commands: [{ op: 'transform', target: fixture.plate, translate: [3, 0, 0] }],
  });
  options.signal?.throwIfAborted();
  const afterChange = cad.serialize(),
    revisionAfterChange = cad.revision(),
    undoAfterChange = cad.state().undo;
  let rejection = null;
  try {
    await access.apply({
      revision: proposal.revision,
      previewId: proposal.previewId,
      acceptFeatureDependencies: true,
    });
  } catch (error) {
    rejection = { code: error.code ?? error.message, message: error.message };
  }
  options.signal?.throwIfAborted();
  const afterReject = cad.serialize(),
    revisionAfterReject = cad.revision(),
    undoAfterReject = cad.state().undo,
    neighborAfter = findNode(cad, fixture.neighbor);
  const checks = [
    check(
      'Gültige Vorschau für die ausgewählte Bohrung erzeugt',
      !!previewId && previewUnchanged && previewRevision === revisionBefore,
      { previewId, previewRevision, revisionBefore },
    ),
    check(
      'Kleine erlaubte Teständerung erhöht die Revision',
      revisionAfterChange !== revisionBefore && afterChange !== original,
      { revisionBefore, revisionAfterChange },
    ),
    check('Revisionsbindung lehnt die alte Vorschau ab', rejection?.code === 'STALE_REVISION', rejection),
    check(
      'Projekt bleibt im Zustand nach der Teständerung',
      afterReject === afterChange && revisionAfterReject === revisionAfterChange,
    ),
    check('Undo-Verlauf bleibt unverändert', undoAfterReject === undoAfterChange),
    check(
      'Gesperrter Nachbar bleibt erhalten',
      neighborAfter.locked === true && same(neighborAfter, originalNeighbor),
    ),
  ];
  return {
    checks,
    input: { prompt: definition.prompt },
    evidence: {
      prompt: requestPrompt,
      preview: { previewId, previewRevision, revisionBefore },
      smallChange: {
        command: { op: 'transform', target: fixture.plate, translate: [3, 0, 0] },
        revisionBefore,
        revisionAfter: revisionAfterChange,
      },
      detectedBy: 'controller.apply → cad-transactions.store.apply: checkRevision erkennt die geänderte Revision',
      rejection,
      project: {
        before: original,
        afterPreview: original,
        afterChange,
        afterReject,
        revisionBefore,
        revisionAfterChange,
        revisionAfterReject,
        undoAfterChange,
        undoAfterReject,
      },
      neighbor: {
        locked: neighborAfter.locked === true,
        unchanged: same(neighborAfter, originalNeighbor),
        before: originalNeighbor,
        after: neighborAfter,
      },
    },
  };
}

async function runSelectedBoreCounterCheck(cad, kind, options) {
  if (kind === 'wrong-target') return runSelectedBoreWrongTargetCheck(cad, options);
  if (kind === 'stale-preview') return runSelectedBoreStalePreviewCheck(cad, options);
  throw Error('Unbekannte Gegenprobe für den ausgewählten Bohrungsfall.');
}

async function stalePreviewCheck(cad, options) {
  const definition = plateCases['plate-diameter'];
  const fixture = await createPlate(cad, definition);
  await showLabProject(options, cad, { role: 'start' });
  const scene = await cad.describe();
  const access = createCadAutomationAccess({ controller: cad, getScene: () => scene });
  const reference = await cadBoreReference(cad, fixture.plate, definition.centers[0]);
  const preview = await access.preview(
    {
      revision: cad.revision(),
      commands: draftCommands([reference], [[0, 'diameter', 8]]),
    },
    { featureScope: { version: 1, items: [reference] } },
  );
  const original = cad.serialize();
  const oldRevision = cad.revision();
  await cad.execute({ kind: 'batch', commands: [{ op: 'transform', target: fixture.plate, translate: [3, 0, 0] }] });
  const newer = cad.serialize();
  const undo = cad.state().undo;
  let code;
  try {
    await access.apply({ revision: preview.revision, previewId: preview.previewId, acceptFeatureDependencies: true });
  } catch (error) {
    code = error.code ?? error.message;
  }
  let reboundCode;
  try {
    await access.apply({ revision: cad.revision(), previewId: preview.previewId, acceptFeatureDependencies: true });
  } catch (error) {
    reboundCode = error.code ?? error.message;
  }
  const unchanged = cad.serialize() === newer && cad.state().undo === undo;
  const rejected = check(
    'Alte Vorschau nach Projektänderung abgelehnt',
    cad.revision() !== oldRevision && code === 'STALE_REVISION',
    code,
  );
  cad.undo();
  return {
    checks: [
      rejected,
      check(
        'Die aktuelle Revision reaktiviert den alten Vorschauvorschlag nicht',
        !!reboundCode && unchanged,
        reboundCode,
      ),
      check('Neuere Änderung und Undo bleiben erhalten', unchanged),
      check('Undo entfernt ausschließlich die neuere Änderung', cad.serialize() === original),
    ],
  };
}

async function assemblyStopCheck(cad, options) {
  const { signal } = options;
  const { aliases } = await cad.execute({
    kind: 'batch',
    commands: [
      { op: 'create', type: 'box', name: 'Gehäuse', size: [20, 20, 10], as: 'housing' },
      { op: 'create', type: 'box', name: 'Deckel', size: [20, 20, 2], pos: [10, 0, 10], as: 'lid' },
    ],
  });
  const housing = findNode(cad, aliases.housing);
  const hinge = {
    id: 'lid-hinge',
    kind: 'revolute',
    parentId: aliases.housing,
    childId: aliases.lid,
    origin: [0, 0, 10],
    axis: [0, 1, 0],
  };
  cad.apply(await cad.previewJoints({ action: 'create', joint: hinge }, { signal }));
  cad.apply(await cad.previewJoints({ action: 'limits', jointId: hinge.id, limits: { min: 0, max: 45 } }, { signal }));
  const boundary = cad.revision();
  const stopped = cad.serialize();
  const proposal = await cad.previewJoints({ action: 'move', values: [{ jointId: hinge.id, value: 45 }] }, { signal });
  cad.apply(proposal);
  await showLabProject(options, cad, { role: 'result' });
  const lid = findNode(cad, aliases.lid);
  const draft = cad.serialize();
  const undo = cad.state().undo;
  const angle = (Math.atan2(-lid.transform[2], lid.transform[0]) * 180) / Math.PI;
  const hingePosition = [0, 1, 2].map((axis) => lid.transform[12 + axis] - 10 * lid.transform[axis]);
  let code;
  try {
    const overrun = await cad.previewJoints({ action: 'move', values: [{ jointId: hinge.id, value: 46 }] }, { signal });
    cad.discard(overrun.previewId);
  } catch (error) {
    code = error.code ?? error.message;
  }
  const checks = [
    check('Deckel erreicht 45°', near(angle, 45), angle),
    check(
      'Gelenkpunkt bleibt bei (0, 0, 10)',
      hingePosition.every((v, i) => near(v, hinge.origin[i])),
      hingePosition,
    ),
    check('Gehäuse bleibt unverändert', same(findNode(cad, aliases.housing), housing)),
    check(
      '46° abgelehnt und letzter gültiger Stand erhalten',
      code === 'JOINT_LIMIT' && cad.serialize() === draft && cad.state().undo === undo,
      code,
    ),
  ];
  cad.undo();
  checks.push(
    check('Undo stellt den Stand vor der Bewegung her', cad.serialize() === stopped && cad.revision() === boundary),
  );
  return { checks };
}

export async function runCadDevelopmentCheck(id, options) {
  const plate = plateCases[id];
  if (plate) {
    options.showReference?.({ size: [plate.finalSize, 30, 10], from: [-20, -15, 0],
      bores: plate.finalCenters.map(x => ({ from: [x, 0, 0], to: [x, 0, 10], diameter: plate.finalDiameter })) });
  } else if (id === 'plate-selected-bore') {
    const { plate, world } = selectedBoreCase;
    const size = plate.size;
    options.showReference?.({ size, from: [0, 0, 0],
      bores: plate.centers.map((x, index) => ({ from: [x, size[1] / 2, 0], to: [x, size[1] / 2, size[2]],
        diameter: world.bores[index].diameter })) });
  }
  options.signal?.throwIfAborted();
  const cad = options.createController();
  const abort = () => cad.cancel();
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    let result;
    if (id === 'stale-preview') result = await stalePreviewCheck(cad, options);
    else if (id === 'plate-selected-bore')
      result = options.counterCheck
        ? await runSelectedBoreCounterCheck(cad, options.counterCheck, options)
        : await runSelectedBoreCheck(cad, options);
    else if (id === 'assembly-stop') result = await assemblyStopCheck(cad, options);
    else if (Object.hasOwn(plateCases, id)) result = await runPlateCheck(cad, id, options);
    else throw Error('Unbekannter CAD-Entwicklungscheck.');
    options.signal?.throwIfAborted();
    return result;
  } finally {
    options.signal?.removeEventListener('abort', abort);
    cad.dispose();
  }
}
