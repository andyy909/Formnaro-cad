const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');

const origin='https://api.deepseek.com';
const flashConfig={authMode:'api-key',protocol:'chat',baseUrl:origin,model:'deepseek-flash',reasoningEffort:'high',
 agentSteps:7,rememberKey:false,bridgeEnabled:false,webResearchAllowed:false};
const practiceFeedbackKinds=new Set(['practice-step-failed','practice-quality-blocked','practice-quality-advisory']);

function flashProfile(file){
 const saved=JSON.parse(fs.readFileSync(file,'utf8'));
 const entries=[...(Array.isArray(saved.profiles)?saved.profiles:[]),saved];
 const entry=entries.find(item=>typeof item.encryptedKey==='string'&&item.encryptedKey&&
  [origin,origin+'/',origin+'/v1',origin+'/v1/'].includes(item.config?.baseUrl));
 if(!entry)throw Error('Gespeichertes DeepSeek-Profil fehlt.');
 return {config:{...flashConfig,rememberKey:true},encryptedKey:entry.encryptedKey,selectedProviderId:origin};
}

function recordPracticeFlash(directory){
 const original=global.fetch,rounds=[];
 let catalog;
 const write=()=>fs.writeFileSync(path.join(directory,'flash-rounds.json'),JSON.stringify({catalog,rounds},null,2));
 global.fetch=async function fetch(url,options){
  const target=new URL(url instanceof Request?url.url:url);
  if(target.origin!==origin)return original.call(this,url,options);
  if(target.pathname.endsWith('/models')){
   const response=await original.call(this,url,options);
   const listing=await response.clone().json().catch(()=>null),model=listing?.data?.find(item=>item.id===flashConfig.model);
   catalog={status:response.status,available:!!model,inputModalities:model?.input_modalities,supportedEfforts:model?.supported_reasoning_levels??model?.supported_reasoning_efforts};
   write();return response;
  }
  if(!target.pathname.endsWith('/chat/completions'))throw Error('Unexpected DeepSeek test route.');
  const body=JSON.parse(options.body),round={round:rounds.length+1,model:body.model,sentEffort:body.reasoning_effort,
   thinking:body.thinking?.type,responseFormat:body.response_format?.type,requestBytes:Buffer.byteLength(options.body),images:[]};
  const key=new Headers(options.headers).get('Authorization')?.replace(/^Bearer\s+/i,'');
  const redact=text=>key?text.replaceAll(key,'[redacted]'):text;
  const content=body.messages.findLast(message=>message.role==='user')?.content;
  const text=Array.isArray(content)?content.find(part=>part.type==='text')?.text:content;
  const separator='\nValidation feedback:\n',feedbackAt=typeof text==='string'?text.lastIndexOf(separator):-1;
  if(feedbackAt>=0){
   const feedback=text.slice(feedbackAt+separator.length);
   if(feedback.length<=64000)try{
    const applicationFeedback=JSON.parse(redact(feedback));
    if(practiceFeedbackKinds.has(applicationFeedback?.kind))round.applicationFeedback=applicationFeedback;
   }catch{/* Other correction text is deliberately excluded from the trace. */}
  }
  for(const message of body.messages)if(Array.isArray(message.content))for(const part of message.content){
   const match=part.type==='image_url'&&/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(part.image_url?.url);
   if(!match)continue;
   const bytes=Buffer.from(match[2],'base64');
   round.images.push({mimeType:match[1],sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});
  }
  rounds.push(round);write();const started=Date.now();
  try{
   const response=await original.call(this,url,options),value=await response.clone().json().catch(()=>null);
   round.status=response.status;round.responseModel=value?.model;round.stopReason=value?.choices?.[0]?.finish_reason;
   const answer=value?.choices?.[0]?.message?.content;
   if(typeof answer==='string')round.response=redact(answer).slice(0,32000);
   round.usage={inputTokens:value?.usage?.prompt_tokens,outputTokens:value?.usage?.completion_tokens,
    cachedInputTokens:value?.usage?.prompt_cache_hit_tokens??value?.usage?.prompt_tokens_details?.cached_tokens};
   return response;
  }finally{round.elapsedMs=Date.now()-started;write();}
 };
 const valid=()=>catalog?.status===200&&catalog.available&&rounds.length>0&&rounds.every(round=>
  round.model===flashConfig.model&&round.responseModel===flashConfig.model&&round.sentEffort==='high'&&round.thinking==='enabled'&&round.status===200&&round.stopReason==='stop');
 return {rounds,valid,stop:()=>{global.fetch=original;write();}};
}

module.exports={flashConfig,flashProfile,recordPracticeFlash};
