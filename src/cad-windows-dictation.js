export function createWindowsDictationButton({before,prompt,desktop=window.offlinecadDesktop,language=()=> 'de',onStatus=()=>{}}){
 if(!desktop?.openWindowsDictation)return null;
 const button=document.createElement('button'),english=language()==='en';
 button.id='ai-chat-windows-dictation';button.type='button';button.textContent=english?'Windows dictation':'Windows-Diktat';
 button.title=english?'Windows voice typing (Win+H). Requires internet; Microsoft processes the speech.':'Windows-Spracheingabe (Win+H). Benötigt Internet; Microsoft verarbeitet die Sprache.';
 before.before(button);
 let blocked=false,pending=false,active=false,disposed=false;
 const render=()=>{button.disabled=blocked||pending;};
 button.onmousedown=event=>event.preventDefault();
 button.onclick=async()=>{
  if(blocked||pending||disposed||prompt.disabled||prompt.readOnly)return;
  const wasActive=active;active=true;pending=true;render();prompt.focus({preventScroll:true});
  try{
   await desktop.openWindowsDictation();
   if(!disposed)onStatus(english?'Windows dictation: stop the Windows microphone, review the text, then click Send.':'Windows-Diktat: Windows-Mikrofon stoppen, Text prüfen und anschließend auf Senden klicken.');
  }catch(error){active=wasActive;if(!disposed)onStatus(error.message,true);}
  finally{pending=false;if(!disposed)render();}
 };
 return {setBusy(value){blocked=value;render();},isActive:()=>active,finish(){active=false;},dispose(){disposed=true;active=false;button.remove();}};
}
