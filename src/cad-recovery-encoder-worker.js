import {createRecoveryEncoding} from './cad-recovery-encoding.js';
const encode=createRecoveryEncoding();
self.onmessage=({data})=>{
 try{
  const result=encode(data);
  self.postMessage(result,result.value instanceof Uint8Array?[result.value.buffer]:[]);
 }
 catch(error){self.postMessage({error:error.message});}
};
