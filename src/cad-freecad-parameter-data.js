import {projectObjectGeometryKey} from './project-objects.js';
import {cadGeometryDigest} from './cad-geometry-digest.js';
import {multiplyCadMatrices,cadIdentity} from './cad-affine.js';

export const FREECAD_PARAMETER_PREFIX='freecad.parameters.';
export const isFreeCADParameterField=field=>typeof field==='string'&&field.startsWith(FREECAD_PARAMETER_PREFIX)&&field.length>FREECAD_PARAMETER_PREFIX.length&&!['__proto__','constructor','prototype'].includes(field.slice(FREECAD_PARAMETER_PREFIX.length));
export const freeCADParameterKey=field=>field.slice(FREECAD_PARAMETER_PREFIX.length);
export const freeCADTargetKey=target=>JSON.stringify([target.rootId,target.path]);
const fail=(message,code='FREECAD_PARAMETER_INPUT')=>{throw Object.assign(Error(message),{code});};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;

export function freeCADParameterProgram(node){
 const source=node?.metadata?.freecadSource,mode=source?.script?'script':source?.plan?'plan':null;
 if(node?.kind!=='cad'||node.source!=='step'||!mode)fail('Eine erhaltene STEP-Quelle mit gespeichertem FreeCAD-Programm wählen.');
 return {source,mode,program:source[mode]};
}
export function freeCADProgramDigest(node){const {program}=freeCADParameterProgram(node),{parameters,...definition}=program;return cadGeometryDigest(JSON.stringify(canonical(definition)));}
export function freeCADParameterValue(node,field){const {program}=freeCADParameterProgram(node),key=freeCADParameterKey(field),value=program.parameters?.[key];if(!Object.hasOwn(program.parameters??{},key)||typeof value!=='number'||!Number.isFinite(value))fail('Der gebundene numerische FreeCAD-Programmparameter fehlt.');return {value,literal:true,raw:value};}
export function freeCADInputContext(project,target){
 let node=project.nodes.find(n=>n.id===target.rootId),world=cadIdentity();for(const id of [null,...target.path]){if(id!==null)node=node?.children?.find(n=>n.id===id);if(!node)fail('Eine bestätigte FreeCAD-Eingabe fehlt.','FREECAD_PARAMETER_INPUT_LOST');world=multiplyCadMatrices(world,node.transform);}return {node,world};
}
export function freeCADParameterInputSignature(project,data,target){
 const run=data.freecad?.find(r=>freeCADTargetKey(r.target)===freeCADTargetKey(target));if(!run)fail('FreeCAD-Eingaben vor der Parameterbindung ausdrücklich bestätigen.','FREECAD_PARAMETER_INPUTS_REQUIRED');
 const {node}=freeCADInputContext(project,target),program=freeCADProgramDigest(node);
 const inputs=run.inputs.map(input=>{if(input.unresolved)fail('Externe FreeCAD-Eingabe ausdrücklich neu zuordnen.','FREECAD_PARAMETER_INPUT_LOST');const {node,world}=freeCADInputContext(project,input.target);return {name:input.name,geometry:projectObjectGeometryKey({...node,transform:world,...(node.kind==='cad'?{solid:true,suppressed:false}:{kind:'mesh',meshRole:'solid'})})};});
 return cadGeometryDigest(JSON.stringify({program,inputs}));
}

export function remapFreeCADParameterRuns(runs,remap,{external=false}={}){
 return runs.map(run=>({...run,target:remap(run.target),inputs:run.inputs.map(input=>({...input,target:remap(input.target),...(external&&!remap.known?.(input.target)?{unresolved:true}:{})}))}));
}
