import {cadBounds,validateCadSolid,writeCadBrep,transformCad} from './cad-native-kernel.js';
import {cadGeometryDigest} from './cad-geometry-digest.js';
import {cadIdentity} from './cad-affine.js';
const fail=(code,text)=>{const error=Error(text);error.code=code;throw error;};
export function cadIndependentSolids(oc,input,{world=cadIdentity(),checkSeparation=true}={}){
 const before=validateCadSolid(oc,input),explorer=new oc.TopExp_Explorer(input,oc.TopAbs_ShapeEnum.TopAbs_SOLID),items=[],buckets=new Map();
 try{
  while(explorer.More()){const shape=explorer.Current(),key=oc.ReplicadShapeHasher.HashCode(shape,2147483647),bucket=buckets.get(key)??[];if(bucket.some(s=>s.IsSame(shape)))shape.delete();else{bucket.push(shape);buckets.set(key,bucket);items.push({shape});}explorer.Next();}
  if(items.length<2)fail('CAD_SINGLE_BODY','Dieses Teil enthält bereits nur einen nativen Volumenkörper.');
  if(items.length>500)fail('CAD_SOLID_LIMIT','Mehr als 500 Körper können nicht einzeln herausgelöst werden.');
  for(const item of items){const proof=validateCadSolid(oc,item.shape);if(proof.solids!==1)fail('INVALID_CAD_SOLID','Ein Herauslöseergebnis enthält keine eindeutige native Körpertopologie.');item.brep=writeCadBrep(oc,item.shape);item.signature=cadGeometryDigest(item.brep);item.volume=proof.volume;item.bounds=proof.bounds;}
  if(new Set(items.map(i=>i.signature)).size!==items.length)fail('CAD_SOLIDS_TOUCH','Gleiche, überlappende oder berührende Körper können nicht unabhängig herausgelöst werden.');
  if(checkSeparation){
   for(const item of items){item.worldShape=transformCad(oc,item.shape,world);item.worldBounds=cadBounds(oc,item.worldShape);}
   for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){const a=items[i],b=items[j],reserve=2*oc.Precision.Confusion()+Math.max(1,...a.worldBounds.min.map(Math.abs),...a.worldBounds.max.map(Math.abs),...b.worldBounds.min.map(Math.abs),...b.worldBounds.max.map(Math.abs))*Number.EPSILON*64,lower=Math.hypot(...[0,1,2].map(k=>Math.max(0,a.worldBounds.min[k]-b.worldBounds.max[k],b.worldBounds.min[k]-a.worldBounds.max[k])));if(lower>reserve)continue;const distance=new oc.BRepExtrema_DistShapeShape(a.worldShape,b.worldShape);try{if(!distance.IsDone()||!Number.isFinite(distance.Value()))fail('CAD_SOLID_DISTANCE_FAILED','Der native Körperabstand konnte nicht geprüft werden.');if(distance.Value()<=reserve)fail('CAD_SOLIDS_TOUCH','Überlappende oder berührende Körper können nicht unabhängig herausgelöst werden.');}finally{distance.delete();}}
  }
  const total=items.reduce((sum,i)=>sum+i.volume,0),props=new oc.GProp_GProps();let reserve;try{oc.BRepGProp.SurfaceProperties(input,props,false,false);reserve=Math.max(1e-9,props.Mass()*oc.Precision.Confusion()*4,before.volume*Number.EPSILON*256);}finally{props.delete();}
  if(Math.abs(total-before.volume)>reserve)fail('CAD_EXTRACTION_VOLUME','Die native Körperzerlegung hat den Materialerhalt nicht bestätigt.');
  return items.map(({brep,signature,volume,bounds})=>({brep,signature,volume,bounds}));
 }finally{explorer.delete();for(const item of items){item.worldShape?.delete();item.shape.delete();}}
}
/** Signature addresses topology, never explorer order. Sources were checked
 * before this call; no source geometry edit silently chooses another solid. */
export function extractCadNative(oc,input,definition){
 if(cadGeometryDigest(writeCadBrep(oc,input))!==definition.bodySignature)fail('CAD_REEXTRACT_REQUIRED','Die Originalgeometrie wurde geändert. Körper erneut herauslösen.');
 const solids=cadIndependentSolids(oc,input,{checkSeparation:false}),matches=solids.filter(s=>s.signature===definition.solidSignature);if(matches.length!==1)fail('CAD_REEXTRACT_REQUIRED','Der native Körperbezug ist verloren oder mehrdeutig. Körper erneut herauslösen.');
 const shape=oc.BRepToolsWrapper.Read(matches[0].brep);try{validateCadSolid(oc,shape);return shape;}catch(error){shape.delete();throw error;}
}
