import wasmUrl from 'virtual:cad-wasm';
import cadWasmUrl from 'replicad-opencascadejs/wasm?url';
export function createCalculations({viewport,toast}){
  const banner=document.createElement('div');banner.className='calculation-banner';banner.hidden=true;const text=document.createElement('span'),cancel=document.createElement('button');cancel.textContent='Abbrechen';banner.append(text,cancel);viewport.append(banner);let current=null,sequence=0;
  function run(data,label,{silent=false}={}){
    if(current)return Promise.reject(Error('Zuerst die laufende Berechnung abschließen oder abbrechen.'));
    return new Promise((resolve,reject)=>{
      const worker=new Worker(new URL('./analysis-worker.js',import.meta.url),{type:'module'}),started=performance.now(),jobId=++sequence,revision=data.revision??null;
      const entry={jobId,revision,job:data.job,working:false,progress:0,cancel:()=>{end();const e=Error('Berechnung abgebrochen. Das Modell bleibt erhalten.');e.name='AbortError';reject(e);}};
      function end(){worker.terminate();if(current===entry){current=null;banner.hidden=true;}}
      current=entry;cancel.onclick=()=>current?.cancel();banner.hidden=false;text.textContent=label+' …';
      worker.onmessage=({data:d})=>{if(current!==entry||d.jobId!==jobId||d.revision!==revision)return;if(d.error){end();reject(Error(d.error));}else if(d.done){end();if(!silent)toast(label+' · '+((performance.now()-started)/1000).toFixed(1)+' s');resolve(d.result);}else{if(d.working)entry.working=true;if(d.progress!==undefined){entry.progress=d.progress;text.textContent=label+' · '+Math.round(d.progress*100)+' %';}}};
      worker.onerror=e=>{end();reject(Error(e.message||'Berechnung fehlgeschlagen.'));};worker.postMessage({...data,jobId,revision,wasmUrl:new URL(wasmUrl,location.href).href,cadWasmUrl:new URL(cadWasmUrl,location.href).href});
    });
  }
  return {run,isBusy:()=>!!current,cancel:()=>current?.cancel(),state:()=>current?{jobId:current.jobId,revision:current.revision,job:current.job,working:current.working,progress:current.progress}:null};
}

