import {prepareCadDrillSourceReplacement,remapCadDrillStockParameters} from './cad-drill-source-replacement-data.js';
import {createCadProjectParameters,validateCadProjectParameters,cadProjectParameterProblems} from './cad-project-parameters-data.js';
import {planCadParameterPatterns} from './cad-linked-pattern-update-data.js';
import {cadDependencyAffected,cadDependencyNodeId} from './cad-dependency-graph.js';
import {planCadReferenceRebind} from './cad-reference-rebind-data.js';
import {planCadParameterPatternContours} from './cad-linked-pattern-contour-data.js';
import {planCadPatternDrawings} from './cad-linked-pattern-drawing-data.js';
import {planCadPatternConsumers} from './cad-pattern-consumers-data.js';

const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
function parameterLayout(data){
 const {applied,activeVariantId,...layout}=data;
 return {...layout,parameters:data.parameters.map(({value,...p})=>p),variants:data.variants.map(({values,...v})=>v)};
}

// Kernel-free plan also scopes lazy FNPACK reads. Only values and the selected
// existing variant can change; binding identities and external inputs survive.
export function planCadDrillRebind(project,{id,bindings,parameterData,variantId,contourBindings=[],referenceBindings,sourceReplacement,consumerBindings}){
 if(!Array.isArray(bindings)||!bindings.length||bindings.length>13||bindings.some(b=>!b||!Array.isArray(b.path??[])||(b.path??[]).length>12||(b.path??[]).some(p=>typeof p!=='string'||!p)))fail('CAD_DRILL_REBIND_REQUIRED','Eine bis 13 vorhandene Bohrungen ausdrücklich zuordnen.');
 if(!Array.isArray(contourBindings)||contourBindings.length>32||new Set(contourBindings.map(b=>b?.id)).size!==contourBindings.length||contourBindings.some(b=>!b||typeof b!=='object'||Object.keys(b).some(k=>!['id','reference'].includes(k))||typeof b.id!=='string'||!b.reference||Object.keys(b.reference).length!==1||!b.reference.ray||!project.contourLinks?.links.some(l=>l.id===b.id&&l.source.rootId===id)))fail('CAD_DRILL_REBIND_REQUIRED','Eindeutige bestehende Konturbezüge auf derselben erhaltenen Quelle mit freien Strahlen neu wählen.');
 const beforeReplacement=project,stockReplacement=sourceReplacement?prepareCadDrillSourceReplacement(project,id,sourceReplacement,bindings):null;if(stockReplacement){project=stockReplacement.project;parameterData=remapCadDrillStockParameters(parameterData,stockReplacement);}
 if(parameterData===undefined&&variantId===undefined){const problems=cadProjectParameterProblems(beforeReplacement).filter(problem=>!stockReplacement||!problem.target||JSON.stringify([problem.target.rootId,problem.target.path])!==JSON.stringify([stockReplacement.previousStockTarget.rootId,stockReplacement.previousStockTarget.path]));if(problems.length)fail('CAD_DRILL_PARAMETERS_UNRESOLVED','Die ausstehenden Parameter ausdrücklich in die gemeinsame Vorschau aufnehmen. '+problems[0].message);}
 const current=validateCadProjectParameters(project.projectParameters??createCadProjectParameters()),data=validateCadProjectParameters(parameterData===undefined?current:parameterData);
 if(canonical(parameterLayout(current))!==canonical(parameterLayout(data)))fail('CAD_DRILL_PARAMETER_LAYOUT_CHANGED','Bei der Flächenzuordnung nur vorhandene Parameter-/Variantenwerte ändern. Bindungen, Namen und Kennungen erhalten.');
 const planned=planCadParameterPatterns(project,data,{variantId});if(planned.plan.problems.length){const p=planned.plan.problems[0];fail(p.code,p.message);}
 const targets=bindings.map(b=>({rootId:id,path:[...(b.path??[])]})),buildTargets=[...targets,...(stockReplacement?[stockReplacement.stockTarget]:[])],downstream=cadDependencyAffected(planned.graph,[...buildTargets.map(target=>cadDependencyNodeId('geometry',target)),...contourBindings.map(b=>cadDependencyNodeId('contour',b.id)),...planned.affected.filter(n=>n.kind==='parameter').map(n=>n.id),...planned.plan.changedBindings.map(b=>cadDependencyNodeId('binding',b.id)),...planned.plan.changedStates.filter(s=>s.geometryChanged).map(s=>cadDependencyNodeId('geometry',s.target))]);
 const patternIds=new Set(downstream.filter(n=>n.kind==='pattern').map(n=>n.patternId));
 const pendingPatterns=(project.linkedPatterns?.patterns??[]).filter(p=>(p.bindings??[]).some(b=>b.field.split('.').reduce((value,key)=>value?.[key],p)!==planned.plan.evaluation.values[b.parameterId]));
 if(parameterData===undefined&&variantId===undefined&&pendingPatterns.some(p=>patternIds.has(p.id)))fail('CAD_DRILL_PARAMETERS_UNRESOLVED','Ausstehende Musterparameter ausdrücklich in die gemeinsame Vorschau aufnehmen.');
 if(parameterData!==undefined||variantId!==undefined)for(const p of pendingPatterns)patternIds.add(p.id);
 const patterns=planned.graph.order.filter(n=>n.kind==='pattern'&&patternIds.has(n.patternId)).map(n=>project.linkedPatterns.patterns.find(p=>p.id===n.patternId));
 const affected=cadDependencyAffected(planned.graph,[...downstream.map(n=>n.id),...patterns.map(p=>cadDependencyNodeId('pattern',p.id))]),copyIds=new Set(patterns.flatMap(p=>p.instances.map(i=>i.id)));
 const dependentTargets=[...new Map([...buildTargets,...affected.filter(n=>['geometry','localPose'].includes(n.kind)&&!n.missing).map(n=>n.target),...planned.plan.changedBindings.map(b=>b.target),...planned.plan.changedStates.filter(s=>s.geometryChanged).map(s=>s.target)].filter(t=>!copyIds.has(t.rootId)).map(t=>[JSON.stringify(t),t])).values()];
 const bindingIds=planned.plan.evaluation.bindings.filter(b=>dependentTargets.some(t=>t.rootId===b.target.rootId&&JSON.stringify(t.path)===JSON.stringify(b.target.path))).map(b=>b.id);
 const consumerPlan=planCadPatternConsumers(project,patterns,{data:planned.plan.data,consumerBindings}),contourIds=affected.filter(n=>n.kind==='contour').map(n=>n.linkId),patternContours=planCadParameterPatternContours(project,{patterns,statePatterns:planned.statePatterns,plan:planned.plan},{sourceContourIds:contourIds,consumerPlan}),patternDrawings=planCadPatternDrawings(project,patterns,[...patternContours.targetRootIds,...consumerPlan.targetRootIds]);patternContours.consumerPlan=consumerPlan;patternContours.linkIds=[...new Set([...patternContours.linkIds,...consumerPlan.linkIds])];patternDrawings.views=[...new Map([...patternDrawings.views,...consumerPlan.drawingViews].map(view=>[JSON.stringify([view.sheetId,view.viewId]),view])).values()];
 const drawingViews=[...new Map([...affected.filter(n=>n.kind==='drawingView').map(n=>({sheetId:n.sheetId,viewId:n.viewId})),...patternDrawings.views].map(view=>[JSON.stringify([view.sheetId,view.viewId]),view])).values()];
 // Consumers may read other bodies in the same view or program. Scope their
 // complete upstream inputs without loading unrelated project blocks.
 const required=new Set(affected.filter(n=>['contour','freecadRun','drawingView'].includes(n.kind)).map(n=>n.id)),parents=new Map();
 for(const edge of planned.graph.edges){const list=parents.get(edge.to)??[];list.push(edge.from);parents.set(edge.to,list);}
 const queue=[...required];for(let i=0;i<queue.length;i++)for(const previous of parents.get(queue[i])??[])if(!required.has(previous)){required.add(previous);queue.push(previous);}
 const referencePlan=referenceBindings===undefined?null:planCadReferenceRebind(project,referenceBindings);
 const requiredRootIds=[...new Set([id,...dependentTargets.map(t=>t.rootId),...planned.graph.nodes.filter(n=>required.has(n.id)&&n.target).map(n=>n.target.rootId),...patternContours.requiredRootIds,...patternContours.targetRootIds,...patternDrawings.requiredRootIds,...consumerPlan.requiredRootIds,...(referencePlan?.geometryRootIds??[]),...(stockReplacement?.requiredRootIds??[])])];
 return {...planned,consumerPlan,targets,buildTargets,stockReplacement,patternIds,patterns,patternContours,patternDrawings,dependentTargets,bindingIds,drawingViews,requiredRootIds,contourIds:[...new Set([...contourIds,...patternContours.linkIds])],freecadTargets:[...new Map([...affected.filter(n=>n.kind==='freecadRun').map(n=>n.target),...consumerPlan.freecadTargets].map(target=>[JSON.stringify([target.rootId,target.path]),target])).values()]};
}
