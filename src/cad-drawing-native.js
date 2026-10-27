// Explicit, read-only technical drawing calculations in the existing CAD worker.
// Curves remain in model millimetres with mathematical Y up; sheet placement,
// scale, text and zoom never enter this native query.
import {cadIdentity,inverseCadMatrix,multiplyCadMatrices} from './cad-affine.js';
import {cadBounds,readCadBrep,transformCad} from './cad-native-kernel.js';
import {cadGeometryDigest,cadSourceGeometryDigest} from './cad-geometry-digest.js';
import {uniqueCadEdgesNative,cadNativeCurveDto,transformCadGeometryRigidNative,transformCadGeometryAffineNative} from './cad-edge-display-native.js';
import {createCadPrecisionNative} from './cad-precision-native.js';
import {cadContourEdgeSourceKey} from './cad-linked-contours-native.js';

const TAU=2*Math.PI;
const fail=message=>{const error=Error(message);error.code='INVALID_DRAWING_PROJECTION';throw error;};
const xy=p=>p.slice(0,2).map(v=>v===0?0:v);

export function cadDrawingViewFrame(view,section){
 if(!['front','side','top','section'].includes(view))fail('Unbekannte technische Zeichnungsansicht.');
 if(view==='section'&&(!section||Object.keys(section).some(k=>!['axis','offset'].includes(k))||![0,1,2].includes(section.axis)||!Number.isFinite(section.offset)||Math.abs(section.offset)>100000))fail('Schnittansicht benötigt Achse und gültige Lage in Millimetern.');
 if(view!=='section'&&section!==undefined)fail('Nur eine Schnittansicht besitzt eine Schnittlage.');
 const axis=view==='section'?section.axis:view==='top'?2:view==='front'?1:0;
 const frame=axis===2?cadIdentity():axis===1?[1,0,0,0,0,0,1,0,0,-1,0,0,0,0,0,1]:[0,1,0,0,0,0,1,0,1,0,0,0,0,0,0,1];
 if(view==='section')frame[12+axis]=section.offset;
 return frame;
}

// Convert a native B-spline to its original rational Bézier spans. This is an
// exact basis change; its weights/poles are not sampled tessellation points.
function splineSpans(oc,edge){
 const plane=new oc.gp_Pln(),maker=new oc.BRepBuilderAPI_MakeFace(plane),face=maker.Face(),surface=oc.BRep_Tool.Surface(face),location=new oc.TopLoc_Location();let envelope,adapter,spline,converter;
 try{
  envelope=oc.BRep_Tool.CurveOnPlane(edge,surface,location);if(!envelope.returnValue)fail('Native planare Zeichnungskurve fehlt.');
  adapter=new oc.Geom2dAdaptor_Curve(envelope.returnValue,envelope.First,envelope.Last);spline=adapter.BSpline();converter=new oc.Geom2dConvert_BSplineCurveToBezierCurve(spline,envelope.First,envelope.Last,1e-10);
  const count=converter.NbArcs();if(count>8000)fail('Zeichnung überschreitet die Kurvenstückgrenze.');const curves=[];
  for(let i=1;i<=count;i++){const arc=converter.Arc(i),poles=[],weights=[];try{for(let k=1;k<=arc.NbPoles();k++){const p=arc.Pole(k);try{poles.push([p.X(),p.Y()]);weights.push(arc.Weight(k));}finally{p.delete();}}curves.push({kind:'bezier',poles,weights});}finally{arc.delete();}}
  return curves;
 }finally{converter?.delete();spline?.delete();adapter?.delete();envelope?.[Symbol.dispose]?.();location.delete();surface.delete();face.delete();maker.delete();plane.delete();}
}

function planarCurves(oc,edge){
 const dto=cadNativeCurveDto(oc,edge);
 if(dto.kind==='line'){let a=xy(dto.start),b=xy(dto.end);if(a[0]>b[0]||a[0]===b[0]&&a[1]>b[1])[a,b]=[b,a];return Math.hypot(a[0]-b[0],a[1]-b[1])>1e-10?[{kind:'line',a,b}]:[];}
 if(['circle','ellipse'].includes(dto.kind)){
  const [from,to]=dto.parameterRange,span=to-from;if(span>TAU+1e-7)fail('Native Zeichnungskurve überschreitet eine Periode.');
  const center=xy(dto.center),clockwise=dto.xAxis[0]*dto.yAxis[1]-dto.xAxis[1]*dto.yAxis[0]<0,closed=dto.closed&&Math.abs(span-TAU)<1e-7;
  if(dto.kind==='circle'){
   if(closed)return [{kind:'circle',center,radius:dto.radii[0]}];
   const startAngle=Math.atan2(dto.start[1]-center[1],dto.start[0]-center[0]);
   return [{kind:'arc',center,radius:dto.radii[0],startAngle,endAngle:startAngle+(clockwise?-span:span),clockwise}];
  }
  // Parameters increase in the supplied orthonormal axis basis. Its handedness
  // is explicit in xAxis/yAxis, so no inferred rotation loses mirrored curves.
  return [{kind:'ellipse',center,radii:[...dto.radii],xAxis:xy(dto.xAxis),yAxis:xy(dto.yAxis),startAngle:from,endAngle:to,clockwise,closed}];
 }
 if(dto.kind==='bezier'){if(dto.poles.length>26)fail('Zeichnung überschreitet die Bézier-Gradgrenze.');return [{kind:'bezier',poles:dto.poles.map(xy),weights:[...dto.weights]}];}
 if(dto.kind==='bspline')return splineSpans(oc,edge);
 fail('Native Zeichnungskurve kann nicht mit kontrollierter Geometrie ausgegeben werden.');
}

// Optional correspondence for complete, analytically identical projections.
// Fragments, silhouettes and unsupported projections keep their legacy IDs;
// they never acquire an inferred or nearest semantic edge correspondence.
const referenceNear=(a,b)=>a.length===b.length&&a.every((v,k)=>Math.abs(v-b[k])<=1e-7);
function referenceBucket(curve){const values=curve.kind==='line'?[...curve.a,...curve.b]:curve.kind==='circle'?[...curve.center,curve.radius]:null;return values?curve.kind+':'+values.map(v=>Math.round(v*1e6)).join(','):null;}
function sameProjectedCurve(a,b){return a.kind===b.kind&&(a.kind==='line'?referenceNear(a.a,b.a)&&referenceNear(a.b,b.b):a.kind==='circle'&&referenceNear(a.center,b.center)&&Math.abs(a.radius-b.radius)<=1e-7);}
function drawingSourceReferences(oc,nodes,inverse){
 const buckets=new Map();let count=0,overflow=false;
 function visit(node,target,parent){
  if(node.kind!=='cad'||node.suppressed)return;const world=multiplyCadMatrices(parent,node.transform);
  if(node.source==='step'||node.source==='native'&&['box','cylinder','sketch'].includes(node.recipe?.type)){
   const shape=readCadBrep(oc,node.brep.data),brepSignature=node.source==='step'?cadGeometryDigest(node.brep.data):null;let edges=[];
   try{edges=uniqueCadEdgesNative(oc,shape);for(const edge of edges){if(++count>20000){overflow=true;return;}let placed,placedEdge;try{
    placed=transformCadGeometryAffineNative(oc,edge,multiplyCadMatrices(inverse,world));placedEdge=oc.TopoDS.Edge(placed);const dto=cadNativeCurveDto(oc,placedEdge);if(dto.kind!=='line'&&(dto.kind!=='circle'||Math.abs(Math.abs(dto.normal[2])-1)>1e-9||Math.abs(dto.parameterRange[1]-dto.parameterRange[0]-TAU)>1e-7))continue;
    const curves=planarCurves(oc,placedEdge);if(curves.length!==1)continue;const curve=curves[0],bucket=referenceBucket(curve);if(!bucket)continue;let role;try{role=cadContourEdgeSourceKey(oc,node,edge);}catch(error){if(error.code==='CONTOUR_REBIND_REQUIRED')continue;throw error;}
    let elementId;if(node.recipe?.type==='sketch'){const local=cadNativeCurveDto(oc,edge),z=local.start[2],side=Math.abs(z-node.stats.bounds.min[2])<=1e-7?'min':Math.abs(z-node.stats.bounds.max[2])<=1e-7?'max':null;if(!side)continue;role='sketch.cap.'+side+':'+role;if([2,3,4].includes(node.recipe.sketch.version))elementId=role.slice(role.indexOf('sketch.edge.')+12);}
    const ref={source:structuredClone(target),role,...(elementId?{elementId}:{}),...(node.source==='step'?{geometrySignature:brepSignature}:{})},list=buckets.get(bucket)??[];if(list.length<100)list.push({curve,ref});else overflow=true;buckets.set(bucket,list);
   }finally{placedEdge?.delete();placed?.delete();}}}finally{edges.forEach(edge=>edge.delete());shape.delete();}
  }else if(!node.extraction&&!node.modeling?.sourceSignature)for(const child of node.children??[])visit(child,{rootId:target.rootId,path:[...target.path,child.id]},world);
 }
 for(const node of nodes)visit(node,{rootId:node.id,path:[]},cadIdentity());
 return curve=>{if(overflow)return undefined;const candidates=(buckets.get(referenceBucket(curve))??[]).filter(item=>sameProjectedCurve(curve,item.curve)),refs=[...new Map(candidates.map(item=>[JSON.stringify(item.ref),item.ref])).values()].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return refs.length&&refs.length<=8?refs:undefined;};
}

/** Returns shared, exact 2D curve data for PDF/SVG/DXF. Native cancellation is
 * supplied by the persistent worker boundary, exactly as for HLR and section. */
export function createCadDrawingNative({oc,service}={}){
 if(!oc||typeof service?.worldShape!=='function'||typeof service.productionNodes!=='function')throw TypeError('Nativer CAD-Dienst für technische Zeichnungen erforderlich.');
 return function drawingProjection(project,options={}){
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['ids','view','section','includeHidden','tolerance','maxPoints'].includes(k)))fail('Unbekannte Zeichnungsoption.');
  const {ids,view,section,includeHidden=true,tolerance=.01,maxPoints=200000}=options;
  if(!Array.isArray(ids)||!ids.length||ids.length>128||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length||typeof includeHidden!=='boolean'||!Number.isFinite(tolerance)||tolerance<1e-7||tolerance>.1||!Number.isSafeInteger(maxPoints)||maxPoints<2||maxPoints>200000)fail('Ungültiger Umfang oder Genauigkeit der technischen Zeichnung.');
  const frame=cadDrawingViewFrame(view,section),inverse=inverseCadMatrix(frame),nodes=service.productionNodes(project,{ids});
  if(nodes.length!==ids.length||nodes.some(n=>n.suppressed))fail('Zeichnungsansichten benötigen sichtbare aktive native CAD-Materialteile.');
  const shapes=[],contours=[],extractions=[],algorithm=new oc.HLRBRep_Algo(),projector=new oc.HLRAlgo_Projector(),curves=[],seen=new Map();let filter,min=[Infinity,Infinity],max=[-Infinity,-Infinity],points=0;
  function consume(shape,hidden){
   if(!shape||shape.IsNull())return;if(!oc.BRepLib.BuildCurves3d(shape))fail('Native Zeichnungskurven konnten nicht erzeugt werden.');
   const edges=uniqueCadEdgesNative(oc,shape);
   try{for(const edge of edges){const dtos=planarCurves(oc,edge);if(!dtos.length)continue;const bounds=cadBounds(oc,edge);for(let k=0;k<2;k++){min[k]=Math.min(min[k],bounds.min[k]);max[k]=Math.max(max[k],bounds.max[k]);}
    for(const dto of dtos){
     // An occluded rear edge can project onto the exact same curve as a visible
     // front edge. Draw that geometry once, with visibility taking precedence;
     // otherwise the later dashed path masks the solid silhouette and its hit
     // target. Compare exact geometry only, never nearest/similar curves.
     const key=JSON.stringify(dto),index=seen.get(key);
     if(index!==undefined){if(!hidden&&curves[index].hidden)curves[index].hidden=false;continue;}
     points+=dto.poles?.length??dto.points?.length??2;if(points>maxPoints||curves.length>=20000)fail('Zeichnung überschreitet die gesamte Kurven-/Punktgrenze.');seen.set(key,curves.length);curves.push({id:'c'+cadGeometryDigest(key).slice(0,24),...dto,hidden});
    }
   }}finally{edges.forEach(edge=>edge.delete());}
  }
  try{
   const precision=view==='section'?createCadPrecisionNative({oc,service}):null;
   for(const node of nodes){
    if(view==='section'){
     const result=precision.section({node,frame,side:'negative',maxPoints});
     // The cap boundary is an internally generated wire, not a material
     // solid. The public project BRep reader correctly refuses such wires.
     for(const [field,destination] of [['clipBrep',shapes],['contoursBrep',contours]])if(result[field]){const world=field==='clipBrep'?readCadBrep(oc,result[field]):oc.BRepToolsWrapper.Read(result[field]);try{destination.push(transformCadGeometryRigidNative(oc,world,inverse));}finally{world.delete();}}
    }else{const world=service.worldShape(node);try{shapes.push(transformCad(oc,world,inverse));}finally{world.delete();}}
   }
   if(shapes.length){algorithm.Projector(projector);for(const shape of shapes)algorithm.Add(shape,0);algorithm.Update();algorithm.Hide();filter=new oc.HLRBRep_HLRToShape(algorithm);
    const types=[['VCompound',false],['OutLineVCompound',false],['Rg1LineVCompound',false]];if(includeHidden)types.push(['HCompound',true],['OutLineHCompound',true],['Rg1LineHCompound',true]);
    for(const [method,hidden] of types){const shape=filter[method]();extractions.push(shape);consume(shape,hidden);}
   }
   for(const shape of contours)consume(shape,false);
   if(!curves.length)fail('Die Zeichnungsansicht ist leer. Schnittlage und Teile prüfen.');
   if(view!=='section'){const sourceReferences=drawingSourceReferences(oc,nodes,inverse);for(const curve of curves){const references=sourceReferences(curve);if(references)curve.sourceReferences=references;}}
   return {kind:'cad-drawing-projection',view,frame,curves,bounds:{min,max},sourceSignatures:nodes.map(node=>({id:node.id,signature:cadSourceGeometryDigest(node)})),tolerance,approximation:'exact-native-curves'};
  }finally{extractions.forEach(s=>s.delete());filter?.delete();algorithm.delete();projector.delete();contours.forEach(s=>s.delete());shapes.forEach(s=>s.delete());}
 };
}
