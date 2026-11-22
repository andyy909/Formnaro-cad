const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {aiUsage}=require('../backend/ai-usage.cjs'),{rateFor}=require('../backend/ai-token-prices.cjs'),{validateConfig}=require('../backend/ai-provider.cjs'),{createAIUsageLedger}=require('../backend/ai-usage-ledger.cjs');

test('Mistral subscription fallback keeps API-equivalent costs for real model IDs and does not accept zero default prices as free use',()=>{
 for(const model of ['mistral-medium-3.5','mistral-medium-3-5','mistral-medium-latest']){
  const config={authMode:'mistral-vibe',baseUrl:'https://api.mistral.ai/v1',model:'vibe-default'},data={model,usage:{input_tokens:100000,output_tokens:10000,input_tokens_details:{cached_tokens:0}},vibeCostUSD:0};
  const usage=aiUsage(data,config,0);assert.equal(usage.estimatedCostUSD.min,.225);assert.equal(usage.estimatedCostUSD.subscription,true);assert.equal(usage.estimatedCostUSD.rateDate,'2026-05-22');
 }
 const config={authMode:'mistral-vibe',baseUrl:'https://api.mistral.ai/v1',model:'mistral-large-4'},data={model:config.model,usage:{input_tokens:100000,output_tokens:20000,input_tokens_details:{cached_tokens:0}},vibeCostUSD:0};
 assert.equal(aiUsage(data,config,0).estimatedCostUSD.min,.112);assert.equal(aiUsage({...data,model:'unknown'},{...config,model:'unknown'},0).estimatedCostUSD,null);
});
const million={usage:{input_tokens:1000000,output_tokens:1000000,input_tokens_details:{cached_tokens:0}}};
const examples=[
 ['https://api.openai.com/v1','gpt-5.6-sol'],['https://api.anthropic.com/v1','claude-sonnet-5-5'],
 ['https://generativelanguage.googleapis.com/v1beta/openai','gemini-3.8-flash'],['https://api.mistral.ai/v1','mistral-small-2603'],
 ['https://api.deepseek.com','deepseek-flash'],['https://api.x.ai/v1','grok-4.7'],
 ['https://dashscope-intl.aliyuncs.com/compatible-mode/v1','qwen3.8-max'],['https://api.moonshot.ai/v1','kimi-k3.1-pro'],
 ['https://api.z.ai/api/paas/v4','glm-5.3-flash'],['https://api.minimax.io/v1','MiniMax-M3.1-Flash']
];
test('Every integrated provider family has a sourced standard-rate example; unknown prices never become zero',()=>{
 for(const [baseUrl,model]of examples){const u=aiUsage(million,{baseUrl,model,authMode:'api-key'},1);assert.ok(Number.isFinite(u.estimatedCostUSD?.min),model);assert.ok(u.estimatedCostUSD.max>0,model);}
 assert.equal(aiUsage(million,{baseUrl:'https://api.mistral.ai/v1',model:'unknown-model'},0).estimatedCostUSD,null);
 assert.equal(aiUsage({usage:{}},{baseUrl:'https://api.mistral.ai/v1',model:'mistral-small-2603'},0).estimatedCostUSD,null);
});
test('Published context thresholds and dated Gemini promotional prices apply to the actual request',()=>{
 const g={baseUrl:'https://generativelanguage.googleapis.com/v1beta/openai',model:'gemini-4-argon'};
 assert.equal(rateFor(g,100,new Date('2026-11-30')).input,2);assert.equal(rateFor(g,100,new Date('2026-12-01')).input,4);
 assert.equal(rateFor({...g,model:'gemini-3.8-flash'},100,new Date('2026-12-31')).output,3.75);assert.equal(rateFor({...g,model:'gemini-3.8-flash'},100,new Date('2027-01-01')).output,7.5);
 assert.equal(rateFor({...g,model:'gemini-3.1-pro-preview'},200000).input,2);assert.equal(rateFor({...g,model:'gemini-3.1-pro-preview'},200001).input,4);
 const c={baseUrl:'https://api.anthropic.com/v1',model:'claude-haiku-5-5'};assert.equal(rateFor(c,100000).input,.1);assert.equal(rateFor(c,100001).input,.5);
 const x={baseUrl:'https://api.x.ai/v1',model:'grok-4.7'};assert.equal(rateFor(x,199999).input,2);assert.equal(rateFor(x,200000).input,4);
 const m={baseUrl:'https://api.minimax.io/v1',model:'MiniMax-M3'};assert.equal(rateFor(m,512000).input,.3);assert.equal(rateFor(m,512001).input,.6);
});
test('Claude cache reads and both write TTLs are counted once; OpenAI-compatible cached tokens are recognized',()=>{
 const config={baseUrl:'https://api.anthropic.com/v1',protocol:'messages',model:'claude-sonnet-5-5'};
 const u=aiUsage({usage:{input_tokens:1000,output_tokens:500,cache_read_input_tokens:2000,cache_creation_input_tokens:3000,cache_creation:{ephemeral_1h_input_tokens:1000}}},config,1);
 assert.equal(u.inputTokens,6000);assert.equal(u.cachedInputTokens,2000);assert.equal(u.estimatedCostUSD.min,.0162);assert.equal(u.estimatedCostUSD.max,.0162);
 const cached=aiUsage({usage:{prompt_tokens:1000,completion_tokens:100,prompt_tokens_details:{cached_tokens:600}}},{baseUrl:'https://api.mistral.ai/v1',model:'mistral-small-2603'},1);assert.equal(cached.cachedInputTokens,600);assert.equal(cached.estimatedCostUSD.min,(400*.15+600*.015+100*.6)/1e6);
});
test('Model-bound custom pricing covers arbitrary providers without carrying a previous model tariff',()=>{
 const config=validateConfig({baseUrl:'https://other.example/v1',model:'my-model',customPricing:{model:'my-model',input:2,output:4,cached:.2}});
 assert.equal(aiUsage(million,config,1).estimatedCostUSD.min,6);assert.equal(aiUsage(million,{...config,model:'another-model'},1).estimatedCostUSD,null);
 assert.throws(()=>validateConfig({...config,customPricing:{model:'my-model',input:-1,output:4}}),/Tokenpreise/);
 assert.throws(()=>validateConfig({...config,customPricing:{model:'my-model',input:NaN,output:4}}),/Tokenpreise/);
});
test('Vibe-reported cost is an API-equivalent estimate, and its ledger remains in the subscription column after reopening',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-vibe-pricing-')),file=path.join(directory,'usage.json'),config={baseUrl:'https://api.mistral.ai/v1',model:'vibe-default',authMode:'mistral-vibe'};
 try{const usage=aiUsage({model:'actual-vibe-model',usage:{input_tokens:100,output_tokens:20},vibeCostUSD:.003},config,1);assert.equal(usage.estimatedCostUSD.min,.003);assert.equal(usage.estimatedCostUSD.subscription,true);assert.equal(usage.estimatedCostUSD.basis,'api-equivalent');assert.equal(usage.model,'actual-vibe-model');const ledger=createAIUsageLedger({file});assert.equal(ledger.record({usage,config,provider:'mistral-vibe'}),true);const stats=createAIUsageLedger({file}).statistics();assert.equal(stats.available,true);assert.equal(stats.rows.reduce((n,r)=>n+r.subscription.requests,0),1);assert.equal(stats.rows.reduce((n,r)=>n+r.api.requests,0),0);}
 finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('Reviewed catalog prices label subscription usage and distinguish DeepSeek hosting',()=>{
 const sample={usage:{input_tokens:100000,output_tokens:10000,input_tokens_details:{cached_tokens:20000}}};
 const sol=aiUsage(sample,{baseUrl:'https://api.openai.com/v1',model:'gpt-6.2-sol',authMode:'chatgpt'},0).estimatedCostUSD;
 assert.equal(sol.subscription,true);
 assert.equal(sol.basis,'api-equivalent');
 assert.equal(sol.min,.262);
 const mistral=aiUsage({...sample,model:'mistral-large-4',vibeCostUSD:.01},{baseUrl:'https://api.mistral.ai/v1',model:'vibe-default',authMode:'mistral-vibe'},0).estimatedCostUSD;
 assert.equal(mistral.min,.0784);
 assert.equal(mistral.subscription,true);
 const direct=aiUsage(sample,{baseUrl:'https://api.deepseek.com',model:'deepseek-flash'},0).estimatedCostUSD;
 const hosted=aiUsage(sample,{baseUrl:'https://api.mistral.ai/v1',model:'deepseek-v4-1-flash-1017'},0).estimatedCostUSD;
 assert.equal(direct.min,.01806);
 assert.equal(direct.max,.03612);
 assert.equal(hosted.min,.03614);
 assert.equal(hosted.max,.03614);
});

test('A local audited rate update applies without rebuilding and rejects an old or malformed catalog',()=>{
 const {loadLocalRates}=require('../backend/ai-rate-catalog.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-rate-file-')),file=path.join(dir,'KI-Tarife.json');
 const config={baseUrl:'https://api.openai.com/v1',model:'gpt-6.2-sol'};
 const row={input:3,output:20,cached:.12};
 const entry={verified:'2026-11-21',source:'https://developers.openai.com/api/docs/pricing',models:{'gpt-6.2-sol':row}};
 const save=()=>fs.writeFileSync(file,JSON.stringify({version:1,providers:{'api.openai.com':entry}}));
 try{
  save();
  assert(loadLocalRates(file,'2026-11-22'));
  assert.equal(rateFor(config,0).input,3);
  assert.equal(rateFor(config,0).rateDate,'2026-11-21');
  assert.equal(rateFor({...config,model:'gpt-6.2-astra'},0).input,8);
  entry.verified='2026-10-31';
  save();
  assert(!loadLocalRates(file,'2026-11-22'));
  assert.equal(rateFor(config,0).input,2);
  entry.verified='2026-11-22';
  row.output=-20;
  save();
  assert(!loadLocalRates(file,'2026-11-22'));
 }finally{loadLocalRates(path.join(dir,'missing.json'));fs.rmSync(dir,{recursive:true,force:true});}
});

test('GPT-6.2 standard API-equivalent estimate includes reported default cache writes',()=>{
 const config={baseUrl:'https://api.openai.com/v1',authMode:'chatgpt',model:'gpt-6.2-sol'};
 const usage={input_tokens:100000,output_tokens:10000,input_tokens_details:{cached_tokens:20000,cache_write_tokens:30000}};
 const cost=aiUsage({usage},config,1).estimatedCostUSD;
 assert.equal(cost.max,.277);
 assert.equal(cost.subscription,true);
});
