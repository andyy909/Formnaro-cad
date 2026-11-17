// Materialization returns a snapshot of an unchanged registered preview.
// Restoration rebuilds a saved candidate as a fresh preview. The store and
// the preview registry keep their state. Preview building, display and the
// publisher stay in the controller.
import { cadProjectSnapshot } from './cad-project.js';
import { taskCandidateModelKey, validateTaskCandidate } from './cad-ai-task-candidate.js';

export function createCadControllerTaskCandidate({
  store,
  previewRegistry,
  resolveGeometry,
  assertPreviewStart,
  preview,
  inspectMeshSolid,
}) {
  async function materializeAITaskCandidate(previewId) {
    const proposal = previewRegistry.getPreview(previewId),
      revision = store.revision();
    if (!proposal || proposal.revision !== revision)
      throw Object.assign(Error('Auftragsvorschau fehlt oder ist veraltet.'), { code: 'STALE_REVISION' });
    const project = await resolveGeometry(proposal.project, null);
    if (store.revision() !== revision || previewRegistry.getPreview(previewId) !== proposal)
      throw Object.assign(Error('Vorschau während der Sicherung geändert.'), { code: 'STALE_REVISION' });
    return cadProjectSnapshot(project);
  }
  async function restoreAITaskCandidate(
    value,
    { revision = store.revision(), label = 'Gespeicherten KI-Entwurf prüfen', aliases = {} } = {},
  ) {
    assertPreviewStart(revision);
    const saved = validateTaskCandidate(value, aliases),
      before = store.snapshot();
    let proposal;
    try {
      // Rebuild actual archived sources, without replaying provider scripts or
      // FreeCAD programs. A new transaction owns fresh native acceptance.
      proposal = await preview(undefined, { project: saved.project, revision, label });
      if (taskCandidateModelKey(proposal.project) !== taskCandidateModelKey(saved.project))
        throw Object.assign(
          Error(
            'Der erneute native Aufbau verändert die gespeicherte Geometrie oder ihre Quellen. Entwurf nicht fortsetzen.',
          ),
          { code: 'AI_TASK_CANDIDATE_CHANGED', feedback: { retryable: false } },
        );
      const changed = proposal.project.nodes.filter(
        (node) => JSON.stringify(node) !== JSON.stringify(before.nodes.find((old) => old.id === node.id)),
      );
      for (const node of changed)
        if (node.kind === 'mesh') {
          const proof = await inspectMeshSolid(node);
          if (!proof.ok)
            throw Object.assign(Error('Gespeichertes Materialnetz hat keinen frischen Körpernachweis.'), {
              code: 'AI_TASK_CANDIDATE_INVALID',
            });
        }
      if (store.revision() !== revision || !previewRegistry.hasPreview(proposal.previewId))
        throw Object.assign(Error('Modell während der Wiederherstellung geändert.'), { code: 'STALE_REVISION' });
      const sources = changed
          .filter((node) => before.nodes.some((old) => old.id === node.id))
          .map((node) => ({ id: node.id, name: node.name })),
        relations = ['projectParameters', 'contourLinks', 'drawings', 'joints', 'featureReferences'],
        freecad = (node) => !!node.metadata?.freecadSource || node.children?.some(freecad),
        requiresAcceptance =
          (sources.length > 0 &&
            (relations.some((key) => saved.project[key] || before[key]) || changed.some(freecad))) ||
          relations.some((key) => JSON.stringify(saved.project[key]) !== JSON.stringify(before[key]));
      proposal.aliases = saved.aliases;
      proposal.report = {
        restoredTaskCandidate: true,
        featureDependencies: { requiresAcceptance, parameters: [], sources, contours: [], drawingViews: [] },
      };
      if (requiresAcceptance) previewRegistry.addFeatureDependency(proposal.previewId);
      return structuredClone(proposal);
    } catch (error) {
      if (proposal) {
        previewRegistry.rejectRestoredPreview(proposal.previewId);
        store.discard(proposal.previewId);
      }
      throw error;
    }
  }
  return { materializeAITaskCandidate, restoreAITaskCandidate };
}
