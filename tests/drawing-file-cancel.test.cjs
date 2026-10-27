const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {installFiles,writeAtomic}=require('../backend/files.cjs');
test('Cancel during a pending native drawing dialog preserves the target and consumes no export number',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'formnaro-drawing-cancel-')),target=path.join(directory,'Blatt.svg');await fs.writeFile(target,'confirmed old file');const handlers=new Map(),win={webContents:{}},event={sender:win.webContents};let finishDialog;
 installFiles(win,{ipcMain:{handle:(n,fn)=>handlers.set(n,fn)},dialog:{showSaveDialog:()=>new Promise(resolve=>finishDialog=resolve)}});
 const pending=handlers.get('cad-file:save')(event,{filename:'Blatt.svg',operationId:'drawing-one',bytes:new Uint8Array([1,2,3])});
 assert.equal((await handlers.get('cad-file:cancel')({sender:{}},{operationId:'drawing-one'})).ok,false);
 assert.equal((await handlers.get('cad-file:cancel')(event,{operationId:'drawing-other'})).value.canceled,false);
 assert.equal((await handlers.get('cad-file:cancel')(event,{operationId:'drawing-one'})).value.canceled,true);
 finishDialog({filePath:target});assert.deepEqual(await pending,{ok:true,value:{saved:false,canceled:true}});assert.equal(await fs.readFile(target,'utf8'),'confirmed old file');
 assert.deepEqual(await fs.readdir(directory),['Blatt.svg']);
});
test('Cancellation before atomic rename removes temporary bytes and preserves an existing output',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'formnaro-drawing-atomic-')),target=path.join(directory,'Blatt.pdf');await fs.writeFile(target,'old');await assert.rejects(writeAtomic(target,Buffer.from('new'),{shouldCommit:()=>false}),{code:'ABORTED'});assert.equal(await fs.readFile(target,'utf8'),'old');assert.deepEqual(await fs.readdir(directory),['Blatt.pdf']);
});
