import {prepareImportStl} from './mesh-import-core.js';
self.onmessage=async({data})=>{
 try{const result=await prepareImportStl(data.buffer,{...data.options,onProgress:message=>self.postMessage({type:'progress',message})});self.postMessage({type:'result',result});}
 catch(error){self.postMessage({type:'error',message:error.message,code:error.code,name:error.name});}
};
