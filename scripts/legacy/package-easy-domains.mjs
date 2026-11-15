import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {packager} from '@electron/packager';
import {extractFile,listPackage,statFile} from '@electron/asar';
import {integrationManifest} from './stl-integration-manifest.mjs';
const root=process.cwd(),work=path.join(root,'work/easy-domains/checks'),meta=JSON.parse(fs.readFileSync('package.json','utf8'));
if(meta.version!=='0.39.0')throw Error('Expected the Easy Tinker version 0.39.0');
const release=path.join(root,'release-formnaro-easy-domains-v'+meta.version),runtime=path.join(release,'Formnaro-win32-x64'),stage=path.join(root,'work/easy-domains/package-stage');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex'),read=name=>JSON.parse(fs.readFileSync(path.join(work,name),'utf8').replace(/^\uFEFF/,''));
function files(directory,prefix=''){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{if(entry.isSymbolicLink())throw Error('Symlink excluded');const file=prefix+entry.name;return entry.isDirectory()?files(path.join(directory,entry.name),file+'/'):[{file,sha256:hash(path.join(directory,entry.name))}];}).sort((a,b)=>a.file.localeCompare(b.file));}
function report(name,count){const result=read(name+'.json'),receipt=read('run-'+name+'.json');if(!result.ok||result.appVersion!==meta.version||result.checks.length<count||result.errors?.length||result.external?.length||!receipt.ok||receipt.exitCode!==0||receipt.reportSha256!==hash(path.join(work,name+'.json')))throw Error('Passing isolated current process required: '+name);return result;}
function preservation(){const previous=JSON.parse(fs.readFileSync('work/easy-tinker/checks/build.json','utf8'));if(previous.version!=='0.38.0')throw Error('Previous acceptance missing');for(const e of previous.runtimeFiles)if(hash(path.join(previous.runtime,e.file))!==e.sha256)throw Error('Previous program changed: '+e.file);const converterFiles=files('converter/runtime-v010'),wasm=integrationManifest().filter(e=>e.file.endsWith('.wasm'));for(const e of converterFiles){const old=previous.runtimeFiles.find(old=>old.file==='resources/converter/'+e.file);if(!old||old.sha256!==e.sha256)throw Error('Converter changed: '+e.file);}for(const e of wasm){const old=previous.sourceManifest.find(old=>old.file===e.file);if(!old||old.sha256!==e.sha256)throw Error('CAD/mesh kernel changed');}return {previousVersion:previous.version,previousProgramFiles:previous.runtimeFiles.length,converterFiles,wasm};}
if((process.argv[2]??'build')==='build'){
 report('source-workbench',14);report('source-domain',30);const log=fs.readFileSync('work/easy-domains/unit.log','utf8');if(!/^# tests 55$/m.test(log)||!/^# fail 0$/m.test(log))throw Error('55 passing targeted unit checks required');
 const sidebar=JSON.parse(fs.readFileSync('work/easy-domains/sidebar/result.json','utf8'));if(!sidebar.ok||sidebar.checks.length<9)throw Error('Passing real sidebar-resize regression required');
 if(fs.existsSync(stage)||fs.existsSync(release))throw Error('Separate output exists; never overwrite');
 const preserved=preservation(),sourceManifest=integrationManifest();fs.mkdirSync(stage,{recursive:true});
 for(const name of ['dist','backend','electron.cjs','preload.cjs','package.json','LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt','licenses','ai','docs'])fs.cpSync(name,path.join(stage,name),{recursive:true,errorOnExist:true,force:false});
 fs.mkdirSync(path.join(stage,'scripts'));fs.copyFileSync('scripts/offlinecad_ai.py',path.join(stage,'scripts/offlinecad_ai.py'));
 const packed=await packager({dir:stage,name:'Formnaro',platform:'win32',arch:'x64',out:release,asar:true,prune:false,overwrite:false,electronVersion:meta.devDependencies.electron,appVersion:meta.version,appCopyright:`Copyright (c) 2026 ${meta.author}`,win32metadata:{CompanyName:meta.author,ProductName:'Formnaro',FileDescription:'Easy Tinker mit CAD- und Netzbereich'}});
 if(packed.length!==1||path.resolve(packed[0])!==runtime)throw Error('Unexpected package destination');
 fs.cpSync('converter/runtime-v010',path.join(runtime,'resources/converter'),{recursive:true,errorOnExist:true,force:false});for(const name of ['README.md','provenance.json'])fs.copyFileSync('converter/'+name,path.join(runtime,'resources/converter',name));
 for(const name of ['LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.copyFileSync(name,path.join(runtime,name));
 fs.mkdirSync(path.join(runtime,'scripts'));fs.copyFileSync('scripts/offlinecad_ai.py',path.join(runtime,'scripts/offlinecad_ai.py'));fs.cpSync('ai',path.join(runtime,'ai'),{recursive:true,errorOnExist:true,force:false});
 fs.copyFileSync('docs/EASY-TINKER-UND-LAYOUT.md',path.join(runtime,'Easy-Tinker-und-Layout.md'));
 fs.copyFileSync('docs/EASY-TINKER-UND-LAYOUT.md',path.join(release,'Easy-Tinker-und-Layout.md'));
 fs.writeFileSync(path.join(work,'build.json'),JSON.stringify({ok:true,version:meta.version,runtime,stage,sourceManifest,preserved,sidebarChecks:sidebar.checks.length,stageFiles:files(stage),runtimeFiles:files(runtime),exeSha256:hash(path.join(runtime,'Formnaro.exe')),asarSha256:hash(path.join(runtime,'resources/app.asar'))},null,2));console.log(JSON.stringify({ok:true,runtime,sourceFiles:sourceManifest.length}));
}else if(process.argv[2]==='audit'){
 const build=read('build.json'),currentManifest=integrationManifest(),changes=currentManifest.filter((entry,index)=>entry.file!==build.sourceManifest[index]?.file||entry.sha256!==build.sourceManifest[index]?.sha256);
 if(currentManifest.length!==build.sourceManifest.length||changes.length)throw Error('Production sources changed after build');
 if(JSON.stringify(build.runtimeFiles)!==JSON.stringify(files(runtime)))throw Error('Packaged runtime changed');
 const domain=report('packaged-domain',30),workbench=report('packaged-workbench',14),unified=report('packaged-unified',61);for(const result of [domain,workbench,unified])if(result.exeSha256!==build.exeSha256||result.asarSha256!==build.asarSha256)throw Error('Actual EXE identity differs');
 const asar=path.join(runtime,'resources/app.asar'),entries=listPackage(asar).map(file=>file.replace(/^[\\/]+/,'')).filter(file=>!statFile(asar,file).files).map(file=>file.split(path.sep).join('/')).sort();
 if(JSON.stringify(entries)!==JSON.stringify(build.stageFiles.map(e=>e.file).sort()))throw Error('ASAR file set differs');
 for(const e of build.stageFiles){const actual=extractFile(asar,e.file.split('/').join(path.sep));if(e.file==='package.json'){const actualMeta=JSON.parse(actual);if(actualMeta.version!==meta.version||actualMeta.main!==meta.main)throw Error('Packaged metadata differs');}else if(createHash('sha256').update(actual).digest('hex')!==e.sha256)throw Error('ASAR bytes differ: '+e.file);}
 const preserved=preservation();if(JSON.stringify(preserved)!==JSON.stringify(build.preserved))throw Error('Preserved inputs changed');
 const proofs=Object.fromEntries(['source-domain.json','run-source-domain.json','packaged-domain.json','run-packaged-domain.json','source-workbench.json','run-source-workbench.json','packaged-workbench.json','run-packaged-workbench.json','packaged-unified.json','run-packaged-unified.json'].map(name=>[name,hash(path.join(work,name))]));
 const artifactManifestChanges=[];
 fs.writeFileSync(path.join(work,'final-audit.json'),JSON.stringify({...build,ok:true,buildSourceManifest:build.sourceManifest,sourceManifest:currentManifest,artifactManifestChanges,asarFiles:entries.length,proofs,unitChecks:55,packagedUIChecks:domain.checks.length+workbench.checks.length+unified.checks.length,acceptanceScope:'Easy CAD/Mesh domains and layout plus shared file/converter/AI regression; previous geometry acceptance is not recounted'},null,2));console.log(JSON.stringify({ok:true,asarFiles:entries.length,packagedUIChecks:domain.checks.length+workbench.checks.length+unified.checks.length,artifactManifestChanges}));
}else throw Error('Use build or audit');
