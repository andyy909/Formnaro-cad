// Package 13: run both normal application processes and preserve their raw reports.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {integrationManifest} from './stl-integration-manifest.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv.includes('--help')){
 console.log('Run both isolated Package-13 application processes. Optional FORMNARO_WORKFLOW_EXE selects the packaged EXE; FORMNARO_WORKFLOW_PROOF_DIR selects the proof directory.');
 process.exit(0);
}
if(process.argv.length!==2)throw Error('This runner accepts no positional arguments; use --help.');
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
if(version!=='0.32.0')throw Error('Package-13 workflow acceptance requires Formnaro 0.32.0.');
const proofDirectory=path.resolve(process.env.FORMNARO_WORKFLOW_PROOF_DIR??path.join(root,'work/release-acceptance/checks'));
const packaged=!!process.env.FORMNARO_WORKFLOW_EXE,prefix=packaged?'packaged':'source';
const executable=packaged?path.resolve(process.env.FORMNARO_WORKFLOW_EXE):path.join(root,'node_modules/electron/dist/electron.exe');
const asar=packaged?path.join(path.dirname(executable),'resources/app.asar'):null;
const sha=value=>createHash('sha256').update(value).digest('hex');
const hash=file=>sha(fs.readFileSync(file));
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const comparisonRule='cad-stats-12-significant-digits-v1';
function comparableNode(node){
 const copy=JSON.parse(JSON.stringify(node));
 const derived=value=>{
  if(typeof value==='number'){assert(Number.isFinite(value),'Nonfinite native CAD measurement.');return Number(value.toPrecision(12));}
  if(Array.isArray(value))return value.map(derived);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,derived(item)]));
  return value;
 };
 const visit=current=>{
  if(current.kind==='cad'&&current.stats!==undefined)current.stats=derived(current.stats);
  if(Array.isArray(current.children))current.children.forEach(visit);
 };
 visit(copy);
 return copy;
}
const objectDigests=project=>Object.fromEntries(project.nodes.map(node=>[node.id,sha(JSON.stringify(comparableNode(node)))]));
const before=integrationManifest(root),manifestDigest=sha(JSON.stringify(before));
const identity=()=>packaged?{exeSha256:hash(executable),asarSha256:hash(asar)}:{};
const initialIdentity=identity();
const buildFile=path.join(root,'work/release-acceptance/checks/build.json');
if(packaged&&fs.existsSync(buildFile)){
 const build=JSON.parse(fs.readFileSync(buildFile,'utf8'));
 assert(build.version===version&&build.exeSha256===initialIdentity.exeSha256&&build.asarSha256===initialIdentity.asarSha256,'Selected EXE/ASAR differs from the current build receipt.');
}
fs.mkdirSync(proofDirectory,{recursive:true});
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro032-'+prefix+'-workflow-'));
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const started=Date.now(),results=[];

function checkSources(){assert(same(before,integrationManifest(root)),'Public source or built output changed during workflow acceptance.');}
function checkIdentity(){assert(same(initialIdentity,identity()),'Selected EXE/ASAR changed during workflow acceptance.');}
function physical(file,digest,label){
 assert(typeof file==='string'&&path.isAbsolute(file)&&/^[a-f0-9]{64}$/.test(digest??''),'Missing physical '+label+' identity.');
 assert(fs.statSync(file).isFile()&&hash(file)===digest,'Physical '+label+' bytes differ from the application report.');
}
async function runPhase(name,reopen){
 const phaseDirectory=path.join(directory,name);fs.mkdirSync(phaseDirectory);
 const reportFile=path.join(phaseDirectory,'result.json'),logFile=path.join(phaseDirectory,'process.log');
 const args=[...(packaged?[]:[root]),'--verify-release-workflow='+reportFile,...(reopen?['--verify-release-reopen='+reopen]:[])];
 const log=fs.openSync(logFile,'w'),phaseStarted=Date.now();
 let code,signal,timedOut=false,pid;
 try{
  const child=spawn(executable,args,{cwd:root,windowsHide:true,env,stdio:['ignore',log,log]});pid=child.pid;
  const timeout=setTimeout(()=>{timedOut=true;child.kill();},1500000);
  try{({code,signal}=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(exitCode,exitSignal)=>resolve({code:exitCode,signal:exitSignal}));}));}
  finally{clearTimeout(timeout);}
 }finally{fs.closeSync(log);}
 assert(!timedOut&&code===0,'Workflow '+name+' did not exit successfully; retained '+phaseDirectory+' (exit '+code+', signal '+signal+').');
 const bytes=fs.readFileSync(reportFile),report=JSON.parse(bytes);
 assert(report.ok===true&&report.package13===true&&report.phase===(reopen?'reopen-and-export':'build-and-save'),'Wrong or failed workflow phase report: '+reportFile);
 assert(report.comparisonRule===comparisonRule,'Unknown geometry comparison rule: '+reportFile);
 assert(report.appVersion===version&&report.isolatedProfile===true,'Workflow version or profile isolation differs: '+reportFile);
 assert(Array.isArray(report.checks)&&report.checks.length>0&&!(report.errors??[]).length&&!(report.external??[]).length,'Workflow has no checks or contains renderer/network failures: '+reportFile);
 assert(report.cloudRequests===undefined||report.cloudRequests===0,'Unexpected cloud request in workflow acceptance.');
 physical(report.projectFile,report.projectSha256,'saved project');
 physical(report.handshake,report.handshakeSha256,'handoff');
 assert(path.resolve(report.handshake)===path.join(directory,'phase1','handshake.json'),'Workflow used an unexpected phase handoff.');
 assert(report.objectDigests&&Object.keys(report.objectDigests).length>0,'Workflow has no exact object identities.');
 const handshake=JSON.parse(fs.readFileSync(report.handshake,'utf8'));
 assert(handshake.format==='FormnaroReleaseAcceptance'&&handshake.version===1&&handshake.comparisonRule===comparisonRule&&handshake.projectFile===report.projectFile&&handshake.projectSha256===report.projectSha256&&same(handshake.objectDigests,report.objectDigests),'Workflow handoff does not identify the saved project.');
 const storedProject=JSON.parse(fs.readFileSync(report.projectFile,'utf8'));
 assert(storedProject.version===8&&same(objectDigests(storedProject),report.objectDigests),'Physical saved geometry differs under the stated bounded measurement comparison.');
 const verificationProfile=report.verificationProfile??report.profilePath;
 assert(typeof verificationProfile==='string'&&path.resolve(verificationProfile)===path.join(phaseDirectory,'offlinecad-verification-profile'),'Application did not attest its isolated profile path.');
 if(packaged){assert(report.exeSha256===initialIdentity.exeSha256&&report.asarSha256===initialIdentity.asarSha256,'Application-reported EXE/ASAR differs from independently read bytes.');}
 else{assert(same(report.sourceManifest,before),'Application source manifest differs from the independently frozen source.');}
 checkSources();checkIdentity();
 const canonical=prefix+'-workflow-'+(reopen?'reopen':'phase1')+'.json';
 fs.copyFileSync(reportFile,path.join(proofDirectory,canonical));
 const receipt={ok:true,exitCode:code,reportFile:canonical,reportSha256:sha(bytes),applicationReport:reportFile,pid,verificationProfile,processLog:logFile,startedAt:new Date(phaseStarted).toISOString(),elapsedMs:Date.now()-phaseStarted,...(packaged?initialIdentity:{sourceManifestSha256:sha(JSON.stringify(report.sourceManifest))}),publicSourceManifestSha256:manifestDigest};
 fs.writeFileSync(path.join(proofDirectory,'run-'+canonical),JSON.stringify(receipt,null,2)+'\n','utf8');
 console.log(JSON.stringify({ok:true,kind:prefix,phase:name,checks:report.checks.length,exitCode:code,report:reportFile}));
 return {report,receipt};
}

try{
 results.push(await runPhase('phase1'));
 results.push(await runPhase('reopen',results[0].report.handshake));
 const [first,reopened]=results.map(result=>result.report);
 assert(first.projectFile===reopened.projectFile&&first.projectSha256===reopened.projectSha256&&first.handshake===reopened.handshake&&first.handshakeSha256===reopened.handshakeSha256&&same(first.objectDigests,reopened.objectDigests)&&reopened.originalProjectUnchanged===true,'Second process did not reopen the exact first-process project.');
 assert(results[0].receipt.verificationProfile!==results[1].receipt.verificationProfile,'Both workflow processes used the same profile.');
 assert(Array.isArray(reopened.exports)&&reopened.exports.length>=3,'Physical workflow exports missing.');
 for(const output of reopened.exports){physical(output.file,output.sha256,'export');assert(output.bytes>0&&fs.statSync(output.file).size===output.bytes,'Export size differs from the report.');}
 physical(reopened.roundtripFile,reopened.roundtripSha256,'reopened project roundtrip');
 physical(reopened.continuationFile,reopened.continuationSha256,'continued edited project');
 assert(reopened.continuationFile!==first.projectFile&&reopened.continuationFile!==reopened.roundtripFile,'Continued edits must be saved to their own physical project.');
 const continued=JSON.parse(fs.readFileSync(reopened.continuationFile,'utf8'));
 assert(continued.version===8&&Array.isArray(continued.nodes),'Continued edits are not a mixed Format-8 project.');
 const continuedDigests=objectDigests(continued);
 assert(same(continuedDigests,reopened.continuationObjectDigests),'Continued project object bytes differ from the reopened edited report.');
 const changed=continued.nodes.filter(node=>first.objectDigests[node.id]!==continuedDigests[node.id]);
 assert(changed.some(node=>node.kind==='cad')&&changed.some(node=>node.kind==='mesh'),'Continued file does not preserve actual changes to both CAD and mesh objects.');
 checkSources();checkIdentity();
 console.log(JSON.stringify({ok:true,kind:prefix,version,checks:first.checks.length+reopened.checks.length,seconds:(Date.now()-started)/1000,directory,proofDirectory}));
}catch(error){
 fs.writeFileSync(path.join(directory,'runner-failure.json'),JSON.stringify({ok:false,error:error.message,version,kind:prefix,completedPhases:results.length,seconds:(Date.now()-started)/1000},null,2)+'\n','utf8');
 console.error(JSON.stringify({ok:false,error:error.message,directory}));process.exitCode=1;
}
