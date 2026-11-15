import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {packager} from '@electron/packager';
import {extractFile,listPackage,statFile} from '@electron/asar';
import {integrationManifest} from './stl-integration-manifest.mjs';
const version='0.50.0',mode=process.argv[2]??'build',work=path.resolve('work/ai-lid/checks'),meta=JSON.parse(fs.readFileSync('package.json','utf8'));
if(meta.version!==version||!['build','audit'].includes(mode))throw Error('Expected AI lid release '+version);
const release=path.resolve('F:/Formnaro-Ausgaben/KI-Deckel-v'+version),runtime=path.join(release,'Formnaro-win32-x64'),temp=path.resolve('F:/Formnaro-Buildtemp/KI-Deckel-v'+version),stage=path.join(temp,'stage');
const sha=b=>createHash('sha256').update(b).digest('hex'),hash=f=>sha(fs.readFileSync(f)),read=n=>JSON.parse(fs.readFileSync(path.join(work,n),'utf8'));
function files(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{if(e.isSymbolicLink())throw Error('Symlink excluded');const rel=prefix+e.name;return e.isDirectory()?files(path.join(dir,e.name),rel+'/'):[{file:rel,sha256:hash(path.join(dir,e.name))}];}).sort((a,b)=>a.file.localeCompare(b.file));}
function acceptance(name){const r=read(name);if(!r.ok||r.version!==version||JSON.stringify(r.sourceManifest)!==JSON.stringify(integrationManifest()))throw Error('Current complete acceptance required: '+name);for(const p of r.proofs)if(p.exitCode!==0||hash(p.log)!==p.logSha256||p.report&&hash(p.report)!==p.reportSha256)throw Error('Acceptance receipt changed');return r;}
const protectedPaths=['F:/Formnaro-Ausgaben/Gesamtpruefung-v0.49.2/Formnaro-win32-x64/Formnaro.exe','F:/Formnaro-Ausgaben/Gesamtpruefung-v0.49.2/Formnaro-win32-x64/resources/app.asar','F:/Formnaro-Ausgaben/Mini-v0.6.0/Formnaro Mini-win32-x64/Formnaro Mini.exe','F:/Formnaro-Ausgaben/Mini-v0.6.0/Formnaro Mini-win32-x64/resources/app.asar','F:/Formnaro-Ausgaben/Mini-Android-v0.5.0-test1/Formnaro-Mini-Android-0.5.0-test1.apk'];
if(mode==='build'){
 const source=acceptance('source-acceptance.json');if(fs.existsSync(release)||fs.existsSync(temp))throw Error('New release must not overwrite an existing directory');
 const preserved=protectedPaths.map(file=>({file,sha256:hash(file)}));fs.mkdirSync(stage,{recursive:true});
 for(const name of ['dist','backend','electron.cjs','preload.cjs','package.json','LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt','licenses','ai','docs'])fs.cpSync(name,path.join(stage,name),{recursive:true,errorOnExist:true,force:false});fs.mkdirSync(path.join(stage,'scripts'));fs.copyFileSync('scripts/offlinecad_ai.py',path.join(stage,'scripts/offlinecad_ai.py'));
 const stageFiles=files(stage);process.env.TEMP=temp;process.env.TMP=temp;
 const result=await packager({tmpdir:temp,dir:stage,name:'Formnaro',platform:'win32',arch:'x64',out:release,asar:true,prune:false,overwrite:false,electronVersion:meta.devDependencies.electron,appVersion:version,appCopyright:'Copyright (c) 2026 '+meta.author,win32metadata:{CompanyName:meta.author,ProductName:'Formnaro',FileDescription:'KI-Deckel aus STL'}});if(result.length!==1)throw Error('Wrong package count');
 fs.cpSync('converter/runtime-v010',path.join(runtime,'resources/converter'),{recursive:true,errorOnExist:true,force:false});for(const n of ['README.md','provenance.json'])fs.copyFileSync('converter/'+n,path.join(runtime,'resources/converter',n));
 for(const n of ['LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.copyFileSync(n,path.join(runtime,n));fs.copyFileSync('docs/KI-DECKEL.md',path.join(runtime,'KI-DECKEL.md'));fs.mkdirSync(path.join(runtime,'scripts'));fs.copyFileSync('scripts/offlinecad_ai.py',path.join(runtime,'scripts/offlinecad_ai.py'));fs.cpSync('ai',path.join(runtime,'ai'),{recursive:true,errorOnExist:true,force:false});
 const build={version,runtime,stage,release,sourceAcceptanceSha256:hash(path.join(work,'source-acceptance.json')),stageFiles,runtimeFiles:files(runtime),preserved,exeSha256:hash(path.join(runtime,'Formnaro.exe')),asarSha256:hash(path.join(runtime,'resources/app.asar'))};fs.writeFileSync(path.join(work,'build.json'),JSON.stringify(build,null,2));console.log(runtime);
}else{
 const build=read('build.json'),source=acceptance('source-acceptance.json'),packed=acceptance('packaged-acceptance.json');
 if(JSON.stringify(files(runtime))!==JSON.stringify(build.runtimeFiles)||JSON.stringify(files(stage))!==JSON.stringify(build.stageFiles))throw Error('Frozen program files changed');
 for(const p of build.preserved)if(hash(p.file)!==p.sha256)throw Error('Previous program changed: '+p.file);
 if(packed.exeSha256!==build.exeSha256||packed.asarSha256!==build.asarSha256)throw Error('Wrong tested EXE');
 const asar=path.join(runtime,'resources/app.asar'),names=listPackage(asar).map(n=>n.replace(/^[\\/]+/,'')).filter(n=>!statFile(asar,n).files).map(n=>n.split(path.sep).join('/')).sort();
 if(JSON.stringify(names)!==JSON.stringify(build.stageFiles.map(e=>e.file).sort()))throw Error('ASAR entries differ');
 for(const p of build.stageFiles){const data=extractFile(asar,p.file.split('/').join(path.sep));if(p.file==='package.json'){const actual=JSON.parse(data),expected=JSON.parse(fs.readFileSync(path.join(stage,p.file),'utf8'));for(const k of ['private','scripts','devDependencies'])delete expected[k];if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Package metadata differs');}else if(sha(data)!==p.sha256)throw Error('ASAR content differs: '+p.file);}
 const independent=read('independent-files.json');if(!independent.ok||!independent.watertight||independent.components!==1||!independent.holesVerified||!independent.originalExact)throw Error('Independent STL/project proof required');
 fs.writeFileSync(path.join(work,'final-audit.json'),JSON.stringify({ok:true,version,sourceManifest:source.sourceManifest,unitChecks:source.unitChecks,sourceUI:source.uiChecks,packagedUI:packed.uiChecks,exeSha256:build.exeSha256,asarSha256:build.asarSha256,preserved:build.preserved,independent},null,2));console.log('Audit passed');
}
