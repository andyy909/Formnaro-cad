import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import {createCadProject,serializeCadProject,parseCadProject} from '../src/cad-project.js';
import {createCadService} from '../src/cad-service.js';
import {createCadCommandRouter} from '../src/cad-command-router.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadFinishNative,readCadEdgeDomainNative,cadEdgesCorrespondNative} from '../src/cad-finish-native.js';
import {createCadPrecisionNative} from '../src/cad-precision-native.js';
import {cadContoursFromSvgSubpaths,cadContoursFromFont} from '../src/cad-original-contours.js';
import {buildCadContours} from '../src/cad-recipes.js';
import {cadBounds,cadVolume,writeCadBrep,validateCadSolid,brepHasNoTriangulation} from '../src/cad-native-kernel.js';
import {cadIdentity} from '../src/cad-affine.js';

const moduleUrl=process.env.FORMNARO_CAD_MODULE?pathToFileURL(process.env.FORMNARO_CAD_MODULE):new URL('../cad-kernel-build/runtime/formnaro_cad.js',import.meta.url),loader=(await import(moduleUrl.href)).default,oc=await loader({print:()=>{},printErr:()=>{}});
const close=(a,b,error=1e-4)=>assert.ok(Math.abs(a-b)<=error,`${a} vs ${b}`),bezier=[{kind:'bezier',points:[[0,0],[5,10],[10,0]]},{kind:'line',start:[10,0],end:[0,0]}],arc=[{kind:'ellipse',center:[0,0],rx:5,ry:5,startAngle:0,endAngle:Math.PI},{kind:'line',start:[-5,0],end:[5,0]}];
function nativeRecord(shape,id){const stats=validateCadSolid(oc,shape);return {id,kind:'cad',source:'step',solid:true,name:id,transform:cadIdentity(),brep:{format:'OpenCascade-BRep',data:writeCadBrep(oc,shape),triangulation:false},stats:{bounds:{min:stats.bounds.min,max:stats.bounds.max},volume:stats.volume,solids:stats.solids}};}
async function finishDefault(service,node,predicate){
  const router=createCadCommandRouter({oc,service}),queries=createCadPrecisionNative({oc,service}),initial=await service.rebuild(createCadProject({nodes:[node]})),record=queries.edges({node:initial.nodes[0]}).edges.find(predicate);assert.ok(record,'Expected genuine native curve');assert.ok(brepHasNoTriangulation(record.reference.anchor.edgeDomain.data));
  const transactions=createCadTransactions({initial,build:async(project,context)=>context.operation?(await router.run(project,context.operation,{baseline:context.baseline})).project:service.rebuild(project,{baseline:context.baseline})}),plan={kind:'finish',target:node.id,step:{id:'native-domain-round',kind:'round',amount:.02,edges:[record.reference]}},preview=await transactions.preview({project:transactions.snapshot(),revision:transactions.revision(),operation:plan});assert.equal(transactions.snapshot().nodes[0].source,node.source);transactions.apply(preview);const rounded=transactions.snapshot();assert.ok(rounded.nodes[0].stats.volume<node.stats.volume);const saved=serializeCadProject(rounded);assert.equal(saved.includes('edgeToken'),false);assert.equal(saved.includes('linearDeflection'),false);const reopened=await service.rebuild(parseCadProject(saved));close(reopened.nodes[0].stats.volume,rounded.nodes[0].stats.volume);transactions.undo();close(transactions.snapshot().nodes[0].stats.volume,node.stats.volume);transactions.redo();return {rounded,record,transactions};
}

test('Original certified SVG Bézier edges round through the default finisher without a feature callback and fail if their source curve changes',async()=>{
  const service=createCadService({oc,finish:createCadFinishNative({oc})});try{const classified=cadContoursFromSvgSubpaths(oc,[bezier]),node=service.nativeNode({type:'svg',size:[10,5,4],...classified},{id:'svg'}),result=await finishDefault(service,node,edge=>edge.curve.kind==='bezier'&&Math.abs(edge.curve.start[2]-2)<1e-6),draft=result.transactions.snapshot();draft.nodes[0].children[0].recipe.contours[0].outer.find(segment=>segment.kind==='bezier').points[1][1]=9;const old=serializeCadProject(result.transactions.snapshot());await assert.rejects(result.transactions.preview({project:draft,revision:result.transactions.revision()}),{code:'CAD_SOURCE_FEATURE_LOST'});assert.equal(serializeCadProject(result.transactions.snapshot()),old);
  }finally{service.dispose();}
});

test('Partial native circular edges retain the trimmed full domain and round with no specialized callback',async()=>{
  const service=createCadService({oc,finish:createCadFinishNative({oc})});try{const classified=cadContoursFromSvgSubpaths(oc,[arc]),node=service.nativeNode({type:'svg',size:[10,5,4],...classified},{id:'arc'});await finishDefault(service,node,edge=>edge.curve.kind==='circle'&&!edge.curve.closed&&Math.abs(edge.curve.start[2]-2)<1e-6);
  }finally{service.dispose();}
});

test('An actual STEP-imported affine NURBS body exposes exact edge domains and rounds with the default native finisher',async()=>{
  const service=createCadService({oc,finish:createCadFinishNative({oc})});let shape;try{const source=service.nativeNode({type:'cylinder',size:[20,20,20]},{id:'source',transform:[1.2,.1,0,0,.2,1,0,0,0,0,1,0,0,0,0,1]});shape=service.worldShape(source);const stored=nativeRecord(shape,'native-affine'),imported=service.stepNode(service.exportStep(createCadProject({nodes:[stored]})),{id:'imported'});assert.equal(imported.source,'step');await finishDefault(service,imported,edge=>edge.curve.kind==='bspline'&&Math.abs(edge.curve.start[2]-10)<1e-6);
  }finally{shape?.delete();service.dispose();}
});

test('An actual bundled-font original text curve receives a complete native edge anchor and rounds without a glyph-specific callback',async()=>{
  const service=createCadService({oc,finish:createCadFinishNative({oc})});let contour;try{const font=new FontLoader().parse(JSON.parse(await readFile(new URL('../src/font.json',import.meta.url),'utf8'))),classified=cadContoursFromFont(oc,font,'O',10);contour=buildCadContours(oc,{height:2,contours:classified.contours});const dimensions=cadBounds(oc,contour).size,node=service.nativeNode({type:'text',size:dimensions,text:'O',font:'helvetiker',...classified},{id:'glyph'});await finishDefault(service,node,edge=>['bezier','bspline'].includes(edge.curve.kind)&&Math.abs(edge.curve.start[2]-1)<1e-6);
  }finally{contour?.delete();service.dispose();}
});

test('Native edge-domain reader rejects a solid in place of an edge and complete correspondence rejects a tiny partial overlap',()=>{
  const service=createCadService({oc});const handles=[],keep=value=>(handles.push(value),value);try{const node=service.nativeNode({type:'box',size:[10,10,10]},{id:'body'});assert.throws(()=>readCadEdgeDomainNative(oc,node.brep),{code:'INVALID_CAD_EDGE_DOMAIN'});function line(from,to){return keep(keep(new oc.BRepBuilderAPI_MakeEdge(keep(new oc.gp_Pnt(from,0,0)),keep(new oc.gp_Pnt(to,0,0)))).Edge());}const left=line(0,1e-4),right=line(5e-7,1.005e-4);assert.equal(cadEdgesCorrespondNative(oc,left,right),false);assert.equal(cadEdgesCorrespondNative(oc,left,left),true);
  }finally{for(const handle of handles.reverse())handle.delete();service.dispose();}
});

test('Known source provenance cannot bypass native validation of a stored edge-domain payload',async()=>{
  const service=createCadService({oc,finish:createCadFinishNative({oc})});try{const source=service.nativeNode({type:'cylinder',size:[20,20,20]},{id:'cylinder'}),reference=createCadPrecisionNative({oc,service}).edges({node:source}).edges.find(edge=>edge.reference.origin.featureId==='cylinder-rim-top').reference;reference.anchor.edgeDomain=source.brep;await assert.rejects(createCadCommandRouter({oc,service}).run(createCadProject({nodes:[source]}),{kind:'finish',target:source.id,step:{id:'invalid-domain',kind:'round',amount:.2,edges:[reference]}}),{code:'INVALID_CAD_EDGE_DOMAIN'});
  }finally{service.dispose();}
});
