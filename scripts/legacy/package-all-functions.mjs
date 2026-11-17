import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {packager} from '@electron/packager';
import {extractFile,listPackage,statFile} from '@electron/asar';
import {integrationManifest} from './stl-integration-manifest.mjs';
import {surfaceSuites,unitSuites} from './all-functions-catalog.mjs';

const [mode,sourceFile,packagedFile]=process.argv.slice(2),version=JSON.parse(fs.readFileSync('package.json','utf8')).version;
if(version!=='0.49.2'||!['build','audit'].includes(mode)||!sourceFile)throw Error('Expected build|audit <source summary> [packaged summary], version 0.49.2');
const task=path.resolve('F:/Formnaro-Buildtemp/Gesamtpruefung-0.49.2'),release=path.resolve('F:/Formnaro-Ausgaben/Gesamtpruefung-v0.49.2'),stage=path.join(task,'stage'),runtime=path.join(release,'Formnaro-win32-x64'),checks=path.resolve('work/gesamtpruefung');
const sha=v=>createHash('sha256').update(v).digest('hex'),hash=file=>sha(fs.readFileSync(file));
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
function files(directory,prefix=''){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(e=>{if(e.isSymbolicLink())throw Error('Symlink in public files');const file=prefix+e.name;return e.isDirectory()?files(path.join(directory,e.name),file+'/'):[{file,sha256:hash(path.join(directory,e.name))}];}).sort((a,b)=>a.file.localeCompare(b.file));}
function proof(file,kind,{candidate=false}={}){
 const p=read(file);if(p.version!==version||p.mode!==kind||p.exploratory||p.sourceChanged)throw Error('Wrong version, exploratory or changed source proof');
 if(JSON.stringify(p.sourceManifest)!==JSON.stringify(integrationManifest()))throw Error('Source manifest changed since '+file);
 const expected=[...(kind==='source'?unitSuites().map(s=>s.id):[]),...surfaceSuites.map(s=>s.id),'workflow-reopen','recovery-read'];
 for(const id of expected)if(!p.results.some(r=>r.id===id))throw Error('Missing suite '+id);
 for(const r of p.results){if(!r.ok&&!(candidate&&r.status==='incomplete-resource-reserve'))throw Error('Failed or incomplete suite '+r.id);if(r.log&&hash(r.log)!==r.logSha256||r.report&&hash(r.report)!==r.reportSha256)throw Error('Evidence changed '+r.id);if(r.expectedForcedTermination&&(!r.crashCheckpoint||hash(r.crashCheckpoint)!==r.crashCheckpointSha256))throw Error('Invalid controlled crash');}
 if(!candidate&&!p.ok)throw Error('Passing final proof required');return p;
}
function preserve(){const b=read(path.join(checks,'baseline.json')),previous=b.previousBuild;for(const f of previous.runtimeFiles)if(hash(path.join(previous.runtime,f.file))!==f.sha256)throw Error('Previous original runtime changed: '+f.file);return {version:previous.version,files:previous.runtimeFiles.length,exeSha256:hash(path.join(previous.runtime,'Formnaro.exe')),asarSha256:hash(path.join(previous.runtime,'resources/app.asar'))};}
function developmentOnlyChanges(build,source){
 const allowed=new Set(['scripts/all-functions-catalog.mjs','scripts/package-all-functions.mjs']),before=new Map(build.sourceManifest.map(f=>[f.file,f.sha256]));
 if(before.size!==source.sourceManifest.length)throw Error('Source file set changed after build');
 const changes=[];for(const f of source.sourceManifest){if(!before.has(f.file))throw Error('New source after build');if(before.get(f.file)!==f.sha256){if(!allowed.has(f.file)||build.stageFiles.some(s=>s.file===f.file))throw Error('Application or staged source changed after build: '+f.file);changes.push({file:f.file,beforeSha256:before.get(f.file),sha256:f.sha256,scope:'development harness only; not staged or included in the runtime'});}}
 return changes;
}
fs.mkdirSync(checks,{recursive:true});
if(mode==='build'){
 const source=proof(sourceFile,'source',{candidate:true}),preserved=preserve();if(fs.existsSync(release)||fs.existsSync(stage))throw Error('New release/stage must not already exist');fs.mkdirSync(stage,{recursive:true});
 for(const name of ['dist','backend','electron.cjs','preload.cjs','package.json','LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt','licenses','ai','docs'])fs.cpSync(name,path.join(stage,name),{recursive:true,errorOnExist:true,force:false});
 fs.mkdirSync(path.join(stage,'scripts'));fs.copyFileSync('scripts/offlinecad_ai.py',path.join(stage,'scripts/offlinecad_ai.py'));
 const stageFiles=files(stage);process.env.TEMP=task;process.env.TMP=task;
 await packager({tmpdir:task,dir:stage,name:'Formnaro',platform:'win32',arch:'x64',out:release,asar:true,prune:false,overwrite:false,electronVersion:JSON.parse(fs.readFileSync('package.json')).devDependencies.electron,appVersion:version,win32metadata:{CompanyName:'Andreas Klisch',ProductName:'Formnaro',FileDescription:'Gemeinsame Funktions- und Stabilitätsprüfung'}});
 fs.cpSync('converter/runtime-v010',path.join(runtime,'resources/converter'),{recursive:true,errorOnExist:true,force:false});for(const name of ['README.md','provenance.json'])fs.copyFileSync('converter/'+name,path.join(runtime,'resources/converter',name));
 for(const name of ['LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.copyFileSync(name,path.join(runtime,name));for(const name of fs.readdirSync('docs').filter(n=>n.endsWith('.md')))fs.copyFileSync('docs/'+name,path.join(runtime,name));
 fs.mkdirSync(path.join(runtime,'scripts'));fs.copyFileSync('scripts/offlinecad_ai.py',path.join(runtime,'scripts/offlinecad_ai.py'));fs.cpSync('ai',path.join(runtime,'ai'),{recursive:true,errorOnExist:true,force:false});
 const report={version,candidate:true,sourceSummary:path.resolve(sourceFile),sourceSummarySha256:hash(sourceFile),sourceManifest:source.sourceManifest,stage,stageFiles,release,runtime,runtimeFiles:files(runtime),preserved,exeSha256:hash(path.join(runtime,'Formnaro.exe')),asarSha256:hash(path.join(runtime,'resources/app.asar'))};
 fs.writeFileSync(path.join(checks,'build.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({runtime,sourceComplete:source.ok}));
}else{
 const source=proof(sourceFile,'source'),packaged=proof(packagedFile,'packaged'),build=read(path.join(checks,'build.json')),preserved=preserve();
 const developerOnlyChanges=developmentOnlyChanges(build,source);
 for(const file of [sourceFile,packagedFile]){const independent=read(path.join(path.dirname(path.resolve(file)),'independent-files.json'));if(!independent.ok||independent.summarySha256!==hash(file)||independent.results.length!==4)throw Error('Fresh independent physical-file proof required');}
 if(JSON.stringify(files(runtime))!==JSON.stringify(build.runtimeFiles)||JSON.stringify(files(stage))!==JSON.stringify(build.stageFiles))throw Error('Stage/runtime changed');
 if(packaged.exeSha256!==build.exeSha256||packaged.asarSha256!==build.asarSha256)throw Error('Wrong EXE proof');
 const asar=path.join(runtime,'resources/app.asar'),names=listPackage(asar).map(n=>n.replace(/^[\\/]+/,'')).filter(n=>!statFile(asar,n).files).map(n=>n.split(path.sep).join('/')).sort();
 const baseline=read(path.join(checks,'baseline.json')).previousBuild,oldAsar=path.join(baseline.runtime,'resources/app.asar');
 const wasm=archive=>listPackage(archive).filter(n=>n.endsWith('.wasm')).map(n=>({name:n.split(path.sep).join('/'),sha256:sha(extractFile(archive,n.replace(/^[\\/]+/,'')))})).sort((a,b)=>a.name.localeCompare(b.name));
 const kernels=wasm(asar);if(kernels.length!==2||JSON.stringify(kernels)!==JSON.stringify(wasm(oldAsar)))throw Error('Previously accepted native/mesh kernels changed');
 const converterFiles=baseline.runtimeFiles.filter(f=>f.file.startsWith('resources/converter/'));for(const f of converterFiles)if(hash(path.join(runtime,f.file))!==f.sha256)throw Error('Converter component changed: '+f.file);
 if(JSON.stringify(names)!==JSON.stringify(build.stageFiles.map(f=>f.file).sort()))throw Error('ASAR file set differs');
 for(const f of build.stageFiles){const bytes=extractFile(asar,f.file.split('/').join(path.sep));if(f.file==='package.json'){const actual=JSON.parse(bytes),expected=read(path.join(stage,f.file));for(const key of ['private','scripts','devDependencies'])delete expected[key];if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('ASAR metadata differs');}else if(sha(bytes)!==f.sha256)throw Error('ASAR differs: '+f.file);}
 const report={ok:true,version,sourceSummary:path.resolve(sourceFile),packagedSummary:path.resolve(packagedFile),sourceSummarySha256:hash(sourceFile),packagedSummarySha256:hash(packagedFile),sourceCount:source.count,packagedCount:packaged.count,sourceManifest:source.sourceManifest,buildSourceManifestSha256:sha(JSON.stringify(build.sourceManifest)),developerOnlyChanges,runtimeFiles:build.runtimeFiles.length,asarFiles:names.length,unchangedKernels:kernels,unchangedConverterFiles:converterFiles.length,exeSha256:build.exeSha256,asarSha256:build.asarSha256,preserved};fs.writeFileSync(path.join(checks,'final-audit.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ok:true,sourceCount:report.sourceCount,packagedCount:report.packagedCount,runtimeFiles:report.runtimeFiles}));
}
