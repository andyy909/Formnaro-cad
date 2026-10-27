import initialize from '../cad-kernel-build/runtime/formnaro_cad.js';
import wasmUrl from '../cad-kernel-build/runtime/formnaro_cad.wasm?url';
import {createOperations} from './operations.js';
let operations;
const ready=initialize({locateFile:()=>wasmUrl,print:()=>{},printErr:()=>{}}).then(oc=>{operations=createOperations(oc);});
self.onmessage=async({data:{id,job,payload}})=>{
  try{await ready;const result=await operations(job,payload);self.postMessage({id,result},result instanceof ArrayBuffer?[result]:[]);}catch(error){self.postMessage({id,error:error.message||String(error),code:error instanceof WebAssembly.RuntimeError?'CAD_KERNEL_FATAL':error.code,feedback:error.feedback});}
};
