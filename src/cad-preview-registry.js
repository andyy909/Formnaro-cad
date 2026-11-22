/** Controller-local owner of the ID-bound preview state.
 *
 * The store keeps confirmed projects, revisions, history and its own preview
 * records. This registry only holds what the controller knows about a preview
 * ID: the proposal result, replacement markers, drawing proofs, photo proofs
 * and feature-dependency acceptances. The registry's getPreview returns
 * the stored proposal. The controller's public getPreview returns a copy. */
const PREVIEW_LIMIT = 10;
const DRAWING_PROOF_LIMIT = 10;

export function createCadPreviewRegistry() {
  const previews = new Map(),
    replacementPreviews = new Set(),
    drawingProofs = new Map(),
    photoReconstructionProofs = new Map(),
    featureDependencyProofs = new Set();
  function getPreview(previewId) {
    return previews.get(previewId);
  }
  function hasPreview(previewId) {
    return previews.has(previewId);
  }
  /** Register a completed proposal in the controller's existing order.
   *
   * The preview is stored first, then the controller's existing feature
   * predicate is evaluated, followed by its acceptance flag, the
   * photo-reconstruction start proof, the drawing proof, the replacement
   * marker and finally the DTO eviction that removes all five ID entries of
   * the oldest proposal. */
  function registerPreview(
    result,
    { featureDependency = () => false, revision, readDrawingProof = () => undefined, replacement = false } = {},
  ) {
    const previewId = result.previewId;
    previews.set(previewId, result);
    if (featureDependency()) featureDependencyProofs.add(previewId);
    if (result.photoReconstructionReport) photoReconstructionProofs.set(previewId, { revision, passed: false });
    const drawingProof = readDrawingProof();
    if (drawingProof) {
      drawingProofs.set(previewId, drawingProof);
      while (drawingProofs.size > DRAWING_PROOF_LIMIT) drawingProofs.delete(drawingProofs.keys().next().value);
    }
    if (replacement) replacementPreviews.add(previewId);
    while (previews.size > PREVIEW_LIMIT) {
      const oldest = previews.keys().next().value;
      previews.delete(oldest);
      replacementPreviews.delete(oldest);
      drawingProofs.delete(oldest);
      photoReconstructionProofs.delete(oldest);
      featureDependencyProofs.delete(oldest);
    }
  }
  /** Consume the own ID entries after a successful store Apply and before the
   * controller creates a possible new project scope.
   *
   * A real accepted replacement is the only Apply path that creates a new
   * project scope; the returned marker keeps that decision in the controller.
   * Unchanged DTOs of the same revision stay registered. */
  function acceptApplied(previewId, { alreadyApplied }) {
    const replaced = replacementPreviews.delete(previewId) && !alreadyApplied;
    photoReconstructionProofs.delete(previewId);
    featureDependencyProofs.delete(previewId);
    return replaced;
  }
  /** Remove the applied proposal after scope handling. Changed or replaced
   * Apply clears every drawing proof; an unchanged Apply retires only its own. */
  function finishApplied(previewId, { changed, replaced }) {
    previews.delete(previewId);
    if (changed || replaced) drawingProofs.clear();
    else drawingProofs.delete(previewId);
  }
  /** Restore failure: remove the proposal and its feature-dependency flag. */
  function rejectRestoredPreview(previewId) {
    previews.delete(previewId);
    featureDependencyProofs.delete(previewId);
  }
  /** Photo-reconstruction failure: remove its proof and then the proposal. */
  function rejectPhotoReconstruction(previewId) {
    photoReconstructionProofs.delete(previewId);
    previews.delete(previewId);
  }
  /** Contour-Rebind failure: remove proposal, drawing proof and feature flag. */
  function rejectContourRebind(previewId) {
    previews.delete(previewId);
    drawingProofs.delete(previewId);
    featureDependencyProofs.delete(previewId);
  }
  function getDrawingProof(previewId) {
    return drawingProofs.get(previewId);
  }
  function setPhotoReconstructionProof(previewId, proof) {
    photoReconstructionProofs.set(previewId, proof);
  }
  function getPhotoReconstructionProof(previewId) {
    return photoReconstructionProofs.get(previewId);
  }
  function hasFeatureDependency(previewId) {
    return featureDependencyProofs.has(previewId);
  }
  function addFeatureDependency(previewId) {
    featureDependencyProofs.add(previewId);
  }
  /** Public discard: release all five own ID entries. */
  function discardPreview(previewId) {
    previews.delete(previewId);
    replacementPreviews.delete(previewId);
    drawingProofs.delete(previewId);
    photoReconstructionProofs.delete(previewId);
    featureDependencyProofs.delete(previewId);
  }
  function dispose() {
    previews.clear();
    replacementPreviews.clear();
    drawingProofs.clear();
    photoReconstructionProofs.clear();
    featureDependencyProofs.clear();
  }
  return {
    getPreview,
    hasPreview,
    registerPreview,
    acceptApplied,
    finishApplied,
    rejectRestoredPreview,
    rejectPhotoReconstruction,
    rejectContourRebind,
    getDrawingProof,
    setPhotoReconstructionProof,
    getPhotoReconstructionProof,
    hasFeatureDependency,
    addFeatureDependency,
    discardPreview,
    dispose,
  };
}
