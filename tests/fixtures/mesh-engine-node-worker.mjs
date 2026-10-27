import {parentPort} from 'node:worker_threads';
import fs from 'node:fs';
import Module from 'manifold-3d/manifold';
import {createMeshEngineAdapter} from '../../src/mesh-engine-adapter.js';
import {meshEngineRequest} from '../../src/mesh-engine-runtime.js';
let generation,ready,adapter,tail=Promise.resolve();
parentPort.on('message',message=>{
  if(message.type==='initialize'){generation=message.generation;ready=(async()=>{const kernel=await Module({wasmBinary:fs.readFileSync(new URL('../../node_modules/manifold-3d/manifold.wasm',import.meta.url))});kernel.setup();adapter=createMeshEngineAdapter({kernel});})();ready.catch(()=>{});return;}
  if(message.type!=='compute'||message.generation!==generation||!ready)return;
  tail=tail.then(async()=>{const reply=value=>parentPort.postMessage({id:message.id,generation,revision:message.revision,...value});try{await ready;const result=await meshEngineRequest(adapter,message.request);reply({type:'result',result});}catch(error){reply({type:'error',code:error.code??'MESH_ERROR',message:error.message,...(error.feedback?{feedback:error.feedback}:{})});}});
});
