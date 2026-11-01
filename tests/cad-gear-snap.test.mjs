import test from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4,Vector3} from 'three';
import {createCadProject,serializeCadProject,parseCadProject} from '../src/cad-project.js';
import {cadIdentity} from '../src/cad-affine.js';
import {cadSnapGear,findCadGearSnap,applyCadGearSnap} from '../src/cad-gear-snap.js';
import {applyCadJointRequest,cadJointProblems,createCadJoint} from '../src/cad-joints-data.js';
const near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function body(id,x=0,teeth=20,params={}){const transform=cadIdentity();transform[12]=x;return {id,name:id,kind:'cad',source:'native',solid:true,transform,recipe:{type:'gear',size:[30,30,6],params:{teeth,module:1.5,...params}},brep:{format:'OpenCascade-BRep',data:'unchanged-'+id,triangulation:false},stats:{bounds:{min:[-15,-15,-3],max:[15,15,3]},volume:20,solids:1}};}
const fixture=()=>createCadProject({nodes:[body('a'),body('b',38.3,30)]});
const carrier=()=>({...body('carrier'),recipe:{type:'box',size:[.1,.1,.1]}});
test('nearby original gears snap to pitch distance, tooth gap and counter-rotation; roundtrip and three-wheel train',async()=>{
 const p=fixture(),before=serializeCadProject(p),snap=findCadGearSnap(p,'b');near(snap.distance,37.5);near(snap.transform[12],37.5);near(Math.abs(Math.atan2(snap.transform[1],snap.transform[0]))*180/Math.PI,6);assert.equal(serializeCadProject(p),before);
 const r=await applyCadGearSnap(p,snap,{createCarrier:carrier});assert(r.createdCarrier);assert(p.nodes.find(n=>n.id==='carrier').hidden);assert.equal(p.joints.joints.length,2);assert.equal(p.joints.gears.length,1);assert.deepEqual(cadJointProblems(p),[]);
 const originalBrep=p.nodes.map(n=>n.brep),j=p.joints.joints.find(j=>j.childId==='a');applyCadJointRequest(p,{action:'move',values:[{jointId:j.id,value:60}]});near(p.joints.joints.find(j=>j.childId==='b').value,-40);near(p.nodes.find(n=>n.id==='b').transform[12],37.5);assert.deepEqual(p.nodes.map(n=>n.brep),originalBrep);
 p.nodes.push({...body('c',75.8,20),layerId:'default',folderId:null});const second=findCadGearSnap(p,'c');assert.equal(second.parentId,'carrier');await applyCadGearSnap(p,second,{createCarrier:()=>assert.fail('Must reuse the original carrier')});assert.equal(p.nodes.length,4);assert.equal(p.joints.gears.length,2);assert.deepEqual(cadJointProblems(p),[]);
 const saved=serializeCadProject(p);assert.equal(serializeCadProject(parseCadProject(saved)),saved);
 const b=p.joints.joints.find(j=>j.childId==='b');applyCadJointRequest(p,{action:'move',values:[{jointId:b.id,value:-60}]});near(p.joints.joints.find(j=>j.childId==='a').value,90);near(p.joints.joints.find(j=>j.childId==='c').value,30);
});
test('no false matches for module, pressure angle, hand, scale, hidden/locked/imported or already connected parts',()=>{
 for(const change of [n=>n.recipe.params.module=2,n=>n.recipe.params.pressureAngle=25,n=>n.recipe.params.helixAngle=20,n=>n.transform[0]=2,n=>n.hidden=true,n=>n.locked=true,n=>n.source='step',n=>n.recipe.type='cylinder',n=>n.transform[12]=90,n=>n.transform[14]=10]){const p=fixture();change(p.nodes[1]);assert.equal(findCadGearSnap(p,'b'),null);}
 const p=fixture();assert.equal(findCadGearSnap(p,'b',{enabled:false}),null);p.joints=createCadJoint(p,{kind:'fixed',parentId:'a',childId:'b',origin:[39,0,0]});assert.equal(findCadGearSnap(p,'b'),null);
});
test('matching helical gears, profile shift and a common tilted uniform frame use physical module and fixed centres',async()=>{
 const p=fixture();p.nodes[0].recipe.params.helixAngle=20;p.nodes[1].recipe.params.helixAngle=-20;p.nodes[0].recipe.params.profileShift=.2;p.nodes[1].recipe.params.profileShift=-.2;p.nodes[1].transform[12]=40.2;
 const frame=new Matrix4().makeRotationX(.6).multiply(new Matrix4().makeScale(2,2,2));for(const n of p.nodes)n.transform=frame.clone().multiply(new Matrix4().fromArray(n.transform)).toArray();const s=findCadGearSnap(p,'b');near(s.distance,75/Math.cos(20*Math.PI/180));assert(s);
 const c=carrier();c.transform=frame.toArray();await applyCadGearSnap(p,s,{createCarrier:()=>c});assert.deepEqual(cadJointProblems(p),[]);assert(cadSnapGear(p.nodes[0],p));
 const j=p.joints.joints[0],center=p.nodes[1].transform.slice(12,15);applyCadJointRequest(p,{action:'move',values:[{jointId:j.id,value:30}]});for(let k=0;k<3;k++)near(p.nodes[1].transform[12+k],center[k]);
});
test('nearest eligible gear is selected deterministically and existing carrier/angles remain untouched',async()=>{
 const p=fixture();const c=carrier();p.nodes.push({...c,layerId:'default',folderId:null});p.joints=createCadJoint(p,{id:'old',kind:'revolute',parentId:c.id,childId:'a',origin:[0,0,0],limits:{min:-90,max:90}});applyCadJointRequest(p,{action:'move',values:[{jointId:'old',value:20}]});const preserved=structuredClone(p.joints.joints[0]);const s=findCadGearSnap(p,'b');assert.equal(s.jointA,'old');await applyCadGearSnap(p,s);assert.deepEqual(p.joints.joints[0],preserved);assert.equal(p.nodes.length,3);assert.deepEqual(cadJointProblems(p),[]);
});

test('one millimetre capture and 15 degree placement detents are separate from the tooth phase',()=>{
 const p=fixture();for(const [angle,radius,expected]of [[18,38.4,15],[-18,38.4,-15],[44,36.6,45],[91,37.5,90]]){const b=p.nodes[1],t=angle*Math.PI/180;b.transform[12]=radius*Math.cos(t);b.transform[13]=radius*Math.sin(t);const snap=findCadGearSnap(p,'b');assert(snap);near(snap.bearing,expected);near(Math.hypot(snap.center[0],snap.center[1]),37.5);near(Math.atan2(snap.center[1],snap.center[0])*180/Math.PI,expected);}
 p.nodes[1].transform[12]=38.51;p.nodes[1].transform[13]=0;assert.equal(findCadGearSnap(p,'b'),null);p.nodes[1].transform[12]=36.49;assert.equal(findCadGearSnap(p,'b'),null);
});

test('free mode retains intermediate bearing while still aligning tooth phase and pitch distance',()=>{
 const p=fixture(),angle=17.3*Math.PI/180;p.nodes[1].transform[12]=38*Math.cos(angle);p.nodes[1].transform[13]=38*Math.sin(angle);const snap=findCadGearSnap(p,'b',{angleStep:0});near(snap.bearing,17.3);near(Math.hypot(...snap.center.slice(0,2)),37.5);
});
