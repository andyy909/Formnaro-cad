import {isFreeCADParameterField,freeCADTargetKey} from './cad-freecad-parameter-data.js';
import {validateCadProjectParameterTarget,validateCadProjectParameters} from './cad-project-parameters-data.js';
import {cadSelectionContext} from './cad-interface-state.js';
import {resolveFreeCADDocumentTarget} from './cad-freecad-target.js';
import {freeCADSourceDigest} from './cad-freecad-source.js';

const fail=(message,code='FREECAD_RERUN_INPUT')=>{throw Object.assign(Error(message),{code});};
const plain=value=>value&&Object.getPrototypeOf(value)===Object.prototype;
const key=freeCADTargetKey;
const bound=(project,target)=>(project.projectParameters?.bindings??[]).some(binding=>key(binding.target)===key(target)&&isFreeCADParameterField(binding.field));

// New addresses are human choices, never saved proof. Stage all explicitly
// chosen inputs before deriving the graph, including lost external mappings.
export function prepareFreeCADInputBindings(project,{target,inputs,inputBindings=[]}){
 if(!Array.isArray(inputBindings)||inputBindings.length>32)fail('Höchstens 32 weitere gespeicherte Programme ausdrücklich zuordnen.');
 const primaryBound=bound(project,target);if(inputBindings.length&&!primaryBound)fail('Gemeinsame Eingabeneuzuordnung benötigt ein global gebundenes Hauptprogramm.');
 const data=primaryBound?structuredClone(project.projectParameters):null,seen=new Set([key(target)]),entries=[{target,inputs,primary:true}],changes=[];
 for(const entry of inputBindings){
  if(!plain(entry)||Object.keys(entry).some(k=>!['target','sourceDigest','inputs'].includes(k)))fail('Weitere Programmzuordnungen benötigen Ziel, Quellrevision und aktuelle Eingaben.');
  const address=validateCadProjectParameterTarget(entry.target);if(seen.has(key(address)))fail('Jedes weitere Programm genau einmal ausdrücklich wählen.');seen.add(key(address));
  const context=resolveFreeCADDocumentTarget(project,address,{write:true});if(!bound(project,address))fail('Das weitere Programm benötigt eine vorhandene globale Parameterbindung.');
  if(entry.sourceDigest!==freeCADSourceDigest(context.node.metadata.freecadSource.documentBase64))fail('Eine weitere FreeCAD-Quelle wurde geändert. Neu lesen.','STALE_REVISION');
  entries.push({...entry,target:address});
 }
 for(const entry of entries){
  if(!Array.isArray(entry.inputs)||entry.inputs.length>8)fail('Bis zu acht aktuelle Quellen ausdrücklich wählen; ohne Quellen eine leere Liste verwenden.');
  const names=new Set();entry.inputReview=entry.inputs.map(input=>{
   if(!plain(input)||Object.keys(input).some(k=>!['name','target'].includes(k))||typeof input.name!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(input.name)||names.has(input.name))fail('Eindeutige einfache Quellnamen und vorhandene Teile wählen.');names.add(input.name);
   const address=typeof input.target==='string'?validateCadProjectParameterTarget({rootId:input.target,path:[]}):validateCadProjectParameterTarget(input.target);
   if(!primaryBound&&address.path.length)fail('Eine vorhandene CAD- oder Netzquelle wählen.');
   const selected=cadSelectionContext(project,address);if(!['cad','mesh','referenceMesh'].includes(selected.node.kind))fail('Eine vorhandene CAD- oder Netzquelle wählen.');
   if(address.rootId===entry.target.rootId&&address.path.length<=entry.target.path.length&&address.path.every((id,i)=>id===entry.target.path[i]))fail('Das Ergebnis oder sein Container darf keine Eingabe des eigenen Neulaufs sein.','FREECAD_RERUN_CYCLE');
   return {name:input.name,target:address,label:selected.node.name};
  });
  if(data){
   const config=data.freecad.find(run=>key(run.target)===key(entry.target));if(!config)fail('Die bestätigte Eingabezuordnung eines gebundenen Programms fehlt.');
   if(!entry.primary&&(config.inputs.length!==entry.inputReview.length||config.inputs.some(input=>!names.has(input.name))))fail('Bei weiteren Programmen alle gespeicherten Eingabenamen unverändert bestätigen.');
   const next=entry.inputReview.map(({name,target})=>({name,target}));
   if(JSON.stringify(config.inputs)!==JSON.stringify(next))changes.push({target:entry.target,name:cadSelectionContext(project,entry.target).node.name,before:structuredClone(config.inputs),inputs:structuredClone(entry.inputReview)});
   config.inputs=next;
  }
 }
 return {project:data?{...project,projectParameters:validateCadProjectParameters(data)}:project,targets:entries.map(entry=>entry.target),inputReview:entries[0].inputReview,inputRebindings:changes};
}
