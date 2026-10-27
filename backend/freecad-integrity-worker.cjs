// Trusted, read-only file verification. No Electron/renderer or CAD execution.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const fail=detail=>Object.assign(Error('Die integrierte CAD-Laufzeit fehlt oder ist beschädigt. Formnaro vollständig neu entpacken; das Modell bleibt erhalten. ('+detail+')'),{code:'FREECAD_RUNTIME_INVALID'});
async function verifyFiles(root,manifest,{signal}={}){
 const seen=new Set();let bytes=0;
 for(const row of manifest.files){
  signal?.throwIfAborted();
  if(typeof row.file!=='string'||row.file.includes('\\')||row.file.startsWith('/')||row.file.split('/').some(p=>!p||p==='.'||p==='..'||p.includes(':'))||seen.has(row.file.toLowerCase())||!Number.isSafeInteger(row.size)||row.size<0||!/^[a-f0-9]{64}$/.test(row.sha256))throw fail('Manifesteintrag');
  seen.add(row.file.toLowerCase());
 }
 let cursor=0,firstError;
 await Promise.all(Array.from({length:8},async()=>{
  while(cursor<manifest.files.length&&!firstError){
   const row=manifest.files[cursor++],file=path.join(root,row.file);
   try{
    const stat=await fs.promises.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==row.size)throw fail(row.file);
    const hash=createHash('sha256');for await(const chunk of fs.createReadStream(file)){signal?.throwIfAborted();hash.update(chunk);}
    if(hash.digest('hex')!==row.sha256)throw fail(row.file);bytes+=row.size;
   }catch(e){firstError??=signal?.aborted?e:fail(row.file);}
  }
 }));
 if(firstError)throw firstError;
 return {ok:true,version:manifest.version,files:seen.size,bytes,scope:manifest.scope??'complete',totalFiles:manifest.totalFiles??manifest.files.length};
}
module.exports={verifyFiles};
if(process.argv[2]==='formnaro-integrity'){
 const chunks=[];let size=0;process.stdin.on('data',chunk=>{size+=chunk.length;if(size>16*1024*1024)process.exit(125);chunks.push(chunk);});
 process.stdin.on('end',async()=>{let reply;try{const manifest=JSON.parse(Buffer.concat(chunks).toString('utf8'));reply={ok:true,value:await verifyFiles(process.argv[3],manifest)};}catch(error){reply={ok:false,error:error.message,code:error.code??'FREECAD_RUNTIME_INVALID'};}process.stdout.write(JSON.stringify(reply));});
}
