import {prepareImportStl,readImportStl} from './mesh-import-core.js';
self.onmessage=async({data})=>{
 try{
  if(data.preview){
   const {positions,inputTriangles}=readImportStl(data.buffer,data.options);
   const count=Math.min(inputTriangles,20000),sample=new Float32Array(count*9);
   for(let i=0;i<count;i++){
    const face=Math.floor((i+.5)*inputTriangles/count);
    sample.set(positions.subarray(9*face,9*face+9),9*i);
   }
   self.postMessage({type:'result',result:sample},[sample.buffer]);return;
  }
  const result=await prepareImportStl(data.buffer,{...data.options,onProgress:message=>self.postMessage({type:'progress',message})});self.postMessage({type:'result',result});}
 catch(error){self.postMessage({type:'error',message:error.message,code:error.code,name:error.name});}
};
