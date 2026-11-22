import { showLabProject } from './cad-lab-preview-assets.js';
import { prepareMeshImport } from './mesh-import-client.js';
import { createCadAutomationAccess } from './cad-automation-access.js';
import { runCadAIRequest } from './cad-ai-request.js';
import { cadIdentity } from './cad-affine.js';
import { cadStlAscii } from './cad-mesh-formats.js';
import { STL_COORDINATES, stlBoundsMM } from './cad-converter-ai.js';

async function measureSections(cad, id, bounds, signal) {
  const profiles = [];
  for (const fraction of [0.2, 0.63, 0.75, 0.87, 0.95]) {
    const z = bounds.min[2] + (bounds.max[2] - bounds.min[2]) * fraction;
    const query = { normal: [0, 0, 1], planePoint: [0, 0, z], fitTolerance: 0.02 };
    const measure = (options) => cad.meshQuery('toolsQuery', {
      id, kind: 'sectionContours', options,
    }, { signal });
    const unavailable = (error) => ['MESH_LID_LIMIT', 'MESH_LID_SECTION', 'MESH_SECTION_CONTOURS'].includes(error.code);
    try {
      const { frame, measurementPlanePoint, loops } = await measure(query);
      const profile = { frame, measurementPlanePoint, units: 'mm',
        loops: loops.map(({ role, parentIndex, elements, fitErrorBound, bounds }) => ({
          role, parentIndex, fitErrorBound, bounds, elements,
        })),
      };
      if (JSON.stringify(profile).length <= 2400) {
        profiles.push(profile);
        continue;
      }
    } catch (error) {
      signal.throwIfAborted();
      if (!unavailable(error)) throw error;
    }
    try {
      const measured = await measure({ ...query, summaryOnly: true });
      if (measured.measurements.length && JSON.stringify(measured).length <= 6000) profiles.push(measured);
    } catch (error) {
      signal.throwIfAborted();
      if (!unavailable(error)) throw error;
    }
  }
  return profiles;
}

// Directed countersink measurements run in the existing mesh worker (bounded mesh size and axis count there).
// Anything unclear, too large or refused yields no hint; only cancellation and stale revisions propagate.
async function measureDirectedCountersinks(cad, id, signal) {
  try {
    const result = await cad.meshQuery('toolsQuery', { id, kind: 'openingDirections' }, { signal });
    return Array.isArray(result?.countersinks) ? result.countersinks : [];
  } catch (error) {
    signal.throwIfAborted();
    if (/STALE|CANCEL|ABORT/.test(error.code ?? '')) throw error;
    return [];
  }
}

async function measureSteps(cad, id, signal) {
  try {
    return (await cad.meshQuery('toolsQuery', { id, kind: 'steppedBores' }, { signal })).steps;
  } catch (error) {
    signal.throwIfAborted();
    if (error.code !== 'MESH_LID_INVALID' && error.code !== 'MESH_LID_LIMIT') throw error;
    return [];
  }
}

export async function remodelStl(bytes, { createController, generate, signal, showReference, benchmark, sectionProfiles,
  modelCheckConfig, captureDiagnostics = false },
  label, verifyFeatures, taskHint = '') {
  const cad = createController();
  const stop = () => cad.cancel();
  signal.addEventListener('abort', stop, { once: true });
  try {
    const prepared = await prepareMeshImport(bytes.slice(0), { unit: 1, repair: false, simplify: false }, { signal });
    const project = cad.snapshot(),
      id = crypto.randomUUID();
    project.nodes.push({
      id,
      kind: 'mesh',
      name: 'STL-Vorlage',
      transform: cadIdentity(),
      color: '#8294aa',
      opacity: 1,
      layerId: project.activeLayerId,
      folderId: project.activeFolderId,
      metadata: {},
      mesh: prepared.mesh,
    });
    const imported = await cad.preview(undefined, { project, revision: cad.revision(), label: 'STL-Netz laden' });
    cad.apply(imported);
    const scene = await cad.describe();
    const access = createCadAutomationAccess({
      controller: cad,
      getScene: () => scene,
      getSelection: () => [{ rootId: id, path: [] }],
    });
    const prompt =
      'Modelliere die ausgewählte STL als eigenes natives CAD-Teil nach. Ermittle Maße am Netz. Erhalte einzeln zugängliche Konstruktionsschritte und die unveränderte Vorlage. Zielabweichung höchstens 0,15 mm.' + taskHint;
    const profiles = sectionProfiles
      ? await measureSections(cad, id, prepared.report.topology.bounds, signal) : [];
    const boreSteps = await measureSteps(cad, id, signal);
    const countersinks = await measureDirectedCountersinks(cad, id, signal);
    benchmark?.recordContext({
      sectionProfiles: profiles.length,
      variant: sectionProfiles ? 'measured-sections' : 'original',
      ...(!sectionProfiles && captureDiagnostics ? {
        boundsMM: prepared.report.topology.bounds,
        triangles: prepared.mesh.triangles.length / 3,
      } : {}),
      ...(countersinks.length ? { directedCountersinks: countersinks.length } : {}),
      ...(boreSteps.length ? { measuredBoreSteps: boreSteps.length } : {}),
    });
    const extra = {
      ...(profiles?.length ? { stlSectionProfiles: {
        target: id, source: 'Measured original STL contours in the reported world frames, mm. Sections describe only their measured planes. Compact sections may be incomplete; an unknown role is not a verified hole.',
        profiles,
      } } : {}),
      ...(countersinks.length ? { stlCountersinks: {
        target: id,
        source: 'Measured from axial sections of the original STL, world mm, with measurement uncertainty. Not reference values.',
        usage: 'Each entry is a through hole whose countersink opens along openingDirection. Create one native op:drill kind:countersink with associative:true on the base body per entry: reference:{ray:referenceRay}, diameter:boreDiameter, headDiameter, angle:includedAngleDegrees, through:true. Chain several drills by targeting the alias (as) of the previous drill result.',
        countersinks,
      } } : {}),
      ...(boreSteps.length ? { stlBoreSteps: {
        target: id,
        source: 'Two measured cylindrical bands beside a planar diameter step, in world mm. Endpoints use nearby measured planes; partial sections do not prove a hole at every depth.',
        usage: 'Use each stage diameter and its own world from/to points. Keep the two axial intervals and their measured centers separate. Check the local stock and opening before choosing a counterbore or separate editable cylindrical cuts.',
        steps: boreSteps,
      } } : {}),
    };
    function resultBody(proposal) {
      const nodes = cad.getPreview(proposal.previewId).project.nodes;
      const others = nodes.filter((node) => node.id !== id);
      const body = others[0];
      if (nodes.length === 2 && body?.kind === 'cad' && body.stats.solids === 1 && body.children?.length)
        return body;
      const roots = others.slice(0, 12).map(({ name, kind, stats, children }) => ({
        name, kind, solids: stats?.solids, constructionSources: children?.length ?? 0,
      }));
      const rootList = roots.map(({ name, kind, solids, constructionSources }) =>
        name + ' (' + kind + ', Körper ' + (solids ?? '–') + ', Quellen ' + constructionSources + ')',
      ).join(', ');
      const message = 'Der Nachbau braucht genau einen neuen geschlossenen CAD-Körper mit getrennt zugänglichen Quellen. ' +
        'Die STL-Vorlage bleibt im Projekt. Neue Objekte: ' + others.length + (rootList ? ' · ' + rootList : '') + '.';
      throw Object.assign(Error(message), {
        code: 'AI_STL_RESULT_STRUCTURE',
        feedback: { retryable: true, nextAction: 'change_input', actual: { total: others.length, roots } },
      });
    }
    const tolerance = 0.15;
    const accepted = new Map();
    let rejected, reference;
    async function checkCandidate(proposal, result) {
      const body = resultBody(proposal);
      let surface, surfacePassed;
      try {
        const proof = await cad.checkPreview(proposal.previewId,
          [{ kind: 'surfaceDeviation', target: body.id, other: id, expected: tolerance }]);
        surface = proof.checks[0]?.actual;
        surfacePassed = true;
      } catch (error) {
        if (!/^AI_(RESULT_MISMATCH|CHECK_)/.test(error.code ?? '')) throw error;
        surface = error.feedback?.actual;
        surfacePassed = false;
      }
      signal.throwIfAborted();
      const deviation = surface?.sampledMaximum;
      const directions = surface?.directions?.map(({ direction, sampledMaximum, samplePoints }) => ({
        direction, sampledMaximumMM: sampledMaximum, samplePoints,
      }));
      const features = [];
      const copy = createController();
      const stopCopy = () => copy.cancel();
      signal.addEventListener('abort', stopCopy, { once: true });
      try {
        // Query candidate geometry without applying it to the modeler's project.
        await copy.open(cad.getPreview(proposal.previewId).project, { label: 'STL-Nachbau prüfen' });
        signal.throwIfAborted();
        await verifyFeatures(copy, body, null, (label, passed, actual) => features.push({ label, passed, actual }));
        signal.throwIfAborted();
      } finally {
        signal.removeEventListener('abort', stopCopy);
        copy.dispose();
      }
      const failed = features.filter((feature) => !feature.passed);
      const bounds = prepared.report.topology.bounds, actual = body.stats.bounds;
      const round = (value) => Number(value.toFixed(4));
      const xyz = (values) => values.map(round).join(', ');
      const confirmed = new Map();
      for (const edge of ['min', 'max']) {
        for (const [index, axis] of ['X', 'Y', 'Z'].entries()) {
          if (Math.abs(actual[edge][index] - bounds[edge][index]) <= tolerance) {
            const label = axis + ' ' + edge;
            confirmed.set('bound:' + label, { label, actual: round(actual[edge][index]) });
          }
        }
      }
      const occurrences = new Map();
      for (const feature of features) {
        const occurrence = (occurrences.get(feature.label) ?? 0) + 1;
        occurrences.set(feature.label, occurrence);
        if (feature.passed) confirmed.set('feature:' + feature.label + '#' + occurrence, feature);
      }
      const regressions = [...(reference?.confirmed ?? [])].filter(([key]) => !confirmed.has(key)).map(([, item]) => item);
      const passed = surfacePassed && !failed.length && !regressions.length;
      benchmark?.recordPreview({
        id: proposal.previewId, passed, runGeometryCheck: true, sampledMaximumMM: deviation, directions, features,
        ...(regressions.length ? { regressions } : {}),
      });
      if (passed) {
        accepted.set(proposal.previewId, { body, deviation, directions, features });
        return;
      }
      const reason = regressions.length ? 'Bereits bestätigte Maße sind wieder außerhalb der Toleranz.'
        : surfacePassed ? 'Merkmalsprüfung am Nachbau fehlgeschlagen.' : 'Abstand zur unveränderten STL nicht bestätigt.';
      rejected = { passed: false, reason, deviation, features, ...(regressions.length ? { regressions } : {}) };
      if (!reference || (!regressions.length && (confirmed.size > reference.confirmed.size ||
        (deviation ?? Infinity) < (reference.deviation ?? Infinity)))) {
        reference = { result, confirmed, deviation, failed };
      }
      const message = reason + ' Weltkoordinaten in mm. STL min [' + xyz(bounds.min) + '], max [' + xyz(bounds.max) +
        ']. Entwurf min [' + xyz(actual.min) + '], max [' + xyz(actual.max) + '].' +
        (Number.isFinite(deviation) ? ' Gemessener maximaler Abstand ' + deviation.toFixed(4) +
          ' mm, zulässig ' + tolerance + ' mm.' : '') +
        (regressions.length ? ' Die beigefügten Befehle gehören zum früheren Entwurf mit den bestätigten Maßen.' : '') +
        ' Erhalte die bestätigten Merkmale und korrigiere die fehlgeschlagenen Maße.';
      const describe = ({ label, actual }) =>
        label + (actual === undefined ? '' : ' – Messbefund: ' + JSON.stringify(actual).slice(0, 240));
      throw Object.assign(Error(message), {
        code: 'AI_STL_RESULT_MEASUREMENTS',
        validationCorrection: true,
        ...(regressions.length ? { referenceResult: reference.result } : {}),
        feedback: {
          measuredTolerance: deviation, allowedTolerance: tolerance,
          ...(surface && !surfacePassed ? { checkKind: 'surfaceDeviation', actual: surface } : {}),
          failures: [
            ...regressions.slice(0, 8).map((item) => ({
              code: 'AI_STL_MEASURE_REGRESSION', message: describe(item) + ' war zuvor bestätigt.',
            })),
            ...(regressions.length ? reference.failed : failed).slice(0, 8)
              .map((item) => ({ code: 'AI_STL_FEATURE_CHECK', message: describe(item) })),
          ],
          confirmedMeasurements: [...reference.confirmed.values()].slice(0, 14).map(describe),
        },
      });
    }
    let proposal;
    try {
      ({ proposal } = await runCadAIRequest({
        access,
        generate: Object.keys(extra).length ? (args) => generate({ ...args, scene: { ...args.scene, ...extra } }) : generate,
        benchmark,
        validateCandidate: checkCandidate,
        ...(captureDiagnostics ? { onModelVerification: ({ verification, independentCheck }) => {
          benchmark?.recordModelChecks({
            automatic: !!modelCheckConfig,
            checks: (verification?.checks ?? []).map(({ kind, passed, actual, expected, error }) => ({
              kind, passed, expected,
              actual: kind === 'surfaceDeviation' ? actual?.sampledMaximum : actual,
              ...(error ? { code: error.code } : {}),
            })),
            freecad: independentCheck,
          });
        } } : {}),
        input: { prompt, ...(modelCheckConfig ? { modelCheckConfig } : { modelChecks: false }) },
        visualReview: false,
        maxCorrections: 1,
        maxValidationCorrections: 2,
        isCurrent: () => !signal.aborted,
      }));
    } catch (error) {
      signal.throwIfAborted();
      if (/^AI_PROVIDER_|TIMEOUT|STALE|CANCEL|ABORT/.test(error.code ?? '')) throw error;
      if (benchmark && /^LAB_|^AI_OUTPUT_INVALID$/.test(error.code ?? '')) throw error;
      if (rejected && /^AI_STL_RESULT_|^AI_(ANALYSIS_LIMIT|TASK_STALLED)$/.test(error.code ?? '')) return rejected;
      return { passed: false, reason: error.message, ...(benchmark ? { kind: 'unevaluable' } : {}) };
    }
    if (!proposal) return { passed: false, reason: 'Keine Modellvorschau.', ...(benchmark ? { kind: 'unevaluable' } : {}) };
    const { body, deviation, directions, features } = accepted.get(proposal.previewId);
    cad.apply(proposal);
    benchmark?.recordApplied(proposal);
    await showLabProject({ signal, showReference }, cad, { role: 'result', ids: [body.id] });
    const saved = cad.serialize();
    function editableSources(root) {
      const sources = [];
      function collect(node, path) {
        if (node.drill?.kind === 'countersink' || (node.source === 'native' && node.recipe && !node.children?.length))
          sources.push({ node, path });
        for (const child of node.children ?? []) collect(child, [...path, child.id]);
      }
      if (root) collect(root, []);
      return sources;
    }
    function editSource({ node, path }) {
      const target = { rootId: body.id, path };
      const drill = node.drill;
      return drill
        ? { op: 'editDrill', target, patch: { headDiameter: drill.headDiameter - (drill.headDiameter - drill.diameter) * 0.1 } }
        : { op: 'transform', target, scale: [1.05, 1.05, 1.05] };
    }
    const editable = editableSources(body);
    if (editable.length < 2)
      return { passed: false, reason: 'Mindestens zwei einzeln zugängliche native Konstruktionsquellen fehlen.' };
    const probe = editable.find((item) => item.node.drill?.kind === 'countersink') ??
      editable.find((item) => !item.node.solid) ?? editable[0];
    const drill = probe.node.drill;
    const command = editSource(probe);
    let edit;
    try {
      edit = await cad.preview({ kind: 'batch', commands: [command] }, { signal });
    } catch (error) {
      signal.throwIfAborted();
      return { passed: false, reason: 'Probeänderung der Quelle nicht bestätigt: ' + error.message };
    }
    const moved = cad.getPreview(edit.previewId).project.nodes.find((n) => n.id === body.id);
    const volumeDelta = Math.abs(moved?.stats?.volume - body.stats.volume);
    if (!Number.isFinite(volumeDelta) || volumeDelta < 0.000001)
      return { passed: false, reason: 'Probeänderung wirkte sich nicht auf den CAD-Körper aus.' };
    cad.apply(edit);
    cad.undo();
    const restored = cad.serialize() === saved;
    benchmark?.recordProgramCheck('Undo stellt den CAD-Nachbau wieder her', restored);
    // A measured countersink must stay editable after saving and reopening the copy.
    let reopened = true;
    if (countersinks.length && restored) {
      const copy = createController();
      try {
        await copy.open(saved, { label: 'Gespeicherte Kopie öffnen' });
        const again = copy.snapshot().nodes.find((node) => node.id === body.id);
        const sinks = editableSources(again).filter(({ node }) => node.drill?.kind === 'countersink');
        reopened = sinks.length >= countersinks.length;
        for (const sink of sinks) {
          const draft = await copy.preview({ kind: 'batch', commands: [editSource(sink)] }, { signal });
          const changed = copy.getPreview(draft.previewId).project.nodes.find((node) => node.id === body.id)?.stats?.volume;
          reopened &&= Number.isFinite(changed) && Math.abs(changed - again.stats.volume) > 0.000001;
        }
      } catch {
        signal.throwIfAborted();
        reopened = false;
      } finally {
        copy.dispose();
      }
      benchmark?.recordProgramCheck('Gespeicherte Kopie lässt die Senkung bearbeiten', reopened);
    }
    return {
      passed: restored && reopened,
      ...(countersinks.length ? { measuredCountersinks: countersinks.length } : {}),
      features,
      steps: editable.length,
      probeSource: drill?.kind ?? probe.node.recipe.type,
      volumeChangeMM3: volumeDelta,
      source: label,
      deviation,
      ...(benchmark ? { directions } : {}),
    };
  } finally {
    signal.removeEventListener('abort', stop);
    cad.dispose();
  }
}

// A failed conversion can request a conservative cleanup on a working copy.
// No filling of unknown openings or redesign of the model in the fallback.
export async function repairedStlFile(file, error, { generate, signal }) {
  const bytes = await file.arrayBuffer();
  const parsed = await prepareMeshImport(bytes.slice(0), { unit: 1, repair: false, simplify: false }, { signal });
  const { bounds, ...topology } = parsed.report.topology;
  const answer = await generate({
    domain: 'converter',
    chat: true,
    prompt:
      'Die direkte Konvertierung ist fehlgeschlagen. Prüfe die Netzdiagnose. Antworte mit einem JSON-Objekt mit dem Nachrichtenfeld message. Verwende CLEAN für eine konservative Netzbereinigung oder STOP, wenn diese fachlich nicht begründet ist.',
    context: { allowed: ['CLEAN', 'STOP'], coordinateConvention: STL_COORDINATES },
    scene: {
      revision: 'repair',
      units: 'mm',
      boundsMM: stlBoundsMM([bounds.min, bounds.max]),
      topology,
      diagnosis: String(error.message).slice(0, 500),
    },
  });
  if (answer.message?.trim() !== 'CLEAN') throw error;
  const cleaned = await prepareMeshImport(bytes.slice(0), { unit: 1, repair: true, simplify: false }, { signal });
  if (cleaned.report.repair?.status !== 'cleaned')
    throw Error('Die vorgeschlagene Bereinigung hat das Netz nicht repariert.');
  const text = cadStlAscii([
    {
      name: 'Arbeitskopie',
      mesh: { vertices: Array.from(cleaned.mesh.verts), triangles: Array.from(cleaned.mesh.triangles) },
    },
  ]);
  const data = new TextEncoder().encode(text);
  return { name: file.name, arrayBuffer: async () => data.buffer };
}
