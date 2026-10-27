import {dispatchFreeCAD} from './cad-freecad-dispatch.js';
const fail=message=>{throw Object.assign(Error(message),{code:'FREECAD_INPUT'});};
import {cadBytesDigest} from './cad-geometry-digest.js';
export async function runFreeCADPlan({project,operation,exportGeometry,signal,desktop=globalThis.offlinecadDesktop}){
 if(!desktop?.runFreeCADReply)fail('FreeCAD benötigt die Desktop-Ausgabe von Formnaro.');
 if(!operation||Object.keys(operation).some(k=>!['kind','plan','script','inputs'].includes(k))||!['build','inspect'].includes(operation.kind)||!!operation.plan===!!operation.script||!Array.isArray(operation.inputs??[])||(operation.inputs??[]).length>8)fail('FreeCAD: build oder inspect mit genau einem plan oder script und höchstens acht Eingaben wählen.');
 const inputs=[],inputFiles=[];
 for(const input of operation.inputs??[]){
  if(!input||Object.keys(input).some(k=>!['name','target'].includes(k)))fail('FreeCAD-Eingabe benötigt name und target.');
  const id=typeof input.target==='string'?input.target:input.target?.path?.length===0?input.target.rootId:null,node=project.nodes.find(n=>n.id===id);
  if(!node)fail('Ein vorhandenes Quellteil wählen.');
  // Inspection/export reads hidden and locked sources without changing them.
  // A private export copy also represents legacy reference meshes as material.
  const exportProject=structuredClone(project),copy=exportProject.nodes.find(n=>n.id===id);copy.hidden=false;
  for(const layer of exportProject.layers)layer.hidden=false;for(const folder of exportProject.folders)folder.hidden=false;
  if(copy.kind==='referenceMesh')copy.kind='mesh';if(copy.kind==='mesh')copy.meshRole='solid';else{copy.solid=true;copy.suppressed=false;}
  const format=copy.kind==='mesh'?'stl':'step',result=await exportGeometry(exportProject,{format,ids:[id]});
  const bytes=typeof result.data==='string'?new TextEncoder().encode(result.data):new Uint8Array(result.data);let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  inputs.push({name:input.name,format,base64:btoa(binary)});
  inputFiles.push({name:input.name,format,digest:cadBytesDigest(bytes)});
 }
 signal?.throwIfAborted();const requestId=crypto.randomUUID(),cancel=()=>desktop.cancelFreeCAD({requestId}).catch(()=>{});
 signal?.addEventListener('abort',cancel,{once:true});
 try{
  const reply=await dispatchFreeCAD(desktop,{requestId,...(operation.script?{script:operation.script}:{plan:operation.plan}),inputs,inspectOnly:operation.kind==='inspect'},{signal});signal?.throwIfAborted();
  if(!reply?.ok)throw Object.assign(Error(reply?.error??'FreeCAD hat keine Antwort geliefert.'),{code:reply?.code??'FREECAD_FAILED',...(reply?.feedback?{feedback:reply.feedback}:{})});
  const r=reply.value;
  if(operation.kind==='inspect')return {engine:'FreeCAD',engineVersion:r.engineVersion,geometry:r.report,measurements:r.measurements,...(r.isolation?{isolation:r.isolation,documentObjects:r.documentObjects}: {})};
  const bytes=Uint8Array.from(atob(r.stepBase64),c=>c.charCodeAt(0));
  return {operation:{kind:'importStep',bytes,options:{name:(operation.script??operation.plan).name??'FreeCAD-Körper',metadata:{freecadSource:{version:1,...(r.script?{script:r.script}:{plan:r.plan}),engineVersion:r.engineVersion,documentBase64:r.documentBase64},notes:'Mit FreeCAD erstellt und geprüft. Die Maßhaltigkeit gegenüber einer Vorlage benötigt einen separaten Vergleich.'}}},report:{engine:'FreeCAD',engineVersion:r.engineVersion,occt:r.occt,geometry:r.report,measurements:r.measurements,inputFiles,...(r.stepReadback?{stepReadback:r.stepReadback}:{}),...(r.resultObject?{resultObject:r.resultObject}:{}),...(r.isolation?{isolation:r.isolation,documentObjects:r.documentObjects}: {})}};
 }finally{signal?.removeEventListener('abort',cancel);}
}
export {validateFreeCADSource} from './cad-freecad-source.js';
