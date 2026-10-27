import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d/manifold';
import {makeNode,setKernel,groupNodes,worldManifold,fromMesh} from '../src/geometry.js';
import {coloredParts,threeMF,gltf,svgProjection} from '../src/exports.js';
import {formula,instantiateTemplate,validateTemplate} from '../src/templates.js';
import {migrateProject} from '../src/project-data.js';
import {unzipSync,strFromU8} from 'fflate';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const module=await Module();module.setup();setKernel(module);
test('Colored CSG parts preserve holes, disjoint ownership and affine group transforms',()=>{
 const a=makeNode('box',[0,0,10],{color:'#ff0000',size:[20,20,20]}),b=makeNode('box',[15,0,10],{color:'#0000ff',size:[20,20,20]}),hole=makeNode('cylinder',[0,0,10],{solid:false,size:[5,5,30]});const g=groupNodes([a,b,hole]);g.multicolor=true;g.size=g.size.map((v,i)=>v*[1.7,.8,1.2][i]);g.rot=[15,20,35];g.mirror=[-1,1,1];g.pos=[23,-12,30];
 const parts=coloredParts(g);assert.equal(parts.length,2);const final=worldManifold(g),solids=parts.map(p=>fromMesh(p.data));try{assert.ok(Math.abs(solids.reduce((n,m)=>n+m.volume(),0)-final.volume())<.05);const overlap=solids[0].intersect(solids[1]);try{assert.ok(overlap.volume()<1e-5);}finally{overlap.delete();}const union=module.Manifold.union(solids),missing=union.subtract(final),extra=final.subtract(union);try{assert.ok(missing.volume()+extra.volume()<.05);}finally{union.delete();missing.delete();extra.delete();}}finally{final.delete();solids.forEach(m=>m.delete());}
});
test('3MF resources include separate named materials and valid references; glTF uses metres',()=>{
 const n=makeNode('box',[10,0,10],{name:'A < B & "Test"',color:'#ff0000'}),parts=coloredParts(n),archive=unzipSync(threeMF(parts)),xml=strFromU8(archive['3D/3dmodel.model']);assert.match(xml,/<basematerials id="1">/);assert.match(xml,/displaycolor="#FF0000FF"/);assert.match(xml,/objectid="2"/);assert.match(xml,/A &lt; B &amp; &quot;Test&quot;/);const doc=JSON.parse(gltf(parts));assert.equal(doc.asset.version,'2.0');assert.deepEqual(doc.accessors[0].min.map(v=>Math.round(v*1000)),[0,-10,0]);assert.deepEqual(doc.accessors[0].max.map(v=>Math.round(v*1000)),[20,10,20]);assert.equal(doc.buffers[0].byteLength,Buffer.from(doc.buffers[0].uri.split(',')[1],'base64').length);
 const m=worldManifold(n);try{assert.match(svgProjection(m),/width="20mm"/);}finally{m.delete();}
});
test('Formula parser supports precedence, unary and linked controls while rejecting code and invalid arithmetic',()=>{
 assert.equal(formula('(width - 2 * wall) / 2',{width:60,wall:2}),28);assert.equal(formula('-2 + 3 * (4+1)',{}),13);for(const text of ['1/0','process.exit()','width.constructor','foo(1)','1e9','2**3','1 2'])assert.throws(()=>formula(text,{width:10}));
 const n=makeNode('box'),t={name:'Gehäuse',nodes:[n],controls:[{name:'breite',value:30}],bindings:[{index:0,path:[],field:'size.0',formula:'breite-2'}]};assert.equal(instantiateTemplate(t,{breite:50})[0].size[0],48);assert.equal(n.size[0],20);assert.throws(()=>instantiateTemplate(t,{breite:1}));assert.throws(()=>validateTemplate({...t,controls:[{name:'a',value:1},{name:'a',value:2}]}));
});
test('Old long project names are repaired without losing nodes or settings',()=>{
 const n=makeNode('box'),s=migrateProject({version:1,nodes:[n],name:'x'.repeat(201),bed:[200,200],planeZ:12});assert.equal(s.name.length,200);assert.equal(s.nodes[0].id,n.id);assert.equal(s.workplane.origin[2],12);
});
test('Exported 3MF meshes can be reconstructed and GLTF loads through an independent Three.js loader',async()=>{
 const a=makeNode('box',[-10,0,10],{color:'#ff0000'}),b=makeNode('box',[15,0,10],{color:'#0000ff'}),parts=[...coloredParts(a),...coloredParts(b)],xml=strFromU8(unzipSync(threeMF(parts))['3D/3dmodel.model']);let volume=0;
 for(const block of xml.matchAll(/<object [^>]+>(.*?)<\/object>/gs)){const verts=[...block[1].matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)].flatMap(v=>v.slice(1).map(Number)),triangles=[...block[1].matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g)].flatMap(v=>v.slice(1).map(Number));const m=fromMesh({verts,triangles});try{volume+=m.volume();}finally{m.delete();}}
 assert.ok(Math.abs(volume-16000)<.01);
 globalThis.ProgressEvent??=class{constructor(type,values){this.type=type;Object.assign(this,values);}};
 const loaded=await new GLTFLoader().parseAsync(gltf(parts),'');assert.equal(loaded.scene.children.length,2);assert.equal(loaded.scene.children[0].geometry.getAttribute('position').count,parts[0].data.verts.length/3);assert.ok(loaded.scene.children[0].material.color.r>.99);
});
