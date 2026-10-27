import {parentPort} from 'node:worker_threads';
import {loadCadKernel} from '../../src/cad-kernel-loader.js';
import {createCadWorkerRuntime} from '../../src/cad-worker-runtime.js';
const runtime=createCadWorkerRuntime({createKernel:()=>loadCadKernel({print:()=>{},printErr:()=>{}}),postMessage:data=>parentPort.postMessage(data)});
parentPort.on('message',data=>runtime.receive(data));
