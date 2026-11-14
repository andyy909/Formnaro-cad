const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{EventEmitter}=require('node:events');
function fixture(outcome){
 const child=new EventEmitter(),delays=[];child.connected=true;child.killed=false;child.send=(message,callback)=>{callback?.();if(message.method==='close'&&outcome==='normal')setTimeout(()=>child.emit('exit',0,null),2);};child.kill=()=>{child.killed=true;if(outcome==='forced')setTimeout(()=>child.emit('exit',null,'SIGTERM'),1);};
 const module={exports:{}},context={module,exports:module.exports,process,Promise,Set,Map,Date,Error,clearTimeout,setTimeout:(fn,ms)=>{delays.push(ms);return setTimeout(fn,ms===30000?12:ms===5000?8:ms);},require:name=>name==='node:child_process'?{spawn:()=>child}:name==='node:fs'?{mkdirSync:()=>{}}:require(name)};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../backend/ai-diagnostic-child.cjs','utf8'),context);
 return {control:module.exports.openDiagnosticChild({app:{isPackaged:true},directory:'isolated',executable:'test.exe'}),child,delays};
}
test('normal OS exit is observed and never forced',async()=>{const f=fixture('normal'),r=await f.control.close();assert.equal(r.code,0);assert.equal(r.signal,null);assert.equal(f.child.killed,false);assert(f.delays.includes(30000));});
test('a forced process termination cannot become a clean result',async()=>{const f=fixture('forced'),r=await f.control.close();assert.equal(r.forced,true);assert.equal(r.signal,'SIGTERM');assert.notEqual(r.code,0);});
test('an unconfirmed process remains unconfirmed even after the close request',async()=>{const f=fixture('unconfirmed'),r=await f.control.close();assert.equal(r.signal,'exit-unconfirmed');assert.equal(r.forced,true);assert.equal(r.code,null);});
