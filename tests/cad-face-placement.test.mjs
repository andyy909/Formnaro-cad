import test from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4,Quaternion,Vector3,Euler} from 'three';
import load from '../cad-kernel-build/runtime/formnaro_cad.js';
import {createCadService} from '../src/cad-service.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadToolsNative} from '../src/cad-tools-native.js';
import {createCadCommandRouter} from '../src/cad-command-router.js';
import {createCadProject,serializeCadProject} from '../src/cad-project.js';
import {cadIdentity,cadPoint,multiplyCadMatrices,inverseCadMatrix} from '../src/cad-affine.js';
const oc=await load({print:()=>{},printErr:()=>{}}),close=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} vs ${b}`);
// Matrix3 is the correct normal transform; keeping explicit column-major math
// also provides an independent check of the production normal implementation.
function ray(matrix,point,n){const inv=inverseCadMatrix(matrix),normal=new Vector3(...[0,1,2].map(k=>inv[k*4]*n[0]+inv[k*4+1]*n[1]+inv[k*4+2]*n[2])).normalize(),contact=new Vector3(...cadPoint(matrix,point));return {origin:contact.clone().addScaledVector(normal,100).toArray(),direction:normal.negate().toArray(),far:200};}
async function fixture({matrix=cadIdentity(),recipe={type:'box',size:[20,12,8]},workplane={origin:[0,0,0],orientation:[0,0,0,1],reference:null},neighbour=false}={}){
 const service=createCadService({oc});const body=service.nativeNode(recipe,{id:'body',transform:matrix,color:'#ef6948'}),nodes=[body];if(neighbour)nodes.push(service.nativeNode({type:'box',size:[4,4,4]},{id:'other',transform:new Matrix4().makeTranslation(200,0,0).toArray()}));
 const initial=await service.rebuild(createCadProject({nodes,workplane})),transactions=createCadTransactions({initial,build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions});return {service,transactions,tools};
}
function withoutPose(node){const n=structuredClone(node);delete n.transform;return n;}
test('Native support placement retains affine metric, BRep, parameters, unrelated objects and one exact Undo/Redo',async()=>{
 for(const stretch of [[1,1,1],[-1,1.6,.7]]){
  const base=new Matrix4().compose(new Vector3(7,-8,23),new Quaternion().setFromEuler(new Euler(.4,-.3,.8)),new Vector3(...stretch)),shear=cadIdentity();shear[4]=.25;const matrix=multiplyCadMatrices(base.toArray(),shear),c=await fixture({matrix,neighbour:true});
  try{const before=c.transactions.snapshot(),encoded=serializeCadProject(before),r=ray(matrix,[0,0,4],[0,0,1]),proposal=await c.tools.previewLayOnFace({id:'body',ray:r,revision:c.transactions.revision()});assert.equal(c.transactions.serialize(),encoded);const next=proposal.project.nodes[0];assert.deepEqual(withoutPose(next),withoutPose(before.nodes[0]));assert.deepEqual(proposal.project.nodes[1],before.nodes[1]);
   const frame=proposal.project.workplane.orientation,wp=new Matrix4().makeRotationFromQuaternion(new Quaternion(...frame)).setPosition(...proposal.project.workplane.origin).toArray(),b=c.service.inspect(next,multiplyCadMatrices(inverseCadMatrix(wp),next.transform)).worldBounds;close(b.min[2],0);assert.ok(b.max[2]>0);
   const gram=m=>[0,1,2].flatMap(i=>[0,1,2].map(j=>[0,1,2].reduce((s,k)=>s+m[i*4+k]*m[j*4+k],0)));gram(next.transform).forEach((v,k)=>close(v,gram(matrix)[k]));close(new Matrix4().fromArray(next.transform).determinant(),new Matrix4().fromArray(matrix).determinant());
   const originalContact=cadPoint(matrix,[0,0,4]),nextContact=cadPoint(next.transform,[0,0,4]);close(nextContact[0],originalContact[0]);close(nextContact[1],originalContact[1]);close(nextContact[2],0);
   c.transactions.apply({previewId:proposal.previewId,revision:proposal.revision});assert.equal(c.transactions.state().undo,1);const after=c.transactions.serialize();c.transactions.undo();assert.equal(c.transactions.serialize(),encoded);c.transactions.redo();assert.equal(c.transactions.serialize(),after);
  }finally{c.service.dispose();}
 }
});
test('Slanted workplane and attached reference keep the old world plane while only the root pose changes',async()=>{
 const q=new Quaternion().setFromEuler(new Euler(.25,.35,-.3)),matrix=new Matrix4().makeTranslation(5,7,20).toArray(),c=await fixture({matrix,workplane:{origin:[11,12,13],orientation:q.toArray(),reference:null}});
 try{const p=c.transactions.snapshot(),proposal=await c.tools.previewLayOnFace({id:'body',ray:ray(matrix,[10,0,0],[1,0,0]),revision:c.transactions.revision()}),frame=new Matrix4().makeRotationFromQuaternion(q).setPosition(...p.workplane.origin).toArray(),b=c.service.inspect(proposal.project.nodes[0],multiplyCadMatrices(inverseCadMatrix(frame),proposal.project.nodes[0].transform)).worldBounds;close(b.min[2],0);assert.deepEqual(proposal.project.workplane,p.workplane);
  const plane=c.tools.previewWorkplane({ray:ray(matrix,[0,0,4],[0,0,1]),revision:c.transactions.revision()});const wpProposal=await plane;c.transactions.apply({previewId:wpProposal.previewId,revision:wpProposal.revision});const old=c.transactions.snapshot().workplane,placed=await c.tools.previewLayOnFace({id:'body',ray:ray(matrix,[10,0,0],[1,0,0]),ground:true,revision:c.transactions.revision()});assert.deepEqual(placed.project.workplane,{...old,reference:null});
 }finally{c.service.dispose();}
});
test('Curved, hidden, locked and stale support requests preserve the confirmed project and history',async()=>{
 const c=await fixture({recipe:{type:'cylinder',size:[20,20,10]}});try{const before=c.transactions.serialize();await assert.rejects(async()=>c.tools.previewLayOnFace({id:'body',ray:{origin:[100,0,0],direction:[-1,0,0]},revision:c.transactions.revision()}),e=>e.code==='NON_PLANAR_CAD_SUPPORT');assert.equal(c.transactions.serialize(),before);assert.equal(c.transactions.state().undo,0);await assert.rejects(async()=>c.tools.previewLayOnFace({id:'body',ray:ray(cadIdentity(),[0,0,5],[0,0,1]),revision:'stale'}),e=>e.code==='STALE_REVISION');
  const p=c.transactions.snapshot();p.nodes[0].locked=true;const store=createCadTransactions({initial:p,build:v=>c.service.rebuild(v)}),locked=createCadToolsNative({oc,service:c.service,transactions:store});await assert.rejects(async()=>locked.previewLayOnFace({id:'body',ray:ray(cadIdentity(),[0,0,5],[0,0,1]),revision:store.revision()}),e=>e.code==='LOCKED_CAD_OBJECT');
 }finally{c.service.dispose();}
});
test('Native batch API shares the support operation and emits a reusable STEP solid',async()=>{
 const c=await fixture();try{const router=createCadCommandRouter({oc,service:c.service}),before=c.transactions.snapshot(),result=await router.run(before,{kind:'batch',commands:[{op:'layOnFace',target:'body',ray:ray(cadIdentity(),[0,0,4],[0,0,1])}]});assert.deepEqual(withoutPose(result.project.nodes[0]),withoutPose(before.nodes[0]));const exported=c.service.exportStep(result.project),imported=c.service.stepNode(exported,{id:'readback'});close(imported.stats.volume,result.project.nodes[0].stats.volume);close(imported.stats.bounds.min[2],0);
 }finally{c.service.dispose();}
});
test('A cavity floor cannot support the complete body; a grouped outer face keeps all original sources byte-for-byte',async()=>{
 const service=createCadService({oc});try{
  const outer=service.nativeNode({type:'box',size:[20,12,8]},{id:'outer'}),hole=service.nativeNode({type:'box',size:[8,8,10]},{id:'hole',solid:false,transform:new Matrix4().makeTranslation(0,0,4).toArray()}),group={id:'body',kind:'cad',source:'group',name:'Cavity',solid:true,operation:'union',children:[outer,hole],transform:cadIdentity(),brep:outer.brep,stats:outer.stats},initial=await service.rebuild(createCadProject({nodes:[group]})),transactions=createCadTransactions({initial,build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions}),before=transactions.serialize();
  await assert.rejects(async()=>tools.previewLayOnFace({id:'body',ray:{origin:[0,0,100],direction:[0,0,-1]},revision:transactions.revision()}),e=>e.code==='NON_SUPPORTING_CAD_FACE');assert.equal(transactions.serialize(),before);
  const proposal=await tools.previewLayOnFace({id:'body',ray:{origin:[100,0,0],direction:[-1,0,0]},revision:transactions.revision()});assert.deepEqual(withoutPose(proposal.project.nodes[0]),withoutPose(initial.nodes[0]));assert.deepEqual(proposal.project.nodes[0].children,initial.nodes[0].children);
  const step=service.exportStep(initial),imported=service.stepNode(step,{id:'imported'}),store=createCadTransactions({initial:createCadProject({nodes:[imported]}),build:p=>service.rebuild(p)}),native=createCadToolsNative({oc,service,transactions:store}),placed=await native.previewLayOnFace({id:'imported',ray:{origin:[100,0,0],direction:[-1,0,0]},revision:store.revision()});assert.deepEqual(withoutPose(placed.project.nodes[0]),withoutPose(store.snapshot().nodes[0]));
 }finally{service.dispose();}
});
test('Native nearest-face and permanent visibility gates reject obstruction or hidden targets',async()=>{
 const c=await fixture();try{const before=c.transactions.snapshot(),block=c.service.nativeNode({type:'box',size:[20,12,4]},{id:'block',transform:new Matrix4().makeTranslation(0,0,10).toArray()}),p=createCadProject({nodes:[...before.nodes,block]}),store=createCadTransactions({initial:p,build:v=>c.service.rebuild(v)}),tools=createCadToolsNative({oc,service:c.service,transactions:store});
  await assert.rejects(async()=>tools.previewLayOnFace({id:'body',ray:{origin:[0,0,100],direction:[0,0,-1]},revision:store.revision()}),e=>e.code==='NO_CAD_SUPPORT_HIT');assert.equal(store.state().undo,0);
  before.nodes[0].hidden=true;const hiddenStore=createCadTransactions({initial:before,build:v=>c.service.rebuild(v)}),hidden=createCadToolsNative({oc,service:c.service,transactions:hiddenStore});await assert.rejects(async()=>hidden.previewLayOnFace({id:'body',ray:{origin:[0,0,100],direction:[0,0,-1]},revision:hiddenStore.revision()}),e=>e.code==='NO_CAD_SUPPORT_HIT');assert.equal(hiddenStore.state().undo,0);
 }finally{c.service.dispose();}
});
