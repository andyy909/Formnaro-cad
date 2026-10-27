import sandboxFrameURL from './sandbox-frame.html?url';
// User/model JavaScript runs only in a dedicated Worker created by an opaque
// sandbox frame. CSP is inherited by its blob Worker and blocks all external
// code/network loads. The frame has no same-origin privilege or desktop bridge.
// All model effects travel through the small RPC capability provided by caller.
export function sandboxWorkerMain(){
 let sequence=0;const pending=new Map();
 const rpc=(method,args)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});postMessage({type:'call',id,method,args});});
 onmessage=async event=>{
  const m=event.data;
  if(m.type==='reply'){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(Object.assign(Error(m.error.message),{code:m.error.code})):p.resolve(m.value);return;}
  if(m.type!=='start')return;
  try{
   const modules=new Map(Object.entries(m.modules??{})),loaded=new Map();
   async function importTool(name,source){
    if(typeof name!=='string'||!name||name.length>200)throw Error('Werkzeugmodul braucht einen Namen.');
    if(source!==undefined){if(typeof source!=='string'||source.length>1000000||modules.size>=32)throw Error('Ungültiges Werkzeugmodul.');if(modules.has(name)&&modules.get(name)!==source)throw Error('Werkzeugmodul ist bereits vorhanden.');modules.set(name,source);}
    if(!modules.has(name))throw Error('Werkzeugmodul wurde nicht im Programm bereitgestellt.');
    // Keep the import inside a runtime function: bundlers otherwise inject a
    // renderer preload helper/import.meta into this serialized Worker body.
    if(!loaded.has(name)){const url=URL.createObjectURL(new Blob([modules.get(name)],{type:'text/javascript'})),load=new Function('url','return import(url);');loaded.set(name,load(url).finally(()=>URL.revokeObjectURL(url)));}
    return loaded.get(name);
   }
   const api=Object.freeze({model:()=>rpc('model'),query:args=>rpc('query',args),run:command=>rpc('run',command),importTool});
   Object.defineProperty(globalThis,'formnaro',{value:api});
   const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
   const value=await new AsyncFunction('api','"use strict";\n'+m.code)(api);
   postMessage({type:'done',value:value??null});
  }catch(error){postMessage({type:'failed',error:{message:String(error.message??error),code:String(error.code??'AI_SCRIPT')}});}
 };
}
export function sandboxFrameSource(channel){
 const bootstrap=`(${sandboxWorkerMain.toString()})();`;
 const frame=()=>{
  const token=CHANNEL,worker=new Worker(URL.createObjectURL(new Blob([BOOTSTRAP],{type:'text/javascript'})));
  worker.onmessage=e=>parent.postMessage({channel:token,...e.data},'*');
  worker.onerror=e=>parent.postMessage({channel:token,type:'failed',error:{message:'Lokale Berechnung fehlgeschlagen. '+String(e.message??''),code:'AI_SCRIPT'}},'*');
  addEventListener('message',e=>{if(e.source===parent&&e.data?.channel===token)worker.postMessage(e.data);});
  parent.postMessage({channel:token,type:'ready'},'*');
 };
 const source='('+frame.toString().replace('CHANNEL',JSON.stringify(channel)).replace('BOOTSTRAP',JSON.stringify(bootstrap))+')();';
 return '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; script-src &#39;unsafe-inline&#39; &#39;unsafe-eval&#39; blob:; worker-src blob:; connect-src &#39;none&#39;; child-src blob:; base-uri &#39;none&#39;; form-action &#39;none&#39;"><script>'+source.replace(/</g,'\\u003c')+'</script>';
}
export function runCadAIScript({code,modules,call,signal,timeoutMs=120000,document:doc=globalThis.document,window:win=globalThis.window}={}){
 if(!doc||!win)throw Object.assign(Error('Die lokale Skriptumgebung benötigt das geöffnete Programm.'),{code:'AI_SCRIPT_UNAVAILABLE'});
 return new Promise((resolve,reject)=>{
  const channel=crypto.randomUUID(),frame=doc.createElement('iframe');let stopped=false,queue=Promise.resolve(),ready=false;
  frame.hidden=true;frame.setAttribute('sandbox','allow-scripts');frame.setAttribute('referrerpolicy','no-referrer');
  const finish=(error,value)=>{if(stopped)return;stopped=true;clearTimeout(timer);win.removeEventListener('message',receive);signal?.removeEventListener('abort',cancel);frame.remove();error?reject(error):resolve(value);};
  const cancel=()=>finish(Object.assign(Error('Lokale Berechnung abgebrochen.'),{name:'AbortError',code:'ABORTED'}));
  const timer=setTimeout(()=>finish(Object.assign(Error('Lokale Berechnung hat die Rechenzeit überschritten.'),{code:'AI_SCRIPT_TIMEOUT'})),timeoutMs);
  function receive(event){
   const m=event.data;if(stopped||event.source!==frame.contentWindow||m?.channel!==channel)return;
   if(m.type==='ready'){if(ready)return;ready=true;frame.contentWindow.postMessage({channel,type:'start',code,modules},'*');}
   else if(m.type==='call'){
    if(!Number.isSafeInteger(m.id)||!['model','query','run'].includes(m.method)){finish(Object.assign(Error('Unbekannte Skriptfunktion.'),{code:'AI_SCRIPT'}));return;}
    queue=queue.then(async()=>{if(stopped)return;try{const value=await call(m.method,m.args);if(!stopped)frame.contentWindow.postMessage({channel,type:'reply',id:m.id,value},'*');}catch(error){if(!stopped)frame.contentWindow.postMessage({channel,type:'reply',id:m.id,error:{message:String(error.message),code:error.code}},'*');}});
   }else if(m.type==='done'){queue.then(()=>{try{const json=JSON.stringify(m.value??null);if(json.length>1000000)throw Error('Das Rechenergebnis ist zu groß. Eine Messzusammenfassung zurückgeben.');finish(null,JSON.parse(json));}catch(error){finish(Object.assign(error,{code:'AI_SCRIPT_RESULT'}));}});}
   else if(m.type==='failed')finish(Object.assign(Error(String(m.error?.message??'Lokale Berechnung fehlgeschlagen.')),{code:String(m.error?.code??'AI_SCRIPT')}));
  }
  win.addEventListener('message',receive);signal?.addEventListener('abort',cancel,{once:true});
  if(signal?.aborted){cancel();return;}
  frame.src=sandboxFrameURL+'#'+channel;doc.body.append(frame);
 });
}
