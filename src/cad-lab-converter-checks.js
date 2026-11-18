import { createConverterAI, converterAIScene, validateConverterAIProposal } from './cad-converter-ai.js';
import { createConverterAutopilot } from './cad-converter-autopilot.js';
import { createCadConverterImport } from './cad-converter-import.js';
import { createLocalStlAnalysis, createLocalStlConversion } from './cad-stl-converter.js';
import { cadIdentity } from './cad-affine.js';

const fixtures = {
  'stl-bores': [
    'platte-mit-bohrungen.stl',
    new URL('../converter/examples/platte-mit-bohrungen.stl?no-inline', import.meta.url),
  ],
  'stl-countersinks': [
    'platte-mit-zwei-senkungen.stl',
    new URL('../converter/examples/platte-mit-zwei-senkungen.stl?no-inline', import.meta.url),
  ],
  'stl-rim': [
    'gehaeuse-mit-randfase.stl',
    new URL('../converter/examples/gehaeuse-mit-randfase.stl?no-inline', import.meta.url),
  ],
  'stl-cone': [
    'konische-profilbohrung.stl',
    new URL('../converter/examples/konische-profilbohrung.stl?no-inline', import.meta.url),
  ],
  'stl-freeform': [
    'freiform-sinusoidal.stl',
    new URL('../converter/examples/freiform-sinusoidal.stl?no-inline', import.meta.url),
  ],
};
const options = { unit: 1, tolerance: 0.15, mode: 'auto' };
const recordedConverterSettings = { model: 'lokale-testantwort' };
const near = (value, expected, tolerance = 0.02) => Number.isFinite(value) && Math.abs(value - expected) <= tolerance;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const sorted = (ids) => [...ids].sort((a, b) => a - b);

async function withCancel(cancel, signal, run) {
  signal?.throwIfAborted();
  const stop = () => void Promise.resolve(cancel()).catch(() => {});
  signal?.addEventListener('abort', stop, { once: true });
  try {
    const result = await run();
    signal?.throwIfAborted();
    return result;
  } finally {
    signal?.removeEventListener('abort', stop);
  }
}

async function checkMarkedBores({ analyse, convert, desktop, generate, signal, add }) {
  let analysis = await analyse().run();
  const cylinders = analysis.regions.filter((region) => region.type === 'CYLINDER');
  const selection = cylinders.map((region) => region.edit_id);
  add('Zwei zylindrische Durchgangsflächen erkannt', cylinders.length === 2, selection);
  if (cylinders.length !== 2) return convert().run();
  const before = analysis;
  const expectedProtection = sorted(cylinders.flatMap((region) => region.faces));
  const previousState = structuredClone(analysis.state);
  const snapshot = () => ({ analysis, options, selection, revision: analysis === before ? 'original' : 'accepted' });
  const ai = createConverterAI({
    desktop: {
      getAISettings: generate ? () => desktop.getAISettings() : async () => recordedConverterSettings,
      generateAI:
        generate ??
        (async ({ scene }) => ({
          revision: scene.revision,
          label: 'Bohrungsflächen schützen',
          commands: [{ op: 'protect', regions: scene.selection, enabled: true }],
        })),
      cancelAI: (request) => desktop.cancelAI?.(request) ?? Promise.resolve(false),
    },
    snapshot,
    prepare: (commands) => analyse(analysis.state, commands),
    commit: (candidate) => {
      analysis = candidate;
    },
    show: () => {},
    clear: () => {},
  });
  try {
    await withCancel(ai.cancel, signal, () => ai.request('Schütze die ausgewählten Bohrungsflächen.'));
    add(
      'Die Flächenvorschau ändert keine bestätigte Korrektur',
      ai.state().pending && same(analysis.state, previousState),
    );
    if (!ai.state().pending) return convert().run();
    ai.apply();
    const protection = sorted(analysis.state.protected_faces);
    add('Übernehmen schützt genau die markierten Dreiecke', same(protection, expectedProtection), protection.length);
    const result = await convert(analysis.state).run();
    analysis = await analyse(previousState).run();
    add('Voriger Flächenzustand lässt sich wiederherstellen', same(analysis.state, previousState));
    return result;
  } finally {
    ai.dispose();
  }
}

async function checkProtectedCone({ analyse, convert, add }) {
  const baseline = await analyse().run();
  // In this sample the analytic cone spans four detected fit regions before
  // conversion. Group them by shape class while preserving the four corners.
  const selection = baseline.regions.filter((region) => region.type === 'GRAPH').map((region) => region.edit_id);
  add('Segmente der konischen Bohrung getrennt erkannt', selection.length === 4, selection);
  if (selection.length !== 4) return convert().run();
  const analysis = await analyse(baseline.state, [{ op: 'protect', regions: selection, enabled: true }]).run();
  const scene = converterAIScene({ analysis, options, selection, revision: 'cone-protected' });
  const proposal = {
    revision: scene.revision,
    commands: [{ op: 'merge', regions: selection.slice(0, 2) }],
  };
  let refused = false;
  try {
    validateConverterAIProposal(proposal, scene);
  } catch (error) {
    refused = /Geschützte Bereiche/.test(error.message);
  }
  const expected = sorted(
    baseline.regions.filter((region) => selection.includes(region.edit_id)).flatMap((region) => region.faces),
  );
  add(
    'Geschützte Konusflächen bleiben beim Zusammenführen tabu',
    refused && same(sorted(analysis.state.protected_faces), expected),
  );
  return convert().run();
}

async function checkFreeform({ analyse, convert, desktop, generate, signal, add }) {
  const baseline = await convert().run();
  const analysis = await analyse().run();
  const selection = analysis.regions.filter((region) => region.type === 'GRAPH').map((region) => region.edit_id);
  add('Zusammenhängende Freiformfläche erkannt', selection.length === 1, selection);
  if (selection.length !== 1) return baseline;
  let answered = false,
    providerFailure;
  const generateLive =
    generate &&
    (async (request) => {
      try {
        const reply = await generate(request);
        answered = true;
        return reply;
      } catch (error) {
        providerFailure = error;
        throw error;
      }
    });
  const autopilot = createConverterAutopilot({
    desktop: {
      getAISettings: generate ? () => desktop.getAISettings() : async () => recordedConverterSettings,
      generateAI:
        generateLive ??
        (async ({ scene }) => ({
          revision: scene.revision,
          label: 'Freiformflächenvorschlag prüfen',
          commands: [{ op: 'type', type: 'GRAPH', regions: scene.targets }],
        })),
      cancelAI: (request) => desktop.cancelAI?.(request) ?? Promise.resolve(false),
    },
    snapshot: () => ({ analysis, options, selection, revision: 'freeform' }),
    analyse: (_settings, edits, commands) => analyse(edits, commands),
    convert: (settings) => convert(settings.region_edits),
  });
  const { result, outcome } = await withCancel(autopilot.cancel, signal, () => autopilot.run({ baseline }));
  if (generate) {
    if (!answered && providerFailure) throw providerFailure;
    add('Live-Pr�fung des Freiformvorschlags beantwortet', answered);
  }
  const before = baseline.report.deviation?.sampled_max_mm;
  const after = result.report.deviation?.sampled_max_mm;
  const sameShapeCount = result.report.solids === baseline.report.solids;
  const betterOrKept =
    sameShapeCount && after <= before + 1e-8 && result.report.output_faces <= baseline.report.output_faces;
  add('Gemessene STEP-Qualität beim Freiformvorschlag erhalten oder verbessert', betterOrKept, {
    outcome,
    beforeMM: before,
    afterMM: after,
    facesBefore: baseline.report.output_faces,
    facesAfter: result.report.output_faces,
  });
  add(
    'Freiformdach als gekrümmte Fläche erhalten',
    result.report.bodies.some((body) => body.details?.graph_patches >= 1),
  );
  return result;
}

async function measureImported(id, controller, body, result, signal, add) {
  const pick = (kind, origin, direction) =>
    controller.query(kind, { ids: [body.id], ray: { origin, direction } }, { signal });
  const above = (x, y) => pick('rayPick', [x, y, 12], [0, 0, -1]);
  const countersinks = id === 'stl-countersinks';
  if (id === 'stl-bores' || countersinks) {
    const diameter = countersinks ? 4 : 6;
    for (const x of countersinks ? [-7, 7] : [-10, 10]) {
      const mouth = await above(x, 0);
      const wall = await pick('clickSurface', [x, 0, countersinks ? 2 : -0.421], [0, 1, 0]);
      // Protecting individual STL triangles intentionally retains their polygonal walls.
      // Sample the physical hole in the confirmed native STEP body in that case.
      const measured = countersinks ? wall?.surface?.diameter : 2 * wall?.point?.[1];
      add(
        (countersinks ? 'Analytische' : 'Gemessene') + ' Durchgangsbohrung �' + diameter + ' bei X=' + x,
        mouth === null && near(measured, diameter),
        {
          diameterMM: Number.isFinite(measured) ? measured : null,
          wallType: wall?.surface?.kind ?? null,
        },
      );
    }
  }
  if (id === 'stl-rim') {
    const floor = await above(0, 0);
    const wall = await pick('rayPick', [0, 0, 5], [1, 0, 0]);
    const bevel = await above(14.6, 0);
    add(
      'Offene Gehäuseoberseite, Boden und Innenwand erhalten',
      near(floor?.point?.[2], 2) && near(wall?.point?.[0], 12),
      { floorZ: floor?.point?.[2] ?? null, wallX: wall?.point?.[0] ?? null },
    );
    add(
      'Native Randfase hat den erwarteten schrägen Querschnitt',
      near(bevel?.point?.[2], 7.6) && near(Math.abs(bevel?.normal?.[0]), Math.SQRT1_2),
      bevel?.point ?? null,
    );
  }
  if (countersinks || id === 'stl-cone') {
    const step = new TextDecoder().decode(result.bytes);
    const cones = (step.match(/=\s*CONICAL_SURFACE\s*\(/g) ?? []).length;
    add('Konische Flächen im importierten STEP enthalten', cones === (countersinks ? 2 : 1), cones);
  }
  if (id === 'stl-cone') {
    const opening = await above(0, 0);
    const radial = async (z) => {
      const hit = await pick('rayPick', [0, 0, z], [0.6, 0.8, 0]);
      return hit ? Math.hypot(...hit.point.slice(0, 2)) : null;
    };
    const bottom = await radial(0.1);
    const top = await radial(5.9);
    add(
      'Offener Konus mit korrekten Radien an beiden Enden',
      opening === null && near(bottom, 3.3433) && near(top, 2.9567),
      [bottom, top],
    );
  }
  if (id === 'stl-freeform') {
    const heights = [];
    const y = 0.31;
    for (const x of [-2, 2]) {
      const hit = await above(x, y);
      const expected = 4 + 0.4 * Math.sin(0.35 * x) * Math.cos(0.3 * y) + 0.01 * x * y;
      heights.push({ measuredMM: hit?.point?.[2] ?? null, expectedMM: expected });
    }
    add(
      'Zwei unabh�ngige H�henmessungen auf dem nativen Freiformdach',
      heights.every(({ measuredMM, expectedMM }) => near(measuredMM, expectedMM, 0.03)),
      heights,
    );
  }
}

export async function runStlDevelopmentCheck(id, { desktop, createController, generate, signal } = {}) {
  if (!Object.hasOwn(fixtures, id)) throw Error('Unbekannte STL-Entwicklungsprüfung.');
  if (!desktop?.convertStl || !desktop?.analyseStl || !desktop?.cancelStl)
    throw Error('Für diese Prüfung wird der lokale Windows-STL-Konverter benötigt.');
  signal?.throwIfAborted();
  const [name, url] = fixtures[id];
  const response = await fetch(url, { signal });
  if (!response.ok) throw Error('Das mitgelieferte STL-Prüfmodell fehlt.');
  const bytes = await response.arrayBuffer();
  const file = { name, arrayBuffer: async () => bytes };
  const checks = [];
  const add = (label, passed, actual) => {
    checks.push({ label, passed: !!passed, ...(actual === undefined ? {} : { actual }) });
  };
  function task(make, run) {
    signal?.throwIfAborted();
    const native = make({ desktop });
    return { cancel: native.cancel, run: () => withCancel(native.cancel, signal, () => run(native)) };
  }
  const analyse = (edits, commands) =>
    task(createLocalStlAnalysis, (native) => native.run(file, options, { edits, commands }));
  const convert = (edits) =>
    task(createLocalStlConversion, (native) => native.run(file, edits ? { ...options, region_edits: edits } : options));

  const context = { analyse, convert, desktop, generate, signal, add };
  const result =
    id === 'stl-bores'
      ? await checkMarkedBores(context)
      : id === 'stl-cone'
        ? await checkProtectedCone(context)
        : id === 'stl-freeform'
          ? await checkFreeform(context)
          : await convert().run();

  const report = result.report;
  const maximum = report.deviation?.sampled_max_mm;
  const reserve = report.tessellation_allowance_mm;
  add(
    'Beidseitige Stichprobenabweichung inklusive Vernetzungsreserve im 0,15-mm-Budget',
    Number.isFinite(maximum) && Number.isFinite(reserve) && maximum + reserve <= options.tolerance + 1e-8,
    { maximumMM: maximum, reserveMM: reserve, faces: report.output_faces },
  );

  const controller = await createController();
  let transfer;
  try {
    transfer = createCadConverterImport({
      controller,
      getFrame: cadIdentity,
      showPreview: () => {},
      clearPreview: () => {},
      applyProposal: (proposal) => controller.apply(proposal),
      select: () => {},
    });
    const before = controller.serialize();
    const preview = await withCancel(
      () => transfer.discard(),
      signal,
      () => transfer.prepare(file, result),
    );
    add('Native STEP-Vorschau lässt Projekt und Revision unverändert', controller.serialize() === before);
    signal?.throwIfAborted();
    await transfer.apply();
    const body = controller.snapshot().nodes.find((node) => node.id === preview.id);
    add(
      'STEP als ein nativer Volumenkörper wieder geöffnet',
      report.valid &&
        body?.kind === 'cad' &&
        body.source === 'step' &&
        body.stats.solids === 1 &&
        body.stats.volume > 0 &&
        body.brep?.triangulation === false,
      {
        solids: body?.stats?.solids ?? null,
        volumeMM3: body?.stats?.volume ?? null,
        bounds: body?.stats?.bounds ?? null,
      },
    );
    if (body) await measureImported(id, controller, body, result, signal, add);
    controller.undo();
    add('Ein Undo stellt das isolierte Projekt exakt wieder her', controller.serialize() === before);
    return { checks };
  } finally {
    transfer?.discard();
    controller.dispose();
  }
}
