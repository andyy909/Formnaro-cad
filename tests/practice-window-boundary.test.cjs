const test=require('node:test'),assert=require('node:assert/strict');
const {loadDesktopTestModules}=require('./fixtures/load-desktop-test-modules.cjs');

function bridge(t,practice){
 let api;
 const calls=[],previousArgv=process.argv,previousPlatform=Object.getOwnPropertyDescriptor(process,'platform');
 t.after(()=>{
  process.argv=previousArgv;
  Object.defineProperty(process,'platform',previousPlatform);
 });
 process.argv=practice?['--formnaro-practice','--formnaro-portable-data']:[];
 Object.defineProperty(process,'platform',{value:'win32'});
 const electron={
  contextBridge:{exposeInMainWorld:(name,value)=>{assert.equal(name,'offlinecadDesktop');api=value;}},
  ipcRenderer:{invoke:async name=>(calls.push(name),{ok:true,value:true}),sendSync:()=>({ok:true,value:{}}),on:()=>{},send:()=>{}},
 };
 loadDesktopTestModules(electron,{loadDesktop:false});
 return {api,calls};
}

test('practice native bridge cannot open browsers, folders, file dialogs, dictation or another provider request',async t=>{
 const {api,calls}=bridge(t,true);for(const name of ['openMistralLogin','startMistralLogin','startChatGPTLogin','openChatGPTUsage','openAIProviderDocs','openAISubscriptionUsage','openProjectsFolder','openLayoutsFolder','openProgramDataFolder','openWindowsDictation','openProject','saveProject','saveFile','sendAgent','generateAI'])await assert.rejects(api[name]({}),/außerhalb/);assert.equal((await api.generateAIReply({})).ok,false);assert.deepEqual(calls,[]);
 await api.getFreeCADStatus();await api.runFreeCADReply({});await api.practiceInput({});assert.deepEqual(calls,['cad-freecad:status','cad-freecad:run','cad-practice:input']);
});
test('ordinary Formnaro window retains its existing file and provider integration',async t=>{const {api,calls}=bridge(t,false);await api.openProject({});await api.saveFile({});await api.openMistralLogin();assert.deepEqual(calls,['cad-project:open','cad-file:save','cad-ai:mistral-open']);});
