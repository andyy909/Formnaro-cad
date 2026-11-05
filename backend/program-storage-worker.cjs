const {parentPort,workerData}=require('node:worker_threads');
async function save({kind,directory,args,file,sources,expected,legacyAIFile,cadOnly},signal){
 if(kind==='initialize')return require('./program-storage.cjs').createProgramStore(directory,{legacyAIFile,cadOnly}).initialize(args);
 if(kind==='ocad')return require('./program-storage.cjs').commitProgramChange(directory,args);
 if(kind!=='fnpack')throw Error('Ungültiger Sicherungsauftrag.');
 const fs=require('node:fs/promises');
 const {randomUUID}=require('node:crypto');
 const {openFnpack,writeFnpack,combineFnpackSources,fnpackPathStamp}=require('./fnpack.cjs');
 const readers=[];
 const indexedSources=sources.map(source=>{
  let reader;
  return {index:{blocks:source.blocks},copy:async(...params)=>{
   if(!reader){
    const candidate=await openFnpack(source.file);
    readers.push(candidate);
    if(candidate.identity.indexSha256!==source.identity.indexSha256||candidate.identity.bytes!==source.identity.bytes)throw Error('Geometriepaket wurde inzwischen geändert.');
    reader=candidate;
   }
   return reader.copy(...params);
  }};
 });
 let backedUp=false;
 async function shouldCommit(){
  if(await fnpackPathStamp(file)!==expected)return false;
  if(expected!=='missing'&&!backedUp){
   const temporary=file+'.vorher.'+randomUUID()+'.tmp';
   try{
    await fs.copyFile(file,temporary,require('node:fs').constants.COPYFILE_EXCL);
    const handle=await fs.open(temporary,'r+');
    try{await handle.sync();}finally{await handle.close();}
    if(await fnpackPathStamp(file)!==expected)return false;
    await fs.rename(temporary,file+'.vorher');
    backedUp=true;
   }finally{await fs.rm(temporary,{force:true}).catch(()=>{});}
  }
  return await fnpackPathStamp(file)===expected;
 }
 try{
  await writeFnpack(file,{...args,signal,shouldCommit,source:combineFnpackSources(indexedSources)});
  return {stamp:await fnpackPathStamp(file)};
 }finally{await Promise.all(readers.map(reader=>reader.close()));}
}
async function run(job,signal,port){
 try{port.postMessage({ok:true,value:await save(job,signal)});}
 catch(error){port.postMessage({ok:false,error:error.message,code:error.code});}
}
if(parentPort){
 const cancelled=workerData.cancelled;
 void run(workerData,cancelled?{get aborted(){return Atomics.load(cancelled,0)!==0;}}:undefined,parentPort);
}else{
 const port=process.parentPort,controller=new AbortController();
 let started=false;
 port.on('message',({data})=>{
  if(data.cancel){controller.abort();return;}
  if(started)return;
  started=true;
  void run(data.job,controller.signal,port).finally(()=>process.exit(0));
 });
 port.postMessage({ready:true});
}
