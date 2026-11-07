const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {installProgramStorage}=require('../backend/program-storage.cjs');

test('The actual preload preserves portable data writes while successful IPC replies stay independent of model size',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-storage-ipc-')),on=new Map(),win={webContents:{}},replies=[];let desktop;
  try{
    const store=installProgramStorage(win,{directory:path.join(root,'Daten'),cadOnly:true,ipcMain:{on:(name,fn)=>on.set(name,fn),handle:()=>{}},shell:{openPath:async()=>''}}),electron={contextBridge:{exposeInMainWorld:(name,value)=>{assert.equal(name,'offlinecadDesktop');desktop=value;}},ipcRenderer:{sendSync:(name,args)=>{const event={sender:win.webContents};on.get(name)(event,args);if(name==='cad-data:change')replies.push(event.returnValue);return event.returnValue;}}};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','preload.cjs'),'utf8'),{require:name=>{assert.equal(name,'electron');return electron;},process:{argv:['--formnaro-portable-data']}});
    const {createProgramStorage}=await import('../src/program-storage.js'),storage=createProgramStorage({getItem:()=>null},desktop,{cadOnly:true}),key='offlinecad-autosave-v5',value=JSON.stringify({storageFixture:'日本語'+ 'x'.repeat(4*1024*1024)});
    storage.setItem(key,value);assert.equal(storage.getItem(key),value);assert.equal(store.read(key).value,value);
    assert.equal(replies.at(-1).ok,true);assert.deepEqual(Object.keys(replies.at(-1).value),['revision']);assert.ok(Buffer.byteLength(JSON.stringify(replies.at(-1)))<128);
    const before=storage.getItem(key),sync=fs.fsyncSync;
    try{fs.fsyncSync=()=>{throw Error('Injected disk flush failure');};assert.throws(()=>storage.setItem(key,'failed write'),/gespeichert werden/);assert.equal(storage.getItem(key),before);assert.equal(store.read(key).value,before);}
    finally{fs.fsyncSync=sync;}
    // Resolve the filename from the same public key table used by production.
    const entry=require('../backend/program-data.json')[key];fs.writeFileSync(path.join(root,'Daten',entry.file),'external change');
    assert.throws(()=>storage.setItem(key,'replacement'),/inzwischen geändert/);assert.equal(storage.getItem(key),before);assert.equal(store.read(key).value,'external change');
    assert.equal(replies.at(-1).ok,false);assert.ok(!Object.hasOwn(replies.at(-1),'value'));
    // Reload obtains the new CAS revision; removal still returns null publicly.
    const refreshed=createProgramStorage({getItem:()=>null},desktop,{cadOnly:true});refreshed.removeItem(key);assert.equal(refreshed.getItem(key),null);assert.equal(store.read(key).value,null);
    const invalid={sender:{}};on.get('cad-data:change')(invalid,{key,value,revision:'missing'});assert.equal(invalid.returnValue.ok,false);
  }finally{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('formnaro-storage-ipc-'));fs.rmSync(root,{recursive:true,force:true});}
});

test('Async recovery IPC writes and reads a large value while excluding concurrent writes to its key',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-storage-ipc-'));
  const directory=path.join(root,'Daten'),on=new Map(),handles=new Map();
  const win={webContents:{mainFrame:{}}};
  const event=()=>({sender:win.webContents,senderFrame:win.webContents.mainFrame});
  let desktop;
  try{
    const store=installProgramStorage(win,{directory,cadOnly:true,ipcMain:{on:(name,fn)=>on.set(name,fn),handle:(name,fn)=>handles.set(name,fn)},shell:{openPath:async()=>''}});
    const electron={
      contextBridge:{exposeInMainWorld:(_name,value)=>{desktop=value;}},
      ipcRenderer:{
        sendSync:(name,args)=>{const reply=event();on.get(name)(reply,args);return reply.returnValue;},
        invoke:(name,args)=>handles.get(name)(event(),args)
      }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','preload.cjs'),'utf8'),{require:()=>electron,process:{argv:['--formnaro-portable-data']}});
    const {createProgramStorageAsync}=await import('../src/program-storage.js');
    const startup=createProgramStorageAsync({getItem:()=>null},desktop,{cadOnly:true});
    assert.equal(typeof startup.then,'function');
    assert.throws(()=>store.change({key:'offlinecad-autosave-v7',value:'too early',revision:'missing'}),/bereits geladen/);
    const storage=await startup;
    const key='offlinecad-autosave-v7',value=JSON.stringify({fixture:'日本語'+'x'.repeat(16*1024*1024)});
    storage.setItem(key,'previous');
    const pending=storage.setRecoveryItem(key,value);
    try{
      assert.equal(storage.getItem(key),'previous');
      await assert.rejects(storage.setRecoveryItem(key,'concurrent'),/bereits eine automatische Sicherung/);
      assert.throws(()=>storage.setItem(key,'concurrent'),/bereits eine automatische Sicherung/);
      await new Promise(resolve=>setImmediate(resolve));
      assert.equal(storage.getItem(key),'previous');
    }finally{await pending;}
    assert.equal(storage.getItem(key),value);
    assert.equal(store.read(key).value,value);
    const file=require('../backend/program-data.json')[key].file;
    assert.equal(fs.readFileSync(path.join(directory,file+'.vorher'),'utf8'),'previous');
    fs.writeFileSync(path.join(directory,file),'external');
    await assert.rejects(storage.setRecoveryItem(key,'after external edit'),/inzwischen geändert/);
    assert.equal(storage.getItem(key),value);
    assert.equal(store.read(key).value,'external');
    assert.equal((await handles.get('cad-data:change-recovery')({sender:win.webContents,senderFrame:{}},{key})).ok,false);
  }finally{
    assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('formnaro-storage-ipc-'));
    fs.rmSync(root,{recursive:true,force:true});
  }
});
