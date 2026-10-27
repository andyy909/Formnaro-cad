import test from 'node:test';import assert from 'node:assert/strict';import {Worker} from 'node:worker_threads';
import {createCadController} from '../src/cad-controller.js';
import {createCadAutomationAccess} from '../src/cad-automation-access.js';
import {createCadProject} from '../src/cad-project.js';
import {captureCadAISourceReference,upsertCadAIReference,cadAIReferenceState} from '../src/cad-ai-feature-references.js';
const worker=file=>()=>{const w=new Worker(new URL(file,import.meta.url)),a={postMessage:v=>w.postMessage(v),terminate:()=>w.terminate()};w.on('message',data=>a.onmessage?.({data}));w.on('error',error=>a.onerror?.(error));return a;};
async function setup(t){const cad=createCadController({createWorker:worker('./fixtures/cad-node-worker.mjs'),createMeshWorker:worker('./fixtures/mesh-engine-node-worker.mjs')});t.after(()=>cad.dispose());let scene=await cad.describe();const refresh=async()=>{scene=await cad.describe();};return {cad,access:createCadAutomationAccess({controller:cad,getScene:()=>scene,refresh})};}
const tetra={id:'restored-mesh',kind:'mesh',name:'Saved tetrahedron',layerId:'default',folderId:null,color:'#ee8800',opacity:1,transform:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],mesh:{verts:[0,0,0,2,0,0,0,2,0,0,0,2],triangles:[0,2,1,0,1,3,0,3,2,1,2,3]}};

test('An archived material mesh receives a real fresh kernel volume proof and the saved triangles remain exact',async t=>{
 const {cad,access}=await setup(t),before=cad.serialize(),project=createCadProject({nodes:[tetra]});
 const restored=await access.restoreCandidate({project,proposal:{aliases:{part:tetra.id}},result:{}},{checks:[{kind:'volume',target:'$part',expected:4/3}]});
 assert.equal(restored.verification.passed,true);assert(Math.abs(restored.verification.checks[0].actual-4/3)<1e-8);assert.deepEqual(access.getPreview(restored.previewId).nodes[0].mesh,tetra.mesh);assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,0);access.discard(restored.previewId);
 const open=structuredClone(project);open.nodes[0].mesh.triangles.splice(-3);
 await assert.rejects(access.restoreCandidate({project:open,proposal:{aliases:{}},result:{}}));assert.equal(cad.state().previews,0);assert.equal(cad.serialize(),before);
});

test('Fresh private dependency acceptance survives a tampered public restoration report',async t=>{
 const {cad,access}=await setup(t),before=cad.serialize(),project=cad.snapshot();project.drawings={version:1,sheets:[]};
 const restored=await access.restoreCandidate({project,proposal:{aliases:{}},result:{}});assert.equal(restored.report.featureDependencies.requiresAcceptance,true);restored.report.featureDependencies.requiresAcceptance=false;
 assert.throws(()=>cad.apply({previewId:restored.previewId,revision:cad.revision()}),{code:'AI_FEATURE_DEPENDENCY_ACCEPTANCE_REQUIRED'});assert.equal(cad.serialize(),before);
 await access.apply({previewId:restored.previewId,revision:cad.revision(),acceptFeatureDependencies:true});assert.equal(cad.state().undo,1);cad.undo();assert.equal(cad.serialize(),before);
});

test('Restoring an edited native source preserves the private warning for a real saved feature reference',async t=>{
 const {cad,access}=await setup(t);await cad.execute({kind:'batch',commands:[{op:'create',type:'box',size:[10,8,6],as:'source'}]});const node=cad.snapshot().nodes[0],reference=captureCadAISourceReference(cad.snapshot(),{rootId:node.id,path:[]});cad.apply(await cad.previewFeatureReferences(upsertCadAIReference(null,reference)));const before=cad.serialize(),depth=cad.state().undo;
 const draft=cad.snapshot();draft.nodes[0].recipe.size[0]=12;const proposed=await cad.preview(undefined,{project:draft});const project=structuredClone(proposed.project);cad.discard(proposed.previewId);assert.equal(cadAIReferenceState(project,reference,{stored:true}).status,'stale');
 const restored=await access.restoreCandidate({project,proposal:{aliases:{}},result:{}});assert.equal(restored.report.featureDependencies.requiresAcceptance,true);restored.report.featureDependencies.requiresAcceptance=false;
 assert.throws(()=>cad.apply({previewId:restored.previewId,revision:cad.revision()}),{code:'AI_FEATURE_DEPENDENCY_ACCEPTANCE_REQUIRED'});assert.equal(cad.serialize(),before);await access.apply({previewId:restored.previewId,revision:cad.revision(),acceptFeatureDependencies:true});assert.equal(cad.state().undo,depth+1);cad.undo();assert.equal(cad.serialize(),before);
});
