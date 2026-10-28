import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {packager} from '@electron/packager';
import {extractFile} from '@electron/asar';

const require=createRequire(import.meta.url),root=process.cwd(),meta=JSON.parse(fs.readFileSync('package.json'));
const revision=process.argv[2]??'r1';assert.match(revision,/^r\d+$/);assert.equal(meta.version,'0.117.0');
const proof=path.resolve('work/final-expansion/package-'+revision),source=path.join(proof,'source'),stage=path.join(proof,'stage'),out=path.resolve('output/Teile-Material-Gesamtabnahme-v'+meta.version+'-'+revision),base=path.resolve('output/Netzreparatur-Flaechen-v0.116.0-r2/Formnaro-win32-x64');
assert(!fs.existsSync(proof)&&!fs.existsSync(out),'Use a fresh package revision');fs.mkdirSync(source,{recursive:true});
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function inventory(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{if(e.isSymbolicLink())return [];const p=path.join(dir,e.name),file=prefix+e.name;return e.isDirectory()?inventory(p,file+'/'):[{file,size:fs.statSync(p).size,sha256:hash(p)}];}).sort((a,b)=>a.file.localeCompare(b.file,'en'));}
const priorAcceptance=JSON.parse(fs.readFileSync(path.join(base,'../Freigabe.json')));assert(priorAcceptance.releaseReady);assert.equal(hash(path.join(base,'Formnaro.exe')),priorAcceptance.exeSha256);assert.equal(hash(path.join(base,'resources/app.asar')),priorAcceptance.asarSha256);
const protectedFiles=[];for(const entry of fs.readdirSync('output',{withFileTypes:true})){const directory=path.resolve('output',entry.name);for(const file of ['Formnaro.exe','resources/app.asar']){const p=path.join(directory,'Formnaro-win32-x64',file);if(fs.existsSync(p))protectedFiles.push({file:p,sha256:hash(p)});}}
const tracked=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
for(const file of tracked){const target=path.join(source,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target);}
// Include the locally prepared managed binary inputs needed by unit tests.
for(const file of ['python-runtime','cad-kernel-build/runtime'])fs.cpSync(file,path.join(source,file),{recursive:true,filter:p=>!/^__pycache__$|\.py[co]$/.test(path.basename(p))});
function junction(name,target){const p=path.join(source,name);assert(!fs.existsSync(p),name+' must be an ignored runtime input');fs.mkdirSync(path.dirname(p),{recursive:true});fs.symlinkSync(target,p,'junction');}
junction('node_modules',path.join(root,'node_modules'));
// Source AppContainer jobs must resolve DLLs on the local development drive.
const unitCAD=path.join(source,'freecad-runtime/runtime');fs.mkdirSync(path.dirname(unitCAD),{recursive:true});fs.cpSync(path.join(base,'resources/freecad'),unitCAD,{recursive:true,errorOnExist:true,force:false});assert(!fs.lstatSync(unitCAD).isSymbolicLink());assert.equal(hash(path.join(unitCAD,'manifest.json')),hash(path.join(base,'resources/freecad/manifest.json')));
junction('converter/runtime-v010-security',path.join(base,'resources/converter'));
junction('converter/runtime-v010',path.join(base,'resources/converter'));
for(const row of inventory(path.join(base,'resources/speech'))){const target=path.join(source,'speech-runtime',row.file);if(fs.existsSync(target))assert.equal(hash(target),row.sha256,'Speech source/bundle mismatch: '+row.file);else{fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(base,'resources/speech',row.file),target);}}
if(fs.existsSync('parametric/runtime-win-x64'))junction('parametric/runtime-win-x64',path.resolve('parametric/runtime-win-x64'));
const frozen=inventory(source);fs.writeFileSync(path.join(proof,'source-freeze.json'),JSON.stringify(frozen,null,2));
async function execute(label,exe,args,{cwd=source,env={}}={}){
 const fd=fs.openSync(path.join(proof,label+'.log'),'w'),childEnv={...process.env,...env};delete childEnv.ELECTRON_RUN_AS_NODE;
 const started=Date.now(),child=spawn(exe,args,{cwd,env:childEnv,windowsHide:true,stdio:['ignore',fd,fd]});const code=await new Promise((r,j)=>{child.on('error',j);child.on('close',r);});fs.closeSync(fd);assert.equal(code,0,label+' failed; see '+proof);console.log(label+' passed in '+(Date.now()-started)+' ms');
}
await execute('build',process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build','--base','./']);
// All current Node suites, including a fresh-junction native regression.
// The native-start correction requires one complete run of this source generation.
assert(!process.env.FORMNARO_GENERAL_UNIT_BASELINE,'A complete fresh run is required after the native-start correction');
const nativeInput=await require(path.join(source,'backend/freecad-runtime.cjs')).verifyRuntime(unitCAD);assert(nativeInput.ok);fs.writeFileSync(path.join(proof,'unit-runtime-integrity.json'),JSON.stringify(nativeInput));
await execute('general-unit',process.execPath,['scripts/test-all-functions.mjs','--mode','source','--suite','unit','--output',path.join(proof,'unit')]);
const unitDir=fs.readdirSync(path.join(proof,'unit')).map(n=>path.join(proof,'unit',n)).find(p=>fs.existsSync(path.join(p,'summary.json'))),unit=JSON.parse(fs.readFileSync(path.join(unitDir,'summary.json')));assert(unit.ok&&!unit.sourceChanged&&unit.results.every(r=>r.ok));
for(const r of unit.results){const tap=fs.readFileSync(r.log,'utf8');assert.equal(tap.match(/^# pass (\d+)$/m)?.[1],String(r.count),'Every unit test must pass, including TODO accounting');}

fs.mkdirSync(stage);
for(const file of ['dist','backend','ai','docs','licenses','scripts','electron.cjs','preload.cjs','package.json','LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.cpSync(path.join(source,file),path.join(stage,file),{recursive:true});
const cadLicenses=path.join(stage,'licenses/cad-kernel');fs.mkdirSync(cadLicenses,{recursive:true});fs.cpSync(path.join(source,'cad-kernel-build/runtime/licenses'),path.join(cadLicenses,'licenses'),{recursive:true});for(const name of ['README.md','integrity.json','upstream-lock.json','system-license-lock.json','build-inputs.json','formnaro_cad.provenance.json','formnaro_cad.build-manifest.json'])fs.copyFileSync(path.join(source,'cad-kernel-build/runtime',name),path.join(cadLicenses,name));
const manifestSha256=hash(path.join(base,'resources/freecad/manifest.json'));fs.writeFileSync(path.join(stage,'backend/freecad-runtime-pin.json'),JSON.stringify({sha256:manifestSha256}));const stagedFiles=inventory(stage);
const [runtime]=await packager({dir:stage,tmpdir:path.join(proof,'tmp'),name:'Formnaro',platform:'win32',arch:'x64',out,asar:true,prune:false,overwrite:false,electronVersion:meta.devDependencies.electron,appVersion:meta.version,appCopyright:'Copyright (c) 2026 '+meta.author,win32metadata:{ProductName:'Formnaro',FileDescription:'Teile, Material und Baugruppen'}});
for(const name of ['converter','speech','freecad'])fs.cpSync(path.join(base,'resources',name),path.join(runtime,'resources',name),{recursive:true});
// External CPython cannot import from Electron ASAR archives.
fs.cpSync(path.join(source,'ai'),path.join(runtime,'ai'),{recursive:true});fs.mkdirSync(path.join(runtime,'scripts'));fs.copyFileSync(path.join(source,'scripts/offlinecad_ai.py'),path.join(runtime,'scripts/offlinecad_ai.py'));
for(const file of ['LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.copyFileSync(path.join(source,file),path.join(runtime,file));fs.cpSync(path.join(source,'docs'),path.join(runtime,'docs'),{recursive:true});
const integrity=await require(path.join(source,'backend/freecad-runtime.cjs')).verifyRuntime(path.join(runtime,'resources/freecad'));assert(integrity.ok);assert.equal(hash(path.join(runtime,'resources/freecad/manifest.json')),manifestSha256);fs.writeFileSync(path.join(proof,'cad-runtime-integrity.json'),JSON.stringify({...integrity,manifestSha256},null,2));
const runtimeFiles=inventory(runtime),exeSha256=hash(path.join(runtime,'Formnaro.exe')),asarSha256=hash(path.join(runtime,'resources/app.asar'));
const results=[];
async function ui(name,flag,env={},minimum=1){const directory=path.join(proof,name);fs.mkdirSync(directory);const report=path.join(directory,'result.json');await execute('packaged-'+name,path.join(runtime,'Formnaro.exe'),['--verify-'+flag+'='+report],{cwd:source,env});const r=JSON.parse(fs.readFileSync(report));assert(r.ok&&r.isolatedProfile&&!r.errors.length&&!r.external.length&&r.appVersion===meta.version&&r.checks.length>=minimum);assert.equal(r.exeSha256,exeSha256);assert.equal(r.asarSha256,asarSha256);results.push({name,checks:r.checks.length,report,sha256:hash(report),screenshots:r.screenshots??[]});}
await ui('part-properties','mesh-remesh',{FORMNARO_VERIFY_PART_PROPERTIES_ONLY:'1'},30);
await execute('general-windows',process.execPath,['scripts/test-all-functions.mjs','--mode','packaged','--suite','surface','--exe',path.join(runtime,'Formnaro.exe'),'--output',path.join(proof,'windows')],{env:{FORMNARO_VERIFY_FREECAD:'1',FORMNARO_VERIFY_ANALYSIS:'1',FORMNARO_VERIFY_FREECAD_PYTHON:'1'}});
const winDir=fs.readdirSync(path.join(proof,'windows')).map(n=>path.join(proof,'windows',n)).find(p=>fs.existsSync(path.join(p,'summary.json'))),windows=JSON.parse(fs.readFileSync(path.join(winDir,'summary.json')));assert(windows.ok&&!windows.sourceChanged&&windows.results.every(r=>r.ok));
for(const [name,env,min]of [['perspective',{FORMNARO_VERIFY_PERSPECTIVE_ONLY:'1'},31],['photo',{FORMNARO_VERIFY_PHOTO_ONLY:'1'},56],['photo-oblique',{FORMNARO_VERIFY_PHOTO_ONLY:'1',FORMNARO_VERIFY_PHOTO_PERSPECTIVE:'1'},60],['multiview',{FORMNARO_VERIFY_MULTIVIEW_ONLY:'1'},1],['multiview-oblique',{FORMNARO_VERIFY_MULTIVIEW_ONLY:'1',FORMNARO_VERIFY_MULTIVIEW_OBLIQUE:'1'},1],['feature-references',{FORMNARO_VERIFY_FEATURE_REFERENCES_ONLY:'1'},46],['freecad-document',{FORMNARO_VERIFY_FREECAD_DOCUMENT_ONLY:'1'},70],['task-evidence',{FORMNARO_VERIFY_TASK_EVIDENCE_ONLY:'1'},1],['ai-meter',{FORMNARO_VERIFY_AI_METER_ONLY:'1'},1],['program-assistant',{FORMNARO_VERIFY_PROGRAM_ASSISTANT_ONLY:'1'},1],['task-progress',{FORMNARO_VERIFY_TASK_PROGRESS_ONLY:'1'},1],['task-ui',{FORMNARO_VERIFY_TASK_UI_ONLY:'1'},1],['advanced-modeling',{FORMNARO_VERIFY_ADVANCED_MODELING_ONLY:'1'},33],['surfaces',{FORMNARO_VERIFY_SURFACES_ONLY:'1'},17]])await ui(name,'ai-result-checks',env,min);
await ui('curved-remesh','mesh-remesh',{FORMNARO_VERIFY_CURVED_REMESH_ONLY:'1'},23);
await ui('mesh-surgery','mesh-remesh',{FORMNARO_VERIFY_SURGERY_ONLY:'1'},46);
await ui('cad-runtime','ai-result-checks',{FORMNARO_VERIFY_CAD_RUNTIME_ONLY:'1'},23);
const restart=path.join(proof,'task-restart');await execute('task-restart',process.execPath,['scripts/verify-ai-task-restart.mjs',restart,'--exe',path.join(runtime,'Formnaro.exe')]);const restartProof=JSON.parse(fs.readFileSync(path.join(restart,'restart-proof.json')));assert(restartProof.ok&&restartProof.differentMainProcesses&&restartProof.cloudRequests===0);
for(const row of protectedFiles)assert.equal(hash(row.file),row.sha256,'Previous program changed');for(const row of frozen)assert.equal(hash(path.join(source,row.file)),row.sha256,'Frozen source changed');assert.deepEqual(inventory(runtime),runtimeFiles);
for(const row of stagedFiles){const bytes=extractFile(path.join(runtime,'resources/app.asar'),row.file.split('/').join(path.sep));if(row.file==='package.json'){const expected=JSON.parse(fs.readFileSync(path.join(stage,row.file)));for(const key of ['private','scripts','devDependencies'])delete expected[key];assert.deepEqual(JSON.parse(bytes),expected);}else assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);}
const acceptance={ok:true,version:meta.version,runtime,source,sourceManifestSha256:hash(path.join(proof,'source-freeze.json')),scope:'Combined general acceptance of committed expansion packages 0–10, including targeted Paket 10 and current foundations. Independent physical export and visual completion required.',unit:{directory:unitDir,tests:unit.count,suites:unit.results.length},windows:{directory:winDir,checks:windows.count,runs:windows.results.length},results,restart:{checks:restartProof.checks,proof:path.join(restart,'restart-proof.json')},protectedFiles,manifestSha256,exeSha256,asarSha256,visualReviewPending:true,releaseReady:false};fs.writeFileSync(path.join(out,'Abnahme.json'),JSON.stringify(acceptance,null,2));console.log(JSON.stringify({ok:true,out,unitTests:unit.count,windowsChecks:windows.count+results.reduce((s,r)=>s+r.checks,0)+restartProof.checks,visualReviewPending:true}));
