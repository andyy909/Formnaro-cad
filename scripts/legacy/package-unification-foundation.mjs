// Separate foundation milestone. This is not the acceptance of all 27 packages.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {packager} from '@electron/packager';
import {extractFile,listPackage} from '@electron/asar';
import {integrationManifest} from './stl-integration-manifest.mjs';

const root=process.cwd(),meta=JSON.parse(fs.readFileSync('package.json')),mode=process.argv[2]??'build',buildId=process.env.FORMNARO_UNIFICATION_BUILD_ID??'';
if(buildId&&!/^[a-z0-9-]{1,24}$/.test(buildId))throw Error('Invalid build ID');const suffix=buildId?'-'+buildId:'';
const work=path.join(root,'work/unification/checks'),stage=path.join(root,'work/unification/package-stage-'+meta.version+suffix),release=path.join(root,'release-formnaro-gemeinsame-grundlage-v'+meta.version+suffix),runtime=path.join(release,'Formnaro-win32-x64');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),hash=file=>sha(fs.readFileSync(file)),read=file=>JSON.parse(fs.readFileSync(path.join(work,file),'utf8'));
function entries(directory,relative=''){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(e=>{if(e.isSymbolicLink())throw Error('Symlink in package');const name=relative+e.name;return e.isDirectory()?entries(path.join(directory,e.name),name+'/'):[{file:path.join(directory,e.name),name}];});}
function sourceProofs(){
 const manifest=integrationManifest(),proofs={};
 for(const [name,min]of [['source-ui.json',21],['cad-ui.json',137]]){const p=read(name);if(!p.ok||p.version!==meta.version||p.checks.length<min||p.errors.length||p.external.length||JSON.stringify(p.sourceManifest)!==JSON.stringify(manifest))throw Error('Current UI proof required: '+name);proofs[name]=hash(path.join(work,name));}
 for(const [name,min]of [['foundation.log',43],['regressions.log',116],['native-foundation.log',181]]){const file=path.join(work,name),log=fs.readFileSync(file,'utf8'),count=Number(log.match(/^# tests (\d+)$/m)?.[1]);if(!/^# fail 0$/m.test(log)||count<min)throw Error('Passing regression proof required: '+name);proofs[name]=hash(file);}
 return {manifest,proofs};
}
if(mode==='build'){
 const proofs=sourceProofs();if(fs.existsSync(stage)||fs.existsSync(release))throw Error('Output exists. Existing milestones are immutable.');fs.mkdirSync(stage,{recursive:true});
 for(const name of ['dist','backend','electron.cjs','preload.cjs','package.json','LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt','licenses','ai','docs'])fs.cpSync(name,path.join(stage,name),{recursive:true,errorOnExist:true,force:false});
 fs.mkdirSync(path.join(stage,'scripts'));fs.copyFileSync('scripts/offlinecad_ai.py',path.join(stage,'scripts/offlinecad_ai.py'));
 const pins=JSON.parse(fs.readFileSync('converter/provenance.json'));if(hash('converter/runtime-v010/Formnaro-Konverter.exe')!==pins.headlessExeSha256)throw Error('Converter pin changed');
 const stageFiles=entries(stage).map(e=>({name:e.name,sha256:hash(e.file)}));
 const packed=await packager({dir:stage,name:'Formnaro',platform:'win32',arch:'x64',out:release,asar:true,prune:false,overwrite:false,electronVersion:meta.devDependencies.electron,appVersion:meta.version,appCopyright:`Copyright (c) 2026 ${meta.author}`,win32metadata:{CompanyName:meta.author,ProductName:'Formnaro',FileDescription:'Gemeinsame Projektgrundlage für CAD und Netz'}});
 if(packed.length!==1)throw Error('Unexpected package count');
 fs.cpSync('converter/runtime-v010',path.join(runtime,'resources/converter'),{recursive:true,errorOnExist:true,force:false});for(const file of ['README.md','provenance.json'])fs.copyFileSync('converter/'+file,path.join(runtime,'resources/converter',file));
 for(const name of ['LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.copyFileSync(name,path.join(runtime,name));fs.copyFileSync('docs/GEMEINSAME-PROJEKTGRUNDLAGE.md',path.join(runtime,'Gemeinsame-Projektgrundlage.md'));
 const converterFiles=entries('converter/runtime-v010').map(e=>({file:'resources/converter/'+e.name,sha256:hash(e.file)}));
 fs.writeFileSync(path.join(work,'build.json'),JSON.stringify({version:meta.version,runtime,stage,...proofs,stageFiles,converterFiles,exeSha256:hash(path.join(runtime,'Formnaro.exe')),asarSha256:hash(path.join(runtime,'resources/app.asar'))},null,2));console.log(runtime);
}else if(mode==='audit'){
 const b=read('build.json'),{runtime,stage}=b,current=sourceProofs();if(JSON.stringify(current.manifest)!==JSON.stringify(b.manifest))throw Error('Sources changed after freeze');
 for(const [key,file]of [['exeSha256','Formnaro.exe'],['asarSha256','resources/app.asar']])if(hash(path.join(runtime,file))!==b[key])throw Error('Runtime changed: '+file);
 const asar=path.join(runtime,'resources/app.asar');for(const entry of b.stageFiles){const bytes=extractFile(asar,entry.name.split('/').join(path.sep));if(entry.name==='package.json'){const actual=JSON.parse(bytes),expected=JSON.parse(fs.readFileSync(path.join(stage,entry.name)));for(const key of ['private','scripts','devDependencies'])delete expected[key];if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Packaged metadata differs');}else if(sha(bytes)!==entry.sha256)throw Error('ASAR differs: '+entry.name);}
 const wasm=listPackage(asar).filter(n=>n.endsWith('.wasm')).map(n=>n.replace(/^[\\/]+/,'')),expected=['cad-kernel-build/runtime/formnaro_cad.wasm','node_modules/manifold-3d/manifold.wasm'].map(hash).sort();if(wasm.length!==2||JSON.stringify(wasm.map(name=>sha(extractFile(asar,name))).sort())!==JSON.stringify(expected))throw Error('Expected unchanged CAD and Manifold WASM binaries');
 for(const entry of b.converterFiles)if(hash(path.join(runtime,entry.file))!==entry.sha256)throw Error('Converter changed: '+entry.file);
 const mixed=read('packaged-mixed/result.json'),cad=read('packaged-cad/result.json');if(!mixed.ok||mixed.appVersion!==meta.version||mixed.checks.length<21||!mixed.isolatedProfile)throw Error('Actual EXE mixed proof required');if(!cad.ok||cad.appVersion!==meta.version||cad.checks.length<46||!cad.performance?.ok||!cad.overview?.ok||!cad.exchange?.ok)throw Error('Actual EXE CAD proof required');
 const result={ok:true,version:meta.version,runtime,exeSha256:b.exeSha256,asarSha256:b.asarSha256,sourceManifest:b.manifest,proofs:b.proofs,asarEntriesVerified:b.stageFiles.length,converterFilesVerified:b.converterFiles.length,unchangedKernels:expected,mixedChecks:mixed.checks.length,cadChecks:cad.checks.length,foundationOnly:true,full27PackageAcceptance:false};fs.writeFileSync(path.join(work,'final-audit.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({ok:true,version:meta.version,mixedChecks:result.mixedChecks,cadChecks:result.cadChecks,asarEntriesVerified:result.asarEntriesVerified}));
}else throw Error('Use build or audit');
