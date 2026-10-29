import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createCadController} from '../src/cad-controller.js';
import {createCadProject,parseCadProject} from '../src/cad-project.js';
import {largeMeshCatalog} from '../src/mesh-large-reduce.js';
import {meshSelectionGeometryDigest} from '../src/mesh-selection-data.js';
import {meshNode,denseBoxMesh} from './fixtures/mesh-reduce-fixtures.mjs';
const worker=file=>()=>{const w=new Worker(new URL(file,import.meta.url)),a={postMessage:m=>w.postMessage(m),terminate:()=>w.terminate()};w.on('message',data=>a.onmessage?.({data}));w.on('error',e=>a.onerror?.(e));return a;};
test('large-mesh worker transaction retains source, protected faces, recipe and exact one-step Undo/Redo after save',async()=>{
 const c=createCadController({initial:createCadProject(),createWorker:worker('./fixtures/cad-node-worker.mjs'),createMeshWorker:worker('./fixtures/mesh-engine-node-worker.mjs')});
 try{
  const n=meshNode(await denseBoxMesh(8));n.layerId=c.snapshot().activeLayerId;n.metadata.meshProtection={format:'FormnaroMeshProtection',version:1,regions:[{id:'face',name:'Anlage',purpose:'contact',geometryDigest:meshSelectionGeometryDigest(n),triangleIds:[0,1,2]}]};
  await c.open(createCadProject({nodes:[n]}));const before=c.serialize(),depth=c.state().undo,catalog=await c.meshQuery('toolsQuery',{kind:'largeReduceCatalog',id:n.id});assert.equal(catalog.geometryDigest,largeMeshCatalog(n).geometryDigest);
  const p=await c.preview({type:'mesh-large-reduce',id:n.id,options:{method:'large-v1',geometryDigest:catalog.geometryDigest,target:50,quality:0,preserveFeatures:false}});assert.equal(c.serialize(),before);assert.equal(p.project.version,26);assert.ok(p.report.afterTriangles<p.report.beforeTriangles);assert.deepEqual(p.project.nodes[0].meshSource.sources,[n]);assert.equal(p.report.solidProven,false);
  c.apply(p);assert.equal(c.state().undo,depth+1);const saved=c.serialize();assert.equal(parseCadProject(saved).nodes[0].meshSource.operation.options.method,'large-v1');c.undo();assert.equal(c.serialize(),before);c.redo();assert.equal(c.serialize(),saved);
  const invalid=JSON.parse(saved);invalid.version=25;assert.throws(()=>parseCadProject(invalid));
 }finally{c.dispose();}
});
