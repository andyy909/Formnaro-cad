import { showLabProject } from './cad-lab-preview-assets.js';
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
const crossDrilled = 'stl-cross-drilled';
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

const converterBenchmarks = {
  'converter-selected': {
    fixture: 'stl-bores',
    type: 'CYLINDER',
    count: 2,
    selected: true,
    prompt: 'Schütze die ausgewählten Bohrungsflächen.',
  },
  'converter-find': {
    fixture: 'stl-bores',
    type: 'CYLINDER',
    count: 2,
    prompt:
      'Finde ohne Vorauswahl die beiden zylindrischen Durchgangsbohrungen und schütze ausschließlich ihre Flächen.',
  },
  'converter-cone': {
    fixture: 'stl-cone',
    type: 'GRAPH',
    count: 4,
    prompt:
      'Schütze alle Segmente der konischen Profilbohrung. Lass die ebenen Flächen und alle anderen Bereiche unverändert. Fasse keine Bereiche zusammen.',
  },
};

async function checkProtectedRegions({ analyse, convert, desktop, generate, signal, add, report }, task) {
  let analysis = await analyse().run();
  const regions = analysis.regions.filter((region) => region.type === task.type);
  const targets = regions.map((region) => region.edit_id);
  const selection = task.selected ? targets : [];
  add(task.count + ' erwartete Flächenbereiche erkannt', regions.length === task.count, targets);
  if (regions.length !== task.count) throw Error('Das Konverter-Prüfmodell hat eine abweichende Flächenanalyse.');
  const before = analysis;
  const expectedProtection = sorted(regions.flatMap((region) => region.faces));
  const previousState = structuredClone(analysis.state);
  const snapshot = () => ({ analysis, options, selection, revision: analysis === before ? 'original' : 'accepted' });
  let correction;
  const ai = createConverterAI({
    desktop: {
      getAISettings: generate ? () => desktop.getAISettings() : async () => recordedConverterSettings,
      generateAI:
        (generate && report ? async (request) => {
          const reply = await generate({ ...request, correction });
          try {
            if (!Array.isArray(reply.commands) || !reply.commands.length)
              throw Error('Eine Korrektur mit Flächenbefehlen fehlt.');
            validateConverterAIProposal(reply, request.scene);
          } catch (error) {
            error.code = 'AI_OUTPUT_INVALID';
            report.recordFailure(error);
            throw error;
          }
          return reply;
        } : generate) ??
        (async ({ scene }) => ({
          revision: scene.revision,
          label: 'Bohrungsflächen schützen',
          commands: [{ op: 'protect', regions: targets, enabled: true }],
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
    try {
      await withCancel(ai.cancel, signal, () => ai.request(task.prompt));
    } catch (error) {
      if (!report || error.code !== 'AI_OUTPUT_INVALID' || /output was truncated/i.test(error.message)) throw error;
      correction = 'Dein Flächenvorschlag ist ungültig: ' + error.message + ' Gib einen vollständigen korrigierten Vorschlag aus.';
      await withCancel(ai.cancel, signal, () => ai.request(task.prompt));
    }
    if (ai.state().pending && report) {
      report.recordCandidate({});
      report.recordProgramCheck('Flächenvorschau erhält bestätigte Korrektur', same(analysis.state, previousState));
    }
    if (report && !ai.state().pending) {
      add('Native Flächenvorschau fehlt', false, { kind: 'unevaluable' });
    } else {
      add('Die Flächenvorschau ändert keine bestätigte Korrektur',
        ai.state().pending && same(analysis.state, previousState));
    }
    if (!ai.state().pending) return convert().run();
    ai.apply();
    report?.recordApplied();
    const protection = sorted(analysis.state.protected_faces);
    add('Übernehmen schützt genau die gewünschten Dreiecke', same(protection, expectedProtection), protection.length);
    if (!task.selected) {
      const intended = await analyse(previousState, [{ op: 'protect', regions: targets, enabled: true }]).run();
      add('Unbeteiligte Bereiche und Zuordnungen unverändert', same(analysis.state, intended.state));
    }
    const result = await convert(analysis.state).run();
    analysis = await analyse(previousState).run();
    const restored = same(analysis.state, previousState);
    add('Voriger Flächenzustand lässt sich wiederherstellen', restored);
    report?.recordProgramCheck('Vorigen Flächenzustand wiederherstellen', restored);
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
  const unprotected = await convert().run();
  const coneCount = (new TextDecoder().decode(unprotected.bytes).match(/=\s*CONICAL_SURFACE\s*\(/g) ?? []).length;
  add(
    'Ungeschützter Vergleichslauf rekonstruiert einen analytischen Konus',
    unprotected.report.valid && coneCount === 1,
    coneCount,
  );
  const result = await convert(analysis.state).run();
  const applied = result.report.bodies[0]?.details?.manual_regions;
  add('Konvertierung übernimmt den Dreiecksschutz', same(sorted(applied?.protected_faces ?? []), expected), {
    selectedRegions: selection,
    protectedFaces: applied?.protected_faces?.length ?? 0,
  });
  return result;
}

async function checkFreeform({ analyse, convert, desktop, generate, signal, add }) {
  const baseline = await convert().run();
  const analysis = await analyse().run();
  const selection = analysis.regions.filter((region) => region.type === 'GRAPH').map((region) => region.edit_id);
  add('Zusammenhängende Freiformfläche erkannt', selection.length === 1, selection);
  if (selection.length !== 1) return baseline;
  let answered = false;
  let validAnswer = false;
  let providerFailure;
  const generateLive =
    generate &&
    (async (request) => {
      try {
        const reply = await generate(request);
        answered = true;
        const scene = request.scene;
        if (reply.revision !== scene.revision || !Array.isArray(reply.commands))
          throw Error('Ungültige Freiform-Antwort.');
        const commands = reply.commands.length ? validateConverterAIProposal(reply, scene) : [];
        const allowed = commands.every(
          (command) =>
            !(command.op === 'protect' && !command.enabled) && command.regions.some((id) => scene.targets.includes(id)),
        );
        if (!allowed) throw Error('Freiform-Antwort ändert geschützte oder unbeteiligte Flächen.');
        validAnswer = true;
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
  const { result, outcome, detail } = await withCancel(autopilot.cancel, signal, () => autopilot.run({ baseline }));
  if (generate) {
    if (!answered && providerFailure) throw providerFailure;
    add('Anbieter hat geantwortet', answered);
    add('Gültiger Freiformvorschlag oder bewusster Verzicht', validAnswer, detail || undefined);
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

export async function measureCountersinks(pick, add) {
  const heights = [3.8, 4.25, 5, 5.75];
  const expectedRadii = [2, 2.25, 3, 3.75];
  for (const x of [-7, 7]) {
    const radii = [];
    for (const z of heights) {
      const hit = await pick('rayPick', [x, 0, z], [1, 0, 0]);
      radii.push(hit ? hit.point[0] - x : null);
    }
    add('Kegelsenkung 90°, Ø8 mm oben und 2 mm tief bei X=' + x,
      radii.every((radius, index) => near(radius, expectedRadii[index], 0.08)), {
        samples: heights.map((z, index) => ({ z, radius: radii[index], expectedRadius: expectedRadii[index] })),
      });
  }
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
        (countersinks ? 'Analytische' : 'Gemessene') + ' Durchgangsbohrung Ø' + diameter + ' bei X=' + x,
        mouth === null && near(measured, diameter),
        {
          diameterMM: Number.isFinite(measured) ? measured : null,
          wallType: wall?.surface?.kind ?? null,
        },
      );
    }
  }
  if (id === crossDrilled) {
    const topOpening = await pick('rayPick', [-10, 4, 15], [0, 0, -1]);
    const seat = await pick('rayPick', [-10, 4, 10.5], [1, 0, 0]);
    const bore = await pick('rayPick', [-10, 4, 8], [1, 0, 0]);
    const sideOpening = await pick('rayPick', [-10, -20, 6], [0, 1, 0]);
    const sideWall = await pick('rayPick', [-10, -12, 6], [1, 0, 0]);
    const blindBottom = await pick('rayPick', [10, -4, -1], [0, 0, 1]);
    const blindWall = await pick('rayPick', [10, -4, 2], [1, 0, 0]);
    const closedTop = await pick('rayPick', [10, -4, 15], [0, 0, -1]);
    add('Stufenbohrung von oben mit Durchgang und zwei Radien',
      topOpening === null && near(seat?.point?.[0], -4) && near(bore?.point?.[0], -7),
      [seat?.point, bore?.point]);
    add('Seitliche Querbohrung durchgehend im richtigen Durchmesser',
      sideOpening === null && near(sideWall?.point?.[0], -8), sideWall?.point);
    add('Sackloch von unten mit richtigem Durchmesser und Tiefe, oben geschlossen',
      near(blindBottom?.point?.[2], 5) && near(blindWall?.point?.[0], 14) && near(closedTop?.point?.[2], 12),
      [blindBottom?.point, blindWall?.point, closedTop?.point]);
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
  if (countersinks && result?.bytes) {
    const step = new TextDecoder().decode(result.bytes);
    const cones = (step.match(/=\s*CONICAL_SURFACE\s*\(/g) ?? []).length;
    add('Konische Flächen im importierten STEP enthalten', cones === 2, cones);
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
      'Zwei unabhängige Höhenmessungen auf dem nativen Freiformdach',
      heights.every(({ measuredMM, expectedMM }) => near(measuredMM, expectedMM, 0.03)),
      heights,
    );
  }
}

async function loadBenchmarkStl(fixtureId, createController, signal) {
  const prepared = fixtures[fixtureId];
  if (prepared) {
    const [name, url] = prepared;
    const response = await fetch(url, { signal });
    if (!response.ok) throw Error('Das mitgelieferte STL-Prüfmodell fehlt.');
    return { name, bytes: await response.arrayBuffer() };
  }
  const match = /^stl-stepped-([1-9][0-9]*)$/.exec(fixtureId);
  const compound = fixtureId === crossDrilled;
  if (!match && !compound) throw Error('Unbekannte STL-Entwicklungsprüfung.');
  const count = match ? Number(match[1]) : 0;
  // Every hole has a through bore and a shallow counterbore. Give only the exported mesh to the model.
  const cad = createController(),
    stop = () => cad.cancel();
  signal?.addEventListener('abort', stop, { once: true });
  try {
    const cuts = Array.from({ length: count }, (_, i) => ({
      x: 14 * (i - (count - 1) / 2),
      y: i % 2 ? 3 : -3,
      d: i % 2 ? 4 : 5,
    }));
    const tools = compound ? [
      { op: 'create', type: 'cylinder', size: [6, 6, 16], pos: [-10, 4, 6], solid: false, as: 'through' },
      { op: 'create', type: 'cylinder', size: [12, 12, 6], pos: [-10, 4, 12], solid: false, as: 'seat' },
      { op: 'create', type: 'cylinder', size: [4, 4, 40], pos: [-10, 0, 6], rot: [-90, 0, 0], solid: false, as: 'cross' },
      { op: 'create', type: 'cylinder', size: [8, 8, 8], pos: [10, -4, 1], solid: false, as: 'blind' },
    ] : cuts.flatMap(({ x, y, d }, i) => [
      { op: 'create', type: 'cylinder', size: [d, d, 10], pos: [x, y, 4], solid: false, as: 'hole' + i },
      { op: 'create', type: 'cylinder', size: [d + 3, d + 3, 4], pos: [x, y, 8], solid: false, as: 'seat' + i },
    ]);
    await cad.execute(
      {
        kind: 'batch',
        commands: [
          { op: 'create', type: 'box', size: compound ? [48, 32, 12] : [count * 14, 24, 8],
            pos: [0, 0, compound ? 6 : 4], as: 'base' },
          ...tools,
          { op: 'group', targets: ['$base', ...tools.map((t) => '$' + t.as)] },
        ],
      },
      { signal },
    );
    const output = await cad.exportModel({ format: 'stl', quality: { deflection: 0.02, angleDegrees: 8 } });
    const bytes = await new Blob([output.data]).arrayBuffer();
    return compound ? { name: 'Querbohrungsblock.stl', bytes } : { name: 'STL-Prüfteil.stl', bytes, cuts };
  } finally {
    signal?.removeEventListener('abort', stop);
    cad.dispose();
  }
}

export async function runStlChallenge(id, runtime) {
  const { buildStlChallenge } = await import('./cad-lab-stl-challenge-fixtures.js');
  const inputFixture = await buildStlChallenge(id, runtime);
  const started = performance.now();
  const localSignal = AbortSignal.any([runtime.signal, AbortSignal.timeout(75000)]);
  let baseline;
  try {
    const { checks, input } = await runStlDevelopmentCheck(id, {
      ...runtime, inputFixture, signal: localSignal, showReference: undefined, benchmark: undefined,
    });
    baseline = { status: checks.every((check) => check.passed) ? 'passed' : 'failed', checks, input };
  } catch (error) {
    runtime.signal.throwIfAborted();
    baseline = { status: localSignal.aborted ? 'timeout' : 'error', message: String(error.message).slice(0, 500) };
  }
  runtime.benchmark?.recordConverter({ ...baseline, elapsedMs: Math.round(performance.now() - started) });
  return runStlDevelopmentCheck(id, { ...runtime, inputFixture, remodelFirst: true, editableOnly: true });
}

export async function runStlDevelopmentCheck(
  id,
  { desktop, createController, generate, signal, remodelFirst = false, editableOnly = false,
    showReference, benchmark: evidence, sectionProfiles, inputFixture, modelCheckConfig } = {},
) {
  const benchmark = Object.hasOwn(converterBenchmarks, id) ? converterBenchmarks[id] : null;
  const fixtureId = benchmark?.fixture ?? id;
  if (!inputFixture && !Object.hasOwn(fixtures, fixtureId) && !(remodelFirst && (fixtureId === crossDrilled || /^stl-stepped-[1-9][0-9]*$/.test(fixtureId))))
    throw Error('Unbekannte STL-Entwicklungsprüfung.');
  if (!desktop?.convertStl || !desktop?.analyseStl || !desktop?.cancelStl)
    throw Error('Für diese Prüfung wird der lokale Windows-STL-Konverter benötigt.');
  signal?.throwIfAborted();
  const { name, bytes, cuts, sha256: sourceHash } = inputFixture ?? await loadBenchmarkStl(fixtureId, createController, signal);
  showReference?.({ stl: bytes, name, sha256: sourceHash });
  const meshInput = { file: name, ...(sourceHash ? { sha256: sourceHash } : {}) };
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

  async function verifyFeatures(controller, body, result, add) {
    if (inputFixture) return inputFixture.verify(controller, body, add, signal);
    if (body && cuts)
      for (const { x, y, d } of cuts) {
        const hit = async (origin, direction) =>
          controller.query('rayPick', { ids: [body.id], ray: { origin, direction } }, { signal });
        const through = await hit([x, y, 12], [0, 0, -1]);
        const bore = await hit([x, y, 2], [1, 0, 0]),
          seat = await hit([x, y, 7], [1, 0, 0]);
        add(
          'Durchgang und zylindrische Senkung bei X=' + x,
          through === null && near(bore?.point?.[0] - x, d / 2, 0.15) && near(seat?.point?.[0] - x, (d + 3) / 2, 0.15),
        );
      }
    await measureImported(fixtureId, controller, body, result, signal, add);
    if (evidence && fixtureId === 'stl-countersinks') {
      await measureCountersinks((kind, origin, direction) =>
        controller.query(kind, { ids: [body.id], ray: { origin, direction } }, { signal }), add);
    }
  }
  const context = { analyse, convert, desktop, generate, signal, add, report: evidence };
  let route;
  let result;
  if (remodelFirst) {
    const { remodelStl, repairedStlFile } = await import('./cad-lab-stl-remodel.js');
    const taskHint = fixtureId === crossDrilled
      ? ' Erfasse die Stufenbohrung oben, die hineinlaufende Querbohrung und das separate Sackloch von unten.'
      : '';
    const model = await remodelStl(bytes, {
      createController, generate, signal, showReference, benchmark: evidence, sectionProfiles, modelCheckConfig,
      captureDiagnostics: !!inputFixture,
    }, name, verifyFeatures, taskHint);
    if (model.passed)
      return {
        input: { route: 'editable', ...meshInput },
        checks: evidence ? [
          { label: 'Beidseitig gemessener Oberflächenabstand höchstens 0,15 mm', passed: true, actual: model.directions },
          ...(model.features ?? []),
          { label: 'Getrennt editierbare Konstruktionsquellen', passed: true, actual: model.steps },
          { label: 'Quellenänderung am Körper nachweisbar und rückgängig', passed: true, actual: model.volumeChangeMM3 },
        ] : [{ label: 'Bearbeitbarer Nachbau, Abstand und Probeänderung bestätigt', passed: true, actual: model }],
      };
    add('Bearbeitbarer Nachbau', false, model);
    if (evidence) checks.push(...(model.features ?? []));
    if (editableOnly) return { input: { route: 'unconfirmed', ...meshInput }, checks };
    route = 'converter';
    try {
      result = await convert().run();
      if (!result.report?.valid) throw Error('Konvertierung ergab einen ungültigen STEP-Körper.');
    } catch (error) {
      signal.throwIfAborted();
      const repaired = await repairedStlFile(file, error, { generate, signal });
      result = await task(createLocalStlConversion, (native) => native.run(repaired, options)).run();
      route = 'converter-after-mesh-repair';
    }
  } else
    result =
      benchmark || id === 'stl-bores'
        ? await checkProtectedRegions(context, benchmark ?? converterBenchmarks['converter-selected'])
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
    if (showReference) await showLabProject({ signal, showReference }, controller, { role: 'result' });
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
    if (body) await verifyFeatures(controller, body, result, add);
    controller.undo();
    add('Ein Undo stellt das isolierte Projekt exakt wieder her', controller.serialize() === before);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    return {
      checks,
      input: {
        ...(route ? { route } : {}),
        file: name,
        sha256,
        ...options,
        ...(benchmark ? { prompt: benchmark.prompt } : {}),
      },
    };
  } finally {
    transfer?.discard();
    controller.dispose();
  }
}
