const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createProgramStore,installProgramStorage,cadOnlyForVersion}=require('../backend/program-storage.cjs');
const entries=require('../backend/program-data.json');
const meshKeys=Object.keys(entries).filter(key=>entries[key].legacyMesh),safeKeys=Object.keys(entries).filter(key=>!entries[key].legacyMesh);
const fresh=()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-cad-data-'));return {root,directory:path.join(root,'Daten')};};

test('CAD-only initialization never evaluates or copies old mesh values, preserves supported data and AI settings',()=>{
  const {root,directory}=fresh(),legacyAIFile=path.join(root,'old-ai.json'),legacy=Object.fromEntries(safeKeys.map(key=>[key,'{"fixture":"日本語"}']));
  fs.writeFileSync(legacyAIFile,'{"config":{"model":"fixture"}}');
  for(const key of meshKeys)Object.defineProperty(legacy,key,{enumerable:true,get:()=>{throw Error('Mesh value was read');}});
  const result=createProgramStore(directory,{cadOnly:true,legacyAIFile}).initialize(legacy);
  assert.equal(result.cadOnly,true);assert.equal(result.migrated,true);assert.deepEqual(Object.keys(result.values).sort(),safeKeys.sort());
  assert.deepEqual(Object.keys(result.revisions).sort(),safeKeys.sort());
  for(const key of meshKeys)assert.equal(fs.existsSync(path.join(directory,entries[key].file)),false);
  assert.equal(fs.readFileSync(path.join(directory,'ai-settings.json'),'utf8'),fs.readFileSync(legacyAIFile,'utf8'));
});

test('Existing mesh files are not statted/read/returned or changed, even when corrupt and oversized',()=>{
  const {directory}=fresh(),initial=createProgramStore(directory).initialize({'offlinecad-settings-v1':'{}'});
  assert.equal(initial.cadOnly,false);
  const files=meshKeys.map(key=>path.join(directory,entries[key].file));
  for(const file of files)fs.writeFileSync(file,'{broken-legacy-mesh');
  // A legacy file beyond its own limit must not block the new CAD application.
  const fd=fs.openSync(files[0],'r+');fs.ftruncateSync(fd,entries[meshKeys[0]].limit+1);fs.closeSync(fd);
  const before=files.map(file=>({size:fs.statSync(file).size,mtime:fs.statSync(file).mtimeMs}));
  const read=fs.readFileSync,stat=fs.statSync;let calls=0;
  fs.readFileSync=(file,...args)=>{if(files.includes(String(file))){calls++;throw Error('Legacy mesh file read');}return read(file,...args);};
  fs.statSync=(file,...args)=>{if(files.includes(String(file))){calls++;throw Error('Legacy mesh file statted');}return stat(file,...args);};
  try{
    const store=createProgramStore(directory,{cadOnly:true}),result=store.initialize();
    assert.deepEqual(result.values,{'offlinecad-settings-v1':'{}'});
    for(const key of meshKeys){assert.equal(Object.hasOwn(result.revisions,key),false);assert.throws(()=>store.read(key),/Ungültiger/);assert.throws(()=>store.change({key,value:null,revision:'missing'}),/Ungültiger/);}
    assert.equal(calls,0);
  }finally{fs.readFileSync=read;fs.statSync=stat;}
  for(let i=0;i<files.length;i++){assert.equal(fs.statSync(files[i]).size,before[i].size);assert.equal(fs.statSync(files[i]).mtimeMs,before[i].mtime);}
});

test('CAD renderer opt-in crosses the real existing IPC contract and cannot later downgrade',async()=>{
  const {directory}=fresh(),on=new Map(),win={webContents:{}},store=installProgramStorage(win,{directory,ipcMain:{on:(name,fn)=>on.set(name,fn),handle:()=>{}},shell:{openPath:async()=>''}});
  const desktop={initializeProgramData:request=>{const event={sender:win.webContents};on.get('cad-data:initialize')(event,request);if(!event.returnValue.ok)throw Error(event.returnValue.error);return event.returnValue.value;},changeProgramData:args=>{const event={sender:win.webContents};on.get('cad-data:change')(event,args);if(!event.returnValue.ok)throw Error(event.returnValue.error);return {...event.returnValue.value,value:args.value};}};
  const readKeys=[],values=new Map(safeKeys.map(key=>[key,'{}']));
  const legacy={getItem:key=>{readKeys.push(key);if(meshKeys.includes(key))throw Error('Legacy browser mesh read');return values.get(key)??null;}};
  const {createProgramStorage}=await import('../src/program-storage.js'),storage=createProgramStorage(legacy,desktop,{cadOnly:true});
  assert.equal(storage.info().cadOnly,true);assert.deepEqual(readKeys.sort(),safeKeys.sort());
  storage.setItem('offlinecad-autosave-v5','{"format":"FormnaroCAD"}');assert.match(store.read('offlinecad-autosave-v5').value,/FormnaroCAD/);
  storage.setItem('offlinecad-library-cad-v5','{"version":5}');assert.match(store.read('offlinecad-library-cad-v5').value,/5/);
  for(const key of meshKeys){assert.equal(storage.getItem(key),null);assert.throws(()=>storage.setItem(key,'legacy'),/Ungültiger/);assert.throws(()=>storage.removeItem(key),/Ungültiger/);}
  assert.equal(desktop.initializeProgramData({'offlinecad-autosave-v4':'legacy'}).cadOnly,true);
  assert.throws(()=>desktop.initializeProgramData({format:'FormnaroProgramDataInitialization',version:1,cadOnly:false,values:{}}),/Ungültige/);
  for(const key of meshKeys)assert.throws(()=>store.read(key),/Ungültiger/);
});

test('CAD-only browser fallback blocks mesh reads/writes while retaining permitted local persistence',async()=>{
  const {createProgramStorage}=await import('../src/program-storage.js'),values=new Map([['offlinecad-settings-v1','{"theme":"dark"}']]),calls=[];
  const legacy={getItem:key=>{calls.push(key);if(meshKeys.includes(key))throw Error('Legacy mesh read');return values.get(key)??null;},setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const storage=createProgramStorage(legacy,undefined,{cadOnly:true});
  for(const key of meshKeys){assert.equal(storage.getItem(key),null);assert.throws(()=>storage.setItem(key,'bad'),/CAD-Datenbefehl/);assert.throws(()=>storage.removeItem(key),/CAD-Datenbefehl/);}
  assert.deepEqual(calls,[]);assert.equal(storage.getItem('offlinecad-settings-v1'),'{"theme":"dark"}');
  storage.setItem('offlinecad-autosave-v5','new-cad');assert.equal(storage.getItem('offlinecad-autosave-v5'),'new-cad');storage.removeItem('offlinecad-autosave-v5');assert.equal(storage.getItem('offlinecad-autosave-v5'),null);
  assert.equal(createProgramStorage(legacy),legacy);
});

test('Backend server policy automatically selects CAD-only from 0.11, including prereleases',()=>{
  for(const version of ['0.9.9','0.10.0','0.10.8','0.10.99-preview','invalid'])assert.equal(cadOnlyForVersion(version),false,version);
  for(const version of ['0.11.0','0.11.0-preview','0.12.0','1.0.0','2.10.4'])assert.equal(cadOnlyForVersion(version),true,version);
});
