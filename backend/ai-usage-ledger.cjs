const fs=require('node:fs'),path=require('node:path');
const {writeAtomicSync}=require('./program-storage.cjs');
const CATEGORIES=['edit','rebuild','create','help','other'],MAX_BYTES=8*1024*1024;
const empty=()=>({requests:0,tasks:0,inputTokens:0,outputTokens:0,cachedInputTokens:0,reasoningTokens:0,inputMissing:0,outputMissing:0,cacheMissing:0,reasoningMissing:0,costMinUSD:0,costMaxUSD:0,pricedRequests:0,unpricedRequests:0});
const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
function categoryFor({prompt='',domain,scene,assistantKind}={}){
 const s=String(prompt).toLowerCase();
 if(['guide','help','note'].includes(assistantKind)||/zeig.*(menü|menu|bedien|werkzeug)|show.*(menu|tool|navigation)/.test(s))return 'help';
 if(/\b(wo|wie|welch|what|where|how)\b/.test(s)&&/menü|menu|button|schaltfl|einstell|settings|werkzeug|bedien|finde|öffne|open|export|speicher/.test(s))return 'help';
 if(domain==='converter'||/nachbau|nachstell|rekonstru|reconstruct|rebuild|reverse.?engineer/.test(s)||/\bstl\b/.test(s)&&/\bcad\b|\bstep\b|baue|bau |erstell|konvert/.test(s))return 'rebuild';
 if(/änder|aender|bearbeit|verschieb|skalier|verrund|bohr|extrudier|resize|rotate|modify|\bcut\b|\bmove\b/.test(s))return 'edit';
 if(/erstell|erzeug|konstrui|generier|\bbaue?\b|\bcreate\b|\bbuild\b|\bgenerate\b/.test(s))return 'create';
 if(assistantKind==='demonstrate')return 'create';
 if(/\?|erklär|erklaer|explain|hilfe|help/.test(s))return 'help';
 return 'other';
}
function createAIUsageLedger({file,now=()=>new Date(),write=writeAtomicSync,redact=v=>v}){
 let warning='',cache=null;const tasks=new Map();
 function load(){
  if(cache)return cache;
  try{const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>MAX_BYTES)throw Error();const data=JSON.parse(fs.readFileSync(file,'utf8'));
   if(data.format!=='Formnaro-KI-Verbrauch'||data.version!==1||!Array.isArray(data.rows)||data.rows.length>20000)throw Error();
   for(const r of data.rows){if(!/^\d{4}-\d{2}-\d{2}$/.test(r.day)||typeof r.provider!=='string'||r.provider.length>500||typeof r.model!=='string'||r.model.length>200||!['api-key','chatgpt'].includes(r.authMode)||!CATEGORIES.includes(r.category)||Object.keys(r).some(k=>!['day','provider','model','authMode','category',...Object.keys(empty())].includes(k))||Object.keys(empty()).some(k=>!finite(r[k])||!k.startsWith('cost')&&!Number.isSafeInteger(r[k])))throw Error();}
   return cache=data;
  }catch(e){if(e.code==='ENOENT')return cache={format:'Formnaro-KI-Verbrauch',version:1,since:now().toISOString(),rows:[]};warning='Verbrauchsstatistik konnte nicht gelesen werden. Vorhandene Datei bleibt erhalten.';throw Error(warning);}
 }
 const day=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 function record({usage,config,provider,taskId,args}){
  try{
   const stored=load(),data=structuredClone(stored),key=typeof taskId==='string'&&/^[-a-zA-Z0-9]{1,80}$/.test(taskId)?provider+':'+taskId:null,known=key&&tasks.get(key),category=known?.category??categoryFor(args),isNew=!known;
   const id={day:day(now()),provider:redact(provider).slice(0,500),model:redact(config.model).slice(0,200),authMode:config.authMode??'api-key',category};
   let row=data.rows.find(r=>Object.keys(id).every(k=>r[k]===id[k]));if(!row){row={...id,...empty()};data.rows.push(row);}
   row.requests++;if(isNew)row.tasks++;
   for(const [field,missing]of [['inputTokens','inputMissing'],['outputTokens','outputMissing'],['cachedInputTokens','cacheMissing'],['reasoningTokens','reasoningMissing']]){if(finite(usage?.[field]))row[field]+=usage[field];else row[missing]++;}
   const cost=usage?.estimatedCostUSD;if(finite(cost?.min)&&finite(cost?.max)){row.costMinUSD+=cost.min;row.costMaxUSD+=cost.max;row.pricedRequests++;}else row.unpricedRequests++;
   const text=JSON.stringify(data);if(Buffer.byteLength(text)>MAX_BYTES||data.rows.length>20000)throw Error();fs.mkdirSync(path.dirname(file),{recursive:true});write(file,text);cache=data;warning='';if(key){tasks.set(key,{category});if(tasks.size>256)tasks.delete(tasks.keys().next().value);}return true;
  }catch{warning=warning||'Verbrauchsstatistik konnte nicht gespeichert werden. Die KI-Antwort ist davon unabhängig.';return false;}
 }
 function statistics({period='all',provider}={}){
  if(!['all','today','30days'].includes(period))throw Error('Ungültiger Statistikzeitraum.');
  let data;try{data=load();}catch{return {warning,available:false,rows:[]};}
  const start=now();if(period==='30days')start.setDate(start.getDate()-29);const from=period==='all'?'':day(start);
  const rows=CATEGORIES.map(category=>({category,api:empty(),subscription:empty()}));
  for(const r of data.rows){if(r.day<from||provider&&r.provider!==provider)continue;const target=rows.find(x=>x.category===r.category)[r.authMode==='chatgpt'?'subscription':'api'];for(const k of Object.keys(empty()))target[k]+=r[k];}
  return {available:true,since:data.since,updatedAt:now().toISOString(),period,rows,warning,containsPrompts:false};
 }
 return {record,statistics};
}
module.exports={createAIUsageLedger,categoryFor,CATEGORIES};
