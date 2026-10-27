import test from 'node:test';
import assert from 'node:assert/strict';
import {Euler,Matrix4,Quaternion,Vector3} from 'three';
import {moveDimensionLines} from '../src/cad-move-dimensions.js';
import {cadIdentity,cadPoint,inverseCadMatrix} from '../src/cad-affine.js';

const bounds={min:[10,20,30],max:[40,44,48]},near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('signed movement from start stays separate from dimensions, height and absolute position',()=>{
 const input={bounds,planeMatrix:cadIdentity(),delta:[20,-10,7],gap:4},before=JSON.stringify(input),rows=moveDimensionLines(input);
 assert.deepEqual(rows.map(r=>r.value),[20,-10]);
 assert.deepEqual(rows[0].start,[10,6,0]);assert.deepEqual(rows[0].end,[30,6,0]);
 assert.deepEqual(rows[1].start,[6,20,0]);assert.deepEqual(rows[1].end,[6,10,0]);
 assert.equal(JSON.stringify(input),before);
});
test('all movement quadrants, unchanged axes and submillimetre values have exterior lanes',()=>{
 for(const delta of [[-20,10,0],[-20,-10,0],[20,10,0],[0,10,0],[10,0,0],[0,0,0],[.125,-.25,0]]){
  const rows=moveDimensionLines({bounds,planeMatrix:cadIdentity(),delta,gap:3});assert.deepEqual(rows.map(r=>r.value),delta.slice(0,2));
  rows.forEach((r,k)=>{near(r.end[k]-r.start[k],delta[k]);assert.ok(r.start[1-k]<Math.min(r.from[1-k],r.to[1-k]));for(const p of [r.start,r.end,r.from,r.to])near(p[2],0);});
 }
});
test('tilted and translated workplane measures its own axes and draws on its surface',()=>{
 const planeMatrix=new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromEuler(new Euler(.45,-.2,.6))).setPosition(65,-30,18).toArray();
 const vector=new Vector3(20,-10,0).applyQuaternion(new Quaternion().setFromRotationMatrix(new Matrix4().fromArray(planeMatrix))).toArray();
 const inverse=inverseCadMatrix(planeMatrix),rows=moveDimensionLines({bounds,planeMatrix,delta:vector,gap:3});
 rows.forEach((r,k)=>{near(r.value,[20,-10][k]);for(const p of [r.start,r.end,r.from,r.to])near(cadPoint(inverse,p)[2],0);});
});
