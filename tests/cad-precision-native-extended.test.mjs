// Real native query gate: never silently skipped when the built kernel is absent.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {Matrix4} from 'three';
import {createCadService} from '../src/cad-service.js';
import {createCadProject,serializeCadProject} from '../src/cad-project.js';
import {cadIdentity} from '../src/cad-affine.js';
import {readCadBrep,cadVolume,brepHasNoTriangulation,validateCadSolid,writeCadBrep} from '../src/cad-native-kernel.js';
import {buildCadContours} from '../src/cad-recipes.js';
import {createCadPrecisionNative,boundedCadBezierPolyline} from '../src/cad-precision-native.js';
import {createCadFinishNative} from '../src/cad-finish-native.js';
import {createCadTransactions} from '../src/cad-transactions.js';

const moduleUrl=process.env.FORMNARO_CAD_MODULE?pathToFileURL(process.env.FORMNARO_CAD_MODULE):new URL('../cad-kernel-build/runtime/formnaro_cad.js',import.meta.url),loader=(await import(moduleUrl.href)).default,oc=await loader({print:()=>{},printErr:()=>{}});
const close=(a,b,error=1e-5)=>assert.ok(Math.abs(a-b)<=error,`${a} versus ${b}`),closeVector=(a,b,error=1e-5)=>a.forEach((v,k)=>close(v,b[k],error));
async function bored(service){const body=service.nativeNode({type:'cylinder',size:[20,20,20]},{id:'body'}),hole=service.nativeNode({type:'cylinder',size:[6,6,32]},{id:'hole',solid:false});return (await service.rebuild(createCadProject({nodes:[{id:'group',kind:'cad',name:'Bore',source:'group',solid:true,transform:cadIdentity(),operation:'union',children:[body,hole],brep:structuredClone(body.brep),stats:structuredClone(body.stats)}]}))).nodes[0];}
function fromNativeShape(shape,id){const checked=validateCadSolid(oc,shape);return {id,kind:'cad',name:id,source:'step',solid:true,transform:cadIdentity(),brep:{format:'OpenCascade-BRep',data:writeCadBrep(oc,shape),triangulation:false},stats:{bounds:{min:checked.bounds.min,max:checked.bounds.max},volume:checked.volume,solids:checked.solids}};}

test('Native section returns exact annular cap, CAD contour curves and a valid closed clipped body',async()=>{
  const service=createCadService({oc});try{const node=await bored(service),queries=createCadPrecisionNative({oc,service}),before=serializeCadProject(createCadProject({nodes:[node]})),section=queries.section({node});close(section.area,Math.PI*91);close(section.clipVolume,Math.PI*91*10);assert.equal(section.edges.length,2);assert.ok(section.edges.every(edge=>edge.curve.kind==='circle'));assert.ok([section.contoursBrep,section.capBrep,section.clipBrep].every(brepHasNoTriangulation));const clipped=readCadBrep(oc,section.clipBrep);try{close(cadVolume(oc,clipped),section.clipVolume);}finally{clipped.delete();}
    const fine=queries.section({node,linearDeflection:.001,angularDeflection:.04,display:true,displayQuality:{deflection:.01,angleDegrees:5}});close(fine.area,section.area);close(fine.clipVolume,section.clipVolume);assert.ok(fine.edges[0].points.length>section.edges[0].points.length);assert.ok(fine.capDisplay.triangles.length>0);assert.ok(fine.clipDisplay.triangles.length>0);assert.equal(serializeCadProject(createCadProject({nodes:[node]})),before);
    const sideFrame=new Matrix4().makeRotationY(Math.PI/2).toArray(),side=queries.section({node,frame:sideFrame});close(side.area,280);close(side.clipVolume,section.clipVolume);assert.equal(side.edges.length,8);
  }finally{service.dispose();}
});

test('Native sections outside the CAD body return empty caps and retain only the requested half space',async()=>{
  const service=createCadService({oc});try{const node=await bored(service),queries=createCadPrecisionNative({oc,service}),frame=cadIdentity();frame[14]=30;const negative=queries.section({node,frame}),positive=queries.section({node,frame,side:'positive'});assert.equal(negative.area,0);assert.equal(negative.capBrep,null);assert.equal(negative.contoursBrep,null);close(negative.clipVolume,node.stats.volume);assert.equal(positive.clipVolume,0);assert.equal(positive.clipBrep,null);assert.throws(()=>queries.section({node,frame:[2,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}),/orthonormales/);
  }finally{service.dispose();}
});

test('Native HLR SVG preserves analytic bore circles and y-down original Bézier control curves',async()=>{
  const service=createCadService({oc});try{const node=await bored(service),queries=createCadPrecisionNative({oc,service}),projection=queries.svgProjection({nodes:[node]});assert.equal(projection.projection,'orthographic-native-hlr');assert.equal(projection.yAxis,'down');assert.equal(projection.approximation,'exact-svg-curves');assert.ok(projection.paths.filter(path=>path.d.includes(' A')).length>=2);closeVector(projection.viewBox,[-10,-10,20,20]);assert.ok(projection.svg.includes('data-source="native-cad-hlr"'));assert.ok(!projection.svg.includes(' L'));
    const contour=buildCadContours(oc,{height:4,contours:[{outer:[{kind:'bezier',points:[[0,0],[5,10],[10,0]]},{kind:'line',start:[10,0],end:[0,0]}]}]});try{const bezier=queries.svgProjection({nodes:[fromNativeShape(contour,'original-contour')]});assert.ok(bezier.paths.some(path=>/Q5,-10 10,0/.test(path.d)),bezier.svg);assert.equal(bezier.approximation,'exact-svg-curves');closeVector(bezier.viewBox,[0,-5,10,5]);}finally{contour.delete();}
  }finally{service.dispose();}
});

test('Actual affine CAD B-spline projection uses native Bézier spans with a certified curve-wide SVG error bound',()=>{
  const service=createCadService({oc});try{const node=service.nativeNode({type:'cylinder',size:[20,20,20]},{id:'cad',transform:[2,.2,0,0,.5,1,0,0,0,0,1,0,5,3,0,1]}),queries=createCadPrecisionNative({oc,service}),projection=queries.svgProjection({nodes:[node],tolerance:.002});assert.equal(projection.approximation,'bounded-native-curve-representation');assert.ok(projection.paths.some(path=>path.approximate));assert.ok(projection.paths.filter(path=>path.approximate).every(path=>path.proof==='positive-rational-bezier-control-hull'&&path.maxDeviation===.002));assert.ok(projection.svg.includes('data-max-deviation-mm="0.002"'));closeVector(projection.viewBox,[5-Math.hypot(20,5),-3-Math.hypot(2,10),2*Math.hypot(20,5),2*Math.hypot(2,10)],2e-6);
  }finally{service.dispose();}
});

test('Positive rational Bézier projection has an entire-curve hull error bound, including highly curved interiors',()=>{
  const poles=[[0,0],[0,20],[20,-20],[20,0]],weights=[1,.2,4,1],result=boundedCadBezierPolyline(poles,weights,{tolerance:.002});assert.equal(result.proof,'positive-rational-bezier-control-hull');assert.ok(result.points.length>20);
  function point(t){const terms=[(1-t)**3,3*t*(1-t)**2,3*t*t*(1-t),t**3].map((v,k)=>v*weights[k]),sum=terms.reduce((a,b)=>a+b,0);return [0,1].map(k=>terms.reduce((s,v,i)=>s+v*poles[i][k],0)/sum);}
  function segmentDistance(p,a,b){const d=b.map((v,k)=>v-a[k]),n=d[0]**2+d[1]**2,t=n?Math.max(0,Math.min(1,((p[0]-a[0])*d[0]+(p[1]-a[1])*d[1])/n)):0;return Math.hypot(...p.map((v,k)=>v-a[k]-t*d[k]));}
  for(let i=0;i<=2000;i++){const p=point(i/2000),distance=Math.min(...result.points.slice(1).map((b,k)=>segmentDistance(p,result.points[k],b)));assert.ok(distance<=.002+1e-10);}
  assert.throws(()=>boundedCadBezierPolyline(poles,[1,-1,1,1]),/Ungültige/);assert.throws(()=>boundedCadBezierPolyline(poles,weights,{tolerance:1e-7,maxPoints:2}),/Punktgrenze/);
});

test('Wall thickness is explicitly sampled directly on outer, bore and planar CAD surfaces',async()=>{
  const service=createCadService({oc});try{const node=await bored(service),queries=createCadPrecisionNative({oc,service}),result=queries.wallThickness({node,samples:[{point:[10,0,0],normal:[1,0,0]},{point:[3,0,0],normal:[-1,0,0]},{point:[6,0,10],normal:[0,0,1]},{point:[0,0,10],normal:[0,0,1]}]});assert.equal(result.sampling,true);assert.equal(result.label,'Stichprobenprüfung auf CAD-Flächen');assert.equal(result.complete,false);close(result.samples[0].thickness,7);close(result.samples[1].thickness,7);close(result.samples[2].thickness,20);assert.equal(result.samples[3].status,'missing-surface');close(result.minimumSampledThickness,7);assert.equal(result.samples[3].thickness,null);
    const limited=queries.wallThickness({node,maxDistance:2,samples:[{point:[10,0,0],normal:[1,0,0]}]});assert.equal(limited.samples[0].status,'no-exit');assert.equal(limited.minimumSampledThickness,null);
    const allMeasured=queries.wallThickness({node,samples:[{point:[10,0,0],normal:[1,0,0]}]});assert.equal(allMeasured.samplesComplete,true);assert.equal(allMeasured.complete,false);assert.equal(result.samplesComplete,false);
  }finally{service.dispose();}
});

test('CAD edge display keeps exact local curve anchors while whole-edge selection includes unsampled extrema',()=>{
  const service=createCadService({oc});try{const node=service.nativeNode({type:'cylinder',size:[20,20,20]},{id:'cad'}),queries=createCadPrecisionNative({oc,service}),coarse=queries.edges({node,linearDeflection:1,angularDeflection:1}),fine=queries.edges({node,linearDeflection:.001,angularDeflection:.04});assert.equal(coarse.edges.length,3);const circles=coarse.edges.filter(edge=>edge.curve.kind==='circle');assert.equal(circles.length,2);assert.ok(circles.every(edge=>edge.reference.origin.featureId.startsWith('cylinder-rim-')));assert.ok(coarse.edges.every(edge=>!Object.hasOwn(edge.reference,'faceIndex')));assert.deepEqual(coarse.edges.map(edge=>edge.curve),fine.edges.map(edge=>edge.curve));assert.ok(fine.edges[0].points.length>coarse.edges[0].points.length);
    const partial=queries.edgesInRectangle({node,rect:[-9.99,-10,10,10]});assert.ok(circles.every(edge=>!partial.edgeTokens.includes(edge.edgeToken)));const all=queries.edgesInRectangle({node,rect:[-10,-10,10,10]});assert.deepEqual(all.edgeTokens,coarse.edges.map(edge=>edge.edgeToken));
    const frustum=queries.edgesInRectangle({node,planes:[[1,0,0,10],[-1,0,0,10],[0,1,0,10],[0,-1,0,10],[0,0,1,10],[0,0,-1,10]]});assert.deepEqual(frustum.edgeTokens,all.edgeTokens);const narrowFrustum=queries.edgesInRectangle({node,planes:[[1,0,0,9.99],[-1,0,0,10],[0,1,0,10],[0,-1,0,10]]});assert.ok(circles.every(edge=>!narrowFrustum.edgeTokens.includes(edge.edgeToken)));
    const placement=[-2,0,0,0,.5,1,0,0,0,.3,1,0,7,-3,2,1],affine={...node,transform:placement},display=queries.edges({node:affine}),selected=queries.edgesInRectangle({node:affine,rect:[-100,-100,100,100]});assert.equal(selected.edgeTokens.length,display.edges.length);
    assert.throws(()=>queries.edges({node:{kind:'referenceMesh'}}),{code:'REFERENCE_MESH_NOT_CAD'});assert.throws(()=>queries.wallThickness({node:{kind:'referenceMesh'},samples:[]}),{code:'REFERENCE_MESH_NOT_CAD'});
  }finally{service.dispose();}
});

test('Native edge query finds unique source provenance and its selected rim survives a real height edit',async()=>{
  const service=createCadService({oc,finish:createCadFinishNative({oc})});try{const node=await bored(service),queries=createCadPrecisionNative({oc,service}),edges=queries.edges({node}).edges,outer=edges.find(edge=>edge.curve.kind==='circle'&&Math.abs(edge.curve.radii[0]-10)<1e-6&&Math.abs(edge.curve.center[2]-10)<1e-6);assert.ok(outer);assert.equal(outer.sourceMapping,'unique-native-domain');assert.deepEqual(outer.reference.origin,{rootId:'group',path:['body'],featureId:'cylinder-rim-top'});
    const initial=createCadProject({nodes:[node]}),transactions=createCadTransactions({initial,build:(project,context)=>service.rebuild(project,{baseline:context.baseline})}),draft=transactions.snapshot();draft.nodes[0].finish={steps:[{id:'rounded-top',kind:'round',amount:1,edges:[outer.reference]}]};transactions.apply(await transactions.preview({project:draft,revision:transactions.revision()}));const oldVolume=transactions.snapshot().nodes[0].stats.volume,edit=transactions.snapshot();edit.nodes[0].children[0].recipe.size=[20,20,24];transactions.apply(await transactions.preview({project:edit,revision:transactions.revision()}));close(transactions.snapshot().nodes[0].stats.volume-oldVolume,Math.PI*91*4,1e-4);
  }finally{service.dispose();}
});
