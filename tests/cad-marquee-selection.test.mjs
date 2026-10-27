import test from 'node:test';
import assert from 'node:assert/strict';
import {marqueeIntersectsMesh as hit} from '../src/cad-marquee-selection.js';
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const rect={left:-.1,right:.1,bottom:-.1,top:.1};
test('partial contact, edge crossing and a window inside a face select the display',()=>{
  assert.equal(hit([-.8,-.8,0,.8,-.8,0,0,.8,0],null,identity,rect),true);
  assert.equal(hit([.1,0,0,.8,0,0,.8,.8,0],null,identity,rect),true);
  assert.equal(hit([-.8,0,0,.8,0,0,0,.8,0],null,identity,{...rect,bottom:-.01,top:.01}),true);
});
test('empty silhouette corners, gaps and clipped geometry do not select',()=>{
  assert.equal(hit([-.8,-.8,0,.8,-.8,0,-.8,.8,0],null,identity,{left:.3,right:.5,bottom:.3,top:.5}),false);
  const gap=[-.8,-.8,0,-.2,-.8,0,-.2,.8,0,.2,-.8,0,.8,-.8,0,.2,.8,0];
  assert.equal(hit(gap,null,identity,rect),false);
  assert.equal(hit([-.8,-.8,2,.8,-.8,2,0,.8,2],null,identity,rect),false);
  assert.equal(hit([-.8,-.8,-2,.8,-.8,-2,0,.8,-2],null,identity,rect),false);
});
test('indexed, affine and perspective displays support viewport clipping',()=>{
  const vertices=[-.8,-.8,0,.8,-.8,0,0,.8,0];
  assert.equal(hit(vertices,[0,1,2],identity,rect),true);
  assert.equal(hit(vertices,[0,1,2],identity.map((v,k)=>k===12?2:v),rect),false);
  const perspective=[1,0,0,0,0,1,0,0,0,0,-11/9,-1,0,0,-20/9,0];
  assert.equal(hit([-.5,-.5,-2,.5,-.5,-2,0,.5,-.5],null,perspective,rect),true);
  assert.equal(hit([-.5,-.5,2,.5,-.5,2,0,.5,2],null,perspective,rect),false);
});
