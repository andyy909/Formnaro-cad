// Estimates use the published 2026-10-14 USD rates, not an account invoice.
const RATES={flash:{hit:.003,miss:.15,out:.6},pro:{hit:.022,miss:.66,out:1.98}};
const OPENAI_RATES=require('./openai-api-rates.json');
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
function aiUsage(data,config,elapsedMs){
 const u=data?.usage||{},inputTokens=count(u.input_tokens??u.prompt_tokens),outputTokens=count(u.output_tokens??u.completion_tokens);
 const reportedCache=count(u.input_tokens_details?.cached_tokens??u.prompt_cache_hit_tokens),cachedInputTokens=inputTokens===null?null:reportedCache===null?null:Math.min(inputTokens,reportedCache);
 const reportedReasoning=count(u.output_tokens_details?.reasoning_tokens??u.completion_tokens_details?.reasoning_tokens),reasoningTokens=outputTokens===null?null:reportedReasoning===null?null:Math.min(outputTokens,reportedReasoning);
 const deepseek=new URL(config.baseUrl).hostname==='api.deepseek.com',rates=deepseek?(config.model==='deepseek-v4-pro'?RATES.pro:['deepseek-flash','deepseek-v4-flash','deepseek-v4-flash-vision-exp'].includes(config.model)?RATES.flash:null):null;
 let estimatedCostUSD=null;
 if(rates&&inputTokens!==null&&outputTokens!==null){const cached=cachedInputTokens??0,offPeak=(cached*rates.hit+(inputTokens-cached)*rates.miss+outputTokens*rates.out)/1e6;estimatedCostUSD={min:offPeak,max:offPeak*2,rateDate:'2026-10-14',cacheAssumed:cachedInputTokens===null};}
 const officialOpenAI=new URL(config.baseUrl).hostname==='api.openai.com',model=config.model==='gpt-5.6'?'gpt-5.6-sol':config.model,openai=officialOpenAI&&OPENAI_RATES.models[model];
 if(openai&&inputTokens!==null&&outputTokens!==null){
  const longContext=inputTokens>OPENAI_RATES.longContextThreshold,im=longContext?OPENAI_RATES.longInputMultiplier:1,om=longContext?OPENAI_RATES.longOutputMultiplier:1;
  const estimate=cached=>(cached*openai.cached*im+(inputTokens-cached)*openai.input*im+outputTokens*openai.output*om)/1e6;
  estimatedCostUSD={min:estimate(cachedInputTokens??inputTokens),max:estimate(cachedInputTokens??0),cacheAssumed:cachedInputTokens===null,rateDate:OPENAI_RATES.rateDate,source:OPENAI_RATES.source,basis:'api-equivalent',subscription:config.authMode==='chatgpt',tier:'standard',longContext,excluded:'Cache-write premiums, regional/speed premiums, tool fees and taxes. Subscription cache hits are a proxy; API caching may differ.'};
 }
 return {inputTokens,outputTokens,cachedInputTokens,reasoningTokens,elapsedMs:Math.max(0,Math.round(elapsedMs)),estimatedCostUSD,model:config.model,effort:deepseek?config.reasoningEffort:new URL(config.baseUrl).hostname==='api.openai.com'&&config.openAIReasoningEffort!=='auto'?config.openAIReasoningEffort??null:null};
}
module.exports={aiUsage};
