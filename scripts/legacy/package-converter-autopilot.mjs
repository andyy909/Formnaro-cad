import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {packager} from '@electron/packager';
import {extractFile,listPackage,statFile} from '@electron/asar';
const version='0.95.0',meta=JSON.parse(fs.readFileSync('package.json')),out='F:/Formnaro-Ausgaben/KI-CAD-Automatik-v'+version,temp='F:/Formnaro-Buildtemp/KI-CAD-Automatik-v'+version+'-r3',stage=temp+'/stage',proof=path.resolve('work/converter-autopilot/release-r3');
assert.equal(meta.version,version);assert(!fs.existsSync(out)&&!fs.existsSync(temp));fs.mkdirSync(proof,{recursive:true});fs.mkdirSync(stage,{recursive:true});
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function inventory(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{assert(!e.isSymbolicLink());const p=path.join(dir,e.name),f=prefix+e.name;return e.isDirectory()?inventory(p,f+'/'):[{file:f,sha256:hash(p)}];}).sort((a,b)=>a.file.localeCompare(b.file));}
const previous=JSON.parse(fs.readFileSync('F:/Formnaro-Ausgaben/KI-Modellierhilfen-v0.93.1/Abnahme.json'));const protectedFiles=[...previous.preserved,...['F:/Formnaro-Ausgaben/KI-Modellierhilfen-v0.93.1/Formnaro-win32-x64','F:/Formnaro-Ausgaben/KI-Fehlervorschau-v0.94.0/Formnaro-win32-x64','F:/Formnaro-Ausgaben/STL-Konturen-v0.94.1/Formnaro-win32-x64'].flatMap(dir=>['Formnaro.exe','resources/app.asar'].map(n=>({file:dir+'/'+n,sha256:hash(dir+'/'+n)})))];
async function execute(name,exe,args){const logfile=path.join(proof,name+'.log'),fd=fs.openSync(logfile,'w'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const p=spawn(exe,args,{env,windowsHide:true,stdio:['ignore',fd,fd]});const code=await new Promise((r,j)=>{p.on('error',j);p.on('close',r);});fs.closeSync(fd);assert.equal(code,0,name+' failed; '+logfile);console.log(name+' passed');}
const testedSource=Object.fromEntries(['src','backend','tests','ai','docs'].flatMap(dir=>inventory(dir).map(r=>[dir+'/'+r.file,r.sha256])));
await execute('unit',process.execPath,['--test','tests/converter-autopilot.test.mjs','tests/shared-ai.test.mjs','tests/shared-ai-service.test.cjs','tests/converter-workspace.test.mjs','tests/stl-converter.test.cjs','tests/cad-workflow-settings.test.mjs']);
await execute('build',process.execPath,['node_modules/vite/bin/vite.js','build','--base','./','--outDir','work/converter-autopilot/release-dist']);
for(const [file,sha]of Object.entries(testedSource))assert.equal(hash(file),sha,'Source changed during build: '+file);
fs.cpSync('work/converter-autopilot/release-dist',stage+'/dist',{recursive:true});
for(const n of ['backend','electron.cjs','preload.cjs','package.json','LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt','licenses','ai','docs'])fs.cpSync(n,stage+'/'+n,{recursive:true,filter:p=>!/^__pycache__$|\.py[co]$/.test(path.basename(p))});
fs.mkdirSync(stage+'/scripts');fs.copyFileSync('scripts/offlinecad_ai.py',stage+'/scripts/offlinecad_ai.py');
const license=stage+'/licenses/cad-kernel';fs.mkdirSync(license,{recursive:true});fs.cpSync('cad-kernel-build/runtime/licenses',license+'/licenses',{recursive:true});for(const n of ['README.md','integrity.json','upstream-lock.json','system-license-lock.json','build-inputs.json','formnaro_cad.provenance.json','formnaro_cad.build-manifest.json'])fs.copyFileSync('cad-kernel-build/runtime/'+n,license+'/'+n);
const sourceFiles=inventory(stage),results=[];
async function ui(mode,exe,args=[]){for(const flag of ['shared-ai','converter-workspace']){const dir=path.join(proof,mode+'-'+flag);fs.mkdirSync(dir,{recursive:true});const report=path.join(dir,'result.json');await execute(mode+'-'+flag,exe,[...args,'--verify-'+flag+'='+report]);const r=JSON.parse(fs.readFileSync(report));assert(r.ok&&r.isolatedProfile&&r.appVersion===version&&!r.errors.length&&!r.external.length);results.push({mode,flag,checks:r.checks.length,report,sha256:hash(report),exeSha256:r.exeSha256,asarSha256:r.asarSha256});}}

process.env.TEMP=temp;process.env.TMP=temp;
const [runtime]=await packager({tmpdir:temp,dir:stage,name:'Formnaro',platform:'win32',arch:'x64',out,asar:true,prune:false,overwrite:false,electronVersion:meta.devDependencies.electron,appVersion:version,appCopyright:'Copyright (c) 2026 '+meta.author,win32metadata:{ProductName:'Formnaro',FileDescription:'Automatischer KI-CAD-Import'}});
fs.cpSync('converter/runtime-v010',runtime+'/resources/converter',{recursive:true});for(const n of ['README.md','provenance.json'])fs.copyFileSync('converter/'+n,runtime+'/resources/converter/'+n);
for(const n of ['LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt','ai','docs','scripts'])fs.cpSync(stage+'/'+n,runtime+'/'+n,{recursive:true});
const asar=runtime+'/resources/app.asar',exe=runtime+'/Formnaro.exe',runtimeFiles=inventory(runtime),exeSha256=hash(exe),asarSha256=hash(asar);
await ui('packaged',exe);
assert.deepEqual(inventory(stage),sourceFiles);assert.deepEqual(inventory(runtime),runtimeFiles);
for(const r of results.filter(r=>r.mode==='packaged')){assert.equal(r.exeSha256,exeSha256);assert.equal(r.asarSha256,asarSha256);}
for(const r of sourceFiles){const bytes=extractFile(asar,r.file.split('/').join(path.sep));if(r.file==='package.json'){const expected=JSON.parse(fs.readFileSync(stage+'/package.json'));for(const k of ['private','scripts','devDependencies'])delete expected[k];assert.deepEqual(JSON.parse(bytes),expected);}else assert.equal(createHash('sha256').update(bytes).digest('hex'),r.sha256);}
for(const r of protectedFiles)assert.equal(hash(r.file),r.sha256);
fs.writeFileSync(out+'/Abnahme.json',JSON.stringify({ok:true,version,runtime,exeSha256,asarSha256,results,protectedFiles,sourceFiles,runtimeFiles,testedSource,scope:'Focused automatic converter, shared provider, local converter and workspace tests; actual packaged manual and automatic import plus converter workspace verification. Synthetic provider, real native conversion, no cloud requests. Existing releases preserved.'},null,2));
fs.writeFileSync(out+'/Starten.txt','Formnaro '+version+' – Automatischer KI-CAD-Import\r\nFormnaro-win32-x64/Formnaro.exe starten.\r\nSTL importieren > STL als CAD > Mit KI > Importieren. Die KI bereitet die fertige Vorschau automatisch vor. Abschließend Übernehmen oder Verwerfen.\r\nGemeinsame API-Einstellungen dieser Ausgabe verwenden. Die bestehende Nutzerausgabe wird nicht verändert.\r\n');
console.log(JSON.stringify({ok:true,runtime,results:results.map(r=>({mode:r.mode,flag:r.flag,checks:r.checks}))}));
