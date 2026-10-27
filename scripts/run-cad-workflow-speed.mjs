import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export function workflowSampleStats(samples){if(!Array.isArray(samples)||!samples.length||samples.some(n=>!Number.isFinite(n)||n<0))throw Error('Invalid workflow samples');const sorted=samples.toSorted((a,b)=>a-b),n=sorted.length;return {count:n,medianMs:(sorted[Math.floor((n-1)/2)]+sorted[Math.ceil((n-1)/2)])/2,p95Ms:sorted[Math.ceil(n*.95)-1],minMs:sorted[0],maxMs:sorted.at(-1)};}
export function compareWorkflowReports(pairs,{ratioLimit=1.25,absoluteLimitMs=10}={}){
 if(!Array.isArray(pairs)||pairs.length<2)throw Error('At least two alternating pairs required');const rows=[];
 for(const [round,pair] of pairs.entries()){
  const b=pair.baseline,a=pair.candidate;if(!b.ok||!a.ok||b.smoke||a.smoke||b.probe!==a.probe||b.probeSha256!==a.probeSha256||b.fixture.geometrySha256!==a.fixture.geometrySha256||JSON.stringify(b.fixture.quality)!==JSON.stringify(a.fixture.quality))throw Error('Probe, source geometry or quality differs');
  if(JSON.stringify(Object.keys(b.metrics).sort())!==JSON.stringify(Object.keys(a.metrics).sort()))throw Error('Workflow metric scope differs');
  for(const task of Object.keys(b.metrics)){const before=b.metrics[task],after=a.metrics[task],cold=before.mode==='worker-cold';if(before.mode!==after.mode||before.samples.length<(cold?3:21)||after.samples.length<(cold?3:21)||!cold&&(before.warmups<3||after.warmups<3))throw Error('Incomplete workflow samples: '+task);const bs=workflowSampleStats(before.samples),as=workflowSampleStats(after.samples);for(const statistic of cold?['medianMs']:['medianMs','p95Ms'])rows.push({round:round+1,task,mode:before.mode,statistic,beforeMs:bs[statistic],afterMs:as[statistic],ratio:bs[statistic]===0?null:as[statistic]/bs[statistic],deltaMs:as[statistic]-bs[statistic],materialSlowdown:as[statistic]>bs[statistic]*ratioLimit&&as[statistic]-bs[statistic]>absoluteLimitMs,before:bs,after:as});}
 }
 const groups=new Map();for(const row of rows){const key=row.task+'/'+row.statistic,group=groups.get(key)??[];group.push(row);groups.set(key,group);}const regressions=[...groups].filter(([,group])=>group.filter(r=>r.materialSlowdown).length>=2).map(([key,group])=>({key,affectedRounds:group.filter(r=>r.materialSlowdown).map(r=>r.round)}));return {ok:regressions.length===0,threshold:{ratioLimit,absoluteLimitMs,repeatedRounds:2},comparisons:rows,regressions};
}
function identity(exe,{source=false,cwd}={}){const asar=path.join(path.dirname(exe),'resources','app.asar'),files=[exe,...(!source&&fs.existsSync(asar)?[asar]:[])];if(!source&&files.length!==2)throw Error('Packaged app.asar missing: '+exe);if(source)for(const relative of ['electron.cjs','preload.cjs','dist/index.html','package.json'])files.push(path.join(cwd,relative));return {source,files:files.map(file=>({file:path.resolve(file),sha256:hash(file)}))};}
function verifyIdentity(value){for(const item of value.files)if(hash(item.file)!==item.sha256)throw Error('Accepted application changed: '+item.file);}
const freePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?reject(error):resolve(port));});});
function deadline(promise,ms,label){let timer;return Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error(label+' timed out')),ms))]).finally(()=>clearTimeout(timer));}
class Inspector {
 constructor(socket){this.socket=socket;this.next=1;this.pending=new Map();this.events=new Map();this.waiters=new Map();this.scriptUrls=new Map();socket.addEventListener('message',event=>{let message;try{message=JSON.parse(event.data);}catch{return;}if(message.id){const task=this.pending.get(message.id);if(task){this.pending.delete(message.id);message.error?task.reject(Error(JSON.stringify(message.error))):task.resolve(message.result);}}else if(message.method){if(message.method==='Debugger.scriptParsed')this.scriptUrls.set(message.params.scriptId,message.params.url);const waiting=this.waiters.get(message.method);if(waiting){this.waiters.delete(message.method);waiting(message.params);}else{const events=this.events.get(message.method)??[];events.push(message.params);this.events.set(message.method,events);}}});}
 send(method,params={}){const id=this.next++;return deadline(new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.socket.send(JSON.stringify({id,method,params}));}),30000,'Inspector '+method);}
 event(name){const queue=this.events.get(name);if(queue?.length)return Promise.resolve(queue.shift());return deadline(new Promise(resolve=>this.waiters.set(name,resolve)),30000,'Inspector event '+name);}
}
export async function runWorkflowProbe({exe,source=false,cwd=process.cwd(),directory,smoke=false,timeoutMs=900000}={}){
 exe=path.resolve(exe);directory=path.resolve(directory);if(fs.existsSync(directory))throw Error('Workflow output must be new: '+directory);fs.mkdirSync(directory,{recursive:true});
 const before=identity(exe,{source,cwd}),port=await freePort(),resultFile=path.join(directory,'result.json'),probeFile=fileURLToPath(new URL('./cad-workflow-speed-probe.cjs',import.meta.url)),probeSha256=hash(probeFile),logFile=path.join(directory,'process.log'),stream=fs.createWriteStream(logFile,{flags:'wx'}),env={...process.env,FORMNARO_WORKFLOW_SPEED_SMOKE:smoke?'1':'0'};delete env.ELECTRON_RUN_AS_NODE;
 const args=[...(source?['.']:[]),'--inspect-brk=127.0.0.1:'+port,'--verify-modeling='+resultFile],child=spawn(exe,args,{cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let stderr='',resolveInspector,rejectInspector;
 const inspectorUrl=new Promise((resolve,reject)=>{resolveInspector=resolve;rejectInspector=reject;}),completed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
 child.stdout.on('data',chunk=>stream.write(chunk));child.stderr.on('data',chunk=>{stream.write(chunk);stderr+=chunk.toString();const match=stderr.match(/Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[^\s]+)/);if(match)resolveInspector(match[1]);if(stderr.length>50000)stderr=stderr.slice(-25000);});child.once('error',rejectInspector);child.once('close',code=>rejectInspector(Error('App exited before inspector connection: '+code)));
 let socket,injection;
 try{
  const url=await deadline(inspectorUrl,30000,'Inspector startup');socket=new WebSocket(url);const inspector=new Inspector(socket);await deadline(new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});}),30000,'Inspector connect');
  await inspector.send('Runtime.enable');await inspector.send('Debugger.enable');await inspector.send('Runtime.runIfWaitingForDebugger');
  const frameUrl=frame=>frame.url||inspector.scriptUrls.get(frame.location.scriptId)||'',findEntry=paused=>paused.callFrames.find(frame=>/(?:^|[/\\])electron\.cjs$/.test(frameUrl(frame)));
  let paused=await inspector.event('Debugger.paused'),frame=findEntry(paused);
  if(!frame){await inspector.send('Debugger.setBreakpointByUrl',{urlRegex:'(?:^|[/\\\\])electron\\.cjs$',lineNumber:0});for(let attempts=0;attempts<8&&!frame;attempts++){await inspector.send('Debugger.resume');paused=await inspector.event('Debugger.paused');frame=findEntry(paused);}}
  if(!frame)throw Error('Did not pause in the app CommonJS entry point');
  const expression=`(()=>{const load=typeof require==='function'?require:module.require.bind(module);const target=load('./backend/modeling-verification.cjs'),probe=load(${JSON.stringify(probeFile)});if(typeof target.verifyModeling!=='function'||typeof probe.verifyModeling!=='function')throw Error('Unexpected verification module');target.verifyModeling=probe.verifyModeling;return {installed:target.verifyModeling===probe.verifyModeling,entry:${JSON.stringify(frameUrl(frame))},probeSha256:${JSON.stringify(probeSha256)}};})()`;
  const evaluated=await inspector.send('Debugger.evaluateOnCallFrame',{callFrameId:frame.callFrameId,expression,returnByValue:true});if(evaluated.exceptionDetails||!evaluated.result?.value?.installed)throw Error('Workflow harness injection failed: '+JSON.stringify(evaluated.exceptionDetails??evaluated.result));injection=evaluated.result.value;
  await inspector.send('Debugger.resume');await inspector.send('Debugger.disable');socket.close();socket=null;
  const exit=await deadline(completed,timeoutMs,'Workflow application');if(exit.code!==0||!fs.existsSync(resultFile))throw Error('Workflow app failed '+JSON.stringify(exit)+'; '+logFile);
  const report=JSON.parse(fs.readFileSync(resultFile,'utf8'));if(!report.ok||!report.isolatedProfile||report.errors?.length||report.external?.length||report.probeSha256!==probeSha256||report.smoke!==smoke||report.probe!=='formnaro-existing-workflows-v1')throw Error('Incomplete workflow probe: '+resultFile);
  verifyIdentity(before);if(hash(probeFile)!==probeSha256)throw Error('Workflow probe source changed during measurement');
  const proof={file:resultFile,sha256:hash(resultFile),identity:before,unchangedProductBundle:true,injection,appVersion:report.appVersion,report};fs.writeFileSync(path.join(directory,'identity.json'),JSON.stringify({...proof,report:undefined},null,2));return proof;
 }finally{socket?.close();if(child.exitCode===null){child.kill();await deadline(completed,15000,'Workflow cleanup').catch(()=>{});}stream.end();verifyIdentity(before);}
}

async function main(){
 const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i++){const key=args[i];if(['--smoke','--source'].includes(key))options[key.slice(2)]=true;else if(['--baseline','--candidate','--previous','--out','--rounds'].includes(key))options[key.slice(2)]=args[++i];else throw Error('Unknown option '+key);}
 if(!options.candidate)throw Error('Use --candidate <EXE> [--source] with --baseline <accepted EXE>, --out <new dir>');const out=path.resolve(options.out??'work/cad-drawings/workflow-speed-'+Date.now());if(fs.existsSync(out))throw Error('Output must be new: '+out);fs.mkdirSync(out,{recursive:true});
 if(options.smoke){const result=await runWorkflowProbe({exe:options.candidate,source:!!options.source,directory:path.join(out,'smoke'),smoke:true});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({ok:true,releaseEligible:false,smoke:true,result:{...result,report:undefined}},null,2));console.log('Workflow smoke passed: '+out);return;}
 if(!options.baseline)throw Error('Paired measurements require --baseline');const rounds=Number(options.rounds??2);if(!Number.isInteger(rounds)||rounds<2||rounds>5)throw Error('Use two to five alternating pairs');
 const references=[{name:'baseline',exe:path.resolve(options.baseline)}];if(options.previous&&path.resolve(options.previous)!==references[0].exe)references.push({name:'previous',exe:path.resolve(options.previous)});
 const groups=[];
 for(const reference of references){const pairs=[];for(let round=1;round<=rounds;round++){
  console.log(reference.name+' round '+round+' accepted');const baseline=await runWorkflowProbe({exe:reference.exe,directory:path.join(out,reference.name+'-'+round)});
  console.log(reference.name+' round '+round+' candidate');const candidate=await runWorkflowProbe({exe:options.candidate,source:!!options.source,directory:path.join(out,reference.name+'-candidate-'+round)});
  pairs.push({baseline:baseline.report,candidate:candidate.report,proofs:{baseline:{...baseline,report:undefined},candidate:{...candidate,report:undefined}}});
 }groups.push({reference:reference.name,...compareWorkflowReports(pairs),runs:pairs.map(pair=>pair.proofs)});}
 const report={ok:groups.every(g=>g.ok),releaseEligible:true,probeSha256:hash(fileURLToPath(new URL('./cad-workflow-speed-probe.cjs',import.meta.url))),order:'accepted, candidate, accepted, candidate; each process isolated and awaited, no parallel timing',groups,limits:'Repeated median and warm p95 regressions greater than 25 percent AND 10ms fail. Worker-cold three-sample p95 is descriptive only. Same native sources and exact quality are required; app ASAR/EXE and external harness hashes remain unchanged. Other machine activity must be excluded by the caller.'};fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(!report.ok)throw Error('Repeatable workflow slowdown: '+JSON.stringify(groups.flatMap(g=>g.regressions)));console.log('Paired workflow speed passed: '+out);
}
if(import.meta.url===pathToFileURL(path.resolve(process.argv[1]??'')).href)main().catch(error=>{console.error(error.stack??error.message);process.exitCode=1;});
