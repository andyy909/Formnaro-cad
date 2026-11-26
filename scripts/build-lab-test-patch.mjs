import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createPackage,extractFile,listPackage,statFile} from '@electron/asar';
import {makeLabDelta} from './lab-asar-delta.mjs';
import {benchmarkDrawingRuntimeSources,copyPortableApp} from './portable-runtime-policy.mjs';

const [runtimeArg,outputArg,baseCommit,previousReceipt]=process.argv.slice(2);
assert(runtimeArg&&outputArg&&/^[a-f0-9]{40}$/.test(baseCommit??''),'Usage: node scripts/build-lab-test-patch.mjs <portable-program-folder> <output.zip> <base-source-commit>');
const root=process.cwd(),runtime=path.resolve(runtimeArg),output=path.resolve(outputArg);
const verifiedExe='d571ddd2b3db4f2246b4778a8b8db7601d2d6414584c3788d79159c1f2498dcc';
const verifiedBases=new Map([
 ['ff65726b44b334cffa1a0ea6b21d3648383b192f','c3b344e1dd8563db489dd22264a91b81a109a221178e2db924b2c34d66c8bfed'],
 ['7c20d6797dc3237f1d79a79fab5defaecacec19f','26a2f8295032d65cd722b1f85cacbb02df7b8a044686382050cacc490f47d476'],
 ['759c71f20bf7c2e8eb1435aacdc65d2bd4cff067','7a1861152ba2c5ad23018686edeb7adf6324e0341d60b1fa7c735f30b83a2d75'],
 ['53e93ee9c75b6c8edcc7276be1de118a2c417c9d','140532c9d953eac6f36660be4e3e2451a00ffcbd06780ac3dff8741552cfe441'],
 ['7624d3a1bbf8208038c4fac262f437ae6ceb4d97','b17c891103e2dfd0f9fc94f00c0a9cf93a4a01e6f406cdb4f7529f4dd162be5c'],
 ['e2678e5a459f53fe285d7801f8304f8bd20881ba','177b9b429655529cfac5254e9c8efbeb9b09642215997dd20887d608a48196a1'], // r4-Testkopie mit Entwicklungschecks
 ['afd3fb95084dde4db775c44a6f42f2159515c4c8','3162bac413d0fea4ea9a84809b821362e4ecc36a2d65c69a1574d9868fd21c58','609671edb179c262dad6f74e419dfd5274863aef7825c2afa980b10802b89fa2'], // GitHub v0.144.0-r1 Windows x64
 ['1ac82222e474601239da1c6d8b3dd13efac43d86','a32ff5063bfc2f09d5793a32cf040864fa0c3a61d38a3ec01a65fc77755bf70d','609671edb179c262dad6f74e419dfd5274863aef7825c2afa980b10802b89fa2'],
 ['cb949ac8438eb6793f5a75e18b7676069d61edc7','cd554db98b1ce2ad99c6958045898a65aebeac21860752a1cf5677d01c4ce39d','609671edb179c262dad6f74e419dfd5274863aef7825c2afa980b10802b89fa2'],
 ['6704ab3c276d7dbf0ab4f62a631f04e962cf57ff','360394e04ee7eb2b790e3fc153733420a7f5d90afb3ee975f4bdeb22faed4e07','609671edb179c262dad6f74e419dfd5274863aef7825c2afa980b10802b89fa2'],
 ['cb7b1b1d2297fa2a135e1b715b1a57caf2388d76','1f9015971c480141fdec680533ebc88354d41a7fcf9af4a6ddce186706251d77','609671edb179c262dad6f74e419dfd5274863aef7825c2afa980b10802b89fa2'],
].map(([commit,archiveHash,exeHash=verifiedExe])=>[commit,[exeHash,archiveHash]]));
assert.equal(path.extname(output).toLowerCase(),'.zip');
assert(/^[\w .-]+$/.test(path.basename(output)),'Use a simple ZIP filename for the Windows launcher.');
assert(!fs.existsSync(output),'Choose a new ZIP name.');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
assert.equal(git('status','--porcelain','--untracked-files=all'),'','Commit the candidate sources first.');
assert.equal(git('rev-parse',baseCommit),baseCommit);
assert.equal(git('merge-base',baseCommit,'HEAD'),baseCommit);
const sourceCommit=git('rev-parse','HEAD');
const changed=git('diff','--name-only',baseCommit,'HEAD').split(/\r?\n/).filter(Boolean);
assert(changed.every(name=>/^(ai|backend|docs|scripts|src|tests)\//.test(name)||['index.html','electron.cjs','preload.cjs'].includes(name)), 'Changed build or native runtime inputs require the full portable build.');
assert(changed.every(name=>!(/\.(wasm|exe|dll|pyd|node|cs)$/i.test(name)||name.startsWith('src/fonts/'))),'Changed binary inputs require the full portable build.');

const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const identify=file=>{const bytes=fs.readFileSync(file);return {bytes:bytes.length,sha256:sha(bytes)};};
const base=path.join(runtime,'resources','app.asar');
const baseExe=identify(path.join(runtime,'Formnaro.exe')),baseArchive=identify(base);
let identity=verifiedBases.get(baseCommit);
if(!identity && previousReceipt){
 const previous=JSON.parse(fs.readFileSync(previousReceipt,'utf8'));
 assert.equal(previous.format,'FormnaroPrivateAsarPatch');
 assert.equal(previous.sourceCommit,baseCommit);
 assert([...verifiedBases.values()].some(([exe])=>exe===previous.baseExe.sha256),'Unknown Windows executable.');
 identity=[previous.baseExe.sha256,previous.targetArchive.sha256];
}
assert.deepEqual([baseExe.sha256,baseArchive.sha256],identity,'Use a verified release or supply the locally retained build receipt of the previous patch.');
const work=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-lab-patch-'));
function files(archive){
 return listPackage(archive).map(file=>file.replace(/^[\\/]+/,'').replaceAll('\\','/'))
  .filter(file=>!statFile(archive,file.split('/').join(path.sep)).files);
}
const entry=(archive,file)=>extractFile(archive,file.split('/').join(path.sep));
try{
 execFileSync(process.execPath,[path.join(root,'node_modules','vite','bin','vite.js'),'build','--base','./'],{stdio:'inherit'});
 const stage=path.join(work,'stage'),contents=path.join(work,'zip');
 fs.mkdirSync(stage);fs.mkdirSync(contents);
 copyPortableApp(root,stage);
 // These notices and build manifests are added by the full release packager.
 // Preserve the verified base copies when rebuilding only app.asar.
 for(const name of files(base).filter(name=>name.startsWith('licenses/'))){
  const destination=path.join(stage,name);
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.writeFileSync(destination,entry(base,name));
 }
 const packageFile=path.join(stage,'package.json'),meta=JSON.parse(fs.readFileSync(packageFile,'utf8'));
 for(const key of ['private','scripts','devDependencies'])delete meta[key];
 assert.deepEqual(meta,JSON.parse(entry(base,'package.json')),'Package dependency or Electron metadata has changed.');
 fs.writeFileSync(packageFile,JSON.stringify(meta,null,2));
 const pin='backend/freecad-runtime-pin.json';
 fs.writeFileSync(path.join(stage,pin),entry(base,pin));
 const target=path.join(work,'app.asar');
 await createPackage(stage,target);
 const binaries=archive=>files(archive).filter(n=>/\.(?:wasm|node|exe|dll|pyd)$/i.test(n)).map(n=>n+':'+sha(entry(archive,n))).sort();
 assert.deepEqual(binaries(target),binaries(base),'Native program bytes changed.');
 for(const file of benchmarkDrawingRuntimeSources){
  const name='src/'+file+'.js';
  assert.equal(sha(entry(target,name)),sha(fs.readFileSync(path.join(root,name))),name);
 }
 assert.equal(git('rev-parse','HEAD'),sourceCommit);
 assert.equal(git('status','--porcelain','--untracked-files=all'),'','Sources changed during patch assembly.');
 const delta=path.join(contents,'Labor.delta');
 makeLabDelta(base,target,delta);
 const manifest={format:'FormnaroPrivateAsarPatch',version:2,delta:identify(delta),platform:'win32-x64',baseCommit,sourceCommit,baseExe,baseArchive,targetArchive:identify(target)};
 fs.writeFileSync(path.join(contents,'Manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify(manifest));
 execFileSync('powershell.exe',['-NoProfile','-Command',
  "Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory($env:FORMNARO_PATCH_CONTENTS,$env:FORMNARO_PATCH_ZIP)"],
 {env:{...process.env,FORMNARO_PATCH_CONTENTS:contents,FORMNARO_PATCH_ZIP:output},stdio:'inherit'});
 const digest=identify(output).sha256;
 fs.writeFileSync(output+'.basis.json',JSON.stringify(manifest,null,2)+'\n');
 console.log('ZIP SHA-256 '+digest);
 const name=path.basename(output);
 fs.copyFileSync(path.join(root,'scripts','use-lab-test-patch.ps1'),output+'.ps1');
 const launcher=['@echo off','setlocal','set "PSModulePath="','set "LABDIR=%~1"','if not defined LABDIR set "LABDIR=%~dp0Programmdateien"',
 'if not exist "%LABDIR%\\Formnaro.exe" set /p "LABDIR=Programmordner mit Formnaro.exe: "',
 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0'+name+'.ps1" -Mode Apply -PrivateTestCopy "%LABDIR%" -PatchZip "%~dp0'+name+'" -ExpectedZipSha256 '+digest,
 'set "RESULT=%ERRORLEVEL%"','if not "%RESULT%"=="0" pause','exit /b %RESULT%'];
 fs.writeFileSync(output+'.cmd',launcher.join('\r\n')+'\r\n','ascii');
}finally{
 assert.equal(path.dirname(fs.realpathSync(work)),fs.realpathSync(os.tmpdir()));
 fs.rmSync(work,{recursive:true,force:true});
}
