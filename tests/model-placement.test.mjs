import test from 'node:test';
import assert from 'node:assert/strict';
import {combinedPlacementBounds,modelPlacementDelta} from '../src/model-placement.js';
import {defaultLayout,validateLayout} from '../backend/layout-data.mjs';

test('Far positive and negative file coordinates land centered with their bottom on Z zero',()=>{
  for(const min of [[1800,-720,-350],[-8000,4000,250]]){
    const max=min.map((v,k)=>v+[40,18,70][k]),delta=modelPlacementDelta({min,max});
    assert.equal((min[0]+max[0])/2+delta[0],0);assert.equal((min[1]+max[1])/2+delta[1],0);assert.equal(min[2]+delta[2],0);
    assert.deepEqual(modelPlacementDelta({min,max},2).map((v,k)=>v-delta[k]),[30,30,0]);
  }
});
test('An assembly uses one common shift and keeps gaps and height differences',()=>{
  const a={min:[800,-500,-20],max:[820,-480,0]},b={min:[850,-530,10],max:[860,-490,15]},bounds=combinedPlacementBounds([a,b]),delta=modelPlacementDelta(bounds);
  assert.deepEqual(bounds,{min:[800,-530,-20],max:[860,-480,15]});assert.deepEqual(delta,[-830,505,20]);
  assert.equal(b.min[0]+delta[0]-(a.max[0]+delta[0]),30);assert.equal(b.min[2]+delta[2]-(a.max[2]+delta[2]),10);
});
test('Invalid, empty or infinite bounds fail before placement',()=>{
  assert.throws(()=>combinedPlacementBounds([]));
  for(const b of [null,{min:[0,0,0],max:[1,Infinity,1]},{min:[2,0,0],max:[1,1,1]},{min:[0,0],max:[1,1,1]}])assert.throws(()=>modelPlacementDelta(b));
  assert.throws(()=>modelPlacementDelta({min:[0,0,0],max:[1,1,1]},-1));
});
test('Existing named layouts gain Center once without moving saved controls',()=>{
  const old=defaultLayout();old.zones.toolbar=old.zones.toolbar.filter(k=>k!=='center');old.zones.header.reverse();
  const upgraded=validateLayout(old);assert.deepEqual(upgraded.zones.header,old.zones.header);
  assert.deepEqual(upgraded.zones.toolbar.filter(k=>k!=='center'),old.zones.toolbar);assert.equal(Object.values(upgraded.zones).flat().filter(k=>k==='center').length,1);
});
