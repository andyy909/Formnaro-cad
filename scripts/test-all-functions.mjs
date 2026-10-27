import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn,execFile,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {integrationManifest} from './stl-integration-manifest.mjs';
import {surfaceSuites,unitSuites,testInventory} from './all-functions-catalog.mjs';
import {createSpeechFixture} from './speech-fixture.mjs';

const args=process.argv.slice(2),options={mode:'source',suite:'all',output:'F:/Formnaro-Buildtemp/Gesamtpruefung-0.49.2/runs'};
if(args.includes('--help')){console.log('test:all-functions --mode source|packaged --suite all|unit|surface|<comma-separated IDs> --output <new run parent> [--exe <absolute EXE>] [--exploratory] [--list]');process.exit(0);}
for(let i=0;i<args.length;i++){const key=args[i].replace(/^--/,'');if(['exploratory','list'].includes(key))options[key]=true;else if(['mode','suite','output','exe'].includes(key)&&args[i+1])options[key]=args[++i];else throw Error('Unknown or incomplete argument: '+args[i]);}
if(!['source','packaged'].includes(options.mode))throw Error('Expected source or packaged mode');
if(options.mode==='packaged'&&(!options.exe||!path.isAbsolute(options.exe)))throw Error('Packaged mode requires --exe with an absolute path');
const root=process.cwd(),version=JSON.parse(fs.readFileSync('package.json','utf8')).version;
const selected=options.suite.split(','),units=options.mode==='source'?unitSuites(root):[],all=[...units,...surfaceSuites];
const suites=all.filter(s=>selected.includes('all')||selected.includes(s.id)||selected.includes(s.file)||s.file&&selected.includes('unit')||!s.file&&selected.includes('surface'));
for(const id of selected)if(!['all','unit','surface'].includes(id)&&!all.some(s=>s.id===id||s.file===id))throw Error('Unknown suite: '+id);
if(!suites.length)throw Error('No applicable suites');
if(options.list){console.log(JSON.stringify({version,suites,inventory:testInventory(root)},null,2));process.exit(0);}
fs.mkdirSync(options.output,{recursive:true});const directory=fs.mkdtempSync(path.join(path.resolve(options.output),options.mode+'-'));
const sha=v=>createHash('sha256').update(v).digest('hex'),hash=file=>sha(fs.readFileSync(file));
const manifest=integrationManifest(),manifestHash=sha(JSON.stringify(manifest));
const exe=options.mode==='packaged'?path.resolve(options.exe):createRequire(import.meta.url)('electron');
const identity=options.mode==='packaged'?{exeSha256:hash(exe),asarSha256:hash(path.join(path.dirname(exe),'resources/app.asar'))}:{};
const results=[],started=Date.now();let active=null;
const write=()=>fs.writeFileSync(path.join(directory,'summary.json'),JSON.stringify({ok:results.length===suites.length&&results.every(r=>r.ok),version,mode:options.mode,exploratory:!!options.exploratory,directory,startedAt:new Date(started).toISOString(),elapsedMs:Date.now()-started,sourceManifest:manifest,sourceSha256:manifestHash,...identity,selected:suites.map(s=>s.id),active,results,inventory:testInventory(root)},null,2));
function killTree(pid){if(process.platform==='win32'){try{execFileSync('taskkill',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}}else{try{process.kill(pid,'SIGKILL');}catch{}}}
async function execute(suite,command,argv,report){
 const dir=path.join(directory,suite.id.replaceAll(':','-'));fs.mkdirSync(dir,{recursive:true});
 if(suite.flag==='speech')createSpeechFixture(path.join(dir,'fixture.wav'));
 const log=path.join(dir,'process.log'),stream=fs.createWriteStream(log),begin=Date.now(),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 env.TEMP=path.dirname(directory);env.TMP=path.dirname(directory);env.PYTHONDONTWRITEBYTECODE='1';
 const receipt={id:suite.id,ok:false,command:path.basename(command),args:argv,startedAt:new Date(begin).toISOString(),...identity};
 if(suite.heavy&&os.freemem()<6*1024**3){Object.assign(receipt,{status:'incomplete-resource-reserve',error:'Heavy checks require at least 6 GiB available RAM.',availableBytes:os.freemem(),ms:Date.now()-begin});stream.end();return receipt;}
 const child=spawn(command,argv,{cwd:root,windowsHide:true,env,stdio:['ignore','pipe','pipe']});receipt.pid=child.pid;child.stdout.pipe(stream,{end:false});child.stderr.pipe(stream,{end:false});
 let stopReason=null;const stop=reason=>{if(stopReason)return;stopReason=reason;killTree(child.pid);};
 let sampling=false;
 const timer=setTimeout(()=>stop('timeout'),suite.timeoutMs),watch=setInterval(()=>{
  if(suite.phase==='recovery-write'){
   const checkpoint=path.join(path.dirname(report),'crash-ready.json');
   if(fs.existsSync(checkpoint)){const ready=JSON.parse(fs.readFileSync(checkpoint,'utf8'));if(ready.pid===child.pid&&path.resolve(ready.profile)===path.join(path.dirname(report),'offlinecad-verification-profile')){receipt.crashCheckpoint=checkpoint;receipt.crashCheckpointSha256=hash(checkpoint);stop('controlled-recovery-crash');}else stop('invalid-crash-checkpoint');}
  }
  if(suite.heavy&&os.freemem()<3*1024**3)stop('available-memory-below-3GiB');
  if(suite.heavy&&process.platform==='win32'&&!sampling){sampling=true;execFile('powershell.exe',['-NoProfile','-Command','Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize | ConvertTo-Json -Compress'],{windowsHide:true},(error,out)=>{sampling=false;if(error)return stop('memory-monitor-failure');try{const processes=JSON.parse(out),ids=new Set([child.pid]);let changed=true;while(changed){changed=false;for(const p of processes)if(ids.has(p.ParentProcessId)&&!ids.has(p.ProcessId)){ids.add(p.ProcessId);changed=true;}}const bytes=processes.filter(p=>ids.has(p.ProcessId)).reduce((n,p)=>n+Number(p.WorkingSetSize),0);receipt.peakProcessGroupBytes=Math.max(receipt.peakProcessGroupBytes??0,bytes);if(bytes>4*1024**3)stop('test-process-group-above-4GiB');}catch{stop('memory-monitor-invalid-output');}});}
 },2000);
 const code=await new Promise(resolve=>{child.once('error',error=>{receipt.error=error.message;resolve(null);});child.once('close',resolve);});clearTimeout(timer);clearInterval(watch);await new Promise(r=>stream.end(r));
 Object.assign(receipt,{exitCode:code,stopReason,log,logSha256:hash(log),ms:Date.now()-begin,status:'failed'});
 try{
  if(stopReason==='controlled-recovery-crash'&&receipt.crashCheckpoint){receipt.count=1;receipt.expectedForcedTermination=true;}
  else if(code!==0||stopReason)throw Error(stopReason??'Process did not exit successfully');
  else if(report){const r=JSON.parse(fs.readFileSync(report,'utf8'));if(r.ok!==true||(r.errors??[]).length||(r.external??[]).length||r.cloudRequests)throw Error('Failed application report');if(r.appVersion&&r.appVersion!==version)throw Error('Application version mismatch');if(r.isolatedProfile!==true)throw Error('Missing isolated-profile proof');if(options.mode==='packaged'&&(r.exeSha256!==identity.exeSha256||r.asarSha256!==identity.asarSha256))throw Error('EXE/ASAR identity mismatch');Object.assign(receipt,{report,reportSha256:hash(report),count:r.checks.length});}
  else{const tap=fs.readFileSync(log,'utf8'),count=Number(tap.match(/^# tests (\d+)$/m)?.[1]);if(!count||!/^# fail 0$/m.test(tap)||!/^# skipped 0$/m.test(tap)||!/^# cancelled 0$/m.test(tap))throw Error('Incomplete or failing TAP totals');receipt.count=count;}
  if(report&&receipt.count<(suite.minimum??1))throw Error('Application report contains fewer checks than the current suite contract');
  Object.assign(receipt,{ok:true,status:'passed'});
 }catch(error){receipt.error=error.message;}
 fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify(receipt,null,2));return receipt;
}
write();console.log(JSON.stringify({directory,suites:suites.length,version}));
for(const suite of suites){
 active=suite.id;write();const dir=path.join(directory,suite.id.replaceAll(':','-')),report=path.join(dir,'result.json');
 const result=await execute(suite,suite.file?process.execPath:exe,suite.file?['--test','--test-concurrency=1',suite.file]:[...(options.mode==='source'?[root]:[]),'--verify-'+suite.flag+'='+report,...(suite.phase?['--verify-all-phase='+suite.phase]:[])],suite.file?null:report);
 results.push(result);console.log(JSON.stringify({id:suite.id,ok:result.ok,count:result.count,ms:result.ms,error:result.error}));
 if(result.ok&&suite.id==='workflow'){
  const handshake=JSON.parse(fs.readFileSync(report,'utf8')).handshake;
  const reopened={...suite,id:'workflow-reopen'};results.push(await execute(reopened,exe,[...(options.mode==='source'?[root]:[]),'--verify-release-workflow='+path.join(directory,'workflow-reopen/result.json'),'--verify-release-reopen='+handshake],path.join(directory,'workflow-reopen/result.json')));
 }
 if(result.ok&&suite.id==='recovery'){
  const readReport=path.join(dir,'result-read.json');
  results.push(await execute({...suite,id:'recovery-read',phase:'recovery-read'},exe,[...(options.mode==='source'?[root]:[]),'--verify-all-functions='+readReport,'--verify-all-phase=recovery-read'],readReport));
 }
 active=null;write();
}
const changed=sha(JSON.stringify(integrationManifest()))!==manifestHash;
const summary=JSON.parse(fs.readFileSync(path.join(directory,'summary.json'),'utf8'));
summary.active=null;summary.sourceChanged=changed;summary.ok=results.every(r=>r.ok)&&(!changed||options.exploratory===true);summary.completedAt=new Date().toISOString();summary.count=results.reduce((n,r)=>n+(r.ok?r.count??0:0),0);
fs.writeFileSync(path.join(directory,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({ok:summary.ok,count:summary.count,directory,sourceChanged:changed}));if(!summary.ok)process.exitCode=1;
