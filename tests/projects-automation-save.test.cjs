const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createProjectFiles}=require('../backend/projects.cjs');
test('direct project save is small, preserves opened-file guards and never overwrites a new target',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'formnaro-save-')),store=createProjectFiles({directory,dialog:{showSaveDialog:()=>{throw Error('Automation must not open a dialog');}},shell:{}});
 const bytes=new Uint8Array(Buffer.from('{"format":"private-test"}'));
 try{
  const result=await store.save({automation:true,filename:'direct.ocad',bytes});assert.equal(result.saved,true);assert.equal(result.file.size,bytes.length);assert.equal((await fs.readFile(path.join(directory,'direct.ocad'))).toString(),Buffer.from(bytes).toString());
  await assert.rejects(store.save({automation:true,filename:'direct.ocad',bytes}),{code:'EEXIST'});
  const updated=await store.save({automation:true,filename:'direct.ocad',bytes,id:result.file.id});assert.equal(updated.saved,true);
  await fs.writeFile(result.file.path,'external change');await assert.rejects(store.save({automation:true,filename:'direct.ocad',bytes,id:result.file.id}),/außerhalb/);
  for(const filename of ['../outside.ocad','C:\\outside.ocad','CON.ocad'])await assert.rejects(store.save({automation:true,filename,bytes}));
 }finally{await store.close();}
});
test('atomic create-only commit refuses a target created while writing',async()=>{
 const {writeAtomic}=require('../backend/files.cjs'),directory=await fs.mkdtemp(path.join(os.tmpdir(),'formnaro-save-race-')),file=path.join(directory,'target.ocad');
 await assert.rejects(writeAtomic(file,Buffer.from('new'),{createOnly:true,shouldCommit:async()=>{await fs.writeFile(file,'other writer');return true;}}),{code:'EEXIST'});assert.equal(await fs.readFile(file,'utf8'),'other writer');
});
