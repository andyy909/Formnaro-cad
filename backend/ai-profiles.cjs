const {DEFAULT_CONFIG,validateConfig}=require('./ai-provider.cjs');
const {BUILTIN_PROVIDERS}=require('./ai-models.cjs');
// Secrets never cross IPC. Profiles are scoped to their validated API origin.
function createAIProfiles({stored,encrypt,decrypt,canEncrypt,persist}){
 let config={...DEFAULT_CONFIG},profiles=new Map();const origin=c=>c.authMode==='chatgpt'?'chatgpt':new URL(c.baseUrl).origin;
 function load(entry){const c=validateConfig(entry.config);let key='',encryptedKey=c.rememberKey&&typeof entry.encryptedKey==='string'?entry.encryptedKey:'';if(encryptedKey){try{key=decrypt(encryptedKey);}catch{/* Keep unavailable encrypted credentials recoverable. */}}profiles.set(origin(c),{config:c,key,encryptedKey});return c;}
 if(stored){for(const entry of Array.isArray(stored.profiles)?stored.profiles:[]){try{load(entry);}catch{/* Ignore malformed inactive profiles. */}}try{config=load(stored);}catch{/* Keep valid inactive profiles. */}}
 let lastAPIConfig={...config};
 if(stored?.chatgptConfig){try{const c=validateConfig(stored.chatgptConfig);if(c.authMode==='chatgpt'){profiles.set('chatgpt',{config:c,key:'',encryptedKey:''});if(stored.selectedProviderId==='chatgpt')config=c;}}catch{}}
 const active=()=>({config:{...config},key:profiles.get(origin(config))?.key||''});
 function publicSettings(){const list=new Map(BUILTIN_PROVIDERS.map(p=>[p.id,{...p,hasKey:!!profiles.get(p.id)?.key}]));for(const [id,p]of profiles){const builtin=BUILTIN_PROVIDERS.find(b=>b.id===id);list.set(id,{id,label:builtin?.label||'API · '+new URL(p.config.baseUrl).host,authMode:p.config.authMode,baseUrl:p.config.baseUrl,model:p.config.model,hasKey:!!p.key});}return {...config,providerId:origin(config),hasKey:!!active().key,canRememberKey:canEncrypt(),providers:[...list.values()]};}
 function serialize(nextConfig=config,nextProfiles=profiles){
  // Keep legacy readers on an API profile; never place an empty OAuth entry at the API-key origin.
  const compatible=nextConfig.authMode==='chatgpt'?lastAPIConfig:nextConfig,legacyConfig={...compatible,bridgeEnabled:nextConfig.bridgeEnabled};
  const entries=[...nextProfiles.values()].filter(p=>p.config.authMode!=='chatgpt').map(p=>({config:{...p.config,bridgeEnabled:nextConfig.bridgeEnabled},...(p.config.rememberKey&&p.encryptedKey?{encryptedKey:p.encryptedKey}:{})})),selected=nextProfiles.get(origin(legacyConfig));
  return {version:2,config:legacyConfig,selectedProviderId:origin(nextConfig),...(nextProfiles.has('chatgpt')?{chatgptConfig:{...nextProfiles.get('chatgpt').config,bridgeEnabled:nextConfig.bridgeEnabled}}:{}),...(legacyConfig.rememberKey&&selected?.encryptedKey?{encryptedKey:selected.encryptedKey}:{}),profiles:entries};
 }
 function save(value){
  if(!value||typeof value!=='object')throw Error('Invalid AI settings.');const next=validateConfig(value.config),id=origin(next),previous=profiles.get(id),newKey=typeof value.key==='string'&&!!value.key;
  const key=value.clearKey?'':newKey?value.key:previous?.key||'';
  if(next.authMode==='chatgpt'&&(key||value.clearKey))throw Error('ChatGPT-Anmeldung über die Anmeldeschaltfläche verwalten.');
  if(key.length>4096||/[\r\n]/.test(key))throw Error('Invalid API key.');
  let encryptedKey='';if(next.rememberKey){if(!value.clearKey&&!newKey&&previous?.encryptedKey)encryptedKey=previous.encryptedKey;else if(key){if(!canEncrypt())throw Error('Encrypted key storage is unavailable on this computer.');encryptedKey=encrypt(key);}}
  const updated=new Map(profiles);updated.set(id,{config:next,key,encryptedKey});persist(serialize(next,updated));profiles=updated;config=next;if(next.authMode!=='chatgpt')lastAPIConfig={...next};return publicSettings();
 }
 function selectProvider(id){const existing=profiles.get(id),builtin=BUILTIN_PROVIDERS.find(p=>p.id===id);if(!existing&&!builtin)throw Error('Unbekannter KI-Anbieter. Zuerst in den API-Einstellungen einrichten.');return save({config:{...(existing?.config||{...DEFAULT_CONFIG,authMode:builtin.authMode||'api-key',baseUrl:builtin.baseUrl,model:builtin.model}),bridgeEnabled:config.bridgeEnabled}});}
 function selectModel(model){if(typeof model!=='string'||!model.trim())throw Error('Bitte ein Modell auswählen.');return save({config:{...config,model,...(model!==config.model?{openAIReasoningEffort:'auto'}:{})}});}
 function selectEffort(reasoningEffort){return save({config:{...config,...(new URL(config.baseUrl).hostname==='api.openai.com'?{openAIReasoningEffort:reasoningEffort}:{reasoningEffort})}});}
 function redact(text){for(const p of profiles.values())if(p.key)text=text.split(p.key).join('[redacted]');return text;}
 return {active,publicSettings,save,selectProvider,selectModel,selectEffort,serialize,redact};
}
module.exports={createAIProfiles};
