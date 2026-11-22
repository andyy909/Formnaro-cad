/** A repair picks an edge on a temporary native body, never on the finished result. */
export function cadFinishRepairDraft(bodyId, steps, error) {
  if (error?.bodyId !== bodyId || !Number.isInteger(error.edgeIndex)) return null;
  const index = steps.findIndex(step => step.id === error.stepId);
  if (index < 0 || !steps[index].edges[error.edgeIndex]) return null;
  return { bodyId, steps: structuredClone(steps), index, edgeIndex: error.edgeIndex };
}

export async function previewCadFinishPrefix(controller, repair, revision, quality, current) {
  const request = { revision, label: 'CAD-Körper vor dem Kantenschritt' };
  let operation;
  if (repair.index > 0) {
    operation = { kind: 'editFinish', target: repair.bodyId, steps: repair.steps.slice(0, repair.index) };
  } else {
    const project = controller.snapshot();
    const node = project.nodes.find(node => node.id === repair.bodyId);
    if (!node?.finish) throw Error('Editierbare Kantenoperation fehlt.');
    delete node.finish;
    // Keep the original local frame for selecting the first edge.
    if (node.source === 'finish') {
      node.source = 'group';
      node.operation = 'union';
    }
    request.project = project;
  }
  const prefix = await controller.preview(operation, request);
  try {
    if (!current()) return null;
    const options = { nodeId: repair.bodyId, ...quality };
    const { edges } = await controller.queryPreviewEdges(prefix.previewId, options);
    const display = await controller.display(prefix.project);
    if (!current()) return null;
    return { prefix, edges, meshes: display.meshes.filter(mesh => (mesh.rootId ?? mesh.id) === repair.bodyId) };
  } finally {
    controller.discard(prefix.previewId);
  }
}

export function repairedCadFinishOperation(repair, edge) {
  if (edge?.reference?.origin?.rootId !== repair.bodyId)
    throw Error('Eine Kante am angezeigten Zwischenkörper auswählen.');
  const steps = structuredClone(repair.steps);
  steps[repair.index].edges[repair.edgeIndex] = structuredClone(edge.reference);
  return { kind: 'editFinish', target: repair.bodyId, steps };
}
