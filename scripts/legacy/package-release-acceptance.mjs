// Package 13: first complete common-program acceptance, separate from old releases.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {packager} from '@electron/packager';
import {extractFile,listPackage,statFile} from '@electron/asar';
import {integrationManifest} from './stl-integration-manifest.mjs';

const root=process.cwd(),meta=JSON.parse(fs.readFileSync('package.json','utf8'));
const work=path.join(root,'work/release-acceptance/checks'),mode=process.argv[2]??'build';
if(meta.version!=='0.32.0')throw Error('Package 13 requires version 0.32.0');
// Fail closed until both real workflow phases have completed against final bytes.
const workflowPhase1Minimum=32,workflowReopenMinimum=37;
const release=path.join(root,'release-formnaro-gesamtabnahme-v'+meta.version);
const runtime=path.join(release,'Formnaro-win32-x64');
const stage=path.join(root,'work/release-acceptance/package-stage-'+meta.version);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hash=file=>sha(fs.readFileSync(file));
const read=name=>JSON.parse(fs.readFileSync(path.join(work,name),'utf8'));
const artifactScripts=new Set(['scripts/package-release-acceptance.mjs','scripts/archive-release-acceptance.py']);
const comparisonRule='cad-stats-12-significant-digits-v1';
// Finish these scripts before the final source proof. No public-file exemptions.
const productManifest=manifest=>manifest;
const ordinarySuites=[['unified',61,61],['transfer',39,39],['copy',36,36],['tools',45,45],['workspace',36,36],['mesh',33,33],['cad',137,46],['ai',24,24],['converter',75,74]];
const unitSuites=[['workflow-settings.log',10],['mixed-ai.log',21],['native-transfer-final.log',10],['regressions.log',116],['native-copy.log',10],['foundation.log',45],['mesh-integration.log',20],['shared-workspace.log',23],['tool-parity.log',26],['converter-foundation.log',13],['ai.log',25],['shared-ai.log',8],['native-foundation.log',181],['svg-export.log',4],['export-dialog.log',4]];

function files(dir,rel=''){
 return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
  if(e.isSymbolicLink())throw Error('Symlink in package: '+rel+e.name);
  const name=rel+e.name;
  return e.isDirectory()?files(path.join(dir,e.name),name+'/'):[{file:name,sha256:hash(path.join(dir,e.name))}];
 }).sort((a,b)=>a.file.localeCompare(b.file));
}
function validResult(p,name,min){
 if(!Number.isSafeInteger(min)||min<1)throw Error('Acceptance count is not finalized: '+name);
 if(!p.ok||(p.appVersion??p.version)!==meta.version||!Array.isArray(p.checks)||p.checks.length<min||(p.errors??[]).length||(p.external??[]).length)throw Error('Passing current application proof required: '+name);
 if(p.cloudRequests!==undefined&&p.cloudRequests!==0)throw Error('Cloud request in isolated acceptance: '+name);
}
function processProof(name,report,{manifest=null,build=null}={}){
 const sidecar='run-'+name,h=read(sidecar),digest=hash(path.join(work,name));
 if(h.ok!==true||h.exitCode!==0||h.reportFile!==name||h.reportSha256!==digest||!h.applicationReport||hash(h.applicationReport)!==digest)throw Error('Unchanged raw report and actual successful process exit required: '+sidecar);
 if(manifest&&h.sourceManifestSha256!==sha(JSON.stringify(report.sourceManifest)))throw Error('Source process manifest identity differs: '+sidecar);
 if(build&&(h.exeSha256!==build.exeSha256||h.asarSha256!==build.asarSha256))throw Error('Independent process executable hashes required: '+sidecar);
 return {[sidecar]:hash(path.join(work,sidecar))};
}
function projectDigests(file){
 const project=JSON.parse(fs.readFileSync(file,'utf8'));
 if(project.version!==8||!Array.isArray(project.nodes))throw Error('Physical workflow project must be mixed Format 8: '+file);
 const normalize=value=>{
  if(typeof value==='number'){
   if(!Number.isFinite(value))throw Error('Nonfinite native CAD measurement: '+file);
   return Number(value.toPrecision(12));
  }
  if(Array.isArray(value))return value.map(normalize);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,n])=>[key,normalize(n)]));
  return value;
 };
 const digest=node=>{
  const copy=JSON.parse(JSON.stringify(node));
  const visit=current=>{
   if(current.kind==='cad'&&current.stats!==undefined)current.stats=normalize(current.stats);
   if(Array.isArray(current.children))current.children.forEach(visit);
  };
  visit(copy);
  return sha(JSON.stringify(copy));
 };
 return {project,digests:Object.fromEntries(project.nodes.map(node=>[node.id,digest(node)]))};
}
function workflowProofs(prefix,manifest=null,build=null){
 const proofs={},reports={};
 for(const [phase,min]of [['phase1',workflowPhase1Minimum],['reopen',workflowReopenMinimum]]){
  const name=prefix+'-workflow-'+phase+'.json',p=read(name);
  validResult(p,name,min);
  if(p.comparisonRule!==comparisonRule)throw Error('Unexpected workflow comparison rule: '+name);
  if(p.isolatedProfile!==true||typeof p.verificationProfile!=='string'||typeof p.verificationDataPath!=='string'||!path.isAbsolute(p.verificationProfile)||!path.isAbsolute(p.verificationDataPath))throw Error('Isolated workflow profile and data paths required: '+name);
  if(manifest&&JSON.stringify(productManifest(p.sourceManifest))!==JSON.stringify(productManifest(manifest)))throw Error('Workflow source bytes changed: '+name);
  if(build&&(p.exeSha256!==build.exeSha256||p.asarSha256!==build.asarSha256))throw Error('Workflow executable identity differs: '+name);
  if(p.package13!==true||p.phase!==(phase==='phase1'?'build-and-save':'reopen-and-export'))throw Error('Workflow phase identity differs: '+name);
  for(const [file,digest]of [[p.projectFile,p.projectSha256],[p.handshake,p.handshakeSha256]])if(!file||!/^[a-f0-9]{64}$/.test(digest??'')||hash(file)!==digest)throw Error('Physical saved workflow bytes differ: '+name);
  if(!p.objectDigests||!Object.keys(p.objectDigests).length)throw Error('Saved object digests missing: '+name);
  if(JSON.stringify(projectDigests(p.projectFile).digests)!==JSON.stringify(p.objectDigests))throw Error('Physical workflow object bytes differ: '+name);
  const handoff=JSON.parse(fs.readFileSync(p.handshake,'utf8'));
  if(handoff.format!=='FormnaroReleaseAcceptance'||handoff.version!==1||handoff.comparisonRule!==comparisonRule||handoff.projectFile!==p.projectFile||handoff.projectSha256!==p.projectSha256||JSON.stringify(handoff.objectDigests)!==JSON.stringify(p.objectDigests))throw Error('Workflow handoff does not identify the physical saved project: '+name);
  reports[phase]=p;proofs[name]=hash(path.join(work,name));
  Object.assign(proofs,processProof(name,p,{manifest,build}));
 }
 const first=reports.phase1,reopen=reports.reopen;
 if(first.projectFile!==reopen.projectFile||first.projectSha256!==reopen.projectSha256||first.handshake!==reopen.handshake||first.handshakeSha256!==reopen.handshakeSha256||JSON.stringify(first.objectDigests)!==JSON.stringify(reopen.objectDigests)||reopen.originalProjectUnchanged!==true)throw Error('Reopen is not bound to the first process saved project: '+prefix);
 if(path.resolve(first.verificationProfile)===path.resolve(reopen.verificationProfile)||path.resolve(first.verificationDataPath)===path.resolve(reopen.verificationDataPath))throw Error('Reopen must use a fresh independent profile and portable data directory: '+prefix);
 if(!Array.isArray(reopen.exports)||JSON.stringify(reopen.exports.map(e=>String(e.format).toLowerCase()).sort())!==JSON.stringify(['3mf','glb','obj','step','stl','svg']))throw Error('All six workflow export formats required: '+prefix);
 for(const e of reopen.exports)if(!e.file||hash(e.file)!==e.sha256||fs.statSync(e.file).size!==e.bytes||!e.bytes)throw Error('Physical workflow export differs: '+prefix);
 if(!reopen.roundtripFile||hash(reopen.roundtripFile)!==reopen.roundtripSha256)throw Error('Reopened project roundtrip bytes differ: '+prefix);
 if(JSON.stringify(projectDigests(reopen.roundtripFile).digests)!==JSON.stringify(first.objectDigests))throw Error('Reopened Save As did not retain the original objects: '+prefix);
 if(!reopen.continuationFile||hash(reopen.continuationFile)!==reopen.continuationSha256||reopen.continuationFile===first.projectFile||reopen.continuationFile===reopen.roundtripFile)throw Error('Continued edited project must use a new physical path: '+prefix);
 const continued=projectDigests(reopen.continuationFile);
 if(JSON.stringify(continued.digests)!==JSON.stringify(reopen.continuationObjectDigests)||JSON.stringify(Object.keys(continued.digests))!==JSON.stringify(Object.keys(first.objectDigests)))throw Error('Continued project object identities differ: '+prefix);
 const changed=continued.project.nodes.filter(node=>continued.digests[node.id]!==first.objectDigests[node.id]);
 if(!changed.some(node=>node.kind==='cad')||!changed.some(node=>node.kind==='mesh'))throw Error('Continued project must preserve actual native CAD and mesh edits: '+prefix);
 return proofs;
}
function sourceProofs(){
 const manifest=integrationManifest(),proofs={},unitCounts={};
 for(const [suite,min]of ordinarySuites){
  const name='source-'+suite+'.json',p=read(name);
  validResult(p,name,min);
  if(JSON.stringify(productManifest(p.sourceManifest))!==JSON.stringify(productManifest(manifest)))throw Error('Current source UI proof required: '+name);
  proofs[name]=hash(path.join(work,name));
  Object.assign(proofs,processProof(name,p,{manifest}));
 }
 Object.assign(proofs,workflowProofs('source',manifest));
 for(const [name,min]of unitSuites){
  const log=fs.readFileSync(path.join(work,name),'utf8'),count=Number(log.match(/^# tests (\d+)$/m)?.[1]);
  if(!Number.isSafeInteger(count)||count<min||!/^# fail 0$/m.test(log)||!/^# skipped 0$/m.test(log)||!/^# cancelled 0$/m.test(log))throw Error('Passing fresh unit proof required: '+name);
  proofs[name]=hash(path.join(work,name));unitCounts[name]=count;
 }
 return {manifest,proofs,unitCounts,uiManifestExclusions:[]};
}
function preservation(){
 const previous=JSON.parse(fs.readFileSync('work/unified-workflows/checks/build.json','utf8'));
 // A used application can gain personal Daten/Layouts/Projekte directories.
 // Inspect only original frozen program paths, never enumerate the old checkout.
 for(const e of previous.runtimeFiles)if(hash(path.join(previous.runtime,e.file))!==e.sha256)throw Error('Accepted 0.31.0 program file changed: '+e.file);
 for(const [name,digest]of [
  ['output/Formnaro-Gemeinsame-Ablaeufe-v0.31.0.zip','2f9bca4b0544e917e531b65e34ad37535afa8f16d4b44dcd2868dc41ca397bde'],
  ['release-formnaro-gemeinsame-ablaeufe-v0.31.0/Formnaro-Quellcode-v0.31.0.zip','c65acf64ccdeef6ce3d04777d342114b0e80062cb4a56352ac0e3481c6ff6c35'],
  ['../stl too step/dist/STL-zu-STEP-v0.12-dev-api-speicher/STL-zu-STEP.exe','f6436a8ecf6c79173047e24d7fc9c66663fd5a85c9c2bcb91db7e719506e06cd'],
  ['../stl too step/STL-zu-STEP-Windows-v0.12-dev-api-speicher.zip','851f5394707092a68cd4d99b484f0660743703f4e44e80dbccc3b67cc434dfad']
 ])if(hash(name)!==digest)throw Error('Protected previous output changed: '+name);
 const converterFiles=files('converter/runtime-v010').map(e=>({...e,file:'resources/converter/'+e.file}));
 if(JSON.stringify(converterFiles)!==JSON.stringify([...previous.preserved.converterFiles].sort((a,b)=>a.file.localeCompare(b.file))))throw Error('Converter runtime changed');
 const origin=JSON.parse(fs.readFileSync('converter/provenance.json','utf8'));
 if(hash('converter/bridge.py')!==origin.bridgeSourceSha256)throw Error('Converter bridge changed');
 for(const e of origin.engineSourceFiles)if(hash(path.join('converter',e.file))!==e.sha256)throw Error('Converter source changed');
 const wasm=integrationManifest().filter(e=>e.file.startsWith('dist/')&&e.file.endsWith('.wasm'));
 const old=previous.manifest.filter(e=>e.file.startsWith('dist/')&&e.file.endsWith('.wasm'));
 if(JSON.stringify(wasm)!==JSON.stringify(old)||wasm.length!==2)throw Error('Native kernels changed');
 return {ok:true,previousVersion:previous.version,previousRuntimeFiles:previous.runtimeFiles.length,previousRuntimeScope:'Frozen original program files; later user directories excluded',previousArchivesUnchanged:true,standaloneConverterUnchanged:true,converterFiles,wasm};
}
if(mode==='build'){
 const proofs=sourceProofs(),preserved=preservation();
 if(fs.existsSync(stage)||fs.existsSync(release))throw Error('Output already exists');
 fs.mkdirSync(stage,{recursive:true});
 for(const name of ['dist','backend','electron.cjs','preload.cjs','package.json','LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt','licenses','ai','docs'])fs.cpSync(name,path.join(stage,name),{recursive:true,errorOnExist:true,force:false});
 fs.mkdirSync(path.join(stage,'scripts'));fs.copyFileSync('scripts/offlinecad_ai.py',path.join(stage,'scripts/offlinecad_ai.py'));
 const stageFiles=files(stage),packed=await packager({dir:stage,name:'Formnaro',platform:'win32',arch:'x64',out:release,asar:true,prune:false,overwrite:false,electronVersion:meta.devDependencies.electron,appVersion:meta.version,appCopyright:`Copyright (c) 2026 ${meta.author}`,win32metadata:{CompanyName:meta.author,ProductName:'Formnaro',FileDescription:'Gemeinsames CAD-, Netz- und Konverterprogramm'}});
 if(packed.length!==1)throw Error('Unexpected package count');
 fs.cpSync('converter/runtime-v010',path.join(runtime,'resources/converter'),{recursive:true,errorOnExist:true,force:false});
 for(const name of ['README.md','provenance.json'])fs.copyFileSync('converter/'+name,path.join(runtime,'resources/converter',name));
 for(const name of ['LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.copyFileSync(name,path.join(runtime,name));
 for(const name of ['GESAMTABNAHME-FORMNARO','GEMEINSAME-DATEIEN-EINSTELLUNGEN-KI','NETZ-DIREKT-IN-CAD','CAD-ALS-NETZKOPIE','GEMEINSAME-KI-ANBINDUNG','GEMEINSAMER-KONVERTER','EIGENSCHAFTEN-UND-WERKZEUGE','GEMEINSAME-ARBEITSFLAECHE','NETZ-WERKZEUGE','GEMEINSAME-PROJEKTGRUNDLAGE'])fs.copyFileSync('docs/'+name+'.md',path.join(runtime,name+'.md'));
 fs.writeFileSync(path.join(work,'build.json'),JSON.stringify({version:meta.version,runtime,stage,...proofs,preserved,stageFiles,runtimeFiles:files(runtime),exeSha256:hash(path.join(runtime,'Formnaro.exe')),asarSha256:hash(path.join(runtime,'resources/app.asar'))},null,2));
 console.log(runtime);
}else if(mode==='audit'){
 const b=read('build.json'),current=sourceProofs(),preserved=preservation(),packagedProofs={};
 if(JSON.stringify(productManifest(current.manifest))!==JSON.stringify(productManifest(b.manifest))||JSON.stringify(current.proofs)!==JSON.stringify(b.proofs)||JSON.stringify(files(b.runtime))!==JSON.stringify(b.runtimeFiles))throw Error('Frozen source, proof or runtime changed');
 const asar=path.join(b.runtime,'resources/app.asar');
 const entries=listPackage(asar).map(n=>n.replace(/^[\\/]+/,'')).filter(n=>!statFile(asar,n).files).map(n=>n.split(path.sep).join('/')).sort();
 if(JSON.stringify(entries)!==JSON.stringify(b.stageFiles.map(e=>e.file).sort()))throw Error('ASAR file set changed');
 for(const e of b.stageFiles){
  const bytes=extractFile(asar,e.file.split('/').join(path.sep));
  if(e.file==='package.json'){
   const actual=JSON.parse(bytes),expected=JSON.parse(fs.readFileSync(path.join(b.stage,e.file),'utf8'));
   for(const key of ['private','scripts','devDependencies'])delete expected[key];
   if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('ASAR metadata changed');
  }else if(sha(bytes)!==e.sha256)throw Error('ASAR bytes changed: '+e.file);
 }
 for(const [suite,,min]of ordinarySuites){
  const name='packaged-'+suite+'.json',p=read(name);
  validResult(p,name,min);
  if(p.exeSha256!==b.exeSha256||p.asarSha256!==b.asarSha256)throw Error('Actual EXE proof required: '+name);
  packagedProofs[name]=hash(path.join(work,name));
  Object.assign(packagedProofs,processProof(name,p,{build:b}));
 }
 Object.assign(packagedProofs,workflowProofs('packaged',null,b));
 const native=read('packaged-cad.json');
 for(const suite of ['overview','placement','references','sketch','partition','extraction','annotations','performance','exchange'])if(!native[suite]?.ok)throw Error('Native CAD suite failed: '+suite);
 const counts=Object.fromEntries(ordinarySuites.map(([name])=>[name,{
  source:read('source-'+name+'.json').checks.length,
  packaged:name==='cad'?['overview','placement','references','sketch','partition','extraction','annotations','performance'].reduce((sum,key)=>sum+native[key].checks.length,native.checks.length):read('packaged-'+name+'.json').checks.length
 }]));
 for(const phase of ['phase1','reopen'])counts['workflow-'+phase]={source:read('source-workflow-'+phase+'.json').checks.length,packaged:read('packaged-workflow-'+phase+'.json').checks.length};
 const result={ok:true,version:meta.version,package13:true,firstCommonProgramAcceptance:true,full27PackageAcceptance:false,comparisonRule,runtime:b.runtime,sourceManifest:current.manifest,buildSourceManifest:b.manifest,artifactManifestChanges:current.manifest.filter(e=>artifactScripts.has(e.file)&&b.manifest.find(old=>old.file===e.file)?.sha256!==e.sha256).map(e=>({file:e.file,buildSha256:b.manifest.find(old=>old.file===e.file)?.sha256,archiveSha256:e.sha256})),runtimeFiles:b.runtimeFiles,exeSha256:b.exeSha256,asarSha256:b.asarSha256,proofs:b.proofs,unitCounts:current.unitCounts,uiManifestExclusions:b.uiManifestExclusions,packagedProofs,preserved,asarFiles:entries.length,counts};
 fs.writeFileSync(path.join(work,'final-audit.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({ok:true,counts:result.counts,unitChecks:Object.values(result.unitCounts).reduce((sum,n)=>sum+n,0),asarFiles:entries.length}));
}else throw Error('Unknown package mode');
