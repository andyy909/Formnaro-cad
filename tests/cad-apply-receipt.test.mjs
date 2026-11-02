import test from 'node:test';import assert from 'node:assert/strict';
import {createCadProject} from '../src/cad-project.js';
import {cadIdentity} from '../src/cad-affine.js';
import {createCadController} from '../src/cad-controller.js';
import {createCadAutomationAccess} from '../src/cad-automation-access.js';
const body=id=>({id,kind:'cad',name:id,source:'native',solid:true,transform:cadIdentity(),recipe:{type:'box',size:[10,8,4]},brep:{format:'OpenCascade-BRep',data:'storage-only-'+id,triangulation:false},stats:{bounds:{min:[-5,-4,0],max:[5,4,4]},volume:320,solids:1}});
async function fixture({refreshError,onChange}={}){
 let scene,fail=refreshError;
 const controller=createCadController({initial:createCadProject({nodes:[body('a'),body('b')]}),createWorker:()=>{throw Error('Joint receipt must not construct native geometry');},onChange});
 const access=createCadAutomationAccess({controller,getScene:()=>scene,refresh:async()=>{if(fail)throw fail;scene={revision:controller.revision(),objects:[]};}});
 const preview=await access.preview({revision:controller.revision(),label:'revolute fixture',commands:[{op:'joint',action:'create',joint:{id:'joint-ab',kind:'revolute',parentId:'a',childId:'b',origin:[0,0,0]}}],checks:[]});
 return {controller,access,request:{revision:preview.revision,previewId:preview.previewId},recover:()=>{fail=null;}};
}
test('post-commit display failure returns the actual receipt; retry refreshes without another Undo',async()=>{
 const f=await fixture({refreshError:Object.assign(Error('Injected display trap'),{code:'CAD_KERNEL_FATAL'})});
 try{
  const depth=f.controller.state().undo,result=await f.access.apply(f.request);
  assert.equal(result.applied,true);assert.equal(result.revision,f.controller.revision());assert.equal(result.refresh.status,'failed');assert.equal(result.refresh.nextAction,'repeat');assert.equal(result.refresh.retryable,true);assert.equal(result.refresh.error.nextAction,undefined);assert.equal(result.refresh.error.code,'CAD_KERNEL_FATAL');assert.equal(result.scene,undefined);assert.equal(f.controller.state().undo,depth+1);
  f.recover();const retry=await f.access.apply(f.request);assert.equal(retry.applied,true);assert.equal(retry.alreadyApplied,true);assert.equal(retry.label,result.label);assert.deepEqual(retry.aliases,result.aliases);assert.equal(retry.refresh.status,'completed');assert.equal(retry.scene.revision,result.revision);assert.equal(f.controller.state().undo,depth+1);
 }finally{f.controller.dispose();}
});
test('lost successful Apply response can be repeated with original identity and revision',async()=>{
 const f=await fixture({});try{const result=await f.access.apply(f.request),depth=f.controller.state().undo,retry=await f.access.apply(f.request);assert.equal(retry.alreadyApplied,true);assert.equal(retry.revision,result.revision);assert.equal(f.controller.state().undo,depth);assert.equal(retry.label,'revolute fixture');}finally{f.controller.dispose();}
});
test('rejected Apply preserves revision/history; stale receipt never masquerades as a new commit',async()=>{
 const f=await fixture({});try{const before=f.controller.serialize(),depth=f.controller.state().undo;await assert.rejects(f.access.apply({...f.request,revision:'wrong'}),{code:'STALE_REVISION'});assert.equal(f.controller.serialize(),before);assert.equal(f.controller.state().undo,depth);await f.access.apply(f.request);f.controller.undo();await assert.rejects(f.access.apply(f.request),{code:'STALE_REVISION'});}finally{f.controller.dispose();}
});
test('synchronous onChange failure after commit is reported as an update warning',async()=>{
 const f=await fixture({onChange:()=>{throw Error('Injected view notification failure');}});try{const result=await f.access.apply(f.request);assert.equal(result.applied,true);assert.equal(result.revision,f.controller.revision());assert.equal(result.refresh.status,'failed');assert.equal(f.controller.state().undo,1);assert.equal(f.controller.getPreview(f.request.previewId),undefined);}finally{f.controller.dispose();}
});
