import {createCadDisplayDecoder} from './cad-display-cache.js';
function aborted(message='CAD-Berechnung abgebrochen.'){
  const error=new Error(message);error.name='AbortError';error.code='ABORTED';return error;
}

// One persistent worker, recycled on cancellation/crash. There is deliberately
// no import of the mesh kernel. The worker factory is supplied by the host.
export function createCadWorkerClient({createWorker,confirmed=()=>null,initialization=()=>({}),onError=()=>{}}={}){
  if(typeof createWorker!=='function')throw new TypeError('CAD-Worker-Factory fehlt.');
  let worker=null,generation=0,sequence=0,disposed=false,recycleRequested=false,heapBytes=0;
  const jobs=new Map(),displayDecoder=createCadDisplayDecoder();let measuring=false;const samples=[];let sentMessages=0,receivedMessages=0,sentJsonBytes=0,receivedJsonBytes=0,measurementErrors=0;const clock=()=>globalThis.performance?.now?.()??Date.now();
  function payloadBytes(value){if(!measuring)return null;try{return new TextEncoder().encode(JSON.stringify(value)).byteLength;}catch{measurementErrors++;return null;}}
  function send(instance,value){sentMessages++;const bytes=payloadBytes(value);if(bytes!==null)sentJsonBytes+=bytes;instance.postMessage(value);}

  function stop(error){
    generation++;const old=worker;worker=null;recycleRequested=false;heapBytes=0;displayDecoder.clear();
    if(old){old.onmessage=null;old.onerror=null;old.terminate();}
    for(const job of jobs.values()){job.cleanup();job.reject(error);}
    jobs.clear();
  }
  function ensure(){
    if(disposed)throw aborted('CAD-Dienst wurde geschlossen.');
    if(worker)return worker;
    const currentGeneration=++generation,instance=createWorker();worker=instance;
    instance.onmessage=({data})=>{
      if(worker!==instance||data.generation!==currentGeneration)return;
      receivedMessages++;const received=payloadBytes(data);if(received!==null)receivedJsonBytes+=received;
      const job=jobs.get(data.id);if(!job||data.revision!==job.revision)return;
      if(Number.isSafeInteger(data.heapBytes)&&data.heapBytes>=0)heapBytes=data.heapBytes;
      if(data.type==='hostRequest'){
        if(!Number.isSafeInteger(data.callId)||job.hostCalls.has(data.callId)||job.hostCalls.size>=500){stop(Object.assign(Error('Ungültige native Worker-Rückfrage.'),{code:'CAD_HOST_REQUEST'}));return;}
        job.hostCalls.add(data.callId);Promise.resolve().then(()=>{if(!job.host)throw Object.assign(Error('FreeCAD-Abhängigkeit benötigt die Desktop-Parameteraktualisierung.'),{code:'CAD_HOST_UNAVAILABLE'});return job.host(data.request,{signal:job.hostAbort.signal});}).then(value=>{if(worker===instance&&jobs.get(data.id)===job)send(instance,{type:'hostReply',id:data.id,generation:currentGeneration,revision:job.revision,callId:data.callId,ok:true,value});},error=>{if(worker===instance&&jobs.get(data.id)===job)send(instance,{type:'hostReply',id:data.id,generation:currentGeneration,revision:job.revision,callId:data.callId,ok:false,message:error.message,code:error.code});});return;
      }
      if(data.type==='progress'){job.progress?.(data.value);return;}
      if(!['result','error'].includes(data.type))return;
      jobs.delete(data.id);job.cleanup();if(measuring){samples.push({job:job.diagnostics.job,operation:job.diagnostics.operation??null,elapsedMs:clock()-job.started,resultJsonBytes:received,heapBytes});if(samples.length>128)samples.shift();}
      recycleRequested ||= data.recycleWorker===true;
      if(data.type==='error'){const error=new Error(data.message||'CAD-Berechnung fehlgeschlagen.');error.code=data.code||'CAD_ERROR';if(data.feedback)error.feedback=data.feedback;if(typeof data.stack==='string')error.stack=data.stack;try{onError(error,{...job.diagnostics,phase:data.phase});}catch{}job.reject(error);if(error.code==='CAD_KERNEL_FATAL')stop(error);}
      else {try{job.resolve(job.diagnostics.job==='display'?displayDecoder.decode(data.result,job.displayMeshes):data.result);}catch(error){job.reject(error);}}
      // Queued jobs must finish before retiring; no rejected results or new
      // model state. A later request initializes from its confirmed snapshot.
      if(worker===instance)retireIfIdle();
    };
    instance.onerror=event=>{if(worker===instance){const error=new Error(event.message||'CAD-Worker abgestürzt.');try{onError(error,{source:'cad-worker-crash'});}catch{}stop(error);}};
    try{send(instance,{type:'initialize',generation:currentGeneration,confirmed:confirmed(),resources:initialization()});}
    catch(error){stop(error);throw error;}
    return instance;
  }
  function retireIfIdle(){if(worker&&recycleRequested&&!jobs.size){const instance=worker;generation++;worker=null;recycleRequested=false;heapBytes=0;displayDecoder.clear();instance.onmessage=null;instance.onerror=null;instance.terminate();}}
  function trim(){if(heapBytes<512*1024*1024)return false;recycleRequested=true;retireIfIdle();return true;}
  function run(request,{revision,signal,progress,host}={}){
    if(signal?.aborted)return Promise.reject(aborted());
    let instance;try{instance=ensure();}catch(error){return Promise.reject(error);}
    return new Promise((resolve,reject)=>{
      const id=++sequence,onAbort=()=>stop(aborted()),hostAbort=new AbortController();
      const cleanup=()=>{hostAbort.abort();signal?.removeEventListener('abort',onAbort);};
      const diagnostics={source:'cad-worker',job:request.job,operation:request.operation?.name??request.operation?.kind??request.query?.kind,nodeCount:request.project?.nodes?.length??0,heapBytes};
      const displayMeshes=request.job==='display'?displayDecoder.capture():undefined;
      jobs.set(id,{revision,resolve,reject,cleanup,progress,host,hostAbort,hostCalls:new Set(),diagnostics,started:clock(),displayMeshes});signal?.addEventListener('abort',onAbort,{once:true});
      try{send(instance,{type:'compute',id,generation,revision,request:displayMeshes?{...request,knownMeshes:[...displayMeshes.keys()]}:request});}
      catch(error){jobs.delete(id);cleanup();reject(error);}
    });
  }
  return {run,trim,measureTransport:value=>{measuring=!!value;samples.length=0;sentMessages=receivedMessages=sentJsonBytes=receivedJsonBytes=measurementErrors=0;},transportState:()=>({enabled:measuring,sentMessages,receivedMessages,sentJsonUtf8Bytes:measuring?sentJsonBytes:null,receivedJsonUtf8Bytes:measuring?receivedJsonBytes:null,measurementErrors,samples:samples.map(v=>({...v})),payloadDefinition:'UTF-8 JSON representation of full messages; not Chromium structured-clone wire bytes. Measurement serialization overhead is included in observed request latency.'}),cancel:()=>stop(aborted()),dispose:()=>{disposed=true;stop(aborted());},
    state:()=>({generation,running:jobs.size,loaded:!!worker,disposed,heapBytes,displayCache:displayDecoder.state()})};
}

// CAD and display caches have independent instances and budgets. Eviction calls
// dispose exactly once, so retained OpenCascade handles do not grow unbounded.
export function createCadCache({maxEntries=128,maxBytes=64*1024*1024,dispose=()=>{}}={}){
  if(!Number.isSafeInteger(maxEntries)||maxEntries<1||!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new TypeError('Ungültige Cachegrenze.');
  const values=new Map();let bytes=0;
  function remove(key){const entry=values.get(key);if(!entry)return false;values.delete(key);bytes-=entry.bytes;dispose(entry.value);return true;}
  function get(key){const entry=values.get(key);if(!entry)return undefined;values.delete(key);values.set(key,entry);return entry.value;}
  function find(predicate){for(const key of [...values.keys()].reverse()){const entry=values.get(key);if(predicate(entry.value,key))return get(key);}return undefined;}
  function set(key,value,cost){
    if(!Number.isSafeInteger(cost)||cost<1)throw new TypeError('CAD-Cache benötigt eine positive Bytegröße.');
    // A too-large value remains owned by the caller; leave an existing entry intact.
    if(cost>maxBytes)return false;
    if(values.get(key)?.value===value)throw new TypeError('Dasselbe CAD-Handle darf nicht erneut im Cache gespeichert werden.');
    remove(key);
    while(values.size>=maxEntries||bytes+cost>maxBytes)remove(values.keys().next().value);
    values.set(key,{value,bytes:cost});bytes+=cost;return true;
  }
  return {get,find,set,delete:remove,clear:()=>{for(const key of [...values.keys()])remove(key);},state:()=>({entries:values.size,bytes,maxEntries,maxBytes})};
}
