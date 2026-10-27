import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'manifold-3d/manifold';
import {createOperations} from '../src/operations.js';
import {createNode,emptyProject,encodeProject,decodeProject,History,SHAPES,renewIds} from '../src/model.js';
import {worldManifold} from '../src/engine/geometry.js';
let run;
before(async()=>{const kernel=await Module();kernel.setup();run=createOperations(kernel);});
function scene(nodes){return {...emptyProject(),nodes};}
test('Mini format roundtrip preserves parameters; rejects full Formnaro formats and invalid numbers',()=>{
  const n=createNode('tube');n.params.wall=2.5;const p=scene([n]);assert.deepEqual(decodeProject(encodeProject(p)),p);
  for(const bad of [{...p,format:'OfflineCAD'},{...p,version:8},{...p,nodes:[{...n,pos:[NaN,0,0]}]},{...p,nodes:[n,n]},{...p,nodes:[{...n,hidden:'false'}]}])assert.throws(()=>encodeProject(bad));
});
test('all twelve Mini primitives produce positive closed geometry at three qualities',async()=>{
  for(const q of [32,64,128])for(const [type]of SHAPES){const n=createNode(type,q),[{data}]=await run('render',[n]);assert(data.volume>0,type);assert(data.triangles.length>0,type);assert(data.verts.every(Number.isFinite),type);}
});
test('body minus hole produces independently expected physical volume and reimportable STL',async()=>{
  const b=createNode('box');b.size=[20,20,10];b.pos=[0,0,5];const h=createNode('box');h.size=[10,10,20];h.pos=[0,0,5];h.solid=false;
  const group=await run('group',{nodes:[b,h]});const [{data}]=await run('render',[group]);assert(Math.abs(data.volume*group.size.reduce((a,b)=>a*b)-3000)<1e-3);assert.equal(group.children.length,2);
  const buffer=await run('export',[group]);assert.equal(buffer.byteLength,84+new DataView(buffer).getUint32(80,true)*50);
  const imported=await run('import',{name:'test.stl',buffer});assert(imported.solid);const [{data:again}]=await run('render',[imported]);assert(Math.abs(again.volume*imported.size.reduce((a,b)=>a*b)-3000)<.05);
});
test('union, intersection, and disjoint intersection handling',async()=>{
  const a=createNode('box'),b=createNode('box');b.pos[0]=10;
  const u=await run('group',{nodes:[a,b],operation:'union'}),i=await run('group',{nodes:[a,b],operation:'intersection'});
  for(const[n,expected]of [[u,12000],[i,4000]]){const [{data}]=await run('render',[n]);assert(Math.abs(data.volume*n.size.reduce((a,b)=>a*b)-expected)<.01);}
  b.pos[0]=100;await assert.rejects(run('group',{nodes:[a,b],operation:'intersection'}));
});
test('ungroup restores editable sources after rotation and uniform scale',async()=>{
  const a=createNode('box'),b=createNode('cylinder');b.pos=[12,5,10];b.solid=false;const group=await run('group',{nodes:[a,b]});group.pos=[20,30,40];group.rot=[15,25,35];group.size=group.size.map(v=>v*2);
  const parts=await run('ungroup',group);assert.equal(parts[0].type,'box');assert.equal(parts[1].type,'cylinder');assert.equal(parts[1].solid,false);encodeProject(scene(parts));
  const regroup=await run('group',{nodes:parts});
  // Coplanar cut faces may acquire near-zero-volume residual triangles when
  // recomputed after rotation. Compare symmetric solid difference, not bounds
  // of those numerical slivers.
  const original=worldManifold(group),rebuilt=worldManifold(regroup),removed=original.subtract(rebuilt),added=rebuilt.subtract(original);
  try{assert(Math.abs(removed.volume())+Math.abs(added.volume())<original.volume()*1e-7);}finally{original.delete();rebuilt.delete();removed.delete();added.delete();}
});
test('ungroup scales physical corner radii with a uniformly enlarged source',async()=>{
  const a=createNode('roundbox'),b=createNode('box');a.params.edgeSize=2;b.pos=[20,0,10];const group=await run('group',{nodes:[a,b]});group.size=group.size.map(v=>v*2);const parts=await run('ungroup',group);assert.equal(parts[0].params.edgeSize,4);encodeProject(scene(parts));
});
test('ungroup preserves sheared source with baked affine geometry',async()=>{
  const a=createNode('box'),b=createNode('box');a.rot=[0,0,37];b.pos=[15,0,10];const group=await run('group',{nodes:[a,b]});group.size[0]*=2;
  const parts=await run('ungroup',group);assert.equal(parts[0].type,'import');encodeProject(scene(parts));const rebuilt=await run('group',{nodes:parts});const bds=await run('bounds',[group,rebuilt]);for(const key of ['min','max'])for(let j=0;j<3;j++)assert(Math.abs(bds[0][key][j]-bds[1][key][j])<1e-4);
});
test('STL rejects open triangles and oversized input without replacing a model',async()=>{
  const ascii=new TextEncoder().encode('solid open\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid open');await assert.rejects(run('import',{name:'open.stl',buffer:ascii.buffer}));await assert.rejects(run('import',{name:'large.stl',buffer:new ArrayBuffer(25*1024*1024+1)}));
});
test('history branching and bounded snapshots; duplicate sources get unique IDs',()=>{
  const h=new History();h.push('a');h.push('b');assert.equal(h.undo('c'),'b');assert.equal(h.redo('b'),'c');assert.equal(h.undo('c'),'b');h.push('new');assert.equal(h.redo('anything'),null);for(let i=0;i<100;i++)h.push('entry'+i);assert(h.past.length<=60);
  const root=createNode('box');root.children=[createNode('sphere')];const old=[root.id,root.children[0].id];renewIds(root);assert.notEqual(root.id,old[0]);assert.notEqual(root.children[0].id,old[1]);
});
test('cache stays bounded across repeated shape changes',async()=>{
  const n=createNode('tube');for(let i=0;i<90;i++){n.size[0]=20+i/10;await run('render',[n]);}const info=await run('info');assert(info.cacheEntries<=64);assert(info.cacheBytes<=16*1024*1024);
});
