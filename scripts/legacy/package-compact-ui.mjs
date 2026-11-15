import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {extractAll} from '@electron/asar';
import {packager} from '@electron/packager';
const root=process.cwd(),base=path.resolve('output/Fehlerkorrekturen-v0.113.1-r2/Formnaro-win32-x64');
const revision=process.argv[2]??'r3';assert.match(revision,/^r\d+$/);
const out=path.resolve('output/Kompakte-Oberflaeche-v0.113.1-'+revision),work=path.resolve('work/compact-ui/package-'+revision),stage=path.join(work,'stage');
assert(!fs.existsSync(out)&&!fs.existsSync(stage),'Use a fresh revision');fs.mkdirSync(stage,{recursive:true});
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const protectedFiles=['Formnaro.exe','resources/app.asar'].map(file=>({file,sha256:hash(path.join(base,file))}));
extractAll(path.join(base,'resources/app.asar'),stage);
// Reuse the accepted runtime, replace only the new renderer and relevant UI verifiers.
for(const dir of ['dist','backend'])fs.cpSync(path.join(root,dir),path.join(stage,dir),{recursive:true});
const meta=JSON.parse(fs.readFileSync('package.json'));
const [runtime]=await packager({dir:stage,tmpdir:path.join(work,'tmp'),name:'Formnaro',platform:'win32',arch:'x64',out,asar:true,prune:false,overwrite:false,electronVersion:meta.devDependencies.electron,appVersion:meta.version,appCopyright:'Copyright (c) 2026 '+meta.author,win32metadata:{ProductName:'Formnaro',FileDescription:'Kompakte Solid- und Fusion-Oberfläche'}});
for(const name of ['converter','speech'])fs.cpSync(path.join(base,'resources',name),path.join(runtime,'resources',name),{recursive:true});
for(const name of ['LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt','ai','docs','scripts'])if(fs.existsSync(path.join(base,name)))fs.cpSync(path.join(base,name),path.join(runtime,name),{recursive:true});
async function execute(label,args,compact=false){
 const directory=path.join(work,label);fs.mkdirSync(directory);const report=path.join(directory,'result.json'),fd=fs.openSync(path.join(directory,'run.log'),'w');
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.FORMNARO_VERIFY_COMPACT_ONLY;if(compact)env.FORMNARO_VERIFY_COMPACT_ONLY='1';
 const child=spawn(path.join(runtime,'Formnaro.exe'),[...args.map(a=>a+'='+report)],{cwd:root,env,windowsHide:true,stdio:['ignore',fd,fd]});
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve)});fs.closeSync(fd);
 assert.equal(code,0,label+' failed');const r=JSON.parse(fs.readFileSync(report));assert(r.ok&&r.isolatedProfile&&!r.errors.length&&!r.external.length);console.log(label+': '+r.checks.length+' checks');return {label,checks:r.checks.length,report,sha256:hash(report)};
}
const results=[];
for(const mode of ['solid','fusion'])results.push(await execute('compact-'+mode,['--verify-'+mode],true));
// This layout revision intentionally runs only the focused chrome checks.
for(const row of protectedFiles)assert.equal(hash(path.join(base,row.file)),row.sha256,'Previous output changed');
const report={ok:true,version:meta.version,runtime,scope:'Only Solid/Fusion layout, mode naming, menus, tabs, docking, unchanged model/undo and mode restoration; no general suite',results,protectedFiles,exeSha256:hash(path.join(runtime,'Formnaro.exe')),asarSha256:hash(path.join(runtime,'resources/app.asar')),visualReviewPending:true};
fs.writeFileSync(path.join(out,'Abnahme.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(out,'Starten.txt'),'Formnaro.exe im Unterordner Formnaro-win32-x64 starten.\r\nKompakte Solid- und Fusion-Oberfläche. Menüleiste oben; bestehende Befehle und Gruppen erhalten.\r\n');
console.log(out);
