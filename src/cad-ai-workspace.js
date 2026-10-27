// A task's data-only filesystem. No path is ever resolved against the host.
const fail=m=>{throw Object.assign(Error(m),{code:'AI_WORKSPACE_INVALID'});};
export function createAIWorkspace({maxBytes=32*1024*1024,maxFiles=256}={}){
 let files=new Map();
 function name(v){if(typeof v!=='string'||v.length>200||!v||v.startsWith('/')||v.includes('\\')||v.includes(':')||v.split('/').some(p=>!p||p==='.'||p==='..')||!/^[-\p{L}\p{N}_ .\/]+$/u.test(v))fail('Arbeitsdateien benötigen einen relativen Namen ohne .. oder Laufwerk.');return v;}
 function validate(v){if(typeof v!=='string')fail('Dateiinhalt als Text übergeben.');return v;}
 function check(next){if(next.size>maxFiles||[...next].reduce((n,[k,v])=>n+new TextEncoder().encode(k+v).length,0)>maxBytes)fail('Der lokale Arbeitsbereich ist voll (256 Dateien / 32 MiB).');}
 return {request(args={}){
  if(!args||Object.getPrototypeOf(args)!==Object.prototype||Object.keys(args).some(k=>!['action','path','text','files'].includes(k)))fail('Ungültige Arbeitsdateiabfrage.');
  if(args.action==='list')return [...files].map(([path,text])=>({path,bytes:new TextEncoder().encode(text).length}));
  if(args.action==='snapshot')return Object.fromEntries(files);
  if(args.action==='read'){const k=name(args.path);if(!files.has(k))fail('Arbeitsdatei fehlt: '+k);return files.get(k);}
  if(args.action==='write'){const k=name(args.path),text=validate(args.text),next=new Map(files);next.set(k,text);check(next);files=next;return {path:k,bytes:new TextEncoder().encode(text).length};}
  if(args.action==='remove'){files.delete(name(args.path));return {removed:true};}
  if(args.action==='replace'){
   if(!args.files||Object.getPrototypeOf(args.files)!==Object.prototype)fail('Ungültige Arbeitsdateien.');
   const next=new Map(Object.entries(args.files).map(([k,v])=>[name(k),validate(v)]));check(next);files=next;return {files:files.size};
  }
  fail('Arbeitsdateien: list/read/write/remove wählen.');
 },clear(){files.clear();}};
}
