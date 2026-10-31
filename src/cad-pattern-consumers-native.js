import {cadProjectSnapshot} from './cad-project.js';
import {cadAIReferenceState,captureCadAISourceReference} from './cad-ai-feature-references.js';
import {createCadAIReferencesNative} from './cad-ai-feature-references-native.js';
import {cadJointProblems} from './cad-joints-data.js';
import {rebindCadReferencesNative} from './cad-reference-rebind-native.js';
import {planCadPatternConsumers,mapCadPatternConsumerSources} from './cad-pattern-consumers-data.js';
import {materializeCadLinkedPattern,stampCadLinkedPattern,cadLinkedPatternProblems} from './cad-linked-pattern-data.js';
import {planCadPatternContours} from './cad-linked-pattern-contour-data.js';
import {planCadPatternDrawings} from './cad-linked-pattern-drawing-data.js';
import {updateCadPatternContours,mergeCadContourBuildReports} from './cad-linked-pattern-contours-native.js';
import {updateCadPatternDrawings} from './cad-linked-pattern-drawings-native.js';

const key=t=>JSON.stringify([t.rootId,t.path]);
const fail=message=>{throw Object.assign(Error(message),{code:'PATTERN_CONSUMER_REASSIGN_REQUIRED'});};

/** Newly generated copies own new source IDs. Rebuild every cloned source
 * from its definition without revisiting unrelated downstream STEP results. */
export async function rebuildCadPatternCopies(project,sourceMappings,{service,signal,progress,sourceIds=[]}={}){
 const roots=new Set([...sourceIds,...sourceMappings.flatMap(mapping=>[mapping.sourceId,mapping.rootId])]),touched=new Set([...sourceIds,...sourceMappings.map(mapping=>mapping.sourceId)]),geometry=new Set();
 function visit(node){touched.add(node.id);geometry.add(node.id);for(const child of node.children??[])visit(child);}for(const mapping of sourceMappings){const copy=project.nodes.find(node=>node.id===mapping.rootId);if(!copy)fail('Eine neu erzeugte Musterkopie fehlt.');visit(copy);}
 if(!roots.size)return project;return service.rebuildSubset(project,{baseline:cadProjectSnapshot(project),rootIds:[...roots],touchedIds:[...touched],geometryIds:[...geometry],signal,progress});
}

/** A private read-only choice draft has no transaction/preview identity.
 * Exact clone maps are serialized for stable sourcePath choices on rerun. */
export function collectCadPatternConsumerChoices(before,project,plan,sourceMappings,{partial=false,needsContours=[],blockedRootIds=[],blockedContourIds=[]}={}){
 const sourceAddresses=[];for(const mapping of sourceMappings){const source=project.nodes.find(node=>node.id===mapping.sourceId);if(!source)continue;function visit(node,path){const mapped=path.map(id=>mapping.ids.get(id));if(mapped.every(Boolean))sourceAddresses.push({target:{rootId:mapping.rootId,path:mapped},source:{rootId:mapping.sourceId,path:[...path]},patternId:mapping.patternId,index:mapping.index,retained:mapping.retained});for(const child of node.children??[])visit(child,[...path,child.id]);}visit(source,[]);}
 const unresolvedReferences=(project.featureReferences?.items??[]).filter(reference=>plan.featureIds.includes(reference.id)).map(reference=>{const state=cadAIReferenceState(project,reference),old=before.featureReferences?.items.find(item=>item.id===reference.id),mapped=old&&plan.sourceBindings.some(binding=>key(binding.target)===key(old.target)),canPreserveSource=!reference.selector&&(!reference.target.path.length||mapped)&&old&&(cadAIReferenceState(before,old).status==='current'||mapped);return {id:reference.id,name:reference.name,kind:reference.kind,target:reference.target,status:state.status,code:state.code,message:state.message,requiresAssignment:state.status!=='current'&&!canPreserveSource};}).filter(reference=>reference.status!=='current');
 const unresolvedJoints=cadJointProblems(project).filter(problem=>plan.jointIds.includes(problem.jointId)||plan.copyRootIds.includes(problem.rootId)||plan.targetRootIds.includes(problem.rootId));
 return {partial,needsContours,blockedRootIds,blockedContourIds,unresolvedReferences,unresolvedJoints,sourceMappings:sourceMappings.map(({ids,...mapping})=>({...mapping,ids:[...ids].map(([sourceId,targetId])=>({sourceId,targetId}))})),sourceAddresses};
}

/** Spatial choices are checked on final geometry. Exact retained whole-source
 * addresses may be captured again; changed faces/edges always need a new pick. */
export function finishCadPatternConsumers(before,input,plan,{oc,service,signal,referenceBindings=plan.referenceBindings}={}){
 if(signal?.aborted)throw Object.assign(Error('Musteraktualisierung abgebrochen.'),{code:'ABORTED'});
 let project=cadProjectSnapshot(input);const explicit=new Set(referenceBindings?.features?.map(binding=>binding.id)??[]),preserved=[];
 if(project.featureReferences)project.featureReferences.items=project.featureReferences.items.map(reference=>{
  if(!plan.featureIds.includes(reference.id)||explicit.has(reference.id)||reference.selector||cadAIReferenceState(project,reference).status==='current')return reference;
  const old=before.featureReferences?.items.find(item=>item.id===reference.id),mapped=old&&plan.sourceBindings.some(binding=>key(binding.target)===key(old.target));
  if(!old||cadAIReferenceState(before,old).status!=='current'&&!mapped)fail('Den bereits verlorenen KI-Quellenbezug „'+reference.name+'“ ausdrücklich neu auswählen.');
  if(reference.target.path.length&&!mapped)fail('Die kopierte KI-Kindquelle „'+reference.name+'“ ausdrücklich einer aktuellen Vorlagenquelle zuordnen.');
  const fresh=captureCadAISourceReference(project,reference.target,{id:reference.id,name:reference.name,kind:reference.kind});preserved.push(reference.id);return fresh;
 });
 let referenceReport;if(referenceBindings){const repaired=rebindCadReferencesNative(project,referenceBindings,{oc,service,signal});project=repaired.project;referenceReport=repaired.report;}
 const query=createCadAIReferencesNative({oc,service});for(const id of plan.featureIds){const reference=project.featureReferences?.items.find(item=>item.id===id);if(!reference||cadAIReferenceState(project,reference).status!=='current')fail('Den betroffenen KI-Bezug „'+(reference?.name??id)+'“ auf der neuen Geometrie ausdrücklich neu auswählen.');query(project,{action:'resolve',reference});}
 const problems=cadJointProblems(project),previous=cadJointProblems(before),problemKey=problem=>JSON.stringify([problem.code,problem.jointId,problem.rootId]);
 if(problems.some(problem=>plan.jointIds.includes(problem.jointId)||plan.copyRootIds.includes(problem.rootId)||plan.targetRootIds.includes(problem.rootId)||!previous.some(old=>problemKey(old)===problemKey(problem))))fail('Die betroffenen Gelenkbezugssysteme ausdrücklich auf den fertigen Musterteilen neu zuordnen.');
 return {project:cadProjectSnapshot(project),report:{preservedSourceReferenceIds:preserved,...(referenceReport?{referenceRebind:referenceReport}:{})}};
}

/** Shared direct editor path. The caller checks the confirmed revision and
 * editable source; the native worker owns every final dependency and datum. */
export async function updateCadLinkedPatternWithConsumers(input,requested,{oc,service,editRecipe,signal,freecadRun,consumerBindings,baseline=input,progress,collectConsumerChoices=false}={}){
 const previous=input.linkedPatterns?.patterns.find(pattern=>pattern.id===requested.id),patterns=previous?[previous]:[],consumerPlan=planCadPatternConsumers(input,patterns,{consumerBindings}),contourPlan=planCadPatternContours(input,previous,{consumerPlan});
 contourPlan.consumerPlan=consumerPlan;contourPlan.linkIds=[...new Set([...contourPlan.linkIds,...consumerPlan.linkIds])];
 const drawingPlan=planCadPatternDrawings(input,patterns,[...contourPlan.targetRootIds,...consumerPlan.targetRootIds]);drawingPlan.views=[...new Map([...drawingPlan.views,...consumerPlan.drawingViews].map(view=>[JSON.stringify([view.sheetId,view.viewId]),view])).values()];
 const staged=consumerPlan.parameterData?{...input,projectParameters:consumerPlan.parameterData}:input,built=materializeCadLinkedPattern(staged,requested,{previous,drawingViews:planCadPatternDrawings(input,patterns).views,contourIds:contourPlan.directLinkIds,consumerPlan}),list=input.linkedPatterns?.patterns??[];
 built.project.linkedPatterns={version:1,patterns:[...list.filter(pattern=>pattern.id!==requested.id),built.pattern]};
 let draft=await rebuildCadPatternCopies(built.project,built.sourceMappings,{service,signal,progress,sourceIds:[requested.sourceId]});if(signal?.aborted)throw Object.assign(Error('Musteraktualisierung abgebrochen.'),{code:'ABORTED'});
 const pattern=stampCadLinkedPattern(draft,built.pattern);draft.linkedPatterns={version:1,patterns:[...list.filter(item=>item.id!==requested.id),pattern]};const problems=cadLinkedPatternProblems(draft,pattern);if(problems.length)throw Object.assign(Error(problems[0].message),{code:problems[0].code,problems});
 const mapped=mapCadPatternConsumerSources(draft,consumerPlan,built.sourceMappings);draft=mapped.project;contourPlan.consumerPlan={...consumerPlan,contourBindings:mapped.contourBindings};if(draft.projectParameters)contourPlan.parameterData=draft.projectParameters;
 const options={oc,service,editRecipe,signal,freecadRun,collectConsumerChoices},contours=await updateCadPatternContours(draft,contourPlan,options);
 if(contours.consumerChoices)return {project:contours.project,report:{choiceDraft:true,partial:true},consumerChoices:collectCadPatternConsumerChoices(input,contours.project,consumerPlan,built.sourceMappings,contours.consumerChoices),warnings:[]};
 const drawings=updateCadPatternDrawings(contours.project,drawingPlan.views,options),finished=collectConsumerChoices?{project:drawings.project,report:{}}:finishCadPatternConsumers(input,drawings.project,consumerPlan,{...options,referenceBindings:mapped.referenceBindings});
 return {project:finished.project,report:{...mergeCadContourBuildReports({},contours.report),...finished.report,updatedPatternIds:[pattern.id],updatedLinkIds:contours.updatedLinkIds,affectedIds:[...new Set([pattern.sourceId,...previous?.instances.map(item=>item.id)??[],...pattern.instances.map(item=>item.id),...contours.affectedIds])],drawingViews:drawings.report.updatedViews,drawingWarnings:drawings.warnings},drawingReport:drawings.report,changes:[{op:'linkedPattern',target:requested.sourceId}],warnings:[...new Set([...(contours.report?.freecadWarnings??[]),...drawings.warnings])],...(collectConsumerChoices?{consumerChoices:collectCadPatternConsumerChoices(input,finished.project,consumerPlan,built.sourceMappings)}:{})};
}
