// Build a separate, accepted preview. User installations and profiles are never inputs.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {packager} from '@electron/packager';
import {cadReleaseManifest} from './cad-release-manifest.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),output=path.join(root,'release-formnaro-stl-cad-preview2');
const metadata=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')),gates=JSON.parse(fs.readFileSync(path.join(root,'work/cad-v011/release-gates.json'),'utf8'));
if(!gates.ok||gates.version!==metadata.version||JSON.stringify(gates.manifest)!==JSON.stringify(cadReleaseManifest(root)))throw Error('Current complete native acceptance is required before packaging.');
if(fs.existsSync(output))throw Error('Preview output already exists; it will not be overwritten.');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex'),stage=fs.mkdtempSync(path.join(root,'work/stl-cad-v2/package-stage-'));
function copy(name,target=name){fs.cpSync(path.join(root,name),path.join(stage,target),{recursive:true,force:false,errorOnExist:true});}
for(const name of ['dist','backend','electron.cjs','preload.cjs','package.json','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt','licenses','ai','docs'])copy(name);
fs.mkdirSync(path.join(stage,'scripts'));copy('scripts/offlinecad_ai.py');
for(const name of ['README.md','upstream-lock.json','system-license-lock.json','build-inputs.json','formnaro_cad.build-manifest.json','formnaro_cad.provenance.json','integrity.json','licenses'])copy('cad-kernel-build/runtime/'+name,'licenses/cad-kernel/'+name);
const packed=await packager({dir:stage,name:'Formnaro',platform:'win32',arch:'x64',out:output,asar:true,prune:false,overwrite:false,electronVersion:metadata.devDependencies.electron,appVersion:metadata.version,appCopyright:'Formnaro contributors',win32metadata:{CompanyName:'Formnaro contributors',ProductName:'Formnaro',FileDescription:metadata.description}});
if(packed.length!==1)throw Error('Expected one portable application.');
const destination=packed[0];fs.mkdirSync(path.join(destination,'scripts'));fs.copyFileSync(path.join(root,'scripts/offlinecad_ai.py'),path.join(destination,'scripts/offlinecad_ai.py'));fs.cpSync(path.join(root,'ai'),path.join(destination,'ai'),{recursive:true,errorOnExist:true,force:false});
for(const name of ['LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.copyFileSync(path.join(root,name),path.join(destination,name));
function entries(directory,prefix=''){const result=[];for(const item of fs.readdirSync(directory,{withFileTypes:true})){if(item.name==='__pycache__'||/\.py[co]$/i.test(item.name))continue;if(item.isSymbolicLink())throw Error('Source symlinks excluded.');const name=prefix+item.name;if(item.isDirectory())result.push(...entries(path.join(directory,item.name),name+'/'));else if(item.isFile())result.push([name,path.join(directory,item.name)]);}return result;}
const files=[];
for(const name of ['src','backend','scripts','tests','cad-kernel-build','licenses','ai','docs'])files.push(...entries(path.join(root,name)).map(([relative,file])=>[name+'/'+relative,file]));
for(const name of ['package.json','package-lock.json','index.html','vite.config.js','electron.cjs','preload.cjs','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt','.gitignore'])files.push([name,path.join(root,name)]);
for(const [name]of files)if(/(^|\/)(work|Daten|Layouts|\.env[^/]*|ai-bridge\.json|ai-settings\.json)(\/|$)/.test(name))throw Error('Private source archive entry.');
const sourceList=path.join(stage,'source-list.json');fs.writeFileSync(sourceList,JSON.stringify(files));
const sourceZip=path.join(output,'Formnaro-Quellcode-STL-CAD-Pruefung2.zip');
const zip=spawnSync('python',['-c','import json,sys,zipfile\nwith zipfile.ZipFile(sys.argv[2],"x",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:\n for name,file in json.load(open(sys.argv[1],encoding="utf-8")): z.write(file,name)\nwith zipfile.ZipFile(sys.argv[2]) as z:\n assert z.testzip() is None',sourceList,sourceZip],{cwd:root,windowsHide:true,encoding:'utf8'});if(zip.status!==0)throw Error('Application source ZIP failed: '+zip.stderr);
const kernelSource=path.join(root,'release-formnaro-v0.12/Formnaro-CAD-Quellen-v0.12.zip'),kernelHash=digest(fs.readFileSync(kernelSource));
if(kernelHash!=='d58390c6a12483d310c47368856df78ca6d54e8d67ca89784afb3c50a59cb29e')throw Error('Pinned unchanged kernel source ZIP differs.');
fs.copyFileSync(kernelSource,path.join(output,path.basename(kernelSource)),fs.constants.COPYFILE_EXCL);
const report={kind:'Separate Vorschau STL-CAD-Prüfung 2',appVersion:metadata.version,directory:path.relative(root,destination),exe:path.relative(root,path.join(destination,'Formnaro.exe')),asarSha256:digest(fs.readFileSync(path.join(destination,'resources/app.asar'))),kernelSha256:digest(fs.readFileSync(path.join(root,'cad-kernel-build/runtime/formnaro_cad.wasm'))),sourceZip:{file:path.basename(sourceZip),sha256:digest(fs.readFileSync(sourceZip))},kernelSource:{file:path.basename(kernelSource),sha256:kernelHash},gateManifest:gates.manifest,actualExeVerificationPending:true};
fs.writeFileSync(path.join(output,'Vorschau-Pruefung.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({directory:destination,asarSha256:report.asarSha256,actualExeVerificationPending:true}));
