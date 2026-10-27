import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {packager} from '@electron/packager';
import {extractFile,listPackage,statFile} from '@electron/asar';
const version='0.94.1',meta=JSON.parse(fs.readFileSync('package.json')),out='F:/Formnaro-Ausgaben/STL-Konturen-v'+version,temp='F:/Formnaro-Buildtemp/STL-Konturen-v'+version+'-r3',stage=temp+'/stage',proof=path.resolve('work/mesh-contours/release-r3');
assert.equal(meta.version,version);assert(!fs.existsSync(out)&&!fs.existsSync(temp));fs.mkdirSync(proof,{recursive:true});fs.mkdirSync(stage,{recursive:true});
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function inventory(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{assert(!e.isSymbolicLink());const p=path.join(dir,e.name),f=prefix+e.name;return e.isDirectory()?inventory(p,f+'/'):[{file:f,sha256:hash(p)}];}).sort((a,b)=>a.file.localeCompare(b.file));}
const previous=JSON.parse(fs.readFileSync('F:/Formnaro-Ausgaben/KI-Modellierhilfen-v0.93.1/Abnahme.json'));const protectedFiles=[...previous.preserved,...['F:/Formnaro-Ausgaben/KI-Modellierhilfen-v0.93.1/Formnaro-win32-x64','F:/Formnaro-Ausgaben/KI-Fehlervorschau-v0.94.0/Formnaro-win32-x64'].flatMap(dir=>['Formnaro.exe','resources/app.asar'].map(n=>({file:dir+'/'+n,sha256:hash(dir+'/'+n)})))];
async function execute(name,exe,args){const logfile=path.join(proof,name+'.log'),fd=fs.openSync(logfile,'w'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const p=spawn(exe,args,{env,windowsHide:true,stdio:['ignore',fd,fd]});const code=await new Promise((r,j)=>{p.on('error',j);p.on('close',r);});fs.closeSync(fd);assert.equal(code,0,name+' failed; '+logfile);console.log(name+' passed');}
await execute('unit',process.execPath,['--test','tests/mesh-display-geometry.test.mjs','tests/cad-renderer-picking.test.mjs','tests/cad-marquee-selection.test.mjs','tests/inspection-preview.test.mjs','tests/mesh-selection-performance.test.mjs','tests/cad-program-performance.test.mjs','tests/preferences-plugins.test.mjs']);
fs.cpSync('work/mesh-contours/release-dist',stage+'/dist',{recursive:true});
for(const n of ['backend','electron.cjs','preload.cjs','package.json','LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt','licenses','ai','docs'])fs.cpSync(n,stage+'/'+n,{recursive:true,filter:p=>!/^__pycache__$|\.py[co]$/.test(path.basename(p))});
fs.mkdirSync(stage+'/scripts');fs.copyFileSync('scripts/offlinecad_ai.py',stage+'/scripts/offlinecad_ai.py');
const license=stage+'/licenses/cad-kernel';fs.mkdirSync(license,{recursive:true});fs.cpSync('cad-kernel-build/runtime/licenses',license+'/licenses',{recursive:true});for(const n of ['README.md','integrity.json','upstream-lock.json','system-license-lock.json','build-inputs.json','formnaro_cad.provenance.json','formnaro_cad.build-manifest.json'])fs.copyFileSync('cad-kernel-build/runtime/'+n,license+'/'+n);
const sourceFiles=inventory(stage),results=[];
async function ui(mode,exe,args=[]){for(const flag of (mode==='source'?['mesh-display','inspection']:['mesh-display','inspection','ai-result-checks'])){const dir=path.join(proof,mode+'-'+flag);fs.mkdirSync(dir,{recursive:true});const report=path.join(dir,'result.json');await execute(mode+'-'+flag,exe,[...args,'--verify-'+flag+'='+report]);const r=JSON.parse(fs.readFileSync(report));assert(r.ok&&r.isolatedProfile&&r.appVersion===version&&!r.errors.length&&!r.external.length);results.push({mode,flag,checks:r.checks.length,report,sha256:hash(report),exeSha256:r.exeSha256,asarSha256:r.asarSha256});}}
await ui('source',path.resolve('node_modules/electron/dist/electron.exe'),[stage]);
process.env.TEMP=temp;process.env.TMP=temp;
const [runtime]=await packager({tmpdir:temp,dir:stage,name:'Formnaro',platform:'win32',arch:'x64',out,asar:true,prune:false,overwrite:false,electronVersion:meta.devDependencies.electron,appVersion:version,appCopyright:'Copyright (c) 2026 '+meta.author,win32metadata:{ProductName:'Formnaro',FileDescription:'Klare STL-Konturen'}});
fs.cpSync('converter/runtime-v010',runtime+'/resources/converter',{recursive:true});for(const n of ['README.md','provenance.json'])fs.copyFileSync('converter/'+n,runtime+'/resources/converter/'+n);
for(const n of ['LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt','ai','docs','scripts'])fs.cpSync(stage+'/'+n,runtime+'/'+n,{recursive:true});
const asar=runtime+'/resources/app.asar',exe=runtime+'/Formnaro.exe',runtimeFiles=inventory(runtime),exeSha256=hash(exe),asarSha256=hash(asar);
await ui('packaged',exe);
assert.deepEqual(inventory(stage),sourceFiles);assert.deepEqual(inventory(runtime),runtimeFiles);
for(const r of results.filter(r=>r.mode==='packaged')){assert.equal(r.exeSha256,exeSha256);assert.equal(r.asarSha256,asarSha256);}
for(const r of sourceFiles){const bytes=extractFile(asar,r.file.split('/').join(path.sep));if(r.file==='package.json'){const expected=JSON.parse(fs.readFileSync(stage+'/package.json'));for(const k of ['private','scripts','devDependencies'])delete expected[k];assert.deepEqual(JSON.parse(bytes),expected);}else assert.equal(createHash('sha256').update(bytes).digest('hex'),r.sha256);}
for(const r of protectedFiles)assert.equal(hash(r.file),r.sha256);
fs.writeFileSync(out+'/Abnahme.json',JSON.stringify({ok:true,version,runtime,exeSha256,asarSha256,results,protectedFiles,sourceFiles,runtimeFiles,scope:'25 focused unit tests and actual source/packaged display and inspection plus packaged AI result verification; no cloud requests. Existing releases preserved.'},null,2));
fs.writeFileSync(out+'/Starten.txt','Formnaro '+version+' â€“ Klare STL-Konturen\r\nFormnaro-win32-x64/Formnaro.exe starten.\r\nGlaette Rundungen, erhaltene scharfe Formkanten und dezente Konturlinien fuer STL-Modelle. Modellgeometrie bleibt unveraendert.\r\n');
console.log(JSON.stringify({ok:true,runtime,results:results.map(r=>({mode:r.mode,flag:r.flag,checks:r.checks}))}));
