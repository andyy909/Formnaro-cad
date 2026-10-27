import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createCadController} from '../src/cad-controller.js';
import {createCadProject,parseCadProject} from '../src/cad-project.js';
import {projectObjectGeometryDigest} from '../src/project-objects.js';

const cube=(id,x=0)=>({id,kind:'mesh',name:id,color:'#109ca9',opacity:.8,layerId:'default',folderId:null,transform:[1,0,0,0,0,1,0,0,0,0,1,0,x,0,0,1],mesh:{verts:[-10,-10,0,10,-10,0,10,10,0,-10,10,0,-10,-10,20,10,-10,20,10,10,20,-10,10,20],triangles:[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]}});
function factory(file,onPost=()=>{}){return ()=>{const w=new Worker(new URL(file,import.meta.url)),api={onmessage:null,onerror:null,postMessage:data=>{onPost(data);w.postMessage(data);},terminate:()=>w.terminate()};w.on('message',data=>api.onmessage?.({data}));w.on('error',error=>api.onerror?.(error));return api;};}
function fixture(options={}){return createCadController({createWorker:factory('./fixtures/cad-node-worker.mjs'),createMeshWorker:factory('./fixtures/mesh-engine-node-worker.mjs'),...options});}

test('real mesh worker previews, commits, saves and undoes beside unchanged native BRep',async()=>{
 const cad=fixture();try{
  await cad.execute({kind:'create',recipe:{type:'box',size:[8,6,4]},options:{id:'cad'}});const draft=cad.snapshot(),native=structuredClone(draft.nodes[0]);draft.nodes.push(cube('a'),cube('b',10));await cad.open(draft);
  const before=cad.serialize(),undo=cad.state().undo,proposal=await cad.preview({type:'mesh-group',ids:['a','b'],operation:'union'},{label:'Netz vereinen'});
  assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,undo);assert.deepEqual(proposal.selectedIds,['a']);assert.equal(proposal.project.nodes[1].meshSource.version,2);
  const display=await cad.display(proposal.project);assert.equal(display.meshes.length,2);cad.apply(proposal);assert.equal(cad.state().undo,undo+1);assert.deepEqual(cad.snapshot().nodes[0],native);
  const after=cad.serialize(),proof=await cad.meshQuery('inspectSolid',{id:'a'});assert.ok(Math.abs(proof.volume-12000)<.01);assert.equal(proof.geometryDigest,projectObjectGeometryDigest(cad.snapshot().nodes[1]));
  await cad.open(parseCadProject(after));assert.equal(cad.serialize(),after);const stl=await cad.exportModel({format:'stl'});assert.ok(stl.data.length>100);const step=await cad.exportModel({format:'step'});assert.ok(step.data.length>100);
  cad.undo();assert.equal(cad.serialize(),before);cad.redo();assert.equal(cad.serialize(),after);
  await cad.execute({kind:'batch',commands:[{op:'transform',target:'cad',translate:[5,0,0]}]});const meshBefore=cad.snapshot().nodes[1];assert.deepEqual(meshBefore,JSON.parse(after).nodes[1]);cad.undo();assert.equal(cad.serialize(),after);
 }finally{cad.dispose();}
});

test('mesh split stale previews and discarded previews never enter shared history',async()=>{
 const cad=fixture({initial:createCadProject({nodes:[cube('a')]})});try{
  const original=cad.serialize(),proposal=await cad.preview({type:'mesh-split',id:'a',plane:{normal:[0,0,1],offset:10}});
  assert.equal(cad.serialize(),original);assert.equal(proposal.project.nodes.length,2);cad.discard(proposal.previewId);assert.throws(()=>cad.apply(proposal));assert.equal(cad.serialize(),original);
  const stale=await cad.preview({type:'mesh-split',id:'a',plane:{normal:[0,0,1],offset:10}}),draft=cad.snapshot();draft.name='Andere bestätigte Änderung';await cad.open(draft);
  const saved=cad.serialize();assert.throws(()=>cad.apply(stale),{code:'STALE_REVISION'});assert.equal(cad.serialize(),saved);assert.equal(cad.snapshot().nodes.length,1);
 }finally{cad.dispose();}
});

test('mesh worker cancellation aborts unpublished work and reopens from confirmed state',async()=>{
 let submitted;const started=new Promise(resolve=>submitted=resolve);let creations=0;
 const cad=fixture({initial:createCadProject({nodes:[cube('a'),cube('b',10)]}),createMeshWorker:()=>{creations++;return factory('./fixtures/mesh-engine-node-worker.mjs',message=>{if(message.request?.job==='edit')submitted();})();}});
 try{
  const saved=cad.serialize(),pending=cad.preview({type:'mesh-group',ids:['a','b'],operation:'union'}),rejected=assert.rejects(pending);await started;const start=performance.now();assert.equal(cad.cancel(),true);await rejected;assert.ok(performance.now()-start<1000);assert.equal(cad.serialize(),saved);assert.equal(cad.state().undo,0);
  const result=await cad.meshQuery('inspectSolid',{id:'a'});assert.equal(result.ok,true);assert.equal(creations,2);assert.equal(cad.serialize(),saved);
 }finally{cad.dispose();}
});

test('display failure, open meshes and inherited locks leave CAD and mesh history unchanged',async()=>{
 let refuse=false;const cad=fixture({initial:createCadProject({nodes:[cube('a'),cube('b',10)]}),prepareCommit:async()=>{if(refuse)throw Error('Kontrollierte Darstellungsgrenze');}});
 try{
  const saved=cad.serialize();refuse=true;await assert.rejects(()=>cad.preview({type:'mesh-group',ids:['a','b'],operation:'union'}),/Darstellungsgrenze/);assert.equal(cad.serialize(),saved);assert.equal(cad.state().undo,0);refuse=false;
  const draft=cad.snapshot();draft.folders.push({id:'parent',name:'Gesperrt',hidden:false,locked:true,layerId:'default',parentId:null},{id:'child',name:'Kind',hidden:false,locked:false,layerId:'default',parentId:'parent'});draft.nodes[0].folderId='child';await cad.open(draft);let baseline=cad.serialize();await assert.rejects(()=>cad.preview({type:'mesh-split',id:'a',plane:{normal:[0,0,1],offset:10}}),/gesperrt/);assert.equal(cad.serialize(),baseline);
  const open=cad.snapshot();open.nodes[1].mesh.triangles.splice(0,3);await cad.open(open);baseline=cad.serialize();await assert.rejects(()=>cad.preview({type:'mesh-split',id:'b',plane:{normal:[0,0,1],offset:10}}));assert.equal(cad.serialize(),baseline);
 }finally{cad.dispose();}
});

test('archived mesh source schema rejects malformed nested native sources and cycles',async()=>{
 const cad=fixture({initial:createCadProject({nodes:[cube('a'),cube('b',10)]})});try{
  await cad.execute({type:'mesh-group',ids:['a','b'],operation:'union'});const draft=cad.snapshot();
  draft.nodes[0].meshSource.sources[0].transform[15]=0;assert.throws(()=>parseCadProject(JSON.stringify(draft)),/affine/);
  const native=cad.snapshot();native.nodes[0].meshSource.sources[0].kind='cad';assert.throws(()=>parseCadProject(JSON.stringify(native)),/Netzquellen/);
  const bad=cad.snapshot();bad.nodes[0].meshSource.operation.suppressedIds=['missing'];assert.throws(()=>parseCadProject(JSON.stringify(bad)),/unterdrückte/);
  const cyclic=cad.snapshot();cyclic.nodes[0].meshSource.sources[0].meshSource=cyclic.nodes[0].meshSource;await assert.rejects(()=>cad.open(cyclic));
 }finally{cad.dispose();}
});
