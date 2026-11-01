export function mountSpeechModel({host,desktop,english=false}){
 const root=document.createElement('div');root.className='speech-model-setup';
 root.innerHTML='<p class="small-note" data-model-description></p><button type="button" id="ai-chat-speech-download"></button> <button type="button" id="ai-chat-speech-download-cancel" hidden></button><progress id="ai-chat-speech-download-progress" max="100" hidden aria-label="Download"></progress><p id="ai-chat-speech-download-state" class="small-note" role="status" aria-live="polite"></p>';
 host.prepend(root);
 const button=root.querySelector('#ai-chat-speech-download'),cancel=root.querySelector('#ai-chat-speech-download-cancel'),progress=root.querySelector('progress'),state=root.querySelector('[role=status]');
 root.querySelector('[data-model-description]').textContent=english?'Optional offline speech recognition: download the model once (574 MB). It stays in the portable data folder and then works without Internet.':'Optionale Offline-Spracheingabe: Sprachmodell einmal herunterladen (574 MB). Es bleibt im portablen Datenordner und funktioniert danach ohne Internet.';
 button.textContent=english?'Download speech model · 574 MB':'Sprachmodell herunterladen · 574 MB';cancel.textContent=english?'Cancel download':'Download abbrechen';
 let disposed=false,timer=null,requesting=false;
 function render(info){
  if(disposed)return;
  const downloading=!!info.downloading;button.hidden=!!info.available;button.disabled=downloading||!info.downloadRequired;cancel.hidden=!downloading;progress.hidden=!downloading;
  progress.value=info.modelBytes?Math.min(100,100*info.downloadedBytes/info.modelBytes):0;
  state.textContent=info.available?(english?'Offline speech model installed.':'Offline-Sprachmodell installiert.'):downloading?(english?'Downloading: ':'Download: ')+Math.floor((info.downloadedBytes??0)/1000000)+' / '+Math.ceil((info.modelBytes??574041195)/1000000)+' MB':info.downloadError??(info.downloadRequired?(english?'No download starts automatically.':'Der Download startet erst per Klick.'):info.error??'');
 }
 async function refresh(){
  if(disposed)return;clearTimeout(timer);
  try{const info=await desktop.getSpeechStatus();render(info);if(!disposed&&(info.downloading||requesting))timer=setTimeout(refresh,500);}
  catch(error){if(!disposed)state.textContent=error.message;}
 }
 button.onclick=async()=>{
  if(requesting||disposed)return;requesting=true;button.disabled=true;
  try{const pending=desktop.downloadSpeechModel();void refresh();await pending;}
  catch(error){if(!disposed)state.textContent=error.message;}
  finally{requesting=false;await refresh();}
 };
 cancel.onclick=async()=>{try{await desktop.cancelSpeechModelDownload();await refresh();}catch(error){if(!disposed)state.textContent=error.message;}};
 if(!desktop?.downloadSpeechModel||!desktop?.getSpeechStatus)root.hidden=true;else void refresh();
 return {dispose(){disposed=true;clearTimeout(timer);root.remove();}};
}
