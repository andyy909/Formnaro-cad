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
assert.equal(path.extname(output).toLowerCase(),'.zip');
assert(!fs.existsSync(output),'Choose a new ZIP name.');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
assert.equal(git('status','--porcelain','--untracked-files=no'),'','Commit the candidate sources first.');
assert.equal(git('rev-parse',baseCommit),baseCommit);
assert.equal(git('merge-base',baseCommit,'HEAD'),baseCommit);
const sourceCommit=git('rev-parse','HEAD');
const changed=git('diff','--name-only',baseCommit,'HEAD').split(/\r?\n/).filter(Boolean);
assert(changed.every(name=>/^(ai|backend|docs|scripts|src|tests)\//.test(name)), 'Changed build or native runtime inputs require the full portable build.');
assert(changed.every(name=>!(/\.(wasm|exe|dll|pyd|node|cs)$/i.test(name)||name.startsWith('src/fonts/'))),'Changed binary inputs require the full portable build.');

const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const identify=file=>{const bytes=fs.readFileSync(file);return {bytes:bytes.length,sha256:sha(bytes)};};
const base=path.join(runtime,'resources','app.asar');
const baseExe=identify(path.join(runtime,'Formnaro.exe')),baseArchive=identify(base);
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
 const binaries=archive=>files(archive).filter(n=>/\.(?:wasm|node|exe|dll|pyd)$/i.test(n)).map(n=>sha(entry(archive,n))).sort();
 assert.deepEqual(binaries(target),binaries(base),'Native program bytes changed.');
 for(const file of ['cad-drawing-data','cad-drawing-measure','cad-geometry-digest','cad-geometry-ref']){
  const name='src/'+file+'.js';
  assert.equal(sha(entry(target,name)),sha(fs.readFileSync(path.join(root,name))),name);
 }
 const manifest={format:'FormnaroPrivateAsarPatch',version:1,platform:'win32-x64',baseCommit,sourceCommit,baseExe,baseArchive,targetArchive:identify(target)};
 fs.writeFileSync(path.join(contents,'Manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify(manifest));
 execFileSync('powershell.exe',['-NoProfile','-Command',
  "Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory($env:FORMNARO_PATCH_CONTENTS,$env:FORMNARO_PATCH_ZIP)"],
 {env:{...process.env,FORMNARO_PATCH_CONTENTS:contents,FORMNARO_PATCH_ZIP:output},stdio:'inherit'});
 console.log('ZIP SHA-256 '+identify(output).sha256);
}finally{
 fs.rmSync(work,{recursive:true,force:true});
}
