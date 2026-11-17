import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {packager} from '@electron/packager';
import {extractFile,listPackage,statFile} from '@electron/asar';
import {integrationManifest} from './stl-integration-manifest.mjs';
const version='0.92.1',root=process.cwd(),work=path.resolve('work/ai-reconstruction-tools/release-'+Date.now());
const out=path.resolve('F:/Formnaro-Ausgaben/KI-Rekonstruktionswerkzeuge-v'+version),temp=path.resolve(process.argv[2]??'F:/Formnaro-Buildtemp/KI-Rekonstruktionswerkzeuge-v0.92.1-r1'),stage=path.join(temp,'stage');
const json=f=>JSON.parse(fs.readFileSync(f,'utf8')),hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex'),digest=b=>createHash('sha256').update(b).digest('hex');
const receipt=f=>({file:path.resolve(f),sha256:hash(f),bytes:fs.statSync(f).size});
assert.equal(json('package.json').version,version);assert(!fs.existsSync(out)&&!fs.existsSync(temp));
fs.mkdirSync(work,{recursive:true});fs.mkdirSync(temp,{recursive:true});console.log('Release evidence: '+work);
const priorDir='F:/Formnaro-Ausgaben/Python-Modellierung-v0.90.0',prior=json(priorDir+'/Abnahme.json');
assert.equal(hash(priorDir+'/Auslieferungspruefung.json'),'09f288650380111e164d4af1193ed5c61fdac88f961aec47d7bcfcd3d01b6ad7');
const contextPriorDir='F:/Formnaro-Ausgaben/KI-Modellierkontext-v0.91.0',contextPrior=json(contextPriorDir+'/Abnahme.json');assert.equal(hash(contextPriorDir+'/Auslieferungspruefung.json'),'1421469faab04e4ab170ef7d765b21420202e4227222c31494ee2c3e5bc15dd0');const rejected=json('work/ai-modelling-eval/rejected-091-r1.json');
const priorToolsDir='F:/Formnaro-Ausgaben/KI-Rekonstruktionswerkzeuge-v0.92.0',priorTools=json(priorToolsDir+'/Abnahme.json');assert.equal(hash(priorToolsDir+'/Auslieferungspruefung.json'),'14388825b6ec31a6811d0f988ffe36f72c57848ce62e842bd963a14f6df49e9c');
const preserved=[...['Formnaro.exe','resources/app.asar'].map(f=>({file:path.join(priorTools.runtime,f),sha256:hash(path.join(priorTools.runtime,f))})),...['Formnaro.exe','resources/app.asar'].map(f=>({file:path.join(contextPrior.runtime,f),sha256:hash(path.join(contextPrior.runtime,f))})),...rejected.files.map(r=>({file:path.join(rejected.target,r.name),sha256:r.sha256})),...prior.preserve,...['Formnaro.exe','resources/app.asar'].map(f=>({file:path.join(prior.runtime,f),sha256:hash(path.join(prior.runtime,f))}))];assert.equal(preserved.length,90);
for(const r of preserved)assert.equal(hash(r.file),r.sha256);
// Prior evidence files have stable original identities even when a new test run
// would otherwise reuse its old default output path.
for(const r of [prior.pythonWorker,prior.pythonSDK,priorTools.pythonWorker,priorTools.pythonSDK])assert.equal(hash(r.file),r.sha256);
const sourceManifest=integrationManifest(),proofs=[];
const unit='work/ai-reconstruction-tools/repair-full-unit.log',unitText=fs.readFileSync(unit,'utf8');
assert.match(unitText,/^# tests 671$/m);for(const key of ['fail','skipped','cancelled','todo'])assert.match(unitText,new RegExp('^# '+key+' 0$','m'));
proofs.push({name:'unit-671',...receipt(unit)});
const workerFile='work/ai-reconstruction-tools/worker-0921/browser-result.json',sdkFile='work/ai-reconstruction-tools/pythonSDK-0921-result.json';
assert.equal(json(workerFile).result.checks.length,19);assert.equal(json(workerFile).ok,true);assert.equal(json(sdkFile).tests,5);assert.equal(json(sdkFile).ok,true);
async function execute(name,exe,args){const log=path.join(work,name+'.log'),fd=fs.openSync(log,'wx'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const p=spawn(exe,args,{env,windowsHide:true,stdio:['ignore',fd,fd]});const code=await new Promise((r,j)=>{p.on('error',j);p.on('close',r);});fs.closeSync(fd);if(code!==0)throw Error(name+' failed: '+code+'; '+log);proofs.push({name,...receipt(log)});console.log(name+' passed');}
async function ui(mode,exe,args=[]){const rows=[];for(const [flag,count]of [['reconstruction',7],['modeling-context',11],['python',22],['ai-result-checks',null],['shared-ai',24]]){const directory=path.join(temp,mode+'-'+flag);fs.mkdirSync(directory);const report=path.join(directory,'result.json');await execute(mode+'-'+flag,exe,[...args,'--verify-'+flag+'='+report]);const r=json(report);assert(r.ok&&r.appVersion===version&&r.isolatedProfile&&!r.errors.length&&!r.external.length);if(count!==null)assert.equal(r.checks.length,count);else assert(r.checks.length>=20);rows.push({flag,checks:r.checks.length,...receipt(report)});if(flag==='python')await execute(mode+'-independent-python','python',['scripts/verify-python-exports.py',directory]);if(flag==='reconstruction')await execute(mode+'-independent-section','python',['scripts/verify-reconstruction-exports.py',directory]);}return rows;}
const sourceUI=await ui('source',path.resolve('node_modules/electron/dist/electron.exe'),['.']);
fs.mkdirSync(stage,{recursive:true});
for(const name of ['dist','backend','electron.cjs','preload.cjs','package.json','LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt','licenses','ai','docs'])fs.cpSync(name,path.join(stage,name),{recursive:true,errorOnExist:true,force:false,filter:p=>!/^__pycache__$|\.py[co]$/.test(path.basename(p))});
fs.mkdirSync(path.join(stage,'scripts'));fs.copyFileSync('scripts/offlinecad_ai.py',path.join(stage,'scripts/offlinecad_ai.py'));
const notice=path.join(stage,'licenses/cad-kernel');fs.mkdirSync(notice,{recursive:true});fs.cpSync('cad-kernel-build/runtime/licenses',path.join(notice,'licenses'),{recursive:true});for(const f of ['README.md','integrity.json','upstream-lock.json','system-license-lock.json','build-inputs.json','formnaro_cad.provenance.json','formnaro_cad.build-manifest.json'])fs.copyFileSync('cad-kernel-build/runtime/'+f,path.join(notice,f));
function inventory(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{assert(!e.isSymbolicLink());const file=prefix+e.name,p=path.join(dir,e.name);return e.isDirectory()?inventory(p,file+'/'):[{file,bytes:fs.statSync(p).size,sha256:hash(p)}];}).sort((a,b)=>a.file.localeCompare(b.file));}
const stageFiles=inventory(stage);process.env.TEMP=temp;process.env.TMP=temp;
const [runtime]=await packager({tmpdir:temp,dir:stage,name:'Formnaro',platform:'win32',arch:'x64',out,asar:true,prune:false,overwrite:false,electronVersion:json('package.json').devDependencies.electron,appVersion:version,appCopyright:'Copyright (c) 2026 '+json('package.json').author,win32metadata:{ProductName:'Formnaro',FileDescription:'KI-Rekonstruktionswerkzeuge'}});
fs.cpSync('converter/runtime-v010',path.join(runtime,'resources/converter'),{recursive:true,force:false,errorOnExist:true});for(const n of ['README.md','provenance.json'])fs.copyFileSync('converter/'+n,path.join(runtime,'resources/converter',n));
for(const n of ['LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.copyFileSync(n,path.join(runtime,n));
for(const n of ['ai','docs'])fs.cpSync(n,path.join(runtime,n),{recursive:true,errorOnExist:true,force:false,filter:p=>!/^__pycache__$|\.py[co]$/.test(path.basename(p))});fs.mkdirSync(path.join(runtime,'scripts'));fs.copyFileSync('scripts/offlinecad_ai.py',path.join(runtime,'scripts/offlinecad_ai.py'));
const exe=path.join(runtime,'Formnaro.exe'),asar=path.join(runtime,'resources/app.asar'),runtimeFiles=inventory(runtime),identity={exe:receipt(exe),asar:receipt(asar)};
fs.writeFileSync(path.join(work,'build.json'),JSON.stringify({version,runtime,temp,out,sourceManifest,stageFiles,runtimeFiles,preserved,...identity},null,2));
const packagedUI=await ui('packaged',exe);
for(const r of packagedUI){const d=json(r.file);assert.equal(d.exeSha256,identity.exe.sha256);assert.equal(d.asarSha256,identity.asar.sha256);}
assert.deepEqual(integrationManifest(),sourceManifest);assert.deepEqual(inventory(runtime),runtimeFiles);assert.deepEqual(inventory(stage),stageFiles);
const names=listPackage(asar).map(n=>n.replace(/^[\\/]+/,'')).filter(n=>!statFile(asar,n).files).map(n=>n.split(path.sep).join('/')).sort();assert.deepEqual(names,stageFiles.map(r=>r.file).sort());
for(const r of stageFiles){const b=extractFile(asar,r.file.split('/').join(path.sep));if(r.file==='package.json'){const expected=json(path.join(stage,r.file));for(const k of ['private','scripts','devDependencies'])delete expected[k];assert.deepEqual(JSON.parse(b),expected);}else assert.equal(digest(b),r.sha256);}
const oldAsar=path.join(prior.runtime,'resources/app.asar');const oldWasm=listPackage(oldAsar).map(n=>n.replace(/^[\\/]+/,'').split(path.sep).join('/')).filter(n=>n.startsWith('dist/assets/')&&n.endsWith('.wasm')).map(n=>digest(extractFile(oldAsar,n.split('/').join(path.sep)))).sort(),newWasm=fs.readdirSync('dist/assets').filter(n=>n.endsWith('.wasm')).map(n=>hash('dist/assets/'+n)).sort();assert.equal(newWasm.length,3);assert.deepEqual(newWasm,oldWasm);
await execute('corresponding-source-archives',process.execPath,['scripts/archive-step-thickness.mjs',out]);
assert.deepEqual(integrationManifest(),sourceManifest);assert.deepEqual(inventory(runtime),runtimeFiles);for(const r of preserved)assert.equal(hash(r.file),r.sha256);for(const r of [prior.pythonWorker,prior.pythonSDK])assert.equal(hash(r.file),r.sha256);
const result={ok:true,version,runtime,work,temp,exeSha256:identity.exe.sha256,asarSha256:identity.asar.sha256,sourceManifest,sourceUI,packagedUI,preserved,proofs,unitChecks:671,pythonWorker:receipt(workerFile),pythonSDK:receipt(sdkFile),previousDelivery:receipt(priorDir+'/Auslieferungspruefung.json'),previousContextDelivery:receipt(contextPriorDir+'/Auslieferungspruefung.json'),previousToolsDelivery:receipt(priorToolsDir+'/Auslieferungspruefung.json'),scope:'All667 previous core cases plus4 complete-program correction transport cases; source and actual EXE reconstruction7, modelling-context11, Python22, existing AI result-check91 and shared CAD/converter24 UI; unchanged prior full input context and experience notes; independent native Python models plus new independently constructed section tube; exact unchanged CAD/mesh/Python WASM assets and protected90 old executables/ASARs. This change did not repeat the previous complete758 UI/performance release campaign; no new timing claim.',build:receipt(path.join(work,'build.json'))};
fs.writeFileSync(path.join(out,'Abnahme.json'),JSON.stringify(result,null,2));fs.writeFileSync(path.join(work,'acceptance.json'),JSON.stringify(result,null,2));
fs.writeFileSync(path.join(out,'Starten.txt'),'Formnaro 0.92.1 – KI-Rekonstruktionswerkzeuge\nFormnaro-win32-x64/Formnaro.exe starten.\nAnleitung: Formnaro-win32-x64/docs/KI-REKONSTRUKTION.md\nKorrekturen erhalten vollständigen vorherigen Python-/JavaScript-Code als Referenz. Vollständige STL-Schnittkonturen, native Python-Schnittrekonstruktion mit allen Löchern und Entwurfsvergleich vor Apply. Vorhandene persönliche Kontextdateien werden nicht überschrieben.\n');
console.log(JSON.stringify({ok:true,runtime,work,temp,unit:671,sourceUI:sourceUI.reduce((n,r)=>n+r.checks,0),packagedUI:packagedUI.reduce((n,r)=>n+r.checks,0)}));
