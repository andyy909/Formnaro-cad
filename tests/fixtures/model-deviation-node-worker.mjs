import {parentPort} from 'node:worker_threads';
globalThis.self={postMessage:(value,transfer)=>parentPort.postMessage(value,transfer)};
await import('../../src/model-deviation-worker.js');
parentPort.on('message',data=>self.onmessage({data}));
