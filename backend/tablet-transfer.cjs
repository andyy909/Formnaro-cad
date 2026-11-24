const {randomBytes, randomUUID, createHash, timingSafeEqual, X509Certificate} = require('node:crypto');
const {createServer} = require('node:https');
const {hostname,networkInterfaces} = require('node:os');
const {existsSync} = require('node:fs');
const {mkdtemp, readFile, rm, mkdir, rename, writeFile, stat} = require('node:fs/promises');
const {join} = require('node:path');
const {createIdentity} = require('./tablet-certificate.cjs');
const limit = 8 * 1024 * 1024;
const hex256 = /^[a-f0-9]{64}$/;
const sha = value => createHash('sha256').update(value).digest('hex');
const error = (message,status=400) => Object.assign(Error(message),{status});
const secret = () => randomBytes(32).toString('base64url');
function same(a,b) {
  const left=Buffer.from(a),right=Buffer.from(b);
  return left.length===right.length&&timingSafeEqual(left,right);
}
function localAddress(ip) {
  const [a,b,c,d] = ip.split('.').map(Number);
  return [a,b,c,d].every(n=>Number.isInteger(n)&&n>=0&&n<=255) &&
    (a===10||a===192&&b===168||a===172&&b>=16&&b<=31||a===169&&b===254);
}
function tabletAddresses() {
  return [...new Set(Object.values(networkInterfaces()).flat()
    .filter(item=>item.family==='IPv4'&&!item.internal&&localAddress(item.address)).map(item=>item.address))];
}
function tabletNetwork(address){
  return Object.entries(networkInterfaces()).find(([,items])=>items.some(item=>item.family==='IPv4'&&
    !item.internal&&item.address===address&&localAddress(address)))?.[0];
}
function tabletAddressFor(network,current){
  const addresses=(networkInterfaces()[network]??[]).filter(item=>item.family==='IPv4'&&
    !item.internal&&localAddress(item.address)).map(item=>item.address);
  return addresses.includes(current)?current:addresses[0];
}
async function body(req,maximum) {
  const bytes=[], length=Number(req.headers['content-length']);
  if (!Number.isSafeInteger(length)||length<1||length>maximum) throw error('Ungültige Übertragungsgröße.',413);
  let size=0;
  for await (const chunk of req) {
    size+=chunk.length;
    if (size>length) throw error('Ungültige Übertragungsgröße.',413);
    bytes.push(chunk);
  }
  if(size!==length) throw error('Die Übertragung war unvollständig.');
  return Buffer.concat(bytes,size);
}
function targetInfo(value) {
  if(!value||typeof value.id!=='string'||!value.id||value.id.length>200||
    typeof value.name!=='string'||value.name.length>200||typeof value.revision!=='string'||!value.revision||value.revision.length>200)
    throw error('Kein verfügbares CAD-Zielprojekt.',409);
  return {id:value.id,name:value.name,revision:value.revision};
}
function liveCommand(input) {
  const {opening,action,value,hidden}=input??{};
  const partId=typeof value==='string'&&value.length>0&&value.length<=200;
  if(typeof opening!=='string'||!opening||opening.length>200||
    !(action==='end-isolation'||action==='capture-view'||action==='view'&&['top','front','right','iso'].includes(value)||
      action==='view-save'&&typeof value==='string'&&value.trim().length>0&&value.length<=60||
      ['view-restore','view-remove'].includes(action)&&typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value)||
      partId&&(['select','isolate','spotlight'].includes(action)||['visibility','folder-visibility'].includes(action)&&typeof hidden==='boolean')))
    throw error('Ungültiger PC-Steuerungsbefehl.');
  if(action==='end-isolation'||action==='capture-view')return {opening,action};
  return ['visibility','folder-visibility'].includes(action)?{opening,action,value,hidden}:{opening,action,value};
}
function assistantInput(value) {
  const {profile,question,context}=value??{}, part=context?.part;
  if(!hex256.test(profile??'')||typeof question!=='string'||!question.trim()||question.length>2000||
    typeof context?.revision!=='string'||context.revision.length<1||context.revision.length>200||context.unit!=='mm'||
    (part!==null&&(!part||typeof part.id!=='string'||part.id.length>200||
      typeof part.name!=='string'||part.name.length>200||!Array.isArray(part.size)||
      part.size.length!==3||part.size.some(n=>!Number.isFinite(n)||n<0||n>10000))))
    throw error('Ungültige CAD-Auskunft. Die Vorschau erneut öffnen.');
  return {profile,question:question.trim(),context:{revision:context.revision,unit:'mm',
    part:part?{id:part.id,name:part.name,size:part.size}:null}};
}
async function commitInbox(directory,{id,kind,bytes,target,sourceRevision,digest,desktopCopy,requireAccess}) {
  await mkdir(directory,{recursive:true});
  const name='Tablet-'+id.slice(0,24);
  const destination=join(directory,name);
  const temp=await mkdtemp(join(directory,'.tablet-'));
  try {
    await writeFile(join(temp,'Tablet.ocad'),bytes,{flag:'wx'});
    if(desktopCopy) await writeFile(join(temp,'PC.ocad'),desktopCopy,{flag:'wx'});
    const receipt={name,kind,target,sourceRevision,digest};
    await writeFile(join(temp,'Uebergabe.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
    requireAccess();
    try { await rename(temp,destination); }
    catch (failure) {
      if (!(await stat(destination).catch(()=>null))?.isDirectory()) throw failure;
      const prior=JSON.parse(await readFile(join(destination,'Uebergabe.json'),'utf8'));
      if(prior.digest!==digest||prior.target.id!==target.id||prior.sourceRevision!==sourceRevision) throw failure;
      return prior;
    }
    return receipt;
  } finally {
    await rm(temp,{recursive:true,force:true});
  }
}

async function startTabletTransfer({bind,identity,directory,getTarget,confirmPair,validateProject,provider,live,
  peerStore,listenPort=0,allowLoopback=false,testGateway=false}) {
  if(!(allowLoopback&&(bind==='127.0.0.1'||bind==='127.0.0.2'))&&!tabletAddresses().includes(bind))
    throw error('Eine lokale PC-Adresse wählen.');
  const host=testGateway&&allowLoopback&&bind==='127.0.0.1'?'10.0.2.2':bind;
  const credentials=identity??await createIdentity(host);
  const fingerprint=sha(new X509Certificate(credentials.cert).raw);
  const incoming=new Map(),sessions=new Map();
  const lifetime=30*60*1000,end=peerStore?Infinity:Date.now()+lifetime;
  const pcName=hostname().slice(0,80)||'Formnaro-PC';
  let invitation,closed=false,requests=0;
  let port;
  async function invite({remember=false,allowProvider=!!provider,allowLive=!!live}={}){
    const target=targetInfo(await getTarget());
    if(closed)throw error('Diese Tablet-Verbindung wurde beendet.',409);
    const key=secret(),expires=Date.now()+120000;
    const code='FMP1.'+Buffer.from(JSON.stringify({host,port,fingerprint,key})).toString('base64url');
    invitation={key,expires,code,target,remember:!!peerStore&&remember,
      live:!!live&&allowLive,assistant:!!provider&&allowProvider,pairing:false};
    return {code,expires,target};
  }
  function closeSession(session){
    sessions.delete(session.token);
    for(const response of session.pending)response.destroy();
  }
  function connection(target,caps,deviceId){
    if(deviceId)for(const session of sessions.values())if(session.deviceId===deviceId)closeSession(session);
    if(sessions.size>=32)throw error('Zu viele laufende Tablet-Verbindungen.',429);
    const token=secret(),session={token,target,deviceId,owner:deviceId??randomUUID(),live:caps.live,assistant:caps.assistant,
      expires:Date.now()+lifetime,pending:new Set()};
    sessions.set(token,session);
    return {token,target,live:session.live,assistant:session.assistant,pcName,connectionStatus:true};
  }
  function revoke(deviceId){
    if(!peerStore?.revoke(deviceId))return false;
    for(const session of sessions.values())if(session.deviceId===deviceId)closeSession(session);
    return true;
  }
  const server=createServer({...credentials,minVersion:'TLSv1.2'},async(req,res)=>{
    function reply(status,data) {
      if(res.destroyed)return;
      res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
      res.end(JSON.stringify(data));
    }
    if(++requests>5){requests--;reply(429,{error:'Zu viele gleichzeitige Übertragungen.'});return;}
    try {
      if(closed||Date.now()>=end) throw error('Die Kopplung ist abgelaufen.',401);
      if(req.headers.origin!==undefined||req.headers.host!==host+':'+port) throw error('Ungültiges PC-Ziel.',403);
      for(const session of sessions.values())if(Date.now()>=session.expires)closeSession(session);
      const supplied=String(req.headers.authorization??'');
      if(req.method==='POST'&&req.url==='/tablet/v1/pair') {
        const entry=invitation;
        if(!entry||entry.pairing||Date.now()>=entry.expires||!same(supplied,'Bearer '+entry.key))
          throw error('Kopplungscode ungültig oder abgelaufen.',401);
        entry.pairing=true;
        try {
          const input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await body(req,512)));
          if(typeof input?.device!=='string'||input.device.length<1||input.device.length>80)
            throw error('Ungültiger Gerätename.');
          const remember=entry.remember&&input.remember===true;
          if(!await confirmPair(input.device,{remember,live:entry.live,assistant:entry.assistant}))
            throw error('Kopplung wurde am PC abgelehnt.',403);
          if(closed||invitation!==entry||Date.now()>=entry.expires||res.destroyed)
            throw error('Kopplung ist abgelaufen.',401);
          if(sessions.size>=32)throw error('Zu viele laufende Tablet-Verbindungen.',429);
          const grant=remember?peerStore.grant(input.device,entry):null;
          invitation=null;
          const result=connection(entry.target,entry,grant?.id);
          reply(200,grant?{...result,deviceId:grant.id,deviceKey:grant.key}:result);
        } finally {entry.pairing=false;}
        return;
      }
      if(req.method==='POST'&&req.url==='/tablet/v1/resume'){
        if(!peerStore)throw error('Dieser PC bietet keine gespeicherten Verbindungen an.',403);
        const key=supplied.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
        const before=peerStore.authorize(key);
        if(!before)throw error('Dieses Tablet wurde entkoppelt. Bitte einen neuen Kopplungscode verwenden.',403);
        await body(req,64);
        const current=targetInfo(await getTarget());
        const grant=peerStore.authorize(key);
        if(!grant||grant.id!==before.id)throw error('Dieses Tablet wurde entkoppelt.',403);
        if(closed||res.destroyed)return;
        reply(200,connection(current,{live:!!live&&grant.live,assistant:!!provider&&grant.assistant},grant.id));
        return;
      }
      const token=supplied.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
      const session=sessions.get(token);
      function requireAccess(){
        if(!session||sessions.get(token)!==session||closed||Date.now()>=session.expires)
          throw error('Tablet ist nicht gekoppelt.',401);
        if(session.deviceId&&!peerStore.has(session.deviceId)){
          session.pending.delete(res);
          closeSession(session);
          throw error('Dieses Tablet wurde entkoppelt.',401);
        }
      }
      requireAccess();
      const offered=session.target;
      session.pending.add(res);
      res.once('close',()=>session.pending.delete(res));
      if(req.method==='GET'&&req.url==='/tablet/v1/connection'){
        reply(200,{connected:true});
        return;
      }
      if(req.method==='POST'&&req.url==='/tablet/v1/forget'){
        await body(req,64);
        requireAccess();
        if(!session.deviceId)throw error('Diese Verbindung ist nicht gespeichert.',409);
        session.pending.delete(res);
        revoke(session.deviceId);
        reply(200,{revoked:true});
        return;
      }
      if(req.method==='POST'&&req.url==='/tablet/v1/notes'){
        if(!session.live)throw error('Die Übergabe von Tablet-Notizen wurde am PC nicht freigegeben.',403);
        const {opening,note}=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await body(req,512*1024)))??{};
        if(typeof opening!=='string'||!opening||opening.length>200||!note||typeof note!=='object')
          throw error('Zielprojekt oder Tablet-Notiz fehlt.');
        requireAccess();
        if(res.destroyed)return;
        const receipt=sha(JSON.stringify(note));
        let result;
        try{result=await live({action:'save-note',opening,note,receipt});}
        catch(reason){throw error(reason.message,409);}
        if(!closed&&!res.destroyed)reply(200,result);
        return;
      }
      if(req.method==='POST'&&req.url==='/tablet/v1/sketch'){
        if(!session.live)throw error('Die Übergabe von Tablet-Skizzen wurde am PC nicht freigegeben.',403);
        const input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await body(req,384*1024)));
        const {opening,revision,targetId,deliveryId,sketch}=input??{};
        const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
        if(typeof opening!=='string'||opening.length<1||opening.length>200||
          typeof revision!=='string'||revision.length<1||revision.length>200||
          typeof targetId!=='string'||!uuid.test(targetId)||typeof deliveryId!=='string'||!uuid.test(deliveryId)||
          !sketch||typeof sketch!=='object'||Array.isArray(sketch))
          throw error('Skizze oder PC-Zielstand fehlt.');
        requireAccess();
        if(res.destroyed)return;
        const request={opening,revision,targetId,deliveryId,sketch};
        let result;
        try{result=await live({action:'tablet-sketch',...request,owner:session.owner,digest:sha(JSON.stringify(request))});}
        catch(reason){throw error(reason.message,409);}
        if(!closed&&!res.destroyed)reply(200,result);
        return;
      }
      if(req.method==='POST'&&req.url==='/tablet/v1/part'){
        if(!session.live)throw error('Die Übergabe von Tablet-Teilen wurde am PC nicht freigegeben.',403);
        const input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await body(req,limit)));
        const {opening,revision,deliveryId,version,sourceId,sourceRevision,partText,direct=false}=input??{};
        const shortText=value=>typeof value==='string'&&value.length>=1&&value.length<=200;
        const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
        if(![opening,revision,sourceId,sourceRevision].every(shortText)||version!==1||typeof direct!=='boolean'||
          typeof deliveryId!=='string'||!uuid.test(deliveryId)||typeof partText!=='string'||!partText)
          throw error('Teil oder PC-Zielstand fehlt.');
        requireAccess();
        if(res.destroyed)return;
        const request={opening,revision,deliveryId,version,sourceId,sourceRevision,partText,...(direct?{direct:true}:{})};
        let result;
        try{result=await live({action:'tablet-part',...request,owner:session.owner,digest:sha(JSON.stringify(request))});}
        catch(reason){throw error(reason.message,409);}
        if(!closed&&!res.destroyed)reply(200,result);
        return;
      }
      if(req.url==='/tablet/v1/live') {
        if(!session.live)throw error('PC-Steuerung für diese Verbindung nicht freigegeben.',403);
        if(req.method==='GET') {
          const state=await live();
          requireAccess();
          if(Buffer.byteLength(JSON.stringify(state))>1000*1024)
            throw error('Die PC-Teileliste ist für das Tablet zu groß.',413);
          reply(200,{state});
          return;
        }
        if(req.method!=='POST')throw error('Unbekannter Tablet-Befehl.',404);
        const command=liveCommand(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await body(req,2048))));
        requireAccess();
        if(res.destroyed)return;
        let result;
        try { result=await live(command); }
        catch(reason) { throw error(reason.message,409); }
        if(closed||res.destroyed)return;
        if(command.action==='capture-view'){
          if(!result||Buffer.byteLength(JSON.stringify(result))>288*1024)
            throw error('Die Modellansicht konnte nicht übertragen werden.',413);
          reply(200,{snapshot:result});
        }else reply(200,{applied:true});
        return;
      }
      if(req.url==='/tablet/v1/assistant') {
        if(!session.assistant)throw error('Der KI-Anbieter ist für diese Verbindung ausgeschaltet.',403);
        if(req.method==='GET') {
          reply(200,{provider:provider.describe()});
          return;
        }
        if(req.method!=='POST')throw error('Unbekannter Tablet-Befehl.',404);
        const cancel=new AbortController(), abort=()=>{if(!res.writableFinished)cancel.abort();};
        res.once('close',abort);
        try {
          const input=assistantInput(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await body(req,16000))));
          requireAccess();
          if(res.destroyed)abort();
          cancel.signal.throwIfAborted();
          if(input.profile!==provider.describe().profile)throw error('Am PC wurde der Anbieter geändert. Daten erneut prüfen.',409);
          reply(200,{answer:await provider.answer(input,cancel.signal)});
        } finally {res.removeListener('close',abort);}
        return;
      }
      if(req.method==='GET'&&req.url==='/tablet/v1/target') {
        const current=targetInfo(await getTarget());
        requireAccess();
        if(current.id!==offered.id)throw error('Am PC ist ein anderes Projekt geöffnet.',409);
        reply(200,{target:current});
        return;
      }
      if(req.method!=='POST'||req.url!=='/tablet/v1/project')throw error('Unbekannter Tablet-Befehl.',404);
      const revision=String(req.headers['x-formano-revision']??''),target=String(req.headers['x-formano-target']??''),
        digest=String(req.headers['x-formano-sha256']??'');
      if(!revision||revision.length>200||target!==offered.id||!hex256.test(digest))
        throw error('Ziel, Revision oder Prüfsumme fehlt.',409);
      if(req.headers['content-type']!=='application/octet-stream')throw error('Eine .ocad-Datei senden.',415);
      const bytes=await body(req,limit);
      requireAccess();
      if(sha(bytes)!==digest)throw error('Die Projekt-Prüfsumme stimmt nicht.');
      const id=sha(JSON.stringify([target,revision,digest]));
      const requestId=token+':'+id;
      let transfer=incoming.get(requestId);
      if(!transfer) {
        transfer=(async()=>{
          const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
          await validateProject(text);
          const previous=await readFile(join(directory,'Tablet-'+id.slice(0,24),'Uebergabe.json'),'utf8').catch(reason=>{
            if(reason.code==='ENOENT')return null;
            throw reason;
          });
          if(previous) {
            const receipt=JSON.parse(previous);
            if(receipt.digest!==digest||receipt.target.id!==target||receipt.sourceRevision!==revision)
              throw error('Eine andere Übergabe nutzt diese Kennung.',409);
            return receipt;
          }
          const snapshot=await getTarget({snapshotIfRevisionDiffers:revision}), current=targetInfo(snapshot);
          requireAccess();
          if(current.id!==target)throw error('Am PC ist ein anderes Projekt geöffnet.',409);
          const conflict=current.revision!==revision;
          if(conflict&&typeof snapshot.text!=='string')throw error('PC-Stand kann noch nicht gesichert werden.',409);
          return commitInbox(directory,{id,kind:conflict?'conflict':'received',target:current,requireAccess,
            sourceRevision:revision,digest,bytes,desktopCopy:conflict?snapshot.text:null});
        })();
        incoming.set(requestId,transfer);
        transfer.finally(()=>incoming.delete(requestId)).catch(()=>{});
      }
      reply(200,{receipt:await transfer});
    } catch (reason) {
      reply(reason.status??400,{error:reason.status?reason.message:'Projektübergabe fehlgeschlagen.'});
    } finally {requests--;}
  });
  server.requestTimeout=45000;
  server.headersTimeout=10000;
  server.maxConnections=8;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(listenPort,bind,resolve);});
  port=server.address().port;
  const timer=peerStore?null:setTimeout(()=>{void close();},end-Date.now()).unref();
  function close() {
    if(closed)return Promise.resolve();
    closed=true;
    clearTimeout(timer);
    server.closeAllConnections();
    return new Promise(resolve=>server.close(resolve));
  }
  try{
    const first=peerStore?{}:await invite();
    return {...first,bind,port,invite,revoke,close};
  }catch(error){await close();throw error;}
}

function installTabletTransfer(win,{ipcMain,dialog,shell,clipboard,directory,peerDirectory,protection,getTarget,provider,live}) {
  const peers=peerDirectory&&require('./tablet-peer-store.cjs').createTabletPeerStore(peerDirectory,protection);
  const knownPort=49321;
  let active,invitation,starting=false,generation=0,listenError='';
  const close=async()=>{
    generation++;
    const server=active;
    active=invitation=null;
    await server?.close();
    return true;
  };
  const confirmPair=async(device,{remember,live})=>{
    const access=live
      ?'Das Tablet darf am PC Teile auswählen, ein- und ausblenden, isolieren, die Ansicht wechseln, Modellbilder abrufen sowie Skizzen, einzelne CAD-Teile zur Vorschau, Skizzenblockseiten und Projektkopien senden.'
      :'Das Tablet kann Kopien an das ausgewählte CAD-Projekt senden.';
    const result=await dialog.showMessageBox(win,{type:'question',buttons:['Ablehnen','Tablet koppeln'],
      defaultId:0,cancelId:0,title:'Formnaro · Tablet koppeln',message:'Tablet „'+device+'“ verbinden?',
      detail:access+(remember?' Diese Freigabe gilt auch für spätere Verbindungen, bis du das Tablet entkoppelst.':'')});
    return result.response===1;
  };
  async function openServer(bind,{known,allowProvider,allowLive}){
    const attempt=generation;
    const bundled=join(__dirname,'tablet-project-validator.cjs');
    const {parseCadProject,hasGeometryRefs}=existsSync(bundled)
      ? require(bundled) : await import('../src/tablet-project-validator.js');
    const validateProject=text=>{
      const candidate=parseCadProject(text);
      if(hasGeometryRefs(candidate))throw error('Für die Übergabe eine vollständige .ocad-Datei verwenden.',415);
      return candidate;
    };
    let identity;
    if(known){
      identity=peers.identity();
      if(!identity){identity=await createIdentity(bind,3650);peers.saveIdentity(identity);}
    }
    const server=await startTabletTransfer({bind,identity,directory,getTarget,validateProject,confirmPair,
      ...(known?{peerStore:peers,listenPort:knownPort}:{}),
      provider:known||allowProvider===true?provider:undefined,live:known||allowLive===true?live:undefined});
    if(attempt!==generation||win.isDestroyed()){
      await server.close();
      throw Error('Tablet-Verbindung wurde geschlossen.');
    }
    active={...server,known};
    listenError='';
    return active;
  }
  async function restoreKnown(){
    if(!peers||starting||win.isDestroyed())return;
    starting=true;
    try{
      const network=peers.network();
      if(!network)return;
      const bind=tabletAddressFor(network,active?.bind);
      if(active?.known&&active.bind===bind)return;
      const stopped=close(),attempt=generation;
      await stopped;
      if(attempt!==generation)return;
      if(bind&&peers.network()===network&&!win.isDestroyed())await openServer(bind,{known:true});
    }catch(error){
      listenError=error.code==='EADDRINUSE'?'Der Port für bekannte Tablets ist schon belegt.':error.message;
    }finally{starting=false;}
  }
  for(const [name,call] of Object.entries({
    addresses:()=>tabletAddresses(),
    known:()=>({available:!!peers,enabled:!!peers?.network(),host:active?.known?active.bind:null,
      devices:peers?.list()??[],error:listenError}),
    revoke:({id}={})=>{
      if(!peers||typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw Error('Ungültiges Tablet.');
      if(active?.known)active.revoke(id);
      else peers.revoke(id);
      return true;
    },
    begin:async({bind,allowProvider,allowLive,remember})=>{
      if(starting)throw Error('Die Tablet-Verbindung wird schon vorbereitet.');
      starting=true;
      try {
        const network=typeof bind==='string'?tabletNetwork(bind):null;
        if(!network)throw Error('Eine lokale PC-Adresse wählen.');
        if(remember===true&&!peers)throw Error('Gespeicherte Tablet-Freigaben sind hier nicht verfügbar.');
        const known=!!peers&&(remember===true||!!peers.network());
        if(!known||!active?.known||active.bind!==bind){
          const stopped=close(),attempt=generation;
          await stopped;
          if(attempt!==generation)throw Error('Tablet-Verbindung wurde geschlossen.');
          await openServer(bind,{known,allowProvider,allowLive});
          if(known){
            try{peers.setNetwork(network);}
            catch(error){await close();throw error;}
          }
        }
        invitation=known?await active.invite({remember:remember===true,allowProvider:allowProvider===true,
          allowLive:allowLive===true}):active;
        let qr=null;
        try{
          const encoder=require('qrcode-generator')(0,'M');
          encoder.addData(invitation.code,'Byte');
          encoder.make();
          qr=encoder.createDataURL(6,24);
        }catch{/* Manual code remains available on a QR rendering failure. */}
        return {expires:invitation.expires,target:invitation.target,qr};
      } finally {starting=false;}
    },
    copy:()=>{
      if(!invitation||Date.now()>=invitation.expires)throw Error('Einen neuen Verbindungscode erzeugen.');
      clipboard.writeText(invitation.code);
      return true;
    },
    stop:async()=>{
      peers?.setNetwork(null);
      listenError='';
      return close();
    },
    inbox:async()=>{
      await mkdir(directory,{recursive:true});
      const result=await shell.openPath(directory);
      if(result)throw Error('Tablet-Eingang konnte nicht geöffnet werden.');
      return true;
    },
  })) ipcMain.handle('cad-tablet:'+name,async(event,args)=>{
    if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)
      return {ok:false,error:'Ungültiges Fenster.'};
    try { return {ok:true,value:await call(args)}; }
    catch(reason) {
      return {ok:false,error:reason.message};
    }
  });
  const timer=peers?setInterval(()=>void restoreKnown(),3000).unref():null;
  if(peers)win.webContents.once('did-finish-load',()=>void restoreKnown());
  win.on('closed',()=>{clearInterval(timer);void close();});
}

module.exports={createIdentity,startTabletTransfer,tabletAddresses,installTabletTransfer};
