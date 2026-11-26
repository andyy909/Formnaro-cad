const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{setTimeout:hostSetTimeout}=require('node:timers');
const {openDiagnosticFixture}=require('./fixtures/open-diagnostic-child.cjs');
function fixture(t,outcome,{performance,clock}={}){
 const child=new EventEmitter();
 child.connected=true;
 child.killed=false;
 child.send=(message,callback)=>{
  callback?.();
  if(message.method!=='close')return;
  if(outcome==='normal')hostSetTimeout(()=>child.emit('exit',0,null),2);
  if(outcome.startsWith('disconnected')){
   hostSetTimeout(()=>{child.connected=false;child.emit('disconnect');},1);
   if(outcome==='disconnected-late')hostSetTimeout(()=>child.emit('exit',0,null),25);
  }
 };
 child.kill=()=>{
  child.killed=true;
  if(outcome==='forced')hostSetTimeout(()=>child.emit('exit',null,'SIGTERM'),1);
 };
 return {...openDiagnosticFixture(t,{
  spawn:()=>child,executable:'test.exe',performance,clock,normal:12,grace:40,forced:8
 }),child};
}
test('normal OS exit is observed and never forced',async t=>{const f=fixture(t,'normal'),r=await f.control.close();assert.equal(r.code,0);assert.equal(r.signal,null);assert.equal(f.child.killed,false);assert(f.delays.includes(30000));});
test('a forced process termination cannot become a clean result',async t=>{const f=fixture(t,'forced'),r=await f.control.close();assert.equal(r.forced,true);assert.equal(r.signal,'SIGTERM');assert.notEqual(r.code,0);});
test('an unconfirmed process remains unconfirmed even after the close request',async t=>{const f=fixture(t,'unconfirmed'),r=await f.control.close();assert.equal(r.signal,'exit-unconfirmed');assert.equal(r.forced,true);assert.equal(r.code,null);assert.equal(r.afterWindowCloseMs,null);});

test('disconnected process receives bounded native teardown grace and late OS exit stays normal',async t=>{const f=fixture(t,'disconnected-late'),r=await f.control.close();assert.equal(r.code,0);assert(!r.forced);assert.equal(f.child.killed,false);assert.equal(r.nativeExitGrace,true);assert.equal(r.windowCloseMs,null);assert.equal(r.afterWindowCloseMs,null);});
test('IPC disconnect alone never confirms a process exit',async t=>{const f=fixture(t,'disconnected-hang'),r=await f.control.close();assert.equal(r.code,null);assert.equal(r.signal,'exit-unconfirmed');assert.equal(r.forced,true);assert.equal(f.child.killed,true);});

test('Shutdown splits at the child window event even when IPC delivery is delayed',async t=>{
 let now=100;
 const {control,child}=fixture(t,'manual',{performance:{now:()=>now},clock:{now:()=>100000+now}});
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

test('An older child can confirm a window close through the original IPC message',async t=>{
 let now=100;
 const {control,child}=fixture(t,'manual',{performance:{now:()=>now},clock:{now:()=>100000+now}});
 const close=control.close();
 now=250;
 child.emit('message',{type:'window-closed'});
 now=400;
 child.emit('exit',0,null);
 const result=await close;
 assert.equal(result.windowCloseSource,'ipc-received');
 assert.deepEqual([result.shutdownMs,result.windowCloseMs,result.afterWindowCloseMs],[300,150,150]);
});
