const MAX_SECONDS=180,MAX_BYTES=44+16000*2*MAX_SECONDS;
function validateAudio(value){
 if(!(value instanceof Uint8Array)||value.byteLength<44||value.byteLength>MAX_BYTES)throw Error('Die Aufnahme muss zwischen 0,3 und 180 Sekunden lang sein.');
 const b=Buffer.from(value.buffer,value.byteOffset,value.byteLength);
 if(b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE'||b.toString('ascii',12,16)!=='fmt '||b.readUInt32LE(16)!==16||b.readUInt16LE(20)!==1||b.readUInt16LE(22)!==1||b.readUInt32LE(24)!==16000||b.readUInt32LE(28)!==32000||b.readUInt16LE(32)!==2||b.readUInt16LE(34)!==16||b.toString('ascii',36,40)!=='data'||b.readUInt32LE(40)!==b.length-44||b.readUInt32LE(4)!==b.length-8||(b.length-44)%2)throw Error('Ungültige Sprachaufnahme: PCM-WAV, 16 kHz, Mono, 16 Bit erforderlich.');
 const seconds=(b.length-44)/32000;if(seconds<0.3)throw Error('Die Aufnahme ist zu kurz. Bitte einen vollständigen Satz sprechen.');
 let energy=0;for(let i=44;i<b.length;i+=2){const v=b.readInt16LE(i)/32768;energy+=v*v;}
 if(Math.sqrt(energy/((b.length-44)/2))<0.001)throw Error('Keine hörbare Sprache aufgenommen. Mikrofon und Eingangslautstärke prüfen.');
 return {bytes:Buffer.from(b),seconds};
}
function createSpeechService({timeoutMs=60000,online}={}){
 let active=null;
 function cancel(requestId){if(!active||active.id!==requestId)return false;active.controller.abort();return true;}
 async function transcribe(args){
  if(!args||typeof args.requestId!=='string'||! /^[a-zA-Z0-9-]{1,80}$/.test(args.requestId)||!['de','en','auto'].includes(args.language??'de')||args.mode!=='online')throw Error('Ungültige Sprachanfrage.');
  if(active)throw Error('Eine Spracherkennung läuft bereits.');
  if(!online)throw Error('Online-Spracherkennung ist nicht verfügbar.');
  const audio=validateAudio(args.bytes),job={id:args.requestId,controller:new AbortController()};
  job.done=new Promise(resolve=>job.finished=resolve);active=job;
  const timer=setTimeout(()=>job.controller.abort(),timeoutMs);
  try{
   const result=await online.transcribe({bytes:audio.bytes,language:args.language??'de',signal:job.controller.signal});
   if(job.controller.signal.aborted)throw Error('Spracherkennung abgebrochen.');
   return {...result,seconds:audio.seconds};
  }finally{clearTimeout(timer);audio.bytes.fill(0);active=null;job.finished();}
 }
 return {transcribe,cancel,hasActive:()=>!!active,async dispose(){const job=active;if(job){cancel(job.id);await job.done;}}};
}
function installSpeech(win,{settingsDirectory,online,service,ipcMain=require('electron').ipcMain}={}){
 online??=settingsDirectory?require('./speech-online.cjs').createOnlineSpeech({directory:settingsDirectory,safeStorage:require('electron').safeStorage}):undefined;
 service??=createSpeechService({online});
 const handle=(name,fn)=>ipcMain.handle(name,async(event,args)=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('Invalid speech window.');try{return {ok:true,value:await fn(args)};}catch(e){return {ok:false,error:e.message};}});
 handle('cad-speech:transcribe',args=>service.transcribe(args));handle('cad-speech:cancel',args=>service.cancel(args?.requestId));
 handle('cad-speech:online-status',()=>online?.status()??{configured:false,canRemember:false});handle('cad-speech:online-save',args=>{if(!online)throw Error('Online-Sprache ist nicht verfügbar.');return online.save(args);});
 win.on('closed',()=>service.dispose());win.webContents.on('render-process-gone',()=>service.dispose());win.webContents.on('did-start-navigation',(_e,_url,_inPlace,isMain)=>{if(isMain)service.dispose();});
 return service;
}
module.exports={MAX_SECONDS,MAX_BYTES,validateAudio,createSpeechService,installSpeech};
