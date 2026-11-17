import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {packager} from '@electron/packager';
import {extractFile,listPackage,statFile} from '@electron/asar';
import {integrationManifest} from './stl-integration-manifest.mjs';
import {workingSpeedReport} from './working-speed-report.mjs';

const meta=JSON.parse(fs.readFileSync('package.json','utf8')),version=meta.version,label='Python-Modellierung';
if(version!=='0.90.0')throw Error('Expected 0.90.0');
const out=path.resolve('F:/Formnaro-Ausgaben/Python-Modellierung-v'+version),temp=path.resolve(process.argv[2]??'F:/Formnaro-Buildtemp/Python-Modellierung-v'+version+'-Final-r1'),stage=path.join(temp,'stage'),work=path.resolve('work/python-api/release-'+Date.now());
if(fs.existsSync(out)||fs.existsSync(temp))throw Error('Separate output and temp must be new');
fs.mkdirSync(work,{recursive:true});fs.mkdirSync(temp,{recursive:true});
console.log('Acceptance evidence: '+work);
const sha=b=>createHash('sha256').update(b).digest('hex'),hash=file=>sha(fs.readFileSync(file));
function files(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{if(e.isSymbolicLink())throw Error('Symlink excluded');const name=prefix+e.name;return e.isDirectory()?files(path.join(dir,e.name),name+'/'):[{file:name,bytes:fs.statSync(path.join(dir,e.name)).size,sha256:hash(path.join(dir,e.name))}];}).sort((a,b)=>a.file.localeCompare(b.file));}
const sourceManifest=integrationManifest(),proofs=[],prior='F:/Formnaro-Ausgaben/Automatische-Bemassung-v0.89.0',previous=JSON.parse(fs.readFileSync(prior+'/Abnahme.json','utf8')),fixed=JSON.parse(fs.readFileSync('F:/Formnaro-Ausgaben/CAD-Werkzeuge-v0.81.0/Abnahme.json','utf8'));
const previousDelivery=path.join(prior,'Auslieferungspruefung.json');if(hash(previousDelivery)!=='4431d0136aa05206e8d2e545c780f42cbb1b4ffa29de0ead605999e0bcdb330f')throw Error('Previous release was not the completed accepted delivery');
if(previous.version!=='0.89.0'||fixed.version!=='0.81.0')throw Error('Wrong accepted comparison generations');
const preserve=[...previous.preserve,...['Formnaro.exe','resources/app.asar'].map(file=>({file:path.join(previous.runtime,file),sha256:hash(path.join(previous.runtime,file))}))];
for(const p of preserve)if(hash(p.file)!==p.sha256)throw Error('Previous runtime already differs: '+p.file);
for(const file of ['backend/parametric-editor.cjs','src/cad-parametric-ui.js','parametric/runtime-win-x64'])if(fs.existsSync(file))throw Error('External editor still present: '+file);
const wasmFiles=fs.readdirSync('dist/assets').filter(n=>n.endsWith('.wasm'));
if(wasmFiles.length!==3||!wasmFiles.some(n=>n.startsWith('pyodide.asm-')&&hash('dist/assets/'+n)===hash('python-runtime/pyodide.asm.wasm'))||!wasmFiles.some(n=>n.startsWith('formnaro_cad-')&&hash('dist/assets/'+n)===hash('cad-kernel-build/runtime/formnaro_cad.wasm')))throw Error('Unexpected CAD/mesh kernel bundle');
async function execute(name,exe,args){
 const log=path.join(work,name+'.log'),fd=fs.openSync(log,'wx'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const forward=name.startsWith('paired-'),child=spawn(exe,args,{env,windowsHide:true,stdio:['ignore',forward?'pipe':fd,fd]});if(forward)child.stdout.on('data',chunk=>{fs.writeSync(fd,chunk);process.stdout.write(chunk);});
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});fs.closeSync(fd);
 if(code!==0)throw Error(name+' failed: '+code+'; '+log);
 proofs.push({name,log,sha256:hash(log)});console.log(name+' passed');return log;
}
async function ui(mode,exe,args=[]){
 const receipts=[];
 for(const [flag,min]of [['python',22],['auto-dimensions',19],['fnpack',21],['fnpack-recovery',4],['fnpack-close',3],['assembly-display',18],['joints',21],['sketch-constraints',17],['linked-contours',48],['project-parameters',38],['drawings',31],['modeling',28],['working-speed',11],['sketch-upgrade',103],['workbench',14],['easy-complete',98],['hole-groups',28],['rotation-ring',55],['move-dimensions',45],['number-display',14],['mesh-display',17],['mesh-import',20],['mesh-selection',59],['mesh-inspector',24]]){
  const phase=flag==='fnpack-recovery'?'recovery':flag==='fnpack-close'?'close':null,dir=phase?path.join(temp,mode+'-fnpack',phase+'-restart'):path.join(temp,mode+'-'+flag),report=path.join(dir,'result.json');if(phase){if(!fs.existsSync(dir)||fs.existsSync(report))throw Error('Missing or reused package restart profile');}else fs.mkdirSync(dir);
  await execute(mode+'-'+flag,exe,[...args,'--verify-'+(phase?'fnpack':flag)+'='+report,...(phase?['--verify-fnpack-phase='+phase]:[])]);const r=JSON.parse(fs.readFileSync(report,'utf8'));
  if(!r.ok||r.appVersion!==version||!r.isolatedProfile||r.checks.length<min||r.errors?.length||r.external?.length)throw Error('Incomplete UI proof '+report);
  const old=(mode==='source'?previous.sourceUI:previous.packagedUI).find(row=>row.flag===flag);
  if(old){if(hash(old.report)!==old.sha256)throw Error('Historical UI evidence changed: '+old.report);const original=JSON.parse(fs.readFileSync(old.report,'utf8')),name=check=>typeof check==='string'?check:check?.label,names=new Set(r.checks.map(name));if(original.checks.length!==old.checks||r.checks.length<old.checks||original.checks.some(check=>!names.has(name(check))))throw Error('A previously accepted UI proof is missing: '+flag);}
  if(flag==='python')await execute(mode+'-independent-python','python',['scripts/verify-python-exports.py',dir]);
  if(flag==='auto-dimensions')await execute(mode+'-independent-auto-dimensions','python',['scripts/verify-auto-dimensions.py',dir]);
  if(flag==='fnpack-close')await execute(mode+'-independent-fnpack','python',['scripts/verify-fnpack-exports.py',path.join(temp,mode+'-fnpack'),'--freecad',path.resolve('work/cad-independent-step/freecad/FreeCAD_1.1.4-Windows-x86_64-py311/bin/FreeCADCmd.exe')]);
  if(flag==='assembly-display')await execute(mode+'-independent-assembly','python',['scripts/verify-assembly-exports.py',dir,'--freecad',path.resolve('work/cad-independent-step/freecad/FreeCAD_1.1.4-Windows-x86_64-py311/bin/FreeCADCmd.exe')]);
  if(flag==='joints')await execute(mode+'-independent-joints','python',['scripts/verify-joints-exports.py',dir,'--freecad',path.resolve('work/cad-independent-step/freecad/FreeCAD_1.1.4-Windows-x86_64-py311/bin/FreeCADCmd.exe')]);
  if(flag==='sketch-constraints')await execute(mode+'-independent-constraints','python',['scripts/verify-sketch-constraints-exports.py',dir,'--freecad',path.resolve('work/cad-independent-step/freecad/FreeCAD_1.1.4-Windows-x86_64-py311/bin/FreeCADCmd.exe')]);
  if(flag==='linked-contours')await execute(mode+'-independent-linked-contours','python',['scripts/verify-linked-contours-exports.py',dir,'--freecad',path.resolve('work/cad-independent-step/freecad/FreeCAD_1.1.4-Windows-x86_64-py311/bin/FreeCADCmd.exe')]);
  if(flag==='project-parameters')await execute(mode+'-independent-parameters','python',['scripts/verify-project-parameters-exports.py',dir,'--freecad',path.resolve('work/cad-independent-step/freecad/FreeCAD_1.1.4-Windows-x86_64-py311/bin/FreeCADCmd.exe')]);
  if(flag==='drawings')await execute(mode+'-independent-drawings','python',['scripts/verify-drawing-exports.py',dir,'--curves','work/cad-drawings/export-core/curves.dxf']);
  if(flag==='modeling')await execute(mode+'-independent-modeling','python',['scripts/verify-modeling-exports.py',dir,'--freecad',path.resolve('work/cad-independent-step/freecad/FreeCAD_1.1.4-Windows-x86_64-py311/bin/FreeCADCmd.exe')]);
  if(flag==='sketch-upgrade')for(const kind of ['sketch','template'])await execute(mode+'-independent-'+kind,'python',['scripts/verify-'+kind+'-exports.py',dir,'--freecad',path.resolve('work/cad-independent-step/freecad/FreeCAD_1.1.4-Windows-x86_64-py311/bin/FreeCADCmd.exe')]);
  if(flag==='mesh-import')await execute(mode+'-independent-import','python',['scripts/verify-mesh-import.py',dir]);
  receipts.push({flag,checks:r.checks.length,report,sha256:hash(report),...(r.exeSha256?{exeSha256:r.exeSha256,asarSha256:r.asarSha256}:{})});
 }
 return receipts;
}
async function baselineProbe(accepted,name){
 const directory=path.join(work,name);fs.mkdirSync(directory);const report=path.join(directory,'result.json'),exe=path.join(accepted.runtime,'Formnaro.exe'),asar=path.join(accepted.runtime,'resources/app.asar');
 await execute(name+'-working-speed',exe,['--verify-working-speed='+report]);const r=JSON.parse(fs.readFileSync(report,'utf8'));
 if(!r.ok||r.appVersion!==accepted.version||!r.isolatedProfile||r.errors.length||r.external.length||r.exeSha256!==hash(exe)||r.asarSha256!==hash(asar)||r.exeSha256!==accepted.exeSha256||r.asarSha256!==accepted.asarSha256)throw Error('Invalid accepted comparison '+name);
 const file=path.join(work,name+'.json');fs.writeFileSync(file,JSON.stringify({report,sha256:hash(report),identity:{version:accepted.version,unchangedProductBundle:true,exe,asar,exeSha256:hash(exe),asarSha256:hash(asar)}},null,2));return file;
}
const baselineFile=await baselineProbe(fixed,'baseline-v081'),previousFile=await baselineProbe(previous,'previous-v089');
const tests=['cad-python-contract','audit-python-release','cad-drawing-auto-dimensions','fnpack-files','fnpack-data','fnpack-controller','fnpack-native','fnpack-projects','fnpack-recovery','fnpack-persistence','audit-fnpack-release','cad-assembly-display','cad-assembly-native','cad-assembly-automation','audit-assembly-display-release','cad-joints-data','cad-joints-controller','cad-joints-view','cad-joints-native','cad-joints-automation','cad-joints-persistence','audit-joints-release','cad-camera-step','cad-render-scheduler','sketch-constraints','sketch-constraints-client','sketch-constraints-integration','audit-sketch-constraints-release','cad-legacy-speed','working-speed-deferred','cad-dependency-graph','cad-linked-contours-data','cad-linked-contours-native','cad-linked-contours-controller','cad-linked-contours-automation','cad-linked-contours-persistence','cad-linked-contours-clipboard','audit-linked-contours-release','cad-project-parameters-data','cad-project-parameters-native','cad-project-parameters-persistence','cad-project-parameters-references','cad-project-parameters-references-native','cad-project-parameters-export','cad-project-parameters-controller','cad-project-parameters-automation','cad-ai-program','cad-ai-analysis','audit-drawing-release','audit-project-parameters-release','cad-template-recipes','cad-workflow-speed','cad-drawing-references','cad-drawing-layout','cad-drawing-data','cad-drawing-export','cad-drawing-controller','cad-drawing-native','cad-drawing-automation','cad-finish-native','cad-source-clone','cad-tools-native','cad-interface-state','cad-modeling-ai','cad-modeling-native','cad-modeling-integration','cad-face-sketch-native','sketch-interaction','sketch-profile','sketch-tools','mesh-technical','sketch-attachment','sketch-templates','mesh-curved-reduce','mesh-curved-controller','model-deviation','model-deviation-rendering','parametric-source','cad-project','cad-persistence','cad-recovery','cad-workspace','cad-transactions','cad-ai-contract','cad-group-performance','cad-rotation','cad-affine','cad-display-cache','ui-numbers','sketch-view-cache','mesh-selection-data','mesh-selection-advanced','mesh-selection-performance','mesh-query-transport','cad-display-finer-cache','cad-display-scale','cad-controller','cad-worker-client','cad-persistent-worker','cad-service','cad-service-extended','cad-renderer-picking','cad-program-performance','cad-export-triangles','cad-affine-volume-proof'];
const unitLog=await execute('unit',process.execPath,['--test','--test-concurrency=1',...tests.map(t=>'tests/'+t+'.test.mjs'),'tests/drawing-pdf.test.cjs','tests/drawing-file-cancel.test.cjs','tests/files.test.cjs','tests/layout-files.test.cjs','tests/export-numbering.test.cjs']),unitText=fs.readFileSync(unitLog,'utf8');
if(!['fail','skipped','cancelled','todo'].every(key=>new RegExp('^# '+key+' 0$','m').test(unitText)))throw Error('Incomplete unit tests');
await execute('python-sdk','python',['tests/python-sdk.test.py']);
await execute('python-worker-build',process.execPath,['node_modules/vite/bin/vite.js','build','--config','tests/python-browser.config.mjs']);
await execute('python-worker',process.execPath,['scripts/run-python-browser.mjs']);
await execute('javascript-sandbox-build',process.execPath,['node_modules/vite/bin/vite.js','build','--config','tests/ai-program-browser.config.mjs']);
await execute('javascript-sandbox',path.resolve('node_modules/electron/dist/electron.exe'),['tests/ai-program-browser.cjs']);
const physicalPdf=path.join(work,'physical-pdf');await execute('pdf-physical-electron',path.resolve('node_modules/electron/dist/electron.exe'),['tests/drawing-pdf-desktop.cjs','--out='+physicalPdf]);
await execute('pdf-physical-independent','python',['scripts/verify-drawing-pdf-physical.py',physicalPdf]);
const correspondenceDir=path.join(work,'correspondence');await execute('fnpack-correspondence',process.execPath,['scripts/verify-fnpack-correspondence.mjs',path.resolve('F:/Formnaro-Ausgaben/Baugruppenanzeige-v0.87.0/Abnahme.json'),correspondenceDir]);const correspondenceFile=path.join(correspondenceDir,'result.json');
const sourceUI=await ui('source',path.resolve('node_modules/electron/dist/electron.exe'),['.']);
fs.mkdirSync(stage,{recursive:true});
for(const name of ['dist','backend','electron.cjs','preload.cjs','package.json','LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt','licenses','ai','docs'])fs.cpSync(name,path.join(stage,name),{recursive:true,force:false,errorOnExist:true,filter:source=>!/^__pycache__$|\.py[co]$/.test(path.basename(source))});
fs.mkdirSync(path.join(stage,'scripts'));fs.copyFileSync('scripts/offlinecad_ai.py',path.join(stage,'scripts/offlinecad_ai.py'));
const nativeNotice=path.join(stage,'licenses/cad-kernel');fs.mkdirSync(nativeNotice,{recursive:true});fs.cpSync('cad-kernel-build/runtime/licenses',path.join(nativeNotice,'licenses'),{recursive:true});
for(const file of ['README.md','integrity.json','upstream-lock.json','system-license-lock.json','build-inputs.json','formnaro_cad.provenance.json','formnaro_cad.build-manifest.json'])fs.copyFileSync('cad-kernel-build/runtime/'+file,path.join(nativeNotice,file));
const stageFiles=files(stage);process.env.TEMP=temp;process.env.TMP=temp;
const packed=await packager({tmpdir:temp,dir:stage,name:'Formnaro',platform:'win32',arch:'x64',out,asar:true,prune:false,overwrite:false,electronVersion:meta.devDependencies.electron,appVersion:version,appCopyright:'Copyright (c) 2026 '+meta.author,win32metadata:{CompanyName:meta.author,ProductName:'Formnaro',FileDescription:label}});
if(packed.length!==1)throw Error('Wrong package count');const runtime=packed[0],exe=path.join(runtime,'Formnaro.exe'),asar=path.join(runtime,'resources/app.asar');
fs.cpSync('converter/runtime-v010',path.join(runtime,'resources/converter'),{recursive:true,force:false,errorOnExist:true});
for(const name of ['README.md','provenance.json'])fs.copyFileSync('converter/'+name,path.join(runtime,'resources/converter',name));
for(const name of ['LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.copyFileSync(name,path.join(runtime,name));
for(const name of ['ai','docs'])fs.cpSync(name,path.join(runtime,name),{recursive:true,force:false,errorOnExist:true,filter:source=>!/^__pycache__$|\.py[co]$/.test(path.basename(source))});fs.mkdirSync(path.join(runtime,'scripts'));fs.copyFileSync('scripts/offlinecad_ai.py',path.join(runtime,'scripts/offlinecad_ai.py'));
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
const performance=workingSpeedReport({sourceReport:sourceUI.find(r=>r.flag==='working-speed').report,packagedReport:packagedUI.find(r=>r.flag==='working-speed').report,out,work,baselineFile,version,baselineVersion:'0.81.0',ratioLimit:1.25,absoluteLimitMs:10,includePreviousEvidence:false,deferPotentialSlowdown:true});
const previousOut=path.join(out,'Vergleich-v0.89.0'),previousWork=path.join(work,'previous-performance');fs.mkdirSync(previousOut);fs.mkdirSync(previousWork);
const previousPerformance=workingSpeedReport({sourceReport:sourceUI.find(r=>r.flag==='working-speed').report,packagedReport:packagedUI.find(r=>r.flag==='working-speed').report,out:previousOut,work:previousWork,baselineFile:previousFile,version,baselineVersion:'0.89.0',ratioLimit:1.25,absoluteLimitMs:10,includePreviousEvidence:false,deferPotentialSlowdown:true});
await execute('paired-legacy-speed',process.execPath,['scripts/run-cad-legacy-speed-v090.mjs','--baseline',path.join(fixed.runtime,'Formnaro.exe'),'--previous',path.join(previous.runtime,'Formnaro.exe'),'--candidate',exe,'--build',path.join(work,'build.json'),'--out',path.join(work,'legacy-paired-speed')]);
const legacyPairedSpeedFile=path.join(work,'legacy-paired-speed','report.json'),legacyPairedSpeed=JSON.parse(fs.readFileSync(legacyPairedSpeedFile,'utf8'));if(!legacyPairedSpeed.ok||legacyPairedSpeed.releaseEligible!==true)throw Error('Repeated legacy workflow regression gate failed');fs.copyFileSync(legacyPairedSpeedFile,path.join(out,'Legacy-Arbeitsablaeufe-Leistung.json'));
await execute('paired-workflow-speed',process.execPath,['scripts/run-cad-workflow-speed.mjs','--baseline',path.join(fixed.runtime,'Formnaro.exe'),'--previous',path.join(previous.runtime,'Formnaro.exe'),'--candidate',exe,'--out',path.join(work,'paired-speed')]);
const pairedSpeedFile=path.join(work,'paired-speed','report.json');const pairedSpeed=JSON.parse(fs.readFileSync(pairedSpeedFile,'utf8'));if(!pairedSpeed.ok||pairedSpeed.releaseEligible!==true||pairedSpeed.smoke)throw Error('Paired workflow regression gate failed');fs.copyFileSync(pairedSpeedFile,path.join(out,'Arbeitsablaeufe-Leistung.json'));
await execute('corresponding-source-archives',process.execPath,['scripts/archive-step-thickness.mjs',out]);
if(JSON.stringify(integrationManifest())!==JSON.stringify(sourceManifest)||JSON.stringify(files(runtime))!==JSON.stringify(runtimeFiles))throw Error('Final source/runtime freeze differs');for(const p of preserve)if(hash(p.file)!==p.sha256)throw Error('Previous program changed after final probes');
const result={ok:true,version,label,physicalPdf:{report:path.join(physicalPdf,'independent-pdf-physical.json'),sha256:hash(path.join(physicalPdf,'independent-pdf-physical.json'))},runtime,exeSha256,asarSha256,externalEditorIncluded:false,unitChecks:Number(unitText.match(/^# tests (\d+)$/m)[1]),sourceUI,packagedUI,preserve,proofs,sourceManifest,pythonWorker:{file:path.resolve('work/python-api/browser-result.json'),sha256:hash('work/python-api/browser-result.json')},pythonSDK:{file:path.resolve('work/python-api/python-sdk-result.json'),sha256:hash('work/python-api/python-sdk-result.json')},performance,previousPerformance,correspondence:{file:correspondenceFile,sha256:hash(correspondenceFile)},previousDeliveryEvidence:{file:previousDelivery,sha256:hash(previousDelivery)},previousEvidence:{file:path.join(prior,'Abnahme.json'),sha256:hash(path.join(prior,'Abnahme.json'))},legacyPairedSpeed:{file:legacyPairedSpeedFile,sha256:hash(legacyPairedSpeedFile)},pairedSpeed:{file:pairedSpeedFile,sha256:hash(pairedSpeedFile)},size:{previousVersion:previous.version,oldBytes,newBytes,savedBytes:oldBytes-newBytes}};
for(const file of [path.join(work,'acceptance.json'),path.join(out,'Abnahme.json')])fs.writeFileSync(file,JSON.stringify(result,null,2));
fs.writeFileSync(path.join(out,'Starten.txt'),'Formnaro '+version+' – Python-Modellierung\nFormnaro-win32-x64/Formnaro.exe starten.\nGroße KI-Werkstatt > Python-Modellierung > Beispiel einsetzen > Python-Vorschau berechnen. Ergebnis prüfen und Änderungen übernehmen.\nDie interne und externe KI kann denselben Python-Befehl benutzen. Lokale Laufzeit mitgeliefert; externe Bibliothek unter ai/python.\nAnleitung: Formnaro-win32-x64/docs/PYTHON-SCHNITTSTELLE.md\nAlte Programme und Modelle bleiben erhalten. Abnahme.json dokumentiert Source/EXE/Dateien/Leistung; Sicht-/Auslieferungsprüfung folgen gesondert.\n');
console.log(JSON.stringify({ok:true,runtime,unit:result.unitChecks,sourceUI:sourceUI.reduce((n,r)=>n+r.checks,0),packagedUI:packagedUI.reduce((n,r)=>n+r.checks,0),size:result.size,work}));
