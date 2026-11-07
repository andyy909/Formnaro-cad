const fs=require('node:fs'),path=require('node:path');
const {validateConfig}=require('./ai-provider.cjs');
const {reasoningEfforts,requestEffort}=require('./ai-reasoning.cjs');
const ROLES=['modeler','supervisor','reviewer'];
const EFFORTS=['auto','none','minimal','low','medium','high','xhigh','max','enabled','disabled'];
function validateSelection(value={},role){
 if(!ROLES.includes(role)||!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['providerId','model','effort'].includes(k)))throw Error('Ungültige Labor-Agentenauswahl.');
 const s={providerId:value.providerId??'current',model:value.model??'',effort:value.effort??(role==='modeler'?'series':role==='supervisor'?'monitor':'high')};
 if(typeof s.providerId!=='string'||!s.providerId||s.providerId.length>500||/[\x00-\x20]/.test(s.providerId)||typeof s.model!=='string'||s.model.length>200||/[\x00-\x1f]/.test(s.model)||typeof s.effort!=='string'||![...EFFORTS,'profile',...(role==='modeler'?['series']:[]),...(role==='supervisor'?['monitor']:[])].includes(s.effort))throw Error('Ungültiges Profil, Modell oder Denkstufe.');
 if(!['current','chatgpt','mistral-vibe'].includes(s.providerId)){let u;try{u=new URL(s.providerId);}catch{throw Error('Ungültige Profilkennung.');}if(u.origin!==s.providerId||u.username||u.password||!['https:','http:'].includes(u.protocol))throw Error('Ungültige Profilkennung.');}
 return s;
}
function validateRoles(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!ROLES.includes(k)))throw Error('Ungültige Laborrollen.');
 return Object.fromEntries(ROLES.map(role=>[role,validateSelection(value[role],role)]));
}
function applyEffort(config,selection,detail){
 if(selection==='profile')return {config:{...config},effort:requestEffort(config,detail)};
 const host=new URL(config.baseUrl).hostname,c={...config};
 const supported=reasoningEfforts(c,detail);
 if(selection!=='auto'&&!supported.includes(selection))throw Error('Diese Denkstufe ist für das gewählte Modell nicht verfügbar: '+selection);
 if(host==='api.deepseek.com'){if(selection!=='auto')c.reasoningEffort=selection;return {config:c,effort:c.reasoningEffort};}
 if(host==='api.openai.com')c.openAIReasoningEffort=selection;
 else if(host==='api.mistral.ai')c.mistralReasoningEffort=selection;
 else c.providerReasoningEffort=selection;
 return {config:c,effort:requestEffort(c,detail)};
}
function publicConnection(c,effort,selection){return {providerId:c.providerId,model:c.config.model,authMode:c.config.authMode,protocol:c.config.protocol,requestedEffort:selection,effectiveEffort:effort??'auto'};}
function createLabRoles({directory,credentials,provider,connections,onChange=()=>{}}){
 const file=path.join(directory,'Labor-Agenten.json');let selections=validateRoles({});const secrets=new Set();
 try{selections=validateRoles(JSON.parse(fs.readFileSync(file,'utf8')));}catch{}
 const redact=value=>{const text=JSON.stringify(value);if(text===undefined)return null;let safe=connections?.redact?connections.redact(text):text;for(const key of secrets)if(key)safe=safe.split(key).join('[entfernt]');return JSON.parse(safe);};
 const getConnection=id=>id==='current'?credentials():connections?.connection?connections.connection(id):(()=>{const c=credentials();if(new URL(c.config.baseUrl).origin!==id)throw Error('Dieses Zugangsprofil ist hier nicht verfügbar.');return c;})();
 const publicProviders=()=>connections?.providers?connections.providers():[{id:new URL(credentials().config.baseUrl).origin,label:new URL(credentials().config.baseUrl).host,model:credentials().config.model,hasKey:!!credentials().key,authMode:credentials().config.authMode??'api-key'}];
 const state=()=>({selections:structuredClone(selections),providers:publicProviders().map(p=>({id:p.id,label:p.label,model:p.model??'',authMode:p.authMode??'api-key',hasKey:!!p.hasKey,configured:!!p.configured}))});
 async function catalog(providerId='current',{refresh=false,signal=AbortSignal.timeout(20000)}={}){
  if(typeof providerId!=='string')throw Error('Ungültiges Zugangsprofil.');
  const c=getConnection(providerId),id=c.config.authMode==='chatgpt'?'chatgpt':c.config.authMode==='mistral-vibe'?'mistral-vibe':new URL(c.config.baseUrl).origin;
  // The desktop catalog owns account-aware caching; never reuse another account's access list here.
  let result;
  if(connections?.catalog)result=await connections.catalog(c,{refresh,signal});
  else{const raw=await provider.testConnection(validateConfig(c.config),c.key,signal),details=raw.details??raw.models.map(id=>({id}));result={hasKey:!!c.key||['localhost','127.0.0.1','[::1]'].includes(new URL(c.config.baseUrl).hostname),models:require('./ai-models.cjs').modelCatalog(c.config,details),availableModelIds:raw.models};}
  if(result.error)throw Error(result.error);
  if(!result.hasKey)throw Error('Zugangsprofil zuerst einrichten oder anmelden.');
  const value=redact({providerId:id,defaultModel:c.config.model,models:result.models.map(m=>({id:m.id,name:m.name??m.id,vision:m.vision??null,reasoningEfforts:m.reasoningEfforts??reasoningEfforts({...c.config,model:m.id},m),supported_reasoning_levels:m.reasoningEfforts??reasoningEfforts({...c.config,model:m.id},m)})),availableModelIds:result.availableModelIds??result.models.filter(m=>!m.current).map(m=>m.id)});
  return value;
 }
 async function resolve(role,selection,{signal,seriesEfforts=['high'],monitor}={}){
  selection=validateSelection(selection??selections[role],role);
  const stored=getConnection(selection.providerId),config=validateConfig({...stored.config,webResearchAllowed:false}),cat=await catalog(selection.providerId,{signal});
  const model=selection.model||((new URL(config.baseUrl).hostname==='api.deepseek.com'&&cat.availableModelIds.includes('deepseek-flash'))?'deepseek-flash':config.model);
  if(!model||!cat.availableModelIds.includes(model))throw Error('Modell ist für dieses Zugangsprofil nicht verfügbar: '+model);
  const detail=cat.models.find(m=>m.id===model),base={...config,model},efforts=selection.effort==='series'?seriesEfforts:[selection.effort==='monitor'?(monitor?.effort??'low'):selection.effort];
  // Validate every requested condition before the first modeling request.
  for(const e of efforts)applyEffort(base,e,detail);
  const key=connections?.credential?await connections.credential(base,stored.key,signal):stored.key;
  if(key)secrets.add(key);const resolved={providerId:cat.providerId,config:base,key,detail,selection};
  resolved.forEffort=e=>{const chosen=selection.effort==='series'?e:selection.effort==='monitor'?(monitor?.effort??'low'):selection.effort;const applied=applyEffort(base,chosen,detail);return {...resolved,...applied,public:publicConnection(resolved,applied.effort,chosen)};};
  return resolved.forEffort(efforts[0]);
 }
 return {state,redact,catalog,resolve,selection:role=>structuredClone(selections[role]),
  save(role,value){const next={...selections,[role]:validateSelection(value,role)};fs.writeFileSync(file,JSON.stringify(next,null,2));selections=next;onChange();return state();},
  freeze(value,monitor){const result=validateRoles(value??selections);if(!value&&result.supervisor.model==='')result.supervisor.model=monitor?.model??'';return result;}
 };
}
module.exports={ROLES,EFFORTS,validateSelection,validateRoles,applyEffort,createLabRoles};
