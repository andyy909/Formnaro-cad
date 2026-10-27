import {createFnpackResolver,encodeFnpackProject} from './cad-fnpack-data.js';
import {geometryRefs} from './cad-geometry-ref.js';
import {validateAITaskBasis} from './cad-ai-task-basis.js';
/** Session-only file capabilities. Exported/saved models contain only hashes. */
export function createFnpackFiles(desktop){
 const sources=new Map(),byHash=new Map(),taskBlocks=new Map();let taskBytes=0;
 const resolver=createFnpackResolver({readBlock:async sha256=>{if(taskBlocks.has(sha256))return taskBlocks.get(sha256);const sourceId=byHash.get(sha256);if(!sourceId||!desktop?.readGeometryBlock)throw Error('Erforderliches Geometriepaket zum Nachladen fehlt.');return desktop.readGeometryBlock({sourceId,sha256});}});
 async function registerTaskBasis(value,binding){const checked=await validateAITaskBasis(value,binding),additions=[...checked.bytes].filter(([hash])=>!taskBlocks.has(hash)),additional=additions.reduce((n,[,data])=>n+data.byteLength,0);if(taskBytes+additional>128*1024*1024)throw Error('Der Speicher für geöffnete Auftragsgeometrie ist voll. Auftragsdateien bleiben erhalten.');for(const [hash,data]of additions)taskBlocks.set(hash,data);taskBytes+=additional;return checked.basis;}
 function register(value){
  if(!value)return;if(typeof value.sourceId!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(value.sourceId)||!Array.isArray(value.blocks)||value.blocks.length>20000||sources.size>=128&&!sources.has(value.sourceId))throw Error('Zu viele oder ungültige geöffnete Geometriepakete.');
  const blocks=value.blocks.map(b=>{if(!b||!/^[a-f0-9]{64}$/.test(b.sha256)||!['brep','mesh'].includes(b.kind)||!Number.isSafeInteger(b.bytes)||b.bytes<1||b.bytes>128*1024*1024)throw Error('Ungültiger Geometrieblock-Katalog.');return b;});sources.set(value.sourceId,blocks);for(const block of blocks)byHash.set(block.sha256,value.sourceId);
 }
 function encode(project,workspace){
  const encoded=encodeFnpackProject({...project,...(workspace?{workspace}:{})}),blocks=new Map(encoded.blocks.map(block=>[block.sha256,block]));
  // Task bases own validated local bytes rather than a main-process file
  // capability. Include needed bytes in Save As and autosave, just like newly
  // built geometry; never attach blocks belonging only to another task.
  for(const hash of geometryRefs(encoded.project).keys())if(!blocks.has(hash)&&taskBlocks.has(hash))blocks.set(hash,{sha256:hash,bytes:taskBlocks.get(hash)});
  return {...encoded,blocks:[...blocks.values()],sourceIds:[...sources.keys()]};
 }
 function state(project){const refs=geometryRefs(project),resident=[...refs.keys()].filter(hash=>resolver.has(hash)).length;return {geometryStorage:refs.size?'fnpack':'inline',geometryResident:resident===refs.size,geometryBlocks:refs.size,residentGeometryBlocks:resident,geometryReads:resolver.stats().reads};}
 return {register,registerTaskBasis,encode,resolve:resolver.hydrate,stats:resolver.stats,state,available:()=>typeof desktop?.readGeometryBlock==='function',sources:()=>sources.size};
}
