import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCadKernel} from '../src/cad-kernel-loader.js';
import {buildCadThread} from '../src/cad-screw-surfaces.js';
import {cadRecipeBounds,assertCadRecipeTolerance} from '../src/cad-recipes.js';
import {cadNativeMemory,CAD_MEMORY_POLICY} from '../src/cad-native-memory.js';
import {validateCadSolid,writeCadBrep,brepHasNoTriangulation} from '../src/cad-native-kernel.js';
import {CAD_PROJECT_LIMITS} from '../src/cad-project.js';
import {createCadService} from '../src/cad-service.js';

test('Tr 16×4 over 548 mm with both chamfers stays one native solid below the CAD memory limit',async()=>{
  const oc=await loadCadKernel({print:()=>{},printErr:()=>{}});
  const shape=buildCadThread(oc,{profile:'trapezoid',diameter:16,pitch:4,length:548,leadIn:.5});
  try{
    const stats=validateCadSolid(oc,shape);
    assert.equal(stats.solids,1);
    cadRecipeBounds(oc,shape).size.forEach((v,i)=>assert.ok(Math.abs(v-[16,16,548][i])<1e-5));
    assert.ok(stats.volume>Math.PI*6**2*548&&stats.volume<Math.PI*8**2*548);
    assert.ok(assertCadRecipeTolerance(oc,shape,1e-4)<=5e-5);
    const brep=writeCadBrep(oc,shape);
    assert.ok(brepHasNoTriangulation(brep));
    assert.ok(Buffer.byteLength(brep)<=CAD_PROJECT_LIMITS.nativeThreadBrepBytes);
    assert.ok(cadNativeMemory(oc).state().peakReservedBytes<CAD_MEMORY_POLICY.stopBytes);
  }finally{shape.delete();}
});

test('rigid thread placement reuses verified solid properties and measures rotated bounds',async()=>{
  const oc=await loadCadKernel({print:()=>{},printErr:()=>{}});
  const service=createCadService({oc});
  const coldService=createCadService({oc});
  const angle=.67,cos=Math.cos(angle),sin=Math.sin(angle);
  const world=[cos,0,-sin,0,0,1,0,0,sin,0,cos,0,3,5,7,1];
  try{
    const thread=service.nativeNode({type:'thread',size:[16,16,16],params:{profile:'trapezoid',diameter:16,pitch:4,length:16}});
    const baseline=service.inspect(thread);
    const shifted=service.inspect(thread,[1,0,0,0,0,1,0,0,0,0,1,0,3,5,7,1]);
    assert.deepEqual(shifted.localBounds,baseline.localBounds);
    assert.deepEqual(shifted.worldBounds.center,baseline.localBounds.center.map((v,i)=>v+[3,5,7][i]));
    const forgedStats={...thread,stats:{...thread.stats,solids:42,volume:1}};
    const placement=service.inspect(forgedStats,world);
    // Comparing to a generic CAD source exercises the full native transformed
    // solid validation, independently of the rigid placement path.
    const reference=coldService.inspect({...thread,source:'step'},world);
    assert.equal(placement.solids,1);
    assert.ok(Math.abs(placement.volume-baseline.volume)<1e-9);
    assert.ok(Math.abs(placement.volume/reference.volume-1)<5e-8);
    for(const key of ['min','max'])placement.worldBounds[key].forEach((v,i)=>assert.ok(Math.abs(v-reference.worldBounds[key][i])<1e-6));
    const malformed={...thread,brep:{...thread.brep,data:'invalid BRep'}};
    assert.throws(()=>service.inspect(malformed,world));
    const scaled=[1,0,0,0,0,1,0,0,0,0,2,0,0,0,0,1];
    assert.ok(Math.abs(service.inspect(thread,scaled).volume/(baseline.volume*2)-1)<5e-8);
  }finally{service.dispose();coldService.dispose();}
});
