import {cadProjectSnapshot} from './cad-project.js';
import {createCadLinkedContoursNative} from './cad-linked-contours-native.js';
import {stampCadContourLink,cadContourLinkProblems} from './cad-linked-contours-data.js';
import {buildCadBoundSubset} from './cad-project-parameters-native.js';
import {stampCadProjectParameters,planCadProjectParameters} from './cad-project-parameters-data.js';
import {buildCadDependencyGraph,cadDependencyAffected,cadDependencyNodeId} from './cad-dependency-graph.js';
import {cadPatternConsumerBindings} from './cad-pattern-consumers-data.js';

/** Keep the final contour/ancestor work visible in the operation report. */
export function mergeCadContourBuildReports(report,contours){
 if(!contours)return report;const result={...report};
 for(const field of ['affectedIds','stateChangedIds','rebuiltIds','constructedIds'])result[field]=[...new Set([...(report[field]??[]),...(contours[field]??[])])];
 if(contours.freecad){result.freecad=[...(report.freecad??[]),...contours.freecad];result.freecadCounts={...report.freecadCounts,...contours.freecadCounts};result.freecadWarnings=[...(report.freecadWarnings??[]),...(contours.freecadWarnings??[])];result.requiresFreeCADAcceptance=!!(report.requiresFreeCADAcceptance||contours.requiresFreeCADAcceptance);}
 result.counts={...report.counts};for(const [id,count]of Object.entries(contours.counts??{}))result.counts[id]=(result.counts[id]??0)+count;return result;
}

/** One topological pass after all copies are stamped. A shared CSG ancestor
 * is built after all of its contour sources, before drawings are projected. */
export async function updateCadPatternContours(project,plan,{oc,service,signal,editRecipe,freecadRun,collectConsumerChoices=false}={}){
 const consumers=plan.consumerPlan,linkIds=[...new Set([...plan.linkIds,...(consumers?.linkIds??[])])];
 if(!linkIds.length&&!consumers?.targets.length)return {project,updatedLinkIds:[],affectedIds:[]};
 let draft=cadProjectSnapshot(project);const native=createCadLinkedContoursNative({oc,service});
 if(plan.parameterData)draft.projectParameters={...structuredClone(plan.parameterData),...(project.projectParameters?.applied?{applied:structuredClone(project.projectParameters.applied)}:{})};
 const links=(draft.contourLinks?.links??[]).filter(link=>linkIds.includes(link.id)),byNode=new Map(links.map(link=>[link.target.path.at(-1)??link.target.rootId,link])),fresh=new Map(),actualIds=new Set();
 function index(node){actualIds.add(node.id);for(const child of node.children??[])index(child);}draft.nodes.forEach(index);
 const graph=buildCadDependencyGraph(draft),nodeOrder=[...new Set(graph.order.filter(node=>node.kind==='geometry'&&!node.missing).map(node=>node.target.path.at(-1)??node.target.rootId).filter(id=>actualIds.has(id)))];
 const bindings=[...new Map([...(plan.targetBindings??[]),...(consumers?cadPatternConsumerBindings(draft,consumers):[])].map(binding=>[binding.id,binding])).values()],consumerStates=consumers&&draft.projectParameters?planCadProjectParameters(draft,draft.projectParameters).changedStates.filter(state=>consumers.targets.some(target=>JSON.stringify(target)===JSON.stringify(state.target))):[],states=[...new Map([...(plan.targetStates??[]),...consumerStates].map(state=>[JSON.stringify(state.target),state])).values()];
 let partial,built;try{built=await buildCadBoundSubset(draft,bindings,{service,editRecipe,signal,states,dependentTargets:[...links.map(link=>link.target),...(consumers?.targets??[])],deferredContourTargets:links.map(link=>link.target),nodeOrder,freecadRun,freecadData:draft.projectParameters,freecadTargets:consumers?.freecadTargets??[],beforeNode:(node,context)=>{const link=byNode.get(node.id);if(link)try{const choice=consumers?.contourBindings.find(binding=>binding.id===link.id);if(choice)link.selector=native.candidate(context.project,{source:link.source,ray:choice.ray}).selector;fresh.set(link.id,native.refresh(context.project,link,{bindings,rebind:!!choice}));}catch(error){if(!collectConsumerChoices||!['CONTOUR_REBIND_REQUIRED','CONTOUR_SOURCE_NOT_HIT','CONTOUR_REFERENCE_LOST','CONTOUR_SOURCE_UNSUPPORTED'].includes(error.code))throw error;const blocked=cadDependencyAffected(graph,[cadDependencyNodeId('contour',link.id)]);partial={project:cadProjectSnapshot(context.project),partial:true,needsContours:[{id:link.id,source:structuredClone(link.source),target:structuredClone(link.target),code:error.code,message:error.message}],blockedRootIds:[...new Set([link.target.rootId,...blocked.filter(item=>item.target).map(item=>item.target.rootId)])],blockedContourIds:blocked.filter(item=>item.kind==='contour').map(item=>item.linkId)};throw Object.assign(Error('Die Konturfläche auf der fertigen Quelle ausdrücklich wählen.'),{code:'PATTERN_CONSUMER_CHOICE_PENDING'});}return node;}});}catch(error){if(!partial||error.code!=='PATTERN_CONSUMER_CHOICE_PENDING')throw error;return {project:partial.project,updatedLinkIds:[],affectedIds:[],consumerChoices:partial,report:{partial:true}};}draft=built.project;
 if(draft.contourLinks)draft.contourLinks.links=draft.contourLinks.links.map(link=>fresh.has(link.id)?stampCadContourLink(draft,fresh.get(link.id),{bindings}):link);
 if(plan.parameterData||consumers?.parameterData)draft.projectParameters=stampCadProjectParameters(draft,draft.projectParameters,{freecadTargets:built.report.freecad?.map(entry=>entry.target)??[]});
 const problems=cadContourLinkProblems(draft,draft.contourLinks,{includeHidden:true}).filter(problem=>linkIds.includes(problem.linkId));if(problems.length)throw Object.assign(Error(problems[0].message),{code:problems[0].code,problems});
 return {project:draft,updatedLinkIds:linkIds,affectedIds:[...new Set([...plan.targetRootIds,...(consumers?.targetRootIds??[])])],report:built.report};
}
