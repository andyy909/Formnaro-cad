// Estimates use the published 2026-10-14 USD rates, not an account invoice.
const RATES={flash:{hit:.003,miss:.15,out:.6},pro:{hit:.022,miss:.66,out:1.98}};
const OPENAI_RATES=require('./openai-api-rates.json');
const deepseekRates=model=>model==='deepseek-v4-pro'?RATES.pro:['deepseek-flash','deepseek-v4-flash','deepseek-v4-flash-vision-exp'].includes(model)?RATES.flash:null;
const openaiRates=model=>OPENAI_RATES.models[model==='gpt-5.6'?'gpt-5.6-sol':model];
function displayTokenRates(config){
 const host=new URL(config.baseUrl).hostname;
 const custom=config.customPricing?.model===config.model;
 const extra=require('./ai-token-prices.cjs').rateFor(config,0);
 if(custom||extra)return extra;
 if(host==='api.deepseek.com'){
  const rate=deepseekRates(config.model);
  return rate?{input:rate.miss,cached:rate.hit,output:rate.out,peakMultiplier:2,rateDate:'2026-10-14',source:'https://api-docs.deepseek.com/quick_start/pricing/'}:null;
 }
 if(host!=='api.openai.com')return null;
 const rate=openaiRates(config.model);
 return rate?{...rate,rateDate:OPENAI_RATES.rateDate,source:OPENAI_RATES.source}:null;
}
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
function aiUsage(data,config,elapsedMs){
 const u=data?.usage||{},rawInput=count(u.input_tokens??u.prompt_tokens),cacheRead=count(u.cache_read_input_tokens)??0,cacheWrite=count(u.cache_creation_input_tokens)??0,inputTokens=config.protocol==='messages'&&rawInput!==null?count(rawInput+cacheRead+cacheWrite):rawInput,outputTokens=count(u.output_tokens??u.completion_tokens);
 const reportedCache=count(u.input_tokens_details?.cached_tokens??u.prompt_tokens_details?.cached_tokens??u.prompt_cache_hit_tokens??u.cache_read_input_tokens),cachedInputTokens=inputTokens===null?null:reportedCache===null?null:Math.min(inputTokens,reportedCache);
 const reportedReasoning=count(u.output_tokens_details?.reasoning_tokens??u.completion_tokens_details?.reasoning_tokens),reasoningTokens=outputTokens===null?null:reportedReasoning===null?null:Math.min(outputTokens,reportedReasoning);
 const deepseek=new URL(config.baseUrl).hostname==='api.deepseek.com',rates=deepseek?deepseekRates(config.model):null;
 let estimatedCostUSD=null;
 if(rates&&inputTokens!==null&&outputTokens!==null){const cached=cachedInputTokens??0,offPeak=(cached*rates.hit+(inputTokens-cached)*rates.miss+outputTokens*rates.out)/1e6;estimatedCostUSD={min:offPeak,max:offPeak*2,rateDate:'2026-10-14',cacheAssumed:cachedInputTokens===null};}
 const officialOpenAI=new URL(config.baseUrl).hostname==='api.openai.com',openai=officialOpenAI&&openaiRates(config.model);
 if(openai&&inputTokens!==null&&outputTokens!==null){
  const longContext=inputTokens>OPENAI_RATES.longContextThreshold,im=longContext?OPENAI_RATES.longInputMultiplier:1,om=longContext?OPENAI_RATES.longOutputMultiplier:1;
  const estimate=cached=>(cached*openai.cached*im+(inputTokens-cached)*openai.input*im+outputTokens*openai.output*om)/1e6;
  estimatedCostUSD={min:estimate(cachedInputTokens??inputTokens),max:estimate(cachedInputTokens??0),cacheAssumed:cachedInputTokens===null,rateDate:OPENAI_RATES.rateDate,source:OPENAI_RATES.source,basis:'api-equivalent',subscription:config.authMode==='chatgpt',tier:'standard',longContext,excluded:'Cache-write premiums, regional/speed premiums, tool fees and taxes. Subscription cache hits are a proxy; API caching may differ.'};
 }
 const confirmedEffort=config.authMode==='mistral-vibe'&&['none','low','medium','high','xhigh','max'].includes(data?.vibeConfirmedEffort)?data.vibeConfirmedEffort:undefined;
 const additional=require('./ai-token-prices.cjs').estimateTokenCost(data??{},config,{inputTokens,outputTokens,cachedInputTokens});if(additional)estimatedCostUSD=additional;
 return {...(Array.isArray(data?.toolReferences)?{toolReferences:data.toolReferences}:{}),...(Array.isArray(data?.webResearch)?{webResearch:data.webResearch}:{}),inputTokens,outputTokens,cachedInputTokens,reasoningTokens,elapsedMs:Math.max(0,Math.round(elapsedMs)),estimatedCostUSD,model:config.authMode==='mistral-vibe'&&typeof data.model==='string'?data.model:config.model,effort:require('./ai-reasoning.cjs').configuredEffort(config)??null,...(confirmedEffort?{confirmedEffort}:{})};
}
module.exports={aiUsage,displayTokenRates};
