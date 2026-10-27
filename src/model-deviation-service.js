const aborted=()=>Object.assign(Error('Modellvergleich abgebrochen.'),{name:'AbortError',code:'ABORTED'});
export function createModelComparisonService({createWorker=()=>new Worker(new URL('./model-deviation-worker.js',import.meta.url),{type:'module'})}={}){
 const active=new Set();let closed=false;
 function compare(request,{signal,onProgress=()=>{}}={}){
  if(closed||signal?.aborted)return Promise.reject(aborted());
  return new Promise((resolve,reject)=>{const worker=createWorker();let done=false;const finish=(error,value)=>{if(done)return;done=true;worker.terminate();active.delete(cancel);signal?.removeEventListener('abort',cancel);error?reject(error):resolve(value);},cancel=()=>finish(aborted());active.add(cancel);signal?.addEventListener('abort',cancel,{once:true});
   worker.onmessage=({data})=>{if(done)return;if(data.type==='progress'){onProgress(data.value);return;}data.type==='error'?finish(Error(data.message)):finish(null,data);};worker.onerror=e=>finish(Error(e.message||'Vergleichsworker fehlgeschlagen.'));
   try{worker.postMessage(request);}catch(error){finish(error);}
  });
 }
 return {compare,active:()=>active.size,cancel(){const had=active.size>0;for(const cancel of active)cancel();return had;},dispose(){closed=true;for(const cancel of active)cancel();}};
}
export const compactModelComparison=result=>({...result,directions:result.directions.map(({values,...stats})=>stats)});
