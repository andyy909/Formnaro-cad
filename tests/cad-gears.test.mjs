import test from 'node:test';
import assert from 'node:assert/strict';
import {createCadProject,serializeCadProject,parseCadProject} from '../src/cad-project.js';
import {createCadJoint,applyCadJointRequest,compileCadJointMotion,remapCadJoints,mergeCadJoints} from '../src/cad-joints-data.js';
import {cadTemplateSelection} from '../src/cad-persistence.js';
const mat=x=>[1,0,0,0,0,1,0,0,0,0,1,0,x,0,0,1];
function fixture(){
 const p=createCadProject({nodes:['base','a','b','c'].map((id,i)=>({id,name:id,kind:'mesh',meshRole:'solid',mesh:{verts:[0,0,0,1,0,0,0,1,0],triangles:[0,1,2]},transform:mat(i*30)}))});
 for(const id of ['a','b','c'])p.joints=createCadJoint(p,{id:'j'+id,kind:'revolute',parentId:'base',childId:id,origin:[p.nodes.find(n=>n.id===id).transform[12],0,0],limits:{min:-36000,max:36000}});
 applyCadJointRequest(p,{action:'gear-create',gear:{id:'ab',jointA:'ja',jointB:'jb',teethA:20,teethB:40}});
 applyCadJointRequest(p,{action:'gear-create',gear:{id:'bc',jointA:'jb',jointB:'jc',teethA:40,teethB:20}});return p;
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7);
test('persisted gear train is driven bidirectionally without moving centres or original geometry',()=>{
 const p=fixture(),before=JSON.stringify(p),motion=compileCadJointMotion(p),r=motion.preview([{jointId:'ja',value:90}]);
 assert.deepEqual(r.values.map(j=>j.value),[90,-45,90]);for(const n of r.placements)near(n.transform[12],p.nodes.find(x=>x.id===n.rootId).transform[12]);
 assert.equal(JSON.stringify(p),before);assert.deepEqual(motion.preview([{jointId:'jb',value:90}]).values.map(j=>j.value),[-180,90,-180]);assert.deepEqual(motion.reset().placements,[]);
 applyCadJointRequest(p,{action:'move',values:[{jointId:'ja',value:90}]});const saved=serializeCadProject(p),read=parseCadProject(saved);assert.equal(read.version,26);assert.equal(read.joints.gears.length,2);assert.equal(serializeCadProject(read),saved);
});
test('opposite axis orientation and internal gear direction use physical world axes',()=>{
 const p=fixture();applyCadJointRequest(p,{action:'gear-remove',gearId:'ab'});applyCadJointRequest(p,{action:'gear-remove',gearId:'bc'});
 applyCadJointRequest(p,{action:'rebind',jointId:'jb',origin:[60,0,0],axis:[0,0,-1]});applyCadJointRequest(p,{action:'gear-create',gear:{jointA:'ja',jointB:'jb',teethA:20,teethB:40}});
 const v=compileCadJointMotion(p).preview([{jointId:'ja',value:90}]).values;near(v.find(j=>j.jointId==='jb').value,45);
});
test('locked followers, conflicting drivers, bad loops and limits preserve the last valid preview',()=>{
 const p=fixture(),m=compileCadJointMotion(p);m.preview([{jointId:'ja',value:10}]);assert.throws(()=>m.preview([{jointId:'ja',value:90},{jointId:'jb',value:90}]),{code:'GEAR_CONFLICT'});near(m.data().joints[0].value,10);
 assert.throws(()=>applyCadJointRequest(p,{action:'gear-create',gear:{jointA:'jc',jointB:'ja',teethA:20,teethB:20}}),{code:'GEAR_CONFLICT'});
 p.nodes.find(n=>n.id==='c').locked=true;assert.throws(()=>compileCadJointMotion(p).preview([{jointId:'ja',value:20}]),{code:'LOCKED_JOINT_TARGET'});
});
test('templates and remapping preserve complete couplings, partial copies detach missing relations',()=>{
 const p=fixture(),template=cadTemplateSelection(p,['base','a','b','c']);assert.equal(template.version,26);assert.equal(template.joints.gears.length,2);
 const copied=remapCadJoints(p.joints,new Map(p.nodes.map(n=>[n.id,'new-'+n.id])));assert.equal(copied.gears.length,2);assert.ok(copied.gears.every(g=>copied.joints.some(j=>j.id===g.jointA)&&!p.joints.joints.some(j=>j.id===g.jointA)));
 assert.equal(mergeCadJoints(p.joints,copied).gears.length,4);
 const partial=remapCadJoints(p.joints,new Map([['base','B'],['a','A']]));assert.equal(partial.version,1);
 applyCadJointRequest(p,{action:'remove',jointId:'jb'});assert.equal(p.joints.gears.length,0);
});
