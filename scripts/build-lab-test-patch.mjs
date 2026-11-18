import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createPackage,extractFile,listPackage,statFile} from '@electron/asar';
import {copyPortableApp} from './portable-runtime-policy.mjs';

const [runtimeArg,outputArg,baseCommit]=process.argv.slice(2);
assert(runtimeArg&&outputArg&&/^[a-f0-9]{40}$/.test(baseCommit??''),'Usage: node scripts/build-lab-test-patch.mjs <portable-program-folder> <output.zip> <base-source-commit>');
const root=process.cwd(),runtime=path.resolve(runtimeArg),output=path.resolve(outputArg);
const verifiedExe='d571ddd2b3db4f2246b4778a8b8db7601d2d6414584c3788d79159c1f2498dcc';
const verifiedArchives=new Map([
 ['ff65726b44b334cffa1a0ea6b21d3648383b192f','c3b344e1dd8563db489dd22264a91b81a109a221178e2db924b2c34d66c8bfed'],
 ['7c20d6797dc3237f1d79a79fab5defaecacec19f','26a2f8295032d65cd722b1f85cacbb02df7b8a044686382050cacc490f47d476'],
 ['759c71f20bf7c2e8eb1435aacdc65d2bd4cff067','7a1861152ba2c5ad23018686edeb7adf6324e0341d60b1fa7c735f30b83a2d75'],
 ['53e93ee9c75b6c8edcc7276be1de118a2c417c9d','140532c9d953eac6f36660be4e3e2451a00ffcbd06780ac3dff8741552cfe441'],
]);
assert.equal(path.extname(output).toLowerCase(),'.zip');
assert(!fs.existsSync(output),'Choose a new ZIP name.');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
assert.equal(git('status','--porcelain','--untracked-files=all'),'','Commit the candidate sources first.');
assert.equal(git('rev-parse',baseCommit),baseCommit);
assert.equal(git('merge-base',baseCommit,'HEAD'),baseCommit);
const sourceCommit=git('rev-parse','HEAD');
const changed=git('diff','--name-only',baseCommit,'HEAD').split(/\r?\n/).filter(Boolean);
assert(changed.every(name=>/^(ai|backend|docs|scripts|src|tests)\//.test(name)||['electron.cjs','preload.cjs'].includes(name)), 'Changed build or native runtime inputs require the full portable build.');
assert(changed.every(name=>!(/\.(wasm|exe|dll|pyd|node|cs)$/i.test(name)||name.startsWith('src/fonts/'))),'Changed binary inputs require the full portable build.');

const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const identify=file=>{const bytes=fs.readFileSync(file);return {bytes:bytes.length,sha256:sha(bytes)};};
const base=path.join(runtime,'resources','app.asar');
const baseExe=identify(path.join(runtime,'Formnaro.exe')),baseArchive=identify(base);
assert.deepEqual([baseExe.sha256,baseArchive.sha256],[verifiedExe,verifiedArchives.get(baseCommit)],'The patch builder requires a verified 0.143.0-r4 test base.');
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
 const packageFile=path.join(stage,'package.json'),meta=JSON.parse(fs.readFileSync(packageFile,'utf8'));
 for(const key of ['private','scripts','devDependencies'])delete meta[key];
 assert.deepEqual(meta,JSON.parse(entry(base,'package.json')),'Package dependency or Electron metadata has changed.');
 fs.writeFileSync(packageFile,JSON.stringify(meta,null,2));
 const pin='backend/freecad-runtime-pin.json';
 fs.writeFileSync(path.join(stage,pin),entry(base,pin));
 const target=path.join(contents,'app.asar');
 await createPackage(stage,target);
 const binaries=archive=>files(archive).filter(n=>/\.(?:wasm|node|exe|dll|pyd)$/i.test(n)).map(n=>n+':'+sha(entry(archive,n))).sort();
 assert.deepEqual(binaries(target),binaries(base),'Native program bytes changed.');
 for(const file of ['cad-drawing-data','cad-drawing-measure','cad-geometry-digest','cad-geometry-ref']){
  const name='src/'+file+'.js';
  assert.equal(sha(entry(target,name)),sha(fs.readFileSync(path.join(root,name))),name);
 }
 assert.equal(git('rev-parse','HEAD'),sourceCommit);
 assert.equal(git('status','--porcelain','--untracked-files=all'),'','Sources changed during patch assembly.');
 const manifest={format:'FormnaroPrivateAsarPatch',version:1,platform:'win32-x64',baseCommit,sourceCommit,baseExe,baseArchive,targetArchive:identify(target)};
 fs.writeFileSync(path.join(contents,'Manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify(manifest));
 execFileSync('powershell.exe',['-NoProfile','-Command',
  "Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory($env:FORMNARO_PATCH_CONTENTS,$env:FORMNARO_PATCH_ZIP)"],
 {env:{...process.env,FORMNARO_PATCH_CONTENTS:contents,FORMNARO_PATCH_ZIP:output},stdio:'inherit'});
 console.log('ZIP SHA-256 '+identify(output).sha256);
}finally{
 assert.equal(path.dirname(fs.realpathSync(work)),fs.realpathSync(os.tmpdir()));
 fs.rmSync(work,{recursive:true,force:true});
}
