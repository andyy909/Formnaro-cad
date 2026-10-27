import {Matrix4,Vector3} from 'three';
import {validateCadPartition} from './cad-partition-data.js';
import {cadBounds,validateCadSolid,transformCad} from './cad-native-kernel.js';
import {inverseCadMatrix} from './cad-affine.js';
const fail=message=>{const e=Error(message);e.code='INVALID_CAD_PARTITION';throw e;};
function solids(oc,shape){
  const explorer=new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_SOLID),items=[],buckets=new Map();
  try{while(explorer.More()){const s=explorer.Current(),key=oc.ReplicadShapeHasher.HashCode(s,2147483647),bucket=buckets.get(key)??[];if(bucket.some(v=>v.IsSame(s)))s.delete();else{bucket.push(s);buckets.set(key,bucket);items.push(s);if(items.length>5000)fail('Die Teilung erzeugt zu viele native Körper.');}explorer.Next();}return items;}
  catch(error){items.forEach(s=>s.delete());throw error;}finally{explorer.delete();}
}
function compound(oc,items){const result=new oc.TopoDS_Compound(),builder=new oc.TopoDS_Builder();try{builder.MakeCompound(result);for(const s of items)builder.Add(result,s);return result;}catch(error){result.delete();throw error;}finally{builder.delete();}}
function frame(plane){const n=new Vector3(...plane.normal),u=Math.abs(n.x)<.8?new Vector3(1,0,0):new Vector3(0,1,0);u.addScaledVector(n,-u.dot(n)).normalize();const v=new Vector3().crossVectors(n,u);return new Matrix4().makeBasis(u,v,n).setPosition(...plane.origin).toArray();}

/** Native SOLID topology proves that material was divided. A valid single
 * connected solid crossing a plane splits into additional closed solids;
 * tangent, outside and gap-only planes leave the solid count unchanged.
 * Bounds only classify the already split solids. No display mesh participates.
 * Returned shape is owned by the caller; input is non-destructive. */
export function partitionCadNative(oc,input,definition){
  const plane=validateCadPartition(definition),before=validateCadSolid(oc,input),owned=[],keep=v=>(owned.push(v),v);let parts=[],chosen;
  try{
    const p=keep(new oc.gp_Pnt(...plane.origin)),n=keep(new oc.gp_Dir(...plane.normal)),pln=keep(new oc.gp_Pln(p,n)),maker=keep(new oc.BRepBuilderAPI_MakeFace(pln)),face=keep(maker.Face()),args=keep(new oc.NCollection_List_TopoDS_Shape()),tools=keep(new oc.NCollection_List_TopoDS_Shape()),splitter=keep(new oc.BRepAlgoAPI_Splitter());
    args.Append(input);tools.Append(face);splitter.SetArguments(args);splitter.SetTools(tools);splitter.SetNonDestructive(true);splitter.Build();
    if(!splitter.IsDone()||splitter.HasErrors())fail('Die native Ebenenteilung konnte nicht berechnet werden.');
    const result=keep(splitter.Shape());parts=solids(oc,result);
    if(parts.length<=before.solids)fail('Die Ebene teilt kein Material: außerhalb, tangential oder nur in einer Materiallücke.');
    const inverse=inverseCadMatrix(frame(plane)),positive=[],negative=[];let total=0;
    for(const piece of parts){const proof=validateCadSolid(oc,piece);total+=proof.volume;const local=transformCad(oc,piece,inverse);let b;try{b=cadBounds(oc,local);}finally{local.delete();}
      const reserve=2*oc.Precision.Confusion()+Math.max(1,...b.min.map(Math.abs),...b.max.map(Math.abs))*Number.EPSILON*64;
      if(b.min[2]>=-reserve&&b.max[2]>reserve)positive.push(piece);else if(b.max[2]<=reserve&&b.min[2]<-reserve)negative.push(piece);else fail('Ein natives Teilergebnis lässt sich keiner Ebenenseite eindeutig zuordnen.');
    }
    if(!positive.length||!negative.length)fail('Die Teilung benötigt auf beiden Seiten geschlossene Körper.');
    const props=keep(new oc.GProp_GProps());oc.BRepGProp.SurfaceProperties(input,props,false,false);
    const volumeReserve=Math.max(1e-9,props.Mass()*oc.Precision.Confusion()*4,before.volume*Number.EPSILON*256);
    if(!Number.isFinite(total)||Math.abs(total-before.volume)>volumeReserve)fail('Die native Teilung hat den Materialerhalt nicht bestätigt.');
    chosen=compound(oc,plane.side==='positive'?positive:negative);validateCadSolid(oc,chosen);const shape=chosen;chosen=null;return shape;
  }finally{chosen?.delete();parts.forEach(s=>s.delete());owned.reverse().forEach(s=>s.delete());}
}
