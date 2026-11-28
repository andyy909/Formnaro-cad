const fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const {validatePlan}=require('./freecad-plan.cjs');
const {validateScript,runPythonJob}=require('./freecad-python.cjs');
const LIMIT=32*1024*1024;
const runtime=require('./freecad-runtime.cjs');
function executable(){return runtime.resolveRuntime().executable;}
function status(){const s=runtime.resolveRuntime();return {...s,engine:'FreeCAD',pythonAPI:s.available&&process.platform==='win32',pythonIsolation:process.platform==='win32'?'windows-appcontainer':null};}
function failure(message,code='FREECAD_FAILED'){return Object.assign(Error(message),{code});}
async function readResult(job,name,code){
 const file=path.join(job,name),stat=await fs.lstat(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>LIMIT||path.dirname(await fs.realpath(file))!==await fs.realpath(job))throw failure('Ungültige FreeCAD-Ergebnisdatei.',code);
 const bytes=await fs.readFile(file);if(bytes.length>LIMIT)throw failure('FreeCAD-Ergebnis überschreitet 32 MiB.',code);return bytes;
}
async function run({plan,script,inputs=[],inspectOnly=false,document}, {signal,exe=executable(),timeout=300000}={}){
 if(document!==undefined){if(plan!==undefined||script!==undefined||!Array.isArray(inputs)||inputs.length||inspectOnly!==false)throw failure('Dokumentmerkmale getrennt von Skript-/Planaufträgen bearbeiten.','FREECAD_DOCUMENT_INPUT');return require('./freecad-document.cjs').runDocument(document,{signal,exe,timeout});}
 if(typeof inspectOnly!=='boolean')throw failure('Ungültiger Prüfmodus.','FREECAD_PLAN_INVALID');
 if(!exe)throw failure(runtime.message,'FREECAD_UNAVAILABLE');
 await runtime.prepareRuntime(exe,{signal});
 if(!Array.isArray(inputs)||inputs.length>8)throw failure('Maximal acht Geometriequellen.','FREECAD_PLAN_INVALID');
 let bytes=0;const files=inputs.map((item,i)=>{
  if(!item||Object.keys(item).some(k=>!['name','format','base64'].includes(k))||!['step','stl'].includes(item.format)||typeof item.base64!=='string'||item.base64.length>LIMIT*4/3+4)throw failure('Ungültige Geometrieeingabe.','FREECAD_PLAN_INVALID');
  const data=Buffer.from(item.base64,'base64');bytes+=data.length;if(!data.length||data.toString('base64')!==item.base64||bytes>LIMIT)throw failure('Geometrieeingaben überschreiten 32 MiB.','FREECAD_PLAN_INVALID');
  return {name:item.name,format:item.format,file:'source-'+i+'.'+item.format,data};
 });
 if(!!plan===!!script)throw failure('Genau einen FreeCAD-Plan oder ein Python-Skript wählen.','FREECAD_PLAN_INVALID');
 if(script){script=validateScript(script);if(new Set(files.map(f=>f.name)).size!==files.length||files.some(f=>typeof f.name!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(f.name)))throw failure('Eindeutige gültige FreeCAD-Quellnamen erforderlich.','FREECAD_PLAN_INVALID');}
 else plan=validatePlan(plan,files.map(x=>x.name));signal?.throwIfAborted();
 const job=await fs.mkdtemp(path.join(os.tmpdir(),'formnaro-freecad-'));
 try{
  await fs.mkdir(path.join(job,'user'));await fs.mkdir(path.join(job,'temp'));
  for(const f of files)await fs.writeFile(path.join(job,f.file),f.data);
  if(script){
   await runPythonJob({job,exe,script,inputs:files.map(({data,...f})=>f),inspectOnly,signal,timeout});
   const read=name=>readResult(job,name,'FREECAD_PYTHON_FAILED');
   const result=JSON.parse(await read('result.json'));
   if(!result.ok)throw Object.assign(failure('FreeCAD-Python: '+result.error,result.code||'FREECAD_PYTHON_FAILED'),{feedback:{retryable:true,traceback:result.traceback}});
   if(inspectOnly)return {...result,script};
   return {...result,script,stepBase64:(await read('result.step')).toString('base64'),documentBase64:(await read('result.FCStd')).toString('base64')};
  }
  await fs.writeFile(path.join(job,'input.json'),JSON.stringify({plan,inspectOnly,inputs:files.map(({data,...f})=>f)}));
  // ASAR Python is not a host filesystem path. Extract only the trusted worker.
  await fs.writeFile(path.join(job,'worker.py'),await fs.readFile(path.join(__dirname,'freecad-worker.py')));
  if(runtime.resolveRuntime().bundled){
   await runPythonJob({job,exe,script:{version:1,code:''},inputs:[],inspectOnly,signal,timeout,planJob:{plan,inspectOnly,inputs:files.map(({data,...f})=>f)}});
  }else{
  const env={...process.env,FORMNARO_FREECAD_JOB:job,FREECAD_USER_HOME:path.join(job,'user'),FREECAD_USER_DATA:path.join(job,'user'),FREECAD_USER_TEMP:path.join(job,'temp'),PYTHONDONTWRITEBYTECODE:'1'};
  delete env.PYTHONPATH;delete env.PYTHONHOME;
  await new Promise((resolve,reject)=>{
   let timedOut=false,log='';const child=spawn(exe,['--user-cfg',path.join(job,'user.cfg'),'--system-cfg',path.join(job,'system.cfg'),path.join(job,'worker.py')],{cwd:job,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
   const abort=()=>child.kill(),timer=setTimeout(()=>{timedOut=true;child.kill();},timeout);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
   for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{log=(log+data.toString()).slice(-4000);});
   const clean=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
   child.once('error',e=>{clean();reject(e);});child.once('close',code=>{clean();if(signal?.aborted)reject(failure('FreeCAD-Berechnung abgebrochen.','ABORTED'));else if(timedOut)reject(failure('FreeCAD-Zeitlimit nach fünf Minuten erreicht.','FREECAD_TIMEOUT'));else if(code!==0)reject(failure('FreeCAD-Prozess fehlgeschlagen: '+log));else resolve();});
  });
  }
  const result=JSON.parse(await readResult(job,'result.json','FREECAD_FAILED'));
  if(!result.ok){const error=failure('FreeCAD Schritt '+result.step+' ('+result.operation+'): '+result.error);if(result.diagnostics)error.feedback={geometryCheck:result.diagnostics};throw error;}
  if(inspectOnly)return {...result,plan};
  const read=async name=>(await readResult(job,name,'FREECAD_FAILED')).toString('base64');
  return {...result,stepBase64:await read('result.step'),documentBase64:await read('result.FCStd'),plan};
 }finally{
  // job is created by mkdtemp under exactly the intended temporary root.
  await fs.rm(job,{recursive:true,force:true});
 }
}
module.exports={run,status,executable};
