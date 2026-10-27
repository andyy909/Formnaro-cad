import {createLocalStlAnalysis} from './cad-stl-converter.js';
const aborted=()=>Object.assign(Error('Flächenanalyse abgebrochen.'),{name:'AbortError',code:'ABORTED'});
export function createTechnicalMeshService({desktop=globalThis.window?.offlinecadDesktop,createWorker=()=>new Worker(new URL('./mesh-technical-worker.js',import.meta.url),{type:'module'})}={}){
 const active=new Set();let disposed=false;
 async function analyze(node,options={}, {signal,onProgress=()=>{}}={}){
  if(disposed||signal?.aborted)throw aborted();if(typeof desktop?.analyseStl!=='function')throw Error('Der mitgelieferte lokale Konverter ist erforderlich.');
  const worker=createWorker(),task=createLocalStlAnalysis({desktop,onProgress});let pending=null,id=0,stopped=false;
  const cancel=()=>{if(stopped)return;stopped=true;worker.terminate();pending?.reject(aborted());void task.cancel().catch(()=>{});};active.add(cancel);signal?.addEventListener('abort',cancel,{once:true});
  worker.onmessage=({data})=>{if(pending?.id!==data.id)return;const job=pending;pending=null;data.error?job.reject(Error(data.error)):job.resolve(data.result);};worker.onerror=event=>{pending?.reject(Error(event.message||'Flächenanalyse-Worker fehlgeschlagen.'));pending=null;cancel();};
  const call=data=>new Promise((resolve,reject)=>{if(stopped){reject(aborted());return;}pending={id:++id,resolve,reject};worker.postMessage({...data,id});});
  try{onProgress('Originalbereich wird vorbereitet …');const input=await call({kind:'prepare',node:{id:node.id,kind:node.kind,mesh:node.mesh,transform:node.transform},options}),analysis=await task.run(new File([input.text],'Formnaro-Teilbereich.stl',{type:'model/stl'}),{unit:1,tolerance:input.tolerance,repair:false});if(stopped||signal?.aborted)throw aborted();onProgress('Ebenen und Zylinder werden an den Originalflächen gemessen …');return await call({kind:'fit',analysis});}
  finally{worker.terminate();await task.cancel().catch(()=>{});active.delete(cancel);signal?.removeEventListener('abort',cancel);}
 }
 return {analyze,dispose(){disposed=true;for(const cancel of active)cancel();active.clear();}};
}

export async function queryTechnicalMesh({project,id,triangleIds=null,geometryDigest,tolerance=.05,signal}={}){
 if(typeof id!=='string')throw Error('Ein vollständiges Netzteil für die Flächenanalyse wählen.');const node=project.nodes.find(n=>n.id===id);if(!node)throw Error('Netzteil fehlt.');
 const service=createTechnicalMeshService();try{return await service.analyze(node,{triangleIds,geometryDigest,tolerance},{signal});}finally{service.dispose();}
}
