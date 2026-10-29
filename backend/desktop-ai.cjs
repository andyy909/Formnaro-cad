const {app,ipcMain,safeStorage}=require('electron'),fs=require('node:fs'),path=require('node:path');
const {generate:generateProvider,testConnection}=require('./ai-provider.cjs');const {startBridge}=require('./api-bridge.cjs');
const {writeAtomicSync}=require('./program-storage.cjs');
const {createAIProfiles}=require('./ai-profiles.cjs');
const {modelCatalog}=require('./ai-models.cjs');
function installDesktopAI(win,{settingsFile=path.join(app.getPath('userData'),'ai-settings.json'),fallbackFile}={}){const file=settingsFile;let bridge=null,bridgeQueue=Promise.resolve(),sequence=0,controller=null;const pending=new Map(),catalogs=new Map();let stored;
 try{stored=JSON.parse(fs.readFileSync(fs.existsSync(file)?file:fallbackFile||file,'utf8'));}catch{/* Missing/corrupt settings never reveal credentials. */}
 const profiles=createAIProfiles({stored,canEncrypt:()=>safeStorage.isEncryptionAvailable(),encrypt:key=>safeStorage.encryptString(key).toString('base64'),decrypt:encrypted=>safeStorage.decryptString(Buffer.from(encrypted,'base64')),persist:value=>{fs.mkdirSync(path.dirname(file),{recursive:true});if(fs.existsSync(file))writeAtomicSync(file+'.vorher',fs.readFileSync(file));writeAtomicSync(file,JSON.stringify(value));}});
 const chatgpt=require('./chatgpt-auth.cjs').createChatGPTAuth({directory:path.join(app.getPath('userData'),'chatgpt'),canEncrypt:()=>safeStorage.isEncryptionAvailable(),encrypt:value=>safeStorage.encryptString(value).toString('base64'),decrypt:value=>safeStorage.decryptString(Buffer.from(value,'base64')),openExternal:url=>require('electron').shell.openExternal(url)});
 const providerId=c=>c.authMode==='chatgpt'?'chatgpt':new URL(c.baseUrl).origin;
 const credential=async(config,key,signal)=>config.authMode==='chatgpt'?chatgpt.token(signal):key;
 const modelingStores=require('./ai-provider-memory.cjs').createProviderContexts({directory:path.dirname(file),redact:value=>{const text=profiles.redact(value);return bridge?.descriptor.token?text.split(bridge.descriptor.token).join('[redacted]'):text;}});
 const modeling=(config=profiles.active().config)=>modelingStores.forProvider(providerId(config));
 const usageLedger=require('./ai-usage-ledger.cjs').createAIUsageLedger({file:path.join(path.dirname(file),'KI-Verbrauch.json'),redact:value=>profiles.redact(value)});
 let captureBusy=false,lastCapture=0;
 const exchange=require('./ai-exchange.cjs').createAIExchange({file:path.join(path.dirname(file),'KI-Wechselkurs.json')});
 const usageStatistics=args=>usageLedger.statistics({period:args?.period??'all',provider:args?.allProviders?undefined:providerId(profiles.active().config)});
 async function generate(config,token,args,signal,options){
  let usage,reply;
  try{const value=await generateProvider(config,token,args,signal,options);usage=value.usage;reply=value;return value;}
  catch(error){usage=error.aiUsage;throw error;}
  finally{usageLedger.record({usage,config,provider:providerId(config),taskId:args.usageTaskId??args.requestId,args:{...args,assistantKind:reply?.assistant?.kind}});}
 }
 const publicSettings=()=>{const auth=chatgpt.publicStatus(),base=profiles.publicSettings();return {...base,chatgpt:auth,hasKey:base.authMode==='chatgpt'?auth.connected:base.hasKey,providers:base.providers.map(p=>p.id==='chatgpt'?{...p,hasKey:auth.connected}:p),modelingContext:modeling().status(),outputBudget:profiles.active().config.maxOutputTokens??(new URL(profiles.active().config.baseUrl).hostname==='api.deepseek.com'?131072:12000),bridge:{enabled:!!bridge,url:bridge?.descriptor.url||null,connectionFile:bridge?.descriptorPath||path.join(app.getPath('userData'),'ai-bridge.json')}};};
 function rpc(method,args){if(win.isDestroyed())return Promise.reject(Error('CAD window closed.'));const id=++sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('CAD operation timed out.'));},method==='preview'||method==='export'?600000:45000);pending.set(id,{resolve,reject,timer});win.webContents.send('cad-ai:request',{id,method,args});});}
 ipcMain.on('cad-ai:reply',(event,result)=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)return;const item=pending.get(result?.id);if(!item)return;pending.delete(result.id);clearTimeout(item.timer);if(result.error){const error=Error(result.error);if(typeof result.errorCode==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(result.errorCode))error.code=result.errorCode;if(result.feedback)error.feedback=result.feedback;item.reject(error);}else item.resolve(result.value);});
 const handle=(name,fn)=>ipcMain.handle(name,async(event,args)=>{try{if(win.isDestroyed?.()||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('Invalid window.');return {ok:true,value:await fn(args)};}catch(e){return {ok:false,error:profiles.redact(e.name==='AbortError'?'AI request cancelled or timed out.':String(e.message)),...(e.aiUsage?{aiUsage:e.aiUsage}:{}),...(e.aiRetryable?{aiRetryable:true}:{}),...(e.code?{code:e.code}:{}),...(e.feedback?{feedback:e.feedback}:{})};}});
 async function syncBridge(){bridgeQueue=bridgeQueue.catch(()=>{}).then(async()=>{const {config}=profiles.active();if(config.bridgeEnabled&&!bridge)bridge=await startBridge({rpc:async(method,args)=>{const value=await rpc(method,args);return method==='context'?{...value,modelingExperience:{referenceOnly:true,text:modeling().context()}}:value;},directory:app.getPath('userData')});else if(!config.bridgeEnabled&&bridge){await bridge.close();bridge=null;}});return bridgeQueue;}
 const requireIdle=()=>{if(controller)throw Error('Die laufende KI-Anfrage zuerst abschließen oder abbrechen.');};
 handle('cad-ai:get',()=>publicSettings());
 let taskStore;handle('cad-ai-tasks:request',args=>{taskStore??=require('./ai-tasks.cjs').createAITaskStore({directory:path.join(path.dirname(file),'KI-Auftraege')});return taskStore.request(args,providerId(profiles.active().config));});
 handle('cad-ai:usage',args=>usageStatistics(args));
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
 handle('cad-ai:chatgpt-cancel',()=>chatgpt.cancel());
 handle('cad-ai:chatgpt-logout',async()=>{requireIdle();catalogs.clear();return chatgpt.logout();});
 handle('cad-ai:chatgpt-welcome',()=>chatgpt.acknowledge());
 handle('cad-ai:chatgpt-usage',async()=>{await require('electron').shell.openExternal('https://chatgpt.com/settings/usage');return true;});
 handle('cad-ai:experience',value=>modeling().record(value,{model:profiles.active().config.model,appVersion:app.getVersion()}));
 handle('cad-ai:context-folder',async()=>{modeling().status();const error=await require('electron').shell.openPath(modeling().directory);if(error)throw Error('Modellierkontext-Ordner konnte nicht geöffnet werden.');return {opened:true};});
 handle('cad-ai:save',async value=>{requireIdle();profiles.save(value);catalogs.clear();await syncBridge();return publicSettings();});
 handle('cad-ai:provider',value=>{requireIdle();profiles.selectProvider(value?.providerId);return publicSettings();});
 handle('cad-ai:model',value=>{requireIdle();profiles.selectModel(value?.model);return publicSettings();});
 handle('cad-ai:effort',value=>{requireIdle();profiles.selectEffort(value?.reasoningEffort);return publicSettings();});
 handle('cad-ai:models',async value=>{
  const {config,key}=profiles.active(),isPlan=config.authMode==='chatgpt',auth=isPlan?chatgpt.publicStatus():null,id=providerId(config),cacheId=isPlan?id+':'+auth.activeId:config.baseUrl,local=['localhost','127.0.0.1','[::1]'].includes(new URL(config.baseUrl).hostname),cached=catalogs.get(cacheId);let details=[],error='';const hasKey=isPlan?auth.connected:!!key||local;
  if(hasKey){try{if(cached&&!value?.refresh&&Date.now()-cached.time<300000)details=await cached.result;else{const entry={time:Date.now()},signal=AbortSignal.timeout(20000);entry.result=credential(config,key,signal).then(token=>testConnection(config,token,signal)).then(r=>{entry.details=r.details;return r.details;});catalogs.set(cacheId,entry);try{details=await entry.result;}catch(e){if(catalogs.get(cacheId)===entry)catalogs.delete(cacheId);throw e;}}}catch(e){error=profiles.redact(String(e.message));}}
  return {providerId:id,baseUrl:config.baseUrl,models:modelCatalog(config,details),error,hasKey};
 });
 handle('cad-ai:generate',async args=>{if(!args||typeof args!=='object'||Array.isArray(args))throw Object.assign(Error('Ungültige KI-Anfrage.'),{code:'INVALID_AI_REQUEST'});if(controller)throw Error('An AI request is already running.');if(args?.requestId!==undefined&&(typeof args.requestId!=='string'||!/^[-a-zA-Z0-9]{1,80}$/.test(args.requestId)))throw Error('Invalid AI request ID.');const {config,key}=profiles.active();if(config.authMode==='chatgpt'&&chatgpt.publicStatus().pending)throw Error('Bitte die ChatGPT-Anmeldung zuerst abschließen oder abbrechen.');if(args.requestConfig&&['authMode','protocol','baseUrl','model','reasoningEffort','openAIReasoningEffort','maxOutputTokens'].some(k=>(args.requestConfig[k]??(k==='authMode'?'api-key':k==='openAIReasoningEffort'?'auto':null))!==(config[k]??null)))throw Error('KI-Anbieter, Modell, Denkstufe oder Antwortbudget wurde geändert. Bitte erneut senden.');const selected=catalogs.get(config.baseUrl)?.details?.find(m=>m.id===config.model);if(selected?.input_modalities&&!selected.input_modalities.includes('image')&&(args.images?.length||args.history?.some(t=>t.images?.length)))throw Error('Dieses Modell unterstützt keine Bilder. Bitte ein bildfähiges Modell auswählen.');controller=new AbortController();controller.requestId=args.requestId??null;const timeout=setTimeout(()=>controller?.abort(),1800000);try{let modelDetails=selected;const token=await credential(config,key,controller.signal);if(config.authMode==='chatgpt'){const available=await testConnection(config,token,controller.signal);modelDetails=available.details.find(m=>m.id===config.model);if(!available.models.includes(config.model))throw Error('Dieses Modell ist für dein ChatGPT-Konto nicht freigegeben. Bitte die Modellliste aktualisieren.');}return await generate(config,token,{...args,modelingContext:modeling(config).context()},controller.signal,{modelDetails});}finally{clearTimeout(timeout);controller=null;}});
 handle('cad-ai:test',async()=>{const {config,key}=profiles.active();const signal=AbortSignal.timeout(20000);return testConnection(config,await credential(config,key,signal),signal);});handle('cad-ai:cancel',value=>{if(!value?.requestId&&freecadController)freecadController.abort();if(controller&&(value?.requestId??null)===controller.requestId){controller.abort();return true;}return false;});
 win.webContents.on('did-finish-load',()=>{syncBridge().catch(()=>{});});
 win.on('closed',()=>{chatgpt.dispose();controller?.abort();for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('CAD window closed.'));}pending.clear();bridge?.close().catch(()=>{});});
 return {publicSettings,syncBridge};
}
module.exports={installDesktopAI};
