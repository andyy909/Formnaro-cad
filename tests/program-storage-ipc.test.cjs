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
