import test from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4} from 'three';
import load from '../cad-kernel-build/runtime/formnaro_cad.js';
import {createCadService} from '../src/cad-service.js';
import {createCadProject,serializeCadProject} from '../src/cad-project.js';
import {createCadClickMeasureNative} from '../src/cad-click-measure-native.js';
const oc=await load({print:()=>{},printErr:()=>{}}),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const ray=(origin,direction)=>({origin,direction,far:1000});
test('Native click measures a true cylinder radius independently of display tessellation',async()=>{
 const service=createCadService({oc});try{const n=service.nativeNode({type:'cylinder',size:[20,20,30]},{id:'cylinder'}),project=await service.rebuild(createCadProject({nodes:[n]})),before=serializeCadProject(project),measure=createCadClickMeasureNative({oc,service});
  const hit=measure.pick({project,ids:[n.id],ray:ray([40,0,0],[-1,0,0])});assert.equal(hit.surface.kind,'cylinder');near(hit.surface.radius,10);near(hit.surface.diameter,20);near(hit.point[0],10);
  const cap=measure.pick({project,ids:[n.id],ray:ray([2,0,80],[0,0,-1])});assert.equal(cap.surface.kind,'plane');assert.equal(measure.pick({project,ids:[n.id],ray:ray([40,40,0],[1,0,0])}),null);assert.equal(serializeCadProject(project),before);
 }finally{service.dispose();}
});
test('Mirrored rotated cylinder measures world millimetres and nonuniform scaling cannot invent a circular diameter',async()=>{
 const service=createCadService({oc});try{const uniform=new Matrix4().makeRotationX(Math.PI/2).multiply(new Matrix4().makeScale(-2,2,2)).toArray(),n=service.nativeNode({type:'cylinder',size:[20,20,20]},{id:'c',transform:uniform}),project=await service.rebuild(createCadProject({nodes:[n]})),m=createCadClickMeasureNative({oc,service}),hit=m.pick({project,ids:['c'],ray:ray([50,0,0],[-1,0,0])});near(hit.surface.diameter,40);near(Math.abs(hit.surface.axis[1]),1);
  const affine=structuredClone(project);affine.nodes[0].transform=new Matrix4().makeScale(2,1,1).toArray();const h=m.pick({project:affine,ids:['c'],ray:ray([50,0,0],[-1,0,0])});assert.notEqual(h.surface.kind,'cylinder');
 }finally{service.dispose();}
});
test('Two clicked trimmed faces measure their shortest distance, including faces within one body',async()=>{
 const service=createCadService({oc});try{const n=service.nativeNode({type:'box',size:[20,30,40]},{id:'box'}),project=await service.rebuild(createCadProject({nodes:[n]})),m=createCadClickMeasureNative({oc,service}),from=m.pick({project,ids:['box'],ray:ray([-50,2,3],[1,0,0])}),to=m.pick({project,ids:['box'],ray:ray([50,2,3],[-1,0,0])}),r=m.distance({project,from,to});near(r.distance,20);near(Math.hypot(...r.to.map((v,k)=>v-r.from[k])),20);near(m.distance({project,from,to:from}).distance,0);
  assert.throws(()=>m.distance({project,from:{objectId:'box',faceIndex:999},to}),/fehlt/);assert.throws(()=>m.pick({project,ids:['box','box'],ray:ray([50,0,0],[-1,0,0])}),/Ungültige/);
 }finally{service.dispose();}
});
test('Nearest CAD surface wins and ambiguous edge hits fail clearly',async()=>{
 const service=createCadService({oc});try{const a=service.nativeNode({type:'box',size:[20,20,20]},{id:'a'}),b=service.nativeNode({type:'box',size:[20,20,20]},{id:'b',transform:new Matrix4().makeTranslation(50,0,0).toArray()}),project=await service.rebuild(createCadProject({nodes:[a,b,{...structuredClone(a),id:'copy'}]})),m=createCadClickMeasureNative({oc,service});assert.equal(m.pick({project,ids:['a','copy','b'],ray:ray([100,0,0],[-1,0,0])}).objectId,'b');assert.throws(()=>m.pick({project,ids:['a'],ray:ray([50,50,0],[-1,-1,0])}),/Mehrere/);
 }finally{service.dispose();}
});
