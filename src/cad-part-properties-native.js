import {readCadBrep,transformCad,validateCadSolid} from './cad-native-kernel.js';
import {partFaceColors,partSurfaceState} from './cad-part-properties.js';

export function nativePartProperties(oc,node){
 let local,shape,props,point;
 try{
  local=readCadBrep(oc,node.brep.data);shape=transformCad(oc,local,node.transform);
  const checked=validateCadSolid(oc,shape);props=new oc.GProp_GProps();
  // CGFlag is deliberately true. Display statistics and box centers cannot
  // establish the material centroid of an asymmetric body or a cavity.
  const error=oc.BRepGProp.VolumePropertiesGK(shape,props,1e-10,true,true,true,false,false),volume=props.Mass();point=props.CentreOfMass();const centerMm=[point.X(),point.Y(),point.Z()];
  if(!Number.isFinite(error)||error<0||!Number.isFinite(volume)||volume<=0||Math.abs(volume-checked.volume)>Math.max(1e-7,checked.volume*1e-6)||centerMm.some((v,k)=>!Number.isFinite(v)||v<checked.bounds.min[k]-1e-5||v>checked.bounds.max[k]+1e-5))throw Error('Native Masse-/Schwerpunktintegration konnte nicht bestätigt werden.');
  const explorer=new oc.TopExp_Explorer(local,oc.TopAbs_ShapeEnum.TopAbs_FACE),buckets=new Map(),faces=[];
  try{while(explorer.More()){const raw=explorer.Current();try{const hash=oc.ReplicadShapeHasher.HashCode(raw,2147483647),bucket=buckets.get(hash)??[];if(!bucket.some(f=>f.IsSame(raw))){const f=oc.TopoDS.Face(raw);bucket.push(f);faces.push(f);buckets.set(hash,bucket);if(faces.length>40000)throw Error('Höchstens 40.000 native Flächen für Teileigenschaften.');}}finally{raw.delete();}explorer.Next();}
   if(partSurfaceState(node).current&&partFaceColors(node).some(f=>f.faceIndex>faces.length))throw Error('Gespeicherte Flächenfarbe besitzt keine zugehörige native Fläche.');
   return {volumeMm3:volume,centerMm,faceCount:faces.length,solids:checked.solids,bounds:checked.bounds,method:'OCCT native volume and first moments',integrationError:error};
  }finally{explorer.delete();faces.forEach(f=>f.delete());}
 }finally{point?.delete();props?.delete();shape?.delete();local?.delete();}
}
