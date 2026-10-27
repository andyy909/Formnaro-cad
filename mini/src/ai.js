import {createCadAIUI} from './ai-core/cad-ai-ui.js';
import {createMiniAIAccess} from './ai-access.js';
import './ai-mini.css';
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
export async function mountMiniAI(app){
 const access=createMiniAIAccess(app);await access.ready();
 let modal=document.getElementById('modal');if(!modal){modal=document.createElement('dialog');modal.id='modal';document.body.append(modal);}
 const openModal=(title,html)=>{modal.innerHTML='<div class="dialog-heading"><h2></h2><button id="ai-modal-close">Schließen</button></div><div id="ai-modal-content"></div>';modal.querySelector('h2').textContent=title;modal.querySelector('#ai-modal-content').innerHTML=html;modal.querySelector('#ai-modal-close').onclick=()=>modal.close();if(!modal.open)modal.showModal();};
 const download=(data,name,type)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
 let ui;const settingsOpen=()=>{openModal('KI-Einstellungen','<div id="ai-settings-root"></div>');void ui.mountSettings(document.getElementById('ai-settings-root'));};
 ui=createCadAIUI({access,modal:openModal,download,captureCanvas:app.screenshot,language:()=> 'de',showPreview:access.show,clearPreview:app.clearPreview,settingsOpen,cancelComputation:access.cancel});
 const rpc=async(method,args)=>{if(method==='context')return access.context();if(method==='scene')return access.sceneForAI();if(method==='project')return access.project();if(method==='preview')return access.preview(args);if(method==='apply')return access.apply(args);if(method==='export')return app.export(args);if(method==='screenshot'){const f=await app.screenshot(),bytes=new Uint8Array(await f.arrayBuffer());let raw='';for(let i=0;i<bytes.length;i+=16384)raw+=String.fromCharCode(...bytes.subarray(i,i+16384));return {mime:'image/png',base64:btoa(raw)};}fail('API_METHOD','Unbekannte lokale Anfrage.');};
 return {access,ui,rpc,open:()=>ui.openChat(),settingsOpen};
}
