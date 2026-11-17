import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {packager} from '@electron/packager';
import {extractFile,listPackage,statFile} from '@electron/asar';
import {integrationManifest} from './stl-integration-manifest.mjs';

const meta=JSON.parse(fs.readFileSync('package.json','utf8'));
const version=meta.version,packet=Number(process.argv[2]??1),packetNames=['Skizzen-Komfort','Skizzen-Konturen','Skizzen-Werkzeuge','Netz-Flaechen','Skizzen-Anbauten','Modellvergleich','Netz-Kurvenreduktion','Skizzen-Vorlagen'];if(!Number.isInteger(packet)||packet<1||packet>8)throw Error('Packet 1..8');const label=packetNames[packet-1];
const out=path.resolve('F:/Formnaro-Ausgaben/'+label+'-v'+version),temp=path.resolve(process.argv[3]??'F:/Formnaro-Buildtemp/'+label+'-v'+version+'-Final-r1'),stage=path.join(temp,'stage'),work=path.resolve('work/mesh-sketch-upgrade-20261020/release-'+Date.now());
if(fs.existsSync(out)||fs.existsSync(temp))throw Error('Separate output and temp must be new');
fs.mkdirSync(work,{recursive:true});fs.mkdirSync(temp,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex'),hash=file=>sha(fs.readFileSync(file));
function files(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{if(e.isSymbolicLink())throw Error('Symlink excluded');const name=prefix+e.name;return e.isDirectory()?files(path.join(dir,e.name),name+'/'):[{file:name,sha256:hash(path.join(dir,e.name))}];}).sort((a,b)=>a.file.localeCompare(b.file));}
const wasmFiles=fs.readdirSync('dist/assets').filter(n=>n.endsWith('.wasm'));
if(wasmFiles.length!==2||!wasmFiles.some(n=>n.startsWith('formnaro_cad-')&&hash('dist/assets/'+n)===hash('cad-kernel-build/runtime/formnaro_cad.wasm')))throw Error('Unexpected CAD/mesh kernel bundle');
const sourceManifest=integrationManifest(),proofs=[];
const baseline=JSON.parse(fs.readFileSync('work/mesh-sketch-upgrade-20261020/baseline.json')),previousExe=baseline.exe,preserve=[...baseline.preserve];
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
 for(const [flag,min]of [['sketch-upgrade',packet>=8?100:packet>=7?82:packet>=6?72:packet>=5?60:packet>=4?45:packet>=3?33:packet>=2?25:13],['number-display',14],['workbench',14],['easy-complete',98],['mesh-import',20],...(packet>=4?[['mesh-features',20]]:[]),...(packet>=7?[['mesh-reduce',27]]:[]),['easy-performance',4],['cad-mini-performance',5]]){
  const dir=path.join(temp,mode+'-'+flag),report=path.join(dir,'result.json');fs.mkdirSync(dir);
  await execute(mode+'-'+flag,exe,[...args,'--verify-'+flag+'='+report]);const r=JSON.parse(fs.readFileSync(report,'utf8'));
  if(!r.ok||r.appVersion!==version||!r.isolatedProfile||r.checks.length<min||r.errors?.length||r.external?.length)throw Error('Incomplete UI proof '+report);
  if(flag==='sketch-upgrade'&&packet>=2)await execute(mode+'-independent-sketch','python',['scripts/verify-sketch-exports.py',dir,'--freecad',path.resolve('work/cad-independent-step/freecad/FreeCAD_1.1.4-Windows-x86_64-py311/bin/FreeCADCmd.exe')]);
  if(flag==='sketch-upgrade'&&packet>=7)await execute(mode+'-independent-curved','python',['scripts/verify-curved-exports.py',dir]);
  if(flag==='sketch-upgrade'&&packet>=8)await execute(mode+'-independent-templates','python',['scripts/verify-template-exports.py',dir,'--freecad',path.resolve('work/cad-independent-step/freecad/FreeCAD_1.1.4-Windows-x86_64-py311/bin/FreeCADCmd.exe')]);
  if(flag==='mesh-import')await execute(mode+'-independent-import','python',['scripts/verify-mesh-import.py',dir]);
  receipts.push({flag,checks:r.checks.length,report,sha256:hash(report),...(r.exeSha256?{exeSha256:r.exeSha256,asarSha256:r.asarSha256}:{})});
 }
 return receipts;
}
const unitLog=await execute('unit',process.execPath,['--test','--test-concurrency=1','tests/sketch-interaction.test.mjs','tests/sketch-profile.test.mjs','tests/sketch-tools.test.mjs','tests/mesh-technical.test.mjs','tests/sketch-attachment.test.mjs','tests/sketch-templates.test.mjs','tests/mesh-curved-reduce.test.mjs','tests/mesh-curved-controller.test.mjs','tests/mesh-reduce.test.mjs','tests/mesh-reduce-controller.test.mjs','tests/model-deviation.test.mjs','tests/model-deviation-rendering.test.mjs','tests/mesh-features.test.mjs','tests/mesh-features-controller.test.mjs','tests/cad-sketch-native.test.mjs','tests/tool-parity-controller.test.mjs','tests/parametric-source.test.mjs','tests/cad-project.test.mjs','tests/cad-persistence.test.mjs','tests/cad-interface-state.test.mjs','tests/cad-service.test.mjs','tests/cad-worker-client.test.mjs','tests/cad-recovery.test.mjs','tests/cad-workspace.test.mjs','tests/cad-controller.test.mjs','tests/cad-transactions.test.mjs','tests/ui-numbers.test.mjs','tests/cad-ai-contract.test.mjs']);
const unitText=fs.readFileSync(unitLog,'utf8');if(!/^# fail 0$/m.test(unitText)||!/^# skipped 0$/m.test(unitText))throw Error('Incomplete unit tests');
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
const median=values=>{const a=values.toSorted((a,b)=>a-b);return (a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2;};
const baselineDir=baseline.backup,old=JSON.parse(fs.readFileSync(baselineDir+'/cad-mini-performance/result.json')).metrics,now=JSON.parse(fs.readFileSync(path.join(temp,'packaged-cad-mini-performance/result.json'))).metrics;
const performance=[];for(const fixture of ['pipeline','imported','colored'])for(const operation of ['move','rotate','scale']){const get=m=>median(m[fixture].measurements.filter(r=>r.operation===operation).map(r=>r.ms)),beforeMs=get(old),afterMs=get(now);performance.push({fixture,operation,beforeMs,afterMs,ratio:afterMs/beforeMs});}
if(performance.some(p=>p.afterMs>p.beforeMs*1.5&&p.afterMs-p.beforeMs>20))throw Error('Possible material slowdown: inspect and discuss measurements before accepting');

const performanceResult={baselineExecutable:previousExe,baselineReportSha256:hash(baselineDir+'/cad-mini-performance/result.json'),performance,limits:'Local synthetic medians, four measurements after warm-up. No general speed factor or peak memory guarantee. Native idle sample interval includes process-inspection overhead.'};
fs.writeFileSync(path.join(out,'Leistungsvergleich.json'),JSON.stringify(performanceResult,null,2));
if(JSON.stringify(integrationManifest())!==JSON.stringify(sourceManifest))throw Error('Sources changed during acceptance');
if(JSON.stringify(files(runtime))!==JSON.stringify(runtimeFiles))throw Error('Program files changed during tests');
for(const p of preserve)if(hash(p.file)!==p.sha256)throw Error('Previous program changed');
const names=listPackage(asar).map(n=>n.replace(/^[\\/]+/,'')).filter(n=>!statFile(asar,n).files).map(n=>n.split(path.sep).join('/')).sort();
if(JSON.stringify(names)!==JSON.stringify(stageFiles.map(e=>e.file).sort()))throw Error('ASAR entries differ');
for(const p of stageFiles){const data=extractFile(asar,p.file.split('/').join(path.sep));if(p.file==='package.json'){const actual=JSON.parse(data),expected=JSON.parse(fs.readFileSync(path.join(stage,p.file),'utf8'));for(const key of ['private','scripts','devDependencies'])delete expected[key];if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Package metadata differs');}else if(sha(data)!==p.sha256)throw Error('ASAR differs: '+p.file);}
await execute('corresponding-source-archives',process.execPath,['scripts/archive-step-thickness.mjs',out]);
const result={ok:true,version,packet,label,runtime,exeSha256,asarSha256,unitChecks:Number(unitText.match(/^# tests (\d+)$/m)[1]),sourceUI,packagedUI,preserve,proofs,sourceManifest,performance};
for(const file of [path.join(work,'acceptance.json'),path.join(out,'Abnahme.json')])fs.writeFileSync(file,JSON.stringify(result,null,2));
fs.writeFileSync(path.join(out,'Starten.txt'),'Formnaro '+version+' · '+label+'\nFormnaro-win32-x64/Formnaro.exe starten.\nNormal: CAD-Werkzeuge > Skizze / Beispielskizzen. Easy Tinker: Zeichnen & Netz. Die Beispielskizzen öffnen als Entwurf und lassen sich nach dem Extrudieren in der persönlichen Bibliothek speichern. Zeichnen, Punkte auswählen/ziehen, Mausrad zum Zoomen, Ansicht verschieben und Einpassen. CAD-Werkzeuge > Skizze auf Teilfläche verbindet die Skizze mit einem vorhandenen CAD- oder Netzteil. Netz-Werkzeuge enthalten technische Bereiche und die getrennte Kurvenvereinfachung. Ansicht & Prüfen > Modelle vergleichen zeigt nur gemessene Stichproben; Vorschau vergleichen erhält die anstehende Bearbeitung. Entwurfs-Undo ändert kein Modell; erst Vorschau und Übernehmen bestätigen eine Modelländerung.\nAnleitung: Formnaro-win32-x64/docs/SKIZZEN-UND-MESH-AUSBAU.md\nVorige Ausgaben bleiben erhalten; keine Installation notwendig.\n');
console.log(JSON.stringify({ok:true,runtime,unit:result.unitChecks,sourceUI:sourceUI.reduce((n,r)=>n+r.checks,0),packagedUI:packagedUI.reduce((n,r)=>n+r.checks,0),work}));
