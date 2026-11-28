// Stable part identity for glTF/GLB documents.
//
// cadGltf writes one mesh node per part and stores the part ID as
// node.extras.formnaroPartId. Display names are not unique, so consumers must
// resolve parts by this ID. This module only reads in-memory documents; the
// exporter owns writing the annotation.
export const CAD_GLTF_PART_ID_KEY = 'formnaroPartId';

/** Reads the static node identity without changing the document. */
export function cadGltfNodeIdentity(document) {
  const nodes = Array.isArray(document?.nodes) ? document.nodes : [],
    byPartId = new Map(),
    byName = new Map(),
    duplicatePartIds = [],
    unidentified = [];
  nodes.forEach((node, index) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.name === 'string' && node.name) {
      const indices = byName.get(node.name) ?? [];
      indices.push(index);
      byName.set(node.name, indices);
    }
    const partId = node.extras?.[CAD_GLTF_PART_ID_KEY];
    if (typeof partId === 'string' && partId) {
      if (byPartId.has(partId)) duplicatePartIds.push(partId);
      else byPartId.set(partId, index);
    } else if (node.mesh !== undefined) unidentified.push(index);
  });
  return {
    byPartId,
    byName,
    ambiguousNames: [...byName].filter(([, indices]) => indices.length > 1).map(([name]) => name),
    duplicatePartIds,
    unidentified,
    complete: unidentified.length === 0 && duplicatePartIds.length === 0,
  };
}
