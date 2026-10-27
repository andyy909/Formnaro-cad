import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {installTouchNavigation} from '../src/touch-navigation.js';
function fixture(mode='edit'){
  globalThis.window=new EventTarget();const canvas=new EventTarget();canvas.clientHeight=700;canvas.setPointerCapture=()=>{};canvas.hasPointerCapture=()=>false;
  const camera=new THREE.PerspectiveCamera(38,1,.1,20000);camera.up.set(0,0,1);camera.position.set(100,-100,100);camera.lookAt(0,0,0);
  const orbit={target:new THREE.Vector3(),minDistance:5,maxDistance:15000,update(){}};let cancelled=0;
  installTouchNavigation({canvas,camera,orbit,mode:()=>mode,enabled:()=>true,cancel:()=>cancelled++,draw(){}});
  function input(type,id,x,y){const event=new Event(type,{cancelable:true});Object.assign(event,{pointerId:id,pointerType:'touch',clientX:x,clientY:y});canvas.dispatchEvent(event);return event;}
  return {camera,orbit,input,cancelled:()=>cancelled};
}
test('second touch cancels editing, pinch changes distance and two-finger pan preserves orientation',()=>{
  const f=fixture();const initial=f.camera.position.clone();f.input('pointerdown',1,100,100);assert.equal(f.cancelled(),0);f.input('pointerdown',2,200,100);assert.equal(f.cancelled(),1);
  const quaternion=f.camera.quaternion.clone();f.input('pointermove',1,50,100);f.input('pointermove',2,250,100);assert.ok(f.camera.position.distanceTo(f.orbit.target)<initial.length());assert.ok(f.camera.quaternion.angleTo(quaternion)<1e-7);
  const distance=f.camera.position.distanceTo(f.orbit.target);f.input('pointermove',1,80,130);f.input('pointermove',2,280,130);assert.ok(f.orbit.target.length()>0);assert.ok(Math.abs(f.camera.position.distanceTo(f.orbit.target)-distance)<1e-7);
  f.input('pointerup',1,80,130);f.input('pointerup',2,280,130);const final=f.camera.position.clone();f.input('pointermove',2,400,400);assert.deepEqual(f.camera.position,final);
});
test('view mode rotates with one finger, retains target and distance, and pointercancel ends navigation',()=>{
  const f=fixture('view'),distance=f.camera.position.length(),before=f.camera.position.clone();assert.ok(f.input('pointerdown',1,100,100).defaultPrevented);f.input('pointermove',1,170,130);assert.ok(f.camera.position.distanceTo(before)>1);assert.ok(Math.abs(f.camera.position.length()-distance)<1e-7);assert.equal(f.orbit.target.length(),0);
  f.input('pointercancel',1,170,130);const final=f.camera.position.clone();f.input('pointermove',1,400,400);assert.deepEqual(f.camera.position,final);
});
