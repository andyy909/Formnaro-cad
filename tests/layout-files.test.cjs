const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createLayoutStore,layoutDirectory,installLayouts}=require('../backend/layouts.cjs');
const schema=import('../backend/layout-data.mjs');
const temporary=()=>fs.mkdtemp(path.join(os.tmpdir(),'formnaro-layouts-'));
test('portable directory follows the executable, independent of user profile and working directory',()=>{
  const packaged={isPackaged:true,getPath:name=>{assert.equal(name,'exe');return path.join(os.tmpdir(),'Portable A','Formnaro.exe');}};
  assert.equal(layoutDirectory(packaged),path.join(os.tmpdir(),'Portable A','Layouts'));
  assert.equal(layoutDirectory(packaged,{verificationPath:path.join(os.tmpdir(),'Checks','report.json')}),path.join(os.tmpdir(),'Checks','portable-layouts'));
  assert.equal(layoutDirectory({isPackaged:false},{root:path.join(os.tmpdir(),'Dev')}),path.join(os.tmpdir(),'Dev','Layouts'));
});
test('multiple Unicode layouts, current layout and last selected name travel with the copied folder',async()=>{
  const {defaultLayout}=await schema,root=await temporary(),store=createLayoutStore(path.join(root,'Portable A','Layouts'));
  let r=await store.read();assert.equal(r.exists,false);const right=defaultLayout();right.librarySide='right';
  r=await store.change({revision:r.revision,command:{action:'save',name:'  Rechts 日本語  ',layout:right}});const id=r.data.activeId;
  assert.equal(r.data.profiles[0].name,'Rechts 日本語');r=await store.change({revision:r.revision,command:{action:'save',name:'Standard',layout:defaultLayout()}});
  r=await store.change({revision:r.revision,command:{action:'load',id}});assert.equal(r.data.current.librarySide,'right');
  const destination=path.join(root,'Portable B','Layouts');await fs.cp(store.directory,destination,{recursive:true});assert.deepEqual((await createLayoutStore(destination).read()).data,r.data);
  const bytes=await fs.readFile(path.join(destination,'layouts.json'),'utf8');assert.ok(!bytes.includes(root));assert.deepEqual(await fs.readdir(destination),['layouts.json','layouts.json.vorher']);
});
test('rename, explicit replacement and deletion preserve unrelated profiles and the current arrangement',async()=>{
  const {defaultLayout}=await schema,store=createLayoutStore(await temporary());let r=await store.read();const change=async command=>r=await store.change({revision:r.revision,command});
  await change({action:'save',name:'A',layout:defaultLayout()});const a=r.data.activeId;await change({action:'save',name:'B',layout:defaultLayout()});const b=r.data.activeId;
  await change({action:'rename',id:a,name:'Neu'});const right=defaultLayout();right.viewSide='right';await change({action:'replace',id:a,layout:right});assert.equal(r.data.current.viewSide,'right');assert.equal(r.data.profiles.find(p=>p.id===b).layout.viewSide,'left');
  await change({action:'delete',id:a});assert.equal(r.data.activeId,null);assert.deepEqual(r.data.current,right);assert.equal(r.data.profiles.length,1);await change({action:'reset'});assert.equal(r.data.profiles[0].id,b);assert.deepEqual(r.data.current,defaultLayout());
});
test('duplicate names, invalid commands, stale revisions and failed writes never replace a good file',async()=>{
  const {defaultLayout}=await schema,dir=await temporary(),store=createLayoutStore(dir);let r=await store.read();r=await store.change({revision:r.revision,command:{action:'save',name:'ÄÖ 日本語',layout:defaultLayout()}});const file=path.join(dir,'layouts.json'),before=await fs.readFile(file,'utf8');
  for(const command of [{action:'save',name:'äö 日本語',layout:defaultLayout()},{action:'save',name:'',layout:defaultLayout()},{action:'current',layout:{version:1}},{action:'save',name:'abc',layout:defaultLayout(),path:'../../outside'},{action:'delete',id:'not-an-id'}])await assert.rejects(store.change({revision:r.revision,command}));
  await assert.rejects(store.change({revision:'missing',command:{action:'reset'}}),/inzwischen/);
  const denied=createLayoutStore(dir,{write:async()=>{throw Object.assign(Error('Denied'),{code:'EACCES'});}}),changed=defaultLayout();changed.librarySide='right';await assert.rejects(denied.change({revision:r.revision,command:{action:'current',layout:changed}}),/beschreibbaren/);
  assert.equal(await fs.readFile(file,'utf8'),before);assert.deepEqual(await fs.readdir(dir),['layouts.json']);
});
test('damaged or oversized portable files remain unchanged on read and change',async()=>{
  const dir=await temporary(),file=path.join(dir,'layouts.json'),store=createLayoutStore(dir);
  for(const content of ['{broken','x'.repeat(512*1024+1)]){await fs.writeFile(file,content);await assert.rejects(store.read());await assert.rejects(store.change({revision:'missing',command:{action:'reset'}}));assert.equal(await fs.readFile(file,'utf8'),content);}
});

test('restoring the identical current layout keeps its revision and does no file write, while stale revisions still reject',async()=>{
 const dir=await temporary(),{writeAtomic}=require('../backend/files.cjs');let writes=0;const store=createLayoutStore(dir,{write:async(...args)=>{writes++;return writeAtomic(...args);}});let r=await store.read();r=await store.change({revision:r.revision,command:{action:'reset'}});assert.equal(writes,1);const before=await fs.readFile(path.join(dir,'layouts.json'),'utf8'),revision=r.revision;
 for(let i=0;i<30;i++)r=await store.change({revision:r.revision,command:{action:'current',layout:r.data.current}});assert.equal(writes,1);assert.equal(r.revision,revision);assert.equal(await fs.readFile(path.join(dir,'layouts.json'),'utf8'),before);await assert.rejects(store.change({revision:'missing',command:{action:'current',layout:r.data.current}}),/inzwischen/);assert.equal(writes,1);
});
test('native bridge rejects other windows and exposes only the fixed layout directory',async()=>{
  const handlers=new Map(),win={webContents:{}},directory=await temporary(),opened=[],ipcMain={handle:(channel,fn)=>handlers.set(channel,fn)},shell={openPath:async p=>{opened.push(p);return '';}};
  installLayouts(win,{directory,ipcMain,shell});assert.equal((await handlers.get('cad-layout:get')({sender:{}})).ok,false);
  const own={sender:win.webContents};assert.equal((await handlers.get('cad-layout:get')(own)).ok,true);assert.equal((await handlers.get('cad-layout:folder')(own,'C:/outside')).ok,true);assert.deepEqual(opened,[directory]);
});
