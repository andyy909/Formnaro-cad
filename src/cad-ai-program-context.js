// Menu navigation needs its trusted target catalogue and current UI state, not
// the geometry command schemas. The request loop asks again with the full
// contract before executing any model reply returned from this smaller scope.
// Pure program help needs the confirmed revision and the current selection, not
// the geometry records. The request loop keeps the full scene for revision and
// selection checks and sends it again before any modelling or measurement
// fallback is executed.
export function cadAIRequestScene(scene, { programHelpOnly = false } = {}) {
  if (!programHelpOnly || !scene || typeof scene !== 'object' || Array.isArray(scene)) return scene;
  const selectionTargets = Array.isArray(scene.selectionTargets) ? scene.selectionTargets : [],
    selected = new Set(selectionTargets.map((target) => JSON.stringify(target))),
    descriptions = (Array.isArray(scene.objects) ? scene.objects : [])
      .filter((object) => selected.has(JSON.stringify(object.target)))
      .map((object) => ({
        target: structuredClone(object.target),
        ...(object.name !== undefined ? { name: object.name } : {}),
        ...(object.kind !== undefined ? { kind: object.kind } : {}),
        ...(object.locked ? { locked: true } : {}),
      }));
  return {
    revision: scene.revision,
    ...(Array.isArray(scene.selection) && scene.selection.length
      ? { selection: structuredClone(scene.selection) }
      : {}),
    ...(selectionTargets.length
      ? { selectionTargets: structuredClone(selectionTargets), selectionDescription: descriptions }
      : {}),
  };
}
export function cadAIRequestContext(context, { programHelpOnly = false } = {}) {
  if (!programHelpOnly || !context?.programAssistant) return context;
  return {
    programHelpOnly: true,
    ...(context.localEngines ? { localEngines: context.localEngines } : {}),
    programAssistant: {
      ...context.programAssistant,
      scope:
        'Navigation and program explanations only. The native commandSchema and modelling tools are intentionally omitted from this request. Preserve confirmed geometry and any pending model proposal. Use the supplied catalogue, current mode and target state; disabled tools may be pointed at while explaining prerequisites. ' +
        context.programAssistant.scope,
      reply:
        'Return {revision,assistant:{kind:"help",query},message?} for one targeted local help lookup. Return {revision,assistant:{kind:"guide",steps:[{action:"point"|"click"|"set",target:catalogueId,text?:shortExplanation,value?:listedValue}]},message} to execute navigation. Put message at the TOP LEVEL, outside assistant; do not add checks to navigation. Bundle requested targets and explain their purpose and prerequisites in one or two sentences. Return {revision,assistant:{kind:"note",text},message} only for a requested provider context note. If the task actually requires constructing or measuring geometry or a staged model demonstration, return {revision,commands:[]} to request the complete modelling contract. The application discards that placeholder and regenerates with the full CAD API before executing anything.',
    },
  };
}
