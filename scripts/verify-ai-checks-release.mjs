import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {integrationManifest} from './stl-integration-manifest.mjs';
const root=process.cwd(),meta=JSON.parse(fs.readFileSync('package.json','utf8')),mode=process.argv[2]??'source';
if(meta.version!=='0.49.1'||!['source','packaged'].includes(mode))throw Error('Expected AI result-check release 0.49.1 and source/packaged mode');
const checks=path.join(root,'work/cad-ai-result-checks/checks');fs.mkdirSync(checks,{recursive:true});
const run=fs.mkdtempSync(path.join(checks,mode+'-')),manifest=integrationManifest(),sha=value=>createHash('sha256').update(value).digest('hex'),hash=file=>sha(fs.readFileSync(file)),sourceSha256=sha(JSON.stringify(manifest));
const electron=createRequire(import.meta.url)('electron'),build=mode==='packaged'?JSON.parse(fs.readFileSync(path.join(checks,'build.json'),'utf8')):null,exe=build?path.join(build.runtime,'Formnaro.exe'):electron;
const proofs=[];
async function execute(name,command,args,{report,environment={}}={}){
 const log=path.join(run,name+'.log'),stream=fs.createWriteStream(log),started=Date.now();
 const child=spawn(command,args,{cwd:root,windowsHide:true,env:{...process.env,...environment},stdio:['ignore','pipe','pipe']});child.stdout.pipe(stream,{end:false});child.stderr.pipe(stream,{end:false});
 const exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});await new Promise(r=>stream.end(r));
 if(exitCode!==0)throw Error(`${name} failed with exit ${exitCode}; see ${log}`);
 const text=fs.readFileSync(log,'utf8'),proof={name,exitCode,ms:Date.now()-started,log,logSha256:hash(log)};
 if(report){const value=JSON.parse(fs.readFileSync(report,'utf8'));if(!value.ok||value.errors?.length||value.external?.length||value.cloudRequests)throw Error('Failed report: '+report);proof.count=value.checks.length;proof.report=report;proof.reportSha256=hash(report);if(build&&(value.exeSha256!==build.exeSha256||value.asarSha256!==build.asarSha256))throw Error('Actual EXE identity differs');}
 else{proof.count=Number(text.match(/^# tests (\d+)$/m)?.[1]);if(!proof.count||!/^# fail 0$/m.test(text))throw Error('Missing successful TAP totals: '+log);}
 proofs.push(proof);console.log(name+': '+proof.count+' passed');
}
if(mode==='source'){
 const ai=['tests/cad-ai-result-checks.test.mjs','tests/cad-ai-enhancements.test.mjs','tests/ai-working-contract.test.mjs','tests/cad-ai-axis-native.test.mjs','tests/cad-ai-contract.test.mjs','tests/ai-backend.test.cjs','tests/cad-ai-chat-provider.test.cjs','tests/cad-ai-models.test.cjs','tests/cad-bridge-errors.test.cjs','tests/shared-ai.test.mjs','tests/shared-ai-service.test.cjs','tests/cad-mixed-ai.test.mjs'];
 const core=['tests/cad-project.test.mjs','tests/cad-transactions.test.mjs','tests/cad-controller.test.mjs','tests/cad-worker-client.test.mjs','tests/cad-service.test.mjs','tests/cad-persistent-worker.test.mjs','tests/cad-step-io.test.mjs','tests/cad-analysis-native.test.mjs','tests/cad-tools-native.test.mjs','tests/cad-affine.test.mjs','tests/cad-persistence.test.mjs'];
 await execute('ai-unit',process.execPath,['--test','--test-concurrency=1',...ai]);
 await execute('native-regression',process.execPath,['--test','--test-concurrency=1',...core]);
}
const surfaceSuites=[['result-checks','ai-result-checks',24],['easy-complete','easy-complete',98],['easy-auto','easy-auto-repair',22],['easy-domain','easy-domain',35],['workbench','workbench',14],['unified','unified-workflows',61],['shared-ai','shared-ai',24]];
async function surface([name,flag,minimum]){
 const directory=path.join(run,name);fs.mkdirSync(directory);const report=path.join(directory,'result.json');
 await execute(name,exe,[...(build?[]:['.']),'--verify-'+flag+'='+report],{report});if(proofs.find(p=>p.name===name).count<minimum)throw Error('Incomplete surface proof: '+name);
}
let nextSurface=0;await Promise.all(Array.from({length:2},async()=>{while(nextSurface<surfaceSuites.length){const index=nextSurface++;await surface(surfaceSuites[index]);}}));
if(mode==='source')for(const [name,script,prefix] of [['legacy-chat','tests/cad-app-ai-chat-desktop.cjs','CHAT'],['legacy-models','tests/cad-app-ai-models-desktop.cjs','MODEL']]){
 const label='ai-checks-'+path.basename(run),report=path.join(root,prefix==='CHAT'?'work/cad-ai-chat':'work/cad-ai-models',label,'result.json');
 await execute(name,electron,[script],{report,environment:{['FORMNARO_'+prefix+'_ENTRY']:path.join(root,'dist/index.html'),['FORMNARO_'+prefix+'_LABEL']:label}});
}
if(JSON.stringify(integrationManifest())!==JSON.stringify(manifest))throw Error('Public sources changed during acceptance');
const receipt={ok:true,version:meta.version,mode,sourceManifest:manifest,sourceSha256,proofs,unitChecks:proofs.filter(p=>!p.report).reduce((n,p)=>n+p.count,0),uiChecks:proofs.filter(p=>p.report).reduce((n,p)=>n+p.count,0),...(build?{exeSha256:build.exeSha256,asarSha256:build.asarSha256}:{})};
fs.writeFileSync(path.join(checks,mode+'-acceptance.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({ok:true,mode,unitChecks:receipt.unitChecks,uiChecks:receipt.uiChecks}));
