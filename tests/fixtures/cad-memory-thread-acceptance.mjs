import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createCadController} from '../../src/cad-controller.js';
import {createCadAutomationAccess} from '../../src/cad-automation-access.js';
import {createCadProject,parseCadProject,cadProjectRevision,serializeCadProject} from '../../src/cad-project.js';
import {buildCadThread,screwSections,screwSurfaceDefinition} from '../../src/cad-screw-surfaces.js';
import {validateCadSolid,writeCadBrep,readCadBrep} from '../../src/cad-native-kernel.js';
import {assertCadRecipeTolerance} from '../../src/cad-recipes.js';
import {exportCadStep,importCadStep} from '../../src/cad-step-io.js';
import {cadNativeMemory} from '../../src/cad-native-memory.js';
import {cadDisplayPreset,CAD_QUALITY_DEFAULTS} from '../../src/cad-quality.js';
const params=(patch={})=>({kind:'external',profile:'trapezoid',diameter:12,pitch:4,length:80,hand:'right',starts:1,phase:0,clearance:0,leadIn:0,head:'none',...patch});
export async function memoryRecovery(){
 let count=0;const factory=()=>{const n=++count,w=new Worker(new URL('./cad-node-worker.mjs',import.meta.url),{workerData:{memoryPolicy:{retireBytes:1,stopBytes:n===1?1:2*1024**3}}}),adapter={postMessage:v=>w.postMessage(v),terminate:()=>w.terminate()};w.on('message',v=>adapter.onmessage?.({data:v}));w.on('error',e=>adapter.onerror?.(e));return adapter;};
 const controller=createCadController({createWorker:factory}),access=createCadAutomationAccess({controller,getModelChecksEnabled:()=>false});
 try{const before=controller.revision(),initial=controller.snapshot();await assert.rejects(access.preview({revision:before,commands:[{op:'create',type:'box',size:[10,8,6]}],checks:[]}),{code:'CAD_MEMORY_BUDGET'});assert.equal(controller.revision(),before);assert.equal(controller.state().undo,0);
 const p=await access.preview({revision:before,commands:[{op:'create',type:'box',size:[10,8,6],as:'box'}],checks:[]});await controller.describe();assert.ok(controller.getPreview(p.previewId));const applied=await access.apply({revision:before,previewId:p.previewId});assert.ok(applied.applied);assert.equal(controller.state().undo,1);assert.equal(controller.snapshot().nodes.length,1);assert.equal(controller.snapshot().nodes[0].stats.volume,480);const after=controller.revision();await controller.describe();assert.equal(controller.revision(),after);controller.undo();assert.deepEqual(controller.snapshot(),initial);assert.ok(count>=3);return {status:'completed',workerCount:count,retirements:controller.state().worker.retirements,budgetFailureAtomic:true,previewSurvivedRenewal:true,undoPreserved:true};
 }finally{controller.dispose();}
}
export async function recoveryAfterCommit(){
 let requestBudget=false,workers=0;const factory=()=>{workers++;const w=new Worker(new URL('./cad-node-worker.mjs',import.meta.url),{workerData:{memoryPolicy:{retireBytes:1024**3,stopBytes:2*1024**3}}}),adapter={postMessage:v=>{if(requestBudget&&v.type==='compute'){requestBudget=false;w.postMessage({type:'test-memory-limit'});}w.postMessage(v);},terminate:()=>w.terminate()};w.on('message',v=>adapter.onmessage?.({data:v}));w.on('error',e=>adapter.onerror?.(e));return adapter;};
 const controller=createCadController({createWorker:factory}),access=createCadAutomationAccess({controller,getModelChecksEnabled:()=>false});try{
 const initial=controller.revision(),first=await access.preview({revision:initial,commands:[{op:'create',type:'thread',size:[12,12,12],params:params({length:12}),as:'thread'}],checks:[]});await access.apply({revision:first.revision,previewId:first.previewId});const committed=controller.serialize(),revision=controller.revision();const second=await access.preview({revision,commands:[{op:'create',type:'box',size:[2,2,2]}],checks:[]});requestBudget=true;await assert.rejects(controller.describe(),{code:'CAD_MEMORY_BUDGET'});assert.equal(controller.serialize(),committed);assert.equal(controller.state().undo,1);await controller.describe();assert.equal(controller.state().worker.memory.constructions,0);assert.equal(controller.serialize(),committed);assert.ok(controller.getPreview(second.previewId));await access.apply({revision,previewId:second.previewId});assert.equal(controller.state().undo,2);controller.undo();assert.equal(controller.revision(),revision);controller.undo();assert.equal(controller.revision(),initial);return {status:'completed',workers,confirmedGeometryRetained:true,pendingPreviewRetained:true,restoredConstructionCount:0,undoPreserved:true};
 }finally{controller.dispose();}
}
export async function threadAcceptance(name,oc,service){
 if(name.startsWith('thread-variant')){
  const rows=[];let index=0;for(const hand of ['right','left'])for(const outerShape of ['round','hex'])for(const clearance of [0,.18])for(const leadIn of [0,.5]){const selected=Number(name.slice('thread-variant-'.length));if(Number.isInteger(selected)&&index++!==selected)continue;const phaseLog=[],p=params({kind:'nut',length:24,outerDiameter:24,hand,outerShape,clearance,leadIn}),start=performance.now(),shape=buildCadThread(oc,p,{onPhase:value=>phaseLog.push(value)});try{const checked=validateCadSolid(oc,shape),maximum=assertCadRecipeTolerance(oc,shape,1e-4);assert.equal(checked.solids,1);rows.push({hand,outerShape,clearance,leadIn,maximumTolerance:maximum,allowedTolerance:.00005,volume:checked.volume,elapsedMs:performance.now()-start,phases:phaseLog.map(({phase,maximumTolerance,allowedTolerance})=>({phase,maximumTolerance,allowedTolerance}))});}finally{shape.delete();}}
  return {status:'completed',rows,memory:cadNativeMemory(oc).state()};
 }
 if(['thread-reference','thread-segmented'].includes(name)){const start=performance.now(),shape=buildCadThread(oc,params({length:248,leadIn:.5}),{maxTurnsPerSection:name==='thread-reference'?240:8});try{return {status:'completed',elapsedMs:performance.now()-start,stats:validateCadSolid(oc,shape),memory:cadNativeMemory(oc).state(),sectionLimitTurns:name==='thread-reference'?240:8};}finally{shape.delete();}}
 if(name==='thread-comparison'){
  const rows=[];for(const maxTurnsPerSection of [240,8]){const start=performance.now(),shape=buildCadThread(oc,params(),{maxTurnsPerSection});try{const checked=validateCadSolid(oc,shape);rows.push({maxTurnsPerSection,elapsedMs:performance.now()-start,volume:checked.volume,solids:checked.solids,brepBytes:writeCadBrep(oc,shape).length,memory:cadNativeMemory(oc).state()});}finally{shape.delete();}}assert.ok(Math.abs(rows[0].volume-rows[1].volume)<.02);return {status:'completed',rows};
 }
 if(name==='thread-roundtrip'){
  const recipe={type:'thread',size:[12,12,248],params:params({length:248,leadIn:.5})};let project=createCadProject({nodes:[service.nativeNode(recipe,{id:'spindle'})]});const before=project.nodes[0].brep.data,volume=project.nodes[0].stats.volume;
  const serialized=serializeCadProject(project);project=parseCadProject(serialized);for(let i=0;i<2;i++){service.releaseCaches();project=await service.rebuild(project);assert.equal(project.nodes[0].brep.data,before);}const shape=readCadBrep(oc,project.nodes[0].brep.data);let step;try{step=exportCadStep(oc,[{name:'Spindle',shape}]);}finally{shape.delete();}const reopened=importCadStep(oc,step);assert.equal(reopened.stats.solids,1);assert.ok(Math.abs(reopened.stats.volume-volume)<.02);
  return {status:'completed',ocadBytes:serialized.length,stepBytes:step.length,volume,stepVolume:reopened.stats.volume,unchangedBrep:true,memory:service.memoryState()};
 }
 if(name==='geometry-cache-display'){
  const recipe={type:'thread',size:[12,12,12],params:params({length:12})},a=service.nativeNode(recipe,{id:'a'}),b=service.nativeNode(recipe,{id:'b',transform:[1,0,0,0,0,0,1,0,0,-1,0,0,20,0,0,1]});assert.equal(service.constructionState().total,1);const changed=structuredClone(recipe);changed.params.pitch=3;service.nativeNode(changed,{id:'c'});assert.equal(service.constructionState().total,2);
  const project=createCadProject({nodes:[a,b]}),before=serializeCadProject(project),normal=service.display(project),coarse=service.display(project,cadDisplayPreset(CAD_QUALITY_DEFAULTS,'simplified').display);assert.equal(serializeCadProject(project),before);assert.ok(coarse[0].mesh.triangles.length<normal[0].mesh.triangles.length);assert.equal(service.constructionState().total,2);assert.equal(a.brep.data,b.brep.data);const entries=service.cacheState().entries;service.releaseCaches();assert.equal(service.cacheState().entries,0);const restored=await service.rebuild(project);assert.equal(restored.nodes[0].brep.data,a.brep.data);return {status:'completed',constructions:service.constructionState(),normalTriangles:normal[0].mesh.triangles.length/3,coarseTriangles:coarse[0].mesh.triangles.length/3,clearedNativeCacheEntries:entries,sourcesUnchanged:true,memory:service.memoryState()};
 }
 throw Error('Unknown acceptance '+name);
}
