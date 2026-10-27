import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {BoxGeometry,SphereGeometry} from 'three';
import init from '../cad-kernel-build/runtime/formnaro_cad.js';
import {inspectStlMesh} from '../src/cad-stl-surfaces.js';
import {stlVertexFans,buildStlFacetedCad} from '../src/cad-stl-faceted.js';
import {cadEdgeDisplayNative} from '../src/cad-edge-display-native.js';
import {readCadBrep,brepHasNoTriangulation} from '../src/cad-native-kernel.js';
import {exportCadStep,importCadStep} from '../src/cad-step-io.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../cad-kernel-build/runtime/formnaro_cad.wasm',import.meta.url)),print:()=>{},printErr:()=>{}});
const mesh=g=>{try{return {verts:Array.from(g.attributes.position.array),triangles:Array.from(g.index.array)};}finally{g.dispose();}};
test('Coincident points retain distinct surface fans; no coordinate displacement is needed',()=>{
 const faces=[[0,1,2],[0,3,1],[0,2,3],[1,3,2],[0,4,5],[0,6,4],[0,5,6],[4,6,5]].map(indices=>({indices})),edges=new Map();faces.forEach((face,i)=>face.indices.forEach((a,k)=>{const b=face.indices[(k+1)%3],key=a<b?a+':'+b:b+':'+a;if(!edges.has(key))edges.set(key,{a:Math.min(a,b),b:Math.max(a,b),faces:[]});edges.get(key).faces.push(i);}));
 const fans=stlVertexFans({faces,edges,points:Array(7)});assert.equal(fans.count,8);assert.equal(fans.splitVertices,1);assert.notEqual(fans.corners[0],fans.corners[12]);assert.equal(fans.corners[0],fans.corners[3]);
});
test('Explicit shared native topology produces exact planar CAD and a valid STEP roundtrip',()=>{
 const definition=inspectStlMesh(mesh(new BoxGeometry(17,23,1.5))),before=structuredClone(definition),result=buildStlFacetedCad(oc,definition),shape=readCadBrep(oc,result.brep.data);try{const read=importCadStep(oc,exportCadStep(oc,[{shape,name:'Planar fixture'}]));assert.ok(Math.abs(result.stats.volume-17*23*1.5)<1e-5);assert.ok(Math.abs(read.stats.volume/result.stats.volume-1)<1e-8);assert.ok(brepHasNoTriangulation(result.brep.data));assert.equal(result.quality.curvedPatches,0);assert.deepEqual(definition,before);}finally{shape.delete();}
});
test('Dense rounded STL with more than 8000 native edges remains selectable',()=>{
 const definition=inspectStlMesh(mesh(new SphereGeometry(10,64,48))),result=buildStlFacetedCad(oc,definition),node={id:'dense-rounded',kind:'cad',source:'step',solid:true,transform:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],...result},display=cadEdgeDisplayNative(oc,node,{revision:'dense-roundtrip'});assert.ok(display.edges.length>8000);assert.ok(display.edges.every(e=>e.reference.anchor.edgeDomain?.triangulation===false));assert.ok(Math.abs(result.stats.volume/definition.volume-1)<1e-7);
});
