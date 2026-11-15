const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const {loadDesktopTestModules}=require('./fixtures/load-desktop-test-modules.cjs');
test('One AI window-close handler cancels diagnostics, pending generation and tasks and disposes all sessions',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-ai-lifecycle-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const win=new EventEmitter(),handlers=new Map(),calls=[];
 win.webContents=new EventEmitter();win.webContents.mainFrame={};win.webContents.send=()=>{};win.isDestroyed=()=>false;
 const electron={app:{getPath:()=>directory},ipcMain:{handle:(k,f)=>handlers.set(k,f),on(){}},safeStorage:{isEncryptionAvailable:()=>false}};
 let began;const started=new Promise(resolve=>{began=resolve;});
 t.mock.method(require('../backend/ai-diagnostics.cjs'),'createDiagnostics',()=>({state:()=>({busy:false}),cancel:()=>calls.push('diagnostics')}));
 t.mock.method(require('../backend/ai-provider.cjs'),'generate',(_c,_k,_a,signal)=>new Promise((_resolve,reject)=>{
  signal.addEventListener('abort',()=>{calls.push('generation');reject(Object.assign(Error('cancelled'),{name:'AbortError'}));},{once:true});began();
 }));
 t.mock.method(require('../backend/ai-tasks.cjs'),'createAITaskStore',()=>({request:()=>({}),releaseOwned:()=>calls.push('leases'),close:()=>calls.push('tasks')}));
 for(const [name,factory,label]of [['chatgpt-auth.cjs','createChatGPTAuth','chatgpt'],['mistral-vibe.cjs','createMistralVibe','mistral'],['ai-mcp-agent.cjs','createMCPAgent','mcp']]){
  const real=require('../backend/'+name),original=real[factory];
  t.mock.method(real,factory,options=>{const session=original(options),dispose=session.dispose.bind(session);session.dispose=()=>{calls.push(label);return dispose();};return session;});
 }
 loadDesktopTestModules(electron,{loadPreload:false}).installDesktopAI(win,{settingsFile:path.join(directory,'ai-settings.json')});
 const event={sender:win.webContents,senderFrame:win.webContents.mainFrame};await handlers.get('cad-ai-tasks:request')(event,{});
 const generation=handlers.get('cad-ai:generate')(event,{prompt:'Close lifecycle fixture',context:{},scene:{revision:'0123456789abcdef'}});await started;
 const registered=win.listenerCount('closed');win.emit('closed');const result=await generation;
 assert.equal(registered,1,'All desktop AI cleanup belongs to one window-close handler');assert.equal(result.ok,false);
 for(const name of ['diagnostics','generation','leases','tasks','chatgpt','mistral','mcp'])assert.equal(calls.filter(v=>v===name).length,1,name);
});
