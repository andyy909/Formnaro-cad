import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Worker} from 'node:worker_threads';
import freecad from '../backend/freecad.cjs';
import {createCadController} from '../src/cad-controller.js';
import {surfaceScript,validateSurfaceParameters,defaultSurfaceBoundary,parseSurfaceLoops} from '../src/cad-surfaces-data.js';
import {readFreeCADDocument} from '../src/cad-freecad-document.js';
import os from 'node:os';
import path from 'node:path';
import {encodeFnpackProject,createFnpackResolver,materializedFnpackProject} from '../src/cad-fnpack-data.js';
import {writeFnpack,openFnpack} from '../backend/fnpack.cjs';
const moduleSource=fs.readFileSync('backend/freecad-surfaces.py','utf8');
const factory=()=>{const w=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),a={postMessage:v=>w.postMessage(v),terminate:()=>w.terminate()};w.on('message',v=>a.onmessage?.({data:v}));w.on('error',e=>a.onerror?.(e));return a;};
const fill=()=>({kind:'surface-fill',boundary:defaultSurfaceBoundary(),thickness:1,direction:[0,0,1]});
test('Surface data contract rejects invalid coordinates, open boundaries, arbitrary properties and wrong face counts',()=>{
 assert.deepEqual(validateSurfaceParameters(fill()),fill());const open=fill();open.boundary[0][3][0]=19;
 for(const bad of [null,[],{},open,{...fill(),thickness:0},{...fill(),direction:[0,0,0]},{...fill(),arbitrary:true},{...fill(),boundary:[...fill().boundary,fill().boundary[0]]},{kind:'surface-transition',faces:[],ruled:false},{kind:'surface-relief',faces:[],mode:'add',rotation:0,depth:1,loops:[]}])assert.throws(()=>validateSurfaceParameters(bad));
 assert.deepEqual(parseSurfaceLoops('0 0\n4 0\n4 4\n0 4\n\n1 1\n2 1\n1 2'),[[[0,0],[4,0],[4,4],[0,4]],[[1,1],[2,1],[1,2]]]);assert.throws(()=>parseSurfaceLoops('0\n1 2\n2 3'));assert.throws(()=>parseSurfaceLoops('1 junk\n2 2\n3 3'));
});
function setup(t){const previous=globalThis.offlinecadDesktop;let calls=0;globalThis.offlinecadDesktop={runFreeCADReply:async({requestId,...args})=>{calls++;try{return {ok:true,value:await freecad.run(args)};}catch(e){return {ok:false,error:e.message,code:e.code};}},cancelFreeCAD:async()=>true};const cad=createCadController({createWorker:factory});t.after(()=>{cad.dispose();globalThis.offlinecadDesktop=previous;});return {cad,calls:()=>calls};}
const tool=(p,inputs=[])=>({op:'tool',engine:'freecad',as:'surface',operation:{kind:'build',inputs,script:surfaceScript(p,moduleSource)}});
test('Actual surface preview, archive reopen, STEP export and exact Apply/Undo preserve independent sources',async t=>{
 const {cad}=setup(t);const seed=await cad.preview({kind:'batch',commands:[{op:'create',type:'box',size:[2,3,4],pos:[50,0,0]}]});cad.apply(seed);const before=cad.serialize(),depth=cad.state().undo,p=await cad.preview({kind:'batch',commands:[tool(fill())]});assert.equal(cad.serialize(),before);assert.deepEqual(p.project.nodes[0],cad.snapshot().nodes[0]);assert(Math.abs(p.project.nodes[1].stats.volume-400)<1e-4);const report=p.report.meshOperations[0].conversion;assert(report.stepReadback.valid);assert.equal(report.measurements.connection.samples,68);cad.apply(p);assert.equal(cad.state().undo,depth+1);const after=cad.serialize();cad.undo();assert.equal(cad.serialize(),before);cad.redo();assert.equal(cad.serialize(),after);await cad.open(after);assert.equal(cad.serialize(),after);const node=cad.snapshot().nodes[1];assert.equal(node.metadata.freecadSource.script.modules['formnaro_surfaces_v1.py'],moduleSource);const tree=await readFreeCADDocument(node.metadata.freecadSource);assert(tree.tree.objects.some(o=>o.type==='Part::FeaturePython'));
 const step=await cad.exportModel({format:'step',ids:[node.id]});assert(step.data.length>1000);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-surface-proof-'));try{const file=path.join(dir,'surface.fnpack');await writeFnpack(file,encodeFnpackProject(cad.snapshot()));const opened=await openFnpack(file);try{const resolver=createFnpackResolver({readBlock:async hash=>new Uint8Array(await opened.read(hash))}),restored=materializedFnpackProject(await resolver.hydrate(opened.index.project));assert.deepEqual(restored,cad.snapshot());await cad.open(restored);assert.equal(cad.serialize(),after);}finally{await opened.close();}}finally{assert.equal(path.dirname(dir),os.tmpdir());fs.rmSync(dir,{recursive:true,force:true});}
});
test('Actual planar relief transfers a measured STEP-safe face and invalid overhang keeps geometry and Undo exact',async t=>{
 const {cad}=setup(t),seed=await cad.preview({kind:'batch',commands:[{op:'create',type:'box',size:[20,20,10]},{op:'create',type:'box',size:[2,3,4],pos:[50,0,0]}]});cad.apply(seed);const before=cad.serialize(),depth=cad.state().undo,id=cad.snapshot().nodes[0].id,hit=await cad.query('rayPick',{ids:[id],ray:{origin:[0,0,100],direction:[0,0,-1]}}),p={kind:'surface-relief',faces:[{source:'source0',point:hit.point,normal:hit.normal}],loops:[[[-3,-2],[3,-2],[3,2],[-3,2]]],depth:2,mode:'add',rotation:0};
 const proposal=await cad.preview({kind:'batch',commands:[tool(p,[{name:'source0',target:id}]),{op:'update',target:id,set:{hidden:true}}]});assert.equal(cad.serialize(),before);assert(Math.abs(proposal.project.nodes[2].stats.volume-4048)<1e-4);assert.deepEqual(proposal.project.nodes[1],cad.snapshot().nodes[1]);cad.discard(proposal.previewId);
 await assert.rejects(cad.preview({kind:'batch',commands:[tool({...p,loops:[[[0,0],[40,0],[40,3],[0,3]]]},[{name:'source0',target:id}])]}),/innerhalb/);assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,depth);
 cad.apply(await cad.preview({kind:'batch',commands:[tool(p,[{name:'source0',target:id}]),{op:'update',target:id,set:{hidden:true}}]}));assert.equal(cad.state().undo,depth+1);cad.undo();assert.equal(cad.serialize(),before);
});
