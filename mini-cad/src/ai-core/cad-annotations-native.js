import {cadIdentity,cadPoint,multiplyCadMatrices,inverseCadMatrix} from './cad-affine.js';
import {readCadBrep,writeCadBrep,cadRayHits} from './cad-native-kernel.js';
import {cadGeometryDigest} from './cad-geometry-digest.js';
import {createCadCache} from './cad-worker-client.js';
const unit=v=>{const m=Math.max(...v.map(Math.abs));if(!m)return null;const a=v.map(x=>x/m),l=Math.hypot(...a);return a.map(x=>x/l);};
/** Native trimmed FACE ownership at a point. An index is returned only as an
 * ephemeral diagnostic, never persisted as correspondence. */
export function resolveCadAnnotationNative(oc,node,{point,normal=[0,0,1]}={}){
 if(node.kind!=='cad'||!Array.isArray(point)||point.length!==3||point.some(v=>!Number.isFinite(v)))throw Error('Ein nativer CAD-Flächenpunkt wird benötigt.');
 const shape=readCadBrep(oc,node.brep.data),p=new oc.gp_Pnt(...point),maker=new oc.BRepBuilderAPI_MakeVertex(p),vertex=maker.Vertex(),explorer=new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_FACE),faces=[],matches=[];
 const tolerance=oc.Precision.Confusion()*8+Math.max(1,...point.map(Math.abs))*Number.EPSILON*64;
 try{
  while(explorer.More()){const raw=explorer.Current();try{if(!faces.some(f=>f.IsSame(raw)))faces.push(oc.TopoDS.Face(raw));}finally{raw.delete();}explorer.Next();}
  for(let i=0;i<faces.length;i++){const distance=new oc.BRepExtrema_DistShapeShape(vertex,faces[i]);try{if(!distance.IsDone()||!Number.isFinite(distance.Value()))throw Error('Native Markierungsfläche konnte nicht geprüft werden.');if(distance.Value()<=tolerance)matches.push(i);}finally{distance.delete();}}
  if(matches.length!==1)return {status:'stale',reason:matches.length?'ambiguous':'lost'};
  const index=matches[0],span=Math.max(.01,tolerance*100),directions=[[1,0,0],[0,1,0],[0,0,1],unit(normal)].filter(Boolean);
  for(const direction of directions)for(const sign of [1,-1]){const d=direction.map(v=>v*sign);let hits;
   try{hits=cadRayHits(oc,shape,{origin:point.map((v,k)=>v+d[k]*span),direction:d.map(v=>-v),far:span*2,tolerance});}catch{continue;}
   const match=hits.find(hit=>hit.faceIndex===index+1&&Math.hypot(...hit.point.map((v,k)=>v-point[k]))<=tolerance);
   if(match)return {status:'valid',normal:unit(match.normal),faceSignature:cadGeometryDigest(writeCadBrep(oc,faces[index])),faceIndex:index+1};
  }
  return {status:'stale',reason:'normal'};
 }finally{faces.forEach(f=>f.delete());explorer.delete();vertex.delete();maker.delete();p.delete();shape.delete();}
}
export function createCadAnnotationValidator(oc){
 const cache=createCadCache({maxEntries:256,maxBytes:256*1024});
 const normalAt=(matrix,normal)=>{const inv=inverseCadMatrix(matrix);return unit([0,1,2].map(k=>inv[k*4]*normal[0]+inv[k*4+1]*normal[1]+inv[k*4+2]*normal[2]));};
 function rebindRoot(root){
  const hasMarks=node=>!!node.annotations?.length||node.children?.some(hasMarks);if(root.kind!=='cad'||!hasMarks(root))return root;let geometry;
  function visit(node,local,inactive=false){
   inactive||=!!node.suppressed;
   const annotations=node.annotations?.map(annotation=>{
    geometry??=cadGeometryDigest(root.brep.data);const point=cadPoint(local,annotation.point),normal=normalAt(local,annotation.normal),key=JSON.stringify([geometry,point,normal]);let proof=cache.get(key);
    if(inactive)proof={status:'stale',reason:'lost'};if(!proof){proof=resolveCadAnnotationNative(oc,root,{point,normal});cache.set(key,proof,new TextEncoder().encode(key).length+512);}
    const {reason:oldReason,...base}=annotation;return proof.status==='valid'?{...base,status:'valid',normal:normalAt(inverseCadMatrix(local),proof.normal),faceSignature:proof.faceSignature}:{...base,status:'stale',reason:proof.reason};
   });
   return {...node,...(annotations?{annotations}:{}),...(node.children?{children:node.children.map(child=>visit(child,multiplyCadMatrices(local,child.transform),inactive))}:{})};
  }
  return visit(root,cadIdentity());
 }
 return {rebindRoot,dispose:()=>cache.clear()};
}
