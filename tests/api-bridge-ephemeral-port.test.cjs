const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startBridge}=require('../backend/api-bridge.cjs');
function fixture(t,listen){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-bridge-port-')),original=http.Server.prototype.listen;http.Server.prototype.listen=function(...args){return listen.call(this,original,args);};t.after(()=>{http.Server.prototype.listen=original;fs.rmSync(directory,{recursive:true,force:true});});return directory;}
test('Automatic bridge is Fetch-accessible even when OS port zero would allocate blocked port 10080',async t=>{
 const directory=fixture(t,function(original,args){if(args[0]===0)args[0]=10080;return original.apply(this,args);});
 const bridge=await startBridge({directory,rpc:async()=>({ready:true})});
 try{assert(Number(new URL(bridge.descriptor.url).port)>=49152);const response=await fetch(bridge.descriptor.url+'/v1/scene',{headers:{Authorization:'Bearer '+bridge.descriptor.token}});assert.equal(response.status,200);assert.equal((await response.json()).ready,true);}finally{await bridge.close();}
});
test('Automatic bridge retries both an occupied port and a Windows-reserved port before publishing its descriptor',async t=>{
 let attempts=0;const directory=fixture(t,function(original,args){attempts++;assert.equal(fs.existsSync(path.join(directory,'ai-bridge.json')),false);if(attempts<=2){queueMicrotask(()=>this.emit('error',Object.assign(Error('isolated port fixture'),{code:attempts===1?'EADDRINUSE':'EACCES'})));return this;}return original.apply(this,args);});
 const bridge=await startBridge({directory,rpc:async()=>({})});try{assert(attempts>=3);assert.equal((await fetch(bridge.descriptor.url+'/v1/scene')).status,401);}finally{await bridge.close();}
});
test('Automatic allocation failures are bounded and never leave a misleading connection file',async t=>{
 let attempts=0;const directory=fixture(t,function(){attempts++;queueMicrotask(()=>this.emit('error',Object.assign(Error('isolated port fixture'),{code:'EADDRINUSE'})));return this;});
 await assert.rejects(startBridge({directory,rpc:async()=>({})}),{code:'EADDRINUSE'});assert.equal(attempts,16);assert.equal(fs.existsSync(path.join(directory,'ai-bridge.json')),false);
});
test('An explicit port retains its original error without automatic substitution',async t=>{
 let attempts=0;const directory=fixture(t,function(_original,args){assert.equal(args[0],54321);attempts++;queueMicrotask(()=>this.emit('error',Object.assign(Error('isolated port fixture'),{code:'EADDRINUSE'})));return this;});
 await assert.rejects(startBridge({directory,port:54321,rpc:async()=>({})}),{code:'EADDRINUSE'});assert.equal(attempts,1);assert.equal(fs.existsSync(path.join(directory,'ai-bridge.json')),false);
});
