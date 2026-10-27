const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {createModelingContext,validateJournal,NOTE_LIMIT}=require('./ai-modeling-context.cjs');
function contextKey(id){
 if(id==='chatgpt')return 'ChatGPT';
 const origin=new URL(id).origin;if(origin!==id||!['http:','https:'].includes(new URL(id).protocol))throw Error('Ungültiger Kontext-Anbieter.');
 if(id==='https://api.openai.com')return 'OpenAI-API';
 if(id==='https://api.deepseek.com')return 'DeepSeek';
 return 'Anbieter-'+createHash('sha256').update(id).digest('hex').slice(0,24);
}
function createProviderContexts({directory,...options}){
 const stores=new Map();
 function forProvider(id){
  if(stores.has(id))return stores.get(id);
  const target=path.join(directory,'KI-Kontexte',contextKey(id));
  // The original shared files remain an unchanged archive. Only the historically
  // DeepSeek-owned notes and clearly attributed DeepSeek journal rows migrate.
  if(id==='https://api.deepseek.com'){
   fs.mkdirSync(target,{recursive:true});
   for(const name of ['KI-Modellierkontext.md','KI-Modelliererfahrungen.json']){
    const source=path.join(directory,name),dest=path.join(target,name);
    if(fs.existsSync(dest)||!fs.existsSync(source))continue;
    try{const stat=fs.lstatSync(source);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>(name.endsWith('.md')?NOTE_LIMIT:65536))continue;
     let text=fs.readFileSync(source,'utf8');if(name.endsWith('.json'))text=JSON.stringify({format:'Formnaro-Modelliererfahrungen',version:1,entries:validateJournal(JSON.parse(text)).filter(r=>/^deepseek(?:-|$)/i.test(r.model))},null,2);
     fs.writeFileSync(dest,text,{flag:'wx'});
    }catch{/* Preserve legacy data; invalid files are never sent to another provider. */}
   }
  }
  const store=createModelingContext({...options,directory:target}),status=store.status;
  store.status=()=>({...status(),providerId:id,separateProviders:true,legacyDirectory:directory});stores.set(id,store);return store;
 }
 return {forProvider};
}
module.exports={createProviderContexts,contextKey};
