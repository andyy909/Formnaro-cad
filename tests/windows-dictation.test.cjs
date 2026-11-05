const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const {createWindowsDictation,installWindowsDictation}=require('../backend/windows-dictation.cjs');
async function fixture(t,options={}){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'formnaro-windows-dictation-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const helper=path.join(dir,'helper.exe'),bytes=Buffer.from('synthetic native helper');await fs.writeFile(helper,bytes);
 const handle=Buffer.alloc(8);handle.writeBigUInt64LE(0x1234n);
 const win={isDestroyed:()=>false,isFocused:()=>true,getNativeWindowHandle:()=>handle};
 return {helper,win,pin:{bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},platform:'win32',...options};
}
test('Only the fixed Win+H command uses the real window handle, process ID and a shell-free hidden helper',async t=>{
 let called=0;
 const options=await fixture(t,{processId:123,execute(file,args,settings,done){called++;assert.equal(file,options.helper);assert.deepEqual(args,['--dictate','1234','123']);assert.equal(settings.shell,false);assert.equal(settings.windowsHide,true);assert.equal(settings.timeout,3000);assert(!settings.cwd.includes('.asar'));assert(!Object.hasOwn(settings.env,'NODE_OPTIONS'));done(null);}});
 assert.deepEqual(await createWindowsDictation(options).open(),{requested:true});assert.equal(called,1);
});
test('Unavailable platform, background window and damaged helper never send keys',async t=>{
 const options=await fixture(t,{execute(){assert.fail('No process may be started');}});
 await assert.rejects(createWindowsDictation({...options,platform:'linux'}).open(),/nur unter Windows/);
 await assert.rejects(createWindowsDictation({...options,win:{...options.win,isFocused:()=>false}}).open(),/aktivieren/);
 await fs.writeFile(options.helper,'damaged');await assert.rejects(createWindowsDictation(options).open(),/beschädigt/);
});
test('Loss of text-field focus while preparing the helper prevents dispatch',async t=>{
 const options=await fixture(t,{canStart:async()=>false,execute(){assert.fail('No process may be started');}});
 await assert.rejects(createWindowsDictation(options).open(),/Nachrichtenfeld/);
});
test('Concurrent clicks are rejected and a failed request releases the pending state',async t=>{
 let release,ready;const entered=new Promise(r=>ready=r),hold=new Promise(r=>release=r);
 const options=await fixture(t,{canStart:async()=>{ready();await hold;return false;},execute(){assert.fail('No process may be started');}}),service=createWindowsDictation(options);
 const first=service.open();await entered;await assert.rejects(service.open(),/bereits/);release();await assert.rejects(first,/Nachrichtenfeld/);await assert.rejects(service.open(),/Nachrichtenfeld/);
});
test('Native focus/modifier failures return a useful manual shortcut without retrying input',async t=>{
 for(const [code,message] of [[3,/Vordergrund/],[4,/loslassen/],['ETIMEDOUT',/Win\+H/]]){
  const options=await fixture(t,{execute(_file,_args,_settings,done){done(Object.assign(Error('synthetic'),{code}));}});
  await assert.rejects(createWindowsDictation(options).open(),message);
 }
});
test('Only the exact main document IPC may request dictation, with no renderer-supplied arguments',async()=>{
 let handler,calls=0;const frame={url:'file:///C:/fixture/index.html'},contents={mainFrame:frame},win={webContents:contents};
 installWindowsDictation(win,{entry:'C:/fixture/index.html',ipcMain:{handle(name,fn){assert.equal(name,'cad-speech:windows-dictation');handler=fn;}},service:{async open(){calls++;return {requested:true};}}});
 const own={sender:contents,senderFrame:frame};
 assert.equal((await handler({...own,senderFrame:{url:frame.url}})).ok,false);
 assert.equal((await handler({...own,sender:{}})).ok,false);
 assert.equal((await handler(own,{command:'anything'})).ok,false);
 frame.url='https://untrusted.invalid/';assert.equal((await handler(own)).ok,false);frame.url='file:///C:/fixture/index.html';
 assert.equal((await handler(own)).ok,true);assert.equal(calls,1);
});
test('Built native helper validates its x64 INPUT layout and rejects invalid handles without input',{skip:process.platform!=='win32'},()=>{
 const helper=path.resolve(__dirname,'../backend/windows-dictation.exe');
 execFileSync(helper,['--self-test'],{windowsHide:true});
 for(const args of [[],['--dictate','0',String(process.pid)],['--dictate','ffffffffffffffff','1'],['--dictate','1','1']]){
  assert.throws(()=>execFileSync(helper,args,{windowsHide:true}),error=>[2,3].includes(error.status));
 }
});
