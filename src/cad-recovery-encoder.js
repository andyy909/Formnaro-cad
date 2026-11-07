// Only the running autosave sends its confirmed snapshot to the encoder.
export function createCadRecoveryEncoder(createWorker=()=>new Worker(new URL('./cad-recovery-encoder-worker.js',import.meta.url),{type:'module'})){
 let worker=null,model=null,active=null;
 const counts={modelTransfers:0,modelEncodes:0};
 function stop(error){
  worker?.terminate();
  worker=null;
  model=null;
  const job=active;
  active=null;
  job?.reject(error);
 }
 function encode(format,confirmed,workspace){
  if(active)return Promise.reject(Error('Autosicherung wird bereits vorbereitet.'));
  if(!worker){
   const instance=worker=createWorker();
   instance.onmessage=({data})=>{
    if(worker!==instance||!active)return;
    const job=active;
    active=null;
    if(data.error){job.reject(Error(data.error));return;}
    counts.modelEncodes+=data.modelEncodes;
    job.resolve(data.value);
   };
   instance.onerror=event=>{if(worker===instance)stop(Error(event.message||'Speicheraufbereitung fehlgeschlagen.'));};
   instance.onmessageerror=()=>{if(worker===instance)stop(Error('Speicheraufbereitung konnte nicht übertragen werden.'));};
  }
  return new Promise((resolve,reject)=>{
   active={resolve,reject};
   try{
    const changed=model!==confirmed;
    worker.postMessage({format,workspace,...(changed?{model:confirmed}:{})});
    if(changed){model=confirmed;counts.modelTransfers++;}
   }catch(error){stop(error);}
  });
 }
 return {encode,stats:()=>({...counts}),dispose:()=>stop(Error('Speicheraufbereitung beendet.'))};
}
