import {Matrix4} from 'three';
import {cadPoint,inverseCadMatrix,multiplyCadMatrices} from './cad-affine.js';
import {cadGeometryDigest} from './cad-geometry-digest.js';
import {cadBounds,cadBoolean,cadVolume,cadRayHits,readCadBrep,writeCadBrep,transformCad,validateCadSolid} from './cad-native-kernel.js';
import {cadReferenceFrame} from './cad-reference-points.js';
import {projectCadFaceAnchorNative} from './cad-topology-native.js';
import {buildCadRecipe} from './cad-recipes.js';
import {validateCadDrillDimensions} from './cad-drill-extent.js';
const fail=message=>{throw Object.assign(Error(message),{code:'CAD_DRILL_REFERENCE_CHANGED'});};
const unit=v=>{const n=Math.hypot(...v);if(!Number.isFinite(n)||n<1e-12)fail('Ungültige Flächennormale.');return v.map(x=>x/n);};
const normal=(matrix,n)=>{const inv=inverseCadMatrix(matrix);return unit([0,1,2].map(row=>inv[row*4]*n[0]+inv[row*4+1]*n[1]+inv[row*4+2]*n[2]));};
const vec=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite),hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const signatures=new Map();export function stepDrillSourceSignature(node){const brep=node?.brep;if(brep?.format==='Formnaro-GeometryRef'&&hash(brep.sha256))return brep.sha256;if(typeof brep?.data!=='string'||!brep.data)fail('STEP-Quellgeometrie fehlt.');let digest=signatures.get(brep.data);if(!digest){digest=cadGeometryDigest(brep.data);signatures.set(brep.data,digest);if(signatures.size>20)signatures.delete(signatures.keys().next().value);}return digest;}
export function validateAssociativeStepDrill(value){
 const keys=['version','sourceId','boxId','sourceSignature','faceKey','exitFaceKey','anchor','termination','kind','diameter','depth','headDiameter','headDepth','angle','gap'];
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k))||value.version!==3||typeof value.sourceId!=='string'||!value.sourceId||value.sourceId.length>200||typeof value.boxId!=='string'||!value.boxId||value.boxId.length>200||![value.sourceSignature,value.faceKey,value.exitFaceKey].every(hash)||!['through','depth','plane'].includes(value.termination)||!value.anchor||Object.keys(value.anchor).sort().join(',')!=='normal,point'||!vec(value.anchor.point)||!vec(value.anchor.normal)||Math.abs(Math.hypot(...value.anchor.normal)-1)>1e-8||![value.depth,value.headDepth,value.headDiameter,value.angle,value.gap].every(Number.isFinite)||value.depth<.1||value.depth>10000||value.headDepth<=0||value.headDepth>10000||value.angle<30||value.angle>150)fail('Ungültiges STEP-Bohrrezept.');
 validateCadDrillDimensions({...value,length:value.termination==='depth'?value.depth:10000});return structuredClone(value);
}
export function findAssociativeStepDrillSource(source){let node=source,matrix=source?.transform;while(node?.source==='group'&&node.drill?.version===3&&node.children?.length===1&&!node.suppressed){node=node.children[0];matrix=multiplyCadMatrices(matrix,node.transform);}if(node?.source!=='step'||!node.solid||node.suppressed)return null;return {node,matrix};}
function faceList(oc,shape){const explorer=new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_FACE),items=[],buckets=new Map();try{while(explorer.More()){const raw=explorer.Current();try{const h=oc.ReplicadShapeHasher.HashCode(raw,2147483647),bucket=buckets.get(h)??[];if(!bucket.some(f=>f.IsSame(raw))){const f=oc.TopoDS.Face(raw);items.push(f);bucket.push(f);buckets.set(h,bucket);}}finally{raw.delete();}if(items.length>8000)fail('Zu viele STEP-Flächen.');explorer.Next();}return items;}catch(error){items.forEach(f=>f.delete());throw error;}finally{explorer.delete();}}
function faceKeyAt(oc,shape,anchor){const faces=faceList(oc,shape),candidates=[];try{for(const face of faces){const points=projectCadFaceAnchorNative(oc,face,anchor);if(points.length===1){const adaptor=new oc.BRepAdaptor_Surface(face,false);try{const kind=adaptor.GetType(),plane=oc.GeomAbs_SurfaceType.GeomAbs_Plane;if((kind?.value??kind)!==(plane?.value??plane))fail('STEP-Bohrung benötigt eine eindeutig ebene Fläche.');}finally{adaptor.delete();}candidates.push(cadGeometryDigest(writeCadBrep(oc,face)));}}if(candidates.length!==1)fail('STEP-Fläche fehlt oder ist mehrdeutig.');const key=candidates[0];if(faces.filter(f=>cadGeometryDigest(writeCadBrep(oc,f))===key).length!==1)fail('STEP-Flächenidentität ist nicht eindeutig.');return key;}finally{faces.forEach(f=>f.delete());}}
export function describeStepDrill(oc,source,point,normalWorld){
 const step=findAssociativeStepDrillSource(source);if(!step)fail('Eine unveränderte positive STEP-Einzelquelle wählen.');const local=readCadBrep(oc,step.node.brep.data),shape=transformCad(oc,local,step.matrix);try{
  const n=unit(normalWorld),eps=1e-4,origin=point.map((v,i)=>v+n[i]*eps),hits=cadRayHits(oc,shape,{origin,direction:n.map(v=>-v),near:0,far:1000000}).sort((a,b)=>a.t-b.t);
  if(hits.length!==2||Math.abs(hits[0].t-eps)>1e-5||hits[1].t-hits[0].t<.1||hits[1].t-hits[0].t>10000||unit(hits[0].normal).reduce((s,v,i)=>s+v*n[i],0)<1-1e-8||unit(hits[1].normal).reduce((s,v,i)=>s+v*n[i],0)>-1+1e-8)fail('Ein einzelner Materialabschnitt mit parallelen Stirnflächen ist erforderlich.');
  const inverse=inverseCadMatrix(step.matrix),anchor={point:cadPoint(inverse,point),normal:normal(inverse,n)},exit={point:cadPoint(inverse,hits[1].point),normal:normal(inverse,hits[1].normal)},faceKey=faceKeyAt(oc,local,anchor),exitFaceKey=faceKeyAt(oc,local,exit);
  return {step,sourceSignature:stepDrillSourceSignature(step.node),faceKey,exitFaceKey,anchor,thickness:hits[1].t-hits[0].t};
 }finally{shape.delete();local.delete();}}
// STEP support is deliberately restricted to exact straight prisms: the
// selected trimmed face must extrude to the complete source body. This keeps
// the full circular footprint valid for the entire drilling depth.
function provePrismaticFootprint(oc,shape,point,n,thickness,radius){
 const faces=faceList(oc,shape);let selected=null,vertex,pointHandle,makeVertex,vector,prismBuilder,prism,left,right,edges;
 try{
  for(const face of faces)if(projectCadFaceAnchorNative(oc,face,{point,normal:n}).length===1){if(selected)fail('STEP-Eintrittsfläche ist mehrdeutig.');selected=face;}
  if(!selected)fail('STEP-Eintrittsfläche fehlt.');pointHandle=new oc.gp_Pnt(...point);makeVertex=new oc.BRepBuilderAPI_MakeVertex(pointHandle);vertex=makeVertex.Vertex();edges=new oc.TopExp_Explorer(selected,oc.TopAbs_ShapeEnum.TopAbs_EDGE);let found=false;
  while(edges.More()){const edge=edges.Current(),dist=new oc.BRepExtrema_DistShapeShape(vertex,edge);try{if(!dist.IsDone()||!Number.isFinite(dist.Value()))fail('STEP-Flächenrand kann nicht geprüft werden.');found=true;if(dist.Value()<=radius+1e-6)fail('Bohrung oder Kopfaufnahme berührt den STEP-Flächenrand.');}finally{dist.delete();edge.delete();}edges.Next();}
  if(!found)fail('STEP-Flächenrand fehlt.');vector=new oc.gp_Vec(...n.map(v=>-v*thickness));prismBuilder=new oc.BRepPrimAPI_MakePrism(selected,vector,true,true);if(!prismBuilder.IsDone())fail('STEP-Prismenprüfung fehlgeschlagen.');prism=prismBuilder.Shape();left=cadBoolean(oc,'difference',shape,prism,{allowEmpty:true});right=cadBoolean(oc,'difference',prism,shape,{allowEmpty:true});const volume=cadVolume(oc,shape),tol=Math.max(1e-7,Math.min(1e-4,volume*1e-10));if((left?cadVolume(oc,left):0)>tol||(right?cadVolume(oc,right):0)>tol)fail('STEP-Bohrung unterstützt zunächst nur gerade prismatische Körper mit konstantem Querschnitt.');
 }finally{right?.delete();left?.delete();prism?.delete();prismBuilder?.delete();vector?.delete();edges?.delete();vertex?.delete();makeVertex?.delete();pointHandle?.delete();faces.forEach(f=>f.delete());}
}
export function buildAssociativeStepDrill(oc,source,drill){
 const step=findAssociativeStepDrillSource(source);if(!step||step.node.id!==drill.boxId||source.id!==drill.sourceId||stepDrillSourceSignature(step.node)!==drill.sourceSignature)fail('Die STEP-Quelle wurde verändert; Bezug ausdrücklich neu wählen.');
 const point=cadPoint(step.matrix,drill.anchor.point),n=normal(step.matrix,drill.anchor.normal),description=describeStepDrill(oc,source,point,n);if(description.faceKey!==drill.faceKey||description.exitFaceKey!==drill.exitFaceKey)fail('STEP-Fläche ist verloren oder mehrdeutig.');
 if(drill.termination==='depth'&&drill.depth>=description.thickness-1e-6)fail('Die feste Bohrtiefe erreicht die gegenüberliegende Fläche; Durchgang wählen oder Tiefe verringern.');
 const length=drill.termination==='depth'?drill.depth:description.thickness,d=validateCadDrillDimensions({...drill,length});
 let prior=source;const head=(drill.kind==='plain'?d.bore:d.head);while(prior?.drill?.version===3){if(prior.drill.faceKey!==drill.faceKey)fail('STEP-Bohrungen auf unterschiedlichen Flächen werden nicht gemeinsam unterstützt.');const other=prior.drill,otherPoint=cadPoint(step.matrix,other.anchor.point),diameter=(other.kind==='plain'?other.diameter:Math.max(other.diameter,other.headDiameter))+2*other.gap,diff=point.map((v,i)=>v-otherPoint[i]),axial=diff.reduce((s,v,i)=>s+v*n[i],0),radial=Math.hypot(...diff.map((v,i)=>v-axial*n[i]));if(radial<=(head+diameter)/2+1e-6)fail('STEP-Bohrungen dürfen sich nicht berühren oder überlappen.');prior=prior.children?.[0];}
 const local=readCadBrep(oc,source.brep.data),stepLocal=readCadBrep(oc,step.node.brep.data),shape=transformCad(oc,local,source.transform),original=transformCad(oc,stepLocal,step.matrix),frame=cadReferenceFrame(point,n),tools=[];let result;
 try{
  provePrismaticFootprint(oc,original,point,n,description.thickness,head/2);
  function cutter(recipe,depth){const tool=buildCadRecipe(oc,recipe),offset=new Matrix4().makeTranslation(0,0,-depth/2).toArray();try{tools.push(transformCad(oc,tool,multiplyCadMatrices(frame,offset)));}finally{tool.delete();}}
  if(drill.kind==='countersink'){const profile=Math.min(length,300);cutter({type:'countersink',size:[d.head,d.head,profile],params:{bore:d.bore,sinkDiameter:d.head,angle:drill.angle,length:profile}},profile);if(length>profile)cutter({type:'cylinder',size:[d.bore,d.bore,length]},length);}
  else{cutter({type:'cylinder',size:[d.bore,d.bore,length]},length);if(drill.kind==='counterbore')cutter({type:'cylinder',size:[d.head,d.head,drill.headDepth]},drill.headDepth);}
  for(const tool of tools){let whole,remaining;try{whole=cadBoolean(oc,'intersection',original,tool);remaining=cadBoolean(oc,'intersection',shape,tool);const expected=cadVolume(oc,tool),a=cadVolume(oc,whole),b=cadVolume(oc,remaining),tolerance=Math.max(1e-7,Math.min(1e-4,expected*1e-8));if(expected<=1e-8||Math.abs(expected-a)>tolerance||Math.abs(a-b)>tolerance)fail('Vollständiger Bohrquerschnitt ist in der STEP-Quelle nicht eindeutig frei.');}finally{whole?.delete();remaining?.delete();}}
  result=shape;for(const tool of tools){const next=cadBoolean(oc,'difference',result,tool);if(result!==shape)result.delete();result=next;}validateCadSolid(oc,result);const out=result;result=null;return out;
 }finally{result?.delete();tools.forEach(t=>t.delete());shape.delete();original.delete();stepLocal.delete();local.delete();}
}
