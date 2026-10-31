import test from 'node:test';
import assert from 'node:assert/strict';
import {createCadProject,parseCadProject} from '../src/cad-project.js';
import {createCadController} from '../src/cad-controller.js';
import {createCadJoint,applyCadJointRequest,cadJointProblems,compileCadJointMotion} from '../src/cad-joints-data.js';
import {cadIdentity} from '../src/cad-affine.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function body(id,pos){const transform=cadIdentity();transform.splice(12,3,...pos);return {id,name:id,kind:'cad',source:'native',solid:true,transform,recipe:{type:'box',size:[10,8,4]},brep:{format:'OpenCascade-BRep',data:'unchanged-'+id,triangulation:false},stats:{bounds:{min:[-5,-4,-2],max:[5,4,2]},volume:320,solids:1}};}
function fixture({kind='prismatic',axis=[0,1,0],opposite=false}={}){
 const p=createCadProject({nodes:[body('bed',[0,0,0]),body('carrier',[10,20,30]),body('a',[10,20,40]),body('b',[78,20,40]),body('follower',[10,20,55])]});
 const add=j=>{p.joints=createCadJoint(p,j);};
 add({id:'transport',kind,parentId:'bed',childId:'carrier',origin:[10,20,30],axis,limits:{min:-100,max:100}});
 add({id:'a',kind:'revolute',parentId:'carrier',childId:'a',origin:[10,20,40],axis:[0,0,1],limits:{min:-25,max:25}});
 add({id:'b',kind:'revolute',parentId:'carrier',childId:'b',origin:[78,20,40],axis:opposite?[0,0,-1]:[0,0,1],limits:{min:-90,max:90}});
 add({id:'follow',kind:'fixed',parentId:'a',childId:'follower',origin:[10,20,55]});
 applyCadJointRequest(p,{action:'move',values:[{jointId:'a',value:12},{jointId:'b',value:opposite?19.8:-19.8}]});
 p.version=16;return p;
}
const coupling={action:'gear-create',gear:{id:'drive',name:'48:20 on carrier',jointA:'a',jointB:'b',teethA:48,teethB:20,kind:'external'}};

test('moving carrier: 48:20 coupling preserves phase and follows either driver plus Y travel with exact Undo/Redo',async()=>{
 const initial=fixture();let jobs=0;
 const cad=createCadController({initial,createWorker:()=>{jobs++;throw Error('No geometry work for joints');},createMeshWorker:()=>{jobs++;throw Error('No mesh work for joints');}});
 try{
  const original=cad.serialize();const cp=await cad.previewJoints(coupling);
  assert.equal(cad.serialize(),original);assert.deepEqual(cp.project.nodes,initial.nodes);
  near(cp.project.joints.gears[0].phase,9);cad.apply(cp);
  const coupled=cad.serialize(),depth=cad.state().undo;
  const preview=await cad.previewJoints({action:'move',values:[{jointId:'transport',value:35},{jointId:'a',value:15}]});
  assert.equal(cad.serialize(),coupled);assert.equal(cad.state().undo,depth);
  near(preview.project.joints.joints.find(j=>j.id==='b').value,-27);
  for(const id of ['a','b']){const n=preview.project.nodes.find(n=>n.id===id);near(n.transform[13],55);near(n.transform[12],id==='a'?10:78);}
  for(const node of preview.project.nodes)assert.deepEqual(node.brep,initial.nodes.find(n=>n.id===node.id).brep);
  assert.equal(preview.jointReport.affectedIds.length,4);assert.deepEqual(cadJointProblems(preview.project),[]);
  cad.apply(preview);const moved=cad.serialize();assert.equal(cad.state().undo,depth+1);
  cad.undo();assert.equal(cad.serialize(),coupled);cad.redo();assert.equal(cad.serialize(),moved);
  const restored=parseCadProject(moved);assert.deepEqual(cadJointProblems(restored),[]);
  const reverse=compileCadJointMotion(restored).preview([{jointId:'b',value:-39}]);
  near(reverse.values.find(j=>j.jointId==='a').value,20);assert.equal(jobs,0);
 }finally{cad.dispose();}
});

test('rotating common carrier preserves opposite-axis coupling and carries both centres and their descendant',()=>{
 const p=fixture({kind:'revolute',axis:[1,0,0],opposite:true});applyCadJointRequest(p,coupling);
 near(p.joints.gears[0].phase,-9);assert.equal(p.joints.gears[0].axisSign,-1);
 applyCadJointRequest(p,{action:'move',values:[{jointId:'transport',value:90},{jointId:'a',value:15}]});
 near(p.joints.joints.find(j=>j.id==='b').value,27);
 for(const id of ['a','b']){const n=p.nodes.find(n=>n.id===id);near(n.transform[13],10);near(n.transform[14],30);}
 const follower=p.nodes.find(n=>n.id==='follower');near(follower.transform[13],-5);near(follower.transform[14],30);
 assert.deepEqual(cadJointProblems(p),[]);
 // Changing the drive again after the carrier rotation uses its new world axes.
 applyCadJointRequest(p,{action:'move',values:[{jointId:'b',value:39}]});
 near(p.joints.joints.find(j=>j.id==='a').value,20);assert.deepEqual(cadJointProblems(p),[]);
});

test('carrier-only motion leaves gear angles unchanged and rejected limits/conflicts retain the last valid preview',()=>{
 const p=fixture();applyCadJointRequest(p,coupling);const m=compileCadJointMotion(p),original=JSON.stringify(p);
 const first=m.preview([{jointId:'transport',value:8}]);near(first.values.find(j=>j.jointId==='a').value,12);near(first.values.find(j=>j.jointId==='b').value,-19.8);
 const staged=m.data();assert.throws(()=>m.preview([{jointId:'b',value:80}]),{code:'JOINT_LIMIT'});assert.deepEqual(m.data(),staged);
 assert.throws(()=>m.preview([{jointId:'a',value:10},{jointId:'b',value:10}]),{code:'GEAR_CONFLICT'});assert.deepEqual(m.data(),staged);
 assert.equal(JSON.stringify(p),original);assert.deepEqual(m.reset().placements,[]);
});

test('locked gear and fixed descendants block propagated motion but preserve unrelated valid branches',()=>{
 for(const lockedId of ['b','follower']){
  const p=fixture();applyCadJointRequest(p,coupling);p.nodes.find(n=>n.id===lockedId).locked=true;
  const m=compileCadJointMotion(p),before=m.data();
  for(const changes of [[{jointId:'a',value:15}],[{jointId:'transport',value:1}]]){
   assert.throws(()=>m.preview(changes),{code:'LOCKED_JOINT_TARGET'});assert.deepEqual(m.data(),before);
  }
 }
});

test('different carriers, nonparallel axes and stale carrier frames remain rejected',()=>{
 const different=fixture();different.joints.joints.find(j=>j.id==='b').parentId='bed';
 assert.throws(()=>applyCadJointRequest(different,coupling),{code:'GEAR_SUPPORT'});
 const skew=fixture();applyCadJointRequest(skew,{action:'rebind',jointId:'b',origin:[78,20,40],axis:[1,0,0]});
 assert.throws(()=>applyCadJointRequest(skew,coupling),{code:'GEAR_AXIS'});
 const stale=fixture();applyCadJointRequest(stale,coupling);stale.nodes.find(n=>n.id==='carrier').transform[12]+=1;
 assert.throws(()=>compileCadJointMotion(stale),{code:'JOINT_FRAME_STALE'});
});
