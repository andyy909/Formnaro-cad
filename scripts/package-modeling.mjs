import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {packager} from '@electron/packager';
import {extractFile,listPackage,statFile} from '@electron/asar';
import {integrationManifest} from './stl-integration-manifest.mjs';
import {workingSpeedReport} from './working-speed-report.mjs';

const meta=JSON.parse(fs.readFileSync('package.json','utf8')),version=meta.version,label='CAD-Werkzeuge auf Abruf';
if(version!=='0.81.0')throw Error('Expected 0.81.0');
const out=path.resolve('F:/Formnaro-Ausgaben/CAD-Werkzeuge-v'+version),temp=path.resolve(process.argv[2]??'F:/Formnaro-Buildtemp/CAD-Werkzeuge-v'+version+'-Final-r1'),stage=path.join(temp,'stage'),work=path.resolve('work/cad-modeling/release-'+Date.now());
if(fs.existsSync(out)||fs.existsSync(temp))throw Error('Separate output and temp must be new');
fs.mkdirSync(work,{recursive:true});fs.mkdirSync(temp,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex'),hash=file=>sha(fs.readFileSync(file));
function files(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{if(e.isSymbolicLink())throw Error('Symlink excluded');const name=prefix+e.name;return e.isDirectory()?files(path.join(dir,e.name),name+'/'):[{file:name,bytes:fs.statSync(path.join(dir,e.name)).size,sha256:hash(path.join(dir,e.name))}];}).sort((a,b)=>a.file.localeCompare(b.file));}
const sourceManifest=integrationManifest(),proofs=[],prior='F:/Formnaro-Ausgaben/Arbeitsgeschwindigkeit-v0.80.0',previous=JSON.parse(fs.readFileSync(prior+'/Abnahme.json','utf8'));
const preserve=[...previous.preserve,...['Formnaro.exe','resources/app.asar'].map(file=>({file:path.join(previous.runtime,file),sha256:hash(path.join(previous.runtime,file))}))];
for(const p of preserve)if(hash(p.file)!==p.sha256)throw Error('Previous runtime already differs: '+p.file);
for(const file of ['backend/parametric-editor.cjs','src/cad-parametric-ui.js','parametric/runtime-win-x64'])if(fs.existsSync(file))throw Error('External editor still present: '+file);
const wasmFiles=fs.readdirSync('dist/assets').filter(n=>n.endsWith('.wasm'));
if(wasmFiles.length!==2||!wasmFiles.some(n=>n.startsWith('formnaro_cad-')&&hash('dist/assets/'+n)===hash('cad-kernel-build/runtime/formnaro_cad.wasm')))throw Error('Unexpected CAD/mesh kernel bundle');
async function execute(name,exe,args){
 const log=path.join(work,name+'.log'),fd=fs.openSync(log,'wx'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(exe,args,{env,windowsHide:true,stdio:['ignore',fd,fd]});
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});fs.closeSync(fd);
 if(code!==0)throw Error(name+' failed: '+code+'; '+log);
 proofs.push({name,log,sha256:hash(log)});console.log(name+' passed');return log;
}
async function ui(mode,exe,args=[]){
 const receipts=[];
 for(const [flag,min]of [['modeling',28],['working-speed',11],['sketch-upgrade',103],['workbench',14],['easy-complete',98],['hole-groups',28],['rotation-ring',55],['move-dimensions',45],['number-display',14],['mesh-display',17],['mesh-import',20],['mesh-selection',35],['mesh-inspector',24]]){
  const dir=path.join(temp,mode+'-'+flag),report=path.join(dir,'result.json');fs.mkdirSync(dir);
  await execute(mode+'-'+flag,exe,[...args,'--verify-'+flag+'='+report]);const r=JSON.parse(fs.readFileSync(report,'utf8'));
  if(!r.ok||r.appVersion!==version||!r.isolatedProfile||r.checks.length<min||r.errors?.length||r.external?.length)throw Error('Incomplete UI proof '+report);
  if(flag==='modeling')await execute(mode+'-independent-modeling','python',['scripts/verify-modeling-exports.py',dir,'--freecad',path.resolve('work/cad-independent-step/freecad/FreeCAD_1.1.4-Windows-x86_64-py311/bin/FreeCADCmd.exe')]);
  if(flag==='sketch-upgrade')for(const kind of ['sketch','template'])await execute(mode+'-independent-'+kind,'python',['scripts/verify-'+kind+'-exports.py',dir,'--freecad',path.resolve('work/cad-independent-step/freecad/FreeCAD_1.1.4-Windows-x86_64-py311/bin/FreeCADCmd.exe')]);
  if(flag==='mesh-import')await execute(mode+'-independent-import','python',['scripts/verify-mesh-import.py',dir]);
  receipts.push({flag,checks:r.checks.length,report,sha256:hash(report),...(r.exeSha256?{exeSha256:r.exeSha256,asarSha256:r.asarSha256}:{})});
 }
 return receipts;
}
const tests=['cad-finish-native','cad-source-clone','cad-tools-native','cad-interface-state','cad-modeling-ai','cad-modeling-native','cad-modeling-integration','cad-face-sketch-native','sketch-interaction','sketch-profile','sketch-tools','mesh-technical','sketch-attachment','sketch-templates','mesh-curved-reduce','mesh-curved-controller','model-deviation','model-deviation-rendering','parametric-source','cad-project','cad-persistence','cad-recovery','cad-workspace','cad-transactions','cad-ai-contract','cad-group-performance','cad-rotation','cad-affine','cad-display-cache','ui-numbers','sketch-view-cache','mesh-selection-data','mesh-selection-advanced','mesh-selection-performance','mesh-query-transport','cad-display-finer-cache','cad-display-scale','cad-controller','cad-worker-client','cad-persistent-worker','cad-service','cad-service-extended','cad-renderer-picking','cad-program-performance','cad-export-triangles','cad-affine-volume-proof'];
const unitLog=await execute('unit',process.execPath,['--test','--test-concurrency=1',...tests.map(t=>'tests/'+t+'.test.mjs')]),unitText=fs.readFileSync(unitLog,'utf8');
if(!/^# fail 0$/m.test(unitText)||!/^# skipped 0$/m.test(unitText))throw Error('Incomplete unit tests');
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
const runtimeFiles=files(runtime),exeSha256=hash(exe),asarSha256=hash(asar);
if(runtimeFiles.some(p=>/solidcraft.*\.exe$|solvecraft.*\.exe$|(?:^|\/)parametric\//i.test(p.file)))throw Error('External editor in output');
console.log('Separate Windows build ready: '+exe);
fs.writeFileSync(path.join(work,'build.json'),JSON.stringify({version,runtime,out,temp,sourceManifest,sourceUI,runtimeFiles,stageFiles,preserve,exeSha256,asarSha256},null,2));
const packagedUI=await ui('packaged',exe);
if(packagedUI.some(r=>r.exeSha256!==exeSha256||r.asarSha256!==asarSha256))throw Error('Wrong tested executable');
if(JSON.stringify(integrationManifest())!==JSON.stringify(sourceManifest))throw Error('Sources changed during acceptance');
if(JSON.stringify(files(runtime))!==JSON.stringify(runtimeFiles))throw Error('Program files changed during tests');
for(const p of preserve)if(hash(p.file)!==p.sha256)throw Error('Previous program changed');
const names=listPackage(asar).map(n=>n.replace(/^[\\/]+/,'')).filter(n=>!statFile(asar,n).files).map(n=>n.split(path.sep).join('/')).sort();
if(JSON.stringify(names)!==JSON.stringify(stageFiles.map(e=>e.file).sort()))throw Error('ASAR entries differ');
for(const p of stageFiles){const data=extractFile(asar,p.file.split('/').join(path.sep));if(p.file==='package.json'){const actual=JSON.parse(data),expected=JSON.parse(fs.readFileSync(path.join(stage,p.file),'utf8'));for(const key of ['private','scripts','devDependencies'])delete expected[key];if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Package metadata differs');}else if(sha(data)!==p.sha256)throw Error('ASAR differs: '+p.file);}
const oldBytes=files(previous.runtime).reduce((n,p)=>n+p.bytes,0),newBytes=runtimeFiles.reduce((n,p)=>n+p.bytes,0);
const performance=workingSpeedReport({sourceReport:sourceUI.find(r=>r.flag==='working-speed').report,packagedReport:packagedUI.find(r=>r.flag==='working-speed').report,out,work,baselineFile:'work/cad-modeling/app-baseline.json',version,baselineVersion:'0.80.0',ratioLimit:1.25,absoluteLimitMs:10,includePreviousEvidence:false});
await execute('corresponding-source-archives',process.execPath,['scripts/archive-step-thickness.mjs',out]);
const result={ok:true,version,label,runtime,exeSha256,asarSha256,externalEditorIncluded:false,unitChecks:Number(unitText.match(/^# tests (\d+)$/m)[1]),sourceUI,packagedUI,preserve,proofs,sourceManifest,performance,size:{previousVersion:previous.version,oldBytes,newBytes,savedBytes:oldBytes-newBytes}};
for(const file of [path.join(work,'acceptance.json'),path.join(out,'Abnahme.json')])fs.writeFileSync(file,JSON.stringify(result,null,2));
fs.writeFileSync(path.join(out,'Starten.txt'),'Formnaro '+version+' · CAD-Werkzeuge auf Abruf\nFormnaro-win32-x64/Formnaro.exe starten.\nNeue CAD-Werkzeuge: Flächenkontur als Skizze, Flächenversatz, CAD-Aushöhlen, Loft und Sweep. Berechnung nur auf ausdrückliche Vorschau.\nOriginalquellen und Undo erhalten. Neue CAD-Rezepte verwenden Projektformat11. Grenzen in der Anleitung beachten.\nAnleitung: Formnaro-win32-x64/docs/CAD-MODELLIERWERKZEUGE.md\nMessungen und Grenzen: Leistungspruefung.json/txt neben dieser Ausgabe.\nVorige Ausgaben bleiben erhalten.\n');
console.log(JSON.stringify({ok:true,runtime,unit:result.unitChecks,sourceUI:sourceUI.reduce((n,r)=>n+r.checks,0),packagedUI:packagedUI.reduce((n,r)=>n+r.checks,0),size:result.size,work}));
