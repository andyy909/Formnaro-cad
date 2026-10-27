import {Matrix4,Quaternion,Vector3} from 'three';
import {cadPoint,inverseCadMatrix,multiplyCadMatrices} from './cad-affine.js';
import {cadRayHits,readCadBrep} from './cad-native-kernel.js';

const fail=(code,message)=>{const error=Error(message);error.code=code;throw error;};
const enumValue=v=>typeof v==='number'||typeof v==='string'?v:v?.value;
const unit=v=>new Vector3(...v).normalize();

// Validate a native trimmed plane on the original BRep. Affine placement can
// turn analytic surfaces into BSplines in the world copy, so planarity is
// established before transforming its exact native normal.
export function cadOwnPlaneFromHit(oc,node,hit){
  const localPoint=cadPoint(inverseCadMatrix(node.transform),hit.point);
  // A world normal pulls back with the transpose of the original linear map.
  const m=node.transform,n=hit.normal,normal=unit([0,1,2].map(k=>m[k*4]*n[0]+m[k*4+1]*n[1]+m[k*4+2]*n[2])).toArray();
  const shape=readCadBrep(oc,node.brep.data),explorer=new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_FACE),seen=[],buckets=new Map(),point=new oc.gp_Pnt(...localPoint),maker=new oc.BRepBuilderAPI_MakeVertex(point),vertex=maker.Vertex();let matches=0;
  try{
    while(explorer.More()){
      const raw=explorer.Current();let face,adapter,distance;
      try{
        const hash=oc.ReplicadShapeHasher.HashCode(raw,2147483647),bucket=buckets.get(hash)??[];
        if(!bucket.some(v=>v.IsSame(raw))){face=oc.TopoDS.Face(raw);seen.push(face);bucket.push(face);buckets.set(hash,bucket);adapter=new oc.BRepAdaptor_Surface(face,false);
          if(enumValue(adapter.GetType())===enumValue(oc.GeomAbs_SurfaceType.GeomAbs_Plane)){
            distance=new oc.BRepExtrema_DistShapeShape(vertex,face);if(!distance.IsDone())fail('CAD_FACE_PROJECTION_FAILED','Native Auflagefläche konnte nicht geprüft werden.');
            if(distance.Value()<=1e-7){const epsilon=1e-4,hits=cadRayHits(oc,face,{origin:localPoint.map((v,k)=>v+normal[k]*epsilon),direction:normal.map(v=>-v),far:epsilon*2});
              if(hits.some(h=>Math.hypot(...h.point.map((v,k)=>v-localPoint[k]))<=1e-7&&unit(h.normal).dot(unit(normal))>1-1e-8))matches++;
            }
          }
        }
      }finally{distance?.delete();adapter?.delete();raw.delete();}
      if(seen.length>8000)fail('CAD_FACE_LIMIT','Auflagefläche überschreitet die native Flächengrenze.');explorer.Next();
    }
    if(matches!==1)fail('NON_PLANAR_CAD_SUPPORT','Eine eindeutige native ebene Außenfläche anklicken.');
    return {point:[...hit.point],normal:[...hit.normal],localPoint,localNormal:normal};
  }finally{seen.forEach(face=>face.delete());vertex.delete();maker.delete();point.delete();explorer.delete();shape.delete();}
}

export function cadPlacementOnPlane(oc,service,node,hit,workplane){
  const support=cadOwnPlaneFromHit(oc,node,hit),orientation=new Quaternion(...workplane.orientation),up=new Vector3(0,0,1).applyQuaternion(orientation).normalize(),rotation=new Quaternion().setFromUnitVectors(unit(support.normal),up.clone().negate()),contact=new Vector3(...support.point);
  const delta=new Matrix4().makeTranslation(...support.point).multiply(new Matrix4().makeRotationFromQuaternion(rotation)).multiply(new Matrix4().makeTranslation(...support.point.map(v=>-v)));
  const height=up.dot(new Vector3(...workplane.origin).sub(contact));delta.premultiply(new Matrix4().makeTranslation(...up.clone().multiplyScalar(height).toArray()));
  const transform=multiplyCadMatrices(delta.toArray(),node.transform),frame=new Matrix4().makeRotationFromQuaternion(orientation).setPosition(...workplane.origin).toArray(),bounds=service.inspect(node,multiplyCadMatrices(inverseCadMatrix(frame),transform)).worldBounds;
  const tolerance=Math.max(oc.Precision.Confusion()*2,Math.hypot(...bounds.size)*1e-10,Math.max(...transform.map(Math.abs))*Number.EPSILON*64);
  if(bounds.min[2]<-tolerance||Math.abs(bounds.min[2])>tolerance||bounds.max[2]<=tolerance)fail('NON_SUPPORTING_CAD_FACE','Diese Fläche trägt das Teil nicht: Material würde unter der Auflage liegen.');
  return {transform,support,planeBounds:bounds,tolerance,delta:delta.toArray()};
}
