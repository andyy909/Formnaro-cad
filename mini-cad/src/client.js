let worker,serial=0;const pending=new Map();
function start(){
  worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{const item=pending.get(data.id);if(!item)return;pending.delete(data.id);clearTimeout(item.timer);if(data.code==='CAD_KERNEL_FATAL')cancelJobs('CAD-Rechenmodul wurde nach einem nativen Fehler neu gestartet. Das Projekt bleibt erhalten.');data.error?item.reject(Object.assign(Error(data.error),{code:data.code,feedback:data.feedback})):item.resolve(data.result);};
  worker.onerror=()=>cancelJobs('Das Rechenmodul wurde neu gestartet. Bitte erneut versuchen.');
}
export function cancelJobs(message='Berechnung abgebrochen. Dein Projekt bleibt erhalten.'){
  worker?.terminate();worker=null;for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error(message));}pending.clear();
}
export function request(job,payload){
  if(!worker)start();const id=++serial;
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>cancelJobs('Die Berechnung dauert zu lange. Bitte Qualität oder Modellgröße verringern.'),45000);pending.set(id,{resolve,reject,timer});worker.postMessage({id,job,payload});});
}
