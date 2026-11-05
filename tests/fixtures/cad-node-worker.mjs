import {parentPort,workerData} from 'node:worker_threads';
import {loadCadKernel} from '../../src/cad-kernel-loader.js';
import {createCadWorkerRuntime} from '../../src/cad-worker-runtime.js';
const runtime=createCadWorkerRuntime({...workerData?.memoryPolicy?{memoryPolicy:workerData.memoryPolicy}:{},createKernel:()=>loadCadKernel({print:()=>{},printErr:()=>{}}),postMessage:data=>parentPort.postMessage(data)});
parentPort.on('message',data=>{if(data.type==='test-memory-limit'&&workerData?.memoryPolicy){workerData.memoryPolicy.stopBytes=1;return;}runtime.receive(data);});
