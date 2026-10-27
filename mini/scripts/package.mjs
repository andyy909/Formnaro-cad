import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {packager} from '@electron/packager';
import {listPackage,extractFile} from '@electron/asar';
import {zipSync,unzipSync} from 'fflate';
const root=fileURLToPath(new URL('..',import.meta.url)),meta=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const out=path.resolve(process.env.FORMNARO_MINI_OUTPUT||`F:/Formnaro-Ausgaben/Mini-v${meta.version}`),temp=path.resolve(process.env.FORMNARO_MINI_BUILD||`F:/Formnaro-Buildtemp/Mini-v${meta.version}-Paket`),stage=path.join(temp,'stage');
const resume=process.argv.includes('--resume');
if((fs.existsSync(out)||fs.existsSync(temp))&&!resume)throw Error('Ausgabe-/Buildordner muss neu sein.');
const sha=b=>createHash('sha256').update(b).digest('hex'),hash=file=>sha(fs.readFileSync(file));
const sourceProof=path.resolve(process.env.FORMNARO_MINI_SOURCE_PROOF||path.join(root,'work/desktop/result.json')),proof=JSON.parse(fs.readFileSync(sourceProof,'utf8'));
if(!proof.ok||proof.checks.length<94||proof.version!==meta.version||proof.packaged)throw Error('Zuerst vollständige Quellprüfung erfolgreich abschließen.');
for(const entry of proof.manifest)if(hash(path.join(root,entry.file))!==entry.sha256)throw Error('Seit der Quellprüfung geändert: '+entry.file);
fs.mkdirSync(path.join(root,'work'),{recursive:true});
const unit=spawn(process.execPath,meta.scripts.test.split(' ').slice(1),{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});let unitLog='';unit.stdout.on('data',b=>unitLog+=b);unit.stderr.on('data',b=>unitLog+=b);const unitCode=await new Promise((resolve,reject)=>{unit.on('error',reject);unit.on('close',resolve);});fs.writeFileSync(path.join(root,'work/unit-final.log'),unitLog);if(unitCode!==0)throw Error('Mini-Kernprüfungen fehlgeschlagen.');
let runtime;
if(!resume){
  fs.mkdirSync(stage,{recursive:true});fs.mkdirSync(out);
  for(const name of ['backend','dist','src','tests','licenses','index.html','vite.config.js','package.json','package-lock.json','electron.cjs','preload.cjs','library-store.cjs','library-location.cjs','LICENSE.txt','README.md','NETZIMPORT.md','KI-UND-NETZREPARATUR.md','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.cpSync(path.join(root,name),path.join(stage,name),{recursive:true,errorOnExist:true});
  const paths=await packager({dir:stage,name:meta.productName,platform:'win32',arch:'x64',out,asar:true,prune:false,ignore:()=>false,overwrite:false,electronVersion:meta.devDependencies.electron,appVersion:meta.version,appCopyright:'Copyright (c) 2026 Andreas Klisch',win32metadata:{CompanyName:'Andreas Klisch',ProductName:meta.productName,FileDescription:'Kompakter Netz-Modellierer mit optionaler KI und automatischer Reparatur'}});runtime=paths[0];
}else runtime=path.join(out,meta.productName+'-win32-x64');
const exe=path.join(runtime,meta.productName+'.exe'),asar=path.join(runtime,'resources/app.asar');
function files(folder,prefix=''){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(e=>{if(e.isSymbolicLink())throw Error('Verknüpfung ausgeschlossen.');const relative=prefix+e.name;return e.isDirectory()?files(path.join(folder,e.name),relative+'/'):[{file:relative,sha256:hash(path.join(folder,e.name)),bytes:fs.statSync(path.join(folder,e.name)).size}];}).sort((a,b)=>a.file.localeCompare(b.file));}
function packageMetadata(bytes){const value=JSON.parse(bytes);for(const key of ['private','scripts','devDependencies'])delete value[key];return JSON.stringify(value);}
const staged=files(stage);for(const item of staged){const bytes=extractFile(asar,item.file.split('/').join(path.sep));if(item.file==='package.json'){if(packageMetadata(bytes)!==packageMetadata(fs.readFileSync(path.join(root,item.file))))throw Error('Paketmetadaten weichen ab.');}else if(sha(bytes)!==item.sha256||item.sha256!==hash(path.join(root,item.file)))throw Error('ASAR-Abweichung: '+item.file);}
const wasm=listPackage(asar).filter(n=>n.endsWith('.wasm'));if(wasm.length!==1||sha(extractFile(asar,wasm[0].replace(/^[/\\]/,'')))!==hash(fileURLToPath(import.meta.resolve('manifold-3d/manifold.wasm'))))throw Error('Genau ein unveränderter Manifold-Kern erwartet.');
for(const name of ['LICENSE.txt','README.md','NETZIMPORT.md','KI-UND-NETZREPARATUR.md','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.copyFileSync(path.join(root,name),path.join(runtime,name));
const before=files(runtime),packagedProof=path.join(temp,'EXE-Abnahme-'+Date.now()),env={...process.env,FORMNARO_MINI_VERIFY_OUTPUT:packagedProof};delete env.ELECTRON_RUN_AS_NODE;fs.mkdirSync(packagedProof);const log=path.join(temp,'exe-'+Date.now()+'.log'),fd=fs.openSync(log,'wx');
const child=spawn(exe,['--mini-verify'],{env,windowsHide:true,stdio:['ignore',fd,fd]});const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});fs.closeSync(fd);if(code!==0)throw Error('EXE-Abnahme fehlgeschlagen: '+log);
const packaged=JSON.parse(fs.readFileSync(path.join(packagedProof,'result.json'),'utf8'));if(!packaged.ok||!packaged.packaged||packaged.checks.length<94||packaged.rendererErrors.length||packaged.networkRequests.length)throw Error('EXE-Abnahme unvollständig.');
for(const entry of packaged.manifest){if(entry.file==='package.json'){if(packageMetadata(extractFile(asar,'package.json'))!==packageMetadata(fs.readFileSync(path.join(root,'package.json'))))throw Error('EXE/Quellmetadaten weichen ab.');}else if(hash(path.join(root,entry.file))!==entry.sha256)throw Error('EXE/Quelle weichen ab: '+entry.file);}
if(JSON.stringify(before)!==JSON.stringify(files(runtime)))throw Error('Laufzeitdateien während Prüfung verändert.');
function sourceEntries(folder,prefix=''){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(e=>{if(e.isSymbolicLink())throw Error('Verknüpfung ausgeschlossen.');if(['node_modules','dist','dist-android','Daten-Mini','Bibliothek','work','.git','.gradle','build'].includes(e.name)||e.name.startsWith('work-')||e.name==='local.properties'||/\.(jks|keystore)$/i.test(e.name)||e.name.endsWith('.log')||e.name.startsWith('.env')||['ai-settings.json','ai-bridge.json'].includes(e.name))return [];const rel=prefix+e.name;return e.isDirectory()?sourceEntries(path.join(folder,e.name),rel+'/'):[[rel,new Uint8Array(fs.readFileSync(path.join(folder,e.name)))]];});}
const sourceMap=Object.fromEntries(sourceEntries(root)),sourceZip=path.join(out,`Formnaro-Mini-Quellen-${meta.version}.zip`);fs.writeFileSync(sourceZip,zipSync(sourceMap,{level:6}));
fs.copyFileSync(sourceProof,path.join(out,'Quellpruefung.json'));fs.copyFileSync(path.join(packagedProof,'result.json'),path.join(out,'EXE-Pruefung.json'));fs.copyFileSync(path.join(root,'work/unit-final.log'),path.join(out,'Geometriepruefung.txt'));
const report={ok:true,version:meta.version,runtime,exe,exeSha256:hash(exe),asarSha256:hash(asar),runtimeBytes:before.reduce((n,e)=>n+e.bytes,0),sourceChecks:proof.checks.length,exeChecks:packaged.checks.length,sourceProof,packagedProof,sourceZip,sourceSha256:hash(sourceZip),wasmCopies:wasm.length,sourceFiles:staged.length,initialLoadMs:packaged.initialLoadMs};fs.writeFileSync(path.join(out,'Abnahme.json'),JSON.stringify(report,null,2));
const zip=path.join(out,`Formnaro-Mini-v${meta.version}-Windows.zip`),entries=files(out).filter(e=>!e.file.endsWith('-Windows.zip')),map=Object.fromEntries(entries.map(e=>[e.file,new Uint8Array(fs.readFileSync(path.join(out,e.file)))]));fs.writeFileSync(zip,zipSync(map,{level:6}));const read=unzipSync(new Uint8Array(fs.readFileSync(zip)));if(Object.keys(read).length!==entries.length)throw Error('ZIP-Einträge fehlen.');for(const item of entries)if(sha(read[item.file])!==item.sha256)throw Error('ZIP-Hashabweichung: '+item.file);
const receipt={...report,zip,zipSha256:hash(zip),zipBytes:fs.statSync(zip).size,zipEntries:entries.length};fs.writeFileSync(path.join(temp,'Ergebnis.json'),JSON.stringify(receipt,null,2));fs.writeFileSync(zip+'.sha256',receipt.zipSha256+'  '+path.basename(zip)+'\n');console.log(JSON.stringify(receipt,null,2));
