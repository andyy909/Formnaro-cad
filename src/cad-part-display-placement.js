import { validateAffineMatrix } from './cad-project.js';
import { explosionOffsets, validateExplosion } from './cad-part-properties.js';

const position = (matrix) => matrix.slice(12, 15);

export function assemblyDisplayMatrix(matrix, offset) {
  const placed = [...matrix];
  for (let axis = 0; axis < 3; axis++) placed[12 + axis] += offset[axis];
  return placed;
}

/** Read-only placement data for one completed part. The assembly matrix is the
 * existing scene/controller worldMatrix and remains the model truth. The
 * exploded matrix applies the stored display translation in the same order as
 * the renderer (T(offset) * assembly), so no model or export placement changes.
 * Returns null direction when the stored explosion has no entry for this part. */
export function explodedPartPlacement(explosion, part) {
  if (!part || typeof part !== 'object' || typeof part.id !== 'string' || !part.id)
    throw Error('Teilkennung für die Anzeigeplatzierung fehlt.');
  if (part.target?.path?.length) throw Error('Anzeigeplatzierung nur für ein vollständiges Teil.');
  const state = validateExplosion(explosion),
    assemblyMatrix = validateAffineMatrix(part.worldMatrix, 'worldMatrix'),
    entry = state?.parts.find((value) => value.id === part.id) ?? null,
    offset = explosionOffsets(state, { nodes: [{ id: part.id }] })[0]?.offset ?? [0, 0, 0],
    explodedMatrix = assemblyDisplayMatrix(assemblyMatrix, offset);
  return {
    id: part.id,
    distance: state?.distance ?? 0,
    direction: entry ? [...entry.direction] : null,
    displayOffset: offset,
    assemblyMatrix,
    assemblyPosition: position(assemblyMatrix),
    explodedMatrix,
    explodedPosition: position(explodedMatrix),
  };
}
