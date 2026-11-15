const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events'),{loadDesktopTestModules}=require('./fixtures/load-desktop-test-modules.cjs');
function directory(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-audit-ai-'));t.after(()=>{assert.equal(path.dirname(dir),os.tmpdir());fs.rmSync(dir,{recursive:true,force:true});});return dir;}
function desktop(t){
 const dir=directory(t),win=new EventEmitter(),handlers=new Map();
 win.webContents=new EventEmitter();win.webContents.mainFrame={};win.webContents.send=()=>{};win.isDestroyed=()=>false;
 const electron={app:{getPath:()=>dir},ipcMain:{handle:(name,fn)=>handlers.set(name,fn),on(){}},safeStorage:{isEncryptionAvailable:()=>false}};
 const {installDesktopAI}=loadDesktopTestModules(electron,{loadPreload:false});
 installDesktopAI(win,{settingsFile:path.join(dir,'ai-settings.json')});
 const close=()=>{if(win.listenerCount('closed')){win.emit('closed');win.removeAllListeners('closed');}};
 t.after(close);
 return {win,close,call:(name,args)=>handlers.get(name)({sender:win.webContents,senderFrame:win.webContents.mainFrame},args)};
}
test('BUG-07 one corrupt archived tool does not hide valid tools and is reported explicitly',t=>{const dir=directory(t),{createToolLibrary}=require('../backend/ai-tool-library.cjs'),store=createToolLibrary(dir),saved=store.request({action:'save',tool:{name:'Kept',language:'python',code:'pass'}});fs.writeFileSync(path.join(dir,'a'.repeat(64)+'.json'),'{}');const list=store.request({action:'list',limit:1});assert.equal(list.total,1);assert.equal(list.tools[0].revision,saved.revision);assert.equal(list.unavailable[0].revision,'a'.repeat(64));assert.throws(()=>store.request({action:'read',revision:'a'.repeat(64)}));});
for(const cached of [false,true])test('BUG-08 ChatGPT text-only catalog blocks images before provider invocation, cached='+cached,async t=>{
 const provider=require('../backend/ai-provider.cjs'),auth=require('../backend/chatgpt-auth.cjs');
 const config={authMode:'chatgpt',baseUrl:'https://api.openai.com/v1',protocol:'responses',model:'text-only'};
 const detail={id:config.model,input_modalities:['text']};
 t.mock.method(auth,'createChatGPTAuth',()=>({
  publicStatus:()=>({pending:false,activeId:'fixture',connected:true,accounts:[]}),
  token:async()=>'',dispose(){}
 }));
 const catalog=t.mock.method(provider,'testConnection',async()=>({models:[config.model],details:[detail]}));
 const generate=t.mock.method(provider,'generate',async()=>({}));
 const {call}=desktop(t);
 const saved=await call('cad-ai:save',{config});
 assert.equal(saved.ok,true,saved.error);
 if(cached){
  const loaded=await call('cad-ai:models',{});
  assert.equal(loaded.ok,true,loaded.error);
  assert.deepEqual(loaded.value.availableModelIds,[config.model]);
 }
 assert.equal(catalog.mock.callCount(),cached?1:0);
 const result=await call('cad-ai:generate',{images:[{synthetic:true}]});
 assert.equal(result.ok,false);
 assert.match(result.error,/Bilder/);
 assert.equal(generate.mock.callCount(),0);
 assert.equal(catalog.mock.callCount(),1);
});
test('BUG-43 renderer crash, main navigation and owner close release leases and pending RPC calls',async t=>{
 const taskStore=require('../backend/ai-tasks.cjs'),bridge=require('../backend/api-bridge.cjs'),provider=require('../backend/ai-provider.cjs');
 const calls=[];
 let rpc,notifyStarted;
 t.mock.method(taskStore,'createAITaskStore',()=>({request:()=>true,releaseOwned:()=>calls.push('leases'),close:()=>calls.push('tasks')}));
 t.mock.method(bridge,'startBridge',async options=>{
  rpc=options.rpc;
  return {descriptor:{token:'fixture',url:'http://127.0.0.1:1'},close:async()=>{}};
 });
 t.mock.method(provider,'generate',(_config,_token,_args,signal)=>new Promise((_resolve,reject)=>{
  signal.addEventListener('abort',()=>{calls.push('abort');reject(signal.reason);},{once:true});
  notifyStarted(signal);
 }));
 for(const [file,name,label] of [['mistral-vibe.cjs','createMistralVibe','mistral'],['ai-mcp-agent.cjs','createMCPAgent','agent']]){
  const api=require('../backend/'+file),original=api[name];
  t.mock.method(api,name,options=>{
   const session=original(options),dispose=session.dispose.bind(session);
   session.dispose=()=>{calls.push(label);return dispose();};
   return session;
  });
 }
 const {win,close,call}=desktop(t);
 const event=(url,inPlace,mainFrame)=>win.webContents.emit('did-start-navigation',{},url,inPlace,mainFrame);
 const saved=await call('cad-ai:save',{config:{bridgeEnabled:true}});
 assert.equal(saved.ok,true,saved.error);
 assert.equal((await call('cad-ai-tasks:request',{})).ok,true);
 const outcomes=[()=>event('file:///main',false,true),()=>win.webContents.emit('render-process-gone'),close];
 for(const [index,outcome] of outcomes.entries()){
  const started=new Promise(resolve=>{notifyStarted=resolve;});
  const generation=call('cad-ai:generate',{prompt:'Lifecycle fixture'});
  const signal=await Promise.race([started,generation.then(result=>assert.fail(result.error??'Provider did not wait for abort'))]);
  const rejected=assert.rejects(rpc('context',{}),/CAD renderer changed/);
  if(index===0){
   event('file:///frame',false,false);
   event('file:///main#anchor',true,true);
   assert.deepEqual(calls,[]);
   assert.equal(signal.aborted,false);
  }
  outcome();
  await rejected;
  assert.equal((await generation).ok,false);
  assert.equal(signal.aborted,true);
  assert.equal(calls.filter(value=>value==='leases').length,index+1);
 }
 assert.equal(calls.filter(value=>value==='abort').length,3);
 for(const value of ['tasks','mistral','agent'])assert.equal(calls.filter(call=>call===value).length,1);
});
const binding={revision:'r',projectDigest:'a'.repeat(64),referenceDigest:'b'.repeat(64),selectionDigest:'c'.repeat(64)},provider='synthetic.invalid',start={action:'start',binding,requirements:{purpose:'technical',objective:'audit',assumptions:[],checks:[],protectedTargets:[]},input:{prompt:'audit'},maxSteps:7};
test('BUG-09 finishing a task as applied requires a stored candidate and retains the lease after rejection',t=>{const {createAITaskStore}=require('../backend/ai-tasks.cjs'),s=createAITaskStore({directory:directory(t)}),first=s.request(start,provider),run=s.request({action:'claim',id:first.id,generation:first.generation,binding},provider),args={id:run.id,generation:run.generation,binding,lease:run.lease};try{assert.throws(()=>s.request({action:'finish',...args,status:'applied'},provider),/Modellvorschau/);assert.equal(s.request({action:'finish',...args,status:'interrupted'},provider).status,'interrupted');}finally{s.releaseOwned?.();s.close();}});
test('BUG-43 owner release frees only its leases and permits resuming after renderer replacement',t=>{const {createAITaskStore}=require('../backend/ai-tasks.cjs'),dir=directory(t),a=createAITaskStore({directory:dir}),b=createAITaskStore({directory:dir});try{const first=a.request(start,provider),other=b.request(start,provider),run=a.request({action:'claim',id:first.id,generation:1,binding},provider),foreign=b.request({action:'claim',id:other.id,generation:1,binding},provider);assert.equal(a.releaseOwned(),1);assert.throws(()=>a.request({action:'claim',id:foreign.id,generation:foreign.generation,binding},provider),{code:'BUSY'});const resumed=a.request({action:'claim',id:run.id,generation:run.generation,binding},provider);assert(resumed.lease);a.releaseOwned();b.releaseOwned();}finally{a.releaseOwned?.();b.releaseOwned?.();a.close();b.close();}});
for(const content of ['', 'not-a-pid', '0'])test('BUG-42 stale malformed auth lock is recoverable: '+JSON.stringify(content),async t=>{const dir=directory(t),file=path.join(dir,'session.lock');fs.writeFileSync(file,content);const old=new Date(Date.now()-60000);fs.utimesSync(file,old,old);const {createChatGPTAuth}=require('../backend/chatgpt-auth.cjs'),auth=createChatGPTAuth({directory:dir,encrypt:x=>x,decrypt:x=>x,canEncrypt:()=>true,openExternal(){},fetchImpl:()=>{throw Error('network prohibited');}});await auth.logout();assert.equal(fs.existsSync(file),false);});
test('BUG-42 a newly created empty lock is preserved while another process can still write its PID',async t=>{const dir=directory(t),file=path.join(dir,'session.lock');fs.writeFileSync(file,'');const {createChatGPTAuth}=require('../backend/chatgpt-auth.cjs'),auth=createChatGPTAuth({directory:dir,encrypt:x=>x,decrypt:x=>x,canEncrypt:()=>true,openExternal(){}});await assert.rejects(auth.logout(),/Instanz|Anmeldesperre/);assert(fs.existsSync(file));});
