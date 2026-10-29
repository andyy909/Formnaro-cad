// Public-client OAuth for locally hosted apps. Never reads Codex/browser credentials.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {writeAtomicSync}=require('./program-storage.cjs');
const ISSUER='https://auth.openai.com',RESOURCE='https://api.openai.com/v1';
const SCOPES='openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const random=()=>crypto.randomBytes(32).toString('base64url');
const validText=(v,max=65536)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\r\n]/.test(v);
async function json(response){
 let length=0,parts=[];for await(const p of response.body){length+=p.length;if(length>1024*1024)throw Error('OpenAI-Antwort zu groß.');parts.push(Buffer.from(p));}
 try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw Error('Ungültige Antwort von OpenAI.');}
}
function verifyIdentity(token,keys,{clientId,nonce,subject,now=Date.now()}){
 if(!validText(token))throw Error('Ungültiges Anmeldetoken.');
 const parts=token.split('.');if(parts.length!==3)throw Error('Ungültiges Anmeldetoken.');
 let header,claims;try{header=JSON.parse(Buffer.from(parts[0],'base64url'));claims=JSON.parse(Buffer.from(parts[1],'base64url'));}catch{throw Error('Ungültiges Anmeldetoken.');}
 const key=keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.use||k.use==='sig')&&(!k.alg||k.alg==='RS256'));
 if(header.alg!=='RS256'||header.crit||!key||!crypto.verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),crypto.createPublicKey({key,format:'jwk'}),Buffer.from(parts[2],'base64url')))throw Error('Signatur der Anmeldung ungültig.');
 const audience=Array.isArray(claims.aud)?claims.aud:[claims.aud],seconds=now/1000;
 if(claims.iss!==ISSUER||!audience.includes(clientId)||(audience.length>1&&claims.azp!==clientId)||(claims.azp&&claims.azp!==clientId)||!Number.isFinite(claims.exp)||claims.exp<=seconds||claims.nbf>seconds+30||!Number.isFinite(claims.iat)||claims.iat>seconds+30||!validText(claims.sub,512)||(nonce!==undefined&&claims.nonce!==nonce)||(subject&&claims.sub!==subject))throw Error('Identität, Konto oder Gültigkeit der Anmeldung stimmt nicht.');
 return {subject:claims.sub,email:typeof claims.email==='string'?claims.email.slice(0,254):'',issuer:ISSUER};
}
function createChatGPTAuth({directory,encrypt,decrypt,canEncrypt,openExternal,fetchImpl=(...a)=>fetch(...a),now=Date.now}){
 const file=path.join(directory,'accounts.enc'),lockFile=path.join(directory,'session.lock');
 let state={version:1,hostId:'',active:'',accounts:[]},pending=null,refreshing=null,message='',localBusy=false;
 function read(){if(fs.existsSync(file)){try{state=JSON.parse(decrypt(fs.readFileSync(file,'utf8')));if(state.version!==1||!Array.isArray(state.accounts)||!/^urn:uuid:/.test(state.hostId))throw Error();}catch{throw Error('ChatGPT-Anmeldung kann auf diesem PC nicht entschlüsselt werden.');}}}
 function persist(){if(!canEncrypt())throw Error('Sichere Windows-Anmeldespeicherung ist nicht verfügbar.');fs.mkdirSync(directory,{recursive:true});writeAtomicSync(file,encrypt(JSON.stringify(state)));}
 function lock(){
  if(localBusy)throw Error('ChatGPT-Anmeldung wird bereits bearbeitet.');fs.mkdirSync(directory,{recursive:true});
  let acquired=false;
  for(let attempt=0;attempt<5;attempt++){
   try{const fd=fs.openSync(lockFile,'wx',0o600);try{fs.writeFileSync(fd,String(process.pid));}finally{fs.closeSync(fd);}acquired=true;break;}catch(e){
    if(e.code!=='EEXIST')throw e;
    let live=true;
    try{const pid=Number(fs.readFileSync(lockFile,'utf8'));if(Number.isInteger(pid)&&pid>0)process.kill(pid,0);}catch(error){if(error.code==='ENOENT')continue;if(error.code==='ESRCH')live=false;}
    if(live)throw Error('Eine andere Formnaro-Instanz bearbeitet die ChatGPT-Anmeldung.');
    try{fs.unlinkSync(lockFile);}catch(error){if(error.code!=='ENOENT')throw error;}
   }
  }
  if(!acquired)throw Error('ChatGPT-Anmeldesperre wurde wiederholt geändert. Bitte erneut versuchen.');
  localBusy=true;try{read();}catch(e){unlock();throw e;}
 }
 function unlock(){if(localBusy){localBusy=false;try{fs.unlinkSync(lockFile);}catch{}}}
 function current(){return state.accounts.find(a=>a.id===state.active);}
 function publicStatus(){
  if(!localBusy){try{read();}catch(e){return {connected:false,activeId:'',email:'',pending:false,message:e.message,accounts:[],needsWelcome:false};}}const a=current();return {connected:!!a?.access_token&&a.scopes?.includes('chatgpt.tokens.use.direct'),activeId:a?.id||'',email:a?.email||'',pending:!!pending,message,accounts:state.accounts.map(a=>({id:a.id,label:(a.email||'ChatGPT-Konto')+' · '+a.id.slice(0,6),connected:!!a.access_token})),needsWelcome:!!a?.access_token&&!a.welcomed};
 }
 async function discovery(signal){const response=await fetchImpl(ISSUER+'/.well-known/openid-configuration',{signal,redirect:'error'});if(!response.ok)throw Error('OpenAI-Anmeldedienst nicht erreichbar.');const d=await json(response);if(d.issuer!==ISSUER)throw Error('Falscher Anmeldedienst.');for(const k of ['jwks_uri','revocation_endpoint']){const u=new URL(d[k]);if(u.origin!==ISSUER||u.username||u.password||u.hash)throw Error('Ungültiger Anmeldedienst.');}return d;}
 async function identity(token,expected,signal){const d=await discovery(signal),r=await fetchImpl(d.jwks_uri,{signal,redirect:'error'});if(!r.ok)throw Error('Anmeldesignatur konnte nicht geprüft werden.');const data=await json(r);return verifyIdentity(token,Array.isArray(data.keys)?data.keys:[],{...expected,now:now()});}
 async function exchange(fields,signal){
  const r=await fetchImpl(ISSUER+'/api/accounts/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...fields,resource:RESOURCE}),signal,redirect:'error'}),data=await json(r);
  if(!r.ok){const error=Error(data.error==='invalid_grant'?'ChatGPT-Anmeldung abgelaufen. Bitte erneut anmelden.':'ChatGPT-Anmeldung fehlgeschlagen (HTTP '+r.status+').');error.code=data.error==='invalid_grant'?'CHATGPT_LOGIN_REQUIRED':'CHATGPT_AUTH_FAILED';throw error;}return data;
 }
 function credentials(data,old){
  const scopes=typeof data.scope==='string'?data.scope.split(/\s+/):old?.scopes;
  if(!validText(data.access_token)||!validText(data.refresh_token)||data.token_type?.toLowerCase()!=='bearer'||!Number.isFinite(data.expires_in)||data.expires_in<=0||!scopes?.includes('chatgpt.tokens.use.direct')||!scopes.includes('resource.invoke'))throw Error('ChatGPT-Abo-Nutzung wurde nicht freigegeben. Bitte in ChatGPT prüfen.');
  return {access_token:data.access_token,refresh_token:data.refresh_token,id_token:data.id_token||old?.id_token,scopes,expiresAt:now()+data.expires_in*1000};
 }
 function finish(p,error){if(pending!==p)return;pending=null;clearTimeout(p.timer);p.abort.abort();p.server.close();p.server.closeAllConnections?.();message=error||'ChatGPT-Anmeldung erfolgreich.';unlock();}
 async function start({accountId}={}){
  if(pending)throw Error('Eine Anmeldung läuft bereits.');if(!canEncrypt())throw Error('Sichere Windows-Anmeldespeicherung ist nicht verfügbar.');lock();
  try{
   const account=accountId?state.accounts.find(a=>a.id===accountId):null;if(accountId&&!account)throw Error('Unbekanntes ChatGPT-Konto.');
   if(!state.hostId){state.hostId='urn:uuid:'+crypto.randomUUID();persist();}
   const p={state:random(),nonce:random(),verifier:random(),abort:new AbortController(),server:http.createServer(),claimed:false};pending=p;
   p.server.on('request',async(req,res)=>{
    const send=(status,text)=>{res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'"});res.end(text);};
    let u;try{u=new URL(req.url,'http://127.0.0.1');}catch{return send(400,'Ungültige Rückmeldung.');}
    if(req.method!=='GET'||req.headers.host!==new URL(p.redirect).host||u.pathname!=='/auth/callback')return send(404,'Nicht gefunden.');
    if([...u.searchParams.keys()].some(k=>u.searchParams.getAll(k).length!==1)||u.searchParams.get('state')!==p.state)return send(400,'Anmeldung stimmt nicht mit dieser Formnaro-Anfrage überein.');
    if(pending!==p||p.claimed)return send(409,'Diese Anmeldung wurde bereits verarbeitet.');p.claimed=true;
    try{
     if(u.searchParams.has('error'))throw Error('Anmeldung abgebrochen oder von OpenAI abgelehnt.');
     const clientId=u.searchParams.get('client_id')||account?.client_id,code=u.searchParams.get('code');
     if(!validText(clientId,256)||clientId==='dynamic_agent_client'||(account&&clientId!==account.client_id)||!validText(code,8192))throw Error('Unvollständige oder abweichende Kontoregistrierung.');
     const data=await exchange({grant_type:'authorization_code',client_id:clientId,code,code_verifier:p.verifier,redirect_uri:p.redirect},p.abort.signal);
     const verified=await identity(data.id_token,{clientId,nonce:p.nonce,subject:account?.subject},p.abort.signal),tokens=credentials(data);
     if(pending!==p||p.abort.signal.aborted)return;
     const existing=state.accounts.find(a=>a.client_id===clientId&&a.subject===verified.subject),entry={...existing,...verified,...tokens,id:existing?.id||crypto.randomUUID(),client_id:clientId};
     state.accounts=state.accounts.filter(a=>a.id!==entry.id);state.accounts.push(entry);state.active=entry.id;persist();
     send(200,'Du bist in Formnaro mit ChatGPT angemeldet. Dieses Browserfenster kann geschlossen werden.');finish(p);
    }catch(e){send(400,'Die Anmeldung konnte nicht abgeschlossen werden. Details stehen in Formnaro.');finish(p,e.name==='AbortError'?'Anmeldung abgebrochen.':e.message);}
   });
   await new Promise((resolve,reject)=>{p.server.once('error',reject);p.server.listen(0,'127.0.0.1',resolve);});
   p.redirect='http://127.0.0.1:'+p.server.address().port+'/auth/callback';
   p.timer=setTimeout(()=>finish(p,'Anmeldung abgelaufen. Bitte erneut starten.'),600000);p.timer.unref?.();
   const url=new URL(ISSUER+'/api/accounts/authorize');url.search=new URLSearchParams({client_id:account?.client_id||'dynamic_agent_client',...(account?{...(account.id_token?{id_token_hint:account.id_token}:{}),...(account.email?{login_hint:account.email}:{})}:{agent_name_hint:'Formnaro'}),ext_agent_host_id:state.hostId,response_type:'code',redirect_uri:p.redirect,scope:SCOPES,resource:RESOURCE,state:p.state,nonce:p.nonce,code_challenge_method:'S256',code_challenge:crypto.createHash('sha256').update(p.verifier).digest('base64url')}).toString();
   message='Anmeldung im Browser abschließen …';try{await openExternal(url.href);}catch{throw Error('Anmeldebrowser konnte nicht geöffnet werden. Bitte den Standardbrowser prüfen.');}return publicStatus();
  }catch(e){if(pending)finish(pending,'Anmeldung konnte nicht gestartet werden.');else unlock();throw e;}
 }
 function cancel(){if(pending)finish(pending,'Anmeldung abgebrochen.');return publicStatus();}
 async function token(signal){
  if(refreshing)return refreshing;
  refreshing=(async()=>{lock();try{const a=current();if(!a?.access_token)throw Error('Bitte über die KI-Einstellungen mit ChatGPT anmelden.');if(a.expiresAt>now()+60000)return a.access_token;
   let data;try{data=await exchange({grant_type:'refresh_token',client_id:a.client_id,refresh_token:a.refresh_token},signal);}catch(e){if(e.code==='CHATGPT_LOGIN_REQUIRED'){message=e.message;delete a.access_token;delete a.refresh_token;delete a.id_token;persist();}throw e;}
   if(data.id_token)await identity(data.id_token,{clientId:a.client_id,subject:a.subject},signal);
   Object.assign(a,credentials(data,a));persist();return a.access_token;
  }finally{unlock();}})();try{return await refreshing;}finally{refreshing=null;}
 }
 async function logout(){if(pending)cancel();lock();let confirmed=true;try{const a=current();if(a?.refresh_token){try{const signal=AbortSignal.timeout(15000),d=await discovery(signal),r=await fetchImpl(d.revocation_endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:a.refresh_token,token_type_hint:'refresh_token',client_id:a.client_id}),signal,redirect:'error'});confirmed=r.status===200;}catch{confirmed=false;}}
  if(a){delete a.access_token;delete a.refresh_token;delete a.id_token;persist();}message=confirmed?'Abgemeldet.':'Lokal abgemeldet. Widerruf bei OpenAI nicht bestätigt; Zugriff in ChatGPT unter Einstellungen → Nutzung entfernen.';
 }finally{unlock();}return publicStatus();}
 function acknowledge(){lock();try{const a=current();if(a){a.welcomed=true;persist();}}finally{unlock();}return publicStatus();}
 function dispose(){if(pending)finish(pending,'Anmeldung abgebrochen.');}
 return {publicStatus,start,cancel,token,logout,acknowledge,dispose};
}
module.exports={createChatGPTAuth,verifyIdentity};
