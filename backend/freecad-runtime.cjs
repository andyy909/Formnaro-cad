// Bundled CAD is authoritative. A damaged bundle must never silently fall back
// to another FreeCAD/Python installed on this computer.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const message='Die integrierte CAD-Laufzeit fehlt oder ist beschädigt. Formnaro vollständig neu entpacken; das Modell bleibt erhalten.';
const fail=detail=>Object.assign(Error(message+(detail?' ('+detail+')':'')),{code:'FREECAD_RUNTIME_INVALID'});
function readManifest(root){const bytes=fs.readFileSync(path.join(root,'manifest.json'));if(isPackaged()&&createHash('sha256').update(bytes).digest('hex')!==require('./freecad-runtime-pin.json').sha256)throw fail('Manifestprüfsumme');return JSON.parse(bytes);}
function isPackaged(){return !!process.versions.electron&&!!require('electron').app?.isPackaged;}
function runtimeRoot(){return isPackaged()?path.join(process.resourcesPath,'freecad'):path.resolve(__dirname,'../freecad-runtime/runtime');}
function external(){
 for(const root of [process.env.ProgramFiles,process.env['ProgramFiles(x86)']].filter(Boolean)){
  let names=[];try{names=fs.readdirSync(root).filter(n=>/^FreeCAD(?:[ ._-]|$)/i.test(n)).sort().reverse();}catch{}
  for(const name of names){const file=path.join(root,name,'bin/FreeCADCmd.exe');if(fs.existsSync(file))return file;}
 }return null;
}
function resolveRuntime({root=runtimeRoot(),packaged=isPackaged(),findExternal=external}={}){
 if(fs.existsSync(root)||packaged){
  try{
   const m=readManifest(root);
   if(m.schema!==1||m.version!=='1.1.4'||!Array.isArray(m.files)||!m.files.length)throw fail('Manifest');
   for(const file of ['bin/FreeCADCmd.exe','bin/FreeCAD.exe','bin/python311.dll','formnaro-container.exe'])if(!fs.statSync(path.join(root,file)).isFile()||!m.files.some(row=>row.file.toLowerCase()===file.toLowerCase()))throw fail(file);
   return {available:true,executable:path.join(root,'bin/FreeCADCmd.exe'),root,version:m.version,bundled:true,externalInstallation:false};
  }catch(e){return {available:false,executable:null,root,bundled:true,externalInstallation:false,error:message,code:'FREECAD_RUNTIME_INVALID'};}
 }
 const executable=findExternal();return {available:!!executable,executable,bundled:false,externalInstallation:!!executable};
}
const startupFiles=new Set(['bin/freecadcmd.exe','bin/freecad.exe','bin/freecad.pyd','bin/freecadapp.dll','bin/freecadbase.dll','bin/freecadgui.dll','bin/freecadgui.pyd','bin/python3.dll','bin/python311.dll','lib/part.pyd','lib/sketcher.pyd','lib/mesh.pyd','lib/meshpart.pyd','lib/import.pyd','lib/surface.pyd','formnaro-container.exe']);
async function verifyRuntime(root=runtimeRoot(),{signal,background=!!process.versions.electron,startupOnly=false}={}){
 signal?.throwIfAborted();
 let manifest;try{manifest=readManifest(root);}catch{throw fail('Manifest');}
 if(manifest.schema!==1||manifest.version!=='1.1.4'||!Array.isArray(manifest.files)||!manifest.files.length)throw fail('Manifest');
 const totalFiles=manifest.files.length;manifest={...manifest,totalFiles,scope:startupOnly?'startup-core':'complete',files:startupOnly?manifest.files.filter(row=>typeof row.file==='string'&&startupFiles.has(row.file.toLowerCase())):manifest.files};
 if(!manifest.files.length)throw fail('Kernkomponenten');
 if(!background)return require('./freecad-integrity-worker.cjs').verifyFiles(root,manifest,{signal});
 // Use the already delivered executable in its Node mode: file I/O is then
 // independent of Electron's live message loop, including worker-thread I/O.
 const {spawn}=require('node:child_process'),source=fs.readFileSync(path.join(__dirname,'freecad-integrity-worker.cjs'),'utf8');
 const tempRoot=path.resolve(require('node:os').tmpdir()),host=await fs.promises.mkdtemp(path.join(tempRoot,'formnaro-integrity-'));
 if(path.dirname(path.resolve(host))!==tempRoot||!path.basename(host).startsWith('formnaro-integrity-'))throw fail('Prüfordner');
 try{
 const script=path.join(host,'verify.cjs');await fs.promises.writeFile(script,source,{flag:'wx'});signal?.throwIfAborted();
 return await new Promise((resolve,reject)=>{
  const env={ELECTRON_RUN_AS_NODE:'1',FORMNARO_INTEGRITY_CHILD:'1'};for(const key of ['SystemRoot','WINDIR','SystemDrive','TEMP','TMP'])if(process.env[key])env[key]=process.env[key];
  const child=spawn(process.execPath,[script,'formnaro-integrity',root],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});let done=false,stdout='',stderr='';
  const finish=(error,value)=>{if(done)return;done=true;signal?.removeEventListener('abort',abort);if(error)reject(error);else resolve(value);};
  const abort=()=>{if(!done)child.kill();};
  child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>64000)child.kill();});child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-4000);});
  child.once('error',error=>finish(error));child.once('close',code=>{if(signal?.aborted)return finish(signal.reason);try{if(code!==0)throw fail('Prüfprozess '+code);const reply=JSON.parse(stdout);if(!reply.ok)throw Object.assign(Error(reply.error),{code:reply.code});if(reply.value?.ok!==true||reply.value.files!==manifest.files.length||reply.value.version!==manifest.version)throw fail('Prüfantwort');finish(null,reply.value);}catch(error){finish(error.code?error:fail('Prüfantwort'));}});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(manifest));
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 });
 }finally{await fs.promises.rm(host,{recursive:true,force:true});}
}
let verification;
async function prepareRuntime(exe,{signal}={}){
 const s=resolveRuntime();
 if(s.bundled){if(!s.available)throw fail();if(path.resolve(exe)!==path.resolve(s.executable))throw fail('Laufzeitauswahl');
  // Check startup components before the first job. Full distribution integrity
  // is checked during packaging/acceptance, without rereading all optional
  // modules, examples, symbols and licenses on ordinary model requests.
  // Failed/cancelled checks can be retried after restoring a complete bundle.
  verification??=verifyRuntime(s.root,{signal,startupOnly:true}).catch(e=>{verification=undefined;throw e;});await verification;signal?.throwIfAborted();
 }
 return s;
}
module.exports={resolveRuntime,verifyRuntime,prepareRuntime,runtimeRoot,message};
