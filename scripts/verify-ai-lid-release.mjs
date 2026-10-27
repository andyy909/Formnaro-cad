import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {integrationManifest} from './stl-integration-manifest.mjs';
const root=process.cwd(),mode=process.argv[2]??'source',work=path.resolve('work/ai-lid/checks'),version='0.50.0';
if(!['source','packaged'].includes(mode))throw Error('source or packaged required');
fs.mkdirSync(work,{recursive:true});
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sourceManifest=integrationManifest(),proofs=[],build=mode==='packaged'?JSON.parse(fs.readFileSync(path.join(work,'build.json'),'utf8')):null;
const run=path.join(work,mode+'-'+Date.now());fs.mkdirSync(run);
async function execute(name,exe,args,{report,minimum=1}={}){
 const log=path.join(run,name+'.log'),stream=fs.createWriteStream(log),start=Date.now();
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(exe,args,{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.pipe(stream,{end:false});child.stderr.pipe(stream,{end:false});
 const exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});await new Promise(r=>stream.end(r));
 if(exitCode!==0)throw Error(name+' failed: '+exitCode+'; '+log);
 const text=fs.readFileSync(log,'utf8');let count,reportHash;
 if(report){const r=JSON.parse(fs.readFileSync(report,'utf8'));if(!r.ok||r.errors?.length||r.external?.length||r.cloudRequests||r.appVersion!==version||!r.isolatedProfile)throw Error('Failed isolated application receipt: '+report);count=r.checks.length;reportHash=hash(report);if(build&&(r.exeSha256!==build.exeSha256||r.asarSha256!==build.asarSha256))throw Error('Wrong EXE identity');if(name==='ai-ui'&&!r.meshLid)throw Error('Missing actual lid UI check');}
 else{count=Number(text.match(/^# tests (\d+)$/m)?.[1]);if(!/^# fail 0$/m.test(text)||!/^# skipped 0$/m.test(text)||!/^# cancelled 0$/m.test(text))throw Error('Unit suite did not completely pass: '+log);}
 if(!Number.isSafeInteger(count)||count<minimum)throw Error('Incomplete verification: '+name);
 proofs.push({name,exitCode,count,ms:Date.now()-start,log,logSha256:hash(log),...(report?{report,reportSha256:reportHash}:{})});console.log(name+': '+count+' passed');
}
if(mode==='source'){
 await execute('ai-unit',process.execPath,['--test','--test-concurrency=1','tests/mesh-lid.test.mjs','tests/mesh-lid-controller.test.mjs','tests/cad-mixed-ai.test.mjs','tests/cad-ai-result-checks.test.mjs','tests/cad-ai-enhancements.test.mjs','tests/ai-working-contract.test.mjs','tests/cad-ai-axis-native.test.mjs','tests/cad-ai-contract.test.mjs'],{minimum:67});
 await execute('core-regression',process.execPath,['--test','--test-concurrency=1','tests/mesh-hollow.test.mjs','tests/mesh-hollow-controller.test.mjs','tests/mesh-make-solid-controller.test.mjs','tests/cad-transactions.test.mjs','tests/cad-project.test.mjs','tests/cad-mesh-source-tree.test.mjs','tests/cad-mesh-formats.test.mjs','tests/shared-ai-service.test.cjs'],{minimum:64});
}
const exe=build?path.join(build.runtime,'Formnaro.exe'):path.resolve('node_modules/electron/dist/electron.exe');
for(const [name,flag,minimum]of [['ai-ui','ai-result-checks',41],['easy-complete','easy-complete',98],['unified','unified-workflows',61]]){
 const dir=path.join(run,name);fs.mkdirSync(dir);const report=path.join(dir,'result.json');
 await execute(name,exe,[...(build?[]:['.']),'--verify-'+flag+'='+report],{report,minimum});
}
if(JSON.stringify(integrationManifest())!==JSON.stringify(sourceManifest))throw Error('Sources changed during verification');
const acceptance={ok:true,version,mode,sourceManifest,proofs,unitChecks:proofs.filter(p=>!p.report).reduce((n,p)=>n+p.count,0),uiChecks:proofs.filter(p=>p.report).reduce((n,p)=>n+p.count,0),...(build?{exeSha256:build.exeSha256,asarSha256:build.asarSha256}:{})};
fs.writeFileSync(path.join(work,mode+'-acceptance.json'),JSON.stringify(acceptance,null,2));console.log(JSON.stringify({ok:true,mode,unitChecks:acceptance.unitChecks,uiChecks:acceptance.uiChecks}));
