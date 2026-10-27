// Whitelist packaging for the complete native CAD release. Never updates an old release.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {packager} from '@electron/packager';
import {Zip,ZipDeflate,ZipPassThrough} from 'fflate';
import {cadReleaseManifest} from './cad-release-manifest.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const metadata=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
if(metadata.version!=='0.12.0')throw Error('Only the complete 0.12.0 native application may be packaged here.');
const gates=JSON.parse(fs.readFileSync(path.join(root,'work/cad-v011/release-gates.json'),'utf8'));
if(gates.ok!==true||gates.version!==metadata.version)throw Error('Complete native feature acceptance is required before packaging.');
if(JSON.stringify(gates.manifest)!==JSON.stringify(cadReleaseManifest(root)))throw Error('Sources or production assets changed after acceptance. Refresh the relevant checks and release manifest before packaging.');
const output=path.join(root,'release-formnaro-v'+metadata.version.split('.').slice(0,2).join('.'));
if(fs.existsSync(output))throw Error('The separate release output already exists; it will not be overwritten.');
const stage=fs.mkdtempSync(path.join(root,'work/cad-v011/release-stage-'));
function copy(name,target=name){fs.cpSync(path.join(root,name),path.join(stage,target),{recursive:true,force:false,errorOnExist:true});}
for(const name of ['dist','backend','electron.cjs','preload.cjs','package.json','LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt','licenses','ai'])copy(name);
fs.mkdirSync(path.join(stage,'scripts'));copy('scripts/offlinecad_ai.py');
const kernel='cad-kernel-build/runtime',notice='licenses/cad-kernel';
for(const name of ['README.md','upstream-lock.json','system-license-lock.json','build-inputs.json','formnaro_cad.build-manifest.json','formnaro_cad.provenance.json','integrity.json'])copy(kernel+'/'+name,notice+'/'+name);
copy(kernel+'/licenses',notice+'/licenses');
fs.mkdirSync(path.join(stage,'docs'));
for(const name of ['PROJEKTKONTEXT.md','CAD-PROJEKTFORMAT-5.md','CAD-UMSTELLUNG-AUFTRAG.md','CAD-UMSTELLUNG-PRUEFMATRIX.md','CAD-ABNAHME-v0.11.md'])copy('docs/'+name);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function entries(directory,prefix=''){const result=[];for(const item of fs.readdirSync(directory,{withFileTypes:true})){if(item.name==='__pycache__'||/\.py[co]$/i.test(item.name))continue;if(item.isSymbolicLink())throw Error('Source/package symlinks are excluded.');const relative=prefix+item.name;if(item.isDirectory())result.push(...entries(path.join(directory,item.name),relative+'/'));else if(item.isFile())result.push([relative,path.join(directory,item.name)]);}return result;}
function archive(file,files){const fd=fs.openSync(file,'wx'),manifest=[];let finished=false;try{const zip=new Zip((error,chunk,final)=>{if(error)throw error;fs.writeSync(fd,chunk);if(final)finished=true;});for(const [relative,absolute]of files.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0)){if(relative.includes('..')||relative.startsWith('/')||relative.includes('\\'))throw Error('Unsafe archive name.');const content=fs.readFileSync(absolute),entry=/\.(tar\.gz|zip|png|jpg|wasm|ttf|otf)$/i.test(relative)?new ZipPassThrough(relative):new ZipDeflate(relative,{level:6});entry.mtime=new Date(2026,9,11,0,0,0);zip.add(entry);entry.push(content,true);manifest.push({file:relative,bytes:content.length,sha256:digest(content)});}zip.end();if(!finished)throw Error('Archive did not complete.');}finally{fs.closeSync(fd);}return {file:path.basename(file),bytes:fs.statSync(file).size,sha256:digest(fs.readFileSync(file)),entries:manifest};}
const lock=JSON.parse(fs.readFileSync(path.join(root,'cad-kernel-build/upstream-lock.json'),'utf8'));
const nativeSources=[];
for(const source of lock.sources){const existing=path.join(root,'work/v010/upstream/source-archives',source.file),file=fs.existsSync(existing)?existing:path.join(root,'work/cad-v011-build/archives',source.file),content=fs.readFileSync(file);if(content.length!==source.bytes||digest(content)!==source.sha256)throw Error('Corresponding source archive mismatch: '+source.file);nativeSources.push(['upstream/'+source.file,file]);}
nativeSources.push(...entries(path.join(root,'cad-kernel-build')).filter(([name])=>!name.startsWith('runtime/')).map(([name,file])=>['cad-kernel-build/'+name,file]));
nativeSources.push(['generated/formnaro_cad.yml',path.join(root,'work/cad-v011-build/config/formnaro_cad.yml')],['generated/build-inputs.json',path.join(root,'work/cad-v011-build/config/build-inputs.json')],['LIES-MICH-QUELLEN.txt',path.join(root,'licenses/CAD-Quellen-und-Build.txt')]);
const runtimeInputs=fs.readFileSync(path.join(root,'cad-kernel-build/runtime/build-inputs.json')),inputPins=JSON.parse(runtimeInputs);
if(!runtimeInputs.equals(fs.readFileSync(path.join(root,'work/cad-v011-build/config/build-inputs.json'))))throw Error('Generated build inputs differ from the materialized native runtime.');
if(digest(fs.readFileSync(path.join(root,'work/cad-v011-build/config/formnaro_cad.yml')))!==inputPins.generatedYamlSha256)throw Error('Generated bindings differ from the materialized runtime source pin.');
if(digest(fs.readFileSync(path.join(root,'cad-kernel-build/wrappers/formnaro-cad-bridge.cpp')))!==inputPins.bridgeSha256)throw Error('Bridge source differs from the materialized runtime source pin.');
const sourceFiles=[];
for(const name of ['src','backend','scripts','tests','cad-kernel-build','licenses','ai'])sourceFiles.push(...entries(path.join(root,name)).map(([relative,file])=>[name+'/'+relative,file]));
for(const name of ['package.json','package-lock.json','index.html','vite.config.js','electron.cjs','preload.cjs','LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt','.gitignore'])sourceFiles.push([name,path.join(root,name)]);
for(const name of fs.readdirSync(path.join(root,'docs')).filter(name=>name.endsWith('.md')))sourceFiles.push(['docs/'+name,path.join(root,'docs',name)]);
for(const [name]of sourceFiles)if(/(^|\/)(work|Daten|Layouts|\.env[^/]*|ai-bridge\.json|ai-settings\.json|__pycache__)(\/|$)|\.pyc$/.test(name))throw Error('Private source archive entry: '+name);
for(const [,file]of [...sourceFiles,...nativeSources])if(!fs.statSync(file).isFile())throw Error('Corresponding source input missing.');
const packed=await packager({dir:stage,name:'Formnaro',platform:'win32',arch:'x64',out:output,asar:true,prune:false,overwrite:false,electronVersion:metadata.devDependencies.electron,appVersion:metadata.version,appCopyright:`Copyright (c) 2026 ${metadata.author||'Formnaro contributors'}`,win32metadata:{CompanyName:metadata.author||'Formnaro contributors',ProductName:'Formnaro',FileDescription:metadata.description}});
if(packed.length!==1)throw Error('Expected exactly one Windows portable application.');
// A native Python process cannot read scripts inside app.asar. Supply the identical client beside the EXE.
fs.mkdirSync(path.join(packed[0],'scripts'));fs.copyFileSync(path.join(root,'scripts/offlinecad_ai.py'),path.join(packed[0],'scripts/offlinecad_ai.py'));
fs.cpSync(path.join(root,'ai'),path.join(packed[0],'ai'),{recursive:true,errorOnExist:true,force:false});
for(const name of ['LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.copyFileSync(path.join(root,name),path.join(packed[0],name));
const artifacts=[archive(path.join(output,'Formnaro-CAD-Quellen-v0.12.zip'),nativeSources),archive(path.join(output,'Formnaro-Quellcode-v0.12.zip'),sourceFiles)];
// The portable archive is created only after the actual EXE has passed verification.
fs.writeFileSync(path.join(output,'Quellen-Pruefsummen.json'),JSON.stringify({version:metadata.version,kernelSources:lock.sources,artifacts},null,2)+'\n');
fs.writeFileSync(path.join(root,'work/cad-v011/release-package.json'),JSON.stringify({version:metadata.version,directory:packed[0],stage,artifacts},null,2)+'\n');
console.log(JSON.stringify({version:metadata.version,directory:packed[0],sourceArchives:artifacts.map(({file,bytes,sha256})=>({file,bytes,sha256})),actualExeVerificationPending:true}));
