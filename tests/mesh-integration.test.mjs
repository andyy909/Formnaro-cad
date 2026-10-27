import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Worker} from 'node:worker_threads';
import Module from 'manifold-3d/manifold';
import * as THREE from 'three';
import {createMeshEngineAdapter} from '../src/mesh-engine-adapter.js';
import {createCadProject,cadProjectSnapshot,serializeCadProject,parseCadProject} from '../src/cad-project.js';
import {createCadController} from '../src/cad-controller.js';

const kernel=await Module({wasmBinary:fs.readFileSync(new URL('../node_modules/manifold-3d/manifold.wasm',import.meta.url))});kernel.setup();
const engine=createMeshEngineAdapter({kernel}),identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
async function create(id,position=[0,0,5],size=[20,20,10],project=createCadProject()){return (await engine.edit({project,operation:{type:'mesh-create',shape:'box',id,position,size}})).project;}
const edit=(project,operation)=>engine.edit({project,operation});
const volume=node=>engine.inspectSolid(node).volume;
const near=(a,b,tolerance=2e-3)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const matrixNear=(a,b)=>a.forEach((v,i)=>near(v,b[i],1e-9));
const worldBounds=n=>new THREE.Box3().setFromPoints(Array.from({length:n.mesh.verts.length/3},(_,i)=>new THREE.Vector3(...n.mesh.verts.slice(i*3,i*3+3)).applyMatrix4(new THREE.Matrix4().fromArray(n.transform))));

test('existing mesh primitives are explicit meshes with retained parameters and strict limits',async()=>{
  const p=await create('box');assert.equal(p.nodes[0].kind,'mesh');assert.equal(p.nodes[0].meshSource.node.type,'box');near(volume(p.nodes[0]),4000);
  assert.deepEqual(parseCadProject(serializeCadProject(p)),p);
  await assert.rejects(edit(p,{type:'mesh-create',shape:'box',size:[-1,2,3]}));
  await assert.rejects(edit(p,{type:'mesh-create',shape:'thread',params:{diameter:-1}}));
  await assert.rejects(edit(p,{type:'mesh-create',shape:'text'}));
});

test('mesh creation optionally uses a full workplane frame while the retained recipe stays local',async()=>{
  const frame=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(.4,-.3,.6)).setPosition(25,-12,7).toArray(),operation={type:'mesh-create',shape:'box',id:'created',position:[2,3,5],size:[8,6,10]},base=await edit(createCadProject(),operation),placed=await edit(createCadProject(),{...operation,frame}),world=base.project.nodes[0],onPlane=placed.project.nodes[0],before=structuredClone(frame),expected=new THREE.Matrix4().fromArray(frame).multiply(new THREE.Matrix4().fromArray(world.transform)).toArray();
  matrixNear(onPlane.transform,expected);assert.deepEqual(onPlane.meshSource,world.meshSource);assert.deepEqual(onPlane.mesh,world.mesh);assert.deepEqual(frame,before);near(volume(onPlane),480);
  const edited=await edit(placed.project,{type:'mesh-source-edit',id:'created',path:[],set:{size:[12,6,10]}}),newTransform=new THREE.Matrix4().fromArray(frame).multiply(new THREE.Matrix4().makeTranslation(2,3,5)).multiply(new THREE.Matrix4().makeScale(12,6,10)).toArray();matrixNear(edited.project.nodes[0].transform,newTransform);assert.deepEqual(edited.project.nodes[0].meshSource.node.pos,[2,3,5]);assert.deepEqual(edited.project.nodes[0].meshSource.node.rot,[0,0,0]);assert.deepEqual(placed.project.nodes[0],onPlane);
  const sheared=[-1,.2,0,0,.3,1,.1,0,.2,0,1,0,3,-2,4,1],affine=await edit(createCadProject(),{...operation,frame:sheared});matrixNear(affine.project.nodes[0].transform,new THREE.Matrix4().fromArray(sheared).multiply(new THREE.Matrix4().fromArray(world.transform)).toArray());assert.deepEqual(affine.project.nodes[0].meshSource,world.meshSource);
  for(const frame of [[...identity.slice(0,15),0],identity.map((v,i)=>i===0?0:v),identity.map((v,i)=>i===4?NaN:v)])await assert.rejects(edit(createCadProject(),{...operation,frame}));
});

test('mesh union, intersection and subtraction preserve unrelated native/open objects and full original sources',async()=>{
  let p=await create('a');p=await create('b',[10,0,5],[20,20,10],p);
  const native={id:'native',kind:'cad',name:'Native',source:'native',recipe:{type:'box',size:[5,6,7]},brep:{format:'OpenCascade-BRep',data:'synthetic-boundary-only',triangulation:false},stats:{bounds:{min:[0,0,0],max:[5,6,7]},volume:210,solids:1},transform:identity,solid:true,color:'#4488cc',layerId:'default',folderId:null};
  const open={id:'open',kind:'mesh',name:'Open',transform:identity,mesh:{verts:[0,0,0,1,0,0,0,1,0],triangles:[0,1,2]},color:'#aabbcc',layerId:'default',folderId:null};p=cadProjectSnapshot({...p,nodes:[native,...p.nodes,open]});
  const before=structuredClone(p);for(const [operation,expected]of [['union',6000],['intersection',2000],['difference',2000]]){
    const r=await edit(p,{type:'mesh-group',ids:['a','b'],operation});near(volume(r.project.nodes[1]),expected);assert.deepEqual(r.project.nodes[0],before.nodes[0]);assert.deepEqual(r.project.nodes.at(-1),before.nodes.at(-1));assert.deepEqual(r.project.nodes[1].meshSource.sources,before.nodes.slice(1,3));assert.deepEqual(parseCadProject(serializeCadProject(r.project)),r.project);
  }assert.deepEqual(p,before);
});

test('open, damaged, reversed, hidden, locked and inherited locked meshes cannot use body operations',async()=>{
  const p=await create('a');
  const invalids=[n=>{n.mesh={verts:[0,0,0,1,0,0,0,1,0],triangles:[0,1,2]};},n=>{n.mesh.triangles.push(...n.mesh.triangles.slice(0,3));},n=>{for(let i=0;i<n.mesh.triangles.length;i+=3)[n.mesh.triangles[i+1],n.mesh.triangles[i+2]]=[n.mesh.triangles[i+2],n.mesh.triangles[i+1]];},n=>{n.hidden=true;},n=>{n.locked=true;}];
  for(const change of invalids){const broken=structuredClone(p);change(broken.nodes[0]);const before=structuredClone(broken);await assert.rejects(edit(broken,{type:'mesh-split',id:'a',plane:{normal:[1,0,0],offset:0}}));assert.deepEqual(broken,before);}
  const inherited=structuredClone(p);inherited.layers[0].locked=true;await assert.rejects(edit(inherited,{type:'mesh-drill',id:'a',reference:{point:[0,0,10],normal:[0,0,1]}}));
});

test('plane split and material extraction retain recipe provenance and cavities',async()=>{
  let p=await create('a');const split=await edit(p,{type:'mesh-split',id:'a',plane:{normal:[1,0,0],offset:0}});assert.equal(split.project.nodes.length,2);near(split.project.nodes.reduce((s,n)=>s+volume(n),0),4000);assert.deepEqual(split.project.nodes[0].meshSource.sources,p.nodes);assert.equal(split.project.nodes[1].meshSource.operation.part,1);
  await assert.rejects(edit(p,{type:'mesh-split',id:'a',plane:{normal:[1,0,0],offset:50}}));
  p=await create('b',[50,0,5],[10,10,10],p);const grouped=await edit(p,{type:'mesh-group',ids:['a','b'],operation:'union'}),bodies=await edit(grouped.project,{type:'mesh-extract-bodies',id:'a'});assert.equal(bodies.project.nodes.length,2);near(bodies.project.nodes.reduce((s,n)=>s+volume(n),0),5000);
  let shell=await create('outer',[0,0,10],[20,20,20]);shell=await create('inner',[0,0,10],[12,12,12],shell);const hollow=await edit(shell,{type:'mesh-group',ids:['outer','inner'],operation:'difference'});await assert.rejects(edit(hollow.project,{type:'mesh-extract-bodies',id:'outer'}),/einen unabhängigen/);
});

test('drilling uses existing simple, countersink and counterbore procedures with checked removal',async()=>{
  const p=await create('a');for(const style of ['simple','countersink','counterbore']){const r=await edit(p,{type:'mesh-drill',id:'a',reference:{point:[0,0,10],normal:[0,0,1]},options:{style,diameter:4,recessDiameter:8,recessDepth:2}});assert.ok(r.report.removedVolume>100);assert.ok(volume(r.project.nodes[0])<4000);assert.deepEqual(r.project.nodes[0].meshSource.sources,p.nodes);}
  await assert.rejects(edit(p,{type:'mesh-drill',id:'a',reference:{point:[100,0,10],normal:[0,0,1]}}),/kein Material/);
});

test('edge analysis and finish retain source geometry, reject stale and excessive cuts',async()=>{
  const p=await create('a'),analysis=await engine.analyzeEdges(p.nodes[0]);assert.equal(analysis.edges.length,12);
  const r=await edit(p,{type:'mesh-finish',id:'a',edgeIds:[analysis.edges[0].id],geometryDigest:analysis.geometryDigest,options:{mode:'chamfer',width:1}});assert.ok(volume(r.project.nodes[0])<4000);assert.deepEqual(r.project.nodes[0].meshSource.sources,p.nodes);
  const fillet=await edit(p,{type:'mesh-finish',id:'a',edgeIds:[analysis.edges[0].id],options:{mode:'fillet',width:1,segments:16}});assert.ok(volume(fillet.project.nodes[0])<4000);assert.ok(fillet.report.chordError>0);
  const before=serializeCadProject(r.project);await assert.rejects(edit(r.project,{type:'mesh-source-edit',id:'a',path:['a'],set:{size:[22,20,10]}}),/Kantenbezug/);assert.equal(serializeCadProject(r.project),before);
  await assert.rejects(edit(p,{type:'mesh-finish',id:'a',edgeIds:[analysis.edges[0].id],geometryDigest:'changed',options:{width:1}}),/Kantenbezug/);
  await assert.rejects(edit(p,{type:'mesh-finish',id:'a',edgeIds:[analysis.edges[0].id],options:{width:100}}));
});

test('source dimension editing preserves shear, reflection and changed outer placement',async()=>{
  let p=await create('a');p.nodes[0].transform=[-20,0,0,0,5,20,0,0,0,0,10,0,40,10,5,1];const before=structuredClone(p.nodes[0]),r=await edit(p,{type:'mesh-source-edit',id:'a',path:[],set:{size:[30,20,10]}}),after=r.project.nodes[0];
  assert.equal(after.transform[4],5);assert.equal(after.transform[0],-30);assert.equal(after.transform[12],40);near(volume(after),6000);assert.deepEqual(p.nodes[0],before);
});

test('group original source edits and suppression survive parent shear and dissolve restores original affine/metadata',async()=>{
  let p=await create('a');p.nodes[0].transform[4]=5;p.nodes[0].metadata.notes='source notes';p=await create('b',[50,0,5],[10,10,10],p);const originals=structuredClone(p.nodes);
  let r=await edit(p,{type:'mesh-group',ids:['a','b'],operation:'union'}),group=r.project.nodes[0];
  Object.assign(group,{name:'Custom group',color:'#123456',meshRole:'hole'});
  const move=new THREE.Matrix4().set(1,.2,0,25,0,1,0,-4,0,0,-1,20,0,0,0,1);group.transform=new THREE.Matrix4().multiplyMatrices(move,new THREE.Matrix4().fromArray(group.transform)).toArray();
  const restored=await edit(r.project,{type:'mesh-dissolve',id:'a'});for(let i=0;i<2;i++){assert.equal(restored.project.nodes[i].metadata.notes,originals[i].metadata.notes);assert.deepEqual(restored.project.nodes[i].meshSource,originals[i].meshSource);matrixNear(restored.project.nodes[i].transform,new THREE.Matrix4().multiplyMatrices(move,new THREE.Matrix4().fromArray(originals[i].transform)).toArray());}
  r=await edit(r.project,{type:'mesh-source-edit',id:'a',path:['b'],set:{size:[12,10,10]}});near(volume(r.project.nodes[0]),5200);assert.equal(r.project.nodes[0].meshSource.sources[1].transform[0],12);assert.equal(r.project.nodes[0].name,'Custom group');assert.equal(r.project.nodes[0].color,'#123456');assert.equal(r.project.nodes[0].meshRole,'hole');
  r=await edit(r.project,{type:'mesh-source-edit',id:'a',path:['b'],set:{suppressed:true}});near(volume(r.project.nodes[0]),4000);assert.deepEqual(r.project.nodes[0].meshSource.operation.suppressedIds,['b']);
  r=await edit(r.project,{type:'mesh-source-edit',id:'a',path:['b'],set:{suppressed:false}});near(volume(r.project.nodes[0]),5200);
  const locked=structuredClone(r.project);locked.nodes[0].meshSource.sources[1].locked=true;await assert.rejects(edit(locked,{type:'mesh-source-edit',id:'a',path:['b'],set:{size:[11,10,10]}}),/gesperrt/);
});

test('later group source edits retain a previous parent dimension edit',async()=>{
  let p=await create('a');p=await create('b',[50,0,5],[10,10,10],p);let r=await edit(p,{type:'mesh-group',ids:['a','b'],operation:'union'});
  const sourceSize=r.project.nodes[0].meshSource.node.size;r=await edit(r.project,{type:'mesh-source-edit',id:'a',path:[],set:{size:sourceSize.map(v=>v*2)}});near(volume(r.project.nodes[0]),40000,.1);
  r=await edit(r.project,{type:'mesh-source-edit',id:'a',path:['b'],set:{size:[12,10,10]}});near(volume(r.project.nodes[0]),41600,.1);
});

test('raw imported source edits retain physical dimensions, centre and complete outer affine',async()=>{
  let p=await create('a');const n=p.nodes[0];n.mesh.verts=n.mesh.verts.map((v,i)=>v*[20,10,8][i%3]+[4,-3,6][i%3]);delete n.meshSource;n.transform=[-1,0,0,0,.3,1,0,0,0,0,2,0,25,-4,7,1];
  const before=structuredClone(n),named=await edit(p,{type:'mesh-source-edit',id:'a',path:[],set:{name:'import source'}});near(volume(named.project.nodes[0]),3200);assert.deepEqual(worldBounds(named.project.nodes[0]),worldBounds(before));
  const changed=await edit(p,{type:'mesh-source-edit',id:'a',path:[],set:{size:[30,10,8]}});near(volume(changed.project.nodes[0]),4800);const center=worldBounds(changed.project.nodes[0]).getCenter(new THREE.Vector3());near(center.x,20.1);near(center.y,-7);near(center.z,19);assert.equal(changed.project.nodes[0].transform[4],3);assert.equal(changed.project.nodes[0].transform[0],-30);
});

test('source edits preserve separately changed appearance and hole role, rejecting mismatched geometry',async()=>{
  const p=await create('a');Object.assign(p.nodes[0],{name:'Renamed outside source',color:'#112233',meshRole:'hole'});const r=await edit(p,{type:'mesh-source-edit',id:'a',path:[],set:{size:[21,20,10]}});assert.equal(r.project.nodes[0].name,'Renamed outside source');assert.equal(r.project.nodes[0].color,'#112233');assert.equal(r.project.nodes[0].meshRole,'hole');
  const bad=structuredClone(p);bad.nodes[0].mesh.verts=bad.nodes[0].mesh.verts.map((v,i)=>i%3===0?v*2:v);await assert.rejects(edit(bad,{type:'mesh-source-edit',id:'a',path:[],set:{name:'should fail'}}),/passt nicht/);
});

test('dense existing mesh uses worker-safe body proof and checked plane partition',async()=>{
  const r=await edit(createCadProject(),{type:'mesh-create',shape:'sphere',id:'dense',size:[30,30,30],position:[0,0,15],segments:128}),original=r.project.nodes[0],proof=engine.inspectSolid(original);assert.ok(proof.triangles>5000);
  const split=await edit(r.project,{type:'mesh-split',id:'dense',plane:{normal:[1,0,0],offset:0}});assert.equal(split.project.nodes.length,2);near(split.project.nodes.reduce((s,n)=>s+volume(n),0),proof.volume,.5);
  const before=serializeCadProject(r.project);await assert.rejects(edit(r.project,{type:'mesh-split',id:'dense',plane:{normal:[0,0,0],offset:0}}));assert.equal(serializeCadProject(r.project),before);
});

test('nested raw source edits retain local frames and reject a mismatched archived operation before dissolve',async()=>{
  let p=await create('raw');const raw=p.nodes[0];raw.mesh.verts=raw.mesh.verts.map((v,i)=>v*[20,10,8][i%3]+[4,-3,6][i%3]);delete raw.meshSource;raw.transform=[1,0,0,0,.3,1,0,0,0,0,2,0,0,0,0,1];
  p=await create('b',[50,0,5],[10,10,10],p);let r=await edit(p,{type:'mesh-group',ids:['raw','b'],operation:'union'});r=await edit(r.project,{type:'mesh-source-edit',id:'raw',path:['raw'],set:{size:[30,10,8]}});near(volume(r.project.nodes[0]),5800);
  const originalGroup=structuredClone(r.project.nodes[0]);r=await create('c',[90,0,5],[10,10,10],r.project);r=await edit(r,{type:'mesh-group',ids:['raw','c'],operation:'union'});r=await edit(r.project,{type:'mesh-source-edit',id:'raw',path:['raw','raw'],set:{size:[40,10,8]}});near(volume(r.project.nodes[0]),8400,.1);
  const broken=structuredClone(r.project);broken.nodes[0].meshSource.sources[0].mesh.verts=broken.nodes[0].meshSource.sources[0].mesh.verts.map((v,i)=>i%3===0?v*2:v);const before=serializeCadProject(broken);
  await assert.rejects(edit(broken,{type:'mesh-dissolve',id:'raw'}),/passen nicht/);assert.equal(serializeCadProject(broken),before);
  const ownMismatch=cadProjectSnapshot({...p,nodes:[originalGroup]});ownMismatch.nodes[0].mesh.verts=ownMismatch.nodes[0].mesh.verts.map((v,i)=>i%3===0?v*2:v);await assert.rejects(edit(ownMismatch,{type:'mesh-dissolve',id:'raw'}),/passt nicht/);
});

function factory(file){return ()=>{const w=new Worker(new URL(file,import.meta.url)),bridge={onmessage:null,onerror:null,postMessage:data=>w.postMessage(data),terminate:()=>w.terminate()};w.on('message',data=>bridge.onmessage?.({data}));w.on('error',error=>bridge.onerror?.(error));return bridge;};}
test('real worker mesh previews use the one common revision and undo/redo history',async()=>{
  const cad=createCadController({createWorker:factory('./fixtures/cad-node-worker.mjs'),createMeshWorker:factory('./fixtures/mesh-engine-node-worker.mjs')});try{
    await cad.execute({kind:'create',recipe:{type:'box',size:[5,5,5]},options:{id:'native'}});const native=cad.snapshot().nodes[0];
    await cad.execute({type:'mesh-create',shape:'box',id:'mesh',position:[20,0,5],size:[20,20,10]});const before=cad.serialize(),undo=cad.state().undo;
    const proposal=await cad.preview({type:'mesh-split',id:'mesh',plane:{normal:[1,0,0],offset:20}});assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,undo);cad.apply(proposal);const after=cad.serialize();assert.equal(cad.snapshot().nodes.length,3);assert.deepEqual(cad.snapshot().nodes[0],native);cad.undo();assert.equal(cad.serialize(),before);cad.redo();assert.equal(cad.serialize(),after);
    const stale=await cad.preview({type:'mesh-source-edit',id:'mesh',path:[],set:{name:'preview'}});const changed=cad.snapshot();changed.name='new revision';await cad.open(changed);assert.throws(()=>cad.apply(stale),{code:'STALE_REVISION'});
    const serialized=cad.serialize();const pending=cad.preview({type:'mesh-create',shape:'sphere',id:'cancelled',segments:128});cad.cancel();await assert.rejects(pending);assert.equal(cad.serialize(),serialized);
  }finally{cad.dispose();}
});
