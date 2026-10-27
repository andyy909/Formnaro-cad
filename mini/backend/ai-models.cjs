const BUILTIN_PROVIDERS=[
 {id:'https://api.deepseek.com',label:'DeepSeek',baseUrl:'https://api.deepseek.com',model:'deepseek-flash'},
 {id:'https://api.openai.com',label:'OpenAI / GPT',baseUrl:'https://api.openai.com/v1',model:''}
];
const DEEPSEEK_MODELS=[
 {id:'deepseek-flash',name:'DeepSeek V4.1 Flash',vision:true},
 {id:'deepseek-v4-pro',name:'DeepSeek V4 Pro',vision:false},
 {id:'deepseek-v4-flash',name:'V4 Flash · Alias → V4.1 Flash',vision:true},
 {id:'deepseek-v4-flash-vision-exp',name:'V4 Flash Vision Exp · Alias → V4.1 Flash',vision:true}
];
function knownVision(config){return new URL(config.baseUrl).hostname==='api.deepseek.com'?DEEPSEEK_MODELS.find(m=>m.id===config.model)?.vision??null:null;}
function modelCatalog(config,details=[]){
 const host=new URL(config.baseUrl).hostname,result=new Map();
 for(const model of host==='api.deepseek.com'?DEEPSEEK_MODELS:[])result.set(model.id,{...model});
 for(const model of details){
  if(typeof model.id!=='string'||!model.id.trim()||model.id.length>200)continue;
  // /models includes speech, image generation and embedding models too.
  if(host==='api.openai.com'&&(!/^(?:gpt-|chatgpt-|ft:gpt-)/.test(model.id)||/(?:audio|realtime|transcrib|tts|image|instruct|search|embedding)/i.test(model.id)))continue;
  const previous=result.get(model.id),vision=Array.isArray(model.input_modalities)?model.input_modalities.includes('image'):previous?.vision??null;
  result.set(model.id,{id:model.id,name:previous?.name||model.name||model.id,vision});
 }
 if(config.model&&!result.has(config.model))result.set(config.model,{id:config.model,name:config.model,vision:knownVision(config),current:true});
 return [...result.values()];
}
module.exports={BUILTIN_PROVIDERS,DEEPSEEK_MODELS,knownVision,modelCatalog};
