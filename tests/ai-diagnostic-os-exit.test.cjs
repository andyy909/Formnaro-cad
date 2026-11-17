const test=require('node:test'),assert=require('node:assert/strict'),os=require('node:os'),{spawn}=require('node:child_process');
const {openDiagnosticFixture}=require('./fixtures/open-diagnostic-child.cjs');
// Exercise the real OS process/IPC events. Only the long watchdog clock and
// launch path are adapted so this regression does not take two minutes.
for(const mode of ['late','hung'])test('real child shutdown: '+mode,async t=>{
 let child;const script=`setInterval(()=>{},1000);process.on('message',m=>{if(m.method==='close'){if(process.argv[1]==='late'){process.disconnect();setTimeout(()=>process.exit(0),400);}return;}process.send({id:m.id,value:true});});`;
 const {control}=openDiagnosticFixture(t,{
  spawn:(exe,_args,options)=>child=spawn(exe,['-e',script,mode],{...options,cwd:os.tmpdir()})
 });
 t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill();});await control.call('ready');const result=await control.close();
 if(mode==='late'){assert.equal(result.code,0);assert.equal(child.exitCode,0);assert.equal(child.killed,false);assert.equal(result.nativeExitGrace,true);assert(!result.forced);}else{assert.equal(result.forced,true);assert.equal(child.killed,true);assert.notEqual(result.code,0);}
});
