import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {packager} from '@electron/packager';
const require=createRequire(import.meta.url),root=process.cwd(),meta=JSON.parse(fs.readFileSync('package.json'));
const revision=process.argv[2]??'r1';assert.match(revision,/^r\d+$/);assert.equal(meta.version,'0.116.0');
const proof=path.resolve('work/mesh-surgery/package-'+revision),source=path.join(proof,'source'),stage=path.join(proof,'stage'),out=path.resolve('output/Netzreparatur-Flaechen-v'+meta.version+'-'+revision),base=path.resolve('output/Gekruemmte-Netze-v0.115.0-r1/Formnaro-win32-x64');
assert(!fs.existsSync(proof)&&!fs.existsSync(out),'Use a fresh package revision');fs.mkdirSync(source,{recursive:true});
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function inventory(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{if(e.isSymbolicLink())return [];const p=path.join(dir,e.name),file=prefix+e.name;return e.isDirectory()?inventory(p,file+'/'):[{file,size:fs.statSync(p).size,sha256:hash(p)}];}).sort((a,b)=>a.file.localeCompare(b.file,'en'));}
const protectedFiles=['output/Gekruemmte-Netze-v0.115.0-r1/Formnaro-win32-x64','output/Integrierte-CAD-Laufzeit-v0.114.0-r7/Formnaro-win32-x64'].flatMap(directory=>['Formnaro.exe','resources/app.asar'].map(file=>({file:path.resolve(directory,file),sha256:hash(path.resolve(directory,file))})));
const priorAcceptance=JSON.parse(fs.readFileSync(path.join(base,'../Freigabe.json')));assert(priorAcceptance.releaseReady);assert.equal(hash(path.join(base,'Formnaro.exe')),priorAcceptance.exeSha256);assert.equal(hash(path.join(base,'resources/app.asar')),priorAcceptance.asarSha256);
const included=['src','backend','tests','ai','docs','scripts','licenses','python-runtime','cad-kernel-build/runtime','index.html','vite.config.js','electron.cjs','preload.cjs','package.json','package-lock.json','LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt','README.md'];
for(const file of included)fs.cpSync(file,path.join(source,file),{recursive:true});
fs.symlinkSync(path.join(root,'node_modules'),path.join(source,'node_modules'),'junction');
const frozen=inventory(source);fs.writeFileSync(path.join(proof,'source-freeze.json'),JSON.stringify(frozen,null,2));
async function execute(label,exe,args,{cwd=source,env={}}={}){
 const fd=fs.openSync(path.join(proof,label+'.log'),'w'),childEnv={...process.env,...env};delete childEnv.ELECTRON_RUN_AS_NODE;
 const started=Date.now(),child=spawn(exe,args,{cwd,env:childEnv,windowsHide:true,stdio:['ignore',fd,fd]});const code=await new Promise((r,j)=>{child.on('error',j);child.on('close',r);});fs.closeSync(fd);assert.equal(code,0,label+' failed; see '+proof);console.log(label+' passed in '+(Date.now()-started)+' ms');
}
const tests=['mesh-surgery.test.mjs','mesh-surgery-controller.test.mjs','mesh-surgery-ui.test.mjs','mesh-hole-fill.test.mjs','mesh-hole-fill-controller.test.mjs','mesh-hole-fill-ui.test.mjs','mesh-erase-fill.test.mjs','mesh-smooth.test.mjs','mesh-simple-repair.test.mjs','cad-ai-program.test.mjs','mesh-contact-predicates.test.mjs','fnpack-data.test.mjs','fnpack-persistence.test.mjs','fnpack-recovery.test.mjs'];
await execute('targeted-tests',process.execPath,['--test','--test-concurrency=1',...tests.map(n=>'tests/'+n)]);
await execute('build',process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build','--base','./']);
fs.mkdirSync(stage);
for(const file of ['dist','backend','ai','docs','licenses','scripts','electron.cjs','preload.cjs','package.json','LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.cpSync(path.join(source,file),path.join(stage,file),{recursive:true});
const cadLicenses=path.join(stage,'licenses/cad-kernel');fs.mkdirSync(cadLicenses,{recursive:true});fs.cpSync(path.join(source,'cad-kernel-build/runtime/licenses'),path.join(cadLicenses,'licenses'),{recursive:true});for(const name of ['README.md','integrity.json','upstream-lock.json','system-license-lock.json','build-inputs.json','formnaro_cad.provenance.json','formnaro_cad.build-manifest.json'])fs.copyFileSync(path.join(source,'cad-kernel-build/runtime',name),path.join(cadLicenses,name));
const cad=path.join(base,'resources/freecad'),manifestSha256=hash(path.join(cad,'manifest.json'));
fs.writeFileSync(path.join(stage,'backend/freecad-runtime-pin.json'),JSON.stringify({sha256:manifestSha256}));
// Reuse accepted binary runtimes, with complete integrity verification of the
// copied CAD runtime. The new renderer/backend is built from the frozen source.
const [runtime]=await packager({dir:stage,tmpdir:path.join(proof,'tmp'),name:'Formnaro',platform:'win32',arch:'x64',out,asar:true,prune:false,overwrite:false,electronVersion:meta.devDependencies.electron,appVersion:meta.version,appCopyright:'Copyright (c) 2026 '+meta.author,win32metadata:{ProductName:'Formnaro',FileDescription:'Netzreparatur und Flächen'}});
for(const name of ['converter','speech','freecad'])fs.cpSync(path.join(base,'resources',name),path.join(runtime,'resources',name),{recursive:true});
for(const file of ['LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.copyFileSync(path.join(source,file),path.join(runtime,file));
fs.cpSync(path.join(source,'docs'),path.join(runtime,'docs'),{recursive:true});
const integrity=await require('../backend/freecad-runtime.cjs').verifyRuntime(path.join(runtime,'resources/freecad'));assert(integrity.ok);assert.equal(hash(path.join(runtime,'resources/freecad/manifest.json')),manifestSha256);
fs.writeFileSync(path.join(proof,'cad-runtime-integrity.json'),JSON.stringify({...integrity,manifestSha256},null,2));console.log('Copied CAD runtime integrity passed');
const results=[];
for(const [name,flag,env,minimum]of [['surgery','mesh-remesh',{FORMNARO_VERIFY_SURGERY_ONLY:'1'},46],['hole','mesh-hole-fill',{},25],['replace','mesh-erase-fill',{},28],['repair','mesh-simple-repair',{},27]]){
 const directory=path.join(proof,name);fs.mkdirSync(directory);const report=path.join(directory,'result.json');await execute('packaged-'+name,path.join(runtime,'Formnaro.exe'),['--verify-'+flag+'='+report],{cwd:root,env});const r=JSON.parse(fs.readFileSync(report));assert(r.ok&&r.isolatedProfile&&!r.errors.length&&!r.external.length);assert.equal(r.version??r.appVersion,meta.version);assert(r.checks.length>=minimum);assert.equal(r.cloudRequests??0,0);results.push({name,checks:r.checks.length,report,sha256:hash(report),screenshots:r.screenshots??[r.screenshot,r.comparisonScreenshot].filter(Boolean)});
}
for(const row of protectedFiles)assert.equal(hash(row.file),row.sha256,'Previous program changed');
for(const row of frozen)assert.equal(hash(path.join(source,row.file)),row.sha256,'Frozen source changed');
const acceptance={ok:true,version:meta.version,runtime,source,sourceManifestSha256:hash(path.join(proof,'source-freeze.json')),scope:'Targeted Paket 9 acceptance only; final general acceptance after Paket 10 remains pending.',tests,results,protectedFiles,manifestSha256,exeSha256:hash(path.join(runtime,'Formnaro.exe')),asarSha256:hash(path.join(runtime,'resources/app.asar')),visualReviewPending:true,releaseReady:false};
fs.writeFileSync(path.join(out,'Abnahme.json'),JSON.stringify(acceptance,null,2));
fs.writeFileSync(path.join(out,'Starten.txt'),'Formnaro-win32-x64/Formnaro.exe starten.\r\nErweiterte Netzreparatur, Extrusion, Versatz und weiches Schrift-/Formrelief. FreeCAD-/Python-Laufzeit integriert.\r\nFreigabestatus in Abnahme.json; Sichtkontrolle ist vor der Bereitstellung erforderlich.\r\n');
console.log(JSON.stringify({ok:true,out,runtime,results:results.map(r=>({name:r.name,checks:r.checks})),visualReviewPending:true}));
