const fs=require('node:fs/promises'),path=require('node:path'),{createReadStream}=require('node:fs'),{createHash,randomUUID}=require('node:crypto');
const MODEL=Object.freeze({file:'ggml-large-v3-turbo-q5_0.bin',bytes:574041195,sha256:'394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2',url:'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin'});
function createModelStore({directory,model=MODEL,fetchImpl=globalThis.fetch,timeoutMs=30*60*1000}={}){
 let job=null,lastError=null,verified=null;
 const target=path.join(directory,model.file);
 async function installed(){
  try{
   const stat=await fs.lstat(target);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==model.bytes)return false;
   const key=stat.size+':'+stat.mtimeMs+':'+stat.ctimeMs;if(verified===key)return true;
   const hash=createHash('sha256');for await(const chunk of createReadStream(target))hash.update(chunk);
   if(hash.digest('hex')!==model.sha256)return false;verified=key;return true;
  }catch{return false;}
 }
 function progress(){return {downloading:!!job,downloadedBytes:job?.received??0,modelBytes:model.bytes,downloadError:lastError};}
 function cancel(){if(!job)return false;job.controller.abort();return true;}
 async function download(){
  if(job)throw Error('Das Sprachmodell wird bereits heruntergeladen.');
  const current={controller:new AbortController(),received:0};job=current;lastError=null;
  current.done=(async()=>{
   const {signal}=current.controller;let temporary,handle;
   const timer=setTimeout(()=>current.controller.abort(),timeoutMs);
   try{
    if(await installed())return {installed:true};signal.throwIfAborted();
    await fs.mkdir(directory,{recursive:true});
    temporary=path.join(directory,'.'+model.file+'.'+randomUUID()+'.part');
    const response=await fetchImpl(model.url,{signal,redirect:'follow',credentials:'omit'});
    if(!response.ok||!response.body)throw Error('Download nicht möglich (HTTP '+response.status+').');
    const size=response.headers.get('content-length');if(size!==null&&Number(size)!==model.bytes)throw Error('Unerwartete Größe des Sprachmodells.');
    handle=await fs.open(temporary,'wx');const hash=createHash('sha256');
    for await(const chunk of response.body){
     signal.throwIfAborted();current.received+=chunk.length;
     if(current.received>model.bytes)throw Error('Das Sprachmodell überschreitet die erwartete Größe.');
     hash.update(chunk);let offset=0;while(offset<chunk.length){const r=await handle.write(chunk,offset,chunk.length-offset);if(!r.bytesWritten)throw Error('Sprachmodell konnte nicht gespeichert werden.');offset+=r.bytesWritten;}
    }
    if(current.received!==model.bytes||hash.digest('hex')!==model.sha256)throw Error('Download unvollständig oder Prüfsumme falsch. Bitte erneut herunterladen.');
    await handle.sync();await handle.close();handle=null;signal.throwIfAborted();
    await fs.rename(temporary,target);temporary=null;verified=null;
    return {installed:true};
   }catch(error){lastError=signal.aborted?'Download abgebrochen.':error.code==='ENOSPC'?'Nicht genügend Speicherplatz für das Sprachmodell.':error.message;throw Error(lastError);}
   finally{clearTimeout(timer);await handle?.close().catch(()=>{});if(temporary)await fs.rm(temporary,{force:true}).catch(()=>{});if(job===current)job=null;}
  })();
  return current.done;
 }
 return {target,installed,progress,download,cancel,hasActive:()=>!!job,async dispose(){const current=job;if(current){cancel();await current.done.catch(()=>{});}}};
}
module.exports={MODEL,createModelStore};
