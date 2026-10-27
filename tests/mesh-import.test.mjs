import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readImportStl,prepareImportStl,compactImportPositions,simplifyImportMesh,inspectImportTopology} from '../src/mesh-import-core.js';
import {prepareMeshImport} from '../src/mesh-import-client.js';
import {denseDrilledMesh} from './fixtures/mesh-reduce-fixtures.mjs';

export function binary(positions){const buffer=new ArrayBuffer(84+positions.length/9*50),view=new DataView(buffer);view.setUint32(80,positions.length/9,true);for(let i=0;i<positions.length;i++)view.setFloat32(84+Math.floor(i/9)*50+12+(i%9)*4,positions[i],true);return buffer;}
function box(segments=1){const g=new THREE.BoxGeometry(20,18,12,segments,segments,segments).toNonIndexed();try{return new Float32Array(g.getAttribute('position').array);}finally{g.dispose();}}
function positions(mesh){const out=[];for(const i of mesh.triangles)out.push(...mesh.verts.slice(i*3,i*3+3));return out;}

test('broken but readable STL remains open and loadable; no invented cap, points or component removal',async()=>{
 const p=box(),input=binary(p.slice(9)),bytes=new Uint8Array(input).slice(),r=await prepareImportStl(input);assert.equal(r.report.outputTriangles,11);assert.equal(r.report.topology.boundary,3);assert.equal(r.report.topology.solidProven,false);assert.equal(r.report.topology.selfIntersections,'not-checked');assert.deepEqual(new Uint8Array(input),bytes);assert(r.report.warnings.length);assert.equal(r.report.simplification.changed,false);
});
test('safe cleanup removes exact duplicate and degenerate faces, fixes winding and keeps the original bounds',async()=>{
 const p=box(),broken=Array.from(p);broken.splice(0,9,...p.slice(0,3),...p.slice(6,9),...p.slice(3,6));broken.push(...p.slice(9,18),0,0,0,0,0,0,0,0,0);const r=await prepareImportStl(binary(broken));assert.equal(r.report.repair.removedDuplicates,1);assert.equal(r.report.repair.removedDegenerate,1);assert(r.report.repair.flippedFaces>=1);assert.equal(r.report.topology.boundary,0);assert.equal(r.report.topology.orientation,0);assert.equal(r.mesh.triangles.length/3,12);assert.deepEqual(r.report.topology.bounds,{min:[-10,-9,-6],max:[10,9,6]});
});
test('cleanup can be disabled and intentional openings stay open',async()=>{
 const p=box(),input=Array.from(p.slice(9));input.push(...p.slice(9,18));const r=await prepareImportStl(binary(input),{repair:false});assert.equal(r.report.repair.status,'disabled');assert.equal(r.report.outputTriangles,12);assert(r.report.topology.nonmanifold>0);
});
test('ASCII and binary units, malformed lengths, NaN coordinates and pre-abort are handled before mutation',async()=>{
 const text='solid x\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid x',r=await prepareImportStl(new TextEncoder().encode(text).buffer,{unit:25.4});assert.equal(r.report.encoding,'ascii');assert(Math.abs(r.mesh.verts[3]-25.4)<1e-5);assert.throws(()=>readImportStl(binary(box()).slice(0,-1)));const bad=box();bad[0]=NaN;assert.throws(()=>readImportStl(binary(bad)));assert.throws(()=>readImportStl(binary(box()),{unit:2}));const abort=new AbortController();abort.abort();await assert.rejects(prepareImportStl(binary(box()),{signal:abort.signal}),{name:'AbortError'});
});
test('exact welding retains merely nearby distinct positions',async()=>{const p=new Float32Array([0,0,0,1e-7,0,0,0,1,0,0,0,0,0,1,0,0,0,1]),r=await compactImportPositions(p);assert.equal(r.verts.length/3,4);assert.equal(r.triangles[0],r.triangles[3]);assert.notEqual(r.triangles[0],r.triangles[1]);});
test('controlled reduction preserves drilled hole topology and actual source coordinate positions',async()=>{
 const original=await denseDrilledMesh(6),mesh=await compactImportPositions(new Float32Array(positions(original))),before=inspectImportTopology(mesh),r=await simplifyImportMesh(mesh,{targetTriangles:200,maxError:0}),after=inspectImportTopology(r.mesh);assert(r.report.changed);assert.equal(after.euler,before.euler);assert.equal(after.components,before.components);assert.equal(after.boundary,0);assert.equal(after.orientation,0);assert.deepEqual(after.bounds,before.bounds);
 // Float32/QEM numerical allowance; a zero algorithm estimate is NOT an exact
 // surface-distance proof. The physical bore rim is checked separately below.
 assert(Math.abs(after.volume/before.volume-1)<1e-6);
 const source=new Set(Array.from({length:mesh.verts.length/3},(_,i)=>Array.from(mesh.verts.slice(i*3,i*3+3)).join(','))),output=new Set(Array.from({length:r.mesh.verts.length/3},(_,i)=>Array.from(r.mesh.verts.slice(i*3,i*3+3)).join(',')));
 for(let i=0;i<r.mesh.verts.length;i+=3)assert(source.has(Array.from(r.mesh.verts.slice(i,i+3)).join(',')));
 let rim=0;for(let i=0;i<mesh.verts.length;i+=3){const [x,y,z]=mesh.verts.slice(i,i+3);if((z===0||z===12)&&Math.abs(Math.hypot(x,y)-3)<1e-5){assert(output.has(Array.from(mesh.verts.slice(i,i+3)).join(',')));rim++;}}assert(rim>=96);assert.equal(r.report.errorIsGlobalDistanceProof,false);assert.equal(r.report.targetReached,false);
});
test('open boundaries stay exact during reduction; unsafe input and invalid error settings are rejected',async()=>{
 const g=new THREE.PlaneGeometry(20,20,20,20).toNonIndexed(),m=await compactImportPositions(g.getAttribute('position').array);g.dispose();const r=await simplifyImportMesh(m,{targetTriangles:100,maxError:.01});assert.equal(r.report.before.boundary,r.report.after.boundary);assert.equal(r.report.after.boundary,80);await assert.rejects(simplifyImportMesh(m,{maxError:-1}));const bad=structuredClone(m);bad.triangles[1]=bad.triangles[0];await assert.rejects(simplifyImportMesh(bad),{code:'MESH_IMPORT_SIMPLIFY_UNSAFE'});
});
test('worker cancellation terminates parsing and ignores stale replies without publishing partial geometry',async()=>{
 const abort=new AbortController(),fake={terminate(){this.terminated=true;},postMessage(){}};let progress=0;const p=prepareMeshImport(new ArrayBuffer(84),{}, {signal:abort.signal,createWorker:()=>fake,onProgress:()=>progress++});abort.abort();await assert.rejects(p,{name:'AbortError'});assert(fake.terminated);fake.onmessage({data:{type:'result',result:{}}});fake.onmessage({data:{type:'progress',message:'late'}});assert.equal(progress,0);
});
test('large binary import over old 50MB limit reduces in a bounded working copy with exact extents',async()=>{
 const p=box(300),input=binary(p);assert(input.byteLength>50*1024*1024);const started=performance.now(),r=await prepareImportStl(input);assert.equal(r.report.inputTriangles,1080000);assert(r.report.simplification.changed);assert(r.report.outputTriangles<=500000);assert.equal(r.report.topology.boundary,0);assert.equal(r.report.topology.euler,2);assert.deepEqual(r.report.topology.bounds,{min:[-10,-9,-6],max:[10,9,6]});assert(Math.abs(r.report.topology.volume-4320)<1e-3);assert.equal(r.report.originalFileChanged,false);assert(JSON.stringify(r.report).length<4000);console.log(JSON.stringify({inputTriangles:r.report.inputTriangles,outputTriangles:r.report.outputTriangles,elapsedMs:performance.now()-started}));
});
