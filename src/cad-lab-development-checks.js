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
    maxCorrections: 0,
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
  const original = cad.serialize();
  const originalNeighbor = findNode(cad, fixture.neighbor);
  const proposal = (await requestPlateEdit(cad, fixture, id, options, definition)).proposal;
  const checks = [check('Vorschau lässt bestätigtes Modell unverändert', cad.serialize() === original)];
  if (!proposal) return { checks: [...checks, check('CAD-Vorschau erstellt', false)] };
  options.signal?.throwIfAborted();
  checks.push(...(await readMeasurements(cad, proposal, fixture.plate, definition)));
  cad.apply({ ...proposal, acceptFeatureDependencies: true });
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

async function stalePreviewCheck(cad) {
  const definition = plateCases['plate-diameter'];
  const fixture = await createPlate(cad, definition);
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

async function assemblyStopCheck(cad, signal) {
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
  options.signal?.throwIfAborted();
  const cad = options.createController();
  const abort = () => cad.cancel();
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    let result;
    if (id === 'stale-preview') result = await stalePreviewCheck(cad);
    else if (id === 'assembly-stop') result = await assemblyStopCheck(cad, options.signal);
    else if (Object.hasOwn(plateCases, id)) result = await runPlateCheck(cad, id, options);
    else throw Error('Unbekannter CAD-Entwicklungscheck.');
    options.signal?.throwIfAborted();
    return result;
  } finally {
    options.signal?.removeEventListener('abort', abort);
    cad.dispose();
  }
}
