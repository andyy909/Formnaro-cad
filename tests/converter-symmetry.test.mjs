
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import Module from 'manifold-3d/manifold';
import {setKernel,stlBinary} from '../src/mesh-engine/geometry.js';
import {loadCadKernel} from '../src/cad-kernel-loader.js';
import {exportCadStep,importCadStep} from '../src/cad-step-io.js';
import {transformCad} from '../src/cad-native-kernel.js';
import {cadStlAscii} from '../src/cad-mesh-formats.js';
import {prepareStlSymmetry,finishStlSymmetry} from '../src/cad-stl-symmetry.js';

const meshKernel=await Module({wasmBinary:await fs.readFile(new URL('../node_modules/manifold-3d/manifold.wasm',import.meta.url))});
meshKernel.setup();setKernel(meshKernel);
const defaults={axis:1,side:1,plane:3,overlap:.7,unit:1,tolerance:.15};
const {Manifold}=meshKernel;

test('Verified off-origin reflection and overlap produce one STEP solid matching the whole original',async()=>{
 const box=Manifold.cube([10,8,6],true),source=box.translate([0,3,0]);
 try{
  const prepared=await prepareStlSymmetry(stlBinary(source),defaults);
  assert.equal(prepared.overlapMM,.7);
  assert(prepared.halfTriangles<=20000);
  const oc=await loadCadKernel({print:()=>{},printErr:()=>{}});
  const maker=new oc.BRepPrimAPI_MakeBox(10,4.35,6);
  const shape=maker.Shape(),half=transformCad(oc,shape,[1,0,0,0,0,1,0,0,0,0,1,0,-5,2.65,-3,1]);
  try{
   const result=finishStlSymmetry(oc,prepared,exportCadStep(oc,[{shape:half,name:'Half'}]));
   assert.equal(result.report.symmetry.plane_mm,3);
   assert.equal(result.report.solids,1);
   assert(result.report.deviation.seam_sampled_max_mm<.00001);
   assert(Math.abs(importCadStep(oc,result.bytes).stats.volume-480)<1e-5);
  }finally{half.delete();shape.delete();maker.delete();}
 }finally{source.delete();box.delete();}
});

test('A one-sided feature is rejected before a half can replace it',async()=>{
 const box=Manifold.cube([10,8,6],true),bump=Manifold.cube([2,2,2],true);
 const placed=bump.translate([0,4,0]),asymmetric=box.add(placed);
 try{
  await assert.rejects(prepareStlSymmetry(stlBinary(asymmetric),{...defaults,plane:0}),/unterscheiden sich/);
 }finally{asymmetric.delete();placed.delete();bump.delete();box.delete();}
});

test('Original coordinate precision must leave room in the symmetry tolerance',async()=>{
 const mesh={vertices:[90000.001,0,0,90001.001,0,0,90000.001,1,0],triangles:[0,1,2]};
 const bytes=new TextEncoder().encode(cadStlAscii([{name:'Far coordinates',mesh}]));
 await assert.rejects(prepareStlSymmetry(bytes.buffer,{...defaults,tolerance:.0001,overlap:.7}),/Koordinatengenauigkeit/);
});

test('Symmetry applies the original triangle budget during STL ingestion',async()=>{
 const bytes=new ArrayBuffer(84+40001*50);
 new DataView(bytes).setUint32(80,40001,true);
 await assert.rejects(prepareStlSymmetry(bytes,defaults),/40.000 Dreiecke/);
});
