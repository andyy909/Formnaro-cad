const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startBridge}=require('../backend/api-bridge.cjs');
test('Disconnecting a timed-out preview aborts its work and releases subsequent scene requests',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-disconnect-'));let started,release,aborted=false;
 const entered=new Promise(resolve=>{started=resolve;});const block=new Promise(resolve=>{release=resolve;});
 const bridge=await startBridge({directory,rpc:async(method,args,{signal}={})=>{if(method!=='preview')return {objects:[]};started();return new Promise((resolve,reject)=>{signal?.addEventListener('abort',()=>{aborted=true;reject(signal.reason);},{once:true});block.then(()=>resolve({}));});}});
 t.after(async()=>{release();await bridge.close();fs.rmSync(directory,{recursive:true,force:true});});
 const req=http.request(bridge.descriptor.url+'/v1/preview',{method:'POST',headers:{Authorization:'Bearer '+bridge.descriptor.token,'Content-Type':'application/json'}},res=>res.resume());req.on('error',()=>{});req.end('{}');await entered;req.destroy();await new Promise(r=>setTimeout(r,60));
 assert.equal(aborted,true,'The disconnected preview is still computing');
 const result=await fetch(bridge.descriptor.url+'/v1/scene',{headers:{Authorization:'Bearer '+bridge.descriptor.token},signal:AbortSignal.timeout(400)});assert.equal(result.status,200);assert.deepEqual(await result.json(),{objects:[]});
});
test('A disconnected request waiting behind a preview cannot later execute Apply',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-queued-cancel-'));let started,release;const entered=new Promise(r=>{started=r;}),block=new Promise(r=>{release=r;}),calls=[];
 const bridge=await startBridge({directory,rpc:async method=>{calls.push(method);if(method==='preview'){started();await block;}return {};}});t.after(async()=>{release();await bridge.close();fs.rmSync(directory,{recursive:true,force:true});});
 const headers={Authorization:'Bearer '+bridge.descriptor.token,'Content-Type':'application/json'};const preview=fetch(bridge.descriptor.url+'/v1/preview',{method:'POST',headers,body:'{}'});await entered;
 const abandoned=http.request(bridge.descriptor.url+'/v1/apply',{method:'POST',headers},res=>res.resume());abandoned.on('error',()=>{});abandoned.end('{}');await new Promise(r=>setTimeout(r,40));abandoned.destroy();await new Promise(r=>setTimeout(r,40));release();await preview;await fetch(bridge.descriptor.url+'/v1/scene',{headers});assert.deepEqual(calls,['preview','scene']);
});
