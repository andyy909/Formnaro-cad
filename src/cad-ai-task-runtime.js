import {createAIWorkspace} from './cad-ai-workspace.js';
import {aiFeedback} from './ai-feedback.js';
const invalid=message=>{throw Object.assign(Error(message),{code:'AI_TASK_RUNTIME_INVALID',feedback:{retryable:false}});};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export function taskConversionKey(revision,target){
 const value=typeof target==='string'?{rootId:target,path:[]}:target;
 if(typeof revision!=='string'||!/^[a-f0-9]{16}$/.test(revision)||!value||typeof value.rootId!=='string'||!value.rootId||value.rootId.length>200||!Array.isArray(value.path)||value.path.length>12||value.path.some(x=>typeof x!=='string'||!x||x.length>200))invalid('Ungültiger Modellbezug des gesperrten Konverterwegs.');
 return revision+JSON.stringify({rootId:value.rootId,path:value.path});
}
export function validateAITaskRuntime(value,revision){
 if(!value||Object.keys(value).sort().join(',')!=='blockedConversions,files,revision,version'||value.version!==1||value.revision!==revision||!Array.isArray(value.blockedConversions)||value.blockedConversions.length>256)invalid('Arbeitsbereich gehört nicht zur aktuellen Modellrevision.');
 const workspace=createAIWorkspace();workspace.request({action:'replace',files:value.files});const blocked=new Map();
 for(const row of value.blockedConversions){
  if(!row||Object.keys(row).sort().join(',')!=='error,key'||typeof row.key!=='string'||row.key.length>4000||!row.error||typeof row.error.code!=='string'||typeof row.error.message!=='string')invalid('Ungültige gespeicherte Konvertersperre.');
  let key;try{key=taskConversionKey(row.key.slice(0,16),JSON.parse(row.key.slice(16)));}catch{invalid('Ungültiger gespeicherter Konverterbezug.');}
  const f=aiFeedback({code:row.error.code,message:row.error.message,feedback:row.error});
  if(key!==row.key||blocked.has(key)||f.toolFailure?.scope!=='converter-only'||JSON.stringify(canonical(f))!==JSON.stringify(canonical(row.error)))invalid('Die gespeicherte Konvertersperre enthält keine gültigen Anwendungsbefunde.');
  blocked.set(key,Object.assign(Error(f.message),{code:f.code,feedback:structuredClone(f)}));
 }
 return {workspace,blocked};
}
