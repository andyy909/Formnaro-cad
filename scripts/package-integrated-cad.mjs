import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {packager} from '@electron/packager';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=process.cwd(),meta=JSON.parse(fs.readFileSync('package.json'));
const revision=process.argv[2]??'r1';assert.match(revision,/^r\d+$/);
const proof=path.resolve('work/integrated-cad/'+revision),source=path.join(proof,'source'),stage=path.join(proof,'stage');
const out=path.resolve('output/Integrierte-CAD-Laufzeit-v'+meta.version+'-'+revision),base=path.resolve('output/Kompakte-Oberflaeche-v0.113.1-r5/Formnaro-win32-x64');
assert(!fs.existsSync(proof)&&!fs.existsSync(out),'Use a fresh revision');fs.mkdirSync(source,{recursive:true});
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function inventory(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{if(e.isSymbolicLink())return [];const p=path.join(dir,e.name),file=prefix+e.name;return e.isDirectory()?inventory(p,file+'/'):[{file,size:fs.statSync(p).size,sha256:hash(p)}];}).sort((a,b)=>a.file.localeCompare(b.file,'en'));}
const protectedFiles=fs.existsSync(base)?['Formnaro.exe','resources/app.asar'].map(file=>({file:path.join(base,file),sha256:hash(path.join(base,file))})):[];
const cad=path.resolve('freecad-runtime/runtime');assert((await require('../backend/freecad-runtime.cjs').verifyRuntime(cad)).ok);
const cadManifestSha256=hash(path.join(cad,'manifest.json'));
for(const n of ['src','backend','tests','ai','docs','scripts','licenses','python-runtime','cad-kernel-build/runtime','index.html','vite.config.js','electron.cjs','preload.cjs','package.json','package-lock.json','LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.cpSync(n,path.join(source,n),{recursive:true});
fs.mkdirSync(path.join(source,'freecad-runtime'));fs.symlinkSync(cad,path.join(source,'freecad-runtime/runtime'),'junction');
fs.symlinkSync(path.join(root,'node_modules'),path.join(source,'node_modules'),'junction');
const frozen=inventory(source);fs.writeFileSync(path.join(proof,'source-freeze.json'),JSON.stringify(frozen,null,2));
async function execute(label,exe,args,{cwd=source,env={}}={}){
 const fd=fs.openSync(path.join(proof,label+'.log'),'w'),started=Date.now(),childEnv={...process.env,...env};delete childEnv.ELECTRON_RUN_AS_NODE;
 const child=spawn(exe,args,{cwd,env:childEnv,windowsHide:true,stdio:['ignore',fd,fd]});const code=await new Promise((r,j)=>{child.on('error',j);child.on('close',r)});fs.closeSync(fd);assert.equal(code,0,label+' failed; see '+proof);console.log(label+' passed in '+(Date.now()-started)+' ms');
}
const nativeBaseline=process.env.FORMNARO_CAD_NATIVE_BASELINE;
if(nativeBaseline){
 const baseline=path.resolve(nativeBaseline),tap=fs.readFileSync(path.join(baseline,'native-tests.log'),'utf8');assert.match(tap,/# tests 42\r?\n/);assert.match(tap,/# pass 42\r?\n# fail 0\r?\n/);
 const frozen=JSON.parse(fs.readFileSync(path.join(baseline,'source-freeze.json'))),checked=[];
 const delta=process.env.FORMNARO_CAD_INTEGRITY_DELTA?JSON.parse(fs.readFileSync(process.env.FORMNARO_CAD_INTEGRITY_DELTA)):null;
 if(delta){assert.deepEqual(Object.keys(delta.files).sort(),['backend/freecad-integrity-worker.cjs','backend/freecad-runtime.cjs','electron.cjs','tests/freecad-runtime.test.cjs']);assert.equal(hash(delta.testLog),delta.testLogSha256);const result=fs.readFileSync(delta.testLog,'utf8');assert.match(result,/# tests 14\r?\n/);assert.match(result,/# pass 14\r?\n# fail 0\r?\n/);for(const [file,row]of Object.entries(delta.files)){assert.equal(frozen.find(r=>r.file===file)?.sha256??null,row.before);assert.equal(hash(path.join(source,file)),row.after);}}
 for(const row of frozen.filter(row=>row.file.startsWith('tests/')||row.file.startsWith('backend/')&&!row.file.endsWith('-verification.cjs'))){const actual=hash(path.join(source,row.file));if(delta?.files[row.file]){assert.equal(delta.files[row.file].before,row.sha256);assert.equal(actual,delta.files[row.file].after);}else assert.equal(actual,row.sha256,'Native test dependency changed: '+row.file);checked.push({...row,actualSha256:actual});}
 assert.equal(JSON.parse(fs.readFileSync(path.join(baseline,'stage/backend/freecad-runtime-pin.json'))).sha256,cadManifestSha256,'Native runtime changed');
 fs.writeFileSync(path.join(proof,'native-baseline.json'),JSON.stringify({ok:true,baseline,tests:42,delta,tapSha256:hash(path.join(baseline,'native-tests.log')),cadManifestSha256,checked,scope:'Native geometry backend/workers unchanged; explicit integrity concurrency delta checked separately. Renderer text and packaging/documentation receive targeted checks.'},null,2));console.log('Reused 42 native baseline tests; dependency hashes and explicit integrity delta verified');
}else await execute('native-tests',process.execPath,['--test','--test-concurrency=1',...['freecad-runtime.test.cjs','freecad.test.cjs','freecad-python.test.cjs','freecad-document.test.cjs','freecad-pad-document.test.cjs','freecad-advanced.test.cjs','freecad-surfaces.test.cjs'].map(n=>'tests/'+n)]);
await execute('ai-docs',process.execPath,['scripts/generate-ai-docs.mjs']);
await execute('build',process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build','--base','./']);
fs.mkdirSync(stage);
for(const n of ['dist','backend','ai','docs','licenses','scripts','electron.cjs','preload.cjs','package.json','LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.cpSync(path.join(source,n),path.join(stage,n),{recursive:true});
const license=path.join(stage,'licenses/cad-kernel');fs.mkdirSync(license,{recursive:true});fs.cpSync(path.join(source,'cad-kernel-build/runtime/licenses'),path.join(license,'licenses'),{recursive:true});for(const n of ['README.md','integrity.json','upstream-lock.json','system-license-lock.json','build-inputs.json','formnaro_cad.provenance.json','formnaro_cad.build-manifest.json'])fs.copyFileSync(path.join(source,'cad-kernel-build/runtime',n),path.join(license,n));
fs.writeFileSync(path.join(stage,'backend/freecad-runtime-pin.json'),JSON.stringify({sha256:cadManifestSha256}));
const [runtime]=await packager({dir:stage,tmpdir:path.join(proof,'tmp'),name:'Formnaro',platform:'win32',arch:'x64',out,asar:true,prune:false,overwrite:false,electronVersion:meta.devDependencies.electron,appVersion:meta.version,win32metadata:{ProductName:'Formnaro',FileDescription:'Integrierte CAD-Laufzeit'}});
fs.cpSync('converter/runtime-v010-security',path.join(runtime,'resources/converter'),{recursive:true});
for(const name of ['README.md','provenance.json'])fs.copyFileSync(path.join('converter',name),path.join(runtime,'resources/converter',name));
const speech=JSON.parse(fs.readFileSync('speech-runtime/manifest.json'));fs.mkdirSync(path.join(runtime,'resources/speech'));for(const row of speech.files){assert.equal(hash(path.join('speech-runtime',row.name)),row.sha256);fs.copyFileSync(path.join('speech-runtime',row.name),path.join(runtime,'resources/speech',row.name));}for(const name of ['manifest.json','LICENSE-whisper.txt','LICENSE-model.txt'])fs.copyFileSync(path.join('speech-runtime',name),path.join(runtime,'resources/speech',name));
fs.cpSync(cad,path.join(runtime,'resources/freecad'),{recursive:true});
assert.equal(hash(path.join(cad,'manifest.json')),cadManifestSha256,'Runtime changed during packaging');
const copyIntegrity=await require('../backend/freecad-runtime.cjs').verifyRuntime(path.join(runtime,'resources/freecad'));assert(copyIntegrity.ok);fs.writeFileSync(path.join(proof,'cad-runtime-copy-proof.json'),JSON.stringify({...copyIntegrity,cadManifestSha256,scope:'Complete SHA verification of all runtime files read from the actual packaged program directory'},null,2));
for(const name of ['LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.copyFileSync(name,path.join(runtime,name));
fs.cpSync(path.join(source,'docs'),path.join(runtime,'docs'),{recursive:true});
const results=[];
for(const [name,env]of [['runtime',{FORMNARO_VERIFY_CAD_RUNTIME_ONLY:'1',FORMNARO_VERIFY_CAD_RUNTIME_FAST_ONLY:'1'}],['python',{FORMNARO_NATIVE_FREECAD_ONLY:'1'}],['plans',{FORMNARO_FREECAD_ONLY:'1'}],['document',{FORMNARO_VERIFY_FREECAD_DOCUMENT_ONLY:'1'}],['advanced',{FORMNARO_VERIFY_ADVANCED_MODELING_ONLY:'1'}],['surfaces',{FORMNARO_VERIFY_SURFACES_ONLY:'1'}]]){
 if(nativeBaseline&&!['runtime','plans','advanced'].includes(name))continue; // Full six suites run once more in the clean Windows guest.
 const dir=path.join(proof,name);fs.mkdirSync(dir);const report=path.join(dir,'result.json');
 await execute('packaged-'+name,path.join(runtime,'Formnaro.exe'),['--verify-ai-result-checks='+report],{env});const r=JSON.parse(fs.readFileSync(report));assert(r.ok&&r.isolatedProfile&&!r.errors.length&&!r.external.length);results.push({name,checks:r.checks.length,report,sha256:hash(report)});
}
for(const row of protectedFiles)assert.equal(hash(row.file),row.sha256,'Previous program changed');
const runtimeFiles=inventory(runtime),acceptance={ok:true,version:meta.version,runtime,results,protectedFiles,runtimeFiles,cadManifestSha256,exeSha256:hash(path.join(runtime,'Formnaro.exe')),asarSha256:hash(path.join(runtime,'resources/app.asar')),cleanWindowsVerified:false,visualReviewPending:true,releaseReady:false,scope:'Targeted integration of bundled native CAD; clean Windows acceptance remains required. No general regression run.'};
fs.writeFileSync(path.join(out,'Abnahme.json'),JSON.stringify(acceptance,null,2));
fs.writeFileSync(path.join(out,'NOCH-NICHT-FREIGEGEBEN.txt'),'Lokaler Integrationskandidat. Die verpflichtende Abnahme auf einem sauberen Windows-System ohne separate FreeCAD-/Python-Installation steht noch aus. Kein freigegebenes Release.\r\n');
fs.writeFileSync(path.join(out,'Starten.txt'),'Formnaro-win32-x64/Formnaro.exe starten. Integrierte CAD-Laufzeit, kein Laufzeitnachladen. Aktueller Abnahmestatus: NOCH-NICHT-FREIGEGEBEN.txt.\r\n');
console.log(JSON.stringify({ok:true,out,results:results.map(r=>({name:r.name,checks:r.checks})),cleanWindowsVerified:false}));
