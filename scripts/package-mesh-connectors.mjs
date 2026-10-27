// Package 20: paired mesh connectors, separate from accepted older releases.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {packager} from '@electron/packager';
import {extractFile,listPackage,statFile} from '@electron/asar';
import {integrationManifest} from './stl-integration-manifest.mjs';

const root=process.cwd(),meta=JSON.parse(fs.readFileSync('package.json','utf8'));
const work=path.join(root,'work/mesh-connectors/checks'),mode=process.argv[2]??'build';
if(meta.version!=='0.43.0')throw Error('Package 20 requires version 0.43.0');
// Final minimum counts from the real isolated source debug and targeted suites.
const meshSelectionMinimum=59,meshSelectionUnitMinimum=25,meshSelectionStateMinimum=15,pickingMinimum=7;
const release=path.join(root,'release-formnaro-steckverbinder-v'+meta.version);
const runtime=path.join(release,'Formnaro-win32-x64');
const stage=path.join(root,'work/mesh-connectors/package-stage-'+meta.version);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hash=file=>sha(fs.readFileSync(file));
const read=name=>JSON.parse(fs.readFileSync(path.join(work,name),'utf8'));
// Finish these scripts before the final source proof. No public-file exemptions.
const productManifest=manifest=>manifest;
const inspectorMinimum=24;
const ordinarySuites=[['connectors',27,27],['partition',25,25],['complete',98,98],['automatic',22,22],['domain',35,35],['workbench',14,14],['hole',25,25],['repair',27,27],['inspector',inspectorMinimum,inspectorMinimum],['mesh-selection',meshSelectionMinimum,meshSelectionMinimum],['mesh',33,33],['workspace',36,36],['cad',137,46],['unified',61,61]];
const unitSuites=[['mesh-connectors.log',11],['layout-customization.log',3],['mesh-partition.log',16],['easy-regressions.log',18],['mesh-hole-fill.log',25],['mesh-simple-repair.log',29],['mesh-inspector.log',23],['mesh-selection-advanced.log',19],['mesh-selection.log',meshSelectionUnitMinimum],['mesh-selection-state.log',meshSelectionStateMinimum],['picking.log',pickingMinimum],['workspace-selection.log',3],['regressions.log',116],['foundation.log',45],['mesh-integration.log',20],['shared-workspace.log',23],['workflow-settings.log',10],['tool-parity.log',26],['svg-export.log',4],['export-dialog.log',4]];

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
function selectionProof(report,name){
 if(report.package15!==true||report.brushLassoProtection!==true||report.isolatedProfile!==true||report.normalFileIpc!==true||report.trustedCanvasMouse!==true)throw Error('Isolated real package-15 surface-selection proof required: '+name);
 const artifacts=report.syntheticArtifacts;
 if(!Array.isArray(artifacts)||artifacts.length<2)throw Error('Explicit synthetic saved-project evidence required: '+name);
 if(!artifacts.some(e=>e.name?.endsWith('.ocad'))||!artifacts.some(e=>e.name?.endsWith('.stl')))throw Error('Physical saved project and full-object STL evidence required: '+name);
 const names=new Set();
 for(const entry of artifacts){
  if(typeof entry.name!=='string'||!entry.name||path.basename(entry.name)!==entry.name||entry.name.includes('\\')||names.has(entry.name))throw Error('Invalid or duplicate synthetic artifact name: '+name);
  names.add(entry.name);
  if(!path.isAbsolute(entry.file??'')||!Number.isSafeInteger(entry.bytes)||entry.bytes<=0||!/^([a-f0-9]{64})$/.test(entry.sha256??''))throw Error('Invalid generated artifact identity: '+name);
  const stat=fs.lstatSync(entry.file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==entry.bytes||hash(entry.file)!==entry.sha256)throw Error('Synthetic saved/exported bytes differ: '+entry.name);
  if(entry.name.endsWith('.ocad')){const project=JSON.parse(fs.readFileSync(entry.file,'utf8'));if(project.version!==8||project.workspace?.version!==4||project.workspace.meshSelection?.format!=='FormnaroMeshSelection'||!project.nodes.some(n=>n.kind==='mesh'&&n.id===project.workspace.meshSelection.objectId))throw Error('Saved selection is not bound to a real Format8 mesh: '+name);}
 }
}
function sourceProofs(){
 const manifest=integrationManifest(),proofs={},unitCounts={};
 for(const [suite,min]of ordinarySuites){
  const name='source-'+suite+'.json',p=read(name);
  validResult(p,name,min);
  if(JSON.stringify(productManifest(p.sourceManifest))!==JSON.stringify(productManifest(manifest)))throw Error('Current source UI proof required: '+name);
  proofs[name]=hash(path.join(work,name));
  Object.assign(proofs,processProof(name,p,{manifest}));
  if(suite==='mesh-selection')selectionProof(p,name);
  if(suite==='connectors'){if(!p.package20||!p.meshConnectors||!p.trustedConnectorButtons||!p.normalFileIpc||p.syntheticArtifacts?.length!==3)throw Error('Full isolated connector proof required');for(const e of p.syntheticArtifacts)if(hash(e.file)!==e.sha256||fs.statSync(e.file).size!==e.bytes)throw Error('Connector artifact changed');}
  if(suite==='partition'){if(!p.package19||!p.meshPartition||!p.trustedPartitionButtons||!p.normalFileIpc||p.syntheticArtifacts?.length!==6)throw Error('Full isolated partition proof required');for(const e of p.syntheticArtifacts)if(hash(e.file)!==e.sha256||fs.statSync(e.file).size!==e.bytes)throw Error('Partition artifact changed');}
  if(suite==='hole'){if(!p.package18||!p.meshHoleFill||!p.isolatedProfile||!p.trustedHoleButtons||!p.normalFileIpc||p.syntheticArtifacts?.length!==3)throw Error('Actual isolated hole closing proof required');for(const e of p.syntheticArtifacts)if(hash(e.file)!==e.sha256||fs.statSync(e.file).size!==e.bytes)throw Error('Hole artifact changed');}
  if(suite==='repair'){if(!p.package17||!p.meshSimpleRepair||!p.isolatedProfile||!p.trustedRepairButtons||!p.normalFileIpc||p.syntheticArtifacts?.length!==3)throw Error('Actual isolated mesh repair UI proof required');for(const e of p.syntheticArtifacts)if(hash(e.file)!==e.sha256||fs.statSync(e.file).size!==e.bytes)throw Error('Repair artifact changed');}
  if(suite==='inspector'){if(!p.package16||!p.meshInspector||!p.isolatedProfile||!p.trustedInspectorButton||!p.normalFileIpc)throw Error('Actual inspector UI proof required');for(const e of p.syntheticArtifacts??[])if(hash(e.file)!==e.sha256)throw Error('Inspector artifact changed');if(p.syntheticArtifacts?.length!==3)throw Error('Inspector project/export artifacts required');}
 }
 for(const [name,min]of unitSuites){
  const log=fs.readFileSync(path.join(work,name),'utf8'),count=Number(log.match(/^# tests (\d+)$/m)?.[1]);
  if(!Number.isSafeInteger(min)||min<1||!Number.isSafeInteger(count)||count<min||!/^# fail 0$/m.test(log)||!/^# skipped 0$/m.test(log)||!/^# cancelled 0$/m.test(log))throw Error('Passing fresh unit proof required: '+name);
  proofs[name]=hash(path.join(work,name));unitCounts[name]=count;
 }
 const independent=read('independent-files-source.json');if(!independent.ok||!independent.exactStlObjWorldGeometry||!independent.originalThroughBoreOpen||independent.reportSha256!==hash(path.join(work,'source-connectors.json')))throw Error('Independent source connector files required');proofs['independent-files-source.json']=hash(path.join(work,'independent-files-source.json'));
 return {manifest,proofs,unitCounts,uiManifestExclusions:[]};
}
function preservation(){
 const previous=JSON.parse(fs.readFileSync('work/mesh-partition/checks/build.json','utf8'));
 if(previous.version!=='0.42.0'||previous.runtimeFiles.length!==1638||previous.exeSha256!=='8d886990b6adbb37f55508ccc576b4853a59b0c1b7f592d21f73b2e8c84d363e'||previous.asarSha256!=='ceea90422674d4aae525c801824cae87fa40c5f8bc06ae36a4a10ff3fd093317')throw Error('Accepted previous receipt identity changed');
 // A used application can gain personal Daten/Layouts/Projekte directories.
 // Inspect only original frozen program paths, never enumerate the old checkout.
 for(const e of previous.runtimeFiles)if(hash(path.join(previous.runtime,e.file))!==e.sha256)throw Error('Accepted 0.42.0 program file changed: '+e.file);
 for(const [name,digest]of [
  ['output/Formnaro-Netzteilen-v0.42.0.zip','a5b2ca9e0d6476d8147e704e519717285d954aed5f11071bffd7f258eb8728ff'],
  ['release-formnaro-netzteilen-v0.42.0/Formnaro-Quellcode-v0.42.0.zip','6e0f8e3c926433c09655f19813b34484c099c13c0d293db768efde4626ab2d53'],
  ['../stl too step/dist/STL-zu-STEP-v0.12-dev-api-speicher/STL-zu-STEP.exe','f6436a8ecf6c79173047e24d7fc9c66663fd5a85c9c2bcb91db7e719506e06cd'],
  ['../stl too step/STL-zu-STEP-Windows-v0.12-dev-api-speicher.zip','851f5394707092a68cd4d99b484f0660743703f4e44e80dbccc3b67cc434dfad']
 ])if(hash(name)!==digest)throw Error('Protected previous output changed: '+name);
 const converterFiles=files('converter/runtime-v010').map(e=>({...e,file:'resources/converter/'+e.file}));
 if(JSON.stringify(converterFiles)!==JSON.stringify(previous.runtimeFiles.filter(e=>e.file.startsWith('resources/converter/')&&!['resources/converter/README.md','resources/converter/provenance.json'].includes(e.file)).sort((a,b)=>a.file.localeCompare(b.file))))throw Error('Converter runtime changed');
 const origin=JSON.parse(fs.readFileSync('converter/provenance.json','utf8'));
 if(hash('converter/bridge.py')!==origin.bridgeSourceSha256)throw Error('Converter bridge changed');
 for(const e of origin.engineSourceFiles)if(hash(path.join('converter',e.file))!==e.sha256)throw Error('Converter source changed');
 const wasm=integrationManifest().filter(e=>e.file.startsWith('dist/')&&e.file.endsWith('.wasm'));
 const old=(previous.manifest??previous.sourceManifest).filter(e=>e.file.startsWith('dist/')&&e.file.endsWith('.wasm'));
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
 for(const name of ['STECKVERBINDER','NETZE-TEILEN-UND-KOERPER','EASY-TINKER-UND-LAYOUT','EASY-TESTBERICHT','NETZ-OEFFNUNGEN-SCHLIESSEN','NETZREPARATUR','NETZINSPEKTOR','NETZ-AUSWAHLPINSEL-SCHUTZ','NETZ-FLAECHENAUSWAHL','GESAMTABNAHME-FORMNARO','GEMEINSAME-DATEIEN-EINSTELLUNGEN-KI','NETZ-DIREKT-IN-CAD','CAD-ALS-NETZKOPIE','GEMEINSAME-KI-ANBINDUNG','GEMEINSAMER-KONVERTER','EIGENSCHAFTEN-UND-WERKZEUGE','GEMEINSAME-ARBEITSFLAECHE','NETZ-WERKZEUGE','GEMEINSAME-PROJEKTGRUNDLAGE'])fs.copyFileSync('docs/'+name+'.md',path.join(runtime,name+'.md'));
 fs.mkdirSync(path.join(runtime,'scripts'));fs.copyFileSync('scripts/offlinecad_ai.py',path.join(runtime,'scripts/offlinecad_ai.py'));fs.cpSync('ai',path.join(runtime,'ai'),{recursive:true,errorOnExist:true,force:false});
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
  if(suite==='mesh-selection')selectionProof(p,name);
  if(suite==='connectors'){if(!p.package20||!p.meshConnectors||!p.trustedConnectorButtons||!p.normalFileIpc||p.syntheticArtifacts?.length!==3)throw Error('Full isolated connector proof required');for(const e of p.syntheticArtifacts)if(hash(e.file)!==e.sha256||fs.statSync(e.file).size!==e.bytes)throw Error('Connector artifact changed');}
  if(suite==='partition'){if(!p.package19||!p.meshPartition||!p.trustedPartitionButtons||!p.normalFileIpc||p.syntheticArtifacts?.length!==6)throw Error('Full isolated partition proof required');for(const e of p.syntheticArtifacts)if(hash(e.file)!==e.sha256||fs.statSync(e.file).size!==e.bytes)throw Error('Partition artifact changed');}
  if(suite==='hole'){if(!p.package18||!p.meshHoleFill||!p.isolatedProfile||!p.trustedHoleButtons||!p.normalFileIpc||p.syntheticArtifacts?.length!==3)throw Error('Actual isolated hole closing proof required');for(const e of p.syntheticArtifacts)if(hash(e.file)!==e.sha256||fs.statSync(e.file).size!==e.bytes)throw Error('Hole artifact changed');}
  if(suite==='repair'){if(!p.package17||!p.meshSimpleRepair||!p.isolatedProfile||!p.trustedRepairButtons||!p.normalFileIpc||p.syntheticArtifacts?.length!==3)throw Error('Actual isolated mesh repair UI proof required');for(const e of p.syntheticArtifacts)if(hash(e.file)!==e.sha256||fs.statSync(e.file).size!==e.bytes)throw Error('Repair artifact changed');}
  if(suite==='inspector'){if(!p.package16||!p.meshInspector||!p.isolatedProfile||!p.trustedInspectorButton||!p.normalFileIpc)throw Error('Actual inspector UI proof required');for(const e of p.syntheticArtifacts??[])if(hash(e.file)!==e.sha256)throw Error('Inspector artifact changed');if(p.syntheticArtifacts?.length!==3)throw Error('Inspector project/export artifacts required');}
 }
 const independent=read('independent-files-packaged.json');if(!independent.ok||!independent.exactStlObjWorldGeometry||!independent.originalThroughBoreOpen||independent.reportSha256!==hash(path.join(work,'packaged-connectors.json')))throw Error('Independent EXE connector files required');packagedProofs['independent-files-packaged.json']=hash(path.join(work,'independent-files-packaged.json'));
 const native=read('packaged-cad.json');
 for(const suite of ['overview','placement','references','sketch','partition','extraction','annotations','performance','exchange'])if(!native[suite]?.ok)throw Error('Native CAD suite failed: '+suite);
 const counts=Object.fromEntries(ordinarySuites.map(([name])=>[name,{
  source:read('source-'+name+'.json').checks.length,
  packaged:name==='cad'?['overview','placement','references','sketch','partition','extraction','annotations','performance'].reduce((sum,key)=>sum+native[key].checks.length,native.checks.length):read('packaged-'+name+'.json').checks.length
 }]));
 const result={ok:true,version:meta.version,package14:true,package15:true,package16:true,package17:true,package18:true,package19:true,package20:true,meshConnectors:true,meshPartition:true,meshHoleFill:true,meshSimpleRepair:true,meshInspector:true,brushLassoProtection:true,meshSurfaceSelection:true,full27PackageAcceptance:false,runtime:b.runtime,sourceManifest:current.manifest,buildSourceManifest:b.manifest,artifactManifestChanges:[],runtimeFiles:b.runtimeFiles,exeSha256:b.exeSha256,asarSha256:b.asarSha256,proofs:b.proofs,unitCounts:current.unitCounts,uiManifestExclusions:b.uiManifestExclusions,packagedProofs,preserved,asarFiles:entries.length,counts};
 fs.writeFileSync(path.join(work,'final-audit.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({ok:true,counts:result.counts,unitChecks:Object.values(result.unitCounts).reduce((sum,n)=>sum+n,0),asarFiles:entries.length}));
}else throw Error('Unknown package mode');
