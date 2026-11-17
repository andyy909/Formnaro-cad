// Builds a separate portable desktop with a verified, external native converter.
// Old releases and private portable profile directories are never copied.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {packager} from '@electron/packager';
import {createPackage,extractFile,listPackage} from '@electron/asar';
import {integrationManifest} from './stl-integration-manifest.mjs';
const root=process.cwd(),metadata=JSON.parse(fs.readFileSync('package.json','utf8'));
const mode=process.argv[2]??'build',work=path.join(root,'work/stl-v010-integration'),release=path.join(root,'release-formnaro-stl-konverter-v'+metadata.version),runtime=path.join(release,'Formnaro-win32-x64'),stage=path.join(work,'package-stage');
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function pinnedEngine(){const pins=JSON.parse(fs.readFileSync('converter/provenance.json','utf8'));for(const entry of pins.engineSourceFiles)if(sha(path.join(root,'converter',entry.file))!==entry.sha256)throw Error('Converter engine pin changed');if(pins.bridgeProtocol!==2||pins.bridgeSourceSha256!==sha(path.join(root,'converter/bridge.py'))||pins.headlessExeSha256!==sha(path.join(root,'converter/runtime-v010/Formnaro-Konverter.exe')))throw Error('Frozen converter bridge/protocol pin changed');}
function proof(name){const value=JSON.parse(fs.readFileSync(path.join(work,name,'result.json'),'utf8'));
 const required=['Region Redo restores split partition','Adjacent split regions merge through editor','Saved source-bound protection reloads through file input','Trusted rectangle selects original triangle centres including hidden faces','Actual companion meshes saved after temporary worker cleanup','Actual Formnaro kernel accepts native freeform STEP with matching volume','Converted CAD persists through project save and reopen','Canceled native worker no longer exists','No renderer errors during conversion/import/cancel/reload'];
 if(!value.ok||value.version!==metadata.version||value.checks.length<52||required.some(check=>!value.checks.includes(check))||value.engine!=='0.10.0'||value.errors.length||value.external.length)throw Error('Complete integration acceptance required: '+name);
 if(value.converterSha256!==sha(path.join(root,'converter/runtime-v010/Formnaro-Konverter.exe')))throw Error('Converter proof hash mismatch');
 if(name==='source-ui-final'&&(value.packaged||JSON.stringify(value.sourceManifest)!==JSON.stringify(integrationManifest(root))))throw Error('Source proof does not match current production sources');return value;
}
function copySourceStage(){fs.mkdirSync(stage,{recursive:true});for(const name of ['dist','backend','electron.cjs','preload.cjs','package.json','LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt','licenses','ai','docs'])fs.cpSync(path.join(root,name),path.join(stage,name),{recursive:true,force:true});fs.mkdirSync(path.join(stage,'scripts'),{recursive:true});fs.copyFileSync('scripts/offlinecad_ai.py',path.join(stage,'scripts/offlinecad_ai.py'));}
pinnedEngine();
if(mode==='build'){
 proof('source-ui-final');const manifest=integrationManifest();
 if(fs.existsSync(release))throw Error('Release directory already exists; use refresh before final acceptance.');
 copySourceStage();
 const results=await packager({dir:stage,name:'Formnaro',platform:'win32',arch:'x64',out:release,asar:true,prune:false,overwrite:false,electronVersion:metadata.devDependencies.electron,appVersion:metadata.version,appCopyright:`Copyright (c) 2026 ${metadata.author||'Formnaro contributors'}`,win32metadata:{CompanyName:metadata.author||'Formnaro contributors',ProductName:'Formnaro',FileDescription:metadata.description}});
 if(results.length!==1)throw Error('Unexpected packager output');
 fs.cpSync('converter/runtime-v010',path.join(runtime,'resources/converter'),{recursive:true,force:false,errorOnExist:true});
 fs.copyFileSync('converter/README.md',path.join(runtime,'resources/converter/README.md'));
 fs.copyFileSync('converter/provenance.json',path.join(runtime,'resources/converter/provenance.json'));
 for(const name of ['LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.copyFileSync(name,path.join(runtime,name));
 fs.cpSync('ai',path.join(runtime,'ai'),{recursive:true});fs.mkdirSync(path.join(runtime,'scripts'));fs.copyFileSync('scripts/offlinecad_ai.py',path.join(runtime,'scripts/offlinecad_ai.py'));
 fs.writeFileSync(path.join(work,'build-manifest.json'),JSON.stringify({version:metadata.version,manifest,exeSha256:sha(path.join(runtime,'Formnaro.exe')),asarSha256:sha(path.join(runtime,'resources/app.asar')),converterSha256:sha(path.join(runtime,'resources/converter/Formnaro-Konverter.exe'))},null,2));
 console.log(JSON.stringify({runtime,packagedVerificationPending:true}));
}else if(mode==='refresh'){
 // Only this task's separate release, never an installed or running app.
 if(!fs.existsSync(path.join(work,'build-manifest.json')))throw Error('No original integration build');
 copySourceStage();const temp=path.join(work,'refreshed-app.asar');await createPackage(stage,temp);fs.copyFileSync(temp,path.join(runtime,'resources/app.asar'));
 for(const name of ['LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.copyFileSync(name,path.join(runtime,name));
 const manifest=JSON.parse(fs.readFileSync(path.join(work,'build-manifest.json'),'utf8'));manifest.manifest=integrationManifest();manifest.asarSha256=sha(path.join(runtime,'resources/app.asar'));fs.writeFileSync(path.join(work,'build-manifest.json'),JSON.stringify(manifest,null,2));console.log('Separate release refreshed; new packaged acceptance required');
}else if(mode==='audit'){
 const build=JSON.parse(fs.readFileSync(path.join(work,'build-manifest.json'),'utf8')),passed=proof('packaged-ui');
 const frozenNames=new Set(build.manifest.map(entry=>entry.file)),current=integrationManifest(),frozenCurrent=current.filter(entry=>frozenNames.has(entry.file));
 if(!passed.packaged||passed.exeSha256!==build.exeSha256||passed.asarSha256!==build.asarSha256||JSON.stringify(build.manifest)!==JSON.stringify(frozenCurrent))throw Error('Release sources or packaged proof changed after build');
 for(const [key,file] of [['exeSha256','Formnaro.exe'],['asarSha256','resources/app.asar'],['converterSha256','resources/converter/Formnaro-Konverter.exe']])if(build[key]!==sha(path.join(runtime,file)))throw Error('Packaged runtime changed');
 const native=JSON.parse(fs.readFileSync(path.join(work,'packaged-native/result.json'),'utf8'));if(!native.ok||!native.nativeCad||native.appVersion!==metadata.version||native.checks.length<25||!native.ui.trustedNativeMouse||!native.ui.controlledChooser)throw Error('Actual native application acceptance required');
 const asar=path.join(runtime,'resources/app.asar');let asarEntriesVerified=0;
 function verifyStage(directory,prefix=''){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const name=prefix+entry.name,file=path.join(directory,entry.name);if(entry.isSymbolicLink())throw Error('Symlink in stage');if(entry.isDirectory())verifyStage(file,name+'/');else{
  const before=fs.readFileSync(file),after=extractFile(asar,name.split('/').join(path.sep));
  if(name==='package.json'){const expected=JSON.parse(before);for(const key of ['private','scripts','devDependencies'])delete expected[key];if(JSON.stringify(expected)!==JSON.stringify(JSON.parse(after)))throw Error('Unexpected packaged application metadata change');}
  else if(!before.equals(after))throw Error('ASAR differs from staged product: '+name);asarEntriesVerified++;
 }}}
 verifyStage(stage);if(listPackage(asar).some(name=>/(^|[/\\])(Daten|Layouts|Projekte|work|ai-bridge\.json|ai-settings\.json)([/\\]|$)/i.test(name)))throw Error('Private package entry');
 fs.writeFileSync(path.join(work,'final-runtime-audit.json'),JSON.stringify({ok:true,version:metadata.version,manifest:build.manifest,checks:passed.checks.length,nativeChecks:native.checks.length,asarEntriesVerified,additionalUnpackagedSourceFiles:current.filter(entry=>!frozenNames.has(entry.file)),...Object.fromEntries(['exeSha256','asarSha256','converterSha256'].map(key=>[key,build[key]]))},null,2));console.log('Final runtime audit passed');
}else throw Error('Use build, refresh or audit');
