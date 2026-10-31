// Development-only acceptance driver. Verification helpers stay outside the
// delivered ASAR; all production modules resolve from the actual packaged app.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const [exe,...args]=process.argv.slice(2);
if(!exe||!args.some(a=>/^--verify-[a-z-]+=/.test(a)))throw Error('Expected packaged executable and explicit verification flag.');
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const archive=path.join(path.dirname(path.resolve(exe)),'resources/app.asar');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(exe,['--inspect-brk=127.0.0.1:0',...args],{cwd:path.dirname(path.resolve(exe)),env,windowsHide:true,stdio:['ignore','pipe','pipe']});
child.stdout.pipe(process.stdout);let attached=false,stderr='';
const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
const timer=setTimeout(()=>{console.error('Portable verification timed out.');child.kill();},35*60*1000);
async function attach(url){
 const socket=new WebSocket(url),pending=new Map();let id=0,paused;
 const pause=new Promise(resolve=>paused=resolve);
 socket.addEventListener('message',event=>{const reply=JSON.parse(event.data);if(reply.id){const p=pending.get(reply.id);if(p){pending.delete(reply.id);reply.error?p.reject(Error(JSON.stringify(reply.error))):p.resolve(reply.result);}}else if(reply.method==='Debugger.paused')paused();});
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
 await call('Runtime.enable');await call('Debugger.enable');await call('Runtime.runIfWaitingForDebugger');await pause;
 const bootstrap=`(()=>{
  const Module=process.getBuiltinModule('module'),fs=process.getBuiltinModule('fs'),path=process.getBuiltinModule('path');
  const archive=${JSON.stringify(archive)},source=${JSON.stringify(source)},resolve=Module._resolveFilename;
  const inside=(file,root)=>file===root||file.startsWith(root+path.sep);
  Module._resolveFilename=function(request,parent,...rest){
   if(request.startsWith('.')&&parent?.filename){
    const candidate=path.resolve(path.dirname(parent.filename),request);
    if(inside(candidate,path.join(source,'backend'))){
     const appFile=path.join(archive,path.relative(source,candidate));
     if(fs.existsSync(appFile))return appFile;
    }
    if(inside(candidate,path.join(archive,'backend'))&&!fs.existsSync(candidate)){
     const external=path.join(source,path.relative(archive,candidate));
     if(/verification|fixture|all-functions/.test(path.basename(candidate))&&fs.existsSync(external))return external;
    }
   }
   return resolve.call(this,request,parent,...rest);
  };
  process.__formnaroExternalVerification=true;
  return true;
 })()`;
 const result=await call('Runtime.evaluate',{expression:bootstrap,returnByValue:true});if(result.exceptionDetails||result.result?.value!==true)throw Error('Verification loader failed: '+JSON.stringify(result));
 await call('Debugger.resume');socket.close();console.log('Verification helpers are external; packaged application bytes unchanged.');
}
child.stderr.on('data',bytes=>{process.stderr.write(bytes);stderr=(stderr+bytes.toString()).slice(-8192);const match=stderr.match(/ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+/);if(match&&!attached){attached=true;attach(match[0]).catch(error=>{console.error(error);child.kill();});}});
try{const code=await done;if(!attached)throw Error('Packaged verification inspector was not available.');process.exitCode=code??1;}finally{clearTimeout(timer);}
