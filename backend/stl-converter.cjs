const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const LIMIT=50*1024*1024,ENGINE='0.10.0',PROTOCOL=2;
const JSON_LIMIT=5*1024*1024;
function boundedJSON(value,label){
 if(!value||typeof value!=='object'||Array.isArray(value)||Buffer.byteLength(JSON.stringify(value))>JSON_LIMIT)throw Error('Ungültige '+label+'.');
}
function validate(args){
 if(!args||typeof args!=='object'||Object.keys(args).some(k=>!['id','bytes','options','name','action','edits','commands'].includes(k))||typeof args.id!=='string'||!/^[-a-zA-Z0-9]{1,80}$/.test(args.id)||!(args.bytes instanceof Uint8Array)||!args.bytes.length||args.bytes.length>LIMIT||typeof args.name!=='string'||args.name.length>1000||!args.name.toLowerCase().endsWith('.stl')||!args.name.slice(0,-4).trim()||/[\\/\x00-\x1f]/.test(args.name))throw Error('Eine STL-Datei bis 50 MB auswählen.');
 const o=args.options??{},allowed=['unit','tolerance','mode','rounds','repair','fallback','samples','target_faces','region_edits'];
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!allowed.includes(k)))throw Error('Ungültige Konverteroption.');
 const options={unit:1,tolerance:.15,mode:'auto',rounds:'keep',repair:true,fallback:true,samples:6000,target_faces:500,...o};
 if(![1,10,25.4].includes(options.unit)||!Number.isFinite(options.tolerance)||options.tolerance<.0001||options.tolerance>100||!['auto','smooth','planar','exact'].includes(options.mode)||!['keep','chamfer'].includes(options.rounds)||typeof options.repair!=='boolean'||typeof options.fallback!=='boolean'||!Number.isInteger(options.samples)||options.samples<500||options.samples>30000||!Number.isInteger(options.target_faces)||options.target_faces<20||options.target_faces>20000)throw Error('Ungültige Konverteroption.');
 if(options.region_edits!==undefined&&options.region_edits!==null)boundedJSON(options.region_edits,'Regionskorrektur');
 if(args.edits!==undefined&&args.edits!==null)boundedJSON(args.edits,'Regionskorrektur');
 if(args.action!==undefined&&!['convert','analyse'].includes(args.action))throw Error('Ungültige Konverteraktion.');
 if(args.commands!==undefined&&(!Array.isArray(args.commands)||args.commands.length>20||Buffer.byteLength(JSON.stringify(args.commands))>JSON_LIMIT))throw Error('Ungültige Regionsbefehle.');
 return options;
}
function runtimeDirectory({packaged=false,resourcesPath=process.resourcesPath,root=path.resolve(__dirname,'..')}={}){
 if(packaged){if(typeof resourcesPath!=='string')throw Error('Portable resources directory missing');return path.join(resourcesPath,'converter');}
 const meta=JSON.parse(require('node:fs').readFileSync(path.join(root,'converter/provenance.json'),'utf8'));
 if(!/^runtime-v010(?:-[a-z0-9]+)*$/.test(meta.runtimeDirectory))throw Error('Invalid converter runtime directory');
 return path.join(root,'converter',meta.runtimeDirectory);
}
function createStlConverter({command,prefix=[],tempRoot=os.tmpdir(),timeoutMs=600000,onProgress=()=>{},spawnProcess=spawn}={}){
 let active=null;
 async function cancel(id){const job=active;if(!job||id!==undefined&&job.id!==id)return false;job.cancelled=true;job.child?.kill();await job.done;return true;}
 async function execute(args){
  const options=validate(args),action=args.action??'convert';
  if(active)throw Error('Eine STL-Konvertierung läuft bereits.');
  if(!command)throw Error('Der lokale STL-Konverter fehlt. Bitte die vollständige Desktop-Ausgabe verwenden.');
  let done;const job={id:args.id,cancelled:false,done:new Promise(resolve=>done=resolve)};active=job;
  let directory,poll,timer;
  const aborted=()=>{if(job.cancelled){const e=Error('Konvertierung abgebrochen.');e.code='ABORTED';throw e;}};
  try{
   directory=await fs.mkdtemp(path.join(tempRoot,'formnaro-stl-'));
   await fs.writeFile(path.join(directory,'input.stl'),args.bytes,{flag:'wx'});
   await fs.writeFile(path.join(directory,'request.json'),JSON.stringify({version:PROTOCOL,action,options,edits:args.edits??null,commands:args.commands??[]}),{flag:'wx'});aborted();
   let last='';poll=setInterval(async()=>{try{const value=await fs.readFile(path.join(directory,'progress.txt'),'utf8');if(value.length>512000)return;const message=value.trim().split(/\r?\n/).at(-1);if(message&&message!==last&&!job.cancelled){last=message;onProgress({id:job.id,message});}}catch{}},250);poll.unref();
   const exit=await new Promise((resolve,reject)=>{
    const child=spawnProcess(command,[...prefix,directory],{windowsHide:true,shell:false,stdio:'ignore',cwd:path.dirname(command),env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1',MKL_NUM_THREADS:'1',NUMBA_NUM_THREADS:'1'}});job.child=child;
    child.once('error',reject);child.once('close',code=>resolve(code));
    timer=setTimeout(()=>{job.timedOut=true;child.kill();},timeoutMs);timer.unref();
   });aborted();if(job.timedOut)throw Error('STL-Auftrag nach 10 Minuten beendet. Ein einfacheres Netz versuchen.');
   const responsePath=path.join(directory,'response.json');if((await fs.stat(responsePath)).size>32*1024*1024)throw Error('Konverterbericht überschreitet das Limit.');
   const result=JSON.parse(await fs.readFile(responsePath,'utf8'));
   if(result.version!==PROTOCOL||!result.ok||exit!==0)throw Error(result.error||'STL-Konvertierung fehlgeschlagen.');
   if(result.engine!==ENGINE)throw Error('Ungültige Konverterversion.');
   if(action==='analyse'){
    const a=result.analysis;
    if(!a||!Array.isArray(a.faces)||a.faces.length>20000||!Array.isArray(a.vertices)||!Array.isArray(a.regions)||!a.state||a.state.labels?.length!==a.faces.length||a.face_regions?.length!==a.faces.length)throw Error('Ungültige Flächenanalyse.');
    aborted();return {analysis:a};
   }
   if(result.report?.valid!==true||result.report.version!==ENGINE||!Number.isInteger(result.report.solids)||result.report.solids<1)throw Error('Ungültiges Konverterergebnis.');
   const file=path.join(directory,'result.step');if((await fs.stat(file)).size>30*1024*1024)throw Error('STEP-Ergebnis überschreitet Formnaros 30-MB-Importlimit.');
   const bytes=new Uint8Array(await fs.readFile(file));aborted();
   if(crypto.createHash('sha256').update(bytes).digest('hex')!==result.step_sha256||!Buffer.from(bytes.subarray(0,100)).toString().includes('ISO-10303-21'))throw Error('STEP-Ergebnis konnte nicht bestätigt werden.');
   const allowedArtifacts={preview:'result.vorschau.stl',repaired_stl:'result.repariert.stl',repaired_3mf:'result.repariert.3mf'},artifacts={};let size=bytes.length;
   for(const [key,value] of Object.entries(result.artifacts??{})){
    if(!allowedArtifacts[key]||value.file!==allowedArtifacts[key]||!Number.isSafeInteger(value.size)||value.size<0||value.size>64*1024*1024)throw Error('Ungültige Konverter-Netzdatei.');
    const target=path.join(directory,value.file),stat=await fs.stat(target);if(stat.size!==value.size||(size+=stat.size)>128*1024*1024)throw Error('Konverterdateien überschreiten das Limit.');
    const data=new Uint8Array(await fs.readFile(target));
    if(crypto.createHash('sha256').update(data).digest('hex')!==value.sha256)throw Error('Konverter-Netzdatei konnte nicht bestätigt werden.');
    artifacts[key]=data;
   }
   const deviation=result.deviation;
   if(deviation&&(!Array.isArray(deviation.face_indices)||!Array.isArray(deviation.distances_mm)||deviation.face_indices.length!==deviation.distances_mm.length||deviation.face_indices.length>20000||deviation.face_indices.some(v=>!Number.isSafeInteger(v)||v<0)||deviation.distances_mm.some(v=>!Number.isFinite(v)||v<0)||deviation.unit!=='mm'))throw Error('Ungültige Abweichungsansicht.');
   const stem=path.basename(args.name.replaceAll('\\','/')).replace(/\.stl$/i,'');
   result.report.input=args.name;result.report.output=stem+'.step';result.report.report=stem+'.bericht.json';
   result.report.preview=artifacts.preview?stem+'.vorschau.stl':null;
   result.report.repaired_mesh=artifacts.repaired_stl?stem+'.repariert.stl':null;
   result.report.repaired_3mf=artifacts.repaired_3mf?stem+'.repariert.3mf':null;
   aborted();return {bytes,report:result.report,artifacts,deviation};
  }finally{
   clearInterval(poll);clearTimeout(timer);
   try{if(directory)await fs.rm(directory,{recursive:true,force:true});}finally{if(active===job)active=null;done();}
  }
 }
 return {convert:args=>execute({...args,action:'convert'}),analyse:args=>execute({...args,action:'analyse'}),cancel,state:()=>active?{id:active.id,pid:active.child?.pid,cancelled:active.cancelled}:null};
}
function installStlConverter(win,{directory,ipcMain=require('electron').ipcMain,command,prefix}={}){
 const runner=createStlConverter({command:command??path.join(directory,'Formnaro-Konverter.exe'),prefix,onProgress:value=>{if(!win.webContents.isDestroyed())win.webContents.send('cad-stl:progress',value);}});
 const sender=event=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||win.webContents.isDestroyed())throw Error('Invalid window.');};
 for(const action of ['convert','analyse'])ipcMain.handle('cad-stl:'+action,async(event,args)=>{try{sender(event);return {ok:true,value:await runner[action](args)};}catch(error){return {ok:false,error:error.message,code:error.code};}});
 ipcMain.handle('cad-stl:cancel',async(event,args)=>{try{sender(event);if(!args||typeof args.id!=='string')throw Error('Ungültiger Abbruchauftrag.');return {ok:true,value:await runner.cancel(args.id)};}catch(error){return {ok:false,error:error.message};}});
 const stop=()=>{void runner.cancel();};win.once('closed',stop);win.webContents.on('render-process-gone',stop);win.webContents.on('did-start-navigation',(_event,_url,inPlace,mainFrame)=>{if(mainFrame&&!inPlace)stop();});
 return runner;
}
module.exports={runtimeDirectory,validate,createStlConverter,installStlConverter};
