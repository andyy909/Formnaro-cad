import {verifyCadDrillReplacementSource} from './cad-drill-source-replacement-native.js';
import {cadProjectSnapshot} from './cad-project.js';
import {flags} from './organization.js';
import {reassignCadDrillReferences} from './cad-drill-rebind-native.js';
import {cadProjectParameterProblems,stampCadProjectParameters,applyCadProjectParameterStates} from './cad-project-parameters-data.js';
import {updateCadProjectParameters} from './cad-project-parameters-native.js';
import {createCadLinkedContoursNative,updateCadAssociative} from './cad-linked-contours-native.js';
import {cadJointProblems} from './cad-joints-data.js';
import {cadAIReferenceState} from './cad-ai-feature-references.js';
import {cadContourLinkProblems} from './cad-linked-contours-data.js';
import {cadSelectionContext} from './cad-interface-state.js';
import {planCadDrillRebind} from './cad-drill-rebind-plan.js';
import {cadDependencyAffected,cadDependencyNodeId} from './cad-dependency-graph.js';
import {materializeCadLinkedPattern,stampCadLinkedPattern,cadLinkedPatternProblems} from './cad-linked-pattern-data.js';
import {rebindCadReferencesNative} from './cad-reference-rebind-native.js';
import {planCadPatternDrawings} from './cad-linked-pattern-drawing-data.js';
import {updateCadPatternDrawings} from './cad-linked-pattern-drawings-native.js';
import {updateCadPatternContours,mergeCadContourBuildReports} from './cad-linked-pattern-contours-native.js';
import {cadPatternConsumerParameterPhase,mapCadPatternConsumerSources} from './cad-pattern-consumers-data.js';
import {finishCadPatternConsumers,collectCadPatternConsumerChoices} from './cad-pattern-consumers-native.js';

const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
function descendants(node,visit){visit(node);for(const child of node.children??[])descendants(child,visit);}

// One native operation: resolve explicit rays on retained stock first, collect
// scalar edits, then build every selected drill and its supported body copies.
// No intermediate model or parameter stamp is published to the caller.
export async function rebindCadDrillsCoordinated(input,options,{oc,service,editRecipe,signal,freecadRun,collectConsumerChoices=false}={}){
 const check=()=>{if(signal?.aborted)fail('ABORTED','Gemeinsame Bohrungsaktualisierung abgebrochen.');};check();
 let project=cadProjectSnapshot(input);const {id,bindings,parameterData,variantId,contourBindings=[]}=options,node=project.nodes.find(n=>n.id===id);
 if(!node)fail('UNKNOWN_CAD_OBJECT','CAD-Objekt fehlt.');if(node.kind!=='cad')fail('REFERENCE_MESH_NOT_CAD','Ein natives CAD-Teil wählen.');
 const state=flags(node,project);if(state.hidden||node.suppressed)fail('HIDDEN_CAD_REFERENCE','Ein sichtbares aktives CAD-Teil wählen.');
 let locked=state.locked;descendants(node,n=>{locked||=!!n.locked;});if(locked)fail('LOCKED_CAD_OBJECT','Teil, Quelle oder Container ist gesperrt.');
 if(project.linkedPatterns?.patterns.some(p=>p.instances.some(i=>i.id===id)))fail('PATTERN_INSTANCE_CONFLICT','Eine Musterquelle wählen oder die Kopie zuerst ausdrücklich lösen.');
 const planned=planCadDrillRebind(project,options),{targets,patternIds,patterns}=planned;
 let replacementReport;if(planned.stockReplacement){project=planned.stockReplacement.project;replacementReport=verifyCadDrillReplacementSource(planned.stockReplacement,{oc,service});}
 const consumerPlan=planned.consumerPlan,contourPlan=planned.patternContours,drawingPlan=planned.patternDrawings,deferredRoots=new Set([...contourPlan.targetRootIds,...consumerPlan.targetRootIds]);
 const visible=applyCadProjectParameterStates(project,planned.plan.changedStates.filter(s=>s.hidden!==undefined));
 for(const target of planned.dependentTargets){const context=cadSelectionContext(visible,target),ownedHidden=deferredRoots.has(target.rootId)&&planned.plan.evaluation.states.some(state=>state.target.rootId===target.rootId&&JSON.stringify(state.target.path)===JSON.stringify(target.path)&&state.hidden===true);if(context.locked||context.hidden&&!ownedHidden||context.sourceGeometryReadonly)fail('CAD_DRILL_DEPENDENCY_LOCKED','Eine notwendige abhängige Quelle ist gesperrt, ausgeblendet oder geometrisch geschützt.');}
 reassignCadDrillReferences(oc,project.nodes.find(n=>n.id===id),bindings,{replacement:planned.stockReplacement});
 // Resolve explicitly chosen contours on the confirmed retained stock, before
 // any dimensions change. Saved snapshots are retained for offset checking.
 const links=project.contourLinks&&structuredClone(project.contourLinks),contours=createCadLinkedContoursNative({oc,service});
 for(const binding of contourBindings){const link=links.links.find(l=>l.id===binding.id),picked=contours.candidate(project,{source:link.source,ray:binding.reference.ray});link.selector=picked.selector;}
 for(const p of patterns){
  const affected=cadDependencyAffected(planned.graph,[cadDependencyNodeId('pattern',p.id)]);
  for(const rootId of [p.sourceId,...p.instances.filter(i=>!p.excluded.includes(i.index)).map(i=>i.id)]){
   const root=project.nodes.find(n=>n.id===rootId);if(!root)fail('PATTERN_INSTANCE_CONFLICT','Musterquelle oder bestätigte Kopie fehlt.');
   let blocked=flags(root,project).locked||flags(root,project).hidden;descendants(root,n=>{blocked||=!!n.locked||!!n.hidden;});if(blocked)fail('LOCKED_CAD_OBJECT','Musterquelle oder Kopie ist gesperrt oder ausgeblendet.');
  }
 }
 check();const hasConsumers=planned.contourIds.length||planned.drawingViews.length||planned.freecadTargets.length;
 const phase=cadPatternConsumerParameterPhase(project,contourPlan.parameterPhaseData??consumerPlan.parameterData,consumerPlan);
 const result=hasConsumers?await updateCadAssociative(phase.project,{kind:'associativeUpdate',data:phase.data,updateIds:[],...(contourBindings.length?{links,rebindIds:contourBindings.map(b=>b.id)}:{}),drawingSheetIds:[...new Set(planned.drawingViews.map(v=>v.sheetId))]},{oc,service,editRecipe,signal,freecadRun,deferredDrawingViews:drawingPlan.views,deferredContourIds:contourPlan.linkIds,deferredParameterStates:contourPlan.deferredParameterStates,boundSubset:{seedTargets:[...planned.buildTargets,...planned.plan.changedStates.filter(s=>s.geometryChanged).map(s=>s.target)],targets:planned.dependentTargets.filter(target=>!deferredRoots.has(target.rootId)),parameterBindingIds:planned.bindingIds,bindings:[],drawingViews:planned.drawingViews,parameterStates:planned.plan.changedStates.filter(state=>!deferredRoots.has(state.target.rootId))}}):await updateCadProjectParameters(project,planned.plan.data,{service,editRecipe,signal,variantId,dependentTargets:planned.buildTargets});check();let draft=result.project;
 if(hasConsumers)draft.projectParameters=stampCadProjectParameters(draft,phase.data,{freecadTargets:result.report.freecad?.map(r=>r.target)??[]});
 if(consumerPlan.parameterData&&consumerPlan.targets.length){const receipts=new Map((consumerPlan.parameterData.applied?.inputs??[]).map(input=>[input.bindingId,input]));for(const input of draft.projectParameters?.applied?.inputs??[])receipts.set(input.bindingId,input);draft.projectParameters={...structuredClone(consumerPlan.parameterData),...(draft.projectParameters?.applied?{applied:{...draft.projectParameters.applied,inputs:[...receipts.values()]}}:{})};}
 if(!input.projectParameters&&parameterData===undefined&&variantId===undefined)delete draft.projectParameters;
 if(replacementReport?.pendingFaceColors){result.warnings=[...(result.warnings??[]),replacementReport.pendingFaceColors+' ursprüngliche Flächenfarben bleiben als offene Bezüge gespeichert; keine neue Fläche wird anhand ihrer Nummer geraten.'];result.report.requiresFreeCADAcceptance=true;}
 const affectedIds=new Set(result.report.affectedIds??[]),copyRoots=new Set(),touched=new Set(),geometry=new Set(),sourceMappings=[];
 for(const previous of patterns){
  const pattern=draft.linkedPatterns.patterns.find(p=>p.id===previous.id),built=materializeCadLinkedPattern(draft,pattern,{previous,drawingViews:planCadPatternDrawings(input,[previous]).views,contourIds:contourPlan.byPattern.find(plan=>plan.patternId===previous.id).directLinkIds,consumerPlan});draft=built.project;sourceMappings.push(...built.sourceMappings);
  draft.linkedPatterns.patterns=draft.linkedPatterns.patterns.map(p=>p.id===previous.id?built.pattern:p);
  copyRoots.add(built.pattern.sourceId);touched.add(built.pattern.sourceId);affectedIds.add(built.pattern.sourceId);
  for(const item of [...previous.instances,...built.pattern.instances])affectedIds.add(item.id);
  for(const item of built.pattern.instances){if(built.pattern.excluded.includes(item.index))continue;copyRoots.add(item.id);descendants(draft.nodes.find(n=>n.id===item.id),n=>{touched.add(n.id);geometry.add(n.id);});}check();
 }
 if(copyRoots.size){
  // Materialization has explicitly added/removed copy roots. The subset's
  // internal baseline owns that new topology; every copied source is rebuilt,
  // so a copied BRep never supplies its own construction proof.
  draft=await service.rebuildSubset(draft,{baseline:cadProjectSnapshot(draft),rootIds:[...copyRoots],touchedIds:[...touched],geometryIds:[...geometry],signal});check();
  draft.linkedPatterns.patterns=draft.linkedPatterns.patterns.map(p=>patternIds.has(p.id)?stampCadLinkedPattern(draft,p):p);
  for(const pattern of draft.linkedPatterns.patterns.filter(p=>patternIds.has(p.id))){const problems=cadLinkedPatternProblems(draft,pattern);if(problems.length)fail(problems[0].code,problems[0].message);}
 }
 const mapped=mapCadPatternConsumerSources(draft,consumerPlan,sourceMappings);draft=mapped.project;contourPlan.consumerPlan={...consumerPlan,contourBindings:mapped.contourBindings};if(draft.projectParameters)contourPlan.parameterData=draft.projectParameters;
 const copiedContours=await updateCadPatternContours(draft,contourPlan,{oc,service,signal,editRecipe,freecadRun,collectConsumerChoices});check();
 if(copiedContours.consumerChoices)return {...copiedContours,consumerChoices:collectCadPatternConsumerChoices(input,copiedContours.project,consumerPlan,sourceMappings,copiedContours.consumerChoices)};
 result.report=mergeCadContourBuildReports(result.report,copiedContours.report);result.warnings=[...(result.warnings??[]),...(copiedContours.report?.freecadWarnings??[])];for(const id of copiedContours.affectedIds)affectedIds.add(id);result.report.updatedLinkIds=[...new Set([...(result.report.updatedLinkIds??[]),...copiedContours.updatedLinkIds])];
 const drawings=updateCadPatternDrawings(copiedContours.project,drawingPlan.views,{oc,service,signal});draft=drawings.project;result.warnings=[...(result.warnings??[]),...drawings.warnings];result.drawingReport={...drawings.report,updatedSheetIds:[...new Set([...(result.drawingReport?.updatedSheetIds??[]),...drawings.report.updatedSheetIds])],updatedViewIds:[...new Set([...(result.drawingReport?.updatedViewIds??[]),...drawings.report.updatedViewIds])]};
 const problems=cadProjectParameterProblems(draft);if(problems.length)fail('CAD_DRILL_PARAMETERS_UNRESOLVED',problems[0].message);
 // Shared drawing inputs may contain an already stale, unrelated contour.
 // The general updater can visit it, but this request must never publish a
 // change outside the planned closure. An unchanged refresh is harmless.
 for(const linkId of result.report.updatedLinkIds??[])if(!planned.contourIds.includes(linkId)){
  const before=input.contourLinks.links.find(l=>l.id===linkId),after=draft.contourLinks.links.find(l=>l.id===linkId),oldTarget=cadSelectionContext(input,before.target),newTarget=cadSelectionContext(draft,after.target);
  if(JSON.stringify(before)!==JSON.stringify(after)||JSON.stringify(oldTarget.node)!==JSON.stringify(newTarget.node)||JSON.stringify(oldTarget.world)!==JSON.stringify(newTarget.world))fail('CAD_DRILL_DEPENDENCY_SCOPE_REQUIRED','Eine unbeteiligte veraltete Kontur im selben Zeichnungsblatt zuerst gesondert aktualisieren oder ausdrücklich neu zuordnen.');
 }
 const contourProblems=cadContourLinkProblems(draft).filter(p=>planned.contourIds.includes(p.linkId));if(contourProblems.length)fail(contourProblems[0].code,contourProblems[0].message);
 let referenceReport;if(options.referenceBindings!==undefined){const repaired=rebindCadReferencesNative(draft,options.referenceBindings,{oc,service,signal});draft=repaired.project;referenceReport=repaired.report;}
 if(collectConsumerChoices)return {project:draft,consumerChoices:collectCadPatternConsumerChoices(input,draft,consumerPlan,sourceMappings),report:result.report,warnings:result.warnings};
 if(consumerPlan.copyRootIds.length||consumerPlan.targets.length||mapped.referenceBindings){const finished=finishCadPatternConsumers(input,draft,consumerPlan,{oc,service,signal,referenceBindings:mapped.referenceBindings});draft=finished.project;result.report={...result.report,...finished.report};}
 const previousJoints=cadJointProblems(input),jointProblems=cadJointProblems(draft).filter(p=>!previousJoints.some(old=>old.jointId===p.jointId&&old.rootId===p.rootId&&old.code===p.code));if(jointProblems.length)fail('CAD_DRILL_JOINT_REASSIGN_REQUIRED','Die Änderung verändert einen Gelenkbezug. Das betroffene Bezugssystem ausdrücklich neu zuordnen.');
 const unresolvedReferences=[];
 for(const reference of draft.featureReferences?.items??[]){const before=cadAIReferenceState(input,reference),after=cadAIReferenceState(draft,reference);if(before.status==='current'&&after.status!=='current')unresolvedReferences.push({kind:'feature',referenceId:reference.id,name:reference.name,message:'Gespeicherten Merkmalsbezug „'+reference.name+'“ ausdrücklich neu auswählen. Der ursprüngliche Bezug bleibt erhalten.'});}
 for(const sheet of draft.drawings?.sheets??[])for(const annotation of sheet.annotations)if(annotation.unresolved&&planned.drawingViews.some(v=>v.sheetId===sheet.id&&v.viewId===annotation.viewId))unresolvedReferences.push({kind:'drawing',sheetId:sheet.id,annotationId:annotation.id,message:'Zeichnungsmaß '+annotation.id+' ausdrücklich neu zuordnen. Der ursprüngliche Bezug bleibt erhalten.'});
 check();return {project:cadProjectSnapshot(draft),drawingReport:result.drawingReport,warnings:[...new Set([...(result.warnings??[]),...unresolvedReferences.map(r=>r.message)])],report:{...result.report,updatedLinkIds:(result.report.updatedLinkIds??[]).filter(id=>planned.contourIds.includes(id)),affectedIds:[...affectedIds],reboundDrills:targets,...(replacementReport?{sourceReplacement:replacementReport}:{}),reboundContourIds:contourBindings.map(b=>b.id),updatedPatternIds:patterns.map(p=>p.id),drawingWarnings:drawings.warnings,drawingViews:[...planned.drawingViews.filter(view=>!drawingPlan.views.some(deferred=>deferred.sheetId===view.sheetId&&deferred.viewId===view.viewId)),...drawings.report.updatedViews],...(referenceReport?{referenceRebind:referenceReport}:{}),unresolvedReferences,coordinatedParameters:true}};
}
