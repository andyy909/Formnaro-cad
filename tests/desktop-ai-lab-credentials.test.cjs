const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{EventEmitter}=require('node:events');
function desktopProvider(t){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-desktop-credential-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const file=path.resolve(__dirname,'../backend/desktop-ai.cjs'),local=createRequire(file),module={exports:{}},win=new EventEmitter();let provider;
 win.webContents=new EventEmitter();win.webContents.mainFrame={};win.webContents.send=()=>{};win.isDestroyed=()=>false;
 const electron={app:{getPath:()=>directory},ipcMain:{handle(){},on(){}},safeStorage:{isEncryptionAvailable:()=>false}};
 const diagnostic={createDiagnostics:options=>{provider=options.provider;return {cancel(){}};}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:name=>name==='electron'?electron:name==='./ai-diagnostics.cjs'?diagnostic:local(name),module,Buffer,URL,AbortController,setTimeout,clearTimeout,process:{argv:[]}},{filename:file});
 module.exports.installDesktopAI(win,{settingsFile:directory+'/ai-settings.json'});t.after(()=>win.emit('closed'));return provider;
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
 for(const name of ['benchmark-core-v1.json','benchmark-advanced-v2.json']){const suite=require('../ai/'+name);assert(suite.dependencies.some(d=>d.path==='backend/desktop-ai.cjs'));for(const d of suite.dependencies){const dest=path.join(directory,d.path);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(__dirname,'..',d.path),dest);}}
 fs.appendFileSync(path.join(directory,'backend/desktop-ai.cjs'),'\n// changed adapter');
 for(const id of ['core','advanced'])assert.throws(()=>require('../backend/ai-lab-benchmark.cjs').verifySuite(directory,id),/desktop-ai.cjs/);
});
