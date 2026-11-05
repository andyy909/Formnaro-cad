// Run each historical workflow in its own disposable, time-bounded process.
import {fork,spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const args=process.argv.slice(2),option=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined;
const output=resolve(option('--output')??'work/cnc-regressions'),project=option('--project');
const cases=option('--case')?.split(',')??['rotation','post-commit-refresh','long-thread','nut-x','nut-tilt','large-project','correction-eight','scene-display-loop'];
mkdirSync(output,{recursive:true});
const results=[];
for(const name of cases){
 const started=Date.now(),events=[];
 const result=await new Promise(resolveResult=>{
  const child=fork(new URL('../tests/fixtures/cnc-regression-cases.mjs',import.meta.url),[name,...(project?[resolve(project)]:[])],{execArgv:['--max-old-space-size=1536'],stdio:['ignore','pipe','pipe','ipc']});
  let log='',outcome,timedOut=false;
  let limiter;
  if(process.platform==='win32'){
   limiter=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./cnc-process-limit.ps1',import.meta.url)),'-TargetProcessId',String(child.pid)],{windowsHide:true,stdio:['ignore','pipe','pipe']});
   let lines='';limiter.stdout.on('data',data=>{lines+=data;const rows=lines.split(/\r?\n/);lines=rows.pop();for(const row of rows)if(row.trim()){try{const event=JSON.parse(row);events.push(event);if(event.type==='limit-ready')child.send({start:true});}catch{log+=row;}}});
   limiter.stderr.on('data',data=>{log+=data;});limiter.on('exit',code=>{if(code&&!outcome){log+='OS process limit could not be established.';child.kill();}});
   limiter.on('error',error=>{log+=error.message;child.kill();});
  }else{log='This regression runner requires the Windows process memory limit.';child.kill();}
  for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{log=(log+data).slice(-16000);});
  child.on('message',message=>{if(message.type==='result')outcome=message.value;else events.push(message);});
  const timer=setTimeout(()=>{timedOut=true;child.kill();},240000);
  child.on('error',error=>{log+=error.message;});
  child.on('exit',(code,signal)=>{clearTimeout(timer);resolveResult({name,...outcome,status:timedOut?'time-limit':outcome?.status??'process-failed',exitCode:code,signal,durationMs:Date.now()-started,events,log});});
 });
 results.push(result);writeFileSync(resolve(output,name+'.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({name,status:result.status,durationMs:result.durationMs,error:result.error}));
}
writeFileSync(resolve(output,'results.json'),JSON.stringify({version:1,results},null,2));
if(results.some(r=>r.status==='process-failed'))process.exitCode=1;
