import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import loader from '../cad-kernel-build/runtime/formnaro_cad.js';
import {createCadService} from '../src/cad-service.js';
import {createCadCommandRouter} from '../src/cad-command-router.js';
import {createCadProject,serializeCadProject,parseCadProject} from '../src/cad-project.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {cadIdentity} from '../src/cad-affine.js';
import {importCadStep} from '../src/cad-step-io.js';
import {encodeFnpackProject,createFnpackResolver,materializedFnpackProject} from '../src/cad-fnpack-data.js';
import {writeFnpack,openFnpack} from '../backend/fnpack.cjs';
const oc=await loader({print:()=>{},printErr:()=>{}}),near=(a,b)=>assert(Math.abs(a-b)<1e-5,`${a} != ${b}`);
function fixture(){const service=createCadService({oc}),router=createCadCommandRouter({oc,service}),store=createCadTransactions({initial:createCadProject(),build:async(p,c)=>c.operation?(await router.run(p,c.operation,{baseline:c.baseline})).project:service.rebuild(p,{baseline:c.baseline})});return {service,router,store};}
test('Three-profile ordered loft preserves sources through edit, exact Undo, STEP and physical format24 FNPACK',async()=>{
 const {service,store}=fixture(),preview=operation=>store.preview({revision:store.revision(),project:store.snapshot(),operation});try{
  const seed=await preview({kind:'batch',commands:[0,10,30].map(z=>{const frame=cadIdentity();frame[14]=z;return {op:'sketch',name:'Plane '+z,sketch:{version:1,kind:'rectangle',variables:[],dimensions:{width:'10',depth:'10',height:'1'},points:[]},frame};})});store.apply(seed);
  const before=serializeCadProject(store.snapshot()),ids=store.snapshot().nodes.map(n=>n.id),p=await preview({kind:'batch',commands:[{op:'profileModeling',kind:'loft',targets:ids,orientation:'automatic',profileOrder:[0,1,2],as:'loft'}]});
  assert.equal(serializeCadProject(store.snapshot()),before);near(p.project.nodes.at(-1).stats.volume,3000);store.apply(p);const built=serializeCadProject(store.snapshot()),loft=store.snapshot().nodes.at(-1);assert.deepEqual(store.snapshot().nodes.slice(0,-1),JSON.parse(before).nodes);store.undo();assert.equal(serializeCadProject(store.snapshot()),before);store.redo();assert.equal(serializeCadProject(store.snapshot()),built);
  const changed=await preview({kind:'batch',commands:[{op:'editModeling',target:loft.id,operation:{kind:'loft',orientation:'preserve',profileOrder:[0,1,2]}}]});near(changed.project.nodes.at(-1).stats.volume,3000);assert.deepEqual(changed.project.nodes.at(-1).children,loft.children);store.discard(changed.previewId);
  const step=importCadStep(oc,service.exportStep(store.snapshot(),{ids:[loft.id]}));near(step.stats.volume,3000);assert.equal(step.stats.solids,1);
  const saved=parseCadProject(built);assert.equal(saved.version,24);assert.throws(()=>parseCadProject({...saved,version:23}),/24/);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'formnaro-p6-'));try{const file=path.join(dir,'loft.fnpack');await writeFnpack(file,encodeFnpackProject(saved));const opened=await openFnpack(file);try{assert.equal(opened.index.project.version,24);const resolver=createFnpackResolver({readBlock:async hash=>new Uint8Array(await opened.read(hash))}),restored=materializedFnpackProject(await resolver.hydrate(opened.index.project));assert.deepEqual(restored,saved);const rebuilt=await service.rebuild(restored);near(rebuilt.nodes.at(-1).stats.volume,3000);}finally{await opened.close();}}finally{assert.equal(path.dirname(dir),os.tmpdir());await fs.rm(dir,{recursive:true,force:true});}
 }finally{service.dispose();}
});
test('V4 analytic curve and its compound sweep survive native STEP and complete source rebuild',async()=>{
 const {service,store}=fixture(),preview=operation=>store.preview({revision:store.revision(),project:store.snapshot(),operation});try{
  const sketch={version:4,kind:'profile',variables:[],dimensions:{height:'2'},constraints:[],elements:[{id:'curve',type:'bezier',start:['0','0'],control1:['0','10'],control2:['10','10'],end:['10','0'],construction:false},{id:'base',type:'line',start:['10','0'],end:['0','0'],construction:false}],loops:[{id:'outer',role:'outer',elements:['curve','base']}]};
  store.apply(await preview({kind:'batch',commands:[{op:'sketch',sketch,name:'Arch',frame:cadIdentity()}]}));const before=store.serialize(),node=store.snapshot().nodes[0],arch=importCadStep(oc,service.exportStep(store.snapshot(),{ids:[node.id]}));near(arch.stats.volume,120);assert.equal(arch.stats.solids,1);
  const path={kind:'segments',orientation:'corrected',segments:[{kind:'line',start:[0,0,0],end:[0,0,15]},{kind:'line',start:[0,0,15],end:[0,0,30]}]},p=await preview({kind:'batch',commands:[{op:'profileModeling',kind:'sweep',targets:[node.id],path}]});near(p.project.nodes.at(-1).stats.volume,1800);assert.deepEqual(p.project.nodes[0],node);assert.equal(store.serialize(),before);store.apply(p);const saved=store.serialize(),reopened=parseCadProject(saved);assert.equal(reopened.version,24);assert.deepEqual(reopened.nodes.at(-1).children[0].recipe.sketch,sketch);assert.deepEqual(reopened.nodes.at(-1).modeling.path,path);
  const rebuilt=await service.rebuild(reopened);near(rebuilt.nodes.at(-1).stats.volume,1800);near(importCadStep(oc,service.exportStep(rebuilt,{ids:[rebuilt.nodes.at(-1).id]})).stats.volume,1800);store.undo();assert.equal(store.serialize(),before);store.redo();assert.equal(store.serialize(),saved);
 }finally{service.dispose();}
});
