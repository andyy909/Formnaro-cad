import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createCadService} from '../src/cad-service.js';
import {createCadProject} from '../src/cad-project.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {cadIdentity} from '../src/cad-affine.js';
import {readCadBrep} from '../src/cad-native-kernel.js';
import {cadWorkplaneFromHit,createCadToolsNative} from '../src/cad-tools-native.js';
import {projectCadFaceAnchorNative,rebindCadWorkplaneNative} from '../src/cad-topology-native.js';

const moduleUrl=process.env.FORMNARO_CAD_MODULE?pathToFileURL(process.env.FORMNARO_CAD_MODULE):new URL('../cad-kernel-build/runtime/formnaro_cad.js',import.meta.url),loader=(await import(moduleUrl.href)).default,oc=await loader({print:()=>{},printErr:()=>{}});
const close=(a,b,error=1e-6)=>assert.ok(Math.abs(a-b)<=error,`${a} versus ${b}`),closeVector=(a,b,error=1e-6)=>a.forEach((v,k)=>close(v,b[k],error));
function bind(node,point,normal,featureId){const plane=cadWorkplaneFromHit({objectId:node.id,point,normal},{transform:node.transform});if(featureId)plane.reference.topology.origin.featureId=featureId;return plane;}

test('Exact native face projection distinguishes a unique curved surface from lost or ambiguous geometry',()=>{
  const service=createCadService({oc}),node=service.nativeNode({type:'cylinder',size:[20,20,20]},{id:'cad'}),shape=service.worldShape(node);let copy,compound,builder;
  try{const point=[6,8,0],normal=[.6,.8,0];assert.equal(projectCadFaceAnchorNative(oc,shape,{point,normal}).length,1);assert.equal(projectCadFaceAnchorNative(oc,shape,{point:[20,20,0],normal}).length,0);assert.equal(projectCadFaceAnchorNative(oc,shape,{point,normal:normal.map(v=>-v)}).length,0);
    copy=readCadBrep(oc,node.brep.data);compound=new oc.TopoDS_Compound();builder=new oc.TopoDS_Builder();builder.MakeCompound(compound);builder.Add(compound,shape);builder.Add(compound,copy);assert.equal(projectCadFaceAnchorNative(oc,compound,{point,normal}).length,2);
  }finally{builder?.delete();compound?.delete();copy?.delete();shape.delete();service.dispose();}
});

test('Native cylinder face provenance rebinds height/diameter edits, preserving plane tangent and local anchors',async()=>{
  const service=createCadService({oc});try{
    const node=service.nativeNode({type:'cylinder',size:[20,20,20]},{id:'cad'}),initial=createCadProject({nodes:[node],workplane:bind(node,[2,3,10],[0,0,1],'cylinder-face-top')}),draft=structuredClone(initial);draft.nodes[0].recipe.size=[24,24,28];
    const rebuilt=await service.rebuild(draft),rebound=rebindCadWorkplaneNative(oc,rebuilt,{baseline:initial});assert.ok(rebound.workplane.reference);closeVector(rebound.workplane.origin,[2,3,14]);closeVector(rebound.workplane.reference.topology.anchor.point,[2,3,14]);closeVector(rebound.workplane.orientation,initial.workplane.orientation);
    const side=createCadProject({nodes:[node],workplane:bind(node,[6,8,5],[.6,.8,0],'cylinder-face-side')}),sideDraft=structuredClone(side);sideDraft.nodes[0].recipe.size=[24,24,28];const sideRebuilt=await service.rebuild(sideDraft),sideRebound=rebindCadWorkplaneNative(oc,sideRebuilt,{baseline:side});assert.ok(sideRebound.workplane.reference);closeVector(sideRebound.workplane.origin,[7.2,9.6,7]);
  }finally{service.dispose();}
});

test('Native box face follows a 4 to 12 mm source change, including nested source path and undo',async()=>{
 const service=createCadService({oc});try{
  const body=service.nativeNode({type:'box',size:[40,20,4]},{id:'body'}),hole=service.nativeNode({type:'cylinder',size:[2,2,20]},{id:'hole',solid:false});
  const group={id:'group-box',kind:'cad',name:'Platte',source:'group',solid:true,transform:cadIdentity(),operation:'union',children:[body,hole],brep:structuredClone(body.brep),stats:structuredClone(body.stats)};
  const initial=await service.rebuild(createCadProject({nodes:[group]}));initial.workplane=bind(initial.nodes[0],[5,3,2],[0,0,1],'box-face-top');initial.workplane.reference.topology.origin.path=['body'];
  const transactions=createCadTransactions({initial,build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions});
  transactions.apply(await tools.previewEditSource({groupId:'group-box',path:['body'],patch:{recipe:{type:'box',size:[40,20,12]}},revision:transactions.revision()}));
  assert.ok(transactions.snapshot().workplane.reference);closeVector(transactions.snapshot().workplane.origin,[5,3,6]);
  transactions.undo();closeVector(transactions.snapshot().workplane.origin,[5,3,2]);transactions.redo();closeVector(transactions.snapshot().workplane.origin,[5,3,6]);
  transactions.apply(await tools.previewEditSource({groupId:'group-box',path:['body'],patch:{recipe:{type:'cylinder',size:[40,20,12]}},revision:transactions.revision()}));
  assert.equal(transactions.snapshot().workplane.reference,null);
 }finally{service.dispose();}
});

test('Missing/ambiguous CAD faces detach references and preserve the previous spatial plane pose',async()=>{
  const service=createCadService({oc});try{
    const node=service.nativeNode({type:'cylinder',size:[20,20,20]},{id:'cad'}),initial=createCadProject({nodes:[node],workplane:bind(node,[2,3,10],[0,0,1])}),draft=structuredClone(initial);draft.nodes[0].recipe.size=[20,20,28];const fresh=await service.rebuild(draft),lost=rebindCadWorkplaneNative(oc,fresh,{baseline:initial});assert.equal(lost.workplane.reference,null);assert.deepEqual(lost.workplane.origin,initial.workplane.origin);assert.deepEqual(lost.workplane.orientation,initial.workplane.orientation);
    const gone=structuredClone(initial);gone.nodes=[];const removed=rebindCadWorkplaneNative(oc,gone,{baseline:initial});assert.equal(removed.workplane.reference,null);assert.deepEqual(removed.workplane.origin,initial.workplane.origin);
    const unknown=structuredClone(initial);unknown.workplane.reference.topology.origin.featureId='unresolved-feature';const unmapped=rebindCadWorkplaneNative(oc,unknown,{baseline:initial});assert.equal(unmapped.workplane.reference,null);assert.deepEqual(unmapped.workplane.origin,initial.workplane.origin);
  }finally{service.dispose();}
});

test('A bound plane follows a root affine placement from its local CAD anchor',()=>{
  const service=createCadService({oc});try{const matrix=[-2,0,0,0,.5,1,0,0,0,.3,1,0,7,-3,2,1],node=service.nativeNode({type:'cylinder',size:[20,20,20]},{id:'cad',transform:matrix}),project=createCadProject({nodes:[node]}),normal=[-.3,.95,-.285],length=Math.hypot(...normal);project.workplane=bind(node,[-1,5,2],normal.map(v=>v/length));const moved=structuredClone(project);moved.nodes[0].transform[12]+=5;moved.nodes[0].transform[13]-=4;const rebound=rebindCadWorkplaneNative(oc,moved,{baseline:project});assert.ok(rebound.workplane.reference);closeVector(rebound.workplane.origin,[4,1,2]);closeVector(rebound.workplane.reference.topology.anchor.point,[6,8,0]);}
  finally{service.dispose();}
});

test('Real transaction source edits rebind a bored-cylinder plane and detach a lost source feature with Undo',async()=>{
  const service=createCadService({oc});try{
    const body=service.nativeNode({type:'cylinder',size:[20,20,20]},{id:'body'}),hole=service.nativeNode({type:'cylinder',size:[6,6,32]},{id:'hole',solid:false}),group={id:'group',kind:'cad',name:'Bore',source:'group',solid:true,transform:cadIdentity(),operation:'union',children:[body,hole],brep:structuredClone(body.brep),stats:structuredClone(body.stats)};
    const initial=await service.rebuild(createCadProject({nodes:[group]}));initial.workplane=bind(initial.nodes[0],[6,0,10],[0,0,1],'cylinder-face-top');initial.workplane.reference.topology.origin.path=['body'];
    const transactions=createCadTransactions({initial,build:(project,context)=>service.rebuild(project,{baseline:context.baseline})}),tools=createCadToolsNative({oc,service,transactions});
    const height=await tools.previewEditSource({groupId:'group',path:['body'],patch:{recipe:{type:'cylinder',size:[20,20,24]}},revision:transactions.revision()});closeVector(transactions.snapshot().workplane.origin,[6,0,10]);transactions.apply(height);assert.ok(transactions.snapshot().workplane.reference);closeVector(transactions.snapshot().workplane.origin,[6,0,12]);
    transactions.undo();closeVector(transactions.snapshot().workplane.origin,[6,0,10]);transactions.redo();closeVector(transactions.snapshot().workplane.origin,[6,0,12]);
    const lost=await tools.previewEditSource({groupId:'group',path:['body'],patch:{recipe:{type:'box',size:[20,20,24]}},revision:transactions.revision()});transactions.apply(lost);assert.equal(transactions.snapshot().workplane.reference,null);closeVector(transactions.snapshot().workplane.origin,[6,0,12]);transactions.undo();assert.ok(transactions.snapshot().workplane.reference);closeVector(transactions.snapshot().workplane.origin,[6,0,12]);
  }finally{service.dispose();}
});

test('Grouping and dissolving preserve a native face binding through a full affine group frame',async()=>{
  const service=createCadService({oc});try{
    const shift=cadIdentity();shift[12]=30;const one=service.nativeNode({type:'cylinder',size:[20,20,20]},{id:'one'}),two=service.nativeNode({type:'cylinder',size:[10,10,10]},{id:'two',transform:shift}),initial=await service.rebuild(createCadProject({nodes:[one,two]}));initial.workplane=bind(one,[6,8,0],[.6,.8,0],'cylinder-face-side');
    const transactions=createCadTransactions({initial,build:(project,context)=>service.rebuild(project,{baseline:context.baseline})}),tools=createCadToolsNative({oc,service,transactions}),frame=[1,.2,0,0,.3,1,0,0,0,.1,1,0,3,4,5,1];
    transactions.apply(await tools.previewGroup({ids:['one','two'],id:'group',frame,revision:transactions.revision()}));assert.equal(transactions.snapshot().workplane.reference.objectId,'group');assert.deepEqual(transactions.snapshot().workplane.reference.topology.origin.path,['one']);closeVector(transactions.snapshot().workplane.origin,[6,8,0]);
    transactions.apply(await tools.previewDissolve({id:'group',revision:transactions.revision()}));assert.equal(transactions.snapshot().workplane.reference.objectId,'one');assert.deepEqual(transactions.snapshot().workplane.reference.topology.origin.path,[]);closeVector(transactions.snapshot().workplane.origin,[6,8,0]);closeVector(transactions.snapshot().workplane.reference.topology.anchor.point,[6,8,0]);
  }finally{service.dispose();}
});
