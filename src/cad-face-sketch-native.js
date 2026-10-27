// Independent analytic copy of one trimmed planar CAD face. This is an
// on-demand query, with no retained native handles or associative references.
import {resolveCadSketch} from './cad-sketch.js';

const TAU=2*Math.PI,TOLERANCE=1e-7;
const value=v=>v?.value??v,xyz=p=>[p.X(),p.Y(),p.Z()];
const dot=(a,b)=>a.reduce((sum,v,k)=>sum+v*b[k],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const near=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]))<=TOLERANCE;
const fail=(code,message)=>{const error=Error(message);error.code=code;throw error;};
function scope(run){const handles=[],keep=v=>{handles.push(v);return v;};try{return run(keep);}finally{for(let i=handles.length-1;i>=0;i--)handles[i].delete();}}

function selectedFace(oc,shape,index){
 const faces=[],buckets=new Map(),explorer=new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_FACE);
 try{while(explorer.More()){
  const raw=explorer.Current();try{
   const hash=oc.ReplicadShapeHasher.HashCode(raw,2147483647),bucket=buckets.get(hash)??[];
   if(!bucket.some(face=>face.IsSame(raw))){
    const face=oc.TopoDS.Face(raw);faces.push(face);bucket.push(face);buckets.set(hash,bucket);
    if(faces.length===index){faces.pop();return face;}
   }
  }finally{raw.delete();}
  if(faces.length>=8000)fail('FACE_SKETCH_LIMIT','Konturübernahme: höchstens 8000 CAD-Flächen durchsuchen.');
  explorer.Next();
 }fail('FACE_SKETCH_FACE_LOST','Die gewählte CAD-Fläche ist nicht mehr vorhanden.');}
 finally{faces.forEach(face=>face.delete());explorer.delete();}
}

function faceFrame(oc,face){return scope(keep=>{
 const adapter=keep(new oc.BRepAdaptor_Surface(face,false));
 if(value(adapter.GetType())!==value(oc.GeomAbs_SurfaceType.GeomAbs_Plane))fail('FACE_SKETCH_NOT_PLANAR','Eine ebene CAD-Fläche für die Konturübernahme wählen.');
 const plane=keep(adapter.Plane()),position=keep(plane.Position()),location=keep(position.Location()),xDirection=keep(position.XDirection()),yDirection=keep(position.YDirection());
 // A mirrored native plane may have a left-handed gp_Ax3. Its parametric
 // normal is U cross V, not necessarily the stored main-axis direction.
 const origin=xyz(location),x=xyz(xDirection),sign=value(face.Orientation())===value(oc.TopAbs_Orientation.TopAbs_REVERSED)?-1:1,z=cross(x,xyz(yDirection)).map(v=>sign*v),y=cross(z,x);
 if([...origin,...x,...y,...z].some(v=>!Number.isFinite(v)))fail('FACE_SKETCH_INVALID_PLANE','Die CAD-Fläche besitzt keine endliche Ebene.');
 const project=point=>{const delta=point.map((v,k)=>v-origin[k]);if(!delta.every(Number.isFinite)||Math.abs(dot(delta,z))>TOLERANCE)fail('FACE_SKETCH_NOT_PLANAR','Die CAD-Randkurve liegt nicht hinreichend genau in der gewählten Ebene.');return [dot(delta,x),dot(delta,y)];};
 return {frame:[...x,0,...y,0,...z,0,...origin,1],project,z};
});}

function edgeElement(oc,edge,project,normal,id){return scope(keep=>{
 if(oc.BRep_Tool.Degenerated(edge))fail('FACE_SKETCH_DEGENERATE','Entartete CAD-Randkanten können nicht als Skizze übernommen werden.');
 const curve=keep(new oc.BRepAdaptor_Curve(edge)),type=value(curve.GetType()),first=curve.FirstParameter(),last=curve.LastParameter();
 if(!Number.isFinite(first)||!Number.isFinite(last)||last<=first)fail('FACE_SKETCH_INVALID_CURVE','Die CAD-Randkurve besitzt kein endliches Kurvenintervall.');
 const point=t=>{const p=keep(curve.Value(t));return project(xyz(p));},backwards=value(edge.Orientation())===value(oc.TopAbs_Orientation.TopAbs_REVERSED);
 if(type===value(oc.GeomAbs_CurveType.GeomAbs_Line))return {id,type:'line',start:point(backwards?last:first),end:point(backwards?first:last)};
 if(type!==value(oc.GeomAbs_CurveType.GeomAbs_Circle))fail('FACE_SKETCH_UNSUPPORTED_CURVE','Konturübernahme unterstützt gerade Linien und echte Kreise/Kreisbögen. Ellipsen und Splines werden nicht angenähert.');
 const circle=keep(curve.Circle()),center=keep(circle.Location()),axis=keep(circle.Axis()),direction=keep(axis.Direction()),radius=circle.Radius(),span=last-first;
 if(!Number.isFinite(radius)||radius<=0||Math.abs(Math.abs(dot(xyz(direction),normal))-1)>1e-9||span>TAU+1e-7)fail('FACE_SKETCH_INVALID_CURVE','Die Kreiskante ist nicht als ebene Skizzenkurve übernehmbar.');
 if(curve.IsClosed()&&Math.abs(span-TAU)<=1e-7)return {id,type:'circle',center:project(xyz(center)),diameter:2*radius};
 return {id,type:'arc',start:point(backwards?last:first),through:point((first+last)/2),end:point(backwards?first:last)};
});}

function reverseElement(e){return {...e,start:e.end,end:e.start};}
// WireExplorer is deliberately unnecessary: native analytic end points order
// the bounded edge set. Ambiguous/touching/open loops are rejected explicitly.
function orderLoop(elements){
 if(elements.length===1&&elements[0].type==='circle')return elements;
 if(elements.some(e=>e.type==='circle'))fail('FACE_SKETCH_INVALID_WIRE','Ein vollständiger Kreis muss eine eigene geschlossene Kontur bilden.');
 const remaining=elements.slice(1),ordered=[elements[0]];
 while(remaining.length){const tail=ordered.at(-1).end,candidates=[];
  for(let i=0;i<remaining.length;i++){const e=remaining[i];if(near(tail,e.start))candidates.push({i,element:e});if(near(tail,e.end))candidates.push({i,element:reverseElement(e)});}
  if(candidates.length!==1)fail('FACE_SKETCH_INVALID_WIRE','Die CAD-Kontur ist offen, berührt sich oder ist nicht eindeutig zusammenhängend.');
  const next=candidates[0];remaining.splice(next.i,1);ordered.push(next.element);
 }
 if(!near(ordered.at(-1).end,ordered[0].start))fail('FACE_SKETCH_INVALID_WIRE','Die CAD-Kontur ist nicht geschlossen.');
 return ordered;
}

/** Caller owns worldShape. faceIndex uses the one-based native unique-face map
 * from cadRayHits and must be bound to the current model revision by caller.
 * Returned frame is a right-handed world matrix; sketch coordinates lie on Z0.
 * Only analytic lines/circles/arcs are copied, including independent hole loops.
 */
export function faceSketchNative(oc,worldShape,faceIndex,{height=3,maxElements=128,edgeKey}={}){
 if(!Number.isSafeInteger(faceIndex)||faceIndex<1||faceIndex>8000)fail('FACE_SKETCH_INVALID_FACE','Eine gültige CAD-Fläche für die Konturübernahme wählen.');
 if(!Number.isFinite(height)||height<.01||height>10000||!Number.isSafeInteger(maxElements)||maxElements<1||maxElements>128)fail('FACE_SKETCH_INVALID_OPTIONS','Konturübernahme benötigt 0,01–10000 mm Höhe und höchstens 128 Elemente.');
 if(!worldShape||typeof worldShape.IsNull!=='function'||worldShape.IsNull())fail('FACE_SKETCH_INVALID_SHAPE','Ein vorhandener CAD-Körper für die Konturübernahme ist erforderlich.');
 if(edgeKey!==undefined&&typeof edgeKey!=='function')fail('FACE_SKETCH_INVALID_OPTIONS','Interne Kantenherkunft benötigt eine native Prüffunktion.');
 return scope(keep=>{
  const face=keep(selectedFace(oc,worldShape,faceIndex)),{frame,project,z}=faceFrame(oc,face),outer=keep(oc.BRepTools.OuterWire(face));
  if(outer.IsNull())fail('FACE_SKETCH_INVALID_WIRE','Die gewählte CAD-Fläche besitzt keine geschlossene Außenkontur.');
  const wireExplorer=keep(new oc.TopExp_Explorer(face,oc.TopAbs_ShapeEnum.TopAbs_WIRE)),loops=[],elements=[],wires=[];
  while(wireExplorer.More()){
   const raw=keep(wireExplorer.Current()),wire=keep(oc.TopoDS.Wire(raw));
   if(wires.some(previous=>previous.IsSame(wire)))fail('FACE_SKETCH_INVALID_WIRE','Die CAD-Fläche enthält eine mehrfach verwendete Randkontur.');wires.push(wire);
   if(loops.length>=64)fail('FACE_SKETCH_LIMIT','Konturübernahme unterstützt höchstens 64 geschlossene Konturen.');
   const loopElements=[],edgeExplorer=keep(new oc.TopExp_Explorer(wire,oc.TopAbs_ShapeEnum.TopAbs_EDGE)),edges=[];
   while(edgeExplorer.More()){
    if(elements.length+loopElements.length>=maxElements)fail('FACE_SKETCH_LIMIT',`Konturübernahme unterstützt höchstens ${maxElements} Linien, Kreise und Bögen.`);
    const edgeRaw=keep(edgeExplorer.Current()),edge=keep(oc.TopoDS.Edge(edgeRaw));
    if(edges.some(previous=>previous.IsSame(edge)))fail('FACE_SKETCH_INVALID_WIRE','Die CAD-Kontur enthält eine mehrfach verwendete Kante.');edges.push(edge);
    const id=edgeKey?edgeKey(edge):'copy-edge-'+(elements.length+loopElements.length+1);
    if(typeof id!=='string'||!id||id.length>100)fail('FACE_SKETCH_INVALID_CURVE','Die CAD-Kante besitzt keine eindeutige stabile Kennung.');
    loopElements.push(edgeElement(oc,edge,project,z,id));edgeExplorer.Next();
   }
   if(!loopElements.length)fail('FACE_SKETCH_INVALID_WIRE','Eine CAD-Randkontur enthält keine übernehmbaren Kanten.');
   const ordered=orderLoop(loopElements);elements.push(...ordered);loops.push({id:'copy-loop-'+(loops.length+1),role:outer.IsSame(wire)?'outer':'hole',elements:ordered.map(e=>e.id)});wireExplorer.Next();
  }
  const sketch={version:2,kind:'profile',variables:[{name:'hoehe',value:String(height)}],dimensions:{height:'hoehe'},elements,loops},resolved=resolveCadSketch(sketch),properties=keep(new oc.GProp_GProps());
  oc.BRepGProp.SurfaceProperties(face,properties,false,false);const area=properties.Mass();
  if(!Number.isFinite(area)||area<=0||Math.abs(area-resolved.area)>Math.max(1e-6,area*1e-9))fail('FACE_SKETCH_AREA_MISMATCH','Die übernommene Kontur stimmt nicht mit der nativen CAD-Fläche überein.');
  return {sketch:resolved.sketch,frame,faceIndex,elementCount:elements.length,area:resolved.area};
 });
}
