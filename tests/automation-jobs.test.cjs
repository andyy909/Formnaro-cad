const test=require('node:test'),assert=require('node:assert/strict');
const {createAutomationJobs}=require('../backend/automation-jobs.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('status bypasses held work, exposes progress and separates ready previews from running work',async()=>{
 let finish;const jobs=createAutomationJobs({rpc:async(method,args,{onProgress})=>{onProgress({phase:'construction',commandIndex:2,progress:.3,memory:{wasmReservedBytes:1024,nativeOccupiedBytes:null}});return new Promise(resolve=>{finish=resolve;});}});
 const started=await jobs.request('preview_start',{revision:'r'});await tick();const before=performance.now(),status=await jobs.request('status',{});assert.ok(performance.now()-before<100);assert.equal(status.active[0].jobId,started.jobId);assert.equal(status.active[0].commandIndex,2);assert.deepEqual(status.active[0].memory,{wasmReservedBytes:1024,nativeOccupiedBytes:null});assert.equal(status.active[0].estimatedRemainingMs,null);
 finish({previewId:'p',revision:'r'});await tick();assert.equal((await jobs.request('status',{})).active.length,0);assert.equal((await jobs.request('status',{})).readyPreviews[0].previewId,'p');assert.equal((await jobs.request('preview_result',{jobId:started.jobId})).previewId,'p');jobs.close();
});
test('cancel is scoped by job identity, acknowledges asynchronously and preserves a following preview',async()=>{
 let finish;const jobs=createAutomationJobs({rpc:async(method,args,{signal})=>new Promise((resolve,reject)=>{finish=resolve;signal.addEventListener('abort',()=>setImmediate(()=>reject(Object.assign(Error('aborted'),{code:'ABORTED'}))),{once:true});})});
 const first=await jobs.request('preview_start',{revision:'r'});await tick();await assert.rejects(jobs.request('cancel',{jobId:'wrong'}),{code:'UNKNOWN_JOB'});assert.equal((await jobs.request('cancel',{jobId:first.jobId})).state,'cancelling');await tick();await tick();assert.equal((await jobs.request('status',{jobId:first.jobId})).state,'cancelled');
 const second=await jobs.request('preview_start',{revision:'r'});await tick();finish({previewId:'next',revision:'r'});await tick();assert.equal((await jobs.request('preview_result',{jobId:second.jobId})).previewId,'next');jobs.close();
});

test('ready previews expire conservatively and early UI closure cannot revive a preview',async()=>{
 let time=100,finish;const jobs=createAutomationJobs({now:()=>time,previewLifetime:1000,rpc:async()=>new Promise(r=>{finish=r;})});
 const first=await jobs.request('preview_start',{revision:'0123456789abcdef'});await tick();finish({previewId:'expiry'});await tick();assert.equal((await jobs.request('status',{})).readyPreviews.length,1);time=1100;assert.equal((await jobs.request('preview_result',{jobId:first.jobId})).state,'expired');assert.equal((await jobs.request('status',{})).readyPreviews.length,0);
 const second=await jobs.request('preview_start',{revision:'0123456789abcdef'});await tick();jobs.observe({closedPreviewId:'early'});finish({previewId:'early'});await tick();assert.equal((await jobs.request('preview_result',{jobId:second.jobId})).state,'consumed');jobs.close();
});
test('export learns its original revision from renderer start progress',async()=>{
 let finish;const jobs=createAutomationJobs({rpc:async(method,args,{onProgress})=>{onProgress({phase:'export',revision:'0123456789abcdef'});return new Promise(r=>{finish=r;});}});const pending=jobs.request('export',{});await tick();assert.equal((await jobs.request('status',{})).active[0].revision,'0123456789abcdef');finish({ok:true});await pending;jobs.close();
});
