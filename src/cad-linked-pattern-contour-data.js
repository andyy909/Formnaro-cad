import {buildCadDependencyGraph} from './cad-dependency-graph.js';
import {cadContourLinkProblems,cadContourProfileSignature,cadContourRelativePlacementSignature} from './cad-linked-contours-data.js';
import {flags} from './organization.js';
import {cadProjectParameterExportProblems} from './cad-project-parameters-export.js';
import {planCadContourHeightBindings,withoutCadContourHeightBindings,withoutCadContourTargetStates} from './cad-pattern-contour-height-data.js';
import {evaluateCadProjectParameters} from './cad-project-parameters-data.js';
import {cadSelectionContext} from './cad-interface-state.js';
import {cadLinkedPatternProblems} from './cad-linked-pattern-data.js';
import {cadPatternConsumerReferenceScope} from './cad-pattern-consumers-data.js';

const fail=message=>{throw Object.assign(Error(message),{code:'PATTERN_CONTOUR_SCOPE_UNSUPPORTED'});};
const bindingKey=binding=>JSON.stringify([binding.target.rootId,binding.target.path,binding.field,binding.parameterId]);
const address=target=>JSON.stringify([target.rootId,target.path]);
const mentions=(value,ids)=>typeof value==='string'?ids.has(value):Array.isArray(value)?value.some(v=>mentions(v,ids)):!!value&&typeof value==='object'&&Object.values(value).some(v=>mentions(v,ids));
function contourClosure(project,pattern){
 const copies=new Set(pattern?.instances.map(item=>item.id)??[]),roots=new Set(copies),selected=new Set(),targets=new Set();let changed=true;
 while(changed){changed=false;for(const link of project.contourLinks?.links??[])if((copies.has(link.source.rootId)||targets.has(address(link.source)))&&!selected.has(link.id)){selected.add(link.id);roots.add(link.target.rootId);targets.add(address(link.target));changed=true;}}
 return {copies,roots,selected};
}

/** A root-state change can require a drawing refresh without rebuilding its
 * upstream pattern. Keep that scope distinct from geometry-driven changes. */
export function patternsForCadContourStates(project,states){
 if(!states.length)return [];return (project.linkedPatterns?.patterns??[]).filter(pattern=>{const {selected}=contourClosure(project,pattern),targets=new Set((project.contourLinks?.links??[]).filter(link=>selected.has(link.id)).map(link=>link.target.rootId));return states.some(state=>targets.has(state.target.rootId));});
}

/** Contour chains without other mutable consumers. Initial source
 * readiness is checked on the confirmed project, before any planned edits. */
export function planCadPatternContours(project,pattern,{projectParameters=project.projectParameters,sourceBindings=[],sourceContourIds=[],consumerPlan}={}){
 const {copies,roots,selected}=contourClosure(project,pattern);
 if(!selected.size)return {linkIds:[],directLinkIds:[],targetRootIds:[],requiredRootIds:[],targetAddresses:[],targetBindings:[]};
 // Only native root bindings owned by the same parameter plan may still be
 // pending. Missing targets, formulas, FreeCAD inputs and real stale link
 // snapshots are never covered by this private phase permission.
 // A coordinated drill plan may also own earlier original-source contours.
 // Copied contours never grant themselves permission to hide stale inputs.
 const sourceOwners=new Set(sourceContourIds.filter(id=>!selected.has(id))),ownedSourceProblem=problem=>sourceOwners.has(problem.linkId)&&(!problem.causeLinkId||sourceOwners.has(problem.causeLinkId));
 const inputs={ids:[pattern.sourceId],format:'step',includeHidden:true},scheduled=new Map(sourceBindings.map(binding=>[binding.id,bindingKey(binding)])),parameterProblems=cadProjectParameterExportProblems(project,inputs),scheduledNative=problem=>project.nodes.find(node=>node.id===pattern.sourceId)?.source==='native'&&problem.code==='PARAMETERS_UPDATE_REQUIRED'&&problem.bindingId&&scheduled.has(problem.bindingId)&&project.projectParameters.bindings.some(binding=>binding.id===problem.bindingId&&bindingKey(binding)===scheduled.get(binding.id))&&problem.target.rootId===pattern.sourceId&&!problem.target.path.length,nativePending=parameterProblems.length>0&&parameterProblems.every(scheduledNative),sourceProblems=cadContourLinkProblems(project,project.contourLinks,inputs),ownedSourcePending=sourceProblems.some(ownedSourceProblem),inputProblems=[...parameterProblems.filter(problem=>!scheduledNative(problem)),...sourceProblems.filter(problem=>!ownedSourceProblem(problem))];if(inputProblems.length)fail('Die ursprüngliche Musterquelle zuerst ausdrücklich aktualisieren. '+inputProblems[0].message);
 const graph=buildCadDependencyGraph(project),links=graph.order.filter(node=>node.kind==='contour'&&selected.has(node.linkId)).map(node=>project.contourLinks.links.find(link=>link.id===node.linkId)),targets=new Set(links.map(link=>link.target.rootId)),targetAddresses=links.map(link=>link.target),targetKeys=new Set(targetAddresses.map(address));
 const mappedLinks=new Set(links.filter(link=>consumerPlan?.sourceBindings.some(binding=>address(binding.target)===address(link.source))||consumerPlan?.contourBindings.some(binding=>binding.id===link.id)).map(link=>link.id));
 const states=new Map(project.projectParameters?evaluateCadProjectParameters(project.projectParameters).states.map(state=>[address(state.target),state]):[]);
 for(const link of links){if(copies.has(link.target.rootId)||link.source.path.length&&!targetKeys.has(address(link.source))&&!mappedLinks.has(link.id))fail('Quellen innerhalb einer neu erzeugten Musterkopie zuerst ausdrücklich neu zuordnen.');let context;try{context=cadSelectionContext(project,link.target);}catch{fail('Eine betroffene Konturskizze fehlt.');}const {node,chain,root}=context;
  if(mappedLinks.has(link.id)&&(!link.snapshot||cadContourProfileSignature(node.recipe?.sketch??{})!==link.snapshot.targetProfileSignature||cadContourRelativePlacementSignature(node.transform)!==cadContourRelativePlacementSignature(link.snapshot.targetFrame)))fail('Eine unabhängig veränderte Zielkontur zuerst gesondert aktualisieren. Die Quellenneuwahl bestätigt keine Zieländerung.');
  if(node.source!=='native'||node.recipe?.type!=='sketch'||node.children?.length||node.finish||node.modeling||node.partition||node.extraction||node.metadata?.freecadSource||node.metadata?.parametricSource||node.metadata?.photoReconstruction||node.annotations?.length||node.metadata?.stepFaceColors||node.metadata?.partProperties?.surfaces||context.locked||context.sourceGeometryReadonly||chain.slice(0,-1).some(parent=>parent.source!=='group'||parent.finish||parent.modeling||parent.partition||parent.extraction||parent.metadata?.freecadSource||parent.metadata?.parametricSource||parent.metadata?.photoReconstruction||parent.annotations?.length||parent.metadata?.stepFaceColors||parent.metadata?.partProperties?.surfaces))fail('Eine betroffene Konturskizze fehlt, ist geschützt oder besitzt zusätzliche Flächenbezüge.');
  if(flags({...root,hidden:false},project).hidden)fail('Der Ordner oder die Ebene einer betroffenen Konturskizze ist ausgeblendet.');
  for(let index=0;index<chain.length;index++){const part=chain[index],owned=states.get(address({rootId:root.id,path:chain.slice(1,index+1).map(n=>n.id)}));if(part.hidden&&owned?.hidden!==true||part.suppressed&&owned?.suppressed!==true)fail('Eine betroffene Konturskizze oder ihr Container ist unabhängig ausgeblendet oder unterdrückt.');}
 }
 // A CSG root can contain current contours owned by other patterns. Their
 // exact sketch controls are not consumers of this branch; ancestor controls
 // and other programs still remain visible to the root-level consumer guard.
 const controlTargets=project.contourLinks.links.filter(link=>targets.has(link.target.rootId)).map(link=>link.target),controlKeys=new Set(controlTargets.map(address)),controls=planCadContourHeightBindings(project,controlTargets,projectParameters),targetBindings=controls.filter(binding=>targetKeys.has(address(binding.target))),currentBindings=project.projectParameters?.bindings.filter(binding=>controlKeys.has(address(binding.target)))??[];
 const consumerScope=cadPatternConsumerReferenceScope(project,consumerPlan),requestedScope=cadPatternConsumerReferenceScope({...project,projectParameters},consumerPlan).projectParameters;
 for(const name of ['projectParameters','joints','featureReferences','workplane'])if(mentions(name==='projectParameters'?withoutCadContourTargetStates(withoutCadContourHeightBindings(consumerScope[name],currentBindings),controlTargets):consumerScope[name],targets))fail('Eine betroffene Konturskizze besitzt zusätzliche Programm-, Gelenk- oder Merkmalsbezüge. Diese zuerst gesondert bearbeiten.');
 if(mentions(withoutCadContourTargetStates(withoutCadContourHeightBindings(requestedScope,controls),controlTargets),targets))fail('Weitere Verbraucher einer betroffenen Konturskizze werden noch nicht gemeinsam unterstützt.');
 if(project.linkedPatterns?.patterns.some(other=>targets.has(other.sourceId)||other.instances.some(item=>targets.has(item.id))))fail('Eine betroffene Konturskizze wird von einem weiteren Körpermuster verwendet.');
 for(const node of project.nodes)if(!roots.has(node.id)&&mentions(node,targets))fail('Ein weiteres Teil verwendet eine betroffene Konturskizze.');
 const currentProblems=cadContourLinkProblems(project,project.contourLinks,{includeHidden:true}).filter(problem=>selected.has(problem.linkId)),pendingLinks=new Set(currentProblems.filter(problem=>problem.code==='CONTOUR_SOURCE_PARAMETERS_PENDING').map(problem=>problem.linkId)),mappedProblem=problem=>mappedLinks.has(problem.linkId)&&['CONTOUR_REFERENCE_LOST','LOST_PARAMETER_TARGET','CONTOUR_UPDATE_REQUIRED','CONTOUR_SOURCE_PARAMETERS_PENDING'].includes(problem.code)||mappedLinks.has(problem.causeLinkId)&&['CONTOUR_UPSTREAM_BLOCKED','CONTOUR_UPDATE_REQUIRED'].includes(problem.code),problems=currentProblems.filter(problem=>!mappedProblem(problem)&&(!(nativePending||ownedSourcePending)||!(problem.code==='CONTOUR_SOURCE_PARAMETERS_PENDING'||['CONTOUR_UPSTREAM_BLOCKED','CONTOUR_UPDATE_REQUIRED'].includes(problem.code)&&(pendingLinks.has(problem.causeLinkId)||sourceOwners.has(problem.causeLinkId)))));if(problems.length)fail('Betroffene Konturen zuerst ausdrücklich aktualisieren oder neu zuordnen. '+problems[0].message);
 return {linkIds:links.map(link=>link.id),directLinkIds:links.filter(link=>copies.has(link.source.rootId)).map(link=>link.id),targetRootIds:[...targets],requiredRootIds:[...new Set([...targets,...links.map(link=>link.source.rootId)])],targetAddresses,targetBindings};
}

/** Combine several pattern branches before native work so shared drawing
 * views are refreshed only after every copied contour source is ready. */
export function planCadParameterPatternContours(project,{patterns,statePatterns=[],plan},{sourceContourIds=[],consumerPlan}={}){
 const options={projectParameters:plan.data,sourceBindings:plan.changedBindings.filter(binding=>!binding.target.path.length&&!binding.field.startsWith('freecad.')),sourceContourIds,consumerPlan};
 const unchangedPlan=pattern=>{const issues=cadLinkedPatternProblems(project,pattern);if(issues.length)fail('Ein unverändertes Muster der gemeinsamen Konturgruppe muss zuerst ausdrücklich aktualisiert werden. '+issues[0].message);return {patternId:pattern.id,...planCadPatternContours(project,pattern,options)};};
 const plans=patterns.map(pattern=>({patternId:pattern.id,...planCadPatternContours(project,pattern,options)})),roots=new Set(plans.flatMap(plan=>plan.targetRootIds));
 // Requested controls on another contour branch in the same CSG root join
 // this last pass. Its unchanged body pattern does not need materialization.
 const candidates=patternsForCadContourStates(project,[...plan.changedBindings,...plan.changedStates]);let added=true;
 while(added){added=false;for(const pattern of candidates)if(!plans.some(entry=>entry.patternId===pattern.id)){
  const {selected}=contourClosure(project,pattern);if(project.contourLinks.links.some(link=>selected.has(link.id)&&roots.has(link.target.rootId))){const extra=unchangedPlan(pattern);plans.push(extra);for(const rootId of extra.targetRootIds)roots.add(rootId);added=true;}
 }}
 const statePlans=statePatterns.filter(pattern=>!plans.some(changed=>changed.patternId===pattern.id)).map(unchangedPlan),ids=new Set(plans.flatMap(plan=>plan.linkIds)),targetBindings=[...new Map(plans.flatMap(plan=>plan.targetBindings??[]).map(binding=>[binding.id,binding])).values()];
 const targetKeys=new Set(plans.flatMap(plan=>plan.targetAddresses??[]).map(address)),targetStates=plan.changedStates.filter(state=>targetKeys.has(address(state.target))&&state.geometryChanged),deferredParameterStates=targetStates.map(state=>state.target);
 return {byPattern:plans,linkIds:ids.size?buildCadDependencyGraph(project).order.filter(node=>node.kind==='contour'&&ids.has(node.linkId)).map(node=>node.linkId):[],targetRootIds:[...new Set([...plans,...statePlans].flatMap(plan=>plan.targetRootIds))],requiredRootIds:[...new Set([...plans,...statePlans].flatMap(plan=>plan.requiredRootIds??[]))],targetBindings,targetStates,deferredParameterStates,...(targetBindings.length||targetStates.length?{parameterData:plan.data,parameterPhaseData:withoutCadContourTargetStates(withoutCadContourHeightBindings(plan.data,targetBindings),deferredParameterStates)}:{})};
}

/** This permission is private to native pattern update operations. */
export function patternContourReferenceScope(data,linkIds,affected,retained,{sourceBindings=[]}={}){
 if(!data||!linkIds.length)return data;const ids=new Set(linkIds),copy=structuredClone(data);
 copy.links=copy.links.filter(link=>{if(!ids.has(link.id))return true;if(link.source.path.length&&!sourceBindings.some(binding=>address(binding.target)===address(link.source))||!affected.has(link.source.rootId)||affected.has(link.target.rootId))fail('Die Konturfreigabe gehört zu keiner unterstützten Musterkopie.');if(!retained.has(link.source.rootId))fail('Eine verwendete Musterkopie würde entfallen. Zuerst Kontur ausdrücklich neu zuordnen oder die Kopie lösen.');return false;});return copy;
}
