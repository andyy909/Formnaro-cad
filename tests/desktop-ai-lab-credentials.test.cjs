const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const {loadDesktopTestModules}=require('./fixtures/load-desktop-test-modules.cjs');
function desktopProvider(t){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-desktop-credential-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const win=new EventEmitter();let provider;
 win.webContents=new EventEmitter();win.webContents.mainFrame={};win.webContents.send=()=>{};win.isDestroyed=()=>false;
 const electron={app:{getPath:()=>directory},ipcMain:{handle(){},on(){}},safeStorage:{isEncryptionAvailable:()=>false}};
 t.mock.method(require('../backend/ai-diagnostics.cjs'),'createDiagnostics',options=>{provider=options.provider;return {cancel(){}};});
 loadDesktopTestModules(electron,{loadPreload:false}).installDesktopAI(win,{settingsFile:path.join(directory,'ai-settings.json')});
 t.after(()=>win.emit('closed'));return provider;
}
const completed=()=>new Response('data: '+JSON.stringify({type:'response.completed',response:{status:'completed',model:'gpt-6.1-sol',output:[{type:'message',content:[{type:'output_text',text:'{"message":"Local fixture"}'}]}],usage:{input_tokens:1,output_tokens:1}}})+'\n\n');
const config=()=>require('../backend/ai-provider.cjs').validateConfig({authMode:'chatgpt',protocol:'responses',model:'gpt-6.1-sol'});
test('the actual desktop lab adapter forwards rotating credentials for modeler, supervisor and reviewer requests',async t=>{
 const provider=desktopProvider(t),tokens=[];let resolved=0;
 t.mock.method(globalThis,'fetch',async(_url,options)=>{tokens.push(options.headers.Authorization);assert(!options.body.includes('credential-fixture-'));return completed();});
 for(const role of ['modeler','supervisor','reviewer'])await provider.completeModel(config(),'expired-fixture',{system:'JSON',user:role,input:{history:[],images:[]}},new AbortController().signal,{credential:async()=> 'credential-fixture-'+(++resolved)});
 assert.equal(resolved,3,'The desktop boundary must not discard the per-request resolver');assert.deepEqual(tokens,['Bearer credential-fixture-1','Bearer credential-fixture-2','Bearer credential-fixture-3']);
});
test('credential renewal failure through the desktop adapter sends no model request',async t=>{
 const provider=desktopProvider(t);let sent=0;t.mock.method(globalThis,'fetch',async()=>{sent++;return completed();});
 await assert.rejects(provider.completeModel(config(),'expired-fixture',{system:'JSON',user:'fixture',input:{history:[],images:[]}},new AbortController().signal,{credential:async()=>{throw Object.assign(Error('Local sign-in fixture'),{code:'CHATGPT_LOGIN_REQUIRED'});}}),{code:'CHATGPT_LOGIN_REQUIRED'});assert.equal(sent,0);
});
test('both frozen suites include and detect changes to the desktop provider adapter',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-desktop-suite-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const {createHash}=require('node:crypto');
 const {verifySuite}=require('../backend/ai-lab-benchmark.cjs');
 const adapter='backend/desktop-ai.cjs';
 const fixture=path.join(directory,adapter);
 const original=fs.readFileSync(path.join(__dirname,'..',adapter));
 fs.mkdirSync(path.dirname(fixture),{recursive:true});
 fs.writeFileSync(fixture,original);
 for(const [id,name] of [['core','benchmark-core-v1.json'],['advanced','benchmark-advanced-v2.json']]){
  const suite=require('../ai/'+name);
  const dependencies=suite.dependencies;
  assert(dependencies.some(d=>d.path===adapter));
  // Isolate this dependency so unrelated source changes cannot mask the tested failure.
  suite.dependencies=[{path:adapter,sha256:createHash('sha256').update(original).digest('hex')}];
  t.after(()=>{suite.dependencies=dependencies;});
  assert.doesNotThrow(()=>verifySuite(directory,id));
 }
 fs.appendFileSync(fixture,'\n// changed adapter');
 for(const id of ['core','advanced'])assert.throws(()=>verifySuite(directory,id),/desktop-ai.cjs/);
});
