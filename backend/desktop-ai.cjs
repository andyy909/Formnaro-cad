const {app,ipcMain,safeStorage}=require('electron'),fs=require('node:fs'),path=require('node:path');
const {generate:generateProvider,testConnection}=require('./ai-provider.cjs');const {startBridge}=require('./api-bridge.cjs');
const {writeAtomicSync}=require('./program-storage.cjs');
const {createAIProfiles}=require('./ai-profiles.cjs');
const {modelCatalog}=require('./ai-models.cjs');
function installDesktopAI(win,{settingsFile=path.join(app.getPath('userData'),'ai-settings.json'),fallbackFile}={}){const file=settingsFile;let bridge=null,bridgeQueue=Promise.resolve(),sequence=0,controller=null;const pending=new Map(),catalogs=new Map();let stored;
 try{stored=JSON.parse(fs.readFileSync(fs.existsSync(file)?file:fallbackFile||file,'utf8'));}catch{/* Missing/corrupt settings never reveal credentials. */}
 const profiles=createAIProfiles({stored,canEncrypt:()=>safeStorage.isEncryptionAvailable(),encrypt:key=>safeStorage.encryptString(key).toString('base64'),decrypt:encrypted=>safeStorage.decryptString(Buffer.from(encrypted,'base64')),persist:value=>{fs.mkdirSync(path.dirname(file),{recursive:true});if(fs.existsSync(file))writeAtomicSync(file+'.vorher',fs.readFileSync(file));writeAtomicSync(file,JSON.stringify(value));}});
 const chatgpt=require('./chatgpt-auth.cjs').createChatGPTAuth({directory:path.join(app.getPath('userData'),'chatgpt'),canEncrypt:()=>safeStorage.isEncryptionAvailable(),encrypt:value=>safeStorage.encryptString(value).toString('base64'),decrypt:value=>safeStorage.decryptString(Buffer.from(value,'base64')),openExternal:url=>require('electron').shell.openExternal(url)});
 const sendAgentEvent=value=>{if(!win.isDestroyed())win.webContents.send('cad-ai:agent-event',value);};
 const mistral=require('./mistral-vibe.cjs').createMistralVibe({directory:path.join(app.getPath('userData'),'mistral-vibe'),connectionFile:path.join(app.getPath('userData'),'ai-bridge.json'),onEvent:sendAgentEvent,openExternal:url=>require('electron').shell.openExternal(url)});
 const syncResearch=()=>mistral.setWebResearch(profiles.active().config.authMode==='mistral-vibe'&&profiles.active().config.webResearchAllowed);syncResearch();
 const mcpAgent=require('./ai-mcp-agent.cjs').createMCPAgent({directory:path.join(app.getPath('userData'),'KI-Agent'),connectionFile:path.join(app.getPath('userData'),'ai-bridge.json'),onEvent:sendAgentEvent});
 const providerId=c=>['chatgpt','mistral-vibe'].includes(c.authMode)?c.authMode:new URL(c.baseUrl).origin;
 const catalogKey=(config,auth=chatgpt.publicStatus())=>config.authMode==='chatgpt'?'chatgpt:'+auth.activeId:config.baseUrl;
 const credential=async(config,key,signal)=>config.authMode==='chatgpt'?chatgpt.token(signal):key;
 const modelingStores=require('./ai-provider-memory.cjs').createProviderContexts({directory:path.dirname(file),redact:value=>{const text=profiles.redact(value);return bridge?.descriptor.token?text.split(bridge.descriptor.token).join('[redacted]'):text;}});
 const modeling=(config=profiles.active().config)=>modelingStores.forProvider(providerId(config));
 const usageLedger=require('./ai-usage-ledger.cjs').createAIUsageLedger({file:path.join(path.dirname(file),'KI-Verbrauch.json'),redact:value=>profiles.redact(value)});
 let captureBusy=false,lastCapture=0;
 const exchange=require('./ai-exchange.cjs').createAIExchange({file:path.join(path.dirname(file),'KI-Wechselkurs.json')});
 const usageStatistics=args=>usageLedger.statistics({period:args?.period??'all',provider:args?.allProviders?undefined:providerId(profiles.active().config)});
 async function generate(config,token,args,signal,options){
  let usage,reply;
  try{const value=await generateProvider(config,token,args,signal,{...options,mistralComplete:value=>mistral.complete(value)});usage=value.usage;reply=value;try{profiles.markUsed(config);}catch{/* Usage markers must not fail a successful answer. */}return value;}
  catch(error){usage=error.aiUsage;throw error;}
  finally{usageLedger.record({usage,config,provider:providerId(config),taskId:args.usageTaskId??args.requestId,args:{...args,assistantKind:reply?.assistant?.kind}});}
 }
 const publicSettings=()=>{const auth=chatgpt.publicStatus(),vibe=mistral.publicStatus(),base=profiles.publicSettings();return {...base,chatgpt:auth,mistral:mistral.publicStatus(),agent:{busy:controller?.kind==='agent'},hasKey:base.authMode==='mistral-vibe'?mistral.publicStatus().connected:base.authMode==='chatgpt'?auth.connected:base.hasKey,providers:base.providers.map(p=>p.id==='chatgpt'?{...p,hasKey:auth.connected,hasSavedKey:auth.accounts.length>0,credentialState:auth.connected?'signed-in':auth.accounts.length?'signed-out':'missing'}:p.id==='mistral-vibe'?{...p,hasKey:vibe.connected,hasSavedKey:vibe.connected,credentialState:vibe.connected?'signed-in':vibe.checked?'missing':'unchecked'}:p),modelingContext:modeling().status(),outputBudget:profiles.active().config.maxOutputTokens??(new URL(profiles.active().config.baseUrl).hostname==='api.deepseek.com'?131072:12000),bridge:{enabled:!!bridge,url:bridge?.descriptor.url||null,connectionFile:bridge?.descriptorPath||path.join(app.getPath('userData'),'ai-bridge.json')}};};
 function rpc(method,args,{signal}={}){
  if(win.isDestroyed()||win.webContents.isCrashed?.())return Promise.reject(Object.assign(Error('CAD-Oberfläche ist nicht verfügbar. Bitte im Programm wiederherstellen.'),{code:'CAD_RENDERER_UNAVAILABLE',status:503}));
  signal?.throwIfAborted();const id=++sequence;
  return new Promise((resolve,reject)=>{
   let settled=false,abortReason=null;const cleanup=()=>{pending.delete(id);clearTimeout(item.timer);signal?.removeEventListener('abort',abort);};
   const settle=(fn,value)=>{if(settled)return;settled=true;cleanup();fn(value);};
   const item={resolve:value=>settle(abortReason?reject:resolve,abortReason??value),reject:error=>settle(reject,abortReason??error),timer:null};
   const stop=reason=>{if(settled||abortReason)return;abortReason=reason;if(method==='preview'){win.webContents.send('cad-ai:cancel-request',{id});clearTimeout(item.timer);item.timer=setTimeout(()=>item.reject(reason),5000);}else item.reject(reason);};
   const abort=()=>stop(Object.assign(Error('CAD client disconnected.'),{name:'AbortError',code:'ABORTED'}));
   item.timer=setTimeout(()=>stop(Object.assign(Error('CAD operation timed out.'),{code:'CAD_OPERATION_TIMEOUT'})),method==='preview'||method==='export'?600000:45000);
   pending.set(id,item);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}
   try{win.webContents.send('cad-ai:request',{id,method,args});}catch(error){item.reject(error);}
  });
 }

 ipcMain.on('cad-ai:reply',(event,result)=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)return;const item=pending.get(result?.id);if(!item)return;pending.delete(result.id);clearTimeout(item.timer);if(result.error){const error=Error(result.error);if(typeof result.errorCode==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(result.errorCode))error.code=result.errorCode;if(result.feedback)error.feedback=result.feedback;item.reject(error);}else item.resolve(result.value);});
 const handle=(name,fn)=>ipcMain.handle(name,async(event,args)=>{try{if(win.isDestroyed?.()||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('Invalid window.');return {ok:true,value:await fn(args)};}catch(e){return {ok:false,error:profiles.redact(e.name==='AbortError'?'AI request cancelled or timed out.':String(e.message)),...(e.aiUsage?{aiUsage:e.aiUsage}:{}),...(e.aiRetryable?{aiRetryable:true}:{}),...(e.code?{code:e.code}:{}),...(e.feedback?{feedback:e.feedback}:{})};}});
 async function syncBridge(){bridgeQueue=bridgeQueue.catch(()=>{}).then(async()=>{const {config}=profiles.active();if(config.bridgeEnabled&&!bridge)bridge=await startBridge({rpc:async(method,args,options)=>{const value=await rpc(method,args,options);return method==='context'?{...value,...(value.agentUI?{agentUI:{...value.agentUI,layoutContext:fs.readFileSync(path.join(__dirname,'../ai/FORMNARO-UI-KONTEXT.md'),'utf8')}}:{}),modelingExperience:{referenceOnly:true,text:modeling().context()}}:value;},directory:app.getPath('userData')});else if(!config.bridgeEnabled&&bridge){await bridge.close();bridge=null;}});return bridgeQueue;}
 const requireIdle=()=>{if(controller)throw Error('Die laufende KI-Anfrage zuerst abschließen oder abbrechen.');};
 handle('cad-ai:get',()=>publicSettings());
 let taskStore;handle('cad-ai-tasks:request',args=>{taskStore??=require('./ai-tasks.cjs').createAITaskStore({directory:path.join(path.dirname(file),'KI-Auftraege')});return taskStore.request(args,providerId(profiles.active().config));});
 handle('cad-ai:usage',args=>usageStatistics(args));
 handle('cad-ai:subscription-usage',async args=>{const {config}=profiles.active();const statistics=usageLedger.statistics({period:args?.period??'all',provider:providerId(config)});const account=config.authMode==='mistral-vibe'?await mistral.accountInfo({refresh:args?.refreshAccount===true}):null;return require('./ai-subscription-usage.cjs').subscriptionUsage({config,statistics,account});});
 handle('cad-ai:subscription-open',async()=>{const mode=profiles.active().config.authMode;const url=mode==='chatgpt'?'https://chatgpt.com/settings/usage':mode==='mistral-vibe'?'https://admin.mistral.ai/subscriptions':null;if(!url)throw Error('Der aktuelle Zugang ist kein Abo-Zugang.');await require('electron').shell.openExternal(url);return true;});
 handle('cad-ai:exchange',()=>exchange.get());
 handle('cad-ai:exchange-refresh',()=>exchange.refresh());
 // Captures this application's own contents only. Frames stay in renderer memory;
 // no desktop, filesystem or provider access is offered to the AI.
 handle('cad-ai:guide-frame',async()=>{if(captureBusy||Date.now()-lastCapture<140)return null;captureBusy=true;lastCapture=Date.now();try{const image=await win.webContents.capturePage();if(image.isEmpty())return null;const width=image.getSize().width,small=width>1200?image.resize({width:1200}):image;return 'data:image/jpeg;base64,'+small.toJPEG(52).toString('base64');}finally{captureBusy=false;}});
 handle('cad-ai:context-metrics',args=>require('./ai-context-metrics.cjs').contextMetrics({context:args?.context,config:profiles.active().config,modeling:modeling()}));
 function noteArgs(args,append=false){const allowed=append?['providerId','expectedRevision','text']:['providerId'];if(!args||Object.keys(args).some(k=>!allowed.includes(k))||args.providerId!==providerId(profiles.active().config))throw Error('Kontextnotiz gehört nicht zum aktiven Anbieter.');return args;}
 handle('cad-ai:note-read',args=>{noteArgs(args);return modeling().readNote();});
 handle('cad-ai:note-append',args=>modeling().appendNote(noteArgs(args,true)));
 const freecad=require('./freecad.cjs');let freecadController=null;
 handle('cad-freecad:status',()=>freecad.status());
 handle('cad-freecad:run',async args=>{if(freecadController)throw Object.assign(Error('FreeCAD berechnet bereits einen Entwurf.'),{code:'FREECAD_BUSY'});if(typeof args?.requestId!=='string'||!/^[-a-zA-Z0-9]{1,80}$/.test(args.requestId))throw Error('Ungültige FreeCAD-Anfrage.');const active=new AbortController();active.requestId=args.requestId;freecadController=active;try{return await freecad.run(args,{signal:active.signal});}finally{if(freecadController===active)freecadController=null;}});
 handle('cad-freecad:cancel',args=>{if(freecadController?.requestId!==args?.requestId)return false;freecadController.abort();return true;});
 win.on('closed',()=>freecadController?.abort());
 handle('cad-ai:chatgpt-start',args=>{requireIdle();return chatgpt.start(args);});
 handle('cad-ai:chatgpt-status',()=>chatgpt.publicStatus());
 handle('cad-ai:provider-docs',async()=>{const config=profiles.active().config,url=config.authMode==='mistral-vibe'?'https://docs.mistral.ai/getting-started/quickstarts/vibe-code/install-cli':require('./ai-provider-presets.cjs').preset(config)?.docs;if(!url)throw Error('Für diesen benutzerdefinierten Anbieter sind keine Dokumentationslinks hinterlegt.');await require('electron').shell.openExternal(url);return true;});
 handle('cad-ai:mistral-status',()=>mistral.refresh());
 handle('cad-ai:mistral-start',()=>{requireIdle();return mistral.startLogin();});
 handle('cad-ai:mistral-open',()=>mistral.openLogin());
 handle('cad-ai:mistral-copy',()=>{require('electron').clipboard.writeText(mistral.loginURL());return true;});
 handle('cad-ai:mistral-cancel',()=>mistral.cancelLogin());
 handle('cad-ai:mistral-logout',()=>{requireIdle();catalogs.clear();return mistral.logout();});
 handle('cad-ai:agent-reset',()=>{requireIdle();mistral.reset();mcpAgent.reset();return true;});
 handle('cad-ai:agent-send',async args=>{
  requireIdle();const {config,key}=profiles.active();if(!args||Object.keys(args).some(k=>!['prompt','requestId','providerId'].includes(k))||args.providerId!==providerId(config)||typeof args.requestId!=='string'||!/^[-a-zA-Z0-9]{1,80}$/.test(args.requestId))throw Error('Agentenanbieter wurde geändert oder Auftrag ist ungültig.');
  if(config.authMode==='mistral-vibe'&&mistral.publicStatus().pending)throw Error('Bitte die Mistral-Anmeldung zuerst abschließen oder abbrechen.');
  if(!bridge)throw Error('Zuerst die lokale KI-Schnittstelle in den Einstellungen aktivieren.');
  const active=new AbortController();active.requestId=args.requestId;active.kind='agent';controller=active;const timer=setTimeout(()=>active.abort(),1800000);
  const recordUsage=usage=>{usageLedger.record({usage,config,provider:providerId(config),taskId:args.requestId,args:{prompt:args.prompt,assistantKind:'mcp-agent'}});sendAgentEvent({type:'usage',requestId:args.requestId,usage});};
  try{const result=config.authMode==='mistral-vibe'?await mistral.sendAgent({...args,model:config.model,reasoningEffort:config.mistralReasoningEffort},active.signal):await mcpAgent.run(config,await credential(config,key,active.signal),{...args,onUsage:recordUsage},active.signal);
   const usages=result.usages??[require('./ai-usage.cjs').aiUsage({usage:result.usage,model:result.model,vibeCostUSD:result.costUSD},config,0)];if(config.authMode==='mistral-vibe')for(const usage of usages)recordUsage(usage);try{profiles.markUsed(config);}catch{}return {...result,usages};
  }catch(error){if(error.agentApplied)sendAgentEvent({type:'notice',requestId:args.requestId,text:error.agentApplied+' Änderungsschritte wurden bereits übernommen. Rückgängig ist in Formnaro verfügbar.'});throw error;}finally{clearTimeout(timer);try{await rpc('ui',{action:'cancel'});}catch{}if(controller===active)controller=null;}
 });
 handle('cad-ai:chatgpt-cancel',()=>chatgpt.cancel());
 handle('cad-ai:chatgpt-logout',async()=>{requireIdle();catalogs.clear();return chatgpt.logout();});
 handle('cad-ai:chatgpt-welcome',()=>chatgpt.acknowledge());
 handle('cad-ai:chatgpt-usage',async()=>{await require('electron').shell.openExternal('https://chatgpt.com/settings/usage');return true;});
 handle('cad-ai:experience',value=>modeling().record(value,{model:profiles.active().config.model,appVersion:app.getVersion()}));
 handle('cad-ai:context-folder',async()=>{modeling().status();const error=await require('electron').shell.openPath(modeling().directory);if(error)throw Error('Modellierkontext-Ordner konnte nicht geöffnet werden.');return {opened:true};});
 handle('cad-ai:save',async value=>{requireIdle();profiles.save(value);syncResearch();catalogs.clear();await syncBridge();return publicSettings();});
 handle('cad-ai:provider',value=>{requireIdle();profiles.selectProvider(value?.providerId);syncResearch();return publicSettings();});
 handle('cad-ai:model',value=>{requireIdle();profiles.selectModel(value?.model);return publicSettings();});
 handle('cad-ai:effort',value=>{requireIdle();profiles.selectEffort(value?.reasoningEffort);return publicSettings();});
 handle('cad-ai:models',async value=>{
  const {config:activeConfig}=profiles.active();if(activeConfig.authMode==='mistral-vibe'){const auth=await mistral.refresh();let result={details:[]},error='';if(auth.connected)try{result=await mistral.catalog();}catch(e){error=String(e.message);}return {providerId:'mistral-vibe',baseUrl:activeConfig.baseUrl,models:modelCatalog(activeConfig,result.details),error,hasKey:auth.connected};}
  const {config,key}=profiles.active(),isPlan=config.authMode==='chatgpt',auth=isPlan?chatgpt.publicStatus():null,id=providerId(config),cacheId=catalogKey(config,auth),local=['localhost','127.0.0.1','[::1]'].includes(new URL(config.baseUrl).hostname),cached=catalogs.get(cacheId);let details=[],error='';const hasKey=isPlan?auth.connected:!!key||local;
  if(hasKey){try{if(cached&&!value?.refresh&&Date.now()-cached.time<300000)details=await cached.result;else{const entry={time:Date.now()},signal=AbortSignal.timeout(20000);entry.result=credential(config,key,signal).then(token=>testConnection(config,token,signal)).then(r=>{entry.details=r.details;return r.details;});catalogs.set(cacheId,entry);try{details=await entry.result;}catch(e){if(catalogs.get(cacheId)===entry)catalogs.delete(cacheId);throw e;}}}catch(e){error=profiles.redact(String(e.message));}}
  return {providerId:id,baseUrl:config.baseUrl,models:modelCatalog(config,details),error,hasKey};
 });
 handle('cad-ai:generate',async args=>{if(!args||typeof args!=='object'||Array.isArray(args))throw Object.assign(Error('Ungültige KI-Anfrage.'),{code:'INVALID_AI_REQUEST'});if(controller)throw Error('An AI request is already running.');if(args?.requestId!==undefined&&(typeof args.requestId!=='string'||!/^[-a-zA-Z0-9]{1,80}$/.test(args.requestId)))throw Error('Invalid AI request ID.');const {config,key}=profiles.active();if(config.authMode==='mistral-vibe'&&mistral.publicStatus().pending)throw Error('Bitte die Mistral-Anmeldung zuerst abschließen oder abbrechen.');if(config.authMode==='chatgpt'&&chatgpt.publicStatus().pending)throw Error('Bitte die ChatGPT-Anmeldung zuerst abschließen oder abbrechen.');if(args.requestConfig&&['authMode','protocol','baseUrl','model','reasoningEffort','openAIReasoningEffort','mistralReasoningEffort','providerReasoningEffort','maxOutputTokens'].some(k=>(args.requestConfig[k]??(k==='authMode'?'api-key':['openAIReasoningEffort','mistralReasoningEffort','providerReasoningEffort'].includes(k)?'auto':null))!==(config[k]??null)))throw Error('KI-Anbieter, Modell, Denkstufe oder Antwortbudget wurde geändert. Bitte erneut senden.');const selected=catalogs.get(catalogKey(config))?.details?.find(m=>m.id===config.model);if(selected?.input_modalities&&!selected.input_modalities.includes('image')&&(args.images?.length||args.history?.some(t=>t.images?.length)))throw Error('Dieses Modell unterstützt keine Bilder. Bitte ein bildfähiges Modell auswählen.');controller=new AbortController();controller.requestId=args.requestId??null;const timeout=setTimeout(()=>controller?.abort(),1800000);try{let modelDetails=selected;const token=await credential(config,key,controller.signal);if(config.authMode==='chatgpt'){const available=await testConnection(config,token,controller.signal);modelDetails=available.details.find(m=>m.id===config.model);if(!available.models.includes(config.model))throw Error('Dieses Modell ist für dein ChatGPT-Konto nicht freigegeben. Bitte die Modellliste aktualisieren.');if(modelDetails?.input_modalities&&!modelDetails.input_modalities.includes('image')&&(args.images?.length||args.history?.some(t=>t.images?.length)))throw Error('Dieses Modell unterstützt keine Bilder. Bitte ein bildfähiges Modell auswählen.');}return await generate(config,token,{...args,modelingContext:modeling(config).context()},controller.signal,{modelDetails});}finally{clearTimeout(timeout);controller=null;}});
 handle('cad-ai:test',async()=>{const {config,key}=profiles.active();const signal=AbortSignal.timeout(20000);return config.authMode==='mistral-vibe'?mistral.catalog():testConnection(config,await credential(config,key,signal),signal);});handle('cad-ai:cancel',value=>{if(!value?.requestId&&freecadController)freecadController.abort();if(controller&&(value?.requestId??null)===controller.requestId){if(controller.kind==='agent')void rpc('ui',{action:'cancel'}).catch(()=>{});controller.abort();return true;}return false;});
 win.webContents.on('did-finish-load',()=>{syncBridge().catch(()=>{});});
 const releaseTaskLeases=()=>{controller?.abort();for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('CAD renderer changed.'));}pending.clear();try{taskStore?.releaseOwned();}catch(error){console.error('KI-Auftragssperren konnten nicht freigegeben werden:',error.message);}};
 win.webContents.on('render-process-gone',releaseTaskLeases);
 win.webContents.on('did-start-navigation',(_event,_url,inPlace,mainFrame)=>{if(mainFrame&&!inPlace)releaseTaskLeases();});
 win.on('closed',()=>{releaseTaskLeases();try{taskStore?.close();}catch{}chatgpt.dispose();mistral.dispose();mcpAgent.dispose();controller?.abort();for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('CAD window closed.'));}pending.clear();bridge?.close().catch(()=>{});});
 return {publicSettings,syncBridge};
}
module.exports={installDesktopAI};
