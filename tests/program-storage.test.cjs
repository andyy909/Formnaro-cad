const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createProgramStore,dataDirectory,installProgramStorage,writeAtomicSync}=require('../backend/program-storage.cjs');
const entries=require('../backend/program-data.json');
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-portable-'));
const settings='offlinecad-settings-v1',library='offlinecad-library-v1';
test('Generic atomic settings writer retries a short Windows lock without exposing a partial settings file',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-atomic-settings-')),file=path.join(root,'ai-settings.json');fs.writeFileSync(file,'old settings');t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());fs.rmSync(root,{recursive:true,force:true});});let calls=0;const delays=[];
 writeAtomicSync(file,'new settings',{platform:'win32',wait:ms=>delays.push(ms),rename:(from,to)=>{assert.equal(fs.readFileSync(file,'utf8'),'old settings');assert.equal(fs.readFileSync(from,'utf8'),'new settings');if(++calls<3)throw Object.assign(Error('Temporary Windows lock'),{code:'EPERM'});fs.renameSync(from,to);}});
 assert.equal(calls,3);assert.deepEqual(delays,[10,20]);assert.equal(fs.readFileSync(file,'utf8'),'new settings');assert.deepEqual(fs.readdirSync(root),['ai-settings.json']);
});
test('Generic atomic settings writer bounds permanent Windows locks and keeps the old settings exact',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-atomic-settings-')),file=path.join(root,'ai-settings.json');fs.writeFileSync(file,'old settings');t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());fs.rmSync(root,{recursive:true,force:true});});let calls=0,total=0;
 assert.throws(()=>writeAtomicSync(file,'new settings',{platform:'win32',wait:ms=>total+=ms,rename:()=>{calls++;throw Object.assign(Error('Permanent lock'),{code:'EBUSY'});}}),{code:'EBUSY'});assert.equal(calls,6);assert.equal(total,310);assert.equal(fs.readFileSync(file,'utf8'),'old settings');assert.deepEqual(fs.readdirSync(root),['ai-settings.json']);
});
test('Generic atomic settings writer does not retry disk-full or non-Windows permission errors',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-atomic-settings-')),file=path.join(root,'ai-settings.json');fs.writeFileSync(file,'old settings');t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());fs.rmSync(root,{recursive:true,force:true});});
 for(const [platform,code]of [['win32','ENOSPC'],['linux','EPERM']]){let calls=0;assert.throws(()=>writeAtomicSync(file,'new settings',{platform,wait:()=>assert.fail('No retry'),rename:()=>{calls++;throw Object.assign(Error(code),{code});}}),{code});assert.equal(calls,1);assert.equal(fs.readFileSync(file,'utf8'),'old settings');assert.deepEqual(fs.readdirSync(root),['ai-settings.json']);}
});
test('Portable data follows the EXE, with isolated development and verification locations',()=>{
  const root=temp(),app={isPackaged:true,getPath:name=>name==='exe'?path.join(root,'Formnaro.exe'):path.join(root,'elsewhere')};
  assert.equal(dataDirectory(app),path.join(root,'Daten'));assert.equal(dataDirectory(app,{root:path.join(root,'dev')}),path.join(root,'dev','Daten'));
  assert.equal(dataDirectory(app,{verificationPath:path.join(root,'checks','result.json')}),path.join(root,'checks','portable-data'));
});
test('Complete old data imports once, remains portable and wins against another PC profile',()=>{
  const root=temp(),directory=path.join(root,'Daten'),legacyAIFile=path.join(root,'old-ai.json');
  const ai='{ "config": {"model":"fixture"}, "encryptedKey":"opaque-test-ciphertext" }';fs.writeFileSync(legacyAIFile,ai);
  const legacy=Object.fromEntries(Object.keys(entries).map((key,i)=>[key,JSON.stringify({name:'日本語 '+i})]));
  const store=createProgramStore(directory,{legacyAIFile}),initial=store.initialize(legacy);assert.equal(initial.migrated,true);assert.deepEqual(initial.values,legacy);assert.equal(fs.readFileSync(path.join(directory,'ai-settings.json'),'utf8'),ai);assert.equal(fs.readFileSync(legacyAIFile,'utf8'),ai);
  const copied=path.join(root,'other-pc','Daten');fs.cpSync(directory,copied,{recursive:true});assert.deepEqual(createProgramStore(copied).initialize({[settings]:'other-PC'}).values,legacy);
  assert.deepEqual(store.initialize({unexpected:'must be ignored'}).values,legacy);assert.equal(store.initialize().migrated,false);
});
test('Writes are independent, atomic, revision checked and bounded; removal does not touch the library',()=>{
  const root=temp(),directory=path.join(root,'Daten'),store=createProgramStore(directory),initial=store.initialize({[settings]:'{}',[library]:'["keep"]'});
  const result=store.change({key:settings,value:'{"theme":"dark"}',revision:initial.revisions[settings]});assert.match(result.value,/dark/);assert.equal(store.read(library).value,'["keep"]');
  assert.throws(()=>store.change({key:settings,value:'{}',revision:initial.revisions[settings]}),/inzwischen geändert/);
  assert.throws(()=>store.change({key:'../../escape',value:'{}',revision:'missing'}),/Ungültiger/);
  assert.throws(()=>store.change({key:settings,value:'x'.repeat(65537),revision:result.revision}),/zu groß/);
  store.change({key:settings,value:null,revision:result.revision});assert.equal(store.read(settings).value,null);assert.equal(store.read(library).value,'["keep"]');
});
test('Failed migration never leaves a partial profile or modifies the old AI configuration',()=>{
  const root=temp(),directory=path.join(root,'Daten'),legacyAIFile=path.join(root,'ai.json');fs.writeFileSync(legacyAIFile,'original');let calls=0;
  const store=createProgramStore(directory,{legacyAIFile,write:(file,value)=>{if(++calls===2)throw Error('fixture failure');writeAtomicSync(file,value);}});
  assert.throws(()=>store.initialize({[settings]:'{}',[library]:'[]'}),/beschreibbaren/);assert.equal(fs.existsSync(directory),false);assert.equal(fs.readFileSync(legacyAIFile,'utf8'),'original');assert.deepEqual(fs.readdirSync(root),['ai.json']);
});
test('Write errors and a damaged marker preserve all existing portable data',()=>{
  const root=temp(),directory=path.join(root,'Daten');createProgramStore(directory).initialize({[settings]:'{"theme":"dark"}'});
  const store=createProgramStore(directory,{write:()=>{throw Error('read-only fixture');}}),initial=store.initialize();assert.throws(()=>store.change({key:settings,value:'{}',revision:initial.revisions[settings]}),/beschreibbaren/);assert.equal(store.read(settings).value,'{"theme":"dark"}');
  fs.writeFileSync(path.join(directory,'profil.json'),'{broken');assert.throws(()=>store.initialize({[settings]:'override'}),/beschädigt/);assert.equal(fs.readFileSync(path.join(directory,'einstellungen.json'),'utf8'),'{"theme":"dark"}');assert.equal(fs.readFileSync(path.join(directory,'profil.json'),'utf8'),'{broken');
});
test('IPC rejects unrelated windows and only opens the fixed portable folder',async()=>{
  const on=new Map(),handlers=new Map(),win={webContents:{}},root=temp(),directory=path.join(root,'Daten');let opened;
  installProgramStorage(win,{directory,ipcMain:{on:(n,f)=>on.set(n,f),handle:(n,f)=>handlers.set(n,f)},shell:{openPath:async p=>{opened=p;return '';}}});
  const wrong={sender:{}};on.get('cad-data:initialize')(wrong,{});assert.equal(wrong.returnValue.ok,false);assert.equal(fs.existsSync(directory),false);
  const right={sender:win.webContents};on.get('cad-data:initialize')(right,{});assert.equal(right.returnValue.ok,true);
  assert.equal((await handlers.get('cad-data:folder')({sender:{}})).ok,false);assert.equal((await handlers.get('cad-data:folder')(right,'../ignored')).ok,true);assert.equal(opened,directory);
});
test('Renderer uses portable data and never reports success after a failed write',async()=>{
  const {createProgramStorage}=await import('../src/program-storage.js'),root=temp(),store=createProgramStore(path.join(root,'Daten'));
  const desktop={initializeProgramData:old=>store.initialize(old),changeProgramData:args=>store.change(args)},legacy={getItem:k=>k===settings?'{"theme":"dark"}':null};
  const storage=createProgramStorage(legacy,desktop);assert.equal(storage.getItem(settings),'{"theme":"dark"}');storage.setItem(settings,'{"theme":"light"}');
  desktop.changeProgramData=()=>{throw Error('write failed');};assert.throws(()=>storage.setItem(settings,'{}'),/write failed/);assert.equal(storage.getItem(settings),'{"theme":"light"}');
  const forbidden={getItem:()=>{throw Error('browser storage disabled');}};assert.equal(createProgramStorage(forbidden,{...desktop,initializeProgramData:old=>store.initialize(old)}).getItem(settings),'{"theme":"light"}');
  assert.equal(createProgramStorage(legacy),legacy);
});


test('Identical writes still verify disk revision but skip atomic writes and never hide external changes',()=>{
 const directory=path.join(temp(),'Daten');let writes=0;const store=createProgramStore(directory,{write:(file,value)=>{writes++;writeAtomicSync(file,value);}}),initial=store.initialize({[settings]:'same'}),baseline=writes;
 assert.deepEqual(store.change({key:settings,value:'same',revision:initial.revisions[settings]}),store.read(settings));assert.equal(writes,baseline);
 fs.writeFileSync(path.join(directory,entries[settings].file),'external');assert.throws(()=>store.change({key:settings,value:'same',revision:initial.revisions[settings]}),/inzwischen geändert/);assert.equal(store.read(settings).value,'external');
 const current=store.read(settings);store.change({key:settings,value:'same',revision:current.revision});assert.equal(writes,baseline+2);
});


test('Decoded UTF-8 equality does not suppress repairing different actual file bytes',()=>{
 const directory=path.join(temp(),'Daten');let writes=0;const store=createProgramStore(directory,{write:(file,value)=>{writes++;writeAtomicSync(file,value);}});store.initialize({[settings]:'test'});fs.writeFileSync(path.join(directory,entries[settings].file),Buffer.from([0xff]));const current=store.read(settings),before=writes;
 store.change({key:settings,value:current.value,revision:current.revision});assert.equal(writes,before+2);assert.deepEqual(fs.readFileSync(path.join(directory,entries[settings].file)),Buffer.from(current.value));
});
