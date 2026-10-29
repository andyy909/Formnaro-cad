const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const {createErrorLog,installErrorLog,redact}=require('../backend/error-log.cjs');
function fixture(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-error-log-'));try{return fn(root);}finally{fs.rmSync(root,{recursive:true,force:true});}}

test('Credential redaction removes trailing non-word token characters completely',()=>{
 for(const suffix of ['-','_','=','==','--'])assert.equal(redact('Bearer synthetic-audit-token'+suffix),'[entfernt]');
 assert.equal(redact('sk-synthetic-audit-token-'),'[entfernt]');
});
test('A flood of different log messages has bounded disk writes and cannot suppress fatal diagnosis',()=>fixture(root=>{
 let time=1720000000000;const log=createErrorLog({directory:root,now:()=>new Date(time)}),results=[];
 for(let i=0;i<100;i++)results.push(log.append({source:'renderer-console',message:'synthetic error '+i}));
 assert.ok(results.filter(r=>r.written).length<=20);assert.ok(results.some(r=>r.rateLimited));
 assert.equal(log.append({source:'main-process',message:'spoofed fatal'}).rateLimited,true);
 assert.equal(log.append({source:'main-process',message:'fatal diagnosis'},{critical:true}).written,true);
 time+=1001;assert.equal(log.append({message:'new interval'}).written,true);
}));
test('Structured error logs preserve diagnosis, redact credentials and discard full models/requests',()=>fixture(root=>{
 const log=createErrorLog({directory:root,version:'0.12.1',now:()=>new Date('2026-10-13T10:00:00Z')}),secret='sk-project-secretabcdefghijk',token='a'.repeat(64);
 const result=log.append({source:'cad-worker',message:`Fehler ${secret} Bearer some-other-secret api_key=genericsecret token=${token} https://host/path?access=secret`,stack:'at validateCadSolid',phase:'boolean-difference',nodeCount:3,operation:'previewGroup',project:{brep:'PRIVATE MODEL'},request:{prompt:'PRIVATE PROMPT'},password:'private'});
 assert.equal(result.written,true);const text=fs.readFileSync(log.status().file,'utf8'),entry=JSON.parse(text);
 for(const value of [secret,token,'genericsecret','some-other-secret','PRIVATE MODEL','PRIVATE PROMPT','password','access=secret'])assert.ok(!text.includes(value),value);
 assert.equal(entry.phase,'boolean-difference');assert.equal(entry.nodeCount,3);assert.equal(entry.version,'0.12.1');assert.equal(entry.time,'2026-10-13T10:00:00.000Z');assert.equal(entry.stack,'at validateCadSolid');
}));
test('Rotation bounds disk usage; cancellation and immediate duplicate entries are skipped',()=>fixture(root=>{
 let clock=0;const log=createErrorLog({directory:root,maxBytes:600,archives:2,now:()=>new Date(1720000000000+(clock+=3000))});
 assert.equal(log.append({name:'AbortError',message:'cancelled'}).cancelled,true);
 for(let i=0;i<15;i++)assert.equal(log.append({message:'error '+i+'x'.repeat(80)}).written,true);
 const files=fs.readdirSync(root);assert.equal(files.length,3);for(const file of files)assert.ok(fs.statSync(path.join(root,file)).size<=600);
 const same=createErrorLog({directory:path.join(root,'same'),now:()=>new Date('2026-10-13T10:00:00Z')});assert.equal(same.append({message:'same'}).written,true);assert.equal(same.append({message:'same'}).duplicate,true);
}));
test('A logging disk failure returns a status instead of interrupting the original action',()=>fixture(root=>{
 const blocked=path.join(root,'file');fs.writeFileSync(blocked,'file');const log=createErrorLog({directory:blocked});assert.equal(log.append({message:'source error'}).written,false);assert.match(log.status().error,/nicht geschrieben/);
}));
test('Only the owning window writes or opens logs; renderer crashes and main fatal errors are captured',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-log-ipc-')),handlers=new Map(),win=new EventEmitter(),proc=new EventEmitter();win.webContents=new EventEmitter();let opened;
 try{
  const log=installErrorLog(win,{directory:root,version:'test',ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},shell:{openPath:async target=>{opened=target;return '';}},processEvents:proc});
  assert.equal(handlers.get('cad-log:write')({sender:{}},{message:'not owner'}).ok,false);
  assert.equal(handlers.get('cad-log:write')({sender:win.webContents},{message:'native failure',phase:'boolean-intersection'}).value.written,true);
  assert.equal((await handlers.get('cad-log:folder')({sender:{}})).ok,false);assert.equal((await handlers.get('cad-log:folder')({sender:win.webContents})).ok,true);assert.equal(opened,path.resolve(root));
  win.webContents.emit('render-process-gone',{}, {exitCode:7,reason:'crashed'});proc.emit('uncaughtExceptionMonitor',Error('fatal'));
  const entries=fs.readFileSync(log.status().file,'utf8').trim().split('\n').map(JSON.parse);assert.deepEqual(entries.map(e=>e.source),['application','renderer-process','main-process']);
  win.emit('closed');assert.equal(proc.listenerCount('uncaughtExceptionMonitor'),0);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Renderer reports worker/global/UI failures once and keeps working if the logger rejects',async()=>{
 const {createErrorReporter}=await import('../src/error-log.js'),entries=[],target=new EventTarget(),reporter=createErrorReporter({desktop:{recordError:async value=>{entries.push(value);throw Error('disk');}},getContext:()=>({selectionCount:2})});
 const uninstall=reporter.install(target),error=Error('native');reporter.report(error,{source:'cad-worker',operation:'previewGroup'});reporter.report(error);reporter.report(Object.assign(Error('stop'),{name:'AbortError'}));
 const event=new Event('unhandledrejection');event.reason=Error('unhandled');target.dispatchEvent(event);await new Promise(r=>setImmediate(r));assert.equal(entries.length,2);assert.equal(entries[0].selectionCount,2);assert.equal(entries[0].operation,'previewGroup');uninstall();target.dispatchEvent(event);assert.equal(entries.length,2);
});
