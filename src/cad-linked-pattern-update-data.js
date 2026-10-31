import {buildCadDependencyGraph,cadDependencyAffected,cadDependencyNodeId} from './cad-dependency-graph.js';
import {createCadProjectParameters,evaluateCadProjectParameters,planCadProjectParameters} from './cad-project-parameters-data.js';
import {patternsForCadContourStates} from './cad-linked-pattern-contour-data.js';
import {cadContourProfileBindingChangeIds} from './cad-contour-profile-bindings.js';

// Pattern-only scalar changes do not appear in ordinary geometry bindings.
// Compute their affected closure from evaluated before/after values, including
// variant overrides, and never infer it merely from the parameter plan flag.
export function planCadParameterPatterns(project,data,{variantId}={}){
 const plan=planCadProjectParameters(project,data,{variantId}),before=evaluateCadProjectParameters(project.projectParameters??createCadProjectParameters()),after=plan.evaluation;
 const graph=buildCadDependencyGraph(project,{projectParameters:plan.data}),seeds=[];
 for(const p of project.linkedPatterns?.patterns??[])for(const b of p.bindings??[])if(!Object.hasOwn(after.values,b.parameterId))throw Object.assign(Error('Gebundener Musterparameter fehlt. Den Bezug zuerst ausdrücklich lösen.'),{code:'PATTERN_PARAMETER_LOST',patternId:p.id});
 for(const id of new Set([...Object.keys(before.values),...Object.keys(after.values)]))if(before.values[id]!==after.values[id]&&graph.nodes.some(n=>n.id===cadDependencyNodeId('parameter',id)))seeds.push(cadDependencyNodeId('parameter',id));
 for(const b of plan.changedBindings)seeds.push(cadDependencyNodeId('binding',b.id));
 for(const state of plan.changedStates)seeds.push(cadDependencyNodeId('geometry',state.target));
 const affected=seeds.length?cadDependencyAffected(graph,[...new Set(seeds)]):[],patterns=affected.filter(n=>n.kind==='pattern').map(n=>project.linkedPatterns.patterns.find(p=>p.id===n.patternId));
 const profileIds=new Set(cadContourProfileBindingChangeIds(project,plan.evaluation.bindings)),profileTargets=(project.contourLinks?.links??[]).filter(link=>profileIds.has(link.id)).map(link=>({target:link.target})),statePatterns=patternsForCadContourStates(project,[...plan.changedStates,...profileTargets]);
 return {plan,graph,affected,patterns,statePatterns,requiresPatternUpdate:!!(patterns.length||statePatterns.length)};
}
