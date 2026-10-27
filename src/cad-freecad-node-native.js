import {freeCADSourceDigest,validateFreeCADSource} from './cad-freecad-source.js';
import {readCadBrep,writeCadBrep} from './cad-native-kernel.js';
import {cadGeometryDigest} from './cad-geometry-digest.js';
const fail=message=>{throw Object.assign(Error(message),{code:'FREECAD_REPLACEMENT_INVALID'});};
function faceKeys(oc,brep){const shape=readCadBrep(oc,brep.data),items=[],keys=[],buckets=new Map(),explorer=new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_FACE);try{while(explorer.More()){const raw=explorer.Current();try{const hash=oc.ReplicadShapeHasher.HashCode(raw,2147483647),bucket=buckets.get(hash)??[];if(!bucket.some(f=>f.IsSame(raw))){const face=oc.TopoDS.Face(raw);items.push(face);bucket.push(face);buckets.set(hash,bucket);keys.push(cadGeometryDigest(writeCadBrep(oc,face)));if(keys.length>40000)fail('Zu viele Flächen für eine eindeutige Farbzuordnung.');}}finally{raw.delete();}explorer.Next();}return keys;}finally{explorer.delete();items.forEach(f=>f.delete());shape.delete();}}
export function preserveColors(oc,node,updated,source){
 if(!node.metadata?.stepFaceColors?.length)return {source,colors:node.metadata?.stepFaceColors,pending:[]};
 const before=faceKeys(oc,node.brep),after=faceKeys(oc,updated.brep),colors=[],pending=[];
 for(const color of node.metadata.stepFaceColors){const signature=before[color.faceIndex-1],matches=after.flatMap((key,i)=>key===signature?[i+1]:[]);if(matches.length===1&&!colors.some(c=>c.faceIndex===matches[0]))colors.push({...color,faceIndex:matches[0]});else pending.push({...color,...(signature?{faceDigest:signature}:{}),documentDigest:freeCADSourceDigest(node.metadata.freecadSource.documentBase64)});}
 return {source:validateFreeCADSource({...source,...(pending.length?{pendingFaceColors:[...(source.pendingFaceColors??[]),...pending]}:{})}),colors,pending};
}

export function freeCADNodeReplacement(oc,service,original,source,bytes){
 const imported=service.stepNode(bytes),style=preserveColors(oc,original,imported,source),node={...structuredClone(original),brep:imported.brep,stats:imported.stats,metadata:{...original.metadata,freecadSource:style.source}};delete node.geometryIdentity;
 if(style.colors!==undefined){if(style.colors.length)node.metadata.stepFaceColors=style.colors;else delete node.metadata.stepFaceColors;}
 return {node,pendingColors:style.pending.length};
}
