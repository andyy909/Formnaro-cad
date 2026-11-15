import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,SCHEMAS,validParameters} from '../src/parameters.js';
import {cadThreadDefinition,screwSurfacePoint,screwSections,screwSurfaceDefinition} from '../src/cad-screw-surfaces.js';

test('thread and nut length accept the real 548 mm shaft and the 3000 mm boundary',()=>{
 for(const type of ['thread','nut']){
  assert.equal(SCHEMAS[type].find(field=>field.key==='length').max,3000);
  for(const length of [300,548,3000]){
   const params={...defaults(type),profile:'trapezoid',diameter:16,pitch:4,length,leadIn:0,outerDiameter:24};
   assert.equal(validParameters({type,params}),true);
   assert.equal(cadThreadDefinition(params).p.length,length);
  }
  for(const length of [3000.01,Infinity,NaN])assert.equal(validParameters({type,params:{...defaults(type),length}}),false);
 }
 // Unrelated diameter and countersink limits are not length permissions.
 assert.equal(SCHEMAS.thread.find(field=>field.key==='diameter').max,300);
 assert.equal(SCHEMAS.countersink.find(field=>field.key==='length').max,300);
});

test('long thread sweeps preserve pitch and phase beyond the former 240-turn ceiling',()=>{
 const tau=2*Math.PI;
 for(const pitch of [.2,4])for(const hand of ['left','right']){
  const thetaStart=-tau,thetaEnd=(3000/pitch+1)*tau;
  const options={pitch,hand,thetaStart,thetaEnd};
  const last=screwSurfacePoint([[6,0],[8,0]],0,thetaEnd,options);
  assert.ok(Math.abs(last[2]-(hand==='left'?-1:1)*(3000+pitch))<1e-8);
  const sections=screwSections(thetaStart,thetaEnd);
  assert.equal(sections[0].thetaStart,thetaStart);
  assert.equal(sections.at(-1).thetaEnd,thetaEnd);
  for(let i=0;i<sections.length;i++){
   assert.ok(sections[i].thetaEnd-sections[i].thetaStart<=8*tau+1e-8);
   if(i)assert.equal(sections[i-1].thetaEnd,sections[i].thetaStart);
  }
  // Verify the distant end still uses the same bounded surface approximation.
  const definition=screwSurfaceDefinition([[6,0],[8,0]],{...options,...sections.at(-1)});
  assert.ok(definition.interpolationBound<=definition.tolerance/2);
 }
});
