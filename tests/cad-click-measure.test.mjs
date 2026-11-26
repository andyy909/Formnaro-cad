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
test('Native oriented faces distinguish a 10 mm bore from the cylindrical outside',async()=>{
 const service=createCadService({oc});
 try{
  const tube=service.nativeNode({type:'tube',size:[20,20,6],params:{wall:5}},{id:'tube'});
  const project=await service.rebuild(createCadProject({nodes:[tube]}));
  const measure=createCadClickMeasureNative({oc,service});
  const pick=(origin,direction)=>measure.pick({project,ids:[tube.id],ray:ray(origin,direction)});
  const bore=pick([0,0,0],[0,1,0]);
  assert.equal(bore.surface.inner,true);
  near(bore.surface.diameter,10);
  const outside=pick([0,50,0],[0,-1,0]);
  assert.equal(outside.surface.inner,false);
  near(outside.surface.diameter,20);
  const top=pick([0,7,50],[0,0,-1]),bottom=pick([0,7,-50],[0,0,1]);
  assert.equal(top.surface.kind,'plane');
  near(measure.distance({project,from:top,to:bottom}).distance,6);
  near(measure.distance({project,from:top,to:outside}).distance,0);
 }finally{service.dispose();}
});
test('Two clicked trimmed faces measure their shortest distance, including faces within one body',async()=>{
 const service=createCadService({oc});try{const n=service.nativeNode({type:'box',size:[20,30,40]},{id:'box'}),project=await service.rebuild(createCadProject({nodes:[n]})),m=createCadClickMeasureNative({oc,service}),from=m.pick({project,ids:['box'],ray:ray([-50,2,3],[1,0,0])}),to=m.pick({project,ids:['box'],ray:ray([50,2,3],[-1,0,0])}),r=m.distance({project,from,to});near(r.distance,20);near(Math.hypot(...r.to.map((v,k)=>v-r.from[k])),20);near(m.distance({project,from,to:from}).distance,0);
  assert.throws(()=>m.distance({project,from:{objectId:'box',faceIndex:999},to}),/fehlt/);assert.throws(()=>m.pick({project,ids:['box','box'],ray:ray([50,0,0],[-1,0,0])}),/Ungültige/);
 }finally{service.dispose();}
});
test('Wall sampling accepts an uninterrupted normal path and keeps air gaps as distances',async()=>{
 const service=createCadService({oc});
 try{
  const plate=service.nativeNode({type:'box',size:[20,20,6]},{id:'plate'});
  const tube=service.nativeNode({type:'tube',size:[20,20,6],params:{wall:5}},
    {id:'tube',transform:new Matrix4().makeTranslation(40,0,0).toArray()});
  const block=service.nativeNode({type:'box',size:[20,20,6]},
    {id:'block',transform:new Matrix4().makeTranslation(0,0,12).toArray()});
  const project=await service.rebuild(createCadProject({nodes:[plate,tube,block]}));
  const measure=createCadClickMeasureNative({oc,service});
  const pick=(id,origin,direction)=>measure.pick({project,ids:[id],ray:ray(origin,direction)});
  const distance=(from,to)=>measure.distance({project,from,to,wallEntry:{point:from.point,normal:from.normal}});
  const top=pick('plate',[0,1,8],[0,0,-1]),bottom=pick('plate',[0,1,-8],[0,0,1]);
  near(distance(top,bottom).thickness.value,6);
  const air=distance(top,pick('block',[0,1,6],[0,0,1]));
  near(air.distance,6);
  assert.equal(air.thickness,null);
  const inner=pick('tube',[40,0,0],[0,1,0]),outer=pick('tube',[40,20,0],[0,-1,0]);
  near(distance(inner,outer).thickness.value,5);
  const cap=pick('tube',[40,7,8],[0,0,-1]);
  assert.equal(distance(inner,cap).thickness,null);
 }finally{service.dispose();}
});
test('Nearest CAD surface wins and ambiguous edge hits fail clearly',async()=>{
 const service=createCadService({oc});try{const a=service.nativeNode({type:'box',size:[20,20,20]},{id:'a'}),b=service.nativeNode({type:'box',size:[20,20,20]},{id:'b',transform:new Matrix4().makeTranslation(50,0,0).toArray()}),project=await service.rebuild(createCadProject({nodes:[a,b,{...structuredClone(a),id:'copy'}]})),m=createCadClickMeasureNative({oc,service});assert.equal(m.pick({project,ids:['a','copy','b'],ray:ray([100,0,0],[-1,0,0])}).objectId,'b');assert.throws(()=>m.pick({project,ids:['a'],ray:ray([50,50,0],[-1,-1,0])}),/Mehrere/);
 }finally{service.dispose();}
});
