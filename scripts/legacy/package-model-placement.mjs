import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {packager} from '@electron/packager';
import {extractFile,listPackage,statFile} from '@electron/asar';
import {integrationManifest} from './stl-integration-manifest.mjs';

const version='0.60.0',meta=JSON.parse(fs.readFileSync('package.json','utf8'));
if(meta.version!==version)throw Error('Expected '+version);
const out=path.resolve('F:/Formnaro-Ausgaben/Importmitte-v'+version),temp=path.resolve('F:/Formnaro-Buildtemp/Importmitte-v'+version+'-Final-r5'),stage=path.join(temp,'stage'),work=path.resolve('work/model-placement/release-'+Date.now());
if(fs.existsSync(out)||fs.existsSync(temp))throw Error('Separate output must be new');
fs.mkdirSync(work,{recursive:true});fs.mkdirSync(temp,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex'),hash=file=>sha(fs.readFileSync(file));
function files(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{if(e.isSymbolicLink())throw Error('Symlink excluded');const name=prefix+e.name;return e.isDirectory()?files(path.join(dir,e.name),name+'/'):[{file:name,sha256:hash(path.join(dir,e.name))}];}).sort((a,b)=>a.file.localeCompare(b.file));}
const sourceManifest=integrationManifest(),proofs=[];
// Continue the completed source proofs only when every implementation/build
// file is byte-identical. The two exceptions are this packaging driver and
// the toolbar verifier whose expected icon count gained the new button.
const reusedRoot=path.resolve('F:/Formnaro-Buildtemp/Importmitte-v0.60.0-Final-r4'),reusedBaseline=path.join(reusedRoot,'source-easy-complete/result.json');
const ignoredProofFiles=new Set(['scripts/package-model-placement.mjs','backend/mesh-display-verification.cjs']);
const reusedManifest=JSON.parse(fs.readFileSync(reusedBaseline,'utf8')).sourceManifest;
if(!Array.isArray(reusedManifest)||JSON.stringify(reusedManifest.filter(e=>!ignoredProofFiles.has(e.file)))!==JSON.stringify(sourceManifest.filter(e=>!ignoredProofFiles.has(e.file))))throw Error('Completed source proofs do not match the current implementation');

const preserve=['F:/Formnaro-Ausgaben/Schnittmessung-v0.59.0/Formnaro-win32-x64/Formnaro.exe','F:/Formnaro-Ausgaben/Schnittmessung-v0.59.0/Formnaro-win32-x64/resources/app.asar','F:/Formnaro-Ausgaben/Modellierpinsel-v0.58.0/Formnaro-win32-x64/Formnaro.exe','F:/Formnaro-Ausgaben/Modellierpinsel-v0.58.0/Formnaro-win32-x64/resources/app.asar','F:/Formnaro-Ausgaben/CAD-Tinker-Tempo-v0.57.0/Formnaro-win32-x64/Formnaro.exe','F:/Formnaro-Ausgaben/CAD-Tinker-Tempo-v0.57.0/Formnaro-win32-x64/resources/app.asar','F:/Formnaro-Ausgaben/Mini-v0.6.1/Formnaro Mini-win32-x64/Formnaro Mini.exe','F:/Formnaro-Ausgaben/Mini-v0.6.1/Formnaro Mini-win32-x64/resources/app.asar','F:/Formnaro-Ausgaben/Mini-CAD-v0.1.0-r2/Formnaro Mini CAD-win32-x64/Formnaro Mini CAD.exe','F:/Formnaro-Ausgaben/Mini-CAD-v0.1.0-r2/Formnaro Mini CAD-win32-x64/resources/app.asar'].map(file=>({file,sha256:hash(file)}));
async function execute(name,exe,args){
 const log=path.join(work,name+'.log'),fd=fs.openSync(log,'wx'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(exe,args,{env,windowsHide:true,stdio:['ignore',fd,fd]});
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});fs.closeSync(fd);
 if(code!==0)throw Error(name+' failed: '+code+'; '+log);
 proofs.push({name,log,sha256:hash(log)});console.log(name+' passed');return log;
}
async function ui(mode,exe,args=[]){
 const receipts=[];
 for(const [flag,min]of [['model-placement',25],['creation-domain',21],['workbench',14],['easy-complete',98],['mesh-display',17],['inspection',39]]){
  const prior=path.join(reusedRoot,'source-'+flag,'result.json');
  if(mode==='source'&&!['mesh-display','inspection'].includes(flag)&&fs.existsSync(prior)){
    const r=JSON.parse(fs.readFileSync(prior,'utf8'));if(!r.ok||r.appVersion!==version||!r.isolatedProfile||r.checks.length<min||r.errors?.length||r.external?.length)throw Error('Incomplete reused proof '+prior);
    if(flag==='model-placement'){const independent=path.join(path.dirname(prior),'independent-exports.json');if(!JSON.parse(fs.readFileSync(independent,'utf8')).ok)throw Error('Independent proof missing');proofs.push({name:'source-independent-placement',log:independent,sha256:hash(independent)});}
    receipts.push({flag,checks:r.checks.length,report:prior,sha256:hash(prior),reuseBaseline:reusedBaseline,baselineSha256:hash(reusedBaseline)});console.log('source-'+flag+' reused after exact implementation hash comparison');continue;
  }
  const dir=path.join(temp,mode+'-'+flag),report=path.join(dir,'result.json');fs.mkdirSync(dir);
  await execute(mode+'-'+flag,exe,[...args,'--verify-'+flag+'='+report]);const r=JSON.parse(fs.readFileSync(report,'utf8'));
  if(!r.ok||r.appVersion!==version||!r.isolatedProfile||r.checks.length<min||r.errors?.length||r.external?.length)throw Error('Incomplete UI proof '+report);
  if(flag==='model-placement')await execute(mode+'-independent-placement','python',['scripts/verify-placement-exports.py',dir]);
  if(flag==='inspection')await execute(mode+'-independent-inspection','python',['scripts/verify-inspection-exports.py',dir]);
  if(flag==='mesh-sculpt')await execute(mode+'-independent-exports','python',['scripts/verify-sculpt-exports.py',dir]);
  receipts.push({flag,checks:r.checks.length,report,sha256:hash(report),...(r.exeSha256?{exeSha256:r.exeSha256,asarSha256:r.asarSha256}:{})});
 }
 return receipts;
}
const unitLog=await execute('unit',process.execPath,['--test','--test-concurrency=1','tests/model-placement.test.mjs','tests/export-numbering.test.cjs','tests/files.test.cjs','tests/layout-customization.test.mjs','tests/cad-export-dialog-lifecycle.test.mjs','tests/cad-workspace.test.mjs','tests/cad-workspace-serialization.test.mjs','tests/cad-transactions.test.mjs','tests/cad-controller.test.mjs','tests/cad-affine.test.mjs','tests/cad-step-io.test.mjs','tests/exchange-formats.test.mjs','tests/cad-mesh-formats.test.mjs','tests/cad-svg-export-scope.test.mjs']);
const unitText=fs.readFileSync(unitLog,'utf8');if(!/^# fail 0$/m.test(unitText)||!/^# skipped 0$/m.test(unitText))throw Error('Incomplete unit tests');
const sourceUI=await ui('source',path.resolve('node_modules/electron/dist/electron.exe'),['.']);
fs.mkdirSync(stage,{recursive:true});
for(const name of ['dist','backend','electron.cjs','preload.cjs','package.json','LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt','licenses','ai','docs'])fs.cpSync(name,path.join(stage,name),{recursive:true,force:false,errorOnExist:true});
fs.mkdirSync(path.join(stage,'scripts'));fs.copyFileSync('scripts/offlinecad_ai.py',path.join(stage,'scripts/offlinecad_ai.py'));
const stageFiles=files(stage);process.env.TEMP=temp;process.env.TMP=temp;
const packed=await packager({tmpdir:temp,dir:stage,name:'Formnaro',platform:'win32',arch:'x64',out,asar:true,prune:false,overwrite:false,electronVersion:meta.devDependencies.electron,appVersion:version,appCopyright:'Copyright (c) 2026 '+meta.author,win32metadata:{CompanyName:meta.author,ProductName:'Formnaro',FileDescription:'Importmitte und Exportnummern'}});
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
const result={ok:true,version,runtime,exeSha256,asarSha256,unitChecks:Number(unitText.match(/^# tests (\d+)$/m)[1]),sourceUI,packagedUI,preserve,proofs,sourceManifest};
for(const file of [path.join(work,'acceptance.json'),path.join(out,'Abnahme.json')])fs.writeFileSync(file,JSON.stringify(result,null,2));
fs.writeFileSync(path.join(out,'Starten.txt'),'Formnaro '+version+'\nFormnaro-win32-x64/Formnaro.exe starten.\nDateiimporte landen auf dem Grundraster, weitere je15mm versetzt. Auswahl > Zur Mitte. Modell-Exporte erhalten Originalnamen, danach2,3,4,...; Abbruch verbraucht keineNummer. Details docs/IMPORTMITTE-UND-EXPORTNUMMERN.md.\nDie bisherige Ausgabe und ihre Projekte bleiben erhalten.\n');
console.log(JSON.stringify({ok:true,runtime,unit:result.unitChecks,sourceUI:sourceUI.reduce((n,r)=>n+r.checks,0),packagedUI:packagedUI.reduce((n,r)=>n+r.checks,0),work}));
