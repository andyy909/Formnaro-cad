import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'manifold-3d/manifold';
import {makeNode,setKernel,worldManifold,normalizeMesh,fromMesh,stlBinary,objString,meshData} from '../src/geometry.js';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
const m=await Module();m.setup();setKernel(m);
let messages=[];globalThis.self={postMessage:d=>messages.push(d)};
await import('../src/analysis-worker.js');
const wasmUrl='data:application/wasm;base64,'+fs.readFileSync(new URL('../node_modules/manifold-3d/manifold.wasm',import.meta.url)).toString('base64');
async function inspect(nodes){messages=[];await self.onmessage({data:{job:'inspect',nodes,wasmUrl,threshold:1}});const d=messages.at(-1);assert.ok(!d.error,d.error);return d.result;}
const a=makeNode('box',[0,0,10]),b=makeNode('box',[10,0,10]);
const collision=await inspect([a,b]);assert.ok(Math.abs(collision.collisions[0].volume-4000)<.01);
b.pos[0]=20;assert.equal((await inspect([a,b])).collisions.length,0);
for(const width of [.8,1.2])for(const mirrored of [false,true]){const n=makeNode('box',[0,0,10],{size:[20,20,width],rot:[23,47,18],mirror:[mirrored?-1:1,1,1]});assert.equal((await inspect([n])).thin.length,width<1?1:0);}
const solid=worldManifold(makeNode('thread'));const exports={};
try{for(const format of ['stl','obj']){const geo=format==='stl'?new STLLoader().parse(stlBinary(solid)):new OBJLoader().parse(objString(solid)).children[0].geometry;const g=geo.index?geo.toNonIndexed():geo,v=Array.from(g.getAttribute('position').array),data=normalizeMesh({verts:v,triangles:Array.from({length:v.length/3},(_,i)=>i)}),roundtrip=fromMesh(data.mesh).scale(data.size);try{assert.ok(Math.abs(roundtrip.volume()-solid.volume())<.02);exports[format]={triangles:roundtrip.numTri(),volume:roundtrip.volume()};}finally{roundtrip.delete();g.dispose();}}}finally{solid.delete();}
fs.mkdirSync('work/v09',{recursive:true});fs.writeFileSync('work/v09/preflight.json',JSON.stringify({ok:true,collisionMm3:collision.collisions[0].volume,touching:true,rotatedMirroredWalls:true,exports},null,2));console.log('Zusätzliche Geometrie- und STL/OBJ-Rückimportprüfungen bestanden.');
