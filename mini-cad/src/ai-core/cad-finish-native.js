// Independent native finishing. No mesh construction, display edge IDs or
// nearest-sampled-edge heuristic. Unique complete native curve domains also
// cover imported curves, original text/SVG, partial conics and NURBS.
import {Vector3} from 'three';
import {cadBounds,readCadBrep,writeCadBrep,transformCad,validateCadSolid} from './cad-native-kernel.js';
import {cadIdentity,cadPoint,multiplyCadMatrices} from './cad-affine.js';
import {validateCadEdgeDomain} from './cad-project.js';

const fail=(code,message)=>{const error=Error(message);error.code=code;throw error;};
const enumValue=value=>{const result=typeof value==='number'||typeof value==='string'?value:value?.value;if(typeof result!=='string'&&!Number.isInteger(result))fail('INVALID_CAD_ENUM','Nativer CAD-Topologietyp fehlt.');return result;};
const close=(a,b,tolerance)=>Math.hypot(...a.map((v,k)=>v-b[k]))<=tolerance;
function xyz(point){return [point.X(),point.Y(),point.Z()];}
function uniqueEdges(oc,shape){const explorer=new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_EDGE),edges=[],buckets=new Map();try{while(explorer.More()){const raw=explorer.Current();try{const hash=oc.ReplicadShapeHasher.HashCode(raw,2147483647),bucket=buckets.get(hash)||[];if(!bucket.some(edge=>edge.IsSame(raw))){const edge=oc.TopoDS.Edge(raw);if(oc.BRep_Tool.Degenerated(edge))edge.delete();else{bucket.push(edge);buckets.set(hash,bucket);edges.push(edge);}}}finally{raw.delete();}if(edges.length>60000)throw Error('CAD-Kantenauswahl überschreitet die Projektgrenze.');explorer.Next();}return edges;}catch(error){edges.forEach(edge=>edge.delete());throw error;}finally{explorer.delete();}}
function curvePoint(curve,parameter){const point=curve.Value(parameter);try{return xyz(point);}finally{point.delete();}}
function describeEdge(oc,edge){
  const curve=new oc.BRepAdaptor_Curve(edge);
  try{
    const from=curve.FirstParameter(),to=curve.LastParameter();if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from)fail('UNBOUNDED_CAD_EDGE','CAD-Kante besitzt kein endliches Kurvenintervall.');
    const samples=[0,.25,.5,.75,1].map(t=>curvePoint(curve,from+(to-from)*t)),type=enumValue(curve.GetType());
    let geometry={kind:'unsupported',closed:curve.IsClosed()};
    if(type===enumValue(oc.GeomAbs_CurveType.GeomAbs_Line))geometry={kind:'line',start:samples[0],end:samples[4]};
    else if(type===enumValue(oc.GeomAbs_CurveType.GeomAbs_Circle)){const circle=curve.Circle(),center=circle.Location(),axis=circle.Axis(),dir=axis.Direction();try{geometry={kind:'circle',center:xyz(center),radius:circle.Radius(),normal:xyz(dir),closed:curve.IsClosed()&&Math.abs(to-from-2*Math.PI)<1e-7};}finally{dir.delete();axis.delete();center.delete();circle.delete();}}
    else if(type===enumValue(oc.GeomAbs_CurveType.GeomAbs_Ellipse)){const ellipse=curve.Ellipse(),center=ellipse.Location();try{geometry={kind:'ellipse',center:xyz(center),closed:curve.IsClosed()&&Math.abs(to-from-2*Math.PI)<1e-7};}finally{center.delete();ellipse.delete();}geometry.metric=conicMetric(samples,geometry.center);}
    return {geometry,anchor:{point:samples[2],curveType:geometry.kind,samples}};
  }finally{curve.delete();}
}
function conicMetric(samples,center){const u=samples[0].map((v,k)=>v-center[k]),v=samples[1].map((x,k)=>x-center[k]);return [0,1,2].flatMap(i=>[0,1,2].map(j=>u[i]*u[j]+v[i]*v[j]));}
function expectedGeometry(anchor,tolerance){
  if(!anchor||!Array.isArray(anchor.samples)||anchor.samples.length!==5||anchor.samples.some(p=>!Array.isArray(p)||p.length!==3||p.some(v=>!Number.isFinite(v))))fail('CAD_EDGE_RESOLVER_REQUIRED','Die Kante benötigt einen vollständigen analytischen CAD-Anker oder Quellenauflöser.');
  const samples=anchor.samples;
  if(!Array.isArray(anchor.point)||!close(anchor.point,samples[2],tolerance))fail('CAD_EDGE_RESOLVER_REQUIRED','CAD-Ankerpunkt widerspricht seiner analytischen Kante.');
  if(anchor.curveType==='line'){if(samples.some((p,i)=>!close(p,samples[0].map((v,k)=>v+(samples[4][k]-v)*i/4),tolerance)))fail('CAD_EDGE_RESOLVER_REQUIRED','Geradenanker enthält widersprüchliche Kurvenpunkte.');return {kind:'line',start:samples[0],end:samples[4]};}
  if(!['circle','ellipse'].includes(anchor.curveType)||!close(samples[0],samples[4],tolerance))fail('CAD_EDGE_RESOLVER_REQUIRED','Nicht vollständige oder nicht analytische Kanten benötigen einen Quellenauflöser.');
  const center=samples[0].map((v,k)=>(v+samples[2][k])/2);
  if(!close(samples[1].map((v,k)=>(v+samples[3][k])/2),center,tolerance))fail('CAD_EDGE_RESOLVER_REQUIRED','Konischer Kantenanker ist nicht zentral symmetrisch.');
  if(anchor.curveType==='ellipse')return {kind:'ellipse',center,metric:conicMetric(samples,center),closed:true};
  const a=new Vector3(...samples[0]).sub(new Vector3(...center)),b=new Vector3(...samples[1]).sub(new Vector3(...center)),n=a.clone().cross(b);
  if(!a.length()||!n.length())fail('CAD_EDGE_RESOLVER_REQUIRED','Kreiskante ist nicht eindeutig bestimmt.');
  if(Math.abs(a.length()-b.length())>tolerance||Math.abs(a.dot(b))>tolerance*Math.max(a.length(),b.length()))fail('CAD_EDGE_RESOLVER_REQUIRED','Anker beschreibt keinen analytischen Kreis.');
  return {kind:'circle',center,radius:a.length(),normal:n.normalize().toArray(),closed:true};
}
function matches(a,b,tolerance){
  if(a.kind!==b.kind)return false;
  if(a.kind==='line')return close(a.start,b.start,tolerance)&&close(a.end,b.end,tolerance)||close(a.start,b.end,tolerance)&&close(a.end,b.start,tolerance);
  if(a.kind==='circle')return a.closed&&b.closed&&close(a.center,b.center,tolerance)&&Math.abs(a.radius-b.radius)<=tolerance&&Math.abs(Math.abs(new Vector3(...a.normal).dot(new Vector3(...b.normal)))-1)<=1e-8;
  if(a.kind==='ellipse')return a.closed&&b.closed&&close(a.center,b.center,tolerance)&&a.metric.every((v,k)=>Math.abs(v-b.metric[k])<=tolerance*Math.max(1,Math.sqrt(Math.max(...a.metric.map(Math.abs),...b.metric.map(Math.abs)))));
  return false;
}

function edgeLength(oc,edge){const props=new oc.GProp_GProps();try{oc.BRepGProp.LinearProperties(edge,props,false,false);const value=props.Mass();if(!Number.isFinite(value)||value<=0)fail('INVALID_CAD_EDGE','CAD-Kantenlänge ist nicht positiv und endlich.');return value;}finally{props.delete();}}
/** Read an owned, independently validated no-triangle native edge. Arbitrary
 * body/face BReps or degenerate/unbounded curves cannot act as edge anchors. */
export function readCadEdgeDomainNative(oc,domain){
  const checked=validateCadEdgeDomain(domain),raw=oc.BRepToolsWrapper.Read(checked.data);let edge,analyzer;
  try{if(raw.IsNull()||enumValue(raw.ShapeType())!==enumValue(oc.TopAbs_ShapeEnum.TopAbs_EDGE))fail('INVALID_CAD_EDGE_DOMAIN','Der geometrische Kantenanker enthält keine einzelne native CAD-Kante.');edge=oc.TopoDS.Edge(raw);analyzer=new oc.BRepCheck_Analyzer(edge);if(!analyzer.IsValid()||oc.BRep_Tool.Degenerated(edge))fail('INVALID_CAD_EDGE_DOMAIN','Der geometrische Kantenanker ist keine gültige native Kurvendomäne.');describeEdge(oc,edge);cadBounds(oc,edge);edgeLength(oc,edge);return edge;}
  catch(error){edge?.delete();throw error;}finally{analyzer?.delete();raw.delete();}
}
/** Compare complete native edge domains, including partial conics and NURBS.
 * A zero closest distance alone is insufficient: native Common must cover
 * both complete curve domains with equal CAD length. No point-score matching. */
export function cadEdgesCorrespondNative(oc,left,right,{tolerance=1e-6}={}){
  if(!Number.isFinite(tolerance)||tolerance<=0||tolerance>1e-4||enumValue(left.ShapeType())!==enumValue(oc.TopAbs_ShapeEnum.TopAbs_EDGE)||enumValue(right.ShapeType())!==enumValue(oc.TopAbs_ShapeEnum.TopAbs_EDGE))fail('INVALID_CAD_EDGE','Zwei native CAD-Kanten und gültige Toleranz erforderlich.');
  const a=cadBounds(oc,left),b=cadBounds(oc,right);if(!close(a.min,b.min,tolerance)||!close(a.max,b.max,tolerance))return false;
  const leftLength=edgeLength(oc,left),rightLength=edgeLength(oc,right),error=Math.min(Math.max(tolerance,Math.max(leftLength,rightLength)*1e-9),Math.min(leftLength,rightLength)*1e-6);if(Math.abs(leftLength-rightLength)>error)return false;
  const builder=new oc.BRepAlgoAPI_Common(left,right);let common;
  try{if(builder.HasErrors())fail('CAD_EDGE_MATCH_FAILED','Nativer CAD-Kantenvergleich fehlgeschlagen.');common=builder.Shape();if(common.IsNull())return false;let length;try{length=edgeLength(oc,common);}catch(error){if(error.code==='INVALID_CAD_EDGE')return false;throw error;}return Math.abs(length-leftLength)<=error&&Math.abs(length-rightLength)<=error;}
  finally{common?.delete();builder.delete();}
}

/** Exact BRep edge domains confer identity through native full-domain Common.
 * Five evaluations are diagnostic anchors and legacy analytic descriptors.
 * Coordinates belong to the supplied shape/root's local CAD coordinate frame. */
export function listCadEdgesNative(oc,shape,{origin,includeDomain=true}={}){
  if(!origin||typeof origin.rootId!=='string'||!Array.isArray(origin.path))throw TypeError('CAD-Kantenherkunft fehlt.');
  const edges=uniqueEdges(oc,shape);try{return edges.map(edge=>{const record=describeEdge(oc,edge),anchor=structuredClone(record.anchor);if(includeDomain)anchor.edgeDomain=validateCadEdgeDomain({format:'OpenCascade-BRep',data:writeCadBrep(oc,edge),triangulation:false});return {...record,reference:{kind:'edge',origin:structuredClone(origin),anchor}};});}finally{edges.forEach(edge=>edge.delete());}
}

function storedEdge(oc,reference,tolerance){
  const edge=readCadEdgeDomainNative(oc,reference.anchor.edgeDomain);
  try{const described=describeEdge(oc,edge);if(!close(reference.anchor.point,described.anchor.point,tolerance))fail('INVALID_CAD_EDGE_DOMAIN','Der Kantenankerpunkt widerspricht seiner nativen Kurvendomäne.');return {edge,release:()=>edge.delete()};}catch(error){edge.delete();throw error;}
}
function verifyCurrentSourceDomain(oc,reference,node,expected,tolerance){
  if(!reference.origin.path.length)return;
  let source=node,matrix=cadIdentity();for(const id of reference.origin.path){source=source.children?.find(child=>child.id===id);if(!source||source.suppressed)fail('CAD_SOURCE_FEATURE_LOST','Die belegte Kantenquelle ist nicht mehr aktiv vorhanden.');matrix=multiplyCadMatrices(matrix,source.transform);}
  if(source.kind!=='cad'||!source.brep)fail('CAD_SOURCE_FEATURE_LOST','Die belegte Kantenquelle ist kein nativer CAD-Körper.');
  const shape=readCadBrep(oc,source.brep.data);let placed,edges=[];
  try{placed=transformCad(oc,shape,matrix);edges=uniqueEdges(oc,placed);const matches=edges.filter(edge=>cadEdgesCorrespondNative(oc,edge,expected.edge,{tolerance}));if(matches.length!==1)fail(matches.length?'AMBIGUOUS_CAD_SOURCE_FEATURE':'CAD_SOURCE_FEATURE_LOST','Die vollständige native Quellenkurve ist verloren oder mehrdeutig.');}
  finally{edges.forEach(edge=>edge.delete());placed?.delete();shape.delete();}
}

function transformEdgeNative(oc,edge,matrix){
  const columns=[0,1,2].map(col=>matrix.slice(col*4,col*4+3)),lengths=columns.map(col=>Math.hypot(...col)),dot=(a,b)=>a.reduce((sum,v,k)=>sum+v*b[k],0),similarity=Math.max(...lengths)-Math.min(...lengths)<=1e-10*Math.max(...lengths)&&[[0,1],[0,2],[1,2]].every(([a,b])=>Math.abs(dot(columns[a],columns[b]))<=1e-10*lengths[a]*lengths[b]);let raw;
  if(similarity){const tr=new oc.gp_Trsf();let builder;try{tr.SetValues(...[0,1,2].flatMap(row=>[matrix[row],matrix[4+row],matrix[8+row],matrix[12+row]]));builder=new oc.BRepBuilderAPI_Transform(edge,tr,true,false);raw=builder.Shape();}finally{builder?.delete();tr.delete();}}
  else{if(typeof oc.FormnaroCadBridge?.Transform!=='function')fail('CAD_EDGE_RESOLVER_REQUIRED','Affine Quellenkante benötigt den erweiterten nativen CAD-Kern.');const tr=new oc.gp_GTrsf();try{for(let row=0;row<3;row++)for(let col=0;col<4;col++)tr.SetValue(row+1,col+1,matrix[col*4+row]);tr.SetForm();raw=oc.FormnaroCadBridge.Transform(edge,tr);}finally{tr.delete();}}
  try{if(raw.IsNull()||enumValue(raw.ShapeType())!==enumValue(oc.TopAbs_ShapeEnum.TopAbs_EDGE))fail('INVALID_CAD_EDGE_DOMAIN','Native Quellenkante konnte nicht platziert werden.');return oc.TopoDS.Edge(raw);}finally{raw.delete();}
}
function cylinderFeature(oc,reference,node,tolerance){
  if(!['cylinder-rim-top','cylinder-rim-bottom'].includes(reference.origin.featureId))return null;
  let source=node,matrix=cadIdentity();for(const id of reference.origin.path){source=source.children?.find(child=>child.id===id);if(!source||source.suppressed)fail('CAD_SOURCE_FEATURE_LOST','Die CAD-Quellenkante ist nicht mehr aktiv vorhanden.');matrix=multiplyCadMatrices(matrix,source.transform);}
  if(source.source!=='native'||source.recipe?.type!=='cylinder')fail('CAD_SOURCE_FEATURE_LOST','Die Herkunft ist keine native Zylinderquelle mehr.');
  const shape=readCadBrep(oc,source.brep.data);let edges=[];
  try{
    const b=cadBounds(oc,shape),height=reference.origin.featureId==='cylinder-rim-top'?b.max[2]:b.min[2];edges=uniqueEdges(oc,shape);const local=edges.map(edge=>({...describeEdge(oc,edge),edge})).filter(record=>record.geometry.kind==='circle'&&record.geometry.closed&&Math.abs(record.geometry.center[2]-height)<=tolerance);
    if(local.length!==1)fail('AMBIGUOUS_CAD_SOURCE_FEATURE','Die native Zylinder-Quellenkante ist nicht eindeutig.');
    const edge=transformEdgeNative(oc,local[0].edge,matrix);return {edge,release:()=>edge.delete()};
  }finally{edges.forEach(edge=>edge.delete());shape.delete();}
}
function historyEntities(oc,builder,method,edge){
  const list=builder[method](edge),copy=new oc.NCollection_List_TopoDS_Shape(),records=[];
  try{copy.Assign(list);while(!copy.IsEmpty()){const entity=copy.First();try{const type=enumValue(entity.ShapeType()),record={shapeType:type};if(type===enumValue(oc.TopAbs_ShapeEnum.TopAbs_EDGE)){const typed=oc.TopoDS.Edge(entity);try{Object.assign(record,describeEdge(oc,typed));}finally{typed.delete();}}records.push(record);}finally{entity.delete();}copy.RemoveFirst();}return records;}
  finally{copy.delete();list.delete();}
}

/** Compatible with createCadService({finish}). The input shape is borrowed;
 * the returned validated body is owned by the caller. resolveSourceFeature
 * returns a native analytic geometry descriptor, never an OCCT edge index.
 * onHistory receives transient Modified/Generated DTOs, kept out of projects. */
export function createCadFinishNative({oc,tolerance=1e-6,resolveSourceFeature,onHistory}={}){
  if(!oc||!Number.isFinite(tolerance)||tolerance<=0||tolerance>1e-4||resolveSourceFeature!==undefined&&typeof resolveSourceFeature!=='function'||onHistory!==undefined&&typeof onHistory!=='function')throw TypeError('Ungültiger nativer CAD-Kantenprüfer.');
  return function finishNative(input,definition,node){
    if(!node||!['group','finish','partition','extraction'].includes(node.source)||!Array.isArray(definition?.steps)||!definition.steps.length||definition.steps.length>20)fail('INVALID_CAD_FINISH','Editierbare CAD-Quellen und Kantenoperationen erforderlich.');
    let current=readCadBrep(oc,writeCadBrep(oc,input));const operationHistory=[];
    try{
      for(const step of definition.steps){
        if(!['round','chamfer'].includes(step.kind)||!Number.isFinite(step.amount)||step.amount<=0||step.amount>1000||!Array.isArray(step.edges)||!step.edges.length||step.edges.length>128)fail('INVALID_CAD_FINISH','Ungültige native Kantenoperation.');
        const edges=uniqueEdges(oc,current),records=[],chosen=[];let builder,next;
        try{
          for(const edge of edges)records.push({...describeEdge(oc,edge),edge});
          for(const reference of step.edges){
            if(reference?.kind!=='edge'||reference.origin?.rootId!==node.id||!Array.isArray(reference.origin.path))fail('INVALID_CAD_EDGE_ORIGIN','Kantenherkunft widerspricht dem CAD-Ergebniskörper.');
            let expected,stored,candidates;
            try{
              // Even when provenance intentionally recomputes a changed rim,
              // every stored native domain must remain real valid CAD data.
              if(reference.anchor?.edgeDomain)stored=storedEdge(oc,reference,tolerance);
              if(reference.origin.featureId!==undefined){if(resolveSourceFeature)expected=resolveSourceFeature({reference:structuredClone(reference),node,step,inputShape:current,operationHistory:structuredClone(operationHistory)});if(!expected)expected=cylinderFeature(oc,reference,node,tolerance);if(!expected)fail('CAD_EDGE_RESOLVER_REQUIRED','Die gespeicherte Quellenkante braucht einen eindeutigen Herkunftsauflöser.');}
              else expected=stored??expectedGeometry(reference.anchor,tolerance);
              if(expected.edge&&!reference.origin.featureId)verifyCurrentSourceDomain(oc,reference,node,expected,tolerance);candidates=records.filter(record=>expected.edge?cadEdgesCorrespondNative(oc,record.edge,expected.edge,{tolerance}):matches(record.geometry,expected,tolerance));
            }finally{expected?.release?.();if(stored&&stored!==expected)stored.release();}
            if(candidates.length!==1)fail(candidates.length?'AMBIGUOUS_CAD_EDGE':'CAD_EDGE_LOST','CAD-Kante ist nicht eindeutig vorhanden; Operation entfernen oder Kante neu auswählen.');
            if(chosen.some(record=>record.edge.IsSame(candidates[0].edge)))fail('AMBIGUOUS_CAD_EDGE','Eine CAD-Kante wurde mehrfach angegeben.');chosen.push({...candidates[0],reference});
          }
          builder=step.kind==='round'?new oc.BRepFilletAPI_MakeFillet(current,oc.ChFi3d_FilletShape.ChFi3d_Rational):new oc.BRepFilletAPI_MakeChamfer(current);
          for(const record of chosen)builder.Add(step.amount,record.edge);
          builder.Build();if(!builder.IsDone())fail('CAD_FINISH_FAILED',`${step.kind==='round'?'Abrundung':'Fase'} mit ${step.amount} mm konnte an diesen Kanten nicht aufgebaut werden. Ein kleineres Maß oder einzelne Formkanten wählen. Bei STL-Facetten sind nicht alle Kanten für diese Operation geeignet.`);
          next=builder.Shape();validateCadSolid(oc,next);
          const history={stepId:step.id,method:'native-operation-history',edges:chosen.map(record=>({reference:structuredClone(record.reference),deleted:builder.IsDeleted(record.edge),modified:historyEntities(oc,builder,'Modified',record.edge),generated:historyEntities(oc,builder,'Generated',record.edge)}))};
          operationHistory.push(history);onHistory?.(structuredClone(history));current.delete();current=next;next=null;
        }catch(error){if(builder&&!error?.code&&!(error instanceof WebAssembly.RuntimeError))fail('CAD_FINISH_FAILED',`${step.kind==='round'?'Abrundung':'Fase'} ergibt an diesen Kanten keinen gültigen CAD-Körper. Ein kleineres Maß oder einzelne Formkanten wählen. Bei STL-Facetten sind nicht alle Kanten für diese Operation geeignet.`);throw error;}
        finally{next?.delete();builder?.delete();edges.forEach(edge=>edge.delete());}
      }
      return current;
    }catch(error){current.delete();throw error;}
  };
}
