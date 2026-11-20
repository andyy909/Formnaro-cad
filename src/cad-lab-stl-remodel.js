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
    const section = await cad.meshQuery('toolsQuery', {
      id, kind: 'sectionContours', options: { normal: [0, 0, 1], planePoint: [0, 0, z], fitTolerance: 0.02 },
    }, { signal });
    const { frame, measurementPlanePoint, loops } = section;
    const profile = { frame, measurementPlanePoint, units: 'mm',
      loops: loops.map(({ role, parentIndex, elements, fitErrorBound, bounds }) => ({
        role, parentIndex, fitErrorBound, bounds, elements,
      })),
    };
    if (JSON.stringify(profile).length <= 2400) profiles.push(profile);
  }
  return profiles;
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
    let profiles;
    if (sectionProfiles) {
      profiles = await measureSections(cad, id, prepared.report.topology.bounds, signal);
      benchmark?.recordContext({ sectionProfiles: profiles.length, variant: 'measured-sections' });
    } else benchmark?.recordContext({ sectionProfiles: 0, variant: 'original', ...(captureDiagnostics ? {
      boundsMM: prepared.report.topology.bounds,
      triangles: prepared.mesh.triangles.length / 3,
    } : {}) });
    let proposal;
    try {
      ({ proposal } = await runCadAIRequest({
        access,
        generate: profiles?.length ? (args) => generate({
          ...args, scene: { ...args.scene, stlSectionProfiles: {
            target: id, source: 'Measured original STL contours in the reported world frames, mm. Sections describe only their measured planes.',
            profiles,
          } },
        }) : generate,
        benchmark,
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
        isCurrent: () => !signal.aborted,
      }));
    } catch (error) {
      signal.throwIfAborted();
      if (/^AI_PROVIDER_|TIMEOUT|STALE|CANCEL|ABORT/.test(error.code ?? '')) throw error;
      if (benchmark && /^LAB_|^AI_OUTPUT_INVALID$/.test(error.code ?? '')) throw error;
      return { passed: false, reason: error.message, ...(benchmark ? { kind: 'unevaluable' } : {}) };
    }
    if (!proposal) return { passed: false, reason: 'Keine Modellvorschau.', ...(benchmark ? { kind: 'unevaluable' } : {}) };
    const nodes = cad.getPreview(proposal.previewId).project.nodes,
      body = nodes.find((n) => n.id !== id);
    if (nodes.length !== 2 || !body || body.kind !== 'cad' || body.stats.solids !== 1 || !body.children?.length)
      return { passed: false, reason: 'Ein CAD-Körper mit getrennten Konstruktionsschritten fehlt.' };
    const proof = await cad.checkPreview(
      proposal.previewId,
      [{ kind: 'surfaceDeviation', target: body.id, other: id, expected: 0.15 }],
      { collectFailures: true },
    );
    const measured = proof.checks[0]?.actual;
    const deviation = measured?.sampledMaximum;
    const directions = measured?.directions?.map(({ direction, sampledMaximum, samplePoints }) => ({
      direction, sampledMaximumMM: sampledMaximum, samplePoints,
    }));
    benchmark?.recordPreview({
      id: proposal.previewId, passed: proof.passed, runGeometryCheck: true,
      sampledMaximumMM: deviation, directions,
    });
    if (!proof.passed && !benchmark)
      return {
        passed: false,
        reason: 'Abstand zur unveränderten STL nicht bestätigt.',
        deviation: proof.checks[0]?.actual?.sampledMaximum,
      };
    cad.apply(proposal);
    benchmark?.recordApplied(proposal);
    if (!benchmark) await showLabProject({ signal, showReference }, cad, { role: 'result', ids: [body.id] });
    const features = [];
    await verifyFeatures(cad, body, null, (label, passed, actual) => features.push({ label, passed, actual }));
    if (benchmark) {
      benchmark.recordPreview({
        id: proposal.previewId,
        passed: proof.passed && features.every((feature) => feature.passed),
        runGeometryCheck: true,
        sampledMaximumMM: deviation, directions,
        features,
      });
      await showLabProject({ signal, showReference }, cad, { role: 'result', ids: [body.id] });
    }
    if (!proof.passed)
      return { passed: false, reason: 'Abstand zur unveränderten STL nicht bestätigt.',
        deviation: proof.checks[0]?.actual?.sampledMaximum, features };
    if (features.some((c) => !c.passed))
      return { passed: false, reason: 'Merkmalsprüfung am Nachbau fehlgeschlagen.', features };
    const saved = cad.serialize();
    const editable = [];
    function collect(node, path) {
      if (node.source === 'native' && node.recipe && !node.children?.length) editable.push({ node, path });
      for (const child of node.children ?? []) collect(child, [...path, child.id]);
    }
    collect(body, []);
    if (editable.length < 2)
      return { passed: false, reason: 'Mindestens zwei einzeln zugängliche native Konstruktionsquellen fehlen.' };
    const probe = editable.find((item) => !item.node.solid) ?? editable[0];
    let edit;
    try {
      edit = await cad.preview(
        {
          kind: 'batch',
          commands: [
            {
              op: 'transform',
              target: { rootId: body.id, path: probe.path },
              scale: [1.05, 1.05, 1.05],
            },
          ],
        },
        { signal },
      );
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
    return {
      passed: restored,
      features,
      steps: editable.length,
      probeSource: probe.node.recipe.type,
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
