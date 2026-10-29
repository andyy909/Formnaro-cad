// Targeted local delivery. Existing releases and personal profiles are inputs
// neither to the application source nor to the new package.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {packager} from '@electron/packager';
import {extractFile} from '@electron/asar';
import {integrationManifest} from './stl-integration-manifest.mjs';
import {createSpeechFixture} from './speech-fixture.mjs';

const root=process.cwd(),require=createRequire(import.meta.url),revision=process.argv[2]??'r1',base=path.resolve(process.argv[3]??'');
assert(/^r\d+$/.test(revision)&&process.argv[3]&&process.argv.length===4,'Use: node scripts/package-mechanism-tools.mjs r1 <accepted-runtime-folder>');
const meta=JSON.parse(fs.readFileSync('package.json','utf8'));assert(['0.118.0','0.118.1','0.118.2','0.118.3'].includes(meta.version));const colorFix=meta.version==='0.118.1',largeProjectFix=meta.version==='0.118.2',auditFix=meta.version==='0.118.3';
const proof=path.resolve('work/'+(auditFix?'audit-hardening':largeProjectFix?'large-project':colorFix?'mesh-color':'mechanism-tools')+'/package-'+revision),source=path.join(proof,'source'),stage=path.join(proof,'stage');
const out=path.resolve('F:/Formnaro/Ausgaben/Weitere-Ausgaben/'+(auditFix?'Auditkorrekturen-v':largeProjectFix?'Grosse-Projekte-v':colorFix?'STL-Farben-v':'Grosse-Netze-Zahnraeder-v')+meta.version+'-'+revision);
assert(!fs.existsSync(proof)&&!fs.existsSync(out),'A delivery attempt requires new proof/output directories');
assert(fs.existsSync(path.join(base,'Formnaro.exe'))&&fs.existsSync(path.join(base,'resources/freecad/manifest.json')),'Accepted self-contained runtime required');
fs.mkdirSync(proof,{recursive:true});
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),write=(name,value)=>fs.writeFileSync(path.join(proof,name),JSON.stringify(value,null,2));
const protectedFiles=['Formnaro.exe','resources/app.asar','resources/freecad/manifest.json'].map(file=>({file:path.join(base,file),sha256:hash(path.join(base,file))}));
async function execute(name,exe,args,{cwd=root,env={}}={}){
 const logfile=path.join(proof,name+'.log'),fd=fs.openSync(logfile,'wx'),vars={...process.env,...env};delete vars.ELECTRON_RUN_AS_NODE;
 const child=spawn(exe,args,{cwd,env:vars,windowsHide:true,stdio:['ignore',fd,fd]});
 const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});fs.closeSync(fd);
 assert.equal(exitCode,0,name+' failed; '+logfile);console.log(name+' PASS');return logfile;
}
await execute('build',process.execPath,['node_modules/vite/bin/vite.js','build','--base','./']);
const before=integrationManifest(root);write('source-freeze.json',before);
const tests=auditFix?[...['audit-ipc-hardening','navigation-guard','error-log','chatgpt-login','program-storage','program-storage-ipc','program-storage-cad','files','drawing-file-cancel','stl-converter','shared-ai-service','cad-bridge-errors','projects','layout-files','drawing-pdf','ai-tool-library'].map(n=>'tests/'+n+'.test.cjs'),...['fnpack-data','fnpack-persistence','fnpack-files','fnpack-controller','fnpack-recovery','fnpack-projects','fnpack-native','speech','security-dependencies','maintenance-regressions','cad-large-project','cad-project','cad-read-view','cad-transactions','cad-controller','cad-workspace-serialization','cad-persistence','cad-recovery','mesh-large-reduce-controller','mesh-large-reduce','mesh-display-color','cad-gears','ai-model-strictness'].map(n=>'tests/'+n+'.test.mjs')]:(largeProjectFix?['cad-large-project','cad-project','cad-read-view','cad-transactions','cad-controller','cad-workspace-serialization','cad-persistence','cad-recovery','fnpack-data','fnpack-persistence','fnpack-files','fnpack-controller','fnpack-recovery','fnpack-projects','fnpack-native','mesh-large-reduce-controller','mesh-large-reduce','mesh-display-color','cad-gears','ai-model-strictness']:colorFix?['mesh-display-color','mesh-display-geometry','preferences-plugins','cad-renderer-picking','cad-interface-state','cad-part-properties','cad-part-properties-native','cad-gears','ai-model-strictness']:[
 'cad-gears','cad-joints-data','cad-joints-controller','cad-joints-persistence','cad-joints-automation','cad-joints-view',
 'mesh-large-reduce','mesh-large-reduce-controller','mesh-reduce','mesh-reduce-controller','mesh-curved-reduce',
 'ai-model-strictness','cad-ai-result-checks','cad-ai-task-progress','cad-ai-task-resume','cad-ai-program','cad-ai-contract',
 'cad-linked-contours-automation','cad-modeling-ai','cad-project-parameters-automation','sketch-constraints-integration',
 'fnpack-data','fnpack-persistence'
]).map(name=>'tests/'+name+'.test.mjs');
await execute('targeted-tests',process.execPath,['--test','--test-concurrency=1',...tests]);
assert.deepEqual(integrationManifest(root),before,'Functional source changed during tests');
for(const row of before){const target=path.join(source,row.file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,row.file),target);assert.equal(hash(target),row.sha256);}
for(const name of ['dist','backend','ai','docs','licenses','scripts','electron.cjs','preload.cjs','package.json','LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.cpSync(path.join(source,name),path.join(stage,name),{recursive:true});
const licenseDir=path.join(stage,'licenses/cad-kernel');fs.mkdirSync(licenseDir,{recursive:true});fs.cpSync(path.join(source,'cad-kernel-build/runtime/licenses'),path.join(licenseDir,'licenses'),{recursive:true});
for(const name of ['README.md','integrity.json','upstream-lock.json','system-license-lock.json','build-inputs.json','formnaro_cad.provenance.json','formnaro_cad.build-manifest.json'])fs.copyFileSync(path.join(source,'cad-kernel-build/runtime',name),path.join(licenseDir,name));
const manifestSha256=hash(path.join(base,'resources/freecad/manifest.json'));fs.writeFileSync(path.join(stage,'backend/freecad-runtime-pin.json'),JSON.stringify({sha256:manifestSha256}));
const [runtime]=await packager({dir:stage,tmpdir:path.join(proof,'tmp'),name:'Formnaro',platform:'win32',arch:'x64',out,asar:true,prune:false,overwrite:false,electronVersion:meta.devDependencies.electron,appVersion:meta.version,appCopyright:'Copyright (c) 2026 '+meta.author,win32metadata:{ProductName:'Formnaro',FileDescription:auditFix?'Paketprüfung und lokale Sicherheit':largeProjectFix?'Große Netzprojekte ohne 50-MB-Vorschaulimit':colorFix?'Eigene Farben für STL-Modelle':'Große Netze und Zahnradkopplungen'}});
console.log('Copying accepted self-contained runtimes');
for(const name of ['converter','speech','freecad'])fs.cpSync(path.join(base,'resources',name),path.join(runtime,'resources',name),{recursive:true});
for(const name of ['ai','docs'])fs.cpSync(path.join(source,name),path.join(runtime,name),{recursive:true});
fs.mkdirSync(path.join(runtime,'scripts'));fs.copyFileSync(path.join(source,'scripts/offlinecad_ai.py'),path.join(runtime,'scripts/offlinecad_ai.py'));
for(const name of ['LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.copyFileSync(path.join(source,name),path.join(runtime,name));
const integrity=await require(path.join(source,'backend/freecad-runtime.cjs')).verifyRuntime(path.join(runtime,'resources/freecad'));assert(integrity.ok);write('runtime-integrity.json',integrity);
const exeSha256=hash(path.join(runtime,'Formnaro.exe')),asarSha256=hash(path.join(runtime,'resources/app.asar')),results=[];
async function ui(name,flag,env={}){
 const directory=path.join(proof,name);fs.mkdirSync(directory);const report=path.join(directory,'result.json');if(auditFix&&flag==='speech')createSpeechFixture(path.join(directory,'fixture.wav'));
 await execute('packaged-'+name,path.join(runtime,'Formnaro.exe'),['--verify-'+flag+'='+report],{env});
 const r=JSON.parse(fs.readFileSync(report,'utf8'));assert(r.ok&&r.isolatedProfile&&r.appVersion===meta.version&&!r.errors.length&&!r.external.length);assert.equal(r.exeSha256,exeSha256);assert.equal(r.asarSha256,asarSha256);if(auditFix)assert.equal(r.electronVersion,'44.10.0');
 results.push({name,checks:r.checks.length,report,screenshots:r.screenshots??[],sha256:hash(report)});write('progress.json',{runtime,results});
}
if(auditFix){await ui('maintenance','maintenance');await ui('fnpack','fnpack');await ui('speech','speech');await ui('large-project','joints',{FORMNARO_VERIFY_LARGE_PROJECT:'1',FORMNARO_VERIFY_LARGE_MESH_FILE:process.env.FORMNARO_VERIFY_LARGE_MESH_FILE,FORMNARO_VERIFY_MECHANISM_TOOLS:'0'});await ui('mesh-display','mesh-display');await ui('mechanism-smoke','joints',{FORMNARO_VERIFY_LARGE_PROJECT:'0',FORMNARO_VERIFY_MECHANISM_TOOLS:'1',FORMNARO_VERIFY_LARGE_MESH_FILE:''});}else if(largeProjectFix){await ui('large-project','joints',{FORMNARO_VERIFY_LARGE_PROJECT:'1',FORMNARO_VERIFY_LARGE_MESH_FILE:process.env.FORMNARO_VERIFY_LARGE_MESH_FILE,FORMNARO_VERIFY_MECHANISM_TOOLS:'0'});await ui('mesh-display','mesh-display');await ui('mechanism-smoke','joints',{FORMNARO_VERIFY_LARGE_PROJECT:'0',FORMNARO_VERIFY_MECHANISM_TOOLS:'1',FORMNARO_VERIFY_LARGE_MESH_FILE:''});}else if(colorFix){await ui('mesh-display','mesh-display');await ui('mechanism-smoke','joints',{FORMNARO_VERIFY_MECHANISM_TOOLS:'1',FORMNARO_VERIFY_LARGE_MESH_FILE:''});}else{
await ui('new-tools','joints',{FORMNARO_VERIFY_MECHANISM_TOOLS:'1'});
await ui('existing-joints','joints',{FORMNARO_VERIFY_MECHANISM_TOOLS:'0'});
await ui('existing-reduction','mesh-reduce',{FORMNARO_VERIFY_MECHANISM_TOOLS:'0'});
}
for(const row of before){assert.equal(hash(path.join(source,row.file)),row.sha256,'Frozen source changed');if(!row.file.startsWith('dist/'))assert.equal(hash(path.join(root,row.file)),row.sha256,'Root source changed');}
for(const row of protectedFiles)assert.equal(hash(row.file),row.sha256,'Accepted previous output changed');
for(const file of ['src/cad-gear-couplings.js','src/mesh-large-reduce.js','src/ai-model-strictness.js'])assert(fs.existsSync(path.join(source,file)));
for(const file of ['backend/large-project-verification.cjs','backend/mechanism-tools-verification.cjs','backend/mesh-display-verification.cjs','ai/OfflineCAD-KI-Kontext.json','docs/GROSSE-NETZE-UND-ZAHNRAEDER.md'])assert.equal(createHash('sha256').update(extractFile(path.join(runtime,'resources/app.asar'),file)).digest('hex'),hash(path.join(stage,file)));
const acceptance={ok:true,version:meta.version,runtime,source,scope:auditFix?'Targeted external-audit regressions, complete geometry-reference collection, streaming speech integrity, main-frame IPC, navigation, OAuth locks and bounded logging; actual packaged maintenance, FNPACK, German speech, large-project, colors and gear/AI smoke. No fresh full-application audit.':largeProjectFix?'Targeted large-project revision identity, real large mesh previews at quality 10/90 above 50 MB, source preservation, Undo/Redo, automatic package save/reopen and recovery; color/gear/AI smoke regressions. No full-application audit.':colorFix?'Targeted STL color priority, display styles, real inspector color editing, opacity, source preservation, Undo/Redo and Save/Open; existing gear/AI controls smoke tested. No fresh full-application audit.':'Targeted checks of new gear coupling, separate large-mesh tool and AI modelling strictness, plus affected existing joints/reduction/storage/API behavior. No claim of a fresh full-application audit.',results,checks:results.reduce((s,r)=>s+r.checks,0),exeSha256,asarSha256,manifestSha256,protectedFiles,cloudRequests:0,visualReviewPending:true,releaseReady:false};
write('acceptance.json',acceptance);fs.writeFileSync(path.join(out,'Abnahme.json'),JSON.stringify(auditFix?{format:'FormnaroAcceptance',version:meta.version,electronVersion:meta.devDependencies.electron,runtime:'Formnaro-win32-x64',scope:acceptance.scope,results:results.map(({name,checks,sha256})=>({name,checks,sha256})),checks:acceptance.checks,exeSha256,asarSha256,manifestSha256,runtimeIntegrity:integrity,sourceFreezeSha256:hash(path.join(proof,'source-freeze.json')),cloudRequests:0,visualReviewPending:true,releaseReady:false}:acceptance,null,2));console.log(JSON.stringify({ok:true,out,runtime,checks:acceptance.checks,visualReviewPending:true}));
