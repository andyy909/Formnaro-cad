const {spawn,execFile}=require('node:child_process');
const {EventEmitter}=require('node:events');
const {StringDecoder}=require('node:string_decoder');

const clean=value=>String(value??'').replace(/(?:sk-[A-Za-z0-9_-]{8,}|Bearer\s+\S+)/gi,'[redacted]').slice(0,1500);
class ACPClient extends EventEmitter{
 constructor({command,args=[],cwd,env,spawnImpl=spawn}){
  super();this.pending=new Map();this.sequence=0;this.closed=false;this.buffer='';this.decoder=new StringDecoder('utf8');
  this.child=spawnImpl(command,args,{cwd,env,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
  this.stopped=new Promise(resolve=>this.child.once('close',resolve));
  this.child.stdout.on('data',part=>{this.buffer+=this.decoder.write(part);if(this.buffer.length>32*1024*1024)return this.fail(Error('Mistral-Antwort überschreitet 32 MiB.'));let end;while((end=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,end);this.buffer=this.buffer.slice(end+1);if(line.trim())this.receive(line);}});
  // stderr may contain provider credentials or model data; never forward it.
  this.child.stderr.on('data',()=>{});this.child.stdin.on('error',()=>{});
  this.child.once('error',()=>this.fail(Error('Mistral Vibe konnte nicht gestartet werden.')));
  this.child.once('close',()=>this.fail(Error('Mistral Vibe wurde beendet.'),false));
 }
 receive(line){
  let message;try{message=JSON.parse(line);}catch{return this.fail(Error('Ungültige ACP-Antwort von Mistral Vibe.'));}
  if(message.jsonrpc!=='2.0')return this.fail(Error('Ungültiges ACP-Protokoll.'));
  if(message.method){
   if(message.id!==undefined){
    // No host filesystem, terminal, external links or implicit approval is exposed.
    const reply=message.method==='session/request_permission'?{result:{outcome:{outcome:'cancelled'}}}:{error:{code:-32601,message:'Formnaro exposes only its configured CAD MCP tools.'}};
    this.write({jsonrpc:'2.0',id:message.id,...reply});
   }else if(message.method==='session/update')this.emit('update',message.params);
   return;
  }
  const item=this.pending.get(message.id);if(!item)return;this.pending.delete(message.id);item.cleanup();
  if(message.error){const error=Error(clean(message.error.message||'Mistral-Anfrage fehlgeschlagen.'));error.code='MISTRAL_ACP_ERROR';item.reject(error);}else item.resolve(message.result);
 }
 write(message){if(this.closed)throw Error('Mistral-Verbindung ist geschlossen.');this.child.stdin.write(JSON.stringify(message)+'\n');}
 call(method,params={}, {signal,timeout=60000}={}){
  signal?.throwIfAborted();if(this.closed)return Promise.reject(Error('Mistral-Verbindung ist geschlossen.'));
  const id=++this.sequence;
  return new Promise((resolve,reject)=>{
   const abort=()=>{this.close();reject(signal.reason??Error('Mistral-Anfrage abgebrochen.'));};
   const timer=setTimeout(()=>{this.close();reject(Error('Mistral-Anfrage hat zu lange gedauert.'));},timeout);
   const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
   this.pending.set(id,{resolve,reject,cleanup});signal?.addEventListener('abort',abort,{once:true});
   try{this.write({jsonrpc:'2.0',id,method,params});}catch(error){this.pending.delete(id);cleanup();reject(error);}
  });
 }
 notify(method,params){this.write({jsonrpc:'2.0',method,params});}
 async initialize(){const value=await this.call('initialize',{protocolVersion:1,clientInfo:{name:'formnaro',title:'Formnaro',version:'1'},clientCapabilities:{fs:{readTextFile:false,writeTextFile:false},terminal:false,_meta:{'browser-auth-delegated':true}}});if(value?.protocolVersion!==1)throw Error('Diese Vibe-Version unterstützt das benötigte ACP-Protokoll nicht.');this.info=value;return value;}
 fail(error,kill=true){if(this.closed)return;this.closed=true;for(const item of this.pending.values()){item.cleanup();item.reject(error);}this.pending.clear();this.emit('closed');if(kill)this.kill();}
 kill(){if(!this.child.pid)return;if(process.platform==='win32')execFile('taskkill.exe',['/PID',String(this.child.pid),'/T','/F'],{windowsHide:true},()=>{});else this.child.kill();}
 close(){this.fail(Error('Mistral-Verbindung geschlossen.'));}
 async stop(){this.close();let timer;try{await Promise.race([this.stopped,new Promise(resolve=>{timer=setTimeout(resolve,5000);})]);}finally{clearTimeout(timer);}}
}
module.exports={ACPClient,clean};
