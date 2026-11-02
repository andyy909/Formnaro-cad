import test from 'node:test';import assert from 'node:assert/strict';import {Matrix4,Vector3} from 'three';
import {cadConstructionStretch} from '../src/cad-construction-scale.js';
test('construction stretch is stable under left and right rotations including reflection and shear',()=>{
 const matrices=[new Matrix4(),new Matrix4().makeScale(4,.2,2),new Matrix4().makeShear(.4,.7,-.2,.8,0,.3),new Matrix4().makeScale(-3,2,1)];
 for(const a of matrices){const expected=cadConstructionStretch(a.toArray());for(const angle of [.05244099,.2,.73,Math.PI/2]){
  const r=new Matrix4().makeRotationAxis(new Vector3(1,2,3).normalize(),angle);
  for(const m of [r.clone().multiply(a),a.clone().multiply(r)])assert.equal(cadConstructionStretch(m.toArray()),expected);
 }}
});
test('construction stretch bounds actual amplification and rejects non-finite or singular input',()=>{
 const a=new Matrix4().makeShear(2,-3,.5,-.3,.8,1),bound=cadConstructionStretch(a.toArray());
 for(let i=1;i<=300;i++){const v=new Vector3(Math.sin(i),Math.cos(i*.7),Math.sin(i*.3)).normalize(),before=v.length();v.applyMatrix4(a);assert.ok(v.length()<=before*bound);}
 assert.throws(()=>cadConstructionStretch(Array(16).fill(NaN)));assert.throws(()=>cadConstructionStretch(Array(16).fill(0)));
});
