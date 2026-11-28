const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const LIMIT=50*1024*1024,ENGINE='0.10.0',PROTOCOL=2;
const JSON_LIMIT=5*1024*1024;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const point=value=>Array.isArray(value)&&value.length===3&&value.every(finite);
function validateRepairAdmission(report,options){
 const repairs=report?.repairs;
 if(!repairs||repairs.applied!==true)return null;
 const a=repairs.admission;
 if(!a||typeof a!=='object'||Array.isArray(a))throw Error('Reparatur abgelehnt: Der Bericht enthält keine Abweichungsprüfung.');
 if(a.accepted!==true)throw Error(`Reparatur abgelehnt: ${typeof a.reason==='string'?a.reason:'Abweichungsprüfung nicht bestanden'}.`);
 if(!finite(a.threshold_mm)||Math.abs(a.threshold_mm-options.tolerance)>1e-12)throw Error(`Reparatur abgelehnt: Der Bericht prüft die Schwelle ${a.threshold_mm} mm statt des Abweichungsbudgets ${options.tolerance} mm.`);
 const directions=a.measurement?.directions,first=directions?.original_to_repaired,second=directions?.repaired_to_original;
 for(const [name,direction] of [['Original→Reparatur',first],['Reparatur→Original',second]]){
  if(!direction||!integer(direction.points,500,120000)||!finite(direction.max_mm)||direction.max_mm<0||!point(direction.max_point_mm)||direction.unit!=='mm')throw Error(`Reparatur abgelehnt: Die beidseitige Oberflächenstichprobe in Richtung ${name} fehlt im Bericht.`);
 }
 const decided=a.measurement?.decided_by,skin=a.measurement?.outer_skin;
 if(decided==='outer-skin'){
  if(skin?.method!=='outer-skin-v1')throw Error('Reparatur abgelehnt: Ein Außenhaut-Entscheid ohne die freigegebene Methode outer-skin-v1 ist ungültig.');
  if(!finite(skin.excluded_neighbourhood_mm)||Math.abs(skin.excluded_neighbourhood_mm-0.5)>1e-12)throw Error(`Reparatur abgelehnt: Der Außenhaut-Entscheid muss die Nachbarschaft 0,5 mm verwenden (angegeben: ${skin.excluded_neighbourhood_mm} mm).`);
  if(!finite(skin.budget_mm)||Math.abs(skin.budget_mm-options.tolerance)>1e-12)throw Error(`Reparatur abgelehnt: Der Außenhaut-Entscheid prüft die Schwelle ${skin.budget_mm} mm statt des Abweichungsbudgets ${options.tolerance} mm.`);
  if(!integer(skin.excluded_faces,1,10000000)||!finite(skin.excluded_area_mm2)||!(skin.excluded_area_mm2>0))throw Error('Reparatur abgelehnt: Beim Außenhaut-Entscheid fehlen Fläche und Dreieckszahl der belegten Ausschlusszone.');
  if(!finite(a.measurement.max_mm)||Math.abs(a.measurement.max_mm-Math.max(first.max_mm,second.max_mm))>1e-9)throw Error('Reparatur abgelehnt: Der Außenhaut-Höchstwert stimmt nicht mit den beiden Richtungen überein.');
  const raw=a.measurement.raw?.directions;
  for(const [name,direction] of [['Original→Reparatur',raw?.original_to_repaired],['Reparatur→Original',raw?.repaired_to_original]]){
   if(!direction||!integer(direction.points,500,120000)||!finite(direction.max_mm)||direction.max_mm<0||direction.unit!=='mm')throw Error(`Reparatur abgelehnt: Der Rohvergleich in Richtung ${name} fehlt beim Außenhaut-Entscheid.`);
  }
 }
 if(!integer(a.measurement?.samples_per_direction,500,120000))throw Error('Reparatur abgelehnt: Die Zahl der Prüfpunkte fehlt im Bericht.');
 for(const phase of ['before','after']){
  const topology=a.topology?.[phase];
  if(!topology||!integer(topology.faces,1,10000000)||!integer(topology.edges,0,30000000)||!integer(topology.openings,0,1000000))throw Error('Reparatur abgelehnt: Topologie (Flächen/Kanten/Löcher) fehlt im Bericht.');
 }
 if(a.openings?.bridged===true)throw Error(`Reparatur abgelehnt: Eine Öffnung wurde überbrückt (Löcher ${a.topology.before.openings}→${a.topology.after.openings}, Randkanten ${a.openings.boundary_edges_before}→${a.openings.boundary_edges_after}).`);
 if(a.outside_repair_region?.preserved!==true)throw Error(`Reparatur abgelehnt: Außerhalb des Reparaturbereichs sind nur ${a.outside_repair_region?.faces??0} Flächen erhalten.`);
 const worst=first.max_mm>=second.max_mm?first:second,direction=first.max_mm>=second.max_mm?'Original→Reparatur':'Reparatur→Original';
 if(worst.max_mm>options.tolerance+1e-9)throw Error(`Reparatur abgelehnt: Formabweichung ${worst.max_mm.toFixed(6)} mm in Richtung ${direction} über der Schwelle ${options.tolerance} mm (Stichprobe ${worst.points} Punkte, Lage [${worst.max_point_mm.map(v=>v.toFixed(3)).join(', ')}]); gemessen Original→Reparatur ${first.max_mm.toFixed(6)} mm, Reparatur→Original ${second.max_mm.toFixed(6)} mm.`);
 const fassung=a.fassung;
 if(!fassung||fassung.version!==1||!['id','origin_sha256','result_sha256'].every(key=>typeof fassung[key]==='string'&&/^[a-f0-9]{64}$/.test(fassung[key])))throw Error('Reparatur abgelehnt: Die Fassungskennung der Reparatur fehlt im Bericht.');
 if(!finite(fassung.budget_mm)||!integer(fassung.samples,500,120000))throw Error('Reparatur abgelehnt: Die Fassungsangaben sind unvollständig.');
 return fassung;
}

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
async function readArtifacts(directory,descriptors){
 const allowedArtifacts={preview:'result.vorschau.stl',repaired_stl:'result.repariert.stl',repaired_3mf:'result.repariert.3mf'},artifacts={},artifactHashes={};let size=0;
 for(const [key,value] of Object.entries(descriptors??{})){
  if(!allowedArtifacts[key]||value.file!==allowedArtifacts[key]||!Number.isSafeInteger(value.size)||value.size<0||value.size>64*1024*1024)throw Error('Ungültige Konverter-Netzdatei.');
  const target=path.join(directory,value.file),stat=await fs.stat(target);if(stat.size!==value.size||(size+=stat.size)>128*1024*1024)throw Error('Konverterdateien überschreiten das Limit.');
  const data=new Uint8Array(await fs.readFile(target));
  if(crypto.createHash('sha256').update(data).digest('hex')!==value.sha256)throw Error('Konverter-Netzdatei konnte nicht bestätigt werden.');
  artifacts[key]=data;artifactHashes[key]=value.sha256;
 }
 return {artifacts,artifactHashes,size};
}
function createStlConverter({command,prefix=[],tempRoot=os.tmpdir(),timeoutMs=600000,onProgress=()=>{},spawnProcess=spawn}={}){
 let active=null;
 const childEnvironment=()=>{const env={};for(const key of ['SystemRoot','SYSTEMROOT','WINDIR','ComSpec','COMSPEC','SystemDrive','PATH','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMDATA','ProgramFiles','ProgramFiles(x86)','OS','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS'])if(process.env[key])env[key]=process.env[key];return {...env,PYTHONNOUSERSITE:'1',PYTHONDONTWRITEBYTECODE:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1',MKL_NUM_THREADS:'1',NUMBA_NUM_THREADS:'1'};};
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
    const child=spawnProcess(command,[...prefix,directory],{windowsHide:true,shell:false,stdio:'ignore',cwd:path.dirname(command),env:childEnvironment()});job.child=child;
    child.once('error',reject);child.once('close',code=>resolve(code));
    timer=setTimeout(()=>{job.timedOut=true;child.kill();},timeoutMs);timer.unref();
   });aborted();if(job.timedOut)throw Error('STL-Auftrag nach 10 Minuten beendet. Ein einfacheres Netz versuchen.');
   const responsePath=path.join(directory,'response.json');if((await fs.stat(responsePath)).size>32*1024*1024)throw Error('Konverterbericht überschreitet das Limit.');
   const result=JSON.parse(await fs.readFile(responsePath,'utf8'));
   if(result.version!==PROTOCOL)throw Error('Ungültige Konverterversion.');
   const step=result.report?.step,admission=result.report?.repairs?.admission;
   const repairOnly=result.ok===false&&!!step&&['failed','not_attempted'].includes(step.status)&&admission?.accepted===true&&result.report?.repair?.accepted===true&&options.repair===true;
   if(!repairOnly&&(!result.ok||exit!==0))throw Error(result.error||'STL-Konvertierung fehlgeschlagen.');
   if(result.engine!==ENGINE)throw Error('Ungültige Konverterversion.');
   if(action==='analyse'){
    const a=result.analysis;
    if(!a||!Array.isArray(a.faces)||a.faces.length>20000||!Array.isArray(a.vertices)||!Array.isArray(a.regions)||!a.state||a.state.labels?.length!==a.faces.length||a.face_regions?.length!==a.faces.length)throw Error('Ungültige Flächenanalyse.');
    aborted();return {analysis:a};
   }
   const stem=path.basename(args.name.replaceAll('\\','/')).replace(/\.stl$/i,'');
   if(repairOnly){
    const repairFassung=validateRepairAdmission(result.report,options);
    const part=await readArtifacts(directory,result.artifacts);
    if(!part.artifacts.repaired_stl||!part.artifacts.repaired_3mf)throw Error('Die bestätigten Reparaturdateien fehlen im Konverterergebnis.');
    if(repairFassung){
     const fassung={...repairFassung,input:args.name,input_sha256:crypto.createHash('sha256').update(args.bytes).digest('hex'),repaired_stl_sha256:part.artifactHashes.repaired_stl};
     result.report.repair_fassung=fassung;
    }
    result.report.input=args.name;result.report.output=null;result.report.report=stem+'.bericht.json';
    result.report.preview=null;result.report.repaired_mesh=stem+'.repariert.stl';result.report.repaired_3mf=stem+'.repariert.3mf';
    aborted();
    return {bytes:null,report:result.report,artifacts:part.artifacts,deviation:null,repairOnly:true,
            error:result.error||step.message||'STEP-Aufbau fehlgeschlagen.'};
   }
   if(result.report?.valid!==true||result.report.version!==ENGINE||!Number.isInteger(result.report.solids)||result.report.solids<1)throw Error('Ungültiges Konverterergebnis.');
   const repairFassung=validateRepairAdmission(result.report,options);
   const file=path.join(directory,'result.step');if((await fs.stat(file)).size>30*1024*1024)throw Error('STEP-Ergebnis überschreitet Formnaros 30-MB-Importlimit.');
   const bytes=new Uint8Array(await fs.readFile(file));aborted();
   if(crypto.createHash('sha256').update(bytes).digest('hex')!==result.step_sha256||!Buffer.from(bytes.subarray(0,100)).toString().includes('ISO-10303-21'))throw Error('STEP-Ergebnis konnte nicht bestätigt werden.');
   const part=await readArtifacts(directory,result.artifacts),{artifacts,artifactHashes}=part;
   if(bytes.length+part.size>128*1024*1024)throw Error('Konverterdateien überschreiten das Limit.');
   if(repairFassung){
    const fassung={...repairFassung,input:args.name,input_sha256:crypto.createHash('sha256').update(args.bytes).digest('hex')};
    if(artifactHashes.repaired_stl)fassung.repaired_stl_sha256=artifactHashes.repaired_stl;
    result.report.repair_fassung=fassung;
   }
   const deviation=result.deviation;
   if(deviation&&(!Array.isArray(deviation.face_indices)||!Array.isArray(deviation.distances_mm)||deviation.face_indices.length!==deviation.distances_mm.length||deviation.face_indices.length>20000||deviation.face_indices.some(v=>!Number.isSafeInteger(v)||v<0)||deviation.distances_mm.some(v=>!Number.isFinite(v)||v<0)||deviation.unit!=='mm'))throw Error('Ungültige Abweichungsansicht.');
   result.report.input=args.name;result.report.output=stem+'.step';result.report.report=stem+'.bericht.json';
   result.report.preview=artifacts.preview?stem+'.vorschau.stl':null;
   result.report.repaired_mesh=artifacts.repaired_stl?stem+'.repariert.stl':null;
   result.report.repaired_3mf=artifacts.repaired_3mf?stem+'.repariert.3mf':null;
   aborted();return {bytes,report:result.report,artifacts,deviation};
  }finally{
   clearInterval(poll);clearTimeout(timer);
   try{if(directory)await fs.rm(directory,{recursive:true,force:true,maxRetries:3,retryDelay:50}).catch(()=>{});}finally{if(active===job)active=null;done();}
  }
 }
 return {convert:args=>execute({...args,action:'convert'}),analyse:args=>execute({...args,action:'analyse'}),cancel,state:()=>active?{id:active.id,pid:active.child?.pid,cancelled:active.cancelled}:null};
}
function installStlConverter(win,{directory,ipcMain=require('electron').ipcMain,command,prefix,tempRoot,waitForClose=false}={}){
 const runner=createStlConverter({command:command??path.join(directory,'Formnaro-Konverter.exe'),prefix,tempRoot,onProgress:value=>{if(!win.webContents.isDestroyed())win.webContents.send('cad-stl:progress',value);}});
 const sender=event=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||win.webContents.isDestroyed())throw Error('Invalid window.');};
 for(const action of ['convert','analyse'])ipcMain.handle('cad-stl:'+action,async(event,args)=>{try{sender(event);return {ok:true,value:await runner[action](args)};}catch(error){return {ok:false,error:error.message,code:error.code};}});
 ipcMain.handle('cad-stl:cancel',async(event,args)=>{try{sender(event);if(!args||typeof args.id!=='string')throw Error('Ungültiger Abbruchauftrag.');return {ok:true,value:await runner.cancel(args.id)};}catch(error){return {ok:false,error:error.message};}});
 if(waitForClose){
  let closing=false;
  win.on('close',event=>{
   if(!runner.state())return;
   event.preventDefault();
   if(closing)return;
   closing=true;
   void runner.cancel().finally(()=>{if(!win.isDestroyed())win.close();});
  });
 }
 const stop=()=>{void runner.cancel();};win.once('closed',stop);win.webContents.on('render-process-gone',stop);win.webContents.on('did-start-navigation',(_event,_url,inPlace,mainFrame)=>{if(mainFrame&&!inPlace)stop();});
 return runner;
}
module.exports={runtimeDirectory,validate,createStlConverter,installStlConverter};
