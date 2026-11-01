// USD / 1,000,000 tokens. Standard synchronous text/image-input requests only.
// Snapshot of the linked primary pricing pages, 2026-10-31; account invoices win.
const RATE_DATE='2026-10-31';
const SOURCES={
 mistral:'https://docs.mistral.ai/inference/pricing',
 anthropic:'https://platform.claude.com/docs/en/about-claude/pricing',
 google:'https://ai.google.dev/gemini-api/docs/pricing',
 xai:'https://docs.x.ai/developers/pricing',
 qwen:'https://www.alibabacloud.com/help/en/model-studio/model-pricing',
 kimi:'https://platform.kimi.ai/docs/pricing/chat',
 zai:'https://docs.z.ai/guides/overview/pricing',
 minimax:'https://platform.minimax.io/docs/guides/pricing-paygo'
};
function row(input,output,cached,extra={}){return {input,output,cached,...extra};}
const MEDIUM35=row(1.5,7.5,.15,{source:'https://mistral.ai/news/vibe-remote-agents-mistral-medium-3-5/',rateDate:'2026-05-22'});
const MISTRAL={
 'mistral-medium-3.5':MEDIUM35,'mistral-medium-3-5':MEDIUM35,'mistral-medium-latest':MEDIUM35,
 'mistral-small-2603':row(.15,.6,.015),'mistral-large-4':row(.7,2.1,.07),
 'ministral-14b-2512':row(.2,.2,.02),'ministral-8b-2512':row(.15,.15,.015),'ministral-3b-2512':row(.1,.1,.01),
 'codestral-2508':row(.3,.9,.03),'zai-glm-5-3-flash':row(.15,.5,.03),'zai-glm-5-3':row(1.4,4.4,.14),
 'deepseek-v4-1-flash-1017':row(.3,1.2,.007)
};
const CLAUDE={
 'fable-5-1':row(10,50,.25),'mythos-5-1':row(10,50,.25),'opus-5-5':row(4,20,.2),'sonnet-5-5':row(2,10,.1),
 'haiku-5-5':row(.1,.5,.01), 'fable-5':row(10,50,1),'mythos-5':row(10,50,1),'opus-5':row(5,25,.5),
 'opus-4-8':row(5,25,.5),'opus-4-7':row(5,25,.5),'opus-4-6':row(5,25,.5),'opus-4-5':row(5,25,.5),
 'sonnet-5':row(2,10,.2),'sonnet-4-6':row(3,15,.3),'sonnet-4-5':row(3,15,.3),'haiku-4-5':row(1,5,.1)
};
const GLM={
 'glm-5.3':row(1.4,4.4,.26),'glm-5.3-flash':row(.15,.5,.03),'glm-5.3-flashx':row(.37,1.25,.075),'glm-5.3-flashx-legal':row(.37,1.25,.075),
 'glm-5.2':row(1.4,4.4,.26),'glm-5.1':row(1.4,4.4,.26),'glm-5':row(1,3.2,.2),'glm-4.7':row(.6,2.2,.11),'glm-4.6':row(.6,2.2,.11),'glm-4.7-flashx':row(.07,.4,.01),'glm-4.5':row(.6,2.2,.11),'glm-4.5-air':row(.2,1.1,.03),'glm-4.6v':row(.3,.9,.05)
};
const KIMI={
 'kimi-k3.1-pro':row(2,10,.2,{write5:2,write60:4}),'kimi-k3.1-pro-highspeed':row(4,20,.2,{write5:4,write60:8}),'kimi-k3':row(3,15,.3,{write5:3,write60:6}),
 'kimi-k2.7-code':row(.95,4,.19),'kimi-k2.7-code-highspeed':row(1.9,8,.38),'kimi-k2.6':row(.95,4,.16)
};
function rateFor(config,inputTokens,now=new Date(),resolvedModel){
 const custom=config.customPricing;if(custom&&custom.model===config.model)return {...custom,source:'user',rateDate:'user',manual:true};
 const host=new URL(config.baseUrl).hostname,model=(resolvedModel||config.model).replace(/^models\//,''),date=now.toISOString().slice(0,10);let rate,source;
 if(host==='api.mistral.ai'){rate=MISTRAL[model];source=SOURCES.mistral;}
 else if(host==='api.anthropic.com'){
  const key=model.replace(/^claude-/,'').replace(/-\d{8}$/,'');rate=CLAUDE[key];if(key==='haiku-5-5'&&inputTokens>100000)rate=row(.5,2.5,.05,{longContext:true});
  if(rate)rate={...rate,write5:rate.input*1.25,write60:rate.input*2};source=SOURCES.anthropic;
 }else if(host==='generativelanguage.googleapis.com'){
  if(model==='gemini-4-argon')rate=date<'2026-12-01'?row(2,10,.1):row(4,20,.2);
  else if(['gemini-3.8-flash','gemini-3.6-flash'].includes(model))rate=date<'2027-01-01'?row(.75,3.75,.075):row(1.5,7.5,.15);
  else if(model==='gemini-3.5-flash-lite')rate=row(.3,2.5,.03);
  else if(model==='gemini-3.1-flash-lite')rate=row(.25,1.5,.025);
  else if(['gemini-3.1-pro-preview','gemini-3.1-pro-preview-customtools'].includes(model))rate=inputTokens>200000?row(4,18,.4,{longContext:true}):row(2,12,.2);
  else if(model==='gemini-2.5-pro')rate=inputTokens>200000?row(2.5,15,.25,{longContext:true}):row(1.25,10,.125);
  else if(model==='gemini-2.5-flash')rate=row(.3,2.5,.03);
  else if(model==='gemini-2.5-flash-lite')rate=row(.1,.4,.01);
  source=SOURCES.google;
 }else if(host==='api.x.ai'){
  if(['grok-4.7','grok-4.6'].includes(model))rate=row(2,6,.5);
  else if(model==='grok-4.5')rate=row(2,6,.3);
  else if(['grok-4.3','grok-4.20-multi-agent-0309','grok-4.20-0309-reasoning','grok-4.20-0309-non-reasoning'].includes(model))rate=row(1.25,2.5,.2);
  else if(model==='grok-build-0.1')rate=row(1,2,.2);
  if(rate&&inputTokens>=200000)rate=row(rate.input*2,rate.output*2,rate.cached*2,{longContext:true});source=SOURCES.xai;
 }else if(host==='dashscope-intl.aliyuncs.com'||/^[a-z0-9-]+\.ap-southeast-1\.maas\.aliyuncs\.com$/i.test(host)){
  if(['qwen3.8-max','qwen3.8-max-0902'].includes(model))rate=row(2,6);
  else if(['qwen3.7-max','qwen3.7-max-2026-05-20','qwen3.7-max-2026-06-08'].includes(model))rate=row(2.5,7.5);
  else if(model==='qwen-max')rate=row(1.6,6.4);source=SOURCES.qwen;
 }else if(host==='api.moonshot.ai'||host==='api.kimi.ai'){rate=KIMI[model];source=SOURCES.kimi;}
 else if(host==='api.z.ai'){rate=GLM[model];source=SOURCES.zai;}
 else if(host==='api.minimax.io'){
  if(model==='MiniMax-M3.1-Flash')rate=row(.15,.6,.015);
  else if(model==='MiniMax-M3')rate=inputTokens>512000?row(.6,2.4,.12,{longContext:true}):row(.3,1.2,.06);source=SOURCES.minimax;
 }
 return rate?{...rate,model,source:rate.source??source,rateDate:rate.rateDate??RATE_DATE}:null;
}
function estimateTokenCost(data,config,{inputTokens,outputTokens,cachedInputTokens},now=new Date()){
 const subscription=['chatgpt','mistral-vibe'].includes(config.authMode);
 if(config.authMode==='mistral-vibe'&&config.customPricing?.model!==config.model&&Number.isFinite(data.vibeCostUSD)&&(data.vibeCostUSD>0||data.vibeCostUSD===0&&inputTokens===0&&outputTokens===0))return {min:data.vibeCostUSD,max:data.vibeCostUSD,basis:'api-equivalent',subscription:true,source:'Mistral Vibe runtime',rateDate:RATE_DATE,runtimeEstimate:true,cacheAssumed:false};
 if(inputTokens===null||outputTokens===null)return null;const rate=rateFor(config,inputTokens,now,typeof data.model==='string'?data.model:undefined);if(!rate)return null;
 const u=data.usage??{},write=Number.isSafeInteger(u.cache_creation_input_tokens)&&u.cache_creation_input_tokens>=0?u.cache_creation_input_tokens:0;
 const oneHour=Number.isSafeInteger(u.cache_creation?.ephemeral_1h_input_tokens)?Math.min(write,u.cache_creation.ephemeral_1h_input_tokens):0;
 if(write&&(!Number.isFinite(rate.write5)||oneHour&&!Number.isFinite(rate.write60)))return null;
 const base=Math.max(0,inputTokens-write),cachedRate=rate.cached??rate.input;
 const value=cached=>(Math.max(0,base-cached)*rate.input+cached*cachedRate+outputTokens*rate.output+(write-oneHour)*(rate.write5??0)+oneHour*(rate.write60??0))/1e6;
 const known=cachedInputTokens===null?null:Math.min(base,cachedInputTokens),a=value(known??base),b=value(known??0);
 return {min:Math.min(a,b),max:Math.max(a,b),rateDate:rate.rateDate,source:rate.source,cacheAssumed:known===null&&rate.cached!==undefined||rate.cached===undefined&&cachedInputTokens!==0,manual:rate.manual===true,longContext:rate.longContext===true,tier:'standard',...(subscription?{basis:'api-equivalent',subscription:true}:{}),excluded:'Taxes, account discounts/free quotas, priority, batch, storage and provider-hosted tools.'};
}
module.exports={rateFor,estimateTokenCost,SOURCES,RATE_DATE};
