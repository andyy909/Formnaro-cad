import {loadCadKernel} from './cad-kernel-loader.js';
import {createCadWorkerRuntime} from './cad-worker-runtime.js';
const runtime=createCadWorkerRuntime({
  createKernel:()=>loadCadKernel({print:()=>{},printErr:()=>{}}),
  postMessage:data=>self.postMessage(data)
});
self.onmessage=event=>runtime.receive(event.data);
