const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto'),{spawn}=require('node:child_process');
const {createReadStream}=require('node:fs');
const MAX_SECONDS=180,MAX_BYTES=44+16000*2*MAX_SECONDS;
const MODELS={'small-q5_1':{file:'ggml-small-q5_1.bin',label:'Whisper small'},'large-v3-turbo-q5_0':{file:'ggml-large-v3-turbo-q5_0.bin',label:'Whisper large-v3-turbo'}};
function validateAudio(value){
 if(!(value instanceof Uint8Array)||value.byteLength<44||value.byteLength>MAX_BYTES)throw Error('Die Aufnahme muss zwischen 0,3 und 180 Sekunden lang sein.');
 const b=Buffer.from(value.buffer,value.byteOffset,value.byteLength);
 if(b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE'||b.toString('ascii',12,16)!=='fmt '||b.readUInt32LE(16)!==16||b.readUInt16LE(20)!==1||b.readUInt16LE(22)!==1||b.readUInt32LE(24)!==16000||b.readUInt32LE(28)!==32000||b.readUInt16LE(32)!==2||b.readUInt16LE(34)!==16||b.toString('ascii',36,40)!=='data'||b.readUInt32LE(40)!==b.length-44||b.readUInt32LE(4)!==b.length-8||(b.length-44)%2)throw Error('Ungültige Sprachaufnahme: PCM-WAV, 16 kHz, Mono, 16 Bit erforderlich.');
 const seconds=(b.length-44)/32000;if(seconds<0.3)throw Error('Die Aufnahme ist zu kurz. Bitte einen vollständigen Satz sprechen.');
 let energy=0;for(let i=44;i<b.length;i+=2){const v=b.readInt16LE(i)/32768;energy+=v*v;}
 if(Math.sqrt(energy/((b.length-44)/2))<0.001)throw Error('Keine hörbare Sprache aufgenommen. Mikrofon und Eingangslautstärke prüfen.');
 return {bytes:Buffer.from(b),seconds};
}
function createSpeechService({directory,tempDirectory=os.tmpdir(),spawnProcess=spawn,timeoutMs=10*60*1000,online,modelDirectory,modelStore}={}){
 let active=null,verified=null,epoch=0;
 modelStore??=modelDirectory?require('./speech-model.cjs').createModelStore({directory:modelDirectory}):null;
 async function checkRuntime(){
  if(!verified)verified=(async()=>{
   const manifest=JSON.parse(await fs.readFile(path.join(directory,'manifest.json'),'utf8'));
   if(manifest.engine!=='whisper.cpp'||!Object.hasOwn(MODELS,manifest.model)||!Array.isArray(manifest.files)||!manifest.files.length)throw Error('Ungültiges Sprachpaket.');
   for(const item of manifest.files){
    if(!/^[a-zA-Z0-9_.-]+$/.test(item.name)||! /^[a-f0-9]{64}$/.test(item.sha256))throw Error('Ungültiges Sprachpaket.');
    if(modelStore&&item.name.endsWith('.bin'))continue;
    const digest=createHash('sha256');
    for await(const bytes of createReadStream(path.join(directory,item.name),{highWaterMark:1024*1024}))digest.update(bytes);
    if(digest.digest('hex')!==item.sha256)throw Error('Das lokale Sprachpaket ist beschädigt.');
   }
   const model=MODELS[manifest.model];if(modelStore&&path.basename(modelStore.target)!==model.file)throw Error('Sprachmodell passt nicht zur Sprachlaufzeit.');
   if(!manifest.files.some(f=>f.name==='whisper-cli.exe')||!manifest.files.some(f=>f.name===model.file))throw Error('Das lokale Sprachpaket ist unvollständig.');
   return {available:true,engine:model.label,modelFile:model.file,local:true,maxSeconds:MAX_SECONDS,languages:['de','en','auto']};
  })().catch(e=>{verified=null;throw e;});
  return verified;
 }
 async function status(){
  const progress=modelStore?.progress()??{};
  try{const runtime=await checkRuntime();
   if(modelStore&&!await modelStore.installed())return {...runtime,...progress,available:false,downloadRequired:true,error:'Für lokale Spracheingabe bitte das Sprachmodell herunterladen (574 MB).'};
   return {...runtime,...progress,downloadRequired:false};
  }catch{return {...progress,available:false,local:true,maxSeconds:MAX_SECONDS,error:'Die Sprachlaufzeit fehlt oder ist beschädigt. Bitte Formnaro vollständig neu entpacken.'};}
 }
 async function downloadModel(){if(!modelStore)throw Error('Sprachmodell-Download ist in dieser Ausgabe nicht verfügbar.');const token=epoch;await checkRuntime();if(token!==epoch)throw Error('Download abgebrochen.');return modelStore.download();}

 function cancel(requestId){if(active&&active.id===requestId){active.controller.abort();active.child?.kill();return true;}return false;}
 async function transcribe(args){
  if(!args||typeof args.requestId!=='string'||! /^[a-zA-Z0-9-]{1,80}$/.test(args.requestId)||!['de','en','auto'].includes(args.language??'de')||!['local','online'].includes(args.mode??'local'))throw Error('Ungültige Sprachanfrage.');
  if(active)throw Error('Eine Spracherkennung läuft bereits.');
  const audio=validateAudio(args.bytes),job={id:args.requestId,controller:new AbortController(),child:null};job.done=new Promise(resolve=>job.finished=resolve);active=job;let temp;
  const abort=()=>{if(job.controller.signal.aborted)throw Error('Spracherkennung abgebrochen.');};
  try{
   if(args.mode==='online'){
    if(!online)throw Error('Online-Spracherkennung ist nicht verfügbar.');
    const timeout=setTimeout(()=>job.controller.abort(),Math.min(timeoutMs,60000));
    try{const result=await online.transcribe({bytes:audio.bytes,language:args.language??'de',signal:job.controller.signal});abort();return {...result,seconds:audio.seconds};}finally{clearTimeout(timeout);}
   }
   const runtime=await status();if(!runtime.available)throw Error(runtime.error);abort();await fs.mkdir(tempDirectory,{recursive:true});
   temp=await fs.mkdtemp(path.join(tempDirectory,'formnaro-speech-'));const input=path.join(temp,'input.wav'),output=path.join(temp,'transcript');
   await fs.writeFile(input,audio.bytes);abort();
   const argv=['-m',modelStore?.target??path.join(directory,runtime.modelFile),'-f',input,'-l',args.language??'de','-t',String(Math.max(1,Math.min(8,os.availableParallelism?.()??4))),'-ng','-otxt','-of',output,'-nt','-np','-sns'];
   await new Promise((resolve,reject)=>{
    let timedOut=false,settled=false;const child=spawnProcess(path.join(directory,'whisper-cli.exe'),argv,{cwd:directory,windowsHide:true,shell:false,stdio:['ignore','ignore','ignore']});job.child=child;
    const timer=setTimeout(()=>{timedOut=true;child.kill();},timeoutMs);
    function finish(error){if(settled)return;settled=true;clearTimeout(timer);job.child=null;error?reject(error):resolve();}
    child.once('error',()=>finish(Error('Lokale Spracherkennung konnte nicht gestartet werden.')));
    child.once('close',code=>finish(job.controller.signal.aborted?Error('Spracherkennung abgebrochen.'):timedOut?Error('Spracherkennung hat zu lange gedauert. Bitte eine kürzere Aufnahme versuchen.'):code!==0?Error('Lokale Spracherkennung fehlgeschlagen (Prozesscode '+code+').'):null));
    if(job.controller.signal.aborted)child.kill();
   });abort();
   const stat=await fs.stat(output+'.txt');if(stat.size>100000)throw Error('Der erkannte Text ist zu lang.');
   const text=(await fs.readFile(output+'.txt','utf8')).replace(/^\uFEFF/,'').trim();abort();
   if(!text)throw Error('Keine Sprache erkannt. Bitte deutlicher oder näher am Mikrofon sprechen.');
   return {text,seconds:audio.seconds,local:true,engine:runtime.engine};
  }finally{audio.bytes.fill(0);try{if(temp)await fs.rm(temp,{recursive:true,force:true});}finally{if(active===job)active=null;job.finished();}}
 }
 return {status,transcribe,cancel,downloadModel,cancelModelDownload:()=>modelStore?.cancel()??false,hasActive:()=>!!active||!!modelStore?.hasActive(),async dispose(){epoch++;const job=active;if(job)cancel(job.id);await Promise.all([job?.done,modelStore?.dispose()]);}};
}
function installSpeech(win,{directory,tempDirectory,settingsDirectory,modelDirectory,online,service,ipcMain=require('electron').ipcMain}={}){
 online??=settingsDirectory?require('./speech-online.cjs').createOnlineSpeech({directory:settingsDirectory,safeStorage:require('electron').safeStorage}):undefined;
 service??=createSpeechService({directory,tempDirectory,online,modelDirectory});
 const handle=(name,fn)=>ipcMain.handle(name,async(event,args)=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('Invalid speech window.');try{return {ok:true,value:await fn(args)};}catch(e){return {ok:false,error:e.message};}});
 handle('cad-speech:download-model',()=>service.downloadModel());handle('cad-speech:cancel-download',()=>service.cancelModelDownload());
 handle('cad-speech:status',()=>service.status());handle('cad-speech:transcribe',args=>service.transcribe(args));handle('cad-speech:cancel',args=>service.cancel(args?.requestId));
 handle('cad-speech:online-status',()=>online?.status()??{configured:false,canRemember:false});handle('cad-speech:online-save',args=>{if(!online)throw Error('Online-Sprache ist nicht verfügbar.');return online.save(args);});
 win.on('closed',()=>service.dispose());win.webContents.on('render-process-gone',()=>service.dispose());win.webContents.on('did-start-navigation',(_e,_url,_inPlace,isMain)=>{if(isMain)service.dispose();});
 return service;
}
module.exports={MAX_SECONDS,MAX_BYTES,validateAudio,createSpeechService,installSpeech};
