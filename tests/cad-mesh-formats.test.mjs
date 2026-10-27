import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {DOMParser} from '@xmldom/xmldom';
import {Box3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {MTLLoader} from 'three/addons/loaders/MTLLoader.js';
import {cadStlAscii,cadObjBundle,cadThreeMf,cadGltf} from '../src/cad-mesh-formats.js';
const origin=[100000.123456789,90000.543210987,80000.765432109],local=[0,0,0,1,0,0,0,1,0,0,0,1],vertices=local.map((v,k)=>v+origin[k%3]),triangles=[0,2,1,0,1,3,0,3,2,1,2,3];
const fixture=()=>[{name:'Teil & <A>',color:'#c13f24',opacity:.7,mesh:{vertices:[...vertices],triangles:[...triangles]}},{name:'Teil B',color:'#135ac1',opacity:1,mesh:{vertices:local.map((v,k)=>v+origin[k%3]+(k%3===0?4:0)),triangles:[...triangles]}}];
const close=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<=e,`${a} versus ${b}`);

test('ASCII STL and OBJ carry exact double coordinates and separate named materials',()=>{
  const parts=fixture(),stl=cadStlAscii(parts);assert.match(stl,new RegExp(String(origin[0]).replace('.','\\.')));const stlGeometry=new STLLoader().parse(stl);assert.equal(stlGeometry.getAttribute('position').count,24);stlGeometry.dispose();
  const archive=unzipSync(cadObjBundle(parts)),obj=strFromU8(archive['model.obj']),mtl=strFromU8(archive['model.mtl']);
  assert.match(obj,/mtllib model\.mtl/);const coords=obj.split('\n').filter(line=>line.startsWith('v ')).map(line=>line.slice(2).split(' ').map(Number)).flat();assert.deepEqual(coords,parts.flatMap(p=>p.mesh.vertices));
  const materials=new MTLLoader().parse(mtl,''),decoded=new OBJLoader().setMaterials(materials).parse(obj);assert.equal(decoded.children.length,2);assert.equal(decoded.children[0].name,parts[0].name);close(decoded.children[0].material.opacity,.7);decoded.children.forEach(child=>{child.geometry.dispose();child.material.dispose();});
});

test('3MF is a valid millimetre package with independent objects, XML escaping, alpha and exact coordinates',()=>{
  const parts=fixture(),archive=unzipSync(cadThreeMf(parts));assert.ok(archive['[Content_Types].xml']);assert.ok(archive['_rels/.rels']);
  const doc=new DOMParser().parseFromString(strFromU8(archive['3D/3dmodel.model']),'application/xml');assert.equal(doc.documentElement.getAttribute('unit'),'millimeter');assert.equal(doc.getElementsByTagName('object').length,2);assert.equal(doc.getElementsByTagName('item').length,2);
  const bases=doc.getElementsByTagName('base');assert.equal(bases[0].getAttribute('name'),parts[0].name);assert.equal(bases[0].getAttribute('displaycolor'),'#C13F24B3');
  const points=Array.from(doc.getElementsByTagName('vertex')).flatMap(p=>['x','y','z'].map(k=>Number(p.getAttribute(k))));assert.deepEqual(points,parts.flatMap(p=>p.mesh.vertices));assert.equal(doc.getElementsByTagName('triangle').length,8);
});

test('An independent GLTF loader reads centered meter buffers, world offsets, colors and opacity within budget',async()=>{
  const previous=globalThis.ProgressEvent;globalThis.ProgressEvent=class ProgressEvent{constructor(type,init){Object.assign(this,{type},init);}};
  try{
    const text=cadGltf(fixture(),{roundingBudget:.0001}),result=await new GLTFLoader().parseAsync(text,'');result.scene.updateMatrixWorld(true);assert.equal(result.scene.children.length,2);
    const bounds=new Box3().setFromObject(result.scene);close(bounds.min.x*1000,origin[0],.0001);close(bounds.max.x*1000,origin[0]+5,.0001);close(bounds.min.y*1000,origin[2],.0001);close(bounds.max.y*1000,origin[2]+1,.0001);close(bounds.min.z*1000,-origin[1]-1,.0001);close(bounds.max.z*1000,-origin[1],.0001);
    const a=result.scene.children[0];close(a.material.opacity,.7);assert.equal(a.material.transparent,true);result.scene.traverse(node=>{node.geometry?.dispose();node.material?.dispose();});
    assert.throws(()=>cadGltf([{...fixture()[0],mesh:{vertices:[0,0,0,10000.1234,0,0,0,10000.5678,0,0,0,10000.9012],triangles}}],{roundingBudget:1e-8}),/Exportgenauigkeit/);
  }finally{if(previous===undefined)delete globalThis.ProgressEvent;else globalThis.ProgressEvent=previous;}
});

test('Export encoders reject invalid indices and degenerate triangles',()=>{
  const broken=fixture();broken[0].mesh.triangles[0]=99;assert.throws(()=>cadThreeMf(broken),/Exportmesh/);const degenerate=fixture();degenerate[0].mesh.triangles[0]=degenerate[0].mesh.triangles[1];assert.throws(()=>cadStlAscii(degenerate),/degeneriertes/);
});
