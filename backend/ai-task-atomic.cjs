const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const pause=new Int32Array(new SharedArrayBuffer(4));
// Windows indexers and synchronizers can briefly retain the previous file.
// Retry the final atomic rename, never delete the last committed checkpoint.
function writeTaskAtomicSync(target,value,{rename=fs.renameSync,wait=ms=>Atomics.wait(pause,0,0,ms),platform=process.platform}={}){
 const temporary=path.join(path.dirname(target),'.formnaro-task-'+crypto.randomUUID()+'.tmp');let fd;
 try{
  fd=fs.openSync(temporary,'wx',0o600);fs.writeFileSync(fd,value);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
  const delays=[10,20,40,80,160];
  for(let attempt=0;;attempt++){
   try{rename(temporary,target);break;}
   catch(error){if(platform!=='win32'||!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=delays.length)throw error;wait(delays[attempt]);}
  }
 }finally{if(fd!==undefined)fs.closeSync(fd);try{fs.rmSync(temporary,{force:true});}catch{/* A locked temporary file must not mask the actual commit failure. */}}
}
module.exports={writeTaskAtomicSync};
