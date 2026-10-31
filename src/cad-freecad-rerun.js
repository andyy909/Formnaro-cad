import {isFreeCADParameterField,freeCADParameterKey,freeCADTargetKey} from './cad-freecad-parameter-data.js';
import {evaluateCadProjectParameters,planCadProjectParameters,validateCadProjectParameters} from './cad-project-parameters-data.js';
import {buildCadDependencyGraph,cadDependencyAffected,cadDependencyNodeId} from './cad-dependency-graph.js';
import {validateFreeCADSource,freeCADSourceDigest} from './cad-freecad-source.js';
import {cadSelectionContext as resolveRerunContext} from './cad-interface-state.js';
import {resolveFreeCADDocumentTarget} from './cad-freecad-target.js';
import {planCadAIFeatureDependencies} from './cad-ai-feature-dependencies.js';
import {prepareFreeCADInputBindings} from './cad-freecad-input-rebind-data.js';
import {assertFreeCADInputReadiness} from './cad-freecad-input-readiness.js';

const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const sameFreeCADData=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const fail=(message,code='FREECAD_RERUN_INPUT')=>{throw Object.assign(Error(message),{code});};
const plain=v=>v&&Object.getPrototypeOf(v)===Object.prototype;
const omitParameters=v=>Object.fromEntries(Object.entries(v??{}).filter(([k])=>k!=='parameters'));

export function validateFreeCADRerunParameters(value,original){
 if(!plain(value)||!sameFreeCADData(Object.keys(value).sort(),Object.keys(original??{}).sort()))fail('Genau die gespeicherten Skript-/Planparameter verwenden.');
 const seen=new Set();function json(v,depth=0){
  if(depth>20)fail('Parameter sind zu tief verschachtelt.');
  if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return;
  if(!v||typeof v!=='object'||seen.has(v)||!Array.isArray(v)&&!plain(v))fail('Parameter benötigen endliche JSON-Werte.');
  seen.add(v);for(const [key,item]of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(key))fail('Ungültiger Parameterschlüssel.');json(item,depth+1);}seen.delete(v);
 }json(value);if(JSON.stringify(value).length>8*1024*1024)fail('Parameter überschreiten das lokale Größenlimit.');return structuredClone(value);
}

/** A rerun authorizes parameter values, never a replacement program. */
export function assertFreeCADReplacementProgram(old,source){
 if(source.version!==2)fail('Versionierte FreeCAD-Quelle erforderlich.');
 if(source.mode==='native'){
  if(!sameFreeCADData(old.script,source.script)||!sameFreeCADData(old.plan,source.plan))fail('Native Dokumentänderung darf das Originalprogramm nicht ersetzen.');
  return;
 }
 const mode=old.script?'script':old.plan?'plan':null;
 if(!mode||source.mode!==mode||source[mode==='script'?'plan':'script']!==undefined||!sameFreeCADData(omitParameters(old[mode]),omitParameters(source[mode]))||source.changes.length)fail('Beim Neulauf ausschließlich Parameter des gespeicherten Programms ändern.');
 validateFreeCADRerunParameters(source[mode].parameters??{},old[mode].parameters??{});
}

export function prepareFreeCADRerun(project,request){
 if(!plain(request)||Object.keys(request).some(k=>!['target','sourceDigest','parameters','inputs','inputBindings'].includes(k)))fail('Neulauf benötigt Ziel, Quellrevision, Parameter und ausdrückliche aktuelle Eingaben.');
 const context=resolveFreeCADDocumentTarget(project,request.target,{write:true}),saved=validateFreeCADSource(context.node.metadata.freecadSource);
 if(request.sourceDigest!==freeCADSourceDigest(saved.documentBase64))fail('Die FreeCAD-Quelle wurde geändert. Neu lesen.','STALE_REVISION');
 const mode=saved.script?'script':saved.plan?'plan':null;if(!mode)fail('Dieses native Dokument enthält kein gespeichertes Skript oder CAD-Programm.');
 const original=saved[mode],parameters=validateFreeCADRerunParameters(request.parameters,original.parameters??{});
 const staged=prepareFreeCADInputBindings(project,{target:context.target,inputs:request.inputs,inputBindings:request.inputBindings});project=staged.project;
 const ownBindings=(project.projectParameters?.bindings??[]).filter(binding=>freeCADTargetKey(binding.target)===freeCADTargetKey(context.target)&&isFreeCADParameterField(binding.field));
 const controls=ownBindings.filter(binding=>!sameFreeCADData(parameters[freeCADParameterKey(binding.field)],original.parameters?.[freeCADParameterKey(binding.field)])).map(binding=>({target:context.target,field:binding.field,value:parameters[freeCADParameterKey(binding.field)]})),parameterPlan=planCadAIFeatureDependencies(project,controls,{targets:staged.targets});
 if(ownBindings.length){const evaluated=evaluateCadProjectParameters(parameterPlan.data);for(const binding of evaluated.bindings.filter(binding=>ownBindings.some(old=>old.id===binding.id)))parameters[freeCADParameterKey(binding.field)]=binding.value;}
 const inputReview=staged.inputReview,inputs=inputReview.map(input=>({name:input.name,target:input.target.rootId}));
 if(!ownBindings.length&&inputReview.some(input=>parameterPlan.targets.some(target=>target.rootId===input.target.rootId)))fail('Das Ergebnis und seine Folgegeometrie dürfen keine Eingabe des eigenen Neulaufs sein.','FREECAD_RERUN_CYCLE');
 let coordinated;
 if(ownBindings.length){
  const data=structuredClone(parameterPlan.data),config=data.freecad.find(run=>freeCADTargetKey(run.target)===freeCADTargetKey(context.target));if(!config)fail('Die bestätigte Eingabezuordnung des gebundenen Programms fehlt.');config.inputs=inputReview.map(input=>({name:input.name,target:input.target}));
  const validated=validateCadProjectParameters(data),planned=planCadProjectParameters(project,validated),graph=buildCadDependencyGraph(project,{projectParameters:planned.data}),seeds=[...staged.targets.map(target=>cadDependencyNodeId('freecadRun',target)),...parameterPlan.changedBindings.map(binding=>cadDependencyNodeId('binding',binding.id))],affected=cadDependencyAffected(graph,seeds);
  const freecadTargets=affected.filter(node=>node.kind==='freecadRun').map(node=>node.target),runKeys=new Set(freecadTargets.map(freeCADTargetKey));assertFreeCADInputReadiness(project,{data:planned.data,graph,freecadTargets,bindingIds:parameterPlan.changedBindings.map(binding=>binding.id),inputTargets:planned.data.freecad.filter(run=>runKeys.has(freeCADTargetKey(run.target))).flatMap(run=>run.inputs.map(input=>input.target))});
  const targets=[...new Map(affected.filter(node=>node.target&&node.kind==='geometry').map(node=>[freeCADTargetKey(node.target),node.target])).values()];for(const target of targets){const selected=resolveRerunContext(project,target);if(selected.locked||selected.hidden||selected.sourceGeometryReadonly)fail('Eine notwendige abhängige Quelle ist gesperrt, ausgeblendet oder geometrisch geschützt.','AI_FEATURE_DEPENDENCY_LOCKED');}
  coordinated={data:planned.data,bindingIds:parameterPlan.changedBindings.map(binding=>binding.id),freecadTargets:affected.filter(node=>node.kind==='freecadRun').map(node=>node.target),targets,drawingViews:affected.filter(node=>node.kind==='drawingView').map(node=>({sheetId:node.sheetId,viewId:node.viewId})),review:parameterPlan.review};
 }
 else assertFreeCADInputReadiness(project,{data:parameterPlan.data,graph:buildCadDependencyGraph(project,{projectParameters:parameterPlan.data}),inputTargets:inputReview.map(input=>input.target)});
 const parameterChanges=Object.keys(parameters).filter(k=>!sameFreeCADData(parameters[k],original.parameters[k])).map(name=>({name,before:structuredClone(original.parameters[name]),value:structuredClone(parameters[name])}));
 return {context,saved,mode,parameters,coordinated,rerunTargets:staged.targets,inputRebindings:staged.inputRebindings,operation:{kind:'build',[mode]:{...original,parameters},inputs},parameterChanges,inputReview,replacesNative:saved.version===2&&saved.mode==='native'};
}
