import {decodeProject} from './model.js';
export const android=typeof window.FormnaroNative?.postMessage==='function';
const pending=new Map();let serial=0;
if(android){
  document.documentElement.classList.add('android');
  window.FormnaroNative.onmessage=event=>{const {id,result}=JSON.parse(event.data),item=pending.get(id);if(item){pending.delete(id);item.resolve(result);}};
}
function call(action,args={}){return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});try{window.FormnaroNative.postMessage(JSON.stringify({id,action,args}));}catch(e){pending.delete(id);reject(e);}});}
export function toBase64(buffer){const bytes=new Uint8Array(buffer);let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);}
export function fromBase64(text){return Uint8Array.from(atob(text),c=>c.charCodeAt(0)).buffer;}
function checked(text){decodeProject(text);return text;}
export const bridge=android?{
  android:true,
  restore:()=>call('restore'),
  autosave:text=>call('autosave',{text:checked(text)}),
  settings:value=>call('settings',value),
  saveProject:(name,text)=>call('saveProject',{name,text:checked(text)}),
  openProject:()=>call('openProject'),
  openSTL:async()=>{const result=await call('openSTL');if(result.ok)result.buffer=fromBase64(result.base64);return result;},
  saveExport:(name,buffer)=>call('saveExport',{name,base64:toBase64(buffer)}),
  libraryList:()=>call('libraryList'),
  librarySave:value=>call('librarySave',{...value,text:checked(value.text)}),
  libraryLoad:id=>call('libraryLoad',{id}),
  libraryThumbnail:id=>call('libraryThumbnail',{id}),
  libraryUpdate:value=>call('libraryUpdate',value),
  onClose:()=>{},closeReady:error=>call('close',{error}),
}:window.miniBridge;
