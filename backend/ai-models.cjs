const {reasoningEfforts}=require('./ai-reasoning.cjs');
const {BUILTIN_PROVIDERS}=require('./ai-provider-presets.cjs');
const DEEPSEEK_MODELS=[
 {id:'deepseek-flash',name:'DeepSeek V4.1 Flash',vision:true},
 {id:'deepseek-v4-pro',name:'DeepSeek V4 Pro',vision:false}
];
const DEEPSEEK_ALIASES=new Set(['deepseek-v4-flash','deepseek-v4-flash-vision-exp']);
function knownVision(config){return new URL(config.baseUrl).hostname==='api.deepseek.com'?(DEEPSEEK_ALIASES.has(config.model)?true:DEEPSEEK_MODELS.find(m=>m.id===config.model)?.vision??null):null;}
function modelCatalog(config,details=[]){
 const host=new URL(config.baseUrl).hostname,result=new Map();
 for(const model of host==='api.deepseek.com'?DEEPSEEK_MODELS:[])result.set(model.id,{...model});
 if(host==='api.deepseek.com'&&DEEPSEEK_ALIASES.has(config.model))result.set(config.model,{id:config.model,name:config.model+' · Legacy alias → DeepSeek V4.1 Flash',vision:true,current:true});
 for(const model of details){
  if(typeof model.id!=='string'||!model.id.trim()||model.id.length>200)continue;
  if(host==='api.deepseek.com'&&DEEPSEEK_ALIASES.has(model.id))continue;
  if(host==='api.groq.com'&&(/^(?:whisper-|canopylabs\/|playai-)/i.test(model.id)||/(?:guard|safeguard)/i.test(model.id)))continue;
  // /models includes speech, image generation and embedding models too.
  if(config.authMode!=='chatgpt'&&host==='api.openai.com'&&(!/^(?:gpt-|chatgpt-|ft:gpt-)/.test(model.id)||/(?:audio|realtime|transcrib|tts|image|instruct|search|embedding)/i.test(model.id)))continue;
  const previous=result.get(model.id),vision=Array.isArray(model.input_modalities)?model.input_modalities.includes('image'):previous?.vision??null;
  result.set(model.id,{id:model.id,name:previous?.name||model.name||model.id,vision,reasoningEfforts:reasoningEfforts({...config,model:model.id},model)});
 }
 if(config.authMode!=='chatgpt'&&config.model&&!result.has(config.model))result.set(config.model,{id:config.model,name:config.model,vision:knownVision(config),current:true});
 return [...result.values()].map(m=>({...m,reasoningEfforts:m.reasoningEfforts??reasoningEfforts({...config,model:m.id})}));
}
module.exports={BUILTIN_PROVIDERS,DEEPSEEK_MODELS,knownVision,modelCatalog};
