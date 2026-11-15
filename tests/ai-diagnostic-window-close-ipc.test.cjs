const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process'),{EventEmitter}=require('node:events');
const {openDiagnosticFixture}=require('./fixtures/open-diagnostic-child.cjs');
const backend=path.resolve(__dirname,'../backend/ai-diagnostic-child.cjs');
for(const mode of ['closed','parent-stale-connected','vetoed'])test('diagnostic IPC remains until actual window close: '+mode,async t=>{
 let child;const script=`const {EventEmitter}=require('node:events');const win=new EventEmitter();let destroyed=false;win.webContents=new EventEmitter();win.webContents.executeJavaScript=async()=>true;win.isDestroyed=()=>destroyed;win.close=()=>{process.send?.({type:'close-request-seen',connected:process.connected});if(process.argv[1]!=='vetoed')setTimeout(()=>{destroyed=true;win.emit('closed');setTimeout(()=>process.exit(0),400);},40);};require(${JSON.stringify(backend)}).installDiagnosticChild(win);setInterval(()=>{},1000);win.webContents.emit('did-finish-load');setImmediate(()=>process.send({type:'fixture-ready'}));`;
 const {control}=openDiagnosticFixture(t,{
  spawn:(exe,_args,options)=>{
   child=spawn(exe,['-e',script,mode],{...options,cwd:os.tmpdir()});
   if(mode!=='parent-stale-connected')return child;
   const proxy=new EventEmitter();
   Object.defineProperty(proxy,'connected',{get:()=>true});
   for(const event of ['message','exit','error'])child.on(event,(...args)=>proxy.emit(event,...args));
   proxy.send=(...args)=>{if(child.connected)child.send(...args);};
   proxy.kill=()=>child.kill();
   return proxy;
  }
 });
 let connectedAtRequest,disconnected=false;child.on('message',m=>{if(m.type==='close-request-seen')connectedAtRequest=m.connected;});child.on('disconnect',()=>disconnected=true);
 t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill();});await new Promise((resolve,reject)=>{child.on('message',m=>{if(m.type==='fixture-ready')resolve();});child.once('error',reject);});const result=await control.close();assert.equal(connectedAtRequest,true);
 if(mode!=='vetoed'){
  assert.equal(result.code,0);assert.equal(result.forced,undefined);assert.equal(result.nativeExitGrace,true);
  assert(disconnected);assert.equal(child.killed,false);
  assert.ok(['child-event','ipc-received'].includes(result.windowCloseSource));
  assert.ok(result.windowCloseMs>=30);
  // A fallback measurement starts at IPC receipt, which can lag actual close.
  const minimumAfterClose=result.windowCloseSource==='child-event'?350:0;
  assert.ok(result.afterWindowCloseMs>=minimumAfterClose);
  assert.equal(result.windowCloseMs+result.afterWindowCloseMs,result.shutdownMs);
 }else{
  assert.equal(result.forced,true);assert.notEqual(result.code,0);
  assert.equal(result.windowCloseMs,null);assert.equal(result.afterWindowCloseMs,null);
 }
});
