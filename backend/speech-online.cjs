const fs=require('node:fs'),path=require('node:path');
const {writeAtomicSync}=require('./program-storage.cjs');
function createOnlineSpeech({directory,safeStorage,fetcher=(...args)=>globalThis.fetch(...args),write=writeAtomicSync}={}){
 const file=path.join(directory,'Sprache-Online.json');let encrypted='';
 try{const stat=fs.lstatSync(file);if(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=8192){const value=JSON.parse(fs.readFileSync(file,'utf8'));if(value.version===1&&typeof value.encryptedKey==='string'&&value.encryptedKey.length<=4096)encrypted=value.encryptedKey;}}catch{/* Missing or unreadable settings remain unavailable. */}
 const status=()=>({configured:!!encrypted,canRemember:!!safeStorage?.isEncryptionAvailable(),provider:'Deepgram Nova-3'});
 function save({key,clear}={}){
  if(clear===true){if(fs.existsSync(file))fs.unlinkSync(file);encrypted='';return status();}
  if(typeof key!=='string'||!key.trim()||key.length>512||/[\r\n\x00-\x1f]/.test(key))throw Error('Bitte einen gültigen Deepgram-Schlüssel eingeben.');
  if(!safeStorage?.isEncryptionAvailable())throw Error('Windows-Verschlüsselung für den Sprachschlüssel ist nicht verfügbar.');
  const next=safeStorage.encryptString(key.trim()).toString('base64');fs.mkdirSync(directory,{recursive:true});write(file,JSON.stringify({version:1,encryptedKey:next})+'\n');encrypted=next;return status();
 }
 async function transcribe({bytes,language,signal}){
  if(!encrypted)throw Error('Bitte zuerst einen Deepgram-Schlüssel für die Online-Spracheingabe einrichten.');
  let key;try{key=safeStorage.decryptString(Buffer.from(encrypted,'base64'));}catch{throw Error('Der gespeicherte Deepgram-Schlüssel kann nicht entschlüsselt werden.');}
  if(!key)throw Error('Der gespeicherte Deepgram-Schlüssel ist leer.');
  const params=new URLSearchParams({model:'nova-3',smart_format:'true',...(language==='auto'?{detect_language:'true'}:{language})});
  let response;try{response=await fetcher('https://api.deepgram.com/v1/listen?'+params,{method:'POST',headers:{Authorization:'Token '+key,'Content-Type':'audio/wav'},body:bytes,signal,redirect:'error'});}catch(e){if(signal?.aborted)throw Error('Spracherkennung abgebrochen.');throw Error('Deepgram ist nicht erreichbar. Internetverbindung prüfen.');}finally{key='';}
  if(!response.ok)throw Error('Deepgram-Spracherkennung fehlgeschlagen (HTTP '+response.status+'). Schlüssel und Guthaben prüfen.');
  if(Number(response.headers.get('content-length'))>1000000)throw Error('Deepgram-Antwort ist zu groß.');
  let data;try{const raw=await response.text();if(raw.length>1000000)throw Error();data=JSON.parse(raw);}catch{throw Error('Deepgram lieferte keine lesbare Sprachantwort.');}
  const text=data?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
  if(typeof text!=='string'||!text.trim())throw Error('Keine Sprache erkannt. Bitte deutlicher oder näher am Mikrofon sprechen.');
  if(text.length>100000)throw Error('Der erkannte Text ist zu lang.');
  return {text:text.trim(),local:false,engine:'Deepgram Nova-3'};
 }
 return {status,save,transcribe};
}
module.exports={createOnlineSpeech};
