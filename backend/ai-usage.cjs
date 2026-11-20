const {rateFor,estimateTokenCost}=require('./ai-token-prices.cjs');
const displayTokenRates=(config)=>rateFor(config,0);
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
function aiUsage(data,config,elapsedMs){
 const u=data?.usage||{},rawInput=count(u.input_tokens??u.prompt_tokens),cacheRead=count(u.cache_read_input_tokens)??0,cacheWrite=count(u.cache_creation_input_tokens)??0,inputTokens=config.protocol==='messages'&&rawInput!==null?count(rawInput+cacheRead+cacheWrite):rawInput,outputTokens=count(u.output_tokens??u.completion_tokens);
 const reportedCache=count(u.input_tokens_details?.cached_tokens??u.prompt_tokens_details?.cached_tokens??u.prompt_cache_hit_tokens??u.cache_read_input_tokens),cachedInputTokens=inputTokens===null?null:reportedCache===null?null:Math.min(inputTokens,reportedCache);
 const reportedReasoning=count(u.output_tokens_details?.reasoning_tokens??u.completion_tokens_details?.reasoning_tokens),reasoningTokens=outputTokens===null?null:reportedReasoning===null?null:Math.min(outputTokens,reportedReasoning);
 const confirmedEffort=config.authMode==='mistral-vibe'&&['none','low','medium','high','xhigh','max'].includes(data?.vibeConfirmedEffort)?data.vibeConfirmedEffort:undefined;
 const estimatedCostUSD=estimateTokenCost(data??{},config,{inputTokens,outputTokens,cachedInputTokens});
 return {...(Array.isArray(data?.toolReferences)?{toolReferences:data.toolReferences}:{}),...(Array.isArray(data?.webResearch)?{webResearch:data.webResearch}:{}),inputTokens,outputTokens,cachedInputTokens,reasoningTokens,elapsedMs:Math.max(0,Math.round(elapsedMs)),estimatedCostUSD,model:config.authMode==='mistral-vibe'&&typeof data.model==='string'?data.model:config.model,effort:require('./ai-reasoning.cjs').configuredEffort(config)??null,...(confirmedEffort?{confirmedEffort}:{})};
}
module.exports={aiUsage,displayTokenRates};
