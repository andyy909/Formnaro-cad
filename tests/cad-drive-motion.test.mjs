import test from 'node:test';import assert from 'node:assert/strict';
import {createCadProject,serializeCadProject,parseCadProject} from '../src/cad-project.js';
import {createCadJoint,applyCadJointRequest,compileCadJointMotion,remapCadJoints,mergeCadJoints,cadJointProblems} from '../src/cad-joints-data.js';
import {cadIdentity,cadPoint,multiplyCadMatrices} from '../src/cad-affine.js';
import {createCadController} from '../src/cad-controller.js';
import {createCadAutomationAccess} from '../src/cad-automation-access.js';
import {playCadMotion} from '../src/cad-motion-playback.js';
import {checkCadMotionRange} from '../src/cad-motion-range.js';
import {encodeMotionGif} from '../src/cad-motion-gif.js';
import {expandDriveMotion} from '../src/cad-drive-couplings.js';
import {cadChangeSummary} from '../src/cad-change-summary.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const body=id=>({id,kind:'cad',name:id,source:'native',solid:true,transform:cadIdentity(),recipe:{type:'box',size:[2,2,2]},brep:{format:'OpenCascade-BRep',data:'storage-only-'+id,triangulation:false},stats:{bounds:{min:[-1,-1,0],max:[1,1,2]},volume:8,solids:1}});
export function mechanism({actuator=false,screw=true}={}){
 const p=createCadProject({nodes:['base','table','swivel','extension','rotary'].map(body)}),add=(id,kind,parentId,childId,origin,axis,limits)=>p.joints=createCadJoint(p,{id,kind,parentId,childId,origin,axis,limits});
 add('table','revolute','base','table',[0,0,0],[0,0,1],{min:-15,max:15});
 add('swivel','revolute','base','swivel',[0,-30,0],[0,0,1],{min:-180,max:180});
 add('extension','prismatic','swivel','extension',[20,0,0],[20,30,0],{min:-50,max:50});
 add('rotary','revolute','base','rotary',[0,0,0],[0,0,1],{min:-36000,max:36000});
 if(actuator)applyCadJointRequest(p,{action:'drive-create',drive:{id:'tilt',kind:'actuator',table:'table',swivel:'swivel',extension:'extension',attachment:[20,0,0]}});
 if(screw)applyCadJointRequest(p,{action:'drive-create',drive:{id:'screw',kind:'screw',rotary:'rotary',linear:'extension',lead:4,direction:1}});
 return createCadProject(p);
}
test('4 mm/revolution, reverse drive, handedness, multi-start lead and conflicting limits are atomic',()=>{
 const p=mechanism(),m=compileCadJointMotion(p),before=serializeCadProject(p);let values=m.preview([{jointId:'rotary',value:360}]).values;near(values.find(v=>v.jointId==='extension').value,4);
 values=m.preview([{jointId:'extension',value:-8}]).values;near(values.find(v=>v.jointId==='rotary').value,-720);
 const staged=m.data();assert.throws(()=>m.preview([{jointId:'rotary',value:360},{jointId:'extension',value:2}]),{code:'DRIVE_CONFLICT'});assert.deepEqual(m.data(),staged);
 assert.throws(()=>m.preview([{jointId:'rotary',value:36000}]),{code:'JOINT_LIMIT'});assert.deepEqual(m.data(),staged);assert.equal(serializeCadProject(p),before);
 applyCadJointRequest(p,{action:'drive-remove',driveId:'screw'});applyCadJointRequest(p,{action:'drive-create',drive:{kind:'screw',rotary:'rotary',linear:'extension',pitch:2,starts:3,direction:-1}});near(compileCadJointMotion(p).preview([{jointId:'rotary',value:360}]).values.find(v=>v.jointId==='extension').value,-6);
 assert.throws(()=>applyCadJointRequest(p,{action:'drive-create',drive:{kind:'screw',rotary:'rotary',linear:'extension',lead:4}}));
});
test('tilt -15..+15 keeps both anchors connected; reverse extension and spindle select the continuous branch',()=>{
 const p=mechanism({actuator:true}),m=compileCadJointMotion(p),original=serializeCadProject(p);
 for(const angle of [-15,-7.5,0,7.5,15]){
  const result=m.preview([{jointId:'table',value:angle}]),byId=new Map(result.placements.map(p=>[p.rootId,p.transform])),j=p.joints.joints.find(j=>j.id==='extension'),end=multiplyCadMatrices(byId.get('extension')??p.nodes.find(n=>n.id==='extension').transform,j.childFrame),expected=[20*Math.cos(angle*Math.PI/180),20*Math.sin(angle*Math.PI/180),0];expected.forEach((x,k)=>near(x,end[12+k]));
  const ext=result.values.find(v=>v.jointId==='extension').value;near(ext,Math.hypot(expected[0],expected[1]+30)-Math.hypot(20,30));
  const reverse=m.preview([{jointId:'extension',value:ext}]);near(reverse.values.find(v=>v.jointId==='table').value,angle);
  const spindle=result.values.find(v=>v.jointId==='rotary').value;near(m.preview([{jointId:'rotary',value:spindle}]).values.find(v=>v.jointId==='table').value,angle);
 }
 assert.equal(serializeCadProject(p),original);assert.throws(()=>m.preview([{jointId:'extension',value:-40}]),{code:'DRIVE_UNREACHABLE'});assert.throws(()=>m.preview([{jointId:'swivel',value:1}]),{code:'DRIVE_AMBIGUOUS'});
 const forged=structuredClone(p);forged.joints.joints.find(j=>j.id==='swivel').parentFrame[12]+=1;assert.ok(cadJointProblems(forged).some(p=>p.code==='DRIVE_GEOMETRY'));
});
test('new relations roundtrip format31, remap complete copies, omit partial relations and preserve undo',async()=>{
 const initial=mechanism({actuator:true}),saved=serializeCadProject(initial);assert.equal(parseCadProject(saved).version,31);assert.throws(()=>parseCadProject({...JSON.parse(saved),version:30}),/format 31/);
 const mapped=remapCadJoints(initial.joints,new Map(initial.nodes.map(n=>[n.id,'copy-'+n.id])));assert.equal(mapped.drives.length,2);assert.equal(mergeCadJoints(initial.joints,mapped).drives.length,4);
 const partial=remapCadJoints(initial.joints,new Map([['base','b'],['rotary','r']]));assert.equal(partial.version,1);
 const cad=createCadController({initial,createWorker:()=>{throw Error('No native worker for motion');}});try{const before=cad.serialize(),p=await cad.previewJoints({action:'move',values:[{jointId:'table',value:15}]});assert.equal(cad.serialize(),before);cad.apply(p);assert.equal(cad.state().undo,1);assert.deepEqual(cadJointProblems(cad.snapshot()),[]);cad.undo();assert.equal(cad.serialize(),before);}finally{cad.dispose();}
});
test('playback co-drives coupled poses without native calls or undo; abort/error always restore matrices',async()=>{
 const p=mechanism({actuator:true}),cad=createCadController({initial:p,createWorker:()=>{throw Error('Unexpected native worker');}}),before=cad.serialize(),frames=[],view={setJointPreview:v=>frames.push(v),clearJointPreview:()=>frames.push('restored')};try{
  for(const mode of ['complete','abort','capture-error','stale']){const abort=new AbortController();let revision=cad.revision(),n=0;const result=await playCadMotion({project:p,revision,currentRevision:()=>revision,view,tracks:[{jointId:'table',from:-15,to:15}],frames:31,wait:async()=>{},signal:abort.signal,onFrame:pose=>{n++;assert.equal(pose.values.find(v=>v.jointId==='table').value,-15+pose.index);if(n===4){if(mode==='abort')abort.abort();if(mode==='capture-error')throw Error('capture failed');if(mode==='stale')revision='new';}}});assert.equal(result.complete,mode==='complete');assert.equal(frames.at(-1),'restored');assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,0);}
 }finally{cad.dispose();}
});
test('range detects middle-only collisions and explicitly reports sample/time/cancel remainder',async()=>{
 const project=mechanism(),base={request:{jointId:'rotary',from:-2,to:2,pairs:[{leftId:'a',rightId:'b'}]},project,revision:'r',currentRevision:()=>'r',checkPose:async req=>({intersects:req.values[0].value===0,volume:req.values[0].value===0?8:0,method:'fixture'}),yieldTask:async()=>{}};
 let r=await checkCadMotionRange(base);assert.equal(r.complete,true);assert.equal(r.checkedSamples,5);assert.equal(r.collisions[0].driver.value,0);assert.equal(r.fullMotionGuarantee,false);
 r=await checkCadMotionRange({...base,request:{...base.request,from:0,to:600}});assert.equal(r.checkedSamples,501);assert.equal(r.uncheckedFrom,501);assert.equal(r.reason,'sample-limit');
 r=await checkCadMotionRange({...base,signal:AbortSignal.abort()});assert.equal(r.checkedSamples,0);assert.equal(r.reason,'cancelled');
 let time=0;r=await checkCadMotionRange({...base,now:()=>time++,request:{...base.request,timeLimitMs:1}});assert.equal(r.reason,'time-limit');assert.equal(r.uncheckedSamples,5);
 await assert.rejects(checkCadMotionRange({...base,request:{...base.request,step:0}}),{code:'MOTION_RANGE_INVALID'});
});
test('GIF has bounded complete images and valid header/trailer',()=>{const rgba=new Uint8ClampedArray(16*16*4);rgba.fill(255);const gif=encodeMotionGif([rgba,rgba],{width:16,height:16});assert.equal(new TextDecoder().decode(gif.slice(0,6)),'GIF89a');assert.equal(gif.at(-1),0x3b);assert.throws(()=>encodeMotionGif([],{width:16,height:16}));});
test('small preview/apply receipts preserve actual checks/warnings, explicit full response and idempotent revision',async()=>{
 const cad=createCadController({initial:mechanism(),createWorker:()=>{throw Error('No worker');}}),access=createCadAutomationAccess({controller:cad,getScene:()=>({revision:cad.revision(),objects:[],selection:[]})});try{
  const p=await access.preview({responseDetail:'summary',revision:cad.revision(),commands:[{op:'joint',action:'move',values:[{jointId:'rotary',value:360}]}]});assert.equal(p.scene,undefined);assert.equal(p.summary.joints.find(j=>j.jointId==='extension').after,4);assert.deepEqual(p.summary.warnings,p.warnings);assert.deepEqual(p.summary.verification,p.verification);assert.equal(p.summary.previewId,p.previewId);
  const result=await access.apply({previewId:p.previewId,revision:p.revision,responseDetail:'summary'});assert.equal(result.scene,undefined);assert.equal(result.summary.revision,result.revision);const repeated=await access.apply({previewId:p.previewId,revision:p.revision});assert.equal(repeated.alreadyApplied,true);assert.deepEqual(repeated.summary,result.summary);
  const full=await access.preview({revision:cad.revision(),responseDetail:'full',commands:[{op:'joint',action:'move',values:[{jointId:'rotary',value:0}]}]});assert.ok(full.summary);access.discard(full.previewId);
 }finally{cad.dispose();}
});
test('inverse actuator selects a feasible follower branch, not a closer out-of-limit branch',()=>{
 const referenceLength=Math.hypot(20,30),drive={kind:'actuator',id:'act',name:'act',table:'t',swivel:'s',extension:'e',arm:[20,0],base:[0,30],referenceTable:0,referenceSwivel:0,referenceExtension:0,referenceAngle:Math.atan2(-30,20),referenceLength,swivelSign:1,extensionSign:1},joints=[{id:'t',kind:'revolute',value:0,limits:{min:-180,max:180}},{id:'s',kind:'revolute',value:0,limits:{min:-180,max:0}},{id:'e',kind:'prismatic',value:0,limits:{min:-20,max:20}}],values=expandDriveMotion({joints,gears:[],drives:[drive]},[{jointId:'e',value:32-referenceLength}],new Map(joints.map(j=>[j.id,j.value])));
 near(values.find(v=>v.jointId==='t').value,166.70292825279094);near(values.find(v=>v.jointId==='s').value,-71.15271859852541);
});
test('cancellation during capture counts the image already captured, and source/material summaries name affected roots',async()=>{
 const abort=new AbortController(),p=mechanism();let images=0,cleared=false;const r=await playCadMotion({project:p,revision:'r',currentRevision:()=>'r',view:{setJointPreview:()=>{},clearJointPreview:()=>cleared=true},tracks:[{jointId:'rotary',from:0,to:360}],frames:5,signal:abort.signal,wait:async()=>{},onFrame:async()=>{images++;abort.abort();}});assert.equal(r.capturedFrames,images);assert.equal(r.complete,false);assert.equal(cleared,true);
 const before={nodes:[{id:'root',name:'Root',metadata:{partProperties:{material:'steel'}},children:[{id:'source',name:'Old',transform:cadIdentity()}]}]},after=structuredClone(before);after.nodes[0].metadata.partProperties.material='aluminum';after.nodes[0].children[0].name='New';const summary=cadChangeSummary(before,after);assert.deepEqual(summary.parts[0].properties,['metadata']);assert.deepEqual(summary.parts[0].sourceChanges[0].path,['source']);assert.equal(summary.parts[0].sourceChanges[0].name,'New');
});
test('range deadline cancels an in-flight native callback and retains approximation method without hits',async()=>{
 const base={project:mechanism(),revision:'r',currentRevision:()=>'r',request:{jointId:'rotary',from:0,to:0,pairs:[{leftId:'a',rightId:'b'}]},yieldTask:async()=>{}};
 const clear=await checkCadMotionRange({...base,checkPose:async()=>({intersects:false,volume:0,method:'cad-mesh-approximation',deflectionTargetMm:.01})});assert.equal(clear.complete,true);assert.equal(clear.methods[0].method,'cad-mesh-approximation');assert.equal(clear.methods[0].maximumErrorGuaranteed,false);
 let aborted=false;const timed=await checkCadMotionRange({...base,request:{...base.request,timeLimitMs:10},checkPose:(_req,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Object.assign(Error('timeout'),{code:'ABORTED'}));},{once:true}))});assert.equal(aborted,true);assert.equal(timed.reason,'time-limit');assert.equal(timed.uncheckedSamples,1);
});
test('X Y Z and table can replay separately and together with one coupled set of values',async()=>{
 const p=mechanism({actuator:true});for(const [k,axis]of [[0,[1,0,0]],[1,[0,1,0]],[2,[0,0,1]]]){p.nodes.push(body('axis-'+k));p.joints=createCadJoint(p,{id:'axis-'+k,kind:'prismatic',parentId:'base',childId:'axis-'+k,origin:[0,0,0],axis,limits:{min:-30,max:30}});}
 const before=JSON.stringify(p),tracks=[0,1,2].map(k=>({jointId:'axis-'+k,from:-10,to:10}));tracks.push({jointId:'table',from:-15,to:15});let restored=0;
 for(const selected of [...tracks.map(t=>[t]),tracks]){let last;const result=await playCadMotion({project:p,revision:'r',currentRevision:()=>'r',view:{setJointPreview:()=>{},clearJointPreview:()=>restored++},tracks:selected,frames:11,wait:async()=>{},onFrame:pose=>last=pose});assert.equal(result.complete,true);for(const t of selected)near(last.values.find(v=>v.jointId===t.jointId).value,t.to);assert.equal(JSON.stringify(p),before);}
 assert.equal(restored,5);
});
