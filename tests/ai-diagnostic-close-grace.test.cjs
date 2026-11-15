const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{EventEmitter}=require('node:events');
function fixture(outcome,{performance=require('node:perf_hooks').performance,clock=Date}={}){
 const child=new EventEmitter(),delays=[];child.connected=true;child.killed=false;child.send=(message,callback)=>{callback?.();if(message.method==='close'){if(outcome==='normal')setTimeout(()=>child.emit('exit',0,null),2);if(outcome.startsWith('disconnected')){setTimeout(()=>{child.connected=false;child.emit('disconnect');},1);if(outcome==='disconnected-late')setTimeout(()=>child.emit('exit',0,null),25);}}};child.kill=()=>{child.killed=true;if(outcome==='forced')setTimeout(()=>child.emit('exit',null,'SIGTERM'),1);};
 const module={exports:{}},context={module,exports:module.exports,process,Promise,Set,Map,Date:clock,Error,clearTimeout,setTimeout:(fn,ms)=>{delays.push(ms);return setTimeout(fn,ms===30000?12:ms===5000?8:ms>30000?40:ms);},require:name=>name==='node:perf_hooks'?{performance}:name==='node:child_process'?{spawn:()=>child}:name==='node:fs'?{mkdirSync:()=>{}}:require(name)};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../backend/ai-diagnostic-child.cjs','utf8'),context);
 return {control:module.exports.openDiagnosticChild({app:{isPackaged:true},directory:'isolated',executable:'test.exe'}),child,delays};
}
test('normal OS exit is observed and never forced',async()=>{const f=fixture('normal'),r=await f.control.close();assert.equal(r.code,0);assert.equal(r.signal,null);assert.equal(f.child.killed,false);assert(f.delays.includes(30000));});
test('a forced process termination cannot become a clean result',async()=>{const f=fixture('forced'),r=await f.control.close();assert.equal(r.forced,true);assert.equal(r.signal,'SIGTERM');assert.notEqual(r.code,0);});
test('an unconfirmed process remains unconfirmed even after the close request',async()=>{const f=fixture('unconfirmed'),r=await f.control.close();assert.equal(r.signal,'exit-unconfirmed');assert.equal(r.forced,true);assert.equal(r.code,null);assert.equal(r.afterWindowCloseMs,null);});

test('disconnected process receives bounded native teardown grace and late OS exit stays normal',async()=>{const f=fixture('disconnected-late'),r=await f.control.close();assert.equal(r.code,0);assert(!r.forced);assert.equal(f.child.killed,false);assert.equal(r.nativeExitGrace,true);assert.equal(r.windowCloseMs,null);assert.equal(r.afterWindowCloseMs,null);});
test('IPC disconnect alone never confirms a process exit',async()=>{const f=fixture('disconnected-hang'),r=await f.control.close();assert.equal(r.code,null);assert.equal(r.signal,'exit-unconfirmed');assert.equal(r.forced,true);assert.equal(f.child.killed,true);});

test('Shutdown splits at the child window event even when IPC delivery is delayed',async()=>{
 let now=100;
 const {control,child}=fixture('manual',{performance:{now:()=>now},clock:{now:()=>100000+now}});
 const close=control.close();
 assert.equal(control.close(),close);
 now=160;
 child.emit('message',{type:'window-closed',at:100120});
 now=1000;
 child.emit('exit',0,null);
 const result=await close;
 assert.equal(result.windowCloseSource,'child-event');
 assert.equal(result.signal,null);
 assert.deepEqual([result.shutdownMs,result.windowCloseMs,result.afterWindowCloseMs],[900,20,880]);
});

test('An older child can confirm a window close through the original IPC message',async()=>{
 let now=100;
 const {control,child}=fixture('manual',{performance:{now:()=>now},clock:{now:()=>100000+now}});
 const close=control.close();
 now=250;
 child.emit('message',{type:'window-closed'});
 now=400;
 child.emit('exit',0,null);
 const result=await close;
 assert.equal(result.windowCloseSource,'ipc-received');
 assert.deepEqual([result.shutdownMs,result.windowCloseMs,result.afterWindowCloseMs],[300,150,150]);
});
