import {cadProjectSnapshot,cadProjectRevision} from './cad-project.js';
import {geometryRefs,hasGeometryRefs} from './cad-geometry-ref.js';
import {encodeFnpackProject,createFnpackResolver} from './cad-fnpack-data.js';
import {cadSelectionContext} from './cad-interface-state.js';
import {aiTaskDataDigest} from './cad-ai-task-resume.js';
const invalid=message=>{throw Object.assign(Error(message),{code:'AI_TASK_BASIS_INVALID',feedback:{retryable:false}});};
export async function validateAITaskBasis(value,binding){
 if(!value||Object.keys(value).sort().join(',')!=='blocks,project,selection,version'||value.version!==1||!value.blocks||Object.getPrototypeOf(value.blocks)!==Object.prototype||Object.keys(value.blocks).length>20000||!Array.isArray(value.selection)||value.selection.length>500)invalid('Die gespeicherte Auftragsbasis ist unvollständig.');
 const project=cadProjectSnapshot(value.project),refs=geometryRefs(project),keys=Object.keys(value.blocks);
 if(keys.length!==refs.size||keys.some(hash=>!refs.has(hash)||typeof value.blocks[hash]!=='string'))invalid('Die Geometrieblöcke der Auftragsbasis sind unvollständig.');
 for(const target of value.selection){if(!target||Object.keys(target).sort().join(',')!=='path,rootId')invalid('Gespeicherte Auswahl ist ungültig.');try{cadSelectionContext(project,target);}catch{invalid('Gespeicherte Auswahl fehlt in der Auftragsbasis.');}}
 if(binding&&(cadProjectRevision(project)!==binding.revision||aiTaskDataDigest(project)!==binding.projectDigest||aiTaskDataDigest(value.selection)!==binding.selectionDigest))invalid('Auftragsbasis und gespeicherter Modellbezug stimmen nicht überein.');
 const bytes=new Map(keys.map(hash=>[hash,new TextEncoder().encode(value.blocks[hash])])),resolver=createFnpackResolver({readBlock:async hash=>{const data=bytes.get(hash);if(!data)invalid('Gespeicherter Geometrieblock fehlt.');return data;}});
 const materialized=hasGeometryRefs(project)?await resolver.hydrate(project,null):project;
 return {basis:{version:1,project,selection:structuredClone(value.selection),blocks:{...value.blocks}},materialized,bytes};
}
export async function captureAITaskBasis(project,materialized,selection=[]){
 const original=cadProjectSnapshot(project),refs=geometryRefs(original),blocks={};
 if(refs.size){const encoded=encodeFnpackProject(materialized),available=new Map(encoded.blocks.map(b=>[b.sha256,b.bytes]));for(const hash of refs.keys()){const bytes=available.get(hash);if(!bytes)invalid('Nicht alle Originalblöcke konnten für den Auftrag gesichert werden.');blocks[hash]=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}}
 return (await validateAITaskBasis({version:1,project:original,selection,blocks})).basis;
}
