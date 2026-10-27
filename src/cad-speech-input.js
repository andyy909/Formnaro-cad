import {decodeSpeechRecording,appendSpeechText,SPEECH_MAX_SECONDS} from './speech-audio.js';
export function createSpeechInput({host,prompt,desktop=window.offlinecadDesktop,onBusy=()=>{},language=()=> 'de',mediaDevices=navigator.mediaDevices,Recorder=globalThis.MediaRecorder,decode=decodeSpeechRecording}={}){
 const root=document.createElement('div');root.className='speech-input';root.innerHTML='<div class="speech-controls"><button type="button" id="ai-chat-mic" aria-label="Sprache aufnehmen">🎙 Sprechen</button><button type="button" id="ai-chat-mic-cancel" hidden>Aufnahme verwerfen</button><label>Sprache <select id="ai-chat-speech-language" aria-label="Sprache der Aufnahme"><option value="de">Deutsch</option><option value="en">English</option><option value="auto">Automatisch</option></select></label></div><p id="ai-chat-speech-status" role="status" aria-live="polite">Lokal mit Whisper · Text vor dem Senden prüfen</p><div id="ai-chat-speech-result" hidden><label>Erkannter Text<textarea id="ai-chat-transcript" rows="3"></textarea></label><button id="ai-chat-speech-insert" type="button">In Nachricht einfügen</button><button id="ai-chat-speech-dismiss" type="button">Verwerfen</button></div>';
 host.append(root);const el=id=>root.querySelector('#'+id),button=el('ai-chat-mic'),cancelButton=el('ai-chat-mic-cancel'),select=el('ai-chat-speech-language'),status=el('ai-chat-speech-status'),result=el('ai-chat-speech-result'),transcript=el('ai-chat-transcript');
 let phase='idle',externalBusy=false,disposed=false,generation=0,stream=null,recorder=null,timer=null,start=0,chunks=[],chunkBytes=0,requestId=null,stopping=false;
 const english=language()==='en';if(english){button.setAttribute('aria-label','Record speech');select.setAttribute('aria-label','Recording language');select.value='en';status.textContent='Local Whisper · Review text before sending';cancelButton.textContent='Discard recording';el('ai-chat-speech-insert').textContent='Insert into message';el('ai-chat-speech-dismiss').textContent='Discard';}
 function say(text,error=false){if(disposed)return;status.textContent=text;status.classList.toggle('ai-error',error);}
 function render(){if(disposed)return;const working=phase!=='idle';button.disabled=externalBusy||phase==='starting'||phase==='transcribing'||phase==='stopping';button.textContent=phase==='recording'?(english?'■ Stop':'■ Stoppen'):(english?'🎙 Speak':'🎙 Sprechen');button.setAttribute('aria-pressed',String(phase==='recording'));root.classList.toggle('recording',phase==='recording');cancelButton.hidden=!working;select.disabled=working||externalBusy;el('ai-chat-speech-insert').disabled=working||externalBusy;}
 function change(next){phase=next;render();onBusy(next!=='idle');}
 function stopTracks(){if(timer!==null)clearInterval(timer);timer=null;stream?.getTracks().forEach(t=>t.stop());stream=null;}
 async function cancel(){generation++;const id=requestId;requestId=null;chunks=[];chunkBytes=0;const current=recorder;recorder=null;if(current&&current.state!=='inactive')current.stop();stopTracks();stopping=false;change('idle');say(english?'Recording discarded.':'Aufnahme verworfen.');if(id)await desktop?.cancelSpeech?.({requestId:id}).catch(()=>{});}
 async function insert(){try{prompt.value=appendSpeechText(prompt.value,transcript.value,prompt.maxLength>0?prompt.maxLength:10000);prompt.dispatchEvent(new Event('input',{bubbles:true}));result.hidden=true;transcript.value='';prompt.focus();say(english?'Text inserted. Check dimensions, then send.':'Text eingefügt. Maße prüfen und anschließend senden.');}catch(e){say(e.message,true);result.hidden=false;}}
 async function finish(token,mime){
  if(disposed||token!==generation)return;stopTracks();recorder=null;stopping=false;change('transcribing');say(english?'Recognizing speech locally …':'Sprache wird lokal erkannt …');
  let bytes;try{
   const blob=new Blob(chunks,{type:mime});chunks=[];chunkBytes=0;bytes=await decode(blob);if(disposed||token!==generation)return;
   requestId=crypto.randomUUID();const reply=await desktop.transcribeSpeech({requestId,language:select.value,bytes});if(disposed||token!==generation)return;
   transcript.value=reply.text;result.hidden=false;await insert();
  }catch(e){if(!disposed&&token===generation)say(e.message,true);}finally{bytes?.fill(0);if(token===generation){requestId=null;change('idle');if(!disposed)prompt.focus();}}
 }
 function stop(){if(phase!=='recording'||stopping)return;stopping=true;change('stopping');say(english?'Finishing recording …':'Aufnahme wird beendet …');if(recorder?.state!=='inactive')recorder.stop();stopTracks();}
 async function record(){
  if(externalBusy||phase!=='idle')return;const token=++generation;change('starting');say(english?'Preparing microphone …':'Mikrofon wird vorbereitet …');
  try{
   if(!desktop?.transcribeSpeech||!Recorder||!mediaDevices?.getUserMedia)throw Error('Spracheingabe ist in der portablen Desktop-Ausgabe verfügbar.');
   const available=await desktop.getSpeechStatus();if(disposed||token!==generation)return;if(!available.available)throw Error(available.error);
   const acquired=await mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});
   if(disposed||token!==generation){acquired.getTracks().forEach(t=>t.stop());return;}stream=acquired;
   const mime=['audio/webm;codecs=opus','audio/webm'].find(m=>Recorder.isTypeSupported(m));if(!mime)throw Error('Dieses Programm kann keine Mikrofonaufnahme erstellen.');
   chunks=[];chunkBytes=0;recorder=new Recorder(stream,{mimeType:mime,audioBitsPerSecond:64000});
   recorder.ondataavailable=e=>{if(token!==generation||disposed||!e.data.size)return;chunkBytes+=e.data.size;if(chunkBytes>24*1024*1024){void cancel();say('Aufnahme zu groß. Bitte kürzer aufnehmen.',true);return;}chunks.push(e.data);};
   recorder.onerror=()=>{void cancel();say(english?'Microphone recording failed.':'Mikrofonaufnahme fehlgeschlagen.',true);};
   recorder.onstop=()=>void finish(token,mime);
   for(const track of stream.getAudioTracks())track.onended=()=>{if(phase==='recording')stop();};
   recorder.start(500);start=Date.now();change('recording');
   function tick(){const seconds=Math.floor((Date.now()-start)/1000);say((english?'Recording · ':'Aufnahme läuft · ')+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+' / 3:00');if(seconds>=SPEECH_MAX_SECONDS)stop();}tick();timer=setInterval(tick,250);
  }catch(e){if(disposed||token!==generation)return;stopTracks();change('idle');say(e.name==='NotAllowedError'?'Mikrofonzugriff nicht erlaubt. Bitte die Mikrofonberechtigung in Windows prüfen.':e.name==='NotFoundError'?'Kein Mikrofon gefunden. Bitte ein Mikrofon anschließen.':e.message,true);}
 }
 button.onclick=()=>phase==='recording'?stop():void record();cancelButton.onclick=()=>void cancel();el('ai-chat-speech-insert').onclick=()=>void insert();el('ai-chat-speech-dismiss').onclick=()=>{result.hidden=true;transcript.value='';};
 render();return {setBusy(value){externalBusy=value;render();},isBusy:()=>phase!=='idle',cancel,state:()=>phase,dispose(){disposed=true;void cancel();root.remove();}};
}
