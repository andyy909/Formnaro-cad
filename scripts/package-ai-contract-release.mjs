// Frozen AI release containing all eight verified CAD feature packages. No installation.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {packager} from '@electron/packager';
import {extractFile,listPackage} from '@electron/asar';
import {integrationManifest} from './stl-integration-manifest.mjs';
const root=process.cwd(),meta=JSON.parse(fs.readFileSync('package.json')),number=8,mode=process.argv[2]??'build';
if(!Number.isInteger(number)||number<1||number>8)throw Error('CAD package 1–8 required');
const work=path.join(root,'work','ai-contract','release'),release=path.join(root,`release-formnaro-ai-contract-v${meta.version}`),runtime=path.join(release,'Formnaro-win32-x64'),stage=path.join(work,'stage');
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex'),read=file=>JSON.parse(fs.readFileSync(path.join(work,file)));
function entries(dir,relative=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{if(e.isSymbolicLink())throw Error('Package symlink');const name=relative+e.name;return e.isDirectory()?entries(path.join(dir,e.name),name+'/'):[{name,file:path.join(dir,e.name)}];});}
function sourceProof(){const p=read('source-ui/result.json');if(!p.ok||p.version!==meta.version||p.checks.length<15||p.errors.length||p.external.length||JSON.stringify(p.sourceManifest)!==JSON.stringify(integrationManifest()))throw Error('Current source overview acceptance required');
 if(number>=2&&(!p.placement?.ok||p.placement.checks.length<14))throw Error('Current native support acceptance required');
 if(number>=3&&(!p.references?.ok||p.references.checks.length<12))throw Error('Native reference source acceptance required');
 if(number>=4&&(!p.sketch?.ok||p.sketch.checks.length<14))throw Error('Native sketch source acceptance required');
 if(number>=5&&(!p.partition?.ok||p.partition.checks.length<16))throw Error('Native partition source acceptance required');
 if(number>=6&&(!p.extraction?.ok||p.extraction.checks.length<16))throw Error('Native extraction source acceptance required');
 if(number>=7&&(!p.annotations?.ok||p.annotations.checks.length<16))throw Error('Native annotations source acceptance required');
 if(number>=8&&(!p.performance?.ok||p.performance.checks.length<12||p.performance.metrics.idle.draws!==0||p.performance.metrics.idle.updates!==0||p.performance.metrics.idle.ticks!==0))throw Error('Native CAD performance source acceptance required');
 for(const name of ['node-overview','regressions','native-foundation']){const log=fs.readFileSync(path.join(work,name+'.log'),'utf8');if(!/^# fail 0$/m.test(log)||!/^# tests \d+$/m.test(log))throw Error('Completed passing check required: '+name);}return p;}
if(mode==='build'){
 sourceProof();for(const fixture of ['chat','models']){const p=read(fixture+'/result.json');if(!p.ok||p.errors.length||p.external.length||p.checks.length<(fixture==='chat'?19:15))throw Error('AI desktop acceptance required: '+fixture);}if(fs.existsSync(release)||fs.existsSync(stage))throw Error('Milestone already exists; preserve it and choose a fresh output');fs.mkdirSync(stage,{recursive:true});
 for(const name of ['dist','backend','electron.cjs','preload.cjs','package.json','LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt','licenses','ai','docs'])fs.cpSync(name,path.join(stage,name),{recursive:true,errorOnExist:true,force:false});
 fs.mkdirSync(path.join(stage,'scripts'));fs.copyFileSync('scripts/offlinecad_ai.py',path.join(stage,'scripts/offlinecad_ai.py'));
 const pins=JSON.parse(fs.readFileSync('converter/provenance.json'));if(sha('converter/runtime-v010/Formnaro-Konverter.exe')!==pins.headlessExeSha256)throw Error('Converter pin changed');
 const manifest=integrationManifest(),stageFiles=entries(stage).map(e=>({name:e.name,sha256:sha(e.file)}));
 const packed=await packager({dir:stage,name:'Formnaro',platform:'win32',arch:'x64',out:release,asar:true,prune:false,overwrite:false,electronVersion:meta.devDependencies.electron,appVersion:meta.version,appCopyright:`Copyright (c) 2026 ${meta.author}`,win32metadata:{CompanyName:meta.author,ProductName:'Formnaro',FileDescription:meta.description}});
 if(packed.length!==1)throw Error('Unexpected package count');
 fs.cpSync('converter/runtime-v010',path.join(runtime,'resources/converter'),{recursive:true,errorOnExist:true,force:false});for(const name of ['README.md','provenance.json'])fs.copyFileSync('converter/'+name,path.join(runtime,'resources/converter',name));
 for(const name of ['LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.copyFileSync(name,path.join(runtime,name));fs.cpSync('ai',path.join(runtime,'ai'),{recursive:true});fs.mkdirSync(path.join(runtime,'scripts'));fs.copyFileSync('scripts/offlinecad_ai.py',path.join(runtime,'scripts/offlinecad_ai.py'));
 fs.copyFileSync('docs/KI-ACHSENMASSE-UND-FEHLER.md',path.join(runtime,'KI-ACHSENMASSE-UND-FEHLER.md'));
 fs.copyFileSync('docs/CAD-KI-DENKSTUFEN-UND-VERBRAUCH.md',path.join(runtime,'Anleitung-KI.md'));fs.copyFileSync('docs/DEEPSEEK-CAD-VERGLEICH.md',path.join(runtime,'DeepSeek-Vergleich.md'));
 if(number===8){fs.copyFileSync('docs/CAD-DARSTELLUNG-UND-LEISTUNG.md',path.join(runtime,'Anleitung-Paket8.md'));fs.copyFileSync('docs/CAD-PAKETE-UEBERSICHT.md',path.join(runtime,'Pakete-und-Anleitungen.md'));}
 if(number===7)fs.copyFileSync('docs/CAD-KI-MARKIERUNGEN-UND-MODELLBILD.md',path.join(runtime,'CAD-KI-MARKIERUNGEN-UND-MODELLBILD.md'));
 if(number===6)fs.copyFileSync('docs/CAD-KOERPER-HERAUSLOESEN.md',path.join(runtime,'CAD-KOERPER-HERAUSLOESEN.md'));
 if(number===1)fs.copyFileSync('docs/CAD-ISOLATION-UND-MINIATUREN.md',path.join(runtime,'Anleitung-Paket1.md'));
 if(number===2)fs.copyFileSync('docs/CAD-AUF-FLAECHE-LEGEN.md',path.join(runtime,'Anleitung-Paket2.md'));
 if(number===3)fs.copyFileSync('docs/CAD-BEZUGSPUNKTE-UND-BOHRUNGEN.md',path.join(runtime,'Anleitung-Paket3.md'));
 if(number===4)fs.copyFileSync('docs/CAD-SKIZZEN-UND-MASSFORMELN.md',path.join(runtime,'Anleitung-Paket4.md'));
 if(number===5)fs.copyFileSync('docs/CAD-KOERPER-MIT-EBENE-TEILEN.md',path.join(runtime,'Anleitung-Paket5.md'));
 fs.writeFileSync(path.join(work,'build.json'),JSON.stringify({version:meta.version,number,manifest,stageFiles,runtime,exeSha256:sha(path.join(runtime,'Formnaro.exe')),asarSha256:sha(path.join(runtime,'resources/app.asar')),converterSha256:sha(path.join(runtime,'resources/converter/Formnaro-Konverter.exe'))},null,2));console.log(runtime);
}else if(mode==='audit'){
 const b=read('build.json'),p=read('packaged/result.json');if(!p.ok||p.appVersion!==meta.version||p.checks.length<25||!p.overview?.ok||p.overview.checks.length<15)throw Error('Actual EXE native/overview acceptance required');
 if(number>=2&&(!p.placement?.ok||p.placement.checks.length<14))throw Error('Actual EXE support acceptance required');
 if(number>=3&&(!p.references?.ok||p.references.checks.length<12))throw Error('Actual EXE reference acceptance required');
 if(number>=4&&(!p.sketch?.ok||p.sketch.checks.length<14))throw Error('Actual EXE sketch acceptance required');
 if(number>=5&&(!p.partition?.ok||p.partition.checks.length<16))throw Error('Actual EXE partition acceptance required');
 if(number>=6&&(!p.extraction?.ok||p.extraction.checks.length<16))throw Error('Actual EXE extraction acceptance required');
 if(number>=7&&(!p.annotations?.ok||p.annotations.checks.length<16))throw Error('Actual EXE annotations acceptance required');
 if(number>=8&&(!p.performance?.ok||p.performance.checks.length<12||p.performance.metrics.idle.draws!==0||p.performance.metrics.idle.updates!==0||p.performance.metrics.idle.ticks!==0))throw Error('Actual EXE performance acceptance required');
 if(JSON.stringify(b.manifest)!==JSON.stringify(integrationManifest()))throw Error('Source changed after freeze');
 for(const [key,file]of [['exeSha256','Formnaro.exe'],['asarSha256','resources/app.asar'],['converterSha256','resources/converter/Formnaro-Konverter.exe']])if(sha(path.join(runtime,file))!==b[key])throw Error('Runtime changed: '+file);
 const asar=path.join(runtime,'resources/app.asar');let verified=0;
 for(const e of b.stageFiles){const bytes=extractFile(asar,e.name.split('/').join(path.sep));if(e.name==='package.json'){const actual=JSON.parse(bytes),expected=JSON.parse(fs.readFileSync(path.join(stage,e.name)));for(const key of ['private','scripts','devDependencies'])delete expected[key];if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Packaged metadata differs');}else if(createHash('sha256').update(bytes).digest('hex')!==e.sha256)throw Error('Stage mismatch: '+e.name);verified++;}
 if(listPackage(asar).filter(n=>n.endsWith('.wasm')).length!==1)throw Error('Expected only the native CAD WASM');
 const converterFiles=entries('converter/runtime-v010').map(e=>({file:'resources/converter/'+e.name,sha256:sha(e.file)}));for(const e of converterFiles)if(sha(path.join(runtime,e.file))!==e.sha256)throw Error('Converter runtime mismatch: '+e.file);
 const result={ok:true,...b,asarEntriesVerified:verified,converterFiles,nativeChecks:p.checks.length,overviewChecks:p.overview.checks.length,placementChecks:p.placement?.checks.length??0,referenceChecks:p.references?.checks.length??0,sketchChecks:p.sketch?.checks.length??0,partitionChecks:p.partition?.checks.length??0,extractionChecks:p.extraction?.checks.length??0,annotationChecks:p.annotations?.checks.length??0,performanceChecks:p.performance?.checks.length??0,proofs:['node-overview.log','regressions.log','native-foundation.log','source-ui/result.json','packaged/result.json'].map(file=>({file,sha256:sha(path.join(work,file))}))};fs.writeFileSync(path.join(work,'final-audit.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({ok:true,version:meta.version,asarEntriesVerified:verified,nativeChecks:p.checks.length,overviewChecks:p.overview.checks.length}));
}else throw Error('Use build or audit');
