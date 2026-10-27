import test from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4,Vector3} from 'three';
import {cadRotationSnap,cadRotationDelta} from '../src/cad-rotation.js';
const close=(a,b)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-9,`${a} != ${b}`));

test('Mini rotation uses 15 degrees inside, 1 degree outside and Shift overrides fine mode',()=>{
  for(const [angle,coarse,fine]of [[37,30,37],[-38,-45,-38],[721.2,720,721]]){
    assert.deepEqual(cadRotationSnap(angle,true),{degrees:coarse,step:15});
    assert.deepEqual(cadRotationSnap(angle,false),{degrees:fine,step:1});
    assert.deepEqual(cadRotationSnap(angle,false,true),{degrees:coarse,step:15});
  }
  assert.equal(Object.is(cadRotationSnap(-.1,false).degrees,-0),false);
  assert.throws(()=>cadRotationSnap(NaN,true));
});

test('Rotation holds its world pivot and follows an inclined plane normal',()=>{
  const center=[12,-8,24],m=new Matrix4().fromArray(cadRotationDelta(center,[0,1,1],90));
  close(new Vector3(...center).applyMatrix4(m).toArray(),center);
  close(new Vector3(13,-8,24).applyMatrix4(m).toArray(),[12,-8+Math.SQRT1_2,24-Math.SQRT1_2]);
  assert.throws(()=>cadRotationDelta(center,[0,0,0],15));
});

test('World rotation preserves reflection, shear, length and relative placement without decomposition',()=>{
  const original=new Matrix4().set(-2,.4,0,7,0,1.2,.3,-5,0,0,.7,18,0,0,0,1),before=original.toArray(),delta=new Matrix4().fromArray(cadRotationDelta([2,4,-3],[1,2,3],137)),after=delta.clone().multiply(original);
  const p=new Vector3(3,5,-2).applyMatrix4(original),q=new Vector3(-4,1,7).applyMatrix4(original);
  assert.ok(Math.abs(p.distanceTo(q)-p.clone().applyMatrix4(delta).distanceTo(q.clone().applyMatrix4(delta)))<1e-10);
  assert.ok(Math.abs(original.determinant()-after.determinant())<1e-10);
  close(after.clone().premultiply(delta.clone().invert()).toArray(),before);assert.deepEqual(original.toArray(),before);
});
