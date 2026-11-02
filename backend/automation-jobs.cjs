const {randomUUID}=require('node:crypto');
const failure=(code,message)=>Object.assign(Error(message),{code});
const computations=new Set(['preview','analysis','export','save','apply']);
const cancelable=new Set(['preview','analysis','export']);
function createAutomationJobs({rpc,now=()=>Date.now(),limit=40,previewLifetime=15*60*1000}={}){
 const jobs=new Map(),closedPreviews=new Set();let observedRevision=null;let tail=Promise.resolve(),closed=false;
 const active=()=>[...jobs.values()].filter(j=>['queued','running','cancelling'].includes(j.state));
 const snapshot=j=>({jobId:j.jobId,method:j.method,label:j.label,state:j.state,revision:j.revision,phase:j.phase,commandIndex:j.commandIndex,operation:j.operation,progress:j.progress,memory:j.memory??null,updatedAt:j.updatedAt,startedAt:j.startedAt,finishedAt:j.finishedAt,estimatedRemainingMs:null,cancelable:cancelable.has(j.method)&&['queued','running'].includes(j.state),...(j.previewId?{previewId:j.previewId,expiresAt:j.expiresAt}:{}),...(j.committedRevision?{applied:true,committedRevision:j.committedRevision}:{}),...(j.error?{error:j.error}:{})});
 function find(args){if(!args||Object.keys(args).some(k=>k!=='jobId')||typeof args.jobId!=='string'||args.jobId.length>200)throw failure('INVALID_JOB','Eine gültige Auftragskennung wählen.');const job=jobs.get(args.jobId);if(!job)throw failure('UNKNOWN_JOB','Auftrag nicht mehr verfügbar.');return job;}
 function progress(job,value){
  if(!value||typeof value!=='object'||!['running','cancelling'].includes(job.state))return;
  if(job.revision===null&&typeof value.revision==='string'&&/^[0-9a-f]{16}$/.test(value.revision))job.revision=value.revision;
  if(value.memory&&typeof value.memory==='object'){job.memory={};for(const key of ['wasmReservedBytes','nativeOccupiedBytes','jsHeapBytes','trackedHandles','peakTrackedHandles']){const measured=value.memory[key];if(measured===null||Number.isFinite(measured)&&measured>=0)job.memory[key]=measured;}}
  if(typeof value.phase==='string')job.phase=value.phase.slice(0,80);
  if(Number.isInteger(value.commandIndex)&&value.commandIndex>=1&&value.commandIndex<=200)job.commandIndex=value.commandIndex;
  if(typeof value.operation==='string')job.operation=value.operation.slice(0,64);
  if(Number.isFinite(value.progress)&&value.progress>=0&&value.progress<=1)job.progress=value.progress;
  if(value.committed===true&&typeof value.revision==='string'&&/^[0-9a-f]{16}$/.test(value.revision))job.committedRevision=value.revision;
  job.updatedAt=now();
 }
 function invalidate(method,args,result){
  if(method==='apply'&&result?.applied||method==='discard'&&result?.discarded){for(const job of jobs.values())if(job.previewId===args.previewId){job.state=job.phase='consumed';job.result=null;}}
  const revision=result?.scene?.revision??(method==='save'?null:result?.revision);
  if(typeof revision==='string'&&['scene','apply'].includes(method)){observedRevision=revision;for(const job of jobs.values())if(job.state==='ready'&&job.revision!==revision){job.state=job.phase='stale';job.result=null;}}
 }
 function enqueue(method,args,signal){
  if(closed)throw failure('CAD_UNAVAILABLE','Schnittstelle beendet.');
  if(active().length>=16)throw failure('BUSY','Die Auftragswarteschlange ist voll.');
  const tracked=computations.has(method),controller=new AbortController();let job;
  if(tracked){
   while(jobs.size>=limit){const expired=[...jobs.values()].find(j=>!['queued','running','cancelling'].includes(j.state));if(!expired)break;jobs.delete(expired.jobId);}
   job={jobId:'cad-job-'+randomUUID(),method,label:typeof args?.label==='string'?args.label.slice(0,200):'',revision:typeof args?.revision==='string'?args.revision.slice(0,200):null,state:'queued',phase:'queued',commandIndex:null,operation:null,progress:null,updatedAt:now(),startedAt:null,finishedAt:null,controller,result:null,error:null};jobs.set(job.jobId,job);
  }
  const abort=()=>controller.abort(signal.reason);if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  const task=tail.then(async()=>{
   if(job?.state==='cancelled')throw Object.assign(Error('Auftrag abgebrochen.'),{name:'AbortError',code:'ABORTED'});
   controller.signal.throwIfAborted();if(job){job.state='running';job.phase=method;job.startedAt=job.updatedAt=now();}
   const result=await rpc(method,args,{signal:controller.signal,onProgress:value=>job&&progress(job,value)});
   if(job?.state==='cancelling')throw Object.assign(Error('Auftrag abgebrochen.'),{name:'AbortError',code:'ABORTED'});
   invalidate(method,args,result);
   if(job){job.state=method==='preview'?'ready':'completed';job.previewId=result?.previewId;job.expiresAt=(job.startedAt??now())+previewLifetime;job.phase=job.state;job.progress=1;job.finishedAt=job.updatedAt=now();if(method==='preview'){job.result=result;if(closedPreviews.has(job.previewId)){job.state=job.phase='consumed';job.result=null;}else if(observedRevision&&job.revision!==observedRevision){job.state=job.phase='stale';job.result=null;}const ready=[...jobs.values()].filter(j=>j.state==='ready');while(ready.length>10){const expired=ready.shift();expired.state='expired';expired.result=null;}}}
   return result;
  }).catch(error=>{
   if(job){job.state=controller.signal.aborted?(error.cancelConfirmed===false?'cancel-unconfirmed':'cancelled'):'failed';job.finishedAt=job.updatedAt=now();job.error={code:String(error.code??'CAD_ERROR').slice(0,80),message:String(error.message).slice(0,1500),...(error.feedback?{feedback:error.feedback}:{})};}
   throw error;
  }).finally(()=>signal?.removeEventListener('abort',abort));
  tail=task.catch(()=>{});return {job,task};
 }
 function expire(){for(const job of jobs.values())if(job.state==='ready'&&job.expiresAt<=now()){job.state=job.phase='expired';job.result=null;job.updatedAt=now();}}
 async function request(method,args={},options={}){
  expire();
  if(method==='status'){
   if(args.jobId!==undefined)return snapshot(find(args));
   if(!args||Object.keys(args).length)throw failure('INVALID_JOB','Status ohne Parameter oder mit jobId abfragen.');
   return {active:active().map(snapshot),readyPreviews:[...jobs.values()].filter(j=>j.state==='ready').map(snapshot),estimatedRemainingMs:null};
  }
  if(method==='cancel'){
   const job=find(args);if(!cancelable.has(job.method))throw failure('JOB_NOT_CANCELABLE','Übernahme und Speicherung können nicht als Berechnung abgebrochen werden.');
   if(job.state==='queued'){job.state='cancelled';job.finishedAt=job.updatedAt=now();job.controller.abort();}
   else if(job.state==='running'){job.state='cancelling';job.phase='cancelling';job.updatedAt=now();job.controller.abort();}
   return snapshot(job);
  }
  if(method==='preview_start'){const {job,task}=enqueue('preview',args);void task.catch(()=>{});return snapshot(job);}
  if(method==='preview_result'){
   const job=find(args);if(job.method!=='preview')throw failure('INVALID_JOB','Eine Vorschaukennung wählen.');
   if(job.state==='ready')return {...job.result,jobId:job.jobId};return snapshot(job);
  }
  return enqueue(method,args,options.signal).task;
 }
 return {request,observe(value){if(!value||typeof value!=='object')return;if(typeof value.closedPreviewId==='string'&&value.closedPreviewId.length<=200){closedPreviews.add(value.closedPreviewId);while(closedPreviews.size>100)closedPreviews.delete(closedPreviews.values().next().value);}if(typeof value.revision==='string'&&/^[0-9a-f]{16}$/.test(value.revision))observedRevision=value.revision;for(const job of jobs.values())if(job.state==='ready'){if(typeof value.closedPreviewId==='string'&&job.previewId===value.closedPreviewId){job.state='consumed';job.result=null;}else if(typeof value.revision==='string'&&/^[0-9a-f]{16}$/.test(value.revision)&&job.revision!==value.revision){job.state='stale';job.result=null;}}},close(){closed=true;for(const job of active())if(cancelable.has(job.method))job.controller.abort();}};
}
module.exports={createAutomationJobs};
