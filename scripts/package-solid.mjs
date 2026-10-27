import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {packager} from '@electron/packager';
import {extractFile} from '@electron/asar';

const version='0.99.0',revision=process.argv[2]??'r1';assert.match(revision,/^r\d+$/);
const meta=JSON.parse(fs.readFileSync('package.json')),name='Solid-Modus-v'+version+'-'+revision,out='F:/Formnaro-Ausgaben/'+name,temp='F:/Formnaro-Buildtemp/'+name,stage=temp+'/stage',proof=path.resolve('work/solid/release-'+revision);
assert.equal(meta.version,version);assert(!fs.existsSync(out)&&!fs.existsSync(temp),'Fresh output directories required');fs.mkdirSync(proof,{recursive:true});fs.mkdirSync(stage,{recursive:true});
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function inventory(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{assert(!e.isSymbolicLink());const file=path.join(dir,e.name),name=prefix+e.name;return e.isDirectory()?inventory(file,name+'/'):[{file:name,sha256:hash(file)}];}).sort((a,b)=>a.file.localeCompare(b.file));}
const previousDir='F:/Formnaro-Ausgaben/ChatGPT-Anmeldung-v0.98.1-r1',previous=JSON.parse(fs.readFileSync(previousDir+'/Abnahme.json'));assert(previous.ok);
const protectedFiles=[...previous.protectedFiles,...['Formnaro.exe','resources/app.asar'].map(name=>({file:previousDir+'/Formnaro-win32-x64/'+name,sha256:hash(previousDir+'/Formnaro-win32-x64/'+name)}))];
async function execute(name,exe,args){const file=path.join(proof,name+'.log'),fd=fs.openSync(file,'w'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const child=spawn(exe,args,{env,windowsHide:true,stdio:['ignore',fd,fd]});const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});fs.closeSync(fd);assert.equal(code,0,name+' failed: '+file);console.log(name+' passed');return file;}
const testedSource=Object.fromEntries(['src','backend','tests','ai','docs','scripts'].flatMap(dir=>inventory(dir).map(r=>[dir+'/'+r.file,r.sha256])));
const unitFiles=['cad-context-menu-state.test.mjs','cad-solid-state.test.mjs','preferences-plugins.test.mjs','program-storage-cad.test.cjs','program-storage.test.cjs','cad-interface-state.test.mjs','cad-workflow-settings.test.mjs','layout-customization.test.mjs','cad-renderer-picking.test.mjs','sketch-attachment.test.mjs','cad-sketch-native.test.mjs','ai-reasoning.test.cjs','chatgpt-login.test.cjs','cad-ai-models.test.cjs','speech.test.mjs'];
const unitLog=await execute('unit',process.execPath,['--test','--test-concurrency=1',...unitFiles.map(n=>'tests/'+n)]);
await execute('build',process.execPath,['node_modules/vite/bin/vite.js','build','--base','./']);
const results=[];
async function ui(mode,exe,args=[]){for(const flag of ['solid','context-menu','workbench','sketch-upgrade','ai-result-checks']){
  const dir=path.join(proof,mode+'-'+flag);fs.mkdirSync(dir,{recursive:true});const report=path.join(dir,'result.json');await execute(mode+'-'+flag,exe,[...args,'--verify-'+flag+'='+report]);
  const r=JSON.parse(fs.readFileSync(report));assert(r.ok&&r.isolatedProfile&&r.appVersion===version&&!r.errors.length&&!r.external.length);
  results.push({mode,flag,checks:r.checks.length,report,sha256:hash(report),exeSha256:r.exeSha256,asarSha256:r.asarSha256});
}}
await ui('source',path.resolve('node_modules/electron/dist/electron.exe'),['.']);
for(const [file,sha]of Object.entries(testedSource))assert.equal(hash(file),sha,'Source changed: '+file);
fs.cpSync('dist',stage+'/dist',{recursive:true});
for(const n of ['backend','electron.cjs','preload.cjs','package.json','LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt','licenses','ai','docs'])fs.cpSync(n,stage+'/'+n,{recursive:true,filter:p=>!/^__pycache__$|\.py[co]$/.test(path.basename(p))});
fs.mkdirSync(stage+'/scripts');fs.copyFileSync('scripts/offlinecad_ai.py',stage+'/scripts/offlinecad_ai.py');
const license=stage+'/licenses/cad-kernel';fs.mkdirSync(license,{recursive:true});fs.cpSync('cad-kernel-build/runtime/licenses',license+'/licenses',{recursive:true});for(const n of ['README.md','integrity.json','upstream-lock.json','system-license-lock.json','build-inputs.json','formnaro_cad.provenance.json','formnaro_cad.build-manifest.json'])fs.copyFileSync('cad-kernel-build/runtime/'+n,license+'/'+n);
const sourceFiles=inventory(stage);process.env.TEMP=temp;process.env.TMP=temp;
const [runtime]=await packager({tmpdir:temp,dir:stage,name:'Formnaro',platform:'win32',arch:'x64',out,asar:true,prune:false,overwrite:false,electronVersion:meta.devDependencies.electron,appVersion:version,appCopyright:'Copyright (c) 2026 '+meta.author,win32metadata:{ProductName:'Formnaro',FileDescription:'Solid-Modus fuer Teilekonstruktion'}});
fs.cpSync('converter/runtime-v010',runtime+'/resources/converter',{recursive:true});for(const n of ['README.md','provenance.json'])fs.copyFileSync('converter/'+n,runtime+'/resources/converter/'+n);
for(const n of ['LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt','ai','docs','scripts'])fs.cpSync(stage+'/'+n,runtime+'/'+n,{recursive:true});
const speechManifest=JSON.parse(fs.readFileSync('speech-runtime/manifest.json'));fs.mkdirSync(runtime+'/resources/speech');for(const item of speechManifest.files){assert.equal(hash('speech-runtime/'+item.name),item.sha256);fs.copyFileSync('speech-runtime/'+item.name,runtime+'/resources/speech/'+item.name);}for(const n of ['manifest.json','LICENSE-whisper.txt','LICENSE-model.txt'])fs.copyFileSync('speech-runtime/'+n,runtime+'/resources/speech/'+n);
const asar=runtime+'/resources/app.asar',exe=runtime+'/Formnaro.exe',runtimeFiles=inventory(runtime),exeSha256=hash(exe),asarSha256=hash(asar);
await ui('packaged',exe);
assert.deepEqual(inventory(stage),sourceFiles);assert.deepEqual(inventory(runtime),runtimeFiles);
for(const r of results.filter(r=>r.mode==='packaged')){assert.equal(r.exeSha256,exeSha256);assert.equal(r.asarSha256,asarSha256);}
for(const r of sourceFiles){const bytes=extractFile(asar,r.file.split('/').join(path.sep));if(r.file==='package.json'){const expected=JSON.parse(fs.readFileSync(stage+'/package.json'));for(const key of ['private','scripts','devDependencies'])delete expected[key];assert.deepEqual(JSON.parse(bytes),expected);}else assert.equal(createHash('sha256').update(bytes).digest('hex'),r.sha256);}
for(const r of protectedFiles)assert.equal(hash(r.file),r.sha256);
for(const [file,sha]of Object.entries(testedSource))assert.equal(hash(file),sha,'Source changed after tests: '+file);
const report={ok:true,version,runtime,exeSha256,asarSha256,results,unitLog,protectedFiles,sourceFiles,runtimeFiles,testedSource,scope:'Solid presentation, actual native extrusion and cut/undo, operation docking, mode/layout/persistence, camera gestures and shortcuts; existing Workbench, full sketch-upgrade and local simulated AI workflow in source and actual EXE. Focused unit regressions. No new CAD kernel, SolidWorks file reader or general performance benchmark. No personal accounts or user models used.'};
fs.writeFileSync(out+'/Abnahme.json',JSON.stringify(report,null,2));
fs.writeFileSync(out+'/Starten.txt','Formnaro '+version+' - Solid-Modus\r\nFormnaro-win32-x64/Formnaro.exe starten. Oben neben Easy Tinker und Normal auf Solid klicken.\r\nFeatures, Skizze, Pruefen, Baugruppe; Modellbaum und Eigenschaften links.\r\nEinstellungen > Solid: Navigation, Tasten und Startregister. Anleitung docs/SOLID-MODUS.md.\r\n');
console.log(JSON.stringify({ok:true,runtime,results:results.map(r=>({mode:r.mode,flag:r.flag,checks:r.checks})),protectedFiles:protectedFiles.length}));
