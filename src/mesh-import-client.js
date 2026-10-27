/** Dedicated disposable worker: cancellation interrupts synchronous parsing and
 * WASM simplification too. Does not terminate a modelling/kernel worker. */
export function prepareMeshImport(buffer,options,{signal,isCurrent=()=>true,onProgress=()=>{},createWorker=()=>new Worker(new URL('./mesh-import-worker.js',import.meta.url),{type:'module'}),timeoutMs=180000}={}){
 return new Promise((resolve,reject)=>{
  const cancelled=()=>Object.assign(Error('Netzimport abgebrochen.'),{name:'AbortError'});
  if(signal?.aborted||!isCurrent()){reject(cancelled());return;}
  let worker,timer,currentTimer,done=false;
  function finish(error,result){if(done)return;done=true;clearTimeout(timer);clearInterval(currentTimer);signal?.removeEventListener('abort',onAbort);worker?.terminate();error?reject(error):resolve(result);}
  function onAbort(){finish(cancelled());}
  try{worker=createWorker();signal?.addEventListener('abort',onAbort,{once:true});timer=setTimeout(()=>finish(Error('Netzimport dauert zu lange. Kleinere Datei oder Arbeitskopie wählen.')),timeoutMs);currentTimer=setInterval(()=>{if(!isCurrent())onAbort();},100);
   worker.onmessage=({data})=>{if(done)return;if(data.type==='progress'){onProgress(data.message);return;}if(data.type==='result')finish(null,data.result);else if(data.type==='error')finish(Object.assign(Error(data.message),{code:data.code,name:data.name||'Error'}));};
   worker.onerror=()=>finish(Error('Netzimport-Worker fehlgeschlagen. Das Projekt bleibt erhalten.'));worker.postMessage({buffer,options},[buffer]);
  }catch(error){finish(error);}
 });
}
