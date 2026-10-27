import {buildCadDependencyGraph,cadDependencyAffected,cadDependencyNodeId} from './cad-dependency-graph.js';
import {dispatchFreeCAD} from './cad-freecad-dispatch.js';
import {evaluateCadProjectParameters} from './cad-project-parameters-data.js';
import {cadSelectionContext} from './cad-interface-state.js';
import {isFreeCADParameterField,freeCADParameterKey,freeCADTargetKey,freeCADParameterProgram} from './cad-freecad-parameter-data.js';
import {freeCADSourceDigest,validateFreeCADSource} from './cad-freecad-source.js';
import {sameFreeCADData} from './cad-freecad-rerun.js';

export function createFreeCADParameterHost(project,data,{variantId,targets,programParameters=[],desktop=globalThis.offlinecadDesktop}={}){
 const evaluation=evaluateCadProjectParameters(data,{variantId}),allowed=new Map(),started=new Set(),scope=targets&&new Set(targets.map(freeCADTargetKey));
 for(const binding of evaluation.bindings.filter(b=>isFreeCADParameterField(b.field)&&(!scope||scope.has(freeCADTargetKey(b.target))))){const key=freeCADTargetKey(binding.target);let run=allowed.get(key);if(!run){const node=cadSelectionContext(project,binding.target).node,{source,mode,program}=freeCADParameterProgram(node);run={source,mode,program,parameters:structuredClone(programParameters.find(entry=>freeCADTargetKey(entry.target)===key)?.parameters??program.parameters??{}),config:data.freecad?.find(r=>freeCADTargetKey(r.target)===key)};allowed.set(key,run);}run.parameters[freeCADParameterKey(binding.field)]=binding.value;}
 return async(request,{signal}={})=>{
  const key=request?.target&&freeCADTargetKey(request.target),run=allowed.get(key),fail=reason=>{throw Object.assign(Error('Nicht autorisierte FreeCAD-Worker-Rückfrage: '+reason+'.'),{code:'FREECAD_PARAMETER_AUTHORITY'});};
  if(!run||!run.config)fail('Ziel liegt außerhalb der bestätigten Abhängigkeiten');
  if(started.has(key))fail('Programm wurde in diesem Auftrag bereits gestartet');
  if(Object.keys(request).some(k=>!['target','sourceDigest','script','plan','inputs'].includes(k)))fail('unbekannte Auftragsfelder');
  if(request.sourceDigest!==freeCADSourceDigest(run.source.documentBase64))fail('abweichende Quelldatei');
  if(!sameFreeCADData(request[run.mode],{...run.program,parameters:run.parameters})||request[run.mode==='script'?'plan':'script']!==undefined)fail('abweichende Programmdefinition oder Parameter');
  if(!Array.isArray(request.inputs)||request.inputs.length!==run.config.inputs.length||!sameFreeCADData(request.inputs.map(i=>i.name),run.config.inputs.map(i=>i.name)))fail('abweichende bestätigte Eingaben');
  started.add(key);signal?.throwIfAborted();if(!desktop?.runFreeCADReply)throw Object.assign(Error('FreeCAD-Parameter benötigen die Desktop-Ausgabe.'),{code:'FREECAD_UNAVAILABLE'});
  const requestId=crypto.randomUUID(),abort=()=>Promise.resolve(desktop.cancelFreeCAD?.({requestId})).catch(()=>{});signal?.addEventListener('abort',abort,{once:true});
  try{
   const reply=await dispatchFreeCAD(desktop,{requestId,[run.mode]:request[run.mode],inputs:request.inputs,inspectOnly:false},{signal});signal?.throwIfAborted();if(!reply?.ok)throw Object.assign(Error(reply?.error??'FreeCAD-Neulauf fehlgeschlagen.'),{code:reply?.code??'FREECAD_FAILED'});
   const r=reply.value;if(!r.resultObject||r.report?.check!=='passed'||r.stepReadback?.check!=='passed')throw Error('FreeCAD-Ergebnis benötigt gültige Geometrie und STEP-Rückleseprüfung.');
   const source=validateFreeCADSource({...run.source,version:2,[run.mode]:request[run.mode],engineVersion:r.engineVersion,documentBase64:r.documentBase64,documentDigest:freeCADSourceDigest(r.documentBase64),resultObject:r.resultObject,mode:run.mode,changes:[]});
   const parameterChanges=Object.keys(run.parameters).filter(name=>!sameFreeCADData(run.parameters[name],run.program.parameters[name])).map(name=>({name,before:run.program.parameters[name],value:run.parameters[name]}));
   return {source,bytes:Uint8Array.from(atob(r.stepBase64),c=>c.charCodeAt(0)),report:{mode:run.mode,geometry:r.report,stepReadback:r.stepReadback,parameterChanges,replacesNative:run.source.version===2&&run.source.mode==='native',engineVersion:r.engineVersion}};
  }finally{signal?.removeEventListener('abort',abort);}
 };
}

// A document edit grants execution only to its actual downstream programs.
// Its own saved program and unrelated bindings receive no host authority.
export function createFreeCADDependencyHost(project,targets,options={}){
 const graph=buildCadDependencyGraph(project),seeds=targets.flatMap(target=>['geometry','localPose'].map(kind=>cadDependencyNodeId(kind,target))),downstream=cadDependencyAffected(graph,seeds).filter(node=>node.kind==='freecadRun').map(node=>node.target);
 return createFreeCADParameterHost(project,project.projectParameters,{...options,targets:downstream});
}
