import test from 'node:test';
import assert from 'node:assert/strict';
import OCModule from 'replicad-opencascadejs';
import {pathToFileURL} from 'node:url';
import {createCadFinishNative,listCadEdgesNative,cadEdgesCorrespondNative} from '../src/cad-finish-native.js';
import {createCadService} from '../src/cad-service.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadProject,serializeCadProject,parseCadProject} from '../src/cad-project.js';
import {cadIdentity} from '../src/cad-affine.js';
import {cadBoolean,cadVolume,writeCadBrep,readCadBrep} from '../src/cad-native-kernel.js';
import {buildCadContours} from '../src/cad-recipes.js';

const kernelLoader=process.env.FORMNARO_CAD_MODULE?(await import(pathToFileURL(process.env.FORMNARO_CAD_MODULE).href)).default:OCModule;
const oc=await kernelLoader({print:()=>{},printErr:()=>{}}),close=(a,b,error=1e-5)=>assert.ok(Math.abs(a-b)<=error,`${a} versus ${b}`);
function cylinder(radius=10,height=20){const maker=new oc.BRepPrimAPI_MakeCylinder(radius,height);try{return maker.Shape();}finally{maker.delete();}}
const definition=reference=>({steps:[{id:'finish-top',kind:'round',amount:1,edges:[reference]}]});
function topOuter(shape,origin){return listCadEdgesNative(oc,shape,{origin}).find(record=>record.geometry.kind==='circle'&&record.geometry.closed&&Math.abs(record.geometry.radius-10)<1e-7&&Math.abs(record.geometry.center[2]-20)<1e-7);}

test('Native finishing uses analytic full-circle identity and actual Modified/Generated history',()=>{
  const shape=cylinder(),origin={rootId:'group',path:[]},record=topOuter(shape,origin),history=[],finish=createCadFinishNative({oc,onHistory:entry=>history.push(entry)});let result;
  try{assert.ok(record);result=finish(shape,definition(record.reference),{id:'group',source:'group'});assert.ok(cadVolume(oc,result)<cadVolume(oc,shape));assert.equal(history.length,1);assert.equal(history[0].method,'native-operation-history');assert.ok(history[0].edges[0].generated.length>0);assert.equal(typeof history[0].edges[0].deleted,'boolean');assert.equal(history[0].edges[0].reference.topologyId,undefined);assert.ok(history[0].edges[0].generated.every(item=>Number.isInteger(item.shapeType)||typeof item.shapeType==='string'));close(cadVolume(oc,shape),2000*Math.PI);}
  finally{result?.delete();shape.delete();}
});

test('Native chamfer changes CAD volume; a lost edge and duplicate edge requests fail explicitly',()=>{
  const shape=cylinder(),record=topOuter(shape,{rootId:'group',path:[]}),finish=createCadFinishNative({oc});let result;
  try{
    const chamfer=definition(record.reference);chamfer.steps[0].kind='chamfer';result=finish(shape,chamfer,{id:'group',source:'group'});close(cadVolume(oc,result),Math.PI*(2000-10+1/3),1e-4);
    const lost=structuredClone(record.reference);delete lost.anchor.edgeDomain;lost.anchor.samples=lost.anchor.samples.map(p=>p.map((v,k)=>v+(k===2?2:0)));lost.anchor.point=lost.anchor.samples[2];assert.throws(()=>finish(shape,definition(lost),{id:'group',source:'group'}),{code:'CAD_EDGE_LOST'});
    const duplicate=definition(record.reference);duplicate.steps[0].edges.push(structuredClone(record.reference));assert.throws(()=>finish(shape,duplicate,{id:'group',source:'group'}),{code:'AMBIGUOUS_CAD_EDGE'});
  }finally{result?.delete();shape.delete();}
});

test('Native straight edges can be rounded and contradictory stored conic anchors are rejected',()=>{
  const maker=new oc.BRepPrimAPI_MakeBox(10,10,10),shape=maker.Shape(),origin={rootId:'group',path:[]};let result;
  try{const line=listCadEdgesNative(oc,shape,{origin}).find(record=>record.geometry.kind==='line');assert.ok(line);result=createCadFinishNative({oc})(shape,definition(line.reference),{id:'group',source:'group'});assert.ok(cadVolume(oc,result)<1000);}
  finally{result?.delete();shape.delete();maker.delete();}
  const roundShape=cylinder();try{const circle=topOuter(roundShape,origin),contradiction=structuredClone(circle.reference);delete contradiction.anchor.edgeDomain;contradiction.anchor.samples[3][2]+=1;assert.throws(()=>createCadFinishNative({oc})(roundShape,definition(contradiction),{id:'group',source:'group'}),{code:'CAD_EDGE_RESOLVER_REQUIRED'});}finally{roundShape.delete();}
});

test('Coincident edges in separate native solids are ambiguous, never chosen by an explorer index',()=>{
  const one=cylinder(),two=readCadBrep(oc,writeCadBrep(oc,one)),compound=new oc.TopoDS_Compound(),builder=new oc.TopoDS_Builder();
  try{builder.MakeCompound(compound);builder.Add(compound,one);builder.Add(compound,two);const record=topOuter(compound,{rootId:'group',path:[]});assert.throws(()=>createCadFinishNative({oc})(compound,definition(record.reference),{id:'group',source:'group'}),{code:'AMBIGUOUS_CAD_EDGE'});}
  finally{builder.delete();compound.delete();two.delete();one.delete();}
});

test('Unknown source features require a resolver; callback descriptors still require a unique native match',()=>{
  const shape=cylinder(),record=topOuter(shape,{rootId:'group',path:[],featureId:'plugin-rim'});let calls=0,result;
  try{assert.throws(()=>createCadFinishNative({oc})(shape,definition(record.reference),{id:'group',source:'group'}),{code:'CAD_EDGE_RESOLVER_REQUIRED'});result=createCadFinishNative({oc,resolveSourceFeature:context=>{calls++;assert.equal(context.reference.origin.featureId,'plugin-rim');return record.geometry;}})(shape,definition(record.reference),{id:'group',source:'group'});assert.equal(calls,1);assert.ok(cadVolume(oc,result)>0);}
  finally{result?.delete();shape.delete();}
});

function bore(service){const body=service.nativeNode({type:'cylinder',size:[20,20,20]},{id:'body'}),hole=service.nativeNode({type:'cylinder',size:[6,6,32]},{id:'hole',solid:false});return createCadProject({nodes:[{id:'group',kind:'cad',name:'Bored cylinder',source:'group',solid:true,transform:cadIdentity(),operation:'union',children:[body,hole],brep:structuredClone(body.brep),stats:structuredClone(body.stats)}]});}
test('Bored-cylinder top rounding rebinds native source height through Preview/Apply/Undo/Save/Reload',async()=>{
  const history=[],service=createCadService({oc,finish:createCadFinishNative({oc,onHistory:entry=>history.push(entry)})});
  try{
    const initial=await service.rebuild(bore(service)),store=createCadTransactions({initial,build:project=>service.rebuild(project)}),draft=store.snapshot(),shape=service.worldShape(draft.nodes[0]);let reference;
    try{reference=listCadEdgesNative(oc,shape,{origin:{rootId:'group',path:['body'],featureId:'cylinder-rim-top'}}).find(record=>record.geometry.kind==='circle'&&Math.abs(record.geometry.radius-10)<1e-7&&Math.abs(record.geometry.center[2]-10)<1e-7).reference;}finally{shape.delete();}
    draft.nodes[0].finish=definition(reference);const preview=await store.preview({project:draft,revision:store.revision()});assert.equal(store.snapshot().nodes[0].finish,undefined);store.apply(preview);const rounded=store.snapshot(),roundedVolume=rounded.nodes[0].stats.volume;assert.ok(roundedVolume<Math.PI*91*20);assert.ok(history.some(entry=>entry.edges[0].generated.length>0));
    const changed=store.snapshot();changed.nodes[0].children[0].recipe.size=[20,20,24];const edited=await store.preview({project:changed,revision:store.revision()});assert.equal(store.snapshot().nodes[0].stats.volume,roundedVolume);store.apply(edited);const finished=store.snapshot();close(finished.nodes[0].stats.volume-roundedVolume,Math.PI*91*4,1e-4);assert.deepEqual(finished.nodes[0].finish.steps[0].edges[0].origin,{rootId:'group',path:['body'],featureId:'cylinder-rim-top'});
    store.undo();close(store.snapshot().nodes[0].stats.volume,roundedVolume);store.redo();const saved=serializeCadProject(store.snapshot());assert.equal(saved.includes('native-operation-history'),false);const reopened=await service.rebuild(parseCadProject(saved));close(reopened.nodes[0].stats.volume,finished.nodes[0].stats.volume);assert.equal(reopened.nodes[0].brep.triangulation,false);assert.deepEqual(reopened.nodes[0].children[0].recipe.size,[20,20,24]);
    const step=service.exportStep(reopened),stepNode=service.stepNode(step,{id:'step-roundtrip'});assert.equal(stepNode.source,'step');assert.equal(stepNode.brep.triangulation,false);close(stepNode.stats.volume,reopened.nodes[0].stats.volume,1e-3);assert.equal(stepNode.mesh,undefined);
    const broken=store.snapshot();broken.nodes[0].finish.steps[0].amount=100;await assert.rejects(store.preview({project:broken,revision:store.revision()}));assert.equal(serializeCadProject(store.snapshot()),saved);
  }finally{service.dispose();}
});

test('The actual Boolean-born bore edge is selectable geometrically with no triangle construction',()=>{
  const body=cylinder(),hole=cylinder(3,30);let bored,result;
  try{bored=cadBoolean(oc,'difference',body,hole);const record=listCadEdgesNative(oc,bored,{origin:{rootId:'group',path:[]}}).find(record=>record.geometry.kind==='circle'&&Math.abs(record.geometry.radius-3)<1e-7&&Math.abs(record.geometry.center[2]-20)<1e-7);assert.ok(record);result=createCadFinishNative({oc})(bored,definition(record.reference),{id:'group',source:'group'});assert.ok(Math.abs(cadVolume(oc,result)-cadVolume(oc,bored))>1);assert.ok(writeCadBrep(oc,result).includes('Triangulations 0'));}
  finally{result?.delete();bored?.delete();hole.delete();body.delete();}
});

test('Native continuous-domain correspondence supports original Bézier edges and rejects a different curve',()=>{
  const handles=[],keep=value=>(handles.push(value),value);
  function bezier(points){const poles=keep(new oc.NCollection_Array1_gp_Pnt(1,points.length));points.forEach((p,i)=>poles.SetValue(i+1,keep(new oc.gp_Pnt(...p))));const curve=keep(new oc.Geom_BezierCurve(poles));return keep(keep(new oc.BRepBuilderAPI_MakeEdge(curve)).Edge());}
  try{const original=bezier([[0,0,0],[5,10,0],[10,0,0]]),copy=keep(oc.BRepToolsWrapper.Read(oc.BRepToolsWrapper.Write(original))),different=bezier([[0,0,0],[5,9,0],[10,0,0]]);assert.equal(cadEdgesCorrespondNative(oc,original,copy),true);assert.equal(cadEdgesCorrespondNative(oc,original,different),false);}
  finally{for(const handle of handles.reverse())handle.delete();}
});

test('A genuine original Bézier source edge is resolved by native domain correspondence and rounded',()=>{
  const shape=buildCadContours(oc,{height:4,contours:[{outer:[{kind:'bezier',points:[[0,0],[5,10],[10,0]]},{kind:'line',start:[10,0],end:[0,0]}]}]}),explorer=new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_EDGE);let sourceEdge,result;
  try{
    while(explorer.More()){const raw=explorer.Current(),edge=oc.TopoDS.Edge(raw),curve=new oc.BRepAdaptor_Curve(edge);try{const actual=curve.GetType(),expected=oc.GeomAbs_CurveType.GeomAbs_BezierCurve;const a=typeof actual==='object'?actual.value:actual,b=typeof expected==='object'?expected.value:expected,value=curve.Value((curve.FirstParameter()+curve.LastParameter())/2);try{if(a===b&&Math.abs(value.Z()-2)<1e-7){sourceEdge=edge;break;}}finally{value.delete();}}finally{curve.delete();raw.delete();if(sourceEdge!==edge)edge.delete();}explorer.Next();}
    assert.ok(sourceEdge);const reference={kind:'edge',origin:{rootId:'group',path:[],featureId:'original-contour-0-bezier-top'},anchor:{point:[5,5,2],curveType:'unsupported'}},finish=definition(reference);finish.steps[0].amount=.05;
    result=createCadFinishNative({oc,resolveSourceFeature:()=>({edge:sourceEdge})})(shape,finish,{id:'group',source:'group'});assert.ok(cadVolume(oc,result)<cadVolume(oc,shape));assert.ok(writeCadBrep(oc,result).includes('Triangulations 0'));
  }finally{result?.delete();sourceEdge?.delete();explorer.delete();shape.delete();}
});
