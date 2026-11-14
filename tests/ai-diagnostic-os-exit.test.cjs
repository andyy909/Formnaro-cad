const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),os=require('node:os'),{spawn}=require('node:child_process');
// Exercise the real OS process/IPC events. Only the long watchdog clock and
// launch path are adapted so this regression does not take two minutes.
for(const mode of ['late','hung'])test('real child shutdown: '+mode,async t=>{
 let child;const module={exports:{}},script=`setInterval(()=>{},1000);process.on('message',m=>{if(m.method==='close'){if(process.argv[1]==='late'){process.disconnect();setTimeout(()=>process.exit(0),400);}return;}process.send({id:m.id,value:true});});`;
 vm.runInNewContext(fs.readFileSync(__dirname+'/../backend/ai-diagnostic-child.cjs','utf8'),{module,exports:module.exports,process,Promise,Set,Map,Date,Error,clearTimeout,setTimeout:(fn,ms)=>setTimeout(fn,ms===30000?200:ms>30000&&ms<=120000?800:ms===5000?200:ms),require:name=>name==='node:child_process'?{spawn:(exe,args,options)=>{child=spawn(process.execPath,['-e',script,mode],{...options,cwd:os.tmpdir()});return child;}}:name==='node:fs'?{mkdirSync(){}}:require(name)});
 const control=module.exports.openDiagnosticChild({app:{isPackaged:true},directory:'unused',executable:process.execPath});t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill();});await control.call('ready');const result=await control.close();
 if(mode==='late'){assert.equal(result.code,0);assert.equal(child.exitCode,0);assert.equal(child.killed,false);assert.equal(result.nativeExitGrace,true);assert(!result.forced);}else{assert.equal(result.forced,true);assert.equal(child.killed,true);assert.notEqual(result.code,0);}
});
