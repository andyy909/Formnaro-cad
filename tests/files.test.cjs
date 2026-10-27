const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {writeAtomic,installFiles}=require('../backend/files.cjs');
test('Atomic Unicode save replaces complete data and failures leave the old file intact',async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'formnaro-files-')),file=path.join(dir,'Gehäuse 日本語.ocad');await writeAtomic(file,Buffer.from('before'));await writeAtomic(file,Buffer.from('after'));assert.equal(await fs.readFile(file,'utf8'),'after');await assert.rejects(writeAtomic(path.join(dir,'missing','a.ocad'),Buffer.from('broken')));assert.equal(await fs.readFile(file,'utf8'),'after');assert.deepEqual(await fs.readdir(dir),['Gehäuse 日本語.ocad']);});

test('atomic Windows replacement survives transient sharing denial without changing the old file during retries',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'formnaro-files-')),file=path.join(dir,'old.ocad');await fs.writeFile(file,'old');let attempts=0;const waits=[];
 await writeAtomic(file,Buffer.from('complete new'),{platform:'win32',rename:async(from,to)=>{assert.equal(await fs.readFile(file,'utf8'),'old');if(attempts++<3)throw Object.assign(Error('sharing denial'),{code:['EPERM','EBUSY','EACCES'][attempts-1]});await fs.rename(from,to);},wait:async delay=>{waits.push(delay);assert.equal(await fs.readFile(file,'utf8'),'old');}});
 assert.equal(attempts,4);assert.deepEqual(waits,[10,20,40]);assert.equal(await fs.readFile(file,'utf8'),'complete new');assert.deepEqual(await fs.readdir(dir),['old.ocad']);
});

test('permanent denial is bounded and unrelated I/O errors are not retried, with the original and directory intact',async()=>{
 for(const code of ['EPERM','EIO']){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'formnaro-files-')),file=path.join(dir,'old.ocad');await fs.writeFile(file,'old');let attempts=0;const waits=[];
 await assert.rejects(writeAtomic(file,Buffer.from('never'),{platform:'win32',rename:async()=>{attempts++;throw Object.assign(Error('denied'),{code});},wait:async ms=>waits.push(ms)}),{code});assert.equal(attempts,code==='EPERM'?6:1);assert.equal(waits.reduce((a,b)=>a+b,0),code==='EPERM'?310:0);assert.equal(await fs.readFile(file,'utf8'),'old');assert.deepEqual(await fs.readdir(dir),['old.ocad']);}
});

test('cancellation during a replacement wait prevents a later commit and removes only the new temporary file',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'formnaro-files-')),file=path.join(dir,'old.ocad');await fs.writeFile(file,'old');let canceled=false,attempts=0;
 await assert.rejects(writeAtomic(file,Buffer.from('never'),{platform:'win32',shouldCommit:()=>!canceled,rename:async()=>{attempts++;throw Object.assign(Error('busy'),{code:'EBUSY'});},wait:async()=>{canceled=true;}}),{code:'ABORTED'});assert.equal(attempts,1);assert.equal(await fs.readFile(file,'utf8'),'old');assert.deepEqual(await fs.readdir(dir),['old.ocad']);
});
test('Cancelled native dialog reports no save; IPC validates data and failed writes',async()=>{let handler;const win={webContents:{}},ipcMain={handle:(_n,h)=>handler=h},dialog={showSaveDialog:async()=>({canceled:true})};installFiles(win,{ipcMain,dialog});assert.deepEqual(await handler({sender:win.webContents},{filename:'ä.ocad',bytes:new Uint8Array([1])}),{ok:true,value:{saved:false}});assert.equal((await handler({sender:win.webContents},{filename:'../bad',bytes:new Uint8Array([1])})).ok,false);dialog.showSaveDialog=async()=>({filePath:path.join(os.tmpdir(),'formnaro-nonexistent-'+Date.now(),'a.ocad')});assert.equal((await handler({sender:win.webContents},{filename:'a.ocad',bytes:new Uint8Array([1])})).ok,false);});
