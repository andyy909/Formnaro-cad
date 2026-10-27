import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'manifold-3d/manifold';
import {setKernel,SHAPES,makeNode,localManifold,worldManifold,booleanManifold,groupNodes,meshData,normalizeMesh,stlBinary,validNode} from '../src/geometry.js';
const kernel=await Module({wasmBinary:fs.readFileSync(new URL('../node_modules/manifold-3d/manifold.wasm',import.meta.url))});kernel.setup();setKernel(kernel);
const close=(a,b,tolerance=1e-4)=>assert.ok(Math.abs(a-b)<tolerance,`${a} vs ${b}`);
test('Every built-in solid is closed, nonempty and normalized to requested dimensions',()=>{
  for(const [type]of SHAPES.filter(s=>s[0]!=='text')){const n=makeNode(type),m=worldManifold(n);try{assert.equal(m.status(),'NoError',type);assert.ok(m.volume()>0,type);const b=m.boundingBox();b.min.forEach((v,i)=>close(b.max[i]-v,n.size[i],.001));}finally{m.delete();}}
});
test('A through hole removes the expected physical volume, survives group JSON roundtrip and remains reversible',()=>{
  const box=makeNode('box',[0,0,5],{size:[30,20,10]}),hole=makeNode('box',[0,0,5],{size:[6,4,15],solid:false});
  const group=groupNodes([box,hole]);assert.equal(group.children.length,2);assert.ok(validNode(group));
  const restored=JSON.parse(JSON.stringify(group)),m=worldManifold(restored);try{close(m.volume(),6000-240);const b=m.boundingBox();close(b.min[2],0);close(b.max[2],10);}finally{m.delete();}
  assert.ok(restored.children.some(n=>!n.solid));
});
test('Union removes overlap; intersection retains only overlapping material',()=>{
  const a=makeNode('box',[0,0,0],{size:[10,10,10]}),b=makeNode('box',[5,0,0],{size:[10,10,10]});
  const union=booleanManifold([a,b]),intersection=booleanManifold([a,b],'intersection');try{close(union.volume(),1500);close(intersection.volume(),500);}finally{union.delete();intersection.delete();}
});
test('Rotating and mirroring retains volume and changes world bounds accurately',()=>{
  const n=makeNode('box',[12,-8,5],{size:[30,10,4],rot:[0,0,90],mirror:[-1,1,1]});const m=worldManifold(n);try{close(m.volume(),1200);const b=m.boundingBox();close(b.max[0]-b.min[0],10);close(b.max[1]-b.min[1],30);close(b.min[2],3);}finally{m.delete();}
});
test('Binary STL encodes finite coordinates and reimports with identical volume',()=>{
  const n=makeNode('cylinder',[0,0,5],{size:[20,20,10]}),m=worldManifold(n);try{const buffer=stlBinary(m),view=new DataView(buffer),count=view.getUint32(80,true);assert.equal(buffer.byteLength,84+count*50);assert.equal(count,m.numTri());const verts=[],triangles=[];for(let t=0;t<count;t++)for(let i=0;i<3;i++){triangles.push(verts.length/3);for(let axis=0;axis<3;axis++){const v=view.getFloat32(84+t*50+12+i*12+axis*4,true);assert.ok(Number.isFinite(v));verts.push(v);}}const data=normalizeMesh({verts,triangles}),restored=worldManifold(makeNode('import',[0,0,5],{mesh:data.mesh,size:data.size}));try{close(restored.volume(),m.volume(),.01);}finally{restored.delete();}}finally{m.delete();}
});
test('Open triangle meshes and invalid projects are rejected',()=>{
  assert.throws(()=>normalizeMesh({verts:[0,0,0,1,0,0,0,1,0],triangles:[0,1,2]}));
  assert.equal(validNode({...makeNode('box'),size:[-1,1,1]}),false);
  assert.equal(validNode({...makeNode('box'),pos:[NaN,0,0]}),false);
  assert.equal(validNode({...makeNode('box'),mesh:{verts:[0,0,0],triangles:[0,1,2]}}),false);
});
test('An all-hole or disjoint intersection cannot create a bogus group',()=>{
  const hole=makeNode('box',undefined,{solid:false});assert.throws(()=>groupNodes([hole]));
  assert.throws(()=>groupNodes([makeNode('box',[0,0,0]),makeNode('box',[100,0,0])],'intersection'));
});
