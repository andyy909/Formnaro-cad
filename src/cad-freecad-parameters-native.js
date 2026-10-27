import {cadSelectionContext} from './cad-interface-state.js';
import {cadProjectSnapshot} from './cad-project.js';
import {cadBytesDigest} from './cad-geometry-digest.js';
import {freeCADSourceDigest} from './cad-freecad-source.js';
import {freeCADNodeReplacement} from './cad-freecad-node-native.js';
import {freeCADParameterProgram,freeCADTargetKey} from './cad-freecad-parameter-data.js';

/** Runs at the exact position of the source in the native dependency pass. */
export async function buildFreeCADParametersNative(node,context,{data,parameters,service,oc,run}={}){
 if(!run)throw Object.assign(Error('Diese Abhängigkeit über die Desktop-Projektparameter aktualisieren.'),{code:'FREECAD_PARAMETER_DESKTOP'});
 const config=data.freecad?.find(r=>freeCADTargetKey(r.target)===freeCADTargetKey(context.target));if(!config)throw Error('FreeCAD-Eingabezuordnung fehlt.');
 const {source,mode,program}=freeCADParameterProgram(node),inputs=[],inputFiles=[];
 for(const input of config.inputs){
  if(input.unresolved)throw Object.assign(Error('FreeCAD-Eingabe ausdrücklich neu zuordnen.'),{code:'FREECAD_PARAMETER_INPUT_LOST'});
  const selected=cadSelectionContext(context.project,input.target),copy=structuredClone(selected.node);copy.transform=selected.world;copy.hidden=false;if(copy.kind==='cad'){copy.solid=true;copy.suppressed=false;}copy.layerId=context.project.activeLayerId;delete copy.folderId;
  if(copy.kind==='referenceMesh')copy.kind='mesh';if(copy.kind==='mesh')copy.meshRole='solid';
  const scratchData={...context.project,nodes:[copy],projectParameters:undefined,contourLinks:undefined,drawings:undefined,joints:undefined,activeFolderId:null,workplane:{...context.project.workplane}};scratchData.workplane.reference=null;const scratch=cadProjectSnapshot(scratchData);for(const layer of scratch.layers){layer.hidden=false;layer.locked=false;}scratch.folders=[];
  const format=copy.kind==='mesh'?'stl':'step',exported=service.exportModel(scratch,{format,ids:[copy.id]}),bytes=typeof exported.data==='string'?new TextEncoder().encode(exported.data):new Uint8Array(exported.data);let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  inputs.push({name:input.name,format,base64:btoa(binary)});inputFiles.push({name:input.name,target:input.target,label:selected.node.name,format,digest:cadBytesDigest(bytes)});
 }
 const result=await run({target:context.target,sourceDigest:freeCADSourceDigest(source.documentBase64),[mode]:{...program,parameters},inputs});
 const replacement=freeCADNodeReplacement(oc,service,node,result.source,result.bytes);
 return {...replacement,report:{...result.report,inputs:inputFiles}};
}
