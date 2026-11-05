const path=require('node:path');
const {Worker}=require('node:worker_threads');
const entry=path.join(__dirname,'program-storage-worker.cjs');
const abortError=()=>new DOMException('Paketausgabe abgebrochen.','AbortError');

function runStorageWorker(job,{signal}={}){
 if(signal?.aborted)return Promise.reject(abortError());
 if(process.type==='browser'&&process.versions.electron){
  return runStorageProcess(require('electron').utilityProcess,job,signal);
 }
 const cancelled=signal?new Int32Array(new SharedArrayBuffer(4)):null;
 const abort=()=>Atomics.store(cancelled,0,1);
 signal?.addEventListener('abort',abort,{once:true});
 return new Promise((resolve,reject)=>{
  const worker=new Worker(entry,{workerData:{...job,cancelled}});
  worker.once('message',result=>result.ok?resolve(result.value):reject(Object.assign(Error(result.error),{code:result.code})));
  worker.once('error',reject);
  worker.once('exit',()=>reject(Error('Die automatische Sicherung wurde vorzeitig beendet.')));
 }).finally(()=>signal?.removeEventListener('abort',abort));
}
function runStorageProcess(utilityProcess,job,signal){
 const child=utilityProcess.fork(entry,[],{serviceName:'Formnaro Autosicherung',stdio:'ignore'});
 let started=false,startError,timer;
 const abort=()=>{if(started)child.postMessage({cancel:true});else child.kill();};
 signal?.addEventListener('abort',abort,{once:true});
 return new Promise((resolve,reject)=>{
  timer=setTimeout(()=>{
   startError=Error('Der Speicherprozess konnte nicht gestartet werden.');
   child.kill();
   reject(startError);
  },15000);
  child.on('message',result=>{
   if(result.ready&&!started){
    clearTimeout(timer);
    if(signal?.aborted||startError){child.kill();return;}
    started=true;
    try{child.postMessage({job});}catch(error){child.kill();reject(error);}
    return;
   }
   if(started)result.ok?resolve(result.value):reject(Object.assign(Error(result.error),{code:result.code}));
  });
  child.once('exit',()=>reject(startError??(signal?.aborted?abortError():Error('Die automatische Sicherung wurde vorzeitig beendet.'))));
 }).finally(()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);});
}
module.exports={runStorageWorker};
