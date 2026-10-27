import Module from 'manifold-3d/manifold';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import {createMeshEngineAdapter} from './mesh-engine-adapter.js';
import {meshEngineRequest} from './mesh-engine-runtime.js';

let generation,ready,adapter,tail=Promise.resolve();
self.onmessage=({data:message})=>{
  if(message.type==='initialize'){
    generation=message.generation;
    ready=(async()=>{const wasmBinary=new Uint8Array(await(await fetch(wasmUrl)).arrayBuffer()),kernel=await Module({wasmBinary});kernel.setup();adapter=createMeshEngineAdapter({kernel});})();ready.catch(()=>{});return;
  }
  if(message.type!=='compute'||message.generation!==generation||!ready)return;
  tail=tail.then(async()=>{
    const reply=value=>self.postMessage({id:message.id,generation,revision:message.revision,...value});
    try{await ready;const result=await meshEngineRequest(adapter,message.request);
      reply({type:'result',result});
    }catch(error){reply({type:'error',code:error.code??'MESH_ERROR',message:error.message,...(error.feedback?{feedback:error.feedback}:{})});}
  });
};
