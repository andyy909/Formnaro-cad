import {isFreeCADParameterField,freeCADParameterKey,freeCADTargetKey} from './cad-freecad-parameter-data.js';
import {evaluateCadProjectParameters,planCadProjectParameters,validateCadProjectParameters} from './cad-project-parameters-data.js';
import {buildCadDependencyGraph,cadDependencyAffected,cadDependencyNodeId} from './cad-dependency-graph.js';
import {validateFreeCADSource,freeCADSourceDigest} from './cad-freecad-source.js';
import {cadSelectionContext as resolveRerunContext} from './cad-interface-state.js';
import {resolveFreeCADDocumentTarget} from './cad-freecad-target.js';
import {planCadAIFeatureDependencies} from './cad-ai-feature-dependencies.js';

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
 if(!plain(request)||Object.keys(request).some(k=>!['target','sourceDigest','parameters','inputs'].includes(k)))fail('Neulauf benötigt Ziel, Quellrevision, Parameter und ausdrückliche aktuelle Eingaben.');
 const context=resolveFreeCADDocumentTarget(project,request.target,{write:true}),saved=validateFreeCADSource(context.node.metadata.freecadSource);
 if(request.sourceDigest!==freeCADSourceDigest(saved.documentBase64))fail('Die FreeCAD-Quelle wurde geändert. Neu lesen.','STALE_REVISION');
 const mode=saved.script?'script':saved.plan?'plan':null;if(!mode)fail('Dieses native Dokument enthält kein gespeichertes Skript oder CAD-Programm.');
 const original=saved[mode],parameters=validateFreeCADRerunParameters(request.parameters,original.parameters??{});
 const ownBindings=(project.projectParameters?.bindings??[]).filter(binding=>freeCADTargetKey(binding.target)===freeCADTargetKey(context.target)&&isFreeCADParameterField(binding.field));
 const controls=ownBindings.filter(binding=>!sameFreeCADData(parameters[freeCADParameterKey(binding.field)],original.parameters?.[freeCADParameterKey(binding.field)])).map(binding=>({target:context.target,field:binding.field,value:parameters[freeCADParameterKey(binding.field)]})),parameterPlan=planCadAIFeatureDependencies(project,controls,{targets:[context.target]});
 if(ownBindings.length){const evaluated=evaluateCadProjectParameters(parameterPlan.data);for(const binding of evaluated.bindings.filter(binding=>ownBindings.some(old=>old.id===binding.id)))parameters[freeCADParameterKey(binding.field)]=binding.value;}
 if(!Array.isArray(request.inputs)||request.inputs.length>8)fail('Bis zu acht aktuelle Quellen ausdrücklich wählen; ohne Quellen eine leere Liste verwenden.');
 const affected=new Set(planCadAIFeatureDependencies(project,[],{targets:[context.target]}).targets.map(t=>t.rootId)),seen=new Set(),inputs=[],inputReview=[];
 for(const input of request.inputs){
  if(!plain(input)||Object.keys(input).some(k=>!['name','target'].includes(k))||typeof input.name!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(input.name)||seen.has(input.name))fail('Eindeutige einfache Quellnamen und vorhandene Teile wählen.');
  const selectedTarget=typeof input.target==='string'?{rootId:input.target,path:[]}:plain(input.target)&&Object.keys(input.target).every(k=>['rootId','path'].includes(k))&&typeof input.target.rootId==='string'&&Array.isArray(input.target.path)&&input.target.path.every(id=>typeof id==='string')?input.target:null;
  if(!selectedTarget||!ownBindings.length&&selectedTarget.path.length)fail('Eine vorhandene CAD- oder Netzquelle wählen.');
  const selected=resolveRerunContext(project,selectedTarget),node=selected.node;if(!['cad','mesh','referenceMesh'].includes(node.kind))fail('Eine vorhandene CAD- oder Netzquelle wählen.');
  const containsResult=selectedTarget.rootId===context.target.rootId&&selectedTarget.path.length<=context.target.path.length&&selectedTarget.path.every((id,index)=>id===context.target.path[index]);
  if(containsResult||!ownBindings.length&&affected.has(selectedTarget.rootId))fail('Das Ergebnis und seine Folgegeometrie dürfen keine Eingabe des eigenen Neulaufs sein.','FREECAD_RERUN_CYCLE');
  seen.add(input.name);inputs.push({name:input.name,target:selectedTarget.rootId});inputReview.push({name:input.name,target:structuredClone(selectedTarget),label:node.name});
 }
 let coordinated;
 if(ownBindings.length){
  const data=structuredClone(parameterPlan.data),config=data.freecad.find(run=>freeCADTargetKey(run.target)===freeCADTargetKey(context.target));if(!config)fail('Die bestätigte Eingabezuordnung des gebundenen Programms fehlt.');config.inputs=inputReview.map(input=>({name:input.name,target:input.target}));
  const validated=validateCadProjectParameters(data),planned=planCadProjectParameters(project,validated),graph=buildCadDependencyGraph(project,{projectParameters:planned.data}),seeds=[cadDependencyNodeId('freecadRun',context.target),...parameterPlan.changedBindings.map(binding=>cadDependencyNodeId('binding',binding.id))],affected=cadDependencyAffected(graph,seeds);
  const targets=[...new Map(affected.filter(node=>node.target&&node.kind==='geometry').map(node=>[freeCADTargetKey(node.target),node.target])).values()];for(const target of targets){const selected=resolveRerunContext(project,target);if(selected.locked||selected.hidden||selected.sourceGeometryReadonly)fail('Eine notwendige abhängige Quelle ist gesperrt, ausgeblendet oder geometrisch geschützt.','AI_FEATURE_DEPENDENCY_LOCKED');}
  coordinated={data:planned.data,bindingIds:parameterPlan.changedBindings.map(binding=>binding.id),freecadTargets:affected.filter(node=>node.kind==='freecadRun').map(node=>node.target),targets,drawingViews:affected.filter(node=>node.kind==='drawingView').map(node=>({sheetId:node.sheetId,viewId:node.viewId})),review:parameterPlan.review};
 }
 const parameterChanges=Object.keys(parameters).filter(k=>!sameFreeCADData(parameters[k],original.parameters[k])).map(name=>({name,before:structuredClone(original.parameters[name]),value:structuredClone(parameters[name])}));
 return {context,saved,mode,parameters,coordinated,operation:{kind:'build',[mode]:{...original,parameters},inputs},parameterChanges,inputReview,replacesNative:saved.version===2&&saved.mode==='native'};
}
