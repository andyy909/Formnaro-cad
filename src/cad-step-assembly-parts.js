import { cadColorPartsNative } from './cad-analysis-native.js';
import { readCadBrep } from './cad-native-kernel.js';
import { hasCurrentPartSurfaceGroups, partFaceColors } from './cad-part-properties.js';
import { exportCadStep, isRigidStepPlacement } from './cad-step-io.js';
import { cadStepProjectTree } from './cad-step-project-tree.js';

function hasThread(node) {
  return node.recipe?.type === 'thread' ||
    node.children?.some(child => !child.suppressed && hasThread(child));
}

function isComponentGroup(node) {
  if (node.source !== 'group' || node.operation !== 'union' || !node.multicolor ||
      hasCurrentPartSurfaceGroups(node)) return false;
  const active = node.children.filter(child => !child.suppressed);
  // A cut, a single source, or a helical feature is manufacturing history.
  // Export the finished body as one product rather than cutting it into color regions.
  return active.length > 1 && active.every(child => child.solid) && !hasThread(node);
}

export function exportCadStepProjectAssembly(oc, project, nodes) {
  const componentGroups = new Set(nodes.filter(isComponentGroup).map(node => node.id));
  const definitionIds = new Set(nodes.flatMap(node => node.definitionId ? [node.definitionId] : []));
  const repeatByBrep = new Map(), repeatByNode = new Map();
  let nextDefinition = 1;
  for (const node of nodes) {
    if (componentGroups.has(node.id) || node.definitionId || !isRigidStepPlacement(node.transform) ||
        partFaceColors(node).length) continue;
    const brep = node.brep.data;
    const styles = repeatByBrep.get(brep) ?? new Map();
    const style = JSON.stringify([node.color, node.opacity ?? 1]);
    let repeat = styles.get(style);
    if (!repeat) {
      repeat = { count: 0, id: null };
      styles.set(style, repeat);
      repeatByBrep.set(brep, styles);
    }
    repeat.count++;
    repeatByNode.set(node.id, repeat);
  }

  const parts = [];
  try {
    for (const node of nodes) {
      const { id, name, color, opacity } = node;
      if (node.source === 'step' && node.definitionId && !node.multicolor && !node.children) {
        if (!isRigidStepPlacement(node.transform))
          throw Error(`STEP-Baugruppenbaum: Die Lage von „${name}“ enthält Skalierung, Scherung oder Spiegelung. Einen gewöhnlichen STEP-Export verwenden, um diese Geometrie auszugeben.`);
        const occurrenceStyle = color ? { color, opacity: opacity ?? 1 } : undefined;
        parts.push({ id, name, shape: readCadBrep(oc, node.brep.data), occurrenceStyle,
          faceColors: partFaceColors(node), definitionId: node.definitionId, placement: { matrix: node.transform } });
        continue;
      }

      const repeat = repeatByNode.get(id);
      if (repeat?.count > 1) {
        if (!repeat.id) {
          do { repeat.id = `formnaro-native-${nextDefinition++}`; } while (definitionIds.has(repeat.id));
          definitionIds.add(repeat.id);
        }
        parts.push({ id, name, color, opacity, shape: readCadBrep(oc, node.brep.data),
          definitionId: repeat.id, placement: { matrix: node.transform } });
        continue;
      }

      if (componentGroups.has(id)) {
        // Partition the final union against direct components only. Regions
        // are disjoint and retain the finished bores and cuts of each child.
        const children = node.children.map(child => ({ ...child, multicolor: false }));
        const regions = cadColorPartsNative(oc, { ...node, children });
        if (regions.length > 1) {
          for (const region of regions) parts.push({ ...region, id });
          continue;
        }
        regions.forEach(region => region.shape.delete());
        componentGroups.delete(id);
      }
      for (const part of cadColorPartsNative(oc, { ...node, multicolor: false })) parts.push({ ...part, id });
    }
    return exportCadStep(oc, parts, { assemblyTree: cadStepProjectTree(project, parts, componentGroups) });
  } finally {
    parts.forEach(part => part.shape.delete());
  }
}
