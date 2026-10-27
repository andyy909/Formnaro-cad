import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,SphereGeometry,Matrix4} from 'three';
import {thicknessMap,thicknessColor} from '../src/thickness-map.js';
function data(g,m=new Matrix4()){
  g.applyMatrix4(m);const vertices=Array.from(g.attributes.position.array),triangles=Array.from(g.index.array);
  if(m.determinant()<0)for(let i=0;i<triangles.length;i+=3)[triangles[i+1],triangles[i+2]]=[triangles[i+2],triangles[i+1]];
  return {vertices,triangles};
}
test('Cuboid normal distances, no source mutation, bounded complete sampling',()=>{
  const input=data(new BoxGeometry(30,20,2)),before=JSON.stringify(input),result=thicknessMap(input);
  assert.equal(JSON.stringify(input),before);assert.equal(result.measured,12);assert.ok(Math.abs(result.minimum-2)<1e-6);assert.ok(Math.abs(result.maximum-30)<1e-6);assert.equal(result.complete,false);
  for(const value of result.values)assert.ok([2,20,30].some(v=>Math.abs(v-value)<1e-5));
});
test('Affine shear, reflection and translation measure world millimetres',()=>{
  const m=new Matrix4().set(2,.03,0,125,0,-1,0,77,0,0,.5,8,0,0,0,1),r=thicknessMap(data(new BoxGeometry(30,20,2),m));
  assert.equal(r.measured,12);assert.ok(Math.abs(r.minimum-1)<1e-5);assert.ok(r.maximum>50);
});
test('Unmeasured triangles remain unknown, not interpolated as safe',()=>{
  const r=thicknessMap({...data(new BoxGeometry(30,20,2)),maxSamples:3});assert.equal(r.sampled,3);assert.ok(r.measured<=3);assert.equal(Array.from(r.values).filter(Number.isNaN).length,12-r.measured);
});
test('Open sheets, reversed normals and degenerate geometry cannot imply a wall',()=>{
  const sheet={vertices:[0,0,0,10,0,0,0,10,0],triangles:[0,1,2]};assert.equal(thicknessMap(sheet).measured,0);
  const input=data(new BoxGeometry(30,20,2));for(let i=0;i<input.triangles.length;i+=3)[input.triangles[i+1],input.triangles[i+2]]=[input.triangles[i+2],input.triangles[i+1]];assert.equal(thicknessMap(input).measured,0);
  assert.equal(thicknessMap({vertices:[0,0,0,1,0,0,2,0,0],triangles:[0,1,2]}).measured,0);
});
test('Curved finite tessellation stays bounded and cancellable worker input is limited',()=>{
  const r=thicknessMap({...data(new SphereGeometry(10,64,32)),maxSamples:500});assert.ok(r.measured>300);assert.ok(r.minimum>19.8&&r.maximum<=20.01);assert.ok(r.milliseconds<20000);
  assert.throws(()=>thicknessMap({vertices:[NaN,0,0],triangles:[0,0,0]}));assert.throws(()=>thicknessMap({...data(new BoxGeometry()),maxSamples:12001}));
});
test('Unknown grey, clamped palette and invalid scale',()=>{
  assert.deepEqual(thicknessColor(NaN,0,5),[.46,.49,.53]);assert.deepEqual(thicknessColor(-1,0,5),thicknessColor(0,0,5));assert.deepEqual(thicknessColor(10,0,5),thicknessColor(5,0,5));assert.throws(()=>thicknessColor(1,2,1));
});
