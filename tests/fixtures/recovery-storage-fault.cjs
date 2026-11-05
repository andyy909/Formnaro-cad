const {isMainThread,parentPort,workerData}=require('node:worker_threads');
if(!isMainThread&&workerData?.kind==='ocad'&&process.env.FORMNARO_RECOVERY_FAULT){
 const fs=require('node:fs'),path=require('node:path');
 const target=path.join(workerData.directory,require('../../backend/program-data.json')[workerData.args.key].file);
 const mode=process.env.FORMNARO_RECOVERY_FAULT;
 if(mode==='disk-full'){
  const write=fs.writeFileSync;
  fs.writeFileSync=(file,bytes,...rest)=>{
   if(typeof file==='number'&&Buffer.isBuffer(bytes)&&bytes.equals(Buffer.from(workerData.args.value))){
    throw Object.assign(Error('Injected disk full'),{code:'ENOSPC'});
   }
   return write(file,bytes,...rest);
  };
 }else if(mode==='external-after-stage'){
  const flush=fs.fsyncSync;
  let staged=0;
  fs.fsyncSync=fd=>{
   flush(fd);
   if(++staged===2)fs.writeFileSync(target,'external replacement during staging');
  };
 }else{
  const rename=fs.renameSync;
  fs.renameSync=(from,to)=>{
   if(to===target){
    if(mode==='crash')process.kill(process.pid,'SIGKILL');
    if(mode==='hold'){
     parentPort.postMessage({injected:'before-replace'});
     Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);
    }
   }
   return rename(from,to);
  };
 }
}
