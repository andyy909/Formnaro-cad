// Transient renderer data derived from native CAD curves. Neither these
// polylines nor edge tokens belong in format-5 projects or Undo snapshots.
import {validateAffineMatrix,cadProjectRevision,createCadProject} from './cad-project.js';
import {cadIdentity,inverseCadMatrix,cadPoint,multiplyCadMatrices} from './cad-affine.js';
import {cadBounds,readCadBrep} from './cad-native-kernel.js';
import {listCadEdgesNative,cadEdgesCorrespondNative} from './cad-finish-native.js';

const enumValue=value=>typeof value==='string'||typeof value==='number'?value:value?.value;
const xyz=p=>[p.X(),p.Y(),p.Z()];
function value(curve,u){const p=curve.Value(u);try{return xyz(p);}finally{p.delete();}}
function fail(code,message){const error=Error(message);error.code=code;throw error;}
function quality({linearDeflection=.02,angularDeflection=.15,maxPoints=200000}={}){if(!Number.isFinite(linearDeflection)||linearDeflection<1e-7||!Number.isFinite(angularDeflection)||angularDeflection<=0||angularDeflection>Math.PI||!Number.isSafeInteger(maxPoints)||maxPoints<2||maxPoints>1000000)throw Error('Ungültige native CAD-Kurvenanzeigequalität.');return {linearDeflection,angularDeflection,maxPoints};}
export function uniqueCadEdgesNative(oc,shape){const explorer=new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_EDGE),result=[],buckets=new Map();try{while(explorer.More()){const raw=explorer.Current();try{const hash=oc.ReplicadShapeHasher.HashCode(raw,2147483647),bucket=buckets.get(hash)||[];if(!bucket.some(edge=>edge.IsSame(raw))){const edge=oc.TopoDS.Edge(raw);if(oc.BRep_Tool.Degenerated(edge))edge.delete();else{result.push(edge);bucket.push(edge);buckets.set(hash,bucket);}}}finally{raw.delete();}if(result.length>60000)throw Error('CAD-Kantenanzeige überschreitet die Projektgrenze.');explorer.Next();}return result;}catch(error){result.forEach(edge=>edge.delete());throw error;}finally{explorer.delete();}}

/** A bounded native curve description. Control poles are original CAD data,
 * not sampled construction points. All coordinates belong to input shape. */
export function cadNativeCurveDto(oc,edge){
  const curve=new oc.BRepAdaptor_Curve(edge);let native,trimmed;
  try{
    const from=curve.FirstParameter(),to=curve.LastParameter(),type=enumValue(curve.GetType());if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from)fail('UNBOUNDED_CAD_EDGE','CAD-Kante besitzt kein endliches Intervall.');
    const base={parameterRange:[from,to],closed:curve.IsClosed(),start:value(curve,from),end:value(curve,to)};
    if(type===enumValue(oc.GeomAbs_CurveType.GeomAbs_Line))return {...base,kind:'line'};
    if(type===enumValue(oc.GeomAbs_CurveType.GeomAbs_Circle)||type===enumValue(oc.GeomAbs_CurveType.GeomAbs_Ellipse)){
      const circle=type===enumValue(oc.GeomAbs_CurveType.GeomAbs_Circle),conic=circle?curve.Circle():curve.Ellipse(),position=conic.Position(),center=position.Location(),x=position.XDirection(),y=position.YDirection(),n=position.Direction();
      try{return {...base,kind:circle?'circle':'ellipse',center:xyz(center),xAxis:xyz(x),yAxis:xyz(y),normal:xyz(n),radii:circle?[conic.Radius(),conic.Radius()]:[conic.MajorRadius(),conic.MinorRadius()]};}
      finally{n.delete();y.delete();x.delete();center.delete();position.delete();conic.delete();}
    }
    if(type===enumValue(oc.GeomAbs_CurveType.GeomAbs_BezierCurve)){
      native=curve.Bezier();trimmed=new oc.Geom_BezierCurve(native);trimmed.Segment(from,to);const poles=[],weights=[];for(let i=1;i<=trimmed.NbPoles();i++){const p=trimmed.Pole(i);try{poles.push(xyz(p));weights.push(trimmed.Weight(i));}finally{p.delete();}}
      return {...base,kind:'bezier',degree:trimmed.Degree(),rational:trimmed.IsRational(),poles,weights};
    }
    if(type===enumValue(oc.GeomAbs_CurveType.GeomAbs_BSplineCurve)){
      native=curve.BSpline();const poles=[],weights=[],knots=[],multiplicities=[];for(let i=1;i<=native.NbPoles();i++){const p=native.Pole(i);try{poles.push(xyz(p));weights.push(native.Weight(i));}finally{p.delete();}}for(let i=1;i<=native.NbKnots();i++){knots.push(native.Knot(i));multiplicities.push(native.Multiplicity(i));}
      return {...base,kind:'bspline',degree:native.Degree(),rational:native.IsRational(),periodic:native.IsPeriodic(),poles,weights,knots,multiplicities};
    }
    return {...base,kind:'other-native',nativeType:type};
  }finally{trimmed?.delete();native?.delete();curve.delete();}
}

/** Native curve deflection is for rendering only, never model authority. */
export function cadCurveDisplayPointsNative(oc,edge,options={}){
  const q=quality(options),curve=new oc.BRepAdaptor_Curve(edge);let sampler;
  // Constructor overloads with optional arguments also accept a restricted
  // parameter range at this arity. Initialize has an unambiguous full-curve
  // signature and therefore preserves the requested angular/linear quality.
  try{sampler=new oc.GCPnts_TangentialDeflection();sampler.Initialize(curve,q.angularDeflection,q.linearDeflection,2,1e-10,1e-9);const count=sampler.NbPoints();if(!Number.isSafeInteger(count)||count<2||count>q.maxPoints)throw Error('CAD-Kurvenanzeige überschreitet die Punktgrenze.');const points=[];for(let i=1;i<=count;i++){const p=sampler.Value(i);try{const point=xyz(p);if(!point.every(Number.isFinite))throw Error('Ungültiger CAD-Kurvenanzeigepunkt.');points.push(point);}finally{p.delete();}}return points;}
  finally{sampler?.delete();curve.delete();}
}

/** Rigid reference frames preserve mm measures. A complete affine placement
 * belongs to the model; camera/workplane frames must be orthonormal. */
export function validateCadPrecisionFrame(frame=cadIdentity()){
  const matrix=validateAffineMatrix(frame),cols=[0,1,2].map(k=>matrix.slice(k*4,k*4+3)),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  if(cols.some(c=>Math.abs(dot(c,c)-1)>1e-9)||Math.abs(dot(cols[0],cols[1]))>1e-9||Math.abs(dot(cols[0],cols[2]))>1e-9||Math.abs(dot(cols[1],cols[2]))>1e-9||dot(cross(cols[0],cols[1]),cols[2])<1-1e-9)throw Error('CAD-Präzisionsrahmen benötigt ein rechtshändiges orthonormales Millimetersystem.');return matrix;
}

export function transformCadGeometryRigidNative(oc,shape,frame){const matrix=validateCadPrecisionFrame(frame),tr=new oc.gp_Trsf();let builder;try{tr.SetValues(...[0,1,2].flatMap(row=>[matrix[row],matrix[4+row],matrix[8+row],matrix[12+row]]));builder=new oc.BRepBuilderAPI_Transform(shape,tr,true,false);const result=builder.Shape();if(result.IsNull()){result.delete();throw Error('Native CAD-Geometrie konnte nicht platziert werden.');}return result;}finally{builder?.delete();tr.delete();}}
export function transformCadGeometryAffineNative(oc,shape,matrix){
  validateAffineMatrix(matrix);const maximum=Math.max(...[0,1,2,4,5,6,8,9,10].map(k=>Math.abs(matrix[k]))),cols=[0,1,2].map(k=>matrix.slice(k*4,k*4+3).map(v=>v/maximum)),lengths=cols.map(c=>Math.hypot(...c)),unit=cols.map((c,k)=>c.map(v=>v/lengths[k])),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),similarity=Math.max(...lengths)-Math.min(...lengths)<=1e-10*Math.max(...lengths)&&[dot(unit[0],unit[1]),dot(unit[0],unit[2]),dot(unit[1],unit[2])].every(v=>Math.abs(v)<=1e-10);
  if(similarity){const tr=new oc.gp_Trsf();let builder;try{tr.SetValues(...[0,1,2].flatMap(row=>[matrix[row],matrix[4+row],matrix[8+row],matrix[12+row]]));builder=new oc.BRepBuilderAPI_Transform(shape,tr,true,false);return builder.Shape();}finally{builder?.delete();tr.delete();}}
  if(typeof oc.FormnaroCadBridge?.Transform!=='function')throw Error('Native affine Kantentransformation benötigt den gemeinsamen erweiterten CAD-Kern.');const tr=new oc.gp_GTrsf();try{for(let row=0;row<3;row++)for(let col=0;col<4;col++)tr.SetValue(row+1,col+1,matrix[col*4+row]);tr.SetForm();const result=oc.FormnaroCadBridge.Transform(shape,tr);if(result.IsNull()){result.delete();throw Error('Native CAD-Kantentransformation fehlgeschlagen.');}return result;}finally{tr.delete();}
}
function edgeRevision(node,revision){if(revision!==undefined){if(typeof revision!=='string'||!revision)throw Error('CAD-Kantenabfrage benötigt eine gültige Revision.');return revision;}const copy=structuredClone(node);function removeContainer(n){delete n.layerId;delete n.folderId;for(const child of n.children||[])removeContainer(child);}removeContainer(copy);return cadProjectRevision(createCadProject({nodes:[copy]}));}

function nativeOrigin(node,record,bounds){
  const origin={rootId:node.id,path:[]};
  if(node.source==='native'&&node.recipe.type==='cylinder'&&['circle','ellipse'].includes(record.geometry.kind)&&record.geometry.closed){const z=record.geometry.center[2];if(Math.abs(z-bounds.max[2])<1e-6)origin.featureId='cylinder-rim-top';else if(Math.abs(z-bounds.min[2])<1e-6)origin.featureId='cylinder-rim-bottom';}
  return origin;
}
function sourceDomains(oc,root){
  const candidates=[];
  function visit(node,path,matrix){
    if(node.suppressed)return;
    if(node.children){for(const child of node.children)visit(child,[...path,child.id],multiplyCadMatrices(matrix,child.transform));return;}
    const shape=readCadBrep(oc,node.brep.data);let edges=[];
    try{const bounds=cadBounds(oc,shape);edges=uniqueCadEdgesNative(oc,shape);for(const edge of edges){const description=listCadEdgesNative(oc,edge,{origin:{rootId:root.id,path},includeDomain:false})[0],origin=nativeOrigin(node,description,bounds);origin.rootId=root.id;origin.path=path;let placed=transformCadGeometryAffineNative(oc,edge,matrix);try{candidates.push({edge:placed,bounds:cadBounds(oc,placed),origin});placed=null;}finally{placed?.delete();}if(candidates.length>60000)throw Error('CAD-Kantenherkunft überschreitet die native Quellenkantengrenze.');}}
    finally{edges.forEach(edge=>edge.delete());shape.delete();}
  }
  try{if(root.children)for(const child of root.children)visit(child,[child.id],child.transform);return candidates;}
  catch(error){candidates.forEach(candidate=>candidate.edge.delete());throw error;}
}
function sourceCorrespondence(oc,edge,candidates){
  if(!candidates.length)return [];
  const bounds=cadBounds(oc,edge),matches=candidates.filter(candidate=>['min','max'].every(key=>bounds[key].every((v,k)=>Math.abs(v-candidate.bounds[key][k])<=1e-6))&&cadEdgesCorrespondNative(oc,edge,candidate.edge));return matches.map(candidate=>structuredClone(candidate.origin));
}

export function cadEdgeDisplayNative(oc,node,{resolveOrigin,revision:queryRevision,...options}={}){
  if(node?.kind!=='cad')fail('REFERENCE_MESH_NOT_CAD','Netzreferenzen besitzen keine auswählbaren CAD-Kanten.');quality(options);
  const revision=edgeRevision(node,queryRevision),shape=readCadBrep(oc,node.brep.data),records=[];let edges=[],sources=[],pointCount=0;
  try{edges=uniqueCadEdgesNative(oc,shape);const bounds=cadBounds(oc,shape);sources=sourceDomains(oc,node);for(let i=0;i<edges.length;i++){
    const edge=edges[i],description=listCadEdgesNative(oc,edge,{origin:{rootId:node.id,path:[]}})[0];if(!description)throw Error('CAD-Kantenbeschreibung fehlt.');
    const points=cadCurveDisplayPointsNative(oc,edge,options).map(point=>cadPoint(node.transform,point));pointCount+=points.length;if(pointCount>(options.maxPoints??200000))throw Error('CAD-Kantenanzeige überschreitet die gesamte Punktgrenze.');
    const reference=description.reference,correspondence=sourceCorrespondence(oc,edge,sources),supplied=resolveOrigin?.({node,edge,reference:structuredClone(reference),sourceCandidates:structuredClone(correspondence)});reference.origin=supplied??(correspondence.length===1?correspondence[0]:nativeOrigin(node,description,bounds));
    records.push({edgeToken:`${revision}:${i}`,curve:cadNativeCurveDto(oc,edge),reference,points,sourceMapping:correspondence.length===1?'unique-native-domain':correspondence.length?'ambiguous-source-domain':'result-only'});
  }return {kind:'cad-edge-display',revision,objectId:node.id,placement:[...node.transform],linearDeflection:options.linearDeflection??.02,angularDeflection:options.angularDeflection??.15,edges:records};}
  finally{sources.forEach(candidate=>candidate.edge.delete());edges.forEach(edge=>edge.delete());shape.delete();}
}

/** Whole-edge frame selection uses native curve bounds, including extrema
 * between renderer points. It never tests only endpoints or raster segments. */
export function cadEdgesInRectangleNative(oc,node,{frame=cadIdentity(),rect,planes,tolerance=1e-7,revision:queryRevision}={}){
  if(node?.kind!=='cad')fail('REFERENCE_MESH_NOT_CAD','Netzreferenzen sind keine CAD-Kantenziele.');validateCadPrecisionFrame(frame);if(!Number.isFinite(tolerance)||tolerance<0||tolerance>1e-4||planes===undefined&&(!Array.isArray(rect)||rect.length!==4||!rect.every(Number.isFinite)||rect[0]>rect[2]||rect[1]>rect[3]))throw Error('Ungültiger CAD-Kantenauswahlrahmen.');
  let planeFrames;
  if(planes!==undefined){if(!Array.isArray(planes)||planes.length<4||planes.length>6||planes.some(p=>!Array.isArray(p)||p.length!==4||!p.every(Number.isFinite)||Math.hypot(...p.slice(0,3))===0))throw Error('Ungültiger CAD-Kantenfrustum.');planeFrames=planes.map(p=>{const length=Math.hypot(...p.slice(0,3)),n=p.slice(0,3).map(v=>v/length),d=p[3]/length,axis=Math.abs(n[0])<.8?[1,0,0]:[0,1,0],dot=axis.reduce((s,v,k)=>s+v*n[k],0),x=axis.map((v,k)=>v-dot*n[k]),norm=Math.hypot(...x);x.forEach((v,k)=>x[k]=v/norm);const y=[n[1]*x[2]-n[2]*x[1],n[2]*x[0]-n[0]*x[2],n[0]*x[1]-n[1]*x[0]];return inverseCadMatrix([...x,0,...y,0,...n,0,...n.map(v=>-d*v),1]);});}
  const selected=[],matrix=multiplyCadMatrices(inverseCadMatrix(frame),node.transform),revision=edgeRevision(node,queryRevision),shape=readCadBrep(oc,node.brep.data);let edges=[];
  try{edges=uniqueCadEdgesNative(oc,shape);for(let i=0;i<edges.length;i++){
    let inside=true;
    if(planeFrames){const world=transformCadGeometryAffineNative(oc,edges[i],node.transform);try{for(const inverse of planeFrames){const local=transformCadGeometryRigidNative(oc,world,inverse);try{if(cadBounds(oc,local).min[2]<-tolerance){inside=false;break;}}finally{local.delete();}}}finally{world.delete();}}
    else{const placed=transformCadGeometryAffineNative(oc,edges[i],matrix);try{const bounds=cadBounds(oc,placed);inside=bounds.min[0]>=rect[0]-tolerance&&bounds.min[1]>=rect[1]-tolerance&&bounds.max[0]<=rect[2]+tolerance&&bounds.max[1]<=rect[3]+tolerance;}finally{placed.delete();}}
    if(inside)selected.push(`${revision}:${i}`);
  }return {kind:'cad-entire-edge-selection',revision,objectId:node.id,edgeTokens:selected,...(planeFrames?{planes:structuredClone(planes)}:{frame:[...frame],rect:[...rect]})};}
  finally{edges.forEach(edge=>edge.delete());shape.delete();}
}
