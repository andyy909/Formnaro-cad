// These operations run only on explicit preview/rebuild. Results are normal BReps.
import {cadVolume,validateCadSolid,readCadBrep,writeCadBrep,cadBoolean,transformCad} from './cad-native-kernel.js';
import {validateAffineMatrix} from './cad-project.js';
import {cadIdentity} from './cad-affine.js';
import {buildCadWire} from './cad-recipes.js';
import {resolveCadSketch} from './cad-sketch.js';
import {circleThrough} from './sketch-profile.js';
import {validateCadModelingOperation} from './cad-modeling-data.js';
export {validateCadModelingOperation} from './cad-modeling-data.js';

const TAU=Math.PI*2,enumValue=value=>typeof value==='string'?value:value?.value??value;
const fail=message=>{const error=Error(message);error.code='CAD_MODELING_UNSUITABLE';throw error;};
function scope(){const values=[];return {keep:value=>(values.push(value),value),release:value=>(values.splice(values.indexOf(value),1),value),close:()=>{for(const value of values.reverse())value?.delete?.();}};}
const xyz=value=>[value.X(),value.Y(),value.Z()],dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
function faces(oc,s,shape){const result=[],ex=s.keep(new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_FACE));while(ex.More()){const raw=s.keep(ex.Current());result.push(s.keep(oc.TopoDS.Face(raw)));if(result.length>2000)fail('Für dieses Werkzeug höchstens 2000 CAD-Flächen verwenden.');ex.Next();}return result;}
function edges(oc,s,shape){const result=[],ex=s.keep(new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_EDGE));while(ex.More()){result.push(s.keep(ex.Current()));if(result.length>256)fail('Die gewählte Fläche besitzt zu viele Kanten.');ex.Next();}return result;}
function axisDirection(s,axis){const direction=s.keep(axis.Direction());return xyz(direction);}
function planeNormal(oc,s,face){const surface=s.keep(new oc.BRepAdaptor_Surface(face));if(enumValue(surface.GetType())!==enumValue(oc.GeomAbs_SurfaceType.GeomAbs_Plane))fail('Flächenversatz benötigt eine ebene native Fläche.');const plane=s.keep(surface.Plane()),position=s.keep(plane.Position()),u=xyz(s.keep(position.XDirection())),v=xyz(s.keep(position.YDirection())),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  // A mirrored gp_Ax3 may be indirect: its Axis.Direction is then opposite
  // to dU × dV. Match native surface normals before applying face orientation.
  return enumValue(face.Orientation())===enumValue(oc.TopAbs_Orientation.TopAbs_REVERSED)?normal.map(value=>-value):normal;}
function area(oc,s,shape){const props=s.keep(new oc.GProp_GProps()),error=oc.BRepGProp.SurfaceProperties(shape,props,1e-10,true),value=props.Mass();if(!Number.isFinite(value)||value<=0||!Number.isFinite(error)||error<0)fail('Native Flächenintegration fehlgeschlagen.');return value;}
function checkOffsetVolume(oc,result,before,expected){const proof=validateCadSolid(oc,result),actual=proof.volume-before;if(proof.solids!==1||Math.abs(actual-expected)>Math.max(1e-6,Math.abs(expected)*1e-7,before*1e-9))fail('Der Versatz trifft weitere Geometrie oder überschreitet die verfügbare Materialtiefe. Einen kleineren Versatz wählen.');return result;}
function offsetCylinder(oc,s,shape,all,face,adaptor,operation){
  const cylinder=s.keep(adaptor.Cylinder()),axis=s.keep(cylinder.Axis()),direction=axisDirection(s,axis),origin=s.keep(cylinder.Location()),location=xyz(origin),radius=cylinder.Radius(),from=adaptor.FirstVParameter(),to=adaptor.LastVParameter();
  if(Math.abs(adaptor.LastUParameter()-adaptor.FirstUParameter()-TAU)>1e-7||![from,to,radius].every(Number.isFinite)||to-from<.01)fail('Zylinderversatz benötigt eine vollständige gerade Zylinderfläche.');
  const boundary=edges(oc,s,face);let rings=0;
  for(const raw of boundary){const edge=s.keep(oc.TopoDS.Edge(raw));if(oc.BRep_Tool.IsClosed(edge,face))continue;const curve=s.keep(new oc.BRepAdaptor_Curve(edge));if(enumValue(curve.GetType())!==enumValue(oc.GeomAbs_CurveType.GeomAbs_Circle)||!curve.IsClosed()||Math.abs(curve.LastParameter()-curve.FirstParameter()-TAU)>1e-7)fail('Die Zylinderfläche besitzt Ausschnitte oder unvollständige Kreisränder.');const circle=s.keep(curve.Circle()),circleAxis=s.keep(circle.Axis());if(Math.abs(circle.Radius()-radius)>1e-7||Math.abs(Math.abs(dot(axisDirection(s,circleAxis),direction))-1)>1e-8)fail('Die Zylindergrenzen sind nicht eindeutig.');rings++;}
  if(rings!==2)fail('Zylinderversatz benötigt genau zwei vollständige Kreisränder.');
  let neighbours=0;for(const other of all){if(other.IsSame(face))continue;const local=scope();try{const otherEdges=edges(oc,local,other);if(!otherEdges.some(edge=>boundary.some(selected=>selected.IsSame(edge))))continue;neighbours++;const surface=local.keep(new oc.BRepAdaptor_Surface(other));if(enumValue(surface.GetType())!==enumValue(oc.GeomAbs_SurfaceType.GeomAbs_Plane))fail('Am Zylinder müssen ebene Stirnflächen ohne Fase oder Rundung angrenzen.');const plane=local.keep(surface.Plane()),normalAxis=local.keep(plane.Axis());if(Math.abs(Math.abs(dot(axisDirection(local,normalAxis),direction))-1)>1e-8)fail('Am Zylinder grenzen schräge Stirnflächen an.');}finally{local.close();}}
  if(neighbours!==2)fail('Die beiden Zylinder-Stirnflächen sind nicht eindeutig.');
  const orientation=(enumValue(face.Orientation())===enumValue(oc.TopAbs_Orientation.TopAbs_REVERSED)?-1:1)*(cylinder.Direct()?1:-1),newRadius=radius+operation.offset*orientation;
  if(newRadius<.01||newRadius>10000)fail('Der Versatz ergibt einen unzulässigen Zylinderradius.');
  const base=s.keep(new oc.gp_Pnt(...location.map((value,i)=>value+direction[i]*from))),normal=s.keep(new oc.gp_Dir(...direction)),placement=s.keep(new oc.gp_Ax2(base,normal));
  const outerBuilder=s.keep(new oc.BRepPrimAPI_MakeCylinder(placement,Math.max(radius,newRadius),to-from)),outer=s.keep(outerBuilder.Shape()),innerBuilder=s.keep(new oc.BRepPrimAPI_MakeCylinder(placement,Math.min(radius,newRadius),to-from)),inner=s.keep(innerBuilder.Shape()),ring=s.keep(cadBoolean(oc,'difference',outer,inner)),result=s.keep(cadBoolean(oc,operation.offset>0?'union':'difference',shape,ring)),expected=Math.sign(operation.offset)*Math.PI*Math.abs(newRadius*newRadius-radius*radius)*(to-from);
  return checkOffsetVolume(oc,result,cadVolume(oc,shape),expected);
}
function offsetFace(oc,s,shape,all,operation){
  const face=all[operation.faceIndex-1];if(!face)fail('Die CAD-Fläche ist nicht mehr vorhanden.');const adaptor=s.keep(new oc.BRepAdaptor_Surface(face));if(enumValue(adaptor.GetType())===enumValue(oc.GeomAbs_SurfaceType.GeomAbs_Cylinder))return offsetCylinder(oc,s,shape,all,face,adaptor,operation);const normal=planeNormal(oc,s,face),boundary=edges(oc,s,face);let neighbours=0;
  // A prism is a true normal face extension only when neighbouring support
  // surfaces continue along that normal. Reject chamfers, fillets and draft.
  for(const other of all){if(other.IsSame(face))continue;const local=scope();try{const otherEdges=edges(oc,local,other);if(!otherEdges.some(edge=>boundary.some(selected=>selected.IsSame(edge))))continue;neighbours++;
    const adaptor=local.keep(new oc.BRepAdaptor_Surface(other)),type=enumValue(adaptor.GetType());let permitted=false;
    if(type===enumValue(oc.GeomAbs_SurfaceType.GeomAbs_Plane)){const plane=local.keep(adaptor.Plane()),axis=local.keep(plane.Axis());permitted=Math.abs(dot(axisDirection(local,axis),normal))<1e-8;}
    if(type===enumValue(oc.GeomAbs_SurfaceType.GeomAbs_Cylinder)){const cylinder=local.keep(adaptor.Cylinder()),axis=local.keep(cylinder.Axis());permitted=Math.abs(Math.abs(dot(axisDirection(local,axis),normal))-1)<1e-8;}
    if(!permitted)fail('An dieser Fläche grenzen schräge oder gekrümmte Übergänge an. Für den sicheren Versatz eine Fläche mit geraden senkrechten Nachbarn wählen.');
  }finally{local.close();}}
  if(!neighbours)fail('Flächennachbarn konnten nicht eindeutig bestimmt werden.');
  const vector=s.keep(new oc.gp_Vec(...normal.map(value=>value*operation.offset))),builder=s.keep(new oc.BRepPrimAPI_MakePrism(face,vector,true,true));if(!builder.IsDone())fail('Flächenversatz konnte nicht aufgebaut werden.');const prism=s.keep(builder.Shape()),before=cadVolume(oc,shape),expected=area(oc,s,face)*operation.offset,result=s.keep(cadBoolean(oc,operation.offset>0?'union':'difference',shape,prism));
  return checkOffsetVolume(oc,result,before,expected);
}
function shell(oc,s,shape,all,operation){
  const closing=s.keep(new oc.NCollection_List_TopoDS_Shape());for(const index of operation.faceIndices){if(!all[index-1])fail('Eine Öffnungsfläche ist nicht mehr vorhanden.');closing.Append(all[index-1]);}
  if(operation.faceIndices.length>=all.length)fail('Mindestens eine Wandfläche muss erhalten bleiben.');
  const maker=s.keep(new oc.BRepOffsetAPI_MakeThickSolid());maker.MakeThickSolidByJoin(shape,closing,-operation.thickness,1e-7,oc.BRepOffset_Mode.BRepOffset_Skin,false,false,oc.GeomAbs_JoinType.GeomAbs_Intersection,false);
  if(!maker.IsDone())fail('Die gewünschte Wandstärke lässt sich an diesem Körper nicht erzeugen.');const result=s.keep(maker.Shape()),proof=validateCadSolid(oc,result),before=validateCadSolid(oc,shape);
  if(proof.solids!==1||proof.volume>=before.volume-Math.max(1e-7,before.volume*1e-10))fail('Die Wandstärke ergibt keine gültige einzelne CAD-Schale.');
  if(proof.bounds.min.some((value,i)=>value<before.bounds.min[i]-1e-6)||proof.bounds.max.some((value,i)=>value>before.bounds.max[i]+1e-6))fail('Die innere CAD-Schale überschreitet die ursprüngliche Außenform.');
  const outside=s.keep(cadBoolean(oc,'difference',result,shape,{allowEmpty:true}));if(outside&&cadVolume(oc,outside)>Math.max(1e-7,before.volume*1e-10))fail('Die innere CAD-Schale liegt teilweise außerhalb des Originals.');
  return result;
}
/** Input stays untouched. Caller owns the returned shape, in the input coordinates. */
export function cadModelingNative(oc,input,requested){const operation=validateCadModelingOperation(requested);if(!['face-offset','shell'].includes(operation.kind))fail('Dieses Werkzeug benötigt Skizzenprofile.');const s=scope();try{const shape=s.keep(readCadBrep(oc,writeCadBrep(oc,input))),proof=validateCadSolid(oc,shape);if(proof.solids!==1)fail('Ein einzelner zusammenhängender CAD-Körper ist erforderlich.');const all=faces(oc,s,shape),result=operation.kind==='face-offset'?offsetFace(oc,s,shape,all,operation):shell(oc,s,shape,all,operation);return s.release(result);}finally{s.close();}}

function profileData(profile){if(!profile||Object.keys(profile).some(key=>!['sketch','frame'].includes(key)))fail('Skizzenprofil und Platzierung erforderlich.');const frame=validateAffineMatrix(profile.frame??cadIdentity()),resolved=resolveCadSketch(profile.sketch);let segments;
  if(resolved.kind==='profile'){if(resolved.native.holes.length)fail('Loft und Sweep unterstützen zunächst eine Außenkontur ohne Innenöffnungen.');segments=resolved.native.outer;}
  else if(resolved.kind==='circle')segments=[{kind:'ellipse',center:[0,0],rx:resolved.diameter/2,ry:resolved.diameter/2,startAngle:0,endAngle:TAU}];
  else segments=resolved.points.map((start,i)=>({kind:'line',start,end:resolved.points[(i+1)%resolved.points.length]}));
  if(!segments.length||segments.length>128)fail('Ein Profil benötigt höchstens 128 Konturelemente.');
  const radialBound=Math.max(...segments.map(segment=>segment.kind==='line'?Math.max(Math.hypot(...segment.start),Math.hypot(...segment.end)):segment.kind==='ellipse'?Math.hypot(...segment.center)+Math.max(segment.rx,segment.ry):(()=>{const arc=circleThrough(segment.start,segment.through,segment.end);return Math.hypot(...arc.center)+arc.radius;})()));
  return {frame,resolved,segments,radialBound};
}
function placedWire(oc,s,wire,frame){
  // transformCad intentionally accepts solids only; use the same native
  // affine transform on the wire without inventing a volumetric wire proof.
  const axes=[frame.slice(0,3),frame.slice(4,7),frame.slice(8,11)],scale=dot(axes[0],axes[0]),similar=axes.every(axis=>Math.abs(dot(axis,axis)-scale)<Math.max(1,scale)*1e-10)&&Math.abs(dot(axes[0],axes[1]))<scale*1e-10&&Math.abs(dot(axes[0],axes[2]))<scale*1e-10&&Math.abs(dot(axes[1],axes[2]))<scale*1e-10;let raw;
  if(similar){const tr=s.keep(new oc.gp_Trsf());tr.SetValues(...[0,1,2].flatMap(row=>[frame[row],frame[4+row],frame[8+row],frame[12+row]]));const builder=s.keep(new oc.BRepBuilderAPI_Transform(wire,tr,true,false));raw=s.keep(builder.Shape());}
  else{const tr=s.keep(new oc.gp_GTrsf());for(let row=0;row<3;row++)for(let col=0;col<4;col++)tr.SetValue(row+1,col+1,frame[col*4+row]);tr.SetForm();raw=s.keep(oc.FormnaroCadBridge.Transform(wire,tr));}
  return s.keep(oc.TopoDS.Wire(raw));
}
function loft(oc,s,profiles){
  if(!Array.isArray(profiles)||profiles.length<2||profiles.length>8)fail('Loft benötigt zwei bis acht getrennte Skizzenprofile.');const maker=s.keep(new oc.BRepOffsetAPI_ThruSections(true,false,1e-7));maker.CheckCompatibility(true);
  const frames=[];for(const item of profiles){const data=profileData(item),wire=s.keep(buildCadWire(oc,data.segments)),placed=placedWire(oc,s,wire,data.frame);if(frames.some(frame=>frame.every((value,i)=>Math.abs(value-data.frame[i])<1e-9)))fail('Loftprofile benötigen verschiedene Platzierungen.');frames.push(data.frame);maker.AddWire(placed);}
  maker.Build();if(!maker.IsDone())fail('Die gewählten Profile lassen sich nicht zu einem Loft verbinden.');return s.keep(maker.Shape());
}
function sweep(oc,s,profile,path){
  const data=profileData(profile),wire=s.keep(buildCadWire(oc,data.segments));let edge;
  if(path.kind==='line'){const start=s.keep(new oc.gp_Pnt(0,0,0)),end=s.keep(new oc.gp_Pnt(0,0,path.length)),maker=s.keep(new oc.BRepBuilderAPI_MakeEdge(start,end));edge=s.keep(maker.Edge());}
  else{
    if(path.radius<=data.radialBound+1e-7)fail('Der Biegeradius muss größer als der gesamte Profilabstand vom Skizzenursprung sein.');
    const angle=path.angle*Math.PI/180,at=t=>s.keep(new oc.gp_Pnt(path.radius*(1-Math.cos(t)),0,path.radius*Math.sin(t))),arc=s.keep(new oc.GC_MakeArcOfCircle(at(0),at(angle/2),at(angle))),curve=s.keep(arc.Value()),maker=s.keep(new oc.BRepBuilderAPI_MakeEdge(curve));edge=s.keep(maker.Edge());
  }
  const pathBuilder=s.keep(new oc.BRepBuilderAPI_MakeWire(edge)),spine=s.keep(pathBuilder.Wire()),faceBuilder=s.keep(new oc.BRepBuilderAPI_MakeFace(wire,true)),face=s.keep(faceBuilder.Face()),builder=s.keep(new oc.BRepOffsetAPI_MakePipe(spine,face));
  if(!builder.IsDone())fail('Das Profil lässt sich nicht entlang dieses Pfads führen.');const local=s.keep(builder.Shape());validateCadSolid(oc,local);return s.keep(transformCad(oc,local,data.frame));
}
/** Loft profiles keep their individual frames. Sweep follows its profile's frame. */
export function cadProfileModelingNative(oc,requested){
  if(!requested||Object.keys(requested).some(key=>!['kind','profiles','profile','path'].includes(key)))fail('Ungültige Profil-Modellierdaten.');
  const operation=validateCadModelingOperation(requested.kind==='loft'?{kind:'loft'}:{kind:requested.kind,path:requested.path});if(!['loft','sweep'].includes(operation.kind))fail('Loft oder Sweep wählen.');const s=scope();try{const result=operation.kind==='loft'?loft(oc,s,requested.profiles):sweep(oc,s,requested.profile,operation.path),proof=validateCadSolid(oc,result);if(proof.solids!==1||proof.bounds.size.some(value=>value>20000))fail('Das Profilwerkzeug benötigt einen gültigen einzelnen Körper innerhalb der Modellgrenzen.');return s.release(result);}finally{s.close();}
}
