import test from 'node:test';
import assert from 'node:assert/strict';
import {sketchCircleFromThreePoints} from '../src/sketch-three-point-circle.js';

const close=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);

test('Three points on a diameter return center [0,0] and radius 5 in either orientation',()=>{
 for(const [start,through,end] of [
  [[5,0],[0,5],[-5,0]],
  [[-5,0],[0,5],[5,0]],
  [[5,0],[0,-5],[-5,0]],
 ]){
  const circle=sketchCircleFromThreePoints(start,through,end);
  assert.deepEqual(Object.keys(circle).sort(),['center','radius']);
  close(circle.center[0],0);
  close(circle.center[1],0);
  close(circle.radius,5);
 }
});

test('An off-origin circle keeps its analytic center and radius',()=>{
 const circle=sketchCircleFromThreePoints([3,4],[4,3],[5,4]);
 close(circle.center[0],4);
 close(circle.center[1],4);
 close(circle.radius,1);
 for(const point of [[3,4],[4,3],[5,4]])close(distance(circle.center,point),circle.radius);
});

test('Malformed and non-finite points are rejected',()=>{
 for(const points of [
  [[NaN,0],[0,5],[-5,0]],
  [[0,0],[Infinity,0],[5,5]],
  [[0,0],[0,-Infinity],[-5,0]],
  [null,[0,5],[-5,0]],
  [[0],[0,5],[-5,0]],
  [[0,0,0],[0,5],[-5,0]],
  [['0',0],[0,5],[-5,0]],
 ])assert.throws(()=>sketchCircleFromThreePoints(...points),/endlichen Zahlen/);
});

test('Duplicate and nearly coincident points are rejected',()=>{
 for(const points of [
  [[0,0],[0,0],[5,1]],
  [[0,0],[0,5],[0,0]],
  [[0,0],[0,5e-8],[5,1]],
  [[0,5e-8],[0,0],[5,1]],
 ])assert.throws(()=>sketchCircleFromThreePoints(...points),/drei verschiedene Punkte/);
});

test('Nearly straight points are rejected with a clear gap to a valid shallow arc',()=>{
 // Same endpoints and middle x, sagitta 1e-7 versus 1e-3: a 10000-fold gap.
 assert.throws(()=>sketchCircleFromThreePoints([-5,0],[0,0],[5,0]),/geradlinig/);
 assert.throws(()=>sketchCircleFromThreePoints([-5,0],[0,1e-7],[5,0]),/geradlinig/);
 const circle=sketchCircleFromThreePoints([-5,0],[0,1e-3],[5,0]);
 close(circle.center[0],0);
 close(circle.radius,25/(2*1e-3)+1e-3/2,1e-6);
 assert.ok(Number.isFinite(circle.center[1]));
 for(const point of [[-5,0],[0,1e-3],[5,0]])close(distance(circle.center,point),circle.radius,1e-6);
});
