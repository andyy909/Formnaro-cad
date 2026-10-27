// Read-only native surface measurements. Face indices live only within this
// query/revision; saved models never acquire display or measurement data.
import {cadRayHits} from './cad-native-kernel.js';
const xyz=p=>[p.X(),p.Y(),p.Z()],value=e=>e?.value??e;
function faces(oc,shape){
 const list=[],buckets=new Map(),e=new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_FACE);
 try{while(e.More()){const raw=e.Current();try{const hash=oc.ReplicadShapeHasher.HashCode(raw,2147483647),bucket=buckets.get(hash)??[];if(!bucket.some(f=>f.IsSame(raw))){const face=oc.TopoDS.Face(raw);list.push(face);bucket.push(face);buckets.set(hash,bucket);}if(list.length>8000)throw Error('Zu viele CAD-Flächen für die Klickmessung.');}finally{raw.delete();}e.Next();}return list;}catch(error){list.forEach(f=>f.delete());throw error;}finally{e.delete();}
}
export function createCadClickMeasureNative({oc,service}){
 function info(face){
  const adapter=new oc.BRepAdaptor_Surface(face,false);let surface,axis,location,direction;
  try{const type=value(adapter.GetType()),types=oc.GeomAbs_SurfaceType;
   if(type===value(types.GeomAbs_Cylinder)){
    surface=adapter.Cylinder();axis=surface.Axis();location=axis.Location();direction=axis.Direction();
    return {kind:'cylinder',radius:surface.Radius(),diameter:surface.Radius()*2,axis:xyz(direction),center:xyz(location)};
   }
   if(type===value(types.GeomAbs_Plane))return {kind:'plane'};
   return {kind:'other'};
  }finally{direction?.delete();location?.delete();axis?.delete();surface?.delete();adapter.delete();}
 }
 function pick({project,ray,ids}){
  if(!ray||!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.length>1000)throw Error('Ungültige Klickmessung.');
  const hits=[];
  for(const id of ids){const node=project.nodes.find(n=>n.id===id);if(!node||node.kind!=='cad'||!node.solid)throw Error('Sichtbare CAD-Körper für die Klickmessung wählen.');const shape=service.worldShape(node);
   try{for(const hit of cadRayHits(oc,shape,ray))hits.push({...hit,objectId:id});}finally{shape.delete();}
  }
  hits.sort((a,b)=>a.t-b.t);const best=hits[0];
  if(!best)return null;
  if(hits.slice(1).some(hit=>Math.abs(best.t-hit.t)<=1e-7&&(best.objectId!==hit.objectId||best.faceIndex!==hit.faceIndex)))throw Error('Mehrere CAD-Flächen getroffen. Einen eindeutigen Flächenpunkt wählen.');
  const node=project.nodes.find(n=>n.id===best.objectId),shape=service.worldShape(node);let list=[];
  try{list=faces(oc,shape);const face=list[best.faceIndex-1];if(!face)throw Error('CAD-Fläche nicht mehr verfügbar.');return {...best,surface:info(face)};}finally{list.forEach(f=>f.delete());shape.delete();}
 }
 function distance({project,from,to}){
  const shapes=[],lists=[];let measure;
  try{const targets=[from,to].map(anchor=>{if(!anchor||!Number.isSafeInteger(anchor.faceIndex)||anchor.faceIndex<1)throw Error('Zwei CAD-Flächen wählen.');const node=project.nodes.find(n=>n.id===anchor.objectId);if(!node||node.kind!=='cad'||!node.solid)throw Error('CAD-Messziel fehlt.');const shape=service.worldShape(node);shapes.push(shape);const list=faces(oc,shape);lists.push(list);const face=list[anchor.faceIndex-1];if(!face)throw Error('CAD-Messfläche fehlt.');return face;});
   measure=new oc.BRepExtrema_DistShapeShape(...targets);if(!measure.IsDone()||measure.NbSolution()<1||!Number.isFinite(measure.Value())||measure.Value()<0)throw Error('CAD-Flächenabstand konnte nicht bestimmt werden.');
   const a=measure.PointOnShape1(1),b=measure.PointOnShape2(1);try{return {distance:measure.Value(),from:xyz(a),to:xyz(b),kind:'cad-face-distance'};}finally{a.delete();b.delete();}
  }finally{measure?.delete();lists.forEach(list=>list.forEach(f=>f.delete()));shapes.forEach(s=>s.delete());}
 }
 return {pick,distance};
}
