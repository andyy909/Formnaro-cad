import {Vector3,Matrix4} from 'three';
import {cadPoint,inverseCadMatrix} from './cad-affine.js';
import {readCadBrep,cadRayHits} from './cad-native-kernel.js';
import {uniqueCadEdgesNative,cadNativeCurveDto} from './cad-edge-display-native.js';
const xyz=p=>[p.X(),p.Y(),p.Z()],enumValue=v=>typeof v==='number'||typeof v==='string'?v:v?.value;
const fail=(code,message)=>{const e=Error(message);e.code=code;throw e;};
const direction=(m,v)=>[0,1,2].map(k=>m[k]*v[0]+m[k+4]*v[1]+m[k+8]*v[2]);
const unit=v=>{const largest=Math.max(...v.map(Math.abs));if(!largest||!Number.isFinite(largest))fail('INVALID_CAD_REFERENCE','Endliche Bezugsrichtung wählen.');const scaled=v.map(x=>x/largest),length=Math.hypot(...scaled);return scaled.map(x=>x/length);};
function worldNormal(m,n){const inv=inverseCadMatrix(m);return unit([0,1,2].map(k=>inv[k*4]*n[0]+inv[k*4+1]*n[1]+inv[k*4+2]*n[2]));}
export function cadReferenceFrame(point,normal){const z=new Vector3(...normal).normalize(),x=Math.abs(z.x)<.8?new Vector3(1,0,0):new Vector3(0,1,0);x.addScaledVector(z,-x.dot(z)).normalize();const y=new Vector3().crossVectors(z,x);return new Matrix4().makeBasis(x,y,z).setPosition(...point).toArray();}
function unique(oc,shape,kind,cast,max){const e=new oc.TopExp_Explorer(shape,kind),list=[],buckets=new Map();try{while(e.More()){const raw=e.Current();try{const hash=oc.ReplicadShapeHasher.HashCode(raw,2147483647),bucket=buckets.get(hash)??[];if(!bucket.some(v=>v.IsSame(raw))){const v=cast(raw);list.push(v);bucket.push(v);buckets.set(hash,bucket);}if(list.length>max)fail('CAD_REFERENCE_LIMIT','Zu viele native Bezugspunkte. Freien Flächenpunkt verwenden.');}finally{raw.delete();}e.Next();}return list;}catch(error){list.forEach(v=>v.delete());throw error;}finally{e.delete();}}
function normalOfPlane(oc,face){const adapter=new oc.BRepAdaptor_Surface(face,false);let plane,axis,dir;try{if(enumValue(adapter.GetType())!==enumValue(oc.GeomAbs_SurfaceType.GeomAbs_Plane))return null;plane=adapter.Plane();axis=plane.Axis();dir=axis.Direction();const n=xyz(dir);return enumValue(face.Orientation())===enumValue(oc.TopAbs_Orientation.TopAbs_REVERSED)?n.map(v=>-v):n;}finally{dir?.delete();axis?.delete();plane?.delete();adapter.delete();}}
function topology(oc,node){
 const shape=readCadBrep(oc,node.brep.data);let vertices=[],edges=[],faces=[];
 try{vertices=unique(oc,shape,oc.TopAbs_ShapeEnum.TopAbs_VERTEX,v=>oc.TopoDS.Vertex(v),60000);edges=uniqueCadEdgesNative(oc,shape);faces=unique(oc,shape,oc.TopAbs_ShapeEnum.TopAbs_FACE,v=>oc.TopoDS.Face(v),8000);return {shape,vertices,edges,faces,dispose:()=>{faces.forEach(v=>v.delete());edges.forEach(v=>v.delete());vertices.forEach(v=>v.delete());shape.delete();}};}catch(e){faces.forEach(v=>v.delete());edges.forEach(v=>v.delete());vertices.forEach(v=>v.delete());shape.delete();throw e;}
}
export function cadReferencePointsNative(oc,node,{maxPoints=20000}={}){
 if(node.kind!=='cad')fail('REFERENCE_MESH_NOT_CAD','Netzreferenzen besitzen keine nativen Bezugspunkte.');
 const data=topology(oc,node),points=[],m=node.transform,edgeFaces=new Map(),edgeIndices=new Map();for(let i=0;i<data.edges.length;i++){const hash=oc.ReplicadShapeHasher.HashCode(data.edges[i],2147483647),bucket=edgeIndices.get(hash)??[];bucket.push(i);edgeIndices.set(hash,bucket);}
 const add=(id,kind,localPoint,extra={})=>{if(points.length>=maxPoints)fail('CAD_REFERENCE_LIMIT','Zu viele native Bezugspunkte. Freien Flächenpunkt verwenden.');points.push({id,kind,point:cadPoint(m,localPoint),localPoint,...extra});};
 try{
  for(let i=0;i<data.vertices.length;i++){const p=oc.BRep_Tool.Pnt(data.vertices[i]);try{add('vertex:'+i,'vertex',xyz(p));}finally{p.delete();}}
  for(let i=0;i<data.edges.length;i++){
   const dto=cadNativeCurveDto(oc,data.edges[i]);
   if(dto.kind==='line')add('edge:'+i,'edge-midpoint',dto.start.map((v,k)=>(v+dto.end[k])/2));
   if(dto.kind==='circle'&&dto.closed&&Math.abs(dto.parameterRange[1]-dto.parameterRange[0]-Math.PI*2)<1e-8){
    const u=new Vector3(...direction(m,dto.xAxis)),v=new Vector3(...direction(m,dto.yAxis)),scale=Math.max(u.lengthSq(),v.lengthSq()),reserve=Number.EPSILON*128*scale;
    if(Math.abs(u.lengthSq()-v.lengthSq())<=reserve&&Math.abs(u.dot(v))<=reserve)add('circle:'+i,'circle-center',dto.center,{normal:worldNormal(m,dto.normal),radius:dto.radii[0]*u.length()});
   }
  }
  for(let i=0;i<data.faces.length;i++){const normal=normalOfPlane(oc,data.faces[i]);if(!normal)continue;const props=new oc.GProp_GProps();let p;
   try{oc.BRepGProp.SurfaceProperties(data.faces[i],props,false,false);if(props.Mass()<=0)continue;p=props.CentreOfMass();const frame=cadReferenceFrame([0,0,0],normal),u=new Vector3(...direction(m,frame.slice(0,3))),v=new Vector3(...direction(m,frame.slice(4,7))),worldArea=props.Mass()*u.cross(v).length();add('face:'+i,'face-centroid',xyz(p),{normal:worldNormal(m,normal),faceIndex:i+1,area:worldArea});const members=uniqueCadEdgesNative(oc,data.faces[i]);try{for(const edge of members){const hash=oc.ReplicadShapeHasher.HashCode(edge,2147483647),bucket=edgeFaces.get(hash)??[];bucket.push({edgeIndex:(edgeIndices.get(hash)??[]).find(index=>data.edges[index].IsSame(edge)),normal:worldNormal(m,normal),faceIndex:i+1});edgeFaces.set(hash,bucket);}}finally{members.forEach(e=>e.delete());}}finally{p?.delete();props.delete();}
  }
  for(const point of points.filter(p=>['circle-center','edge-midpoint'].includes(p.kind))){const index=Number(point.id.split(':')[1]),hash=oc.ReplicadShapeHasher.HashCode(data.edges[index],2147483647),faces=(edgeFaces.get(hash)??[]).filter(f=>f.edgeIndex===index);if(faces.length===1){point.normal=faces[0].normal;point.faceIndex=faces[0].faceIndex;}}
  return {nodeId:node.id,points};
 }finally{data.dispose();}
}

// The token is ephemeral within a model revision. Resolve it from the current
// native BRep again; never trust a saved display coordinate or face index.
export function resolveCadReferenceNative(oc,node,reference){
 if(!reference||typeof reference!=='object'||Array.isArray(reference)||Object.keys(reference).some(k=>!['token','ray','faceIndex'].includes(k)))fail('INVALID_CAD_REFERENCE','Native Bezugspunktwahl fehlt.');
 if(reference.token!==undefined){
  if(typeof reference.token!=='string')fail('INVALID_CAD_REFERENCE','Ungültiger Bezugspunkt.');const result=cadReferencePointsNative(oc,node).points.find(p=>p.id===reference.token);if(!result)fail('STALE_CAD_REFERENCE','Der native Bezugspunkt ist nicht mehr vorhanden.');
  if(reference.faceIndex===undefined&&reference.ray){
    const data=topology(oc,node),ray=reference.ray,inv=inverseCadMatrix(node.transform);
    try{if(!Array.isArray(ray.origin)||ray.origin.length!==3||!ray.origin.every(Number.isFinite)||!Array.isArray(ray.direction)||ray.direction.length!==3||!ray.direction.every(Number.isFinite))fail('INVALID_CAD_REFERENCE','Endlichen Bezugsstrahl wählen.');const dir=direction(inv,unit(ray.direction)),scale=Math.hypot(...dir),hits=cadRayHits(oc,data.shape,{origin:cadPoint(inv,ray.origin),direction:dir,far:(ray.far??1e9)*scale});
      hits.sort((a,b)=>Math.abs(a.t-b.t)>1e-7?a.t-b.t:new Vector3(...worldNormal(node.transform,a.normal)).dot(new Vector3(...unit(ray.direction)))-new Vector3(...worldNormal(node.transform,b.normal)).dot(new Vector3(...unit(ray.direction))));
      for(const hit of hits){if(hit.t>hits[0].t+1e-7)break;const face=data.faces[hit.faceIndex-1],normal=normalOfPlane(oc,face);if(!normal)continue;
        const point=new oc.gp_Pnt(...result.localPoint),maker=new oc.BRepBuilderAPI_MakeVertex(point),vertex=maker.Vertex();let dist;
        try{dist=new oc.BRepExtrema_DistShapeShape(vertex,face);if(dist.IsDone()&&dist.Value()<=oc.Precision.Confusion()*8){result.normal=worldNormal(node.transform,normal);result.faceIndex=hit.faceIndex;break;}}finally{dist?.delete();vertex.delete();maker.delete();point.delete();}
      }
    }finally{data.dispose();}
  }
  if(reference.faceIndex!==undefined){const data=topology(oc,node);try{const index=reference.faceIndex;if(!Number.isSafeInteger(index)||index<1||index>data.faces.length)fail('INVALID_CAD_REFERENCE','Native Bezugsfläche fehlt.');const face=data.faces[index-1],n=normalOfPlane(oc,face);if(!n)fail('INVALID_CAD_REFERENCE','Für diesen Bezug eine native ebene Bezugsfläche wählen.');
    if(result.kind==='circle-center'){
      const edgeIndex=Number(reference.token.split(':')[1]),members=uniqueCadEdgesNative(oc,face);try{if(!members.some(e=>e.IsSame(data.edges[edgeIndex])))fail('INVALID_CAD_REFERENCE','Kreismitte gehört nicht zur gewählten Fläche.');}finally{members.forEach(e=>e.delete());}
    }else if(result.kind==='face-centroid'){if(result.faceIndex!==index)fail('INVALID_CAD_REFERENCE','Flächenschwerpunkt gehört nicht zur gewählten Bezugsfläche.');}
    else{
      const p=new oc.gp_Pnt(...result.localPoint),maker=new oc.BRepBuilderAPI_MakeVertex(p),vertex=maker.Vertex();let distance;
      try{distance=new oc.BRepExtrema_DistShapeShape(vertex,face);if(!distance.IsDone()||distance.Value()>oc.Precision.Confusion()*8)fail('INVALID_CAD_REFERENCE','Bezugspunkt liegt nicht auf der gewählten Fläche.');}finally{distance?.delete();vertex.delete();maker.delete();p.delete();}
    }
    result.normal=worldNormal(node.transform,n);result.faceIndex=index;
  }finally{data.dispose();}}
  return result;
 }
 if(reference.ray){const data=topology(oc,node),inv=inverseCadMatrix(node.transform),ray=reference.ray;
  try{if(!Array.isArray(ray.origin)||ray.origin.length!==3||!ray.origin.every(Number.isFinite)||!Array.isArray(ray.direction)||ray.direction.length!==3||!ray.direction.every(Number.isFinite)||!Math.hypot(...ray.direction))fail('INVALID_CAD_REFERENCE','Endlichen Weltstrahl für den Bezug wählen.');if(reference.faceIndex!==undefined&&(!Number.isSafeInteger(reference.faceIndex)||reference.faceIndex<1||reference.faceIndex>data.faces.length))fail('INVALID_CAD_REFERENCE','Native Bezugsfläche fehlt.');const source=reference.faceIndex===undefined?data.shape:data.faces[reference.faceIndex-1];if(!source)fail('INVALID_CAD_REFERENCE','Native Bezugsfläche fehlt.');const nativeDirection=direction(inv,unit(ray.direction)),scale=Math.hypot(...nativeDirection),hits=cadRayHits(oc,source,{origin:cadPoint(inv,ray.origin),direction:nativeDirection,near:(ray.near??0)*scale,far:(ray.far??1e9)*scale});hits.sort((a,b)=>a.t-b.t);const hit=hits[0];if(!hit)fail('NO_CAD_HIT','Keine native Bezugsfläche getroffen.');if(hits.slice(1).some(h=>Math.abs(h.t-hit.t)<=1e-7&&h.faceIndex!==hit.faceIndex))fail('AMBIGUOUS_CAD_HIT','Eindeutigen nativen Flächenpunkt wählen.');return {kind:'face-point',localPoint:hit.point,point:cadPoint(node.transform,hit.point),normal:worldNormal(node.transform,hit.normal),faceIndex:reference.faceIndex??hit.faceIndex};
  }finally{data.dispose();}
 }
 fail('INVALID_CAD_REFERENCE','Native Bezugspunktwahl fehlt.');
}
