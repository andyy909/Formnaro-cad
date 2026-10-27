import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {BoxGeometry,CylinderGeometry,Matrix4} from 'three';
import init from '../cad-kernel-build/runtime/formnaro_cad.js';
import {inspectStlMesh,reconstructStlPatches,stlPatchValue,stlPatchTensor,buildStlSurfaceCad} from '../src/cad-stl-surfaces.js';
import {validateStlReconstructionBytes,readStlReconstructionMesh} from '../src/cad-stl-input.js';
import {readCadBrep,brepHasNoTriangulation,cadExportMesh} from '../src/cad-native-kernel.js';
import {exportCadStep,importCadStep} from '../src/cad-step-io.js';
import {createCadService} from '../src/cad-service.js';
import {createCadProject} from '../src/cad-project.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../cad-kernel-build/runtime/formnaro_cad.wasm',import.meta.url)),print:()=>{},printErr:()=>{}});
function mesh(geometry){try{return {verts:Array.from(geometry.attributes.position.array),triangles:geometry.index?Array.from(geometry.index.array):Array.from({length:geometry.attributes.position.count},(_,i)=>i)};}finally{geometry.dispose();}}
const close=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);

test('Planar thin housings reconstruct as exact native planes, not a guessed minimum-10-mm box',()=>{
 const input=mesh(new BoxGeometry(28,26,1.2)),definition=reconstructStlPatches(input);assert.equal(definition.quality.curvedPatches,0);const result=buildStlSurfaceCad(oc,definition);close(result.stats.volume,28*26*1.2,1e-4);assert.ok(brepHasNoTriangulation(result.brep.data));assert.ok(result.brep.data.length<10000);assert.ok(result.quality.nativeTolerance<1e-5);
});
test('Curved reconstruction bounds every Bernstein coefficient and preserves native STEP geometry',()=>{
 const definition=reconstructStlPatches(mesh(new CylinderGeometry(4,4,8,24,1,false)));assert.ok(definition.quality.curvedPatches>0);assert.ok(definition.quality.surfaceBound<=.04002);assert.ok(definition.quality.criticalBound<=.08004);
 for(const patch of definition.patches){const [a,b,c]=patch.controls;for(const [s,t]of [[.13,.27],[.78,.23],[.32,.88]]){const p=stlPatchValue(patch.controls,s,t),linear=a.map((v,k)=>v*(1-s)*(1-t)+b[k]*s*(1-t)+c[k]*t);assert.ok(Math.hypot(...p.map((v,k)=>v-linear[k]))<=definition.quality.surfaceBound);}}
 const result=buildStlSurfaceCad(oc,definition),shape=readCadBrep(oc,result.brep.data);try{const step=exportCadStep(oc,[{shape,name:'Synthetic bounded cylinder'}]),read=importCadStep(oc,step);close(read.stats.volume,result.stats.volume,1e-5);assert.ok(cadExportMesh(oc,shape,{deflection:.02,angleDegrees:8}).triangles.length>0);}finally{shape.delete();}
});
test('Triangular polynomial to tensor B-spline conversion is exact at independent parameters',()=>{
 const patch=reconstructStlPatches(mesh(new CylinderGeometry(3,3,4,16))).patches.find(p=>!p.linear),tensor=stlPatchTensor(patch.controls),basis=t=>[(1-t)**3,3*t*(1-t)**2,3*t*t*(1-t),t**3];
 for(const [s,t]of [[.11,.71],[.42,.23],[.91,.82],[0,1],[1,0]]){const u=basis(s),v=basis(t),p=[0,0,0];for(let i=0;i<4;i++)for(let j=0;j<4;j++)for(let k=0;k<3;k++)p[k]+=u[i]*v[j]*tensor[i][j][k];const direct=stlPatchValue(patch.controls,s,t);direct.forEach((x,k)=>close(x,p[k],1e-12));}
});
test('Arbitrary placement, rotation, mirror and globally reversed orientation preserve a closed housing',()=>{
 const geometry=new BoxGeometry(15,21,2.5);geometry.applyMatrix4(new Matrix4().makeRotationX(.71).premultiply(new Matrix4().makeScale(-1.3,1,1)).premultiply(new Matrix4().makeTranslation(110,-73,19)));const input=mesh(geometry);let definition=inspectStlMesh(input);close(definition.volume,15*21*2.5*1.3,.001);const result=buildStlSurfaceCad(oc,reconstructStlPatches(input));assert.equal(result.stats.solids,1);
 for(let i=0;i<input.triangles.length;i+=3)[input.triangles[i+1],input.triangles[i+2]]=[input.triangles[i+2],input.triangles[i+1]];close(inspectStlMesh(input).volume,definition.volume,1e-5);
});
test('Open, contradictory, degenerate and excessive inputs have distinct safe rejection codes',()=>{
 const original=mesh(new BoxGeometry(10,10,10)),open=structuredClone(original);open.triangles.splice(-3);assert.throws(()=>inspectStlMesh(open),e=>e.code==='STL_INVALID');
 const wrong=structuredClone(original);[wrong.triangles[0],wrong.triangles[1]]=[wrong.triangles[1],wrong.triangles[0]];assert.throws(()=>inspectStlMesh(wrong),e=>e.code==='STL_INVALID');
 const zero=structuredClone(original);zero.triangles[0]=zero.triangles[1];assert.throws(()=>inspectStlMesh(zero),e=>e.code==='STL_INVALID');
 const large=new Uint8Array(84+40001*50);new DataView(large.buffer).setUint32(80,40001,true);assert.throws(()=>validateStlReconstructionBytes(large),e=>e.code==='STL_LIMIT');assert.throws(()=>validateStlReconstructionBytes(new Uint8Array([1,2,3])),e=>e.code==='STL_INVALID');
 const definition=reconstructStlPatches(original);definition.quality.surfaceBound=.251;assert.throws(()=>buildStlSurfaceCad(oc,definition),e=>e.code==='STL_QUALITY');
});
test('ASCII CAD import preserves double coordinates at large offsets and rejects incomplete facets',()=>{
 const text='solid double\nfacet normal 0 0 1\nouter loop\nvertex 98765.123456789 0 0\nvertex 98766.123456789 0 0\nvertex 98765.123456789 1 0\nendloop\nendfacet\nendsolid double',input=readStlReconstructionMesh(new TextEncoder().encode(text));assert.equal(input.verts[0],98765.123456789);assert.notEqual(input.verts[0],Math.fround(input.verts[0]));assert.throws(()=>readStlReconstructionMesh(new TextEncoder().encode(text.replace('vertex 98765.123456789 1 0\n',''))),e=>e.code==='STL_INVALID');
});
test('Closed volume is translation independent even for tiny parts near the working-area limit',()=>{
 const base=mesh(new BoxGeometry(.02,.03,.04)),moved=structuredClone(base);for(let i=0;i<moved.verts.length;i++)moved.verts[i]+=[98765,87654,76543][i%3];close(inspectStlMesh(moved).volume,inspectStlMesh(base).volume,1e-13);
});
test('Reopening a curved imported body preserves source BRep bytes while independently checking its statistics',async()=>{
 const geometry=new CylinderGeometry(4,4,8,24);geometry.applyMatrix4(new Matrix4().makeRotationX(.37).premultiply(new Matrix4().makeRotationZ(.29)));
 const service=createCadService({oc});try{const node=service.stlHousingNode(mesh(geometry),{id:'curved-source'}),project=createCadProject();project.nodes.push(node);const original=node.brep.data,volume=node.stats.volume;node.stats.volume=volume*2;
 const rebuilt=await service.rebuild(project);assert.equal(rebuilt.nodes[0].brep.data,original);close(rebuilt.nodes[0].stats.volume,volume,1e-5);assert.notEqual(rebuilt.nodes[0].stats.volume,node.stats.volume);
 }finally{service.dispose();}
});
