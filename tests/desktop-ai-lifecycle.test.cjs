const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{EventEmitter}=require('node:events');
test('One AI window-close handler cancels diagnostics, pending generation and tasks and disposes all sessions',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-ai-lifecycle-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const file=path.resolve(__dirname,'../backend/desktop-ai.cjs'),local=createRequire(file),module={exports:{}},win=new EventEmitter(),handlers=new Map(),calls=[];
 win.webContents=new EventEmitter();win.webContents.mainFrame={};win.webContents.send=()=>{};win.isDestroyed=()=>false;
 const electron={app:{getPath:()=>directory},ipcMain:{handle:(k,f)=>handlers.set(k,f),on(){}},safeStorage:{isEncryptionAvailable:()=>false}};
 let began;const started=new Promise(resolve=>{began=resolve;});
 const custom={
  './ai-diagnostics.cjs':{createDiagnostics:()=>({state:()=>({busy:false}),cancel:()=>calls.push('diagnostics')})},
  './ai-provider.cjs':{...local('./ai-provider.cjs'),generate:(_c,_k,_a,signal)=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>{calls.push('generation');reject(Object.assign(Error('cancelled'),{name:'AbortError'}));},{once:true});began();})},
  './ai-tasks.cjs':{createAITaskStore:()=>({request:()=>({}),releaseOwned:()=>calls.push('leases'),close:()=>calls.push('tasks')})},
 };
 for(const [name,factory,label]of [['./chatgpt-auth.cjs','createChatGPTAuth','chatgpt'],['./mistral-vibe.cjs','createMistralVibe','mistral'],['./ai-mcp-agent.cjs','createMCPAgent','mcp']]){
  const real=local(name);custom[name]={...real,[factory]:options=>{const session=real[factory](options),dispose=session.dispose.bind(session);session.dispose=()=>{calls.push(label);return dispose();};return session;}};
 }
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:name=>name==='electron'?electron:custom[name]??local(name),module,Buffer,URL,AbortController,setTimeout,clearTimeout,process:{argv:[]}},{filename:file});
 module.exports.installDesktopAI(win,{settingsFile:directory+'/ai-settings.json'});
 const event={sender:win.webContents,senderFrame:win.webContents.mainFrame};await handlers.get('cad-ai-tasks:request')(event,{});
 const generation=handlers.get('cad-ai:generate')(event,{prompt:'Close lifecycle fixture',context:{},scene:{revision:'0123456789abcdef'}});await started;
 const registered=win.listenerCount('closed');win.emit('closed');const result=await generation;
 assert.equal(registered,1,'All desktop AI cleanup belongs to one window-close handler');assert.equal(result.ok,false);
 for(const name of ['diagnostics','generation','leases','tasks','chatgpt','mistral','mcp'])assert.equal(calls.filter(v=>v===name).length,1,name);
});
