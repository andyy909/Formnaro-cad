const fs=require('node:fs'),path=require('node:path');
const {providerContext}=require('./ai-provider-context.cjs'),{workingRules}=require('./ai-working-rules.cjs'),{aiUsage}=require('./ai-usage.cjs');
const estimate=text=>({bytes:Buffer.byteLength(text),characters:text.length,estimatedTokens:Math.ceil(text.length/4)});
function contextMetrics({context,config,modeling,now=()=>new Date(),bundledDirectory=path.join(__dirname,'../ai')}){
 // The complete public contract includes its backwards-compatible schema alias.
 // Measure the actual provider representation below, but accept the bounded
 // full contract here, including the richer V4 curve/constraint definitions.
 if(!context||typeof context!=='object'||Array.isArray(context)||Buffer.byteLength(JSON.stringify(context),'utf8')>2*1024*1024)throw Error('Ungültiger Kontext für die Größenanzeige.');
 const status=modeling.status(),components=[{id:'tools',...estimate(JSON.stringify(providerContext(context)))},{id:'rules',...estimate(workingRules('cad'))},{id:'memory',...estimate(modeling.context())}];
 const total={bytes:components.reduce((s,r)=>s+r.bytes,0),characters:components.reduce((s,r)=>s+r.characters,0),estimatedTokens:components.reduce((s,r)=>s+r.estimatedTokens,0)};
 total.estimatedInputCostUSD=aiUsage({usage:{input_tokens:total.estimatedTokens,output_tokens:0,input_tokens_details:{cached_tokens:0}}},config,0).estimatedCostUSD;
 const files=[['toolsJson',path.join(bundledDirectory,'OfflineCAD-KI-Kontext.json')],['toolsText',path.join(bundledDirectory,'AI-CONTEXT.txt')],['agentRules',path.join(bundledDirectory,'FORMNARO-ASSISTENT.md')],['notes',status.notesFile],['journal',status.journalFile]].map(([id,file])=>{
  try{const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4*1024*1024)throw Error();return {id,name:path.basename(file),available:true,...estimate(fs.readFileSync(file,'utf8'))};}catch(e){return {id,name:file?path.basename(file):id,available:e.code==='ENOENT',bytes:e.code==='ENOENT'?0:null,estimatedTokens:e.code==='ENOENT'?0:null,missing:e.code==='ENOENT'};}
 });
 return {updatedAt:now().toISOString(),model:config.model,provider:config.authMode==='chatgpt'?'chatgpt':new URL(config.baseUrl).origin,components,total,files,tokenEstimateMethod:'characters/4',warning:status.warning||'',scope:'Fixed context components only; scene, task, conversation, images and per-task analysis/failure evidence are additional. The application agent guidance is included in rules; the large local tool documentation files are not automatically sent in full.'};
}
module.exports={contextMetrics,estimate};
