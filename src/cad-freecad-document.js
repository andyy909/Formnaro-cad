import {dispatchFreeCAD} from './cad-freecad-dispatch.js';
import {validateFreeCADSource} from './cad-freecad.js';

export async function freeCADDocumentDigest(documentBase64){
 const bytes=Uint8Array.from(atob(documentBase64),c=>c.charCodeAt(0));
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
}

// A document read is separate from script execution. Never re-run a saved
// construction program merely to display its native feature tree.
export async function runFreeCADArchive(documentBase64,{action='inspect',resultObject,edits,modules,signal,desktop=globalThis.offlinecadDesktop}={}){
 if(!desktop?.runFreeCADReply)throw Object.assign(Error('Der native FreeCAD-Merkmalsbaum benötigt die Desktop-Ausgabe.'),{code:'FREECAD_UNAVAILABLE'});
 signal?.throwIfAborted();const sourceDigest=await freeCADDocumentDigest(documentBase64),requestId=crypto.randomUUID();signal?.throwIfAborted();
 const abort=()=>Promise.resolve(desktop.cancelFreeCAD?.({requestId})).catch(()=>{});signal?.addEventListener('abort',abort,{once:true});
 try{
  const selected=resultObject;
  const reply=await dispatchFreeCAD(desktop,{requestId,document:{version:1,action,documentBase64,sourceDigest,...(modules?{modules}:{}),...(selected?{resultObject:selected}:{}),...(edits!==undefined?{edits}:{})}},{signal});
  signal?.throwIfAborted();
  if(!reply?.ok)throw Object.assign(Error(reply?.error??'FreeCAD-Dokument konnte nicht gelesen werden.'),{code:reply?.code??'FREECAD_DOCUMENT_FAILED'});
  const value=reply.value;
  if(value.sourceDigest!==sourceDigest||!Array.isArray(value.tree?.objects))throw Object.assign(Error('Merkmalsbaum gehört nicht zum aktuellen Quelldokument.'),{code:'FREECAD_DOCUMENT_STALE'});
  return value;
 }finally{signal?.removeEventListener('abort',abort);}
}
export async function runFreeCADDocument(source,options={}){const saved=validateFreeCADSource(source);return runFreeCADArchive(saved.documentBase64,{...options,resultObject:options.resultObject??saved.resultObject,modules:saved.script?.modules});}
export const readFreeCADDocument=(source,options)=>runFreeCADDocument(source,{...options,action:'inspect',edits:undefined});
export async function editFreeCADDocument(source,options){
 const saved=validateFreeCADSource(source),result=await runFreeCADDocument(saved,{...options,action:'edit'}),changes=[...(result.changes??[]).map(c=>({...c,derived:false})),...(result.dependentChanges??[]).map(({expression,...c})=>({...c,derived:true,...(typeof expression==='string'?{expression}:{})}))];
 const updated=validateFreeCADSource({...saved,version:2,documentBase64:result.documentBase64,documentDigest:await freeCADDocumentDigest(result.documentBase64),resultObject:result.tree.resultObject,mode:'native',engineVersion:result.engineVersion,changes});
 return {source:updated,bytes:Uint8Array.from(atob(result.stepBase64),c=>c.charCodeAt(0)),report:result};
}
