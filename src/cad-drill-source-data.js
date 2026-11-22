import { findAssociativeDrillBox } from './cad-associative-drill.js';
import { findAssociativeStepDrillSource, stepDrillSourceSignature } from './cad-step-drill.js';
import { flags } from './organization.js';

/** Lost construction identities are repairable stored state. A cached BRep is
 * a visible last result, never proof that the current drill can be rebuilt. */
export function cadDrillSourceProblem(node, target) {
  if (!node.drill) return null;
  const drill = node.drill,
    source = node.children?.[0],
    base =
      drill.version === 3 ? findAssociativeStepDrillSource(source) : findAssociativeDrillBox(source, drill.version);
  let lost = !source || source.suppressed || source.id !== drill.sourceId || !base || base.node.id !== drill.boxId;
  if (!lost && drill.version === 3)
    try {
      lost = stepDrillSourceSignature(base.node) !== drill.sourceSignature;
    } catch {
      lost = true;
    }
  return lost
    ? {
        code: 'CAD_DRILL_SOURCE_REASSIGN_REQUIRED',
        message:
          'Die Konstruktionsquelle der Bohrung fehlt oder wurde ersetzt. Eine aktuelle Quelle und die Bohrungsflächen ausdrücklich neu zuordnen.',
        target,
      }
    : null;
}
export function cadDrillSourceProblems(project, { ids, includeHidden = false } = {}) {
  const problems = [];
  for (const root of project.nodes ?? []) {
    if (
      (ids && !ids.includes(root.id)) ||
      (!includeHidden && (root.kind !== 'cad' || !root.solid || root.suppressed || flags(root, project).hidden))
    )
      continue;
    function visit(node, path) {
      if (!includeHidden && node.suppressed) return;
      const problem = cadDrillSourceProblem(node, { rootId: root.id, path });
      if (problem) problems.push(problem);
      for (const child of node.children ?? []) visit(child, [...path, child.id]);
    }
    visit(root, []);
  }
  return problems;
}
// A finish wraps the intact drill as its sole source. Its persisted drawing
// address also identifies the start of the existing drill-edit chain.
export function cadDrillEditStart(node) {
  if (node?.drill) return { node, path: [] };
  if (node?.source === 'finish' && node.children?.length === 1 && node.children[0].drill)
    return { node: node.children[0], path: [node.children[0].id] };
  return null;
}

export function assertCadDrillSourcesReady(project, options = {}) {
  const problems = cadDrillSourceProblems(project, options);
  if (problems.length)
    throw Object.assign(Error(problems[0].message), { code: 'CAD_DRILL_SOURCE_REASSIGN_REQUIRED', problems });
}
