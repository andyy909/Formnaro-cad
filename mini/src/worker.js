import Module from 'manifold-3d/manifold';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import {createOperations} from './operations.js';
let operations;
const ready=Module({locateFile:()=>wasmUrl}).then(kernel=>{kernel.setup();operations=createOperations(kernel);});
self.onmessage=async({data:{id,job,payload}})=>{
  try{await ready;const result=await operations(job,payload);self.postMessage({id,result},result instanceof ArrayBuffer?[result]:[]);}catch(error){self.postMessage({id,error:error.message||String(error),code:error.code,feedback:error.feedback});}
};
