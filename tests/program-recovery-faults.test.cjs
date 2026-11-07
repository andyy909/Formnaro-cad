const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process'),{Worker}=require('node:worker_threads');
const {createProgramStore}=require('../backend/program-storage.cjs');
const workerFile=path.resolve(__dirname,'../backend/program-storage-worker.cjs');
const hook=path.resolve(__dirname,'fixtures/recovery-storage-fault.cjs');
const key='offlinecad-autosave-v7';
const confirmed=JSON.stringify({fixture:'last confirmed snapshot'});
const replacement=JSON.stringify({fixture:'new checkpoint'});

function fixture(t){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-storage-fault-'));
 t.after(()=>{
  assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));
  assert(path.basename(directory).startsWith('formnaro-storage-fault-'));
  fs.rmSync(directory,{recursive:true,force:true});
 });
 const store=createProgramStore(directory,{cadOnly:true});
 store.initialize({});
 const {revision}=store.change({key,value:confirmed,revision:'missing'});
 const job={kind:'ocad',directory,args:{key,revision,value:replacement}};
 const previous=path.join(directory,require('../backend/program-data.json')[key].file)+'.vorher';
 return {store,job,previous};
}

function workerResult(worker){
 return new Promise((resolve,reject)=>{
  worker.once('message',resolve);
  worker.once('error',reject);
  worker.once('exit',code=>reject(Error('Worker exited '+code)));
 });
}
function faultWorker(job,mode){
 return new Worker(workerFile,{workerData:job,execArgv:['--require',hook],env:{...process.env,FORMNARO_RECOVERY_FAULT:mode}});
}

test('ENOSPC leaves the committed autosave readable and preserves the previous generation',async t=>{
 const {store,job,previous}=fixture(t);
 const worker=faultWorker(job,'disk-full');
 const result=await workerResult(worker);
 assert.equal(result.ok,false);
 assert.match(result.error,/gespeichert werden/);
 assert.equal(store.read(key).value,confirmed);
 assert.equal(fs.readFileSync(previous,'utf8'),confirmed);
 assert.equal(fs.readdirSync(job.directory).filter(name=>name.endsWith('.tmp')).length,0);
});

test('external modification during staging still wins the final revision check',async t=>{
 const {store,job,previous}=fixture(t);
 const result=await workerResult(faultWorker(job,'external-after-stage'));
 assert.equal(result.ok,false);
 assert.equal(result.code,'RECOVERY_CHANGED');
 assert.equal(store.read(key).value,'external replacement during staging');
 assert.equal(fs.readFileSync(previous,'utf8'),confirmed);
});

test('a Windows file lock prevents replacement and leaves the exact previous recovery', {skip:process.platform!=='win32',timeout:15000},async t=>{
 const {store,job,previous}=fixture(t);
 const file=previous.slice(0,-'.vorher'.length);
 const script=`$ErrorActionPreference='Stop';$lock=[System.IO.File]::Open($env:FORMNARO_LOCK_TARGET,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::ReadWrite);try{[Console]::WriteLine('READY');[Console]::ReadLine()|Out-Null}finally{$lock.Dispose()}`;
 const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{
  windowsHide:true,env:{...process.env,FORMNARO_LOCK_TARGET:file},stdio:['pipe','pipe','pipe']
 });
 const exit=new Promise(resolve=>child.once('close',resolve));
 try{
  await new Promise((resolve,reject)=>{
   let stdout='',stderr='';
   child.stdout.on('data',chunk=>{stdout+=chunk.toString();if(stdout.includes('READY'))resolve();});
   child.stderr.on('data',chunk=>{stderr+=chunk.toString();});
   child.once('error',reject);
   child.once('close',code=>reject(Error('Lock holder exited '+code+': '+stderr)));
  });
  await assert.rejects(store.changeRecovery(job.args),/gespeichert werden/);
  assert.equal(store.read(key).value,confirmed);
  assert.equal(fs.readFileSync(previous,'utf8'),confirmed);
 }finally{child.stdin.end('\n');await exit;}
 assert.equal((await store.changeRecovery(job.args)).revision,store.read(key).revision);
 assert.equal(store.read(key).value,replacement);
});

test('terminating the storage worker before atomic replace leaves only the confirmed file recoverable',async t=>{
 const {store,job,previous}=fixture(t);
 const worker=faultWorker(job,'hold');
 try{assert.deepEqual(await workerResult(worker),{injected:'before-replace'});}
 finally{await worker.terminate();}
 assert.equal(store.read(key).value,confirmed);
 assert.equal(fs.readFileSync(previous,'utf8'),confirmed);
 assert(fs.readdirSync(job.directory).some(name=>name.endsWith('.tmp')));
});

test('process loss after flushing the staged file preserves the confirmed autosave on fresh initialization',async t=>{
 const {store,job,previous}=fixture(t);
 const code='const {Worker}=require("node:worker_threads");new Worker(process.argv[1],{workerData:JSON.parse(process.argv[2])});';
 const child=spawn(process.execPath,['--require',hook,'-e',code,workerFile,JSON.stringify(job)],{
  windowsHide:true,env:{...process.env,FORMNARO_RECOVERY_FAULT:'crash'},stdio:'ignore'
 });
 const [exitCode,signal]=await new Promise((resolve,reject)=>{
  child.once('error',reject);
  child.once('exit',(...args)=>resolve(args));
 });
 assert(exitCode!==0||signal!==null,'Fault injection did not stop the isolated process');
 assert(fs.readdirSync(job.directory).some(name=>name.endsWith('.tmp')),'Crash did not occur after staging');
 const reopened=createProgramStore(store.directory,{cadOnly:true}).initialize({});
 assert.equal(reopened.values[key],confirmed);
 assert.equal(fs.readFileSync(previous,'utf8'),confirmed);
});
