import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {packager} from '@electron/packager';
import {extractFile,listPackage,statFile} from '@electron/asar';
import {integrationManifest} from './stl-integration-manifest.mjs';

const meta=JSON.parse(fs.readFileSync('package.json','utf8'));
const version=meta.version,label='Schnellere-Baugruppen';if(version!=='0.76.2')throw Error('Expected 0.76.2');
const out=path.resolve('F:/Formnaro-Ausgaben/'+label+'-v'+version),temp=path.resolve(process.argv[2]??'F:/Formnaro-Buildtemp/'+label+'-v'+version+'-Final-r1'),stage=path.join(temp,'stage'),work=path.resolve('work/servo-performance/release-'+Date.now());
if(fs.existsSync(out)||fs.existsSync(temp))throw Error('Separate output and temp must be new');
fs.mkdirSync(work,{recursive:true});fs.mkdirSync(temp,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex'),hash=file=>sha(fs.readFileSync(file));
function files(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{if(e.isSymbolicLink())throw Error('Symlink excluded');const name=prefix+e.name;return e.isDirectory()?files(path.join(dir,e.name),name+'/'):[{file:name,sha256:hash(path.join(dir,e.name))}];}).sort((a,b)=>a.file.localeCompare(b.file));}
const wasmFiles=fs.readdirSync('dist/assets').filter(n=>n.endsWith('.wasm'));
if(wasmFiles.length!==2||!wasmFiles.some(n=>n.startsWith('formnaro_cad-')&&hash('dist/assets/'+n)===hash('cad-kernel-build/runtime/formnaro_cad.wasm')))throw Error('Unexpected CAD/mesh kernel bundle');
const sourceManifest=integrationManifest(),proofs=[];
const baseline=JSON.parse(fs.readFileSync('work/mesh-sketch-upgrade-20261020/baseline.json')),preserve=[...baseline.preserve];
const scaleRegressionReport=path.resolve('work/servo-performance/scale-regression/result.json'),scaleRegression=JSON.parse(fs.readFileSync(scaleRegressionReport));
if(!scaleRegression.ok||scaleRegression.cases.length!==18||!scaleRegression.escape||!scaleRegression.pointercancel||!scaleRegression.clickDimensions||scaleRegression.errors.length||scaleRegression.external.length)throw Error('Incomplete scale regression');
const status=JSON.parse(fs.readFileSync('work/mesh-sketch-upgrade-20261020/STATUS.json'));
for(const prior of status.completedPackages){const r=JSON.parse(fs.readFileSync(prior.acceptance));for(const [file,sha256]of [[path.join(r.runtime,'Formnaro.exe'),r.exeSha256],[path.join(r.runtime,'resources/app.asar'),r.asarSha256]])if(!preserve.some(p=>p.file===file))preserve.push({file,sha256});}
for(const p of preserve)if(hash(p.file)!==p.sha256)throw Error('Previous runtime already differs: '+p.file);
async function execute(name,exe,args){
 const log=path.join(work,name+'.log'),fd=fs.openSync(log,'wx'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(exe,args,{env,windowsHide:true,stdio:['ignore',fd,fd]});
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});fs.closeSync(fd);
 if(code!==0)throw Error(name+' failed: '+code+'; '+log);
 proofs.push({name,log,sha256:hash(log)});console.log(name+' passed');return log;
}
async function ui(mode,exe,args=[]){
 const receipts=[];
 for(const [flag,min]of [['move-dimensions',45],['number-display',14],['workbench',14],['cad-mini-performance',5]]){
  const dir=path.join(temp,mode+'-'+flag),report=path.join(dir,'result.json');fs.mkdirSync(dir);
  await execute(mode+'-'+flag,exe,[...args,'--verify-'+flag+'='+report]);const r=JSON.parse(fs.readFileSync(report,'utf8'));
  if(!r.ok||r.appVersion!==version||!r.isolatedProfile||r.checks.length<min||r.errors?.length||r.external?.length)throw Error('Incomplete UI proof '+report);
  receipts.push({flag,checks:r.checks.length,report,sha256:hash(report),...(r.exeSha256?{exeSha256:r.exeSha256,asarSha256:r.asarSha256}:{})});
 }
 return receipts;
}
const unitLog=await execute('unit',process.execPath,['--test','--test-concurrency=1','tests/cad-read-view.test.mjs','tests/cad-translation-view.test.mjs','tests/cad-translation-controller.test.mjs','tests/cad-transactions.test.mjs','tests/cad-persistent-worker.test.mjs','tests/cad-project.test.mjs','tests/cad-recovery.test.mjs','tests/cad-persistence.test.mjs','tests/cad-move-dimensions.test.mjs','tests/cad-affine.test.mjs','tests/cad-render-scheduler.test.mjs','tests/cad-display-cache.test.mjs','tests/cad-move-performance.test.mjs','tests/cad-workspace.test.mjs','tests/ui-numbers.test.mjs']);
const unitText=fs.readFileSync(unitLog,'utf8');if(!/^# fail 0$/m.test(unitText)||!/^# skipped 0$/m.test(unitText))throw Error('Incomplete unit tests');
const priorRuntime='F:/Formnaro-Ausgaben/Verschiebemasse-v0.75.0/Formnaro-win32-x64';for(const file of [priorRuntime+'/Formnaro.exe',priorRuntime+'/resources/app.asar'])preserve.push({file,sha256:hash(file)});
const initialRuntime='F:/Formnaro-Ausgaben/Schnellere-Baugruppen-v0.76.0/Formnaro-win32-x64';for(const file of [initialRuntime+'/Formnaro.exe',initialRuntime+'/resources/app.asar'])preserve.push({file,sha256:hash(file)});
const sourceUI=await ui('source',path.resolve('node_modules/electron/dist/electron.exe'),['.']);
fs.mkdirSync(stage,{recursive:true});
for(const name of ['dist','backend','electron.cjs','preload.cjs','package.json','LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt','licenses','ai','docs'])fs.cpSync(name,path.join(stage,name),{recursive:true,force:false,errorOnExist:true});
fs.mkdirSync(path.join(stage,'scripts'));fs.copyFileSync('scripts/offlinecad_ai.py',path.join(stage,'scripts/offlinecad_ai.py'));
const nativeNotice=path.join(stage,'licenses/cad-kernel');fs.mkdirSync(nativeNotice,{recursive:true});fs.cpSync('cad-kernel-build/runtime/licenses',path.join(nativeNotice,'licenses'),{recursive:true});
for(const file of ['README.md','integrity.json','upstream-lock.json','system-license-lock.json','build-inputs.json','formnaro_cad.provenance.json','formnaro_cad.build-manifest.json'])fs.copyFileSync('cad-kernel-build/runtime/'+file,path.join(nativeNotice,file));
const stageFiles=files(stage);process.env.TEMP=temp;process.env.TMP=temp;
const packed=await packager({tmpdir:temp,dir:stage,name:'Formnaro',platform:'win32',arch:'x64',out,asar:true,prune:false,overwrite:false,electronVersion:meta.devDependencies.electron,appVersion:version,appCopyright:'Copyright (c) 2026 '+meta.author,win32metadata:{CompanyName:meta.author,ProductName:'Formnaro',FileDescription:label}});
if(packed.length!==1)throw Error('Wrong package count');const runtime=packed[0],exe=path.join(runtime,'Formnaro.exe'),asar=path.join(runtime,'resources/app.asar');
fs.cpSync('converter/runtime-v010',path.join(runtime,'resources/converter'),{recursive:true,force:false,errorOnExist:true});
for(const name of ['README.md','provenance.json'])fs.copyFileSync('converter/'+name,path.join(runtime,'resources/converter',name));
for(const name of ['LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.copyFileSync(name,path.join(runtime,name));
for(const name of ['ai','docs'])fs.cpSync(name,path.join(runtime,name),{recursive:true,force:false,errorOnExist:true});fs.mkdirSync(path.join(runtime,'scripts'));fs.copyFileSync('scripts/offlinecad_ai.py',path.join(runtime,'scripts/offlinecad_ai.py'));
const runtimeFiles=files(runtime),exeSha256=hash(exe),asarSha256=hash(asar);console.log('Separate Windows build ready: '+exe);
fs.writeFileSync(path.join(work,'build.json'),JSON.stringify({version,runtime,out,temp,sourceManifest,sourceUI,runtimeFiles,stageFiles,preserve,exeSha256,asarSha256},null,2));
const packagedUI=await ui('packaged',exe);
if(packagedUI.some(r=>r.exeSha256!==exeSha256||r.asarSha256!==asarSha256))throw Error('Wrong tested executable');
if(JSON.stringify(integrationManifest())!==JSON.stringify(sourceManifest))throw Error('Sources changed during acceptance');
if(JSON.stringify(files(runtime))!==JSON.stringify(runtimeFiles))throw Error('Program files changed during tests');
for(const p of preserve)if(hash(p.file)!==p.sha256)throw Error('Previous program changed');
const names=listPackage(asar).map(n=>n.replace(/^[\\/]+/,'')).filter(n=>!statFile(asar,n).files).map(n=>n.split(path.sep).join('/')).sort();
if(JSON.stringify(names)!==JSON.stringify(stageFiles.map(e=>e.file).sort()))throw Error('ASAR entries differ');
for(const p of stageFiles){const data=extractFile(asar,p.file.split('/').join(path.sep));if(p.file==='package.json'){const actual=JSON.parse(data),expected=JSON.parse(fs.readFileSync(path.join(stage,p.file),'utf8'));for(const key of ['private','scripts','devDependencies'])delete expected[key];if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Package metadata differs');}else if(sha(data)!==p.sha256)throw Error('ASAR differs: '+p.file);}
await execute('corresponding-source-archives',process.execPath,['scripts/archive-step-thickness.mjs',out]);
const result={ok:true,version,label,runtime,exeSha256,asarSha256,unitChecks:Number(unitText.match(/^# tests (\d+)$/m)[1]),sourceUI,packagedUI,scaleRegression:{report:scaleRegressionReport,sha256:hash(scaleRegressionReport),cases:scaleRegression.cases.length},preserve,proofs,sourceManifest};
for(const file of [path.join(work,'acceptance.json'),path.join(out,'Abnahme.json')])fs.writeFileSync(file,JSON.stringify(result,null,2));
fs.writeFileSync(path.join(out,'Starten.txt'),'Formnaro '+version+' · Schnellere Baugruppen\nFormnaro-win32-x64/Formnaro.exe starten.\nVollständige CAD-Teile und fertige Gruppen schneller verschieben. Weitere Mauszüge beginnen nach Abschluss der vorherigen Übernahme.\nAnleitung: Formnaro-win32-x64/docs/SCHNELLERE-BAUGRUPPEN.md\nVorige Ausgaben bleiben erhalten.\n');
console.log(JSON.stringify({ok:true,runtime,unit:result.unitChecks,sourceUI:sourceUI.reduce((n,r)=>n+r.checks,0),packagedUI:packagedUI.reduce((n,r)=>n+r.checks,0),work}));

