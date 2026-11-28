import { cadBounds, readCadBrep, transformCad } from '../../src/cad-native-kernel.js';
import { importCadStepAssembly } from '../../src/cad-step-io.js';

/** Measure the exported geometry at its actual placement. Legacy readers already
 * return geometry in world coordinates. */
export function importStepWorldTree(oc, bytes) {
  function visit(node) {
    if (node.children) return { ...node, children: node.children.map(visit) };
    if (!node.worldTransform) return node;
    const original = readCadBrep(oc, node.brep.data);
    let placed;
    try {
      placed = transformCad(oc, original, node.worldTransform);
      const { min, max } = cadBounds(oc, placed);
      return { ...node, stats: { ...node.stats, bounds: { min, max } } };
    } finally {
      placed?.delete();
      original.delete();
    }
  }
  return importCadStepAssembly(oc, bytes).map(visit);
}
