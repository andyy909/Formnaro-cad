const test=require('node:test'),assert=require('node:assert/strict');
const {validatePlan}=require('../backend/freecad-plan.cjs'),freecad=require('../backend/freecad.cjs');
const plate=()=>({version:1,parameters:{width:40},steps:[{id:'plate',op:'box',size:[{param:'width'},30,5]},{id:'hole',op:'cylinder',radius:3,height:7,origin:[20,15,-1]},{id:'result',op:'cut',source:'plate',tool:'hole'},{id:'measured',op:'inspect',source:'result'}],output:'result'});
test('FreeCAD plan refuses code, paths, forward references and invalid measures',()=>{
 assert.equal(validatePlan(plate()).output,'result');
 for(const mutate of [p=>p.code='import os',p=>p.steps[0].size=[-1,2,3],p=>p.steps[1].axis=[0,0,0],p=>p.steps[2].source='later',p=>p.steps[2].file='C:/secret',p=>p.output='measured',p=>p.steps[0].size[0]={param:'missing'}]){const p=plate();mutate(p);assert.throws(()=>validatePlan(p),{code:'FREECAD_PLAN_INVALID'});}
});
test('Installed FreeCAD builds a bored plate, returns STEP, FCStd and measured topology',async()=>{
 assert.equal(freecad.status().available,true,'This integration test requires the installed FreeCAD runtime.');
 const result=await freecad.run({plan:plate()});assert.equal(result.report.valid,true);assert.equal(result.report.closed,true);assert.equal(result.report.solids,1);assert.ok(Math.abs(result.report.volume-(6000-Math.PI*9*5))<1e-7);assert.deepEqual(result.report.bounds,[0,0,0,40,30,5]);assert.equal(result.measurements[0].id,'measured');assert.ok(result.measurements[0].edgeDetails.length);assert.match(Buffer.from(result.stepBase64,'base64').toString(),/ISO-10303-21/);assert.equal(Buffer.from(result.documentBase64,'base64').subarray(0,2).toString(),'PK');
});
test('FreeCAD import copies geometry and cancellation stops only its own process',async()=>{
 const built=await freecad.run({plan:plate()}),result=await freecad.run({inputs:[{name:'source',format:'step',base64:built.stepBase64}],plan:{version:1,steps:[{id:'copy',op:'transform',source:'source',translation:[2,0,0]}],output:'copy'}});assert.deepEqual(result.report.bounds,[2,0,0,42,30,5]);
 const abort=new AbortController();const pending=freecad.run({plan:plate()},{signal:abort.signal});setTimeout(()=>abort.abort(),100);await assert.rejects(pending,e=>e.name==='AbortError'||e.code==='ABORTED');
});

test('Rejected FreeCAD output identifies checked operands without accepting a surface as a solid',async()=>{
 await assert.rejects(freecad.run({plan:{version:1,steps:[{id:'body',op:'box',size:[20,20,5]},{id:'surface',op:'circle',radius:2,origin:[10,10,0]},{id:'intersection',op:'common',sources:['body','surface']}],output:'intersection'}}),e=>{
  assert.equal(e.code,'FREECAD_FAILED');const proof=e.feedback.geometryCheck;assert.equal(proof.solids,0);assert.deepEqual(proof.operandChecks.map(x=>x.name),['body','surface']);assert.ok(proof.operandChecks.every(x=>x.valid&&x.check==='passed'));assert.deepEqual(proof.inputChecks,[]);return true;
 });
});
