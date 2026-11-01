const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createMistralVibe}=require('../backend/mistral-vibe.cjs');
test('Formnaro opens delegated login itself, retains manual fallback after browser failure, and removes it on cancel',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-login-'));let opened=0;
 class Client extends EventEmitter{
  async initialize(){this.info={authMethods:[{id:'browser-auth'},{id:'browser-auth-delegated'}]};}
  async call(method,args){if(method==='authenticate'&&args._meta?.action==='start')return {_meta:{'browser-auth-delegated':{attemptId:'fixture',signInUrl:'https://console.mistral.ai/login?fixture=1'}}};if(method==='authenticate')return new Promise(()=>{});return {authenticated:false};}
  close(){this.emit('closed');}
 }
 const manager=createMistralVibe({directory,connectionFile:'unused',command:()=>'/fixture/vibe',Client,openExternal:async()=>{opened++;throw Error('No browser');}});
 try{const status=await manager.startLogin();assert.equal(opened,1);assert.equal(status.pending,true);assert.equal(status.canOpenLogin,true);assert.match(status.message,/kopieren/);assert.equal(manager.loginURL(),'https://console.mistral.ai/login?fixture=1');manager.cancelLogin();assert.throws(()=>manager.loginURL());assert.equal(manager.publicStatus().canOpenLogin,false);}finally{manager.dispose();fs.rmSync(directory,{recursive:true,force:true});}
});
