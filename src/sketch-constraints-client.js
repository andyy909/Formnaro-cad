import {validateSketchConstraints} from './sketch-constraints-data.js';

// One short lived worker per explicit solve. Termination cancels stale edits;
// neither the native CAD worker nor the mesh kernel is involved.
export function createSketchConstraintClient({workerFactory=()=>new Worker(new URL('./sketch-constraints-worker.js',import.meta.url),{type:'module'})}={}){
 let job=null,sequence=0;
 const cancel=()=>{if(!job)return;const current=job;job=null;clearTimeout(current.timer);current.worker.terminate();current.reject(Object.assign(Error('Skizzenberechnung abgebrochen.'),{name:'AbortError',code:'ABORTED'}));};
 async function solve(sketch,{affected}={}){
  validateSketchConstraints(sketch);cancel();const ticket=++sequence,worker=workerFactory();
  return new Promise((resolve,reject)=>{
   const finish=(error,result)=>{if(job?.ticket!==ticket)return;clearTimeout(job.timer);worker.terminate();job=null;error?reject(error):resolve(result);};
   job={ticket,worker,reject,timer:setTimeout(()=>finish(Object.assign(Error('Skizzenberechnung hat die Zeitgrenze überschritten. Letzter gültiger Zustand bleibt erhalten.'),{code:'SKETCH_SOLVER_TIMEOUT'})),1500)};
   worker.onmessage=event=>{if(event.data?.ticket===ticket)finish(null,event.data.result);};worker.onerror=event=>finish(Error(event.message??'Skizzenberechnung fehlgeschlagen.'));
   worker.postMessage({ticket,sketch:structuredClone(sketch),affected});
  });
 }
 return {solve,cancel,busy:()=>!!job};
}
