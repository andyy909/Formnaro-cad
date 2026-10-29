const {ipcMain}=require('electron');
const {validatePracticePlan}=require('./practice-runner.cjs');
const fixed={
 'shape:box':'.shape-tile[data-type="box"]:not([data-plugin])','shape:cylinder':'.shape-tile[data-type="cylinder"]:not([data-plugin])',
 'size-0':'#size-0','size-1':'#size-1','size-2':'#size-2','pos-0':'#pos-0','pos-1':'#pos-1','pos-2':'#pos-2',
 'solid-btn':'#solid-btn','hole-btn':'#hole-btn','group':'[data-action="group"]','fit':'button[data-action="fit"]','chat-toggle':'#ai-chat-toggle'
};
const allowedFields=new Set(['size-0','size-1','size-2','pos-0','pos-1','pos-2']);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function installPracticeChild(win,{ipc=ipcMain,channel=process}={}){
 if(typeof channel.send!=='function')throw Error('Übungsfenster benötigt die private Elternverbindung.');
 let nonce=null,ready=false,plan=null,cancelled=false,finished=false,inFlight=false,paused=false,generation=0;const waiting=new Set();
 const wake=()=>{for(const resolve of waiting)resolve();waiting.clear();};
 async function checkpoint(){while(paused&&!cancelled&&!finished)await new Promise(resolve=>waiting.add(resolve));if(cancelled||finished||win.isDestroyed())throw Error('Übung abgebrochen.');}
 const trusted=e=>e.sender===win.webContents&&e.senderFrame===win.webContents.mainFrame&&!win.isDestroyed();
 const reply=(fn)=>async(e,args)=>{try{if(!trusted(e))throw Error('Ungültiges Übungsfenster.');return {ok:true,value:await fn(args)};}catch(error){return {ok:false,error:String(error.message)};}};
 function focusPause(){if(!nonce||!ready||finished||cancelled||win.isDestroyed())return;paused=true;generation++;channel.send?.({type:'status',nonce,paused:true});win.webContents.send('cad-practice:blur',{generation});}
 function deliver(){if(plan&&ready&&!finished){win.webContents.send('cad-practice:plan',plan);if(typeof win.isFocused==='function'&&!win.isFocused())focusPause();}}
 channel.on('message',msg=>{
  if(!msg||typeof msg!=='object')return;
  if(msg.type==='plan'&&!nonce&&/^[a-f0-9]{48}$/.test(msg.nonce??'')){try{plan=validatePracticePlan(msg.plan);nonce=msg.nonce;deliver();}catch{channel.exitCode=1;win.close();}}
  else if(msg.type==='cancel'&&msg.nonce===nonce&&!finished){cancelled=true;wake();win.webContents.send('cad-practice:cancel');}
 });
 channel.on('disconnect',()=>{cancelled=true;wake();if(!win.isDestroyed())win.webContents.send('cad-practice:cancel');});
 win.on?.('blur',focusPause);
 ipc.handle('cad-practice:ready',reply(()=>{ready=true;deliver();return true;}));
 ipc.handle('cad-practice:abort',reply(()=>{cancelled=true;wake();return true;}));
 ipc.handle('cad-practice:status',reply(value=>{if(!nonce||finished||!value||typeof value.paused!=='boolean'||Object.keys(value).some(k=>!['paused','generation'].includes(k)))throw Error('Ungültiger Übungsstatus.');if(!value.paused&&value.generation!==generation)throw Error('Der Fokus hat sich erneut geändert. Bitte Weiter erneut wählen.');if(!value.paused&&typeof win.isFocused==='function'&&!win.isFocused())throw Error('Übungsfenster muss zum Fortsetzen aktiv sein.');paused=value.paused;if(!paused)wake();channel.send?.({type:'status',nonce,paused});return {generation};}));
 ipc.handle('cad-practice:result',reply(value=>{
  if(finished||!nonce||!value||typeof value.ok!=='boolean'||JSON.stringify(value).length>30000||Object.keys(value).some(k=>!['ok','steps','report','reason'].includes(k)))throw Error('Ungültiger Übungsbericht.');finished=true;channel.send?.({type:'result',nonce,value});return true;
 }));
 ipc.handle('cad-practice:input',reply(async input=>{
  if(!plan||!ready||finished||cancelled||inFlight)throw Error('Übung nicht aktiv.');
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['target','action','value','rootId','append'].includes(k)))throw Error('Ungültige Übungseingabe.');
  const {target,action,value,rootId,append}=input;if(!['click','set','locate'].includes(action)||!(target==='tree'||Object.hasOwn(fixed,target)))throw Error('Unbekanntes Übungsziel.');
  if(target==='tree'&&(typeof rootId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(rootId)))throw Error('Ungültiger Objektbezug.');
  if(target!=='tree'&&rootId!==undefined||append!==undefined&&typeof append!=='boolean'||append&&target!=='tree')throw Error('Ungültiger Eingabeparameter.');
  if(action==='set'&&(!allowedFields.has(target)||typeof value!=='string'||value.length>20||!/^[-]?(?:\d+)(?:\.\d{1,6})?$/.test(value)||!Number.isFinite(Number(value))||Math.abs(Number(value))>10000||target.startsWith('size-')&&Number(value)<=0))throw Error('Ungültiger Zahlenwert.');
  if(action!=='set'&&value!==undefined)throw Error('Wert ohne Maßeingabe.');
  inFlight=true;try{
   const selector=target==='tree'?null:fixed[target];
   const script=`(()=>{const selector=${JSON.stringify(selector)},id=${JSON.stringify(rootId??null)};const row=selector?null:[...document.querySelectorAll('#object-list [data-root-id]')].find(n=>n.dataset.rootId===id&&n.dataset.path==='[]');const node=selector?document.querySelector(selector):row?.querySelector(':scope > .object-label');if(!node||node.disabled||!node.getClientRects().length||getComputedStyle(node).visibility==='hidden')throw Error('Übungsziel nicht sichtbar oder deaktiviert.');node.scrollIntoView({block:'nearest',inline:'nearest'});const r=node.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),width:r.width,height:r.height};})()`;
   await checkpoint();const box=await win.webContents.executeJavaScript(script);const bounds=win.getContentBounds();if(!box||box.width<=0||box.height<=0||box.x<0||box.y<0||box.x>=bounds.width||box.y>=bounds.height)throw Error('Übungsziel liegt außerhalb des Fensters.');if(action==='locate')return box;
   await checkpoint();const modifiers=append?['shift']:[];
   win.webContents.sendInputEvent({type:'mouseMove',x:box.x,y:box.y,modifiers});await pause(180);await checkpoint();
   const hitScript=`(()=>{const selector=${JSON.stringify(selector)},id=${JSON.stringify(rootId??null)};const row=selector?null:[...document.querySelectorAll('#object-list [data-root-id]')].find(n=>n.dataset.rootId===id&&n.dataset.path==='[]');const node=selector?document.querySelector(selector):row?.querySelector(':scope > .object-label');const hit=document.elementFromPoint(${box.x},${box.y});return {ok:!!node&&!node.disabled&&!!hit&&(node===hit||node.contains(hit))&&(!!selector||!hit.closest('button')),hit:hit?hit.tagName+'#'+String(hit.id||'').slice(0,80):'none'};})()`;
   let hit;while(true){await checkpoint();hit=await win.webContents.executeJavaScript(hitScript);if(paused)continue;const currentBounds=win.getContentBounds();if(box.x>=currentBounds.width||box.y>=currentBounds.height)throw Error('Übungsziel liegt außerhalb des Fensters.');if(!(hit===true||hit?.ok))throw Error('Das Übungsziel '+target+' wird verdeckt oder hat sich bewegt (Treffer: '+String(hit?.hit??'unbekannt')+').');break;}
   win.webContents.sendInputEvent({type:'mouseDown',x:box.x,y:box.y,button:'left',clickCount:1,modifiers});win.webContents.sendInputEvent({type:'mouseUp',x:box.x,y:box.y,button:'left',clickCount:1,modifiers});
   if(action==='set'){const focusScript=`document.activeElement===document.querySelector(${JSON.stringify(selector)})`;const focused=async()=>{await checkpoint();if(!await win.webContents.executeJavaScript(focusScript))throw Error('Das Eingabefeld hat den Fokus verloren.');await checkpoint();};await pause(120);await focused();win.webContents.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['control']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'A',modifiers:['control']});for(const character of value){await focused();win.webContents.sendInputEvent({type:'char',keyCode:character});await pause(65);}await focused();win.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'});}
   return box;
  }finally{inFlight=false;}
 }));
 channel.send({type:'ready'});
}
module.exports={installPracticeChild};
