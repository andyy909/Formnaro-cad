const test=require('node:test'),assert=require('node:assert/strict'),{aiUsage}=require('../backend/ai-usage.cjs');
const config={baseUrl:'https://api.openai.com/v1',model:'gpt-6.1-sol',authMode:'chatgpt'};
test('Subscription API equivalent counts cached input and includes reasoning exactly once',()=>{
 const u=aiUsage({usage:{input_tokens:100000,output_tokens:10000,input_tokens_details:{cached_tokens:80000},output_tokens_details:{reasoning_tokens:9000}}},config,1);
 assert.equal(u.estimatedCostUSD.min,.148);assert.equal(u.estimatedCostUSD.max,.148);assert.equal(u.reasoningTokens,9000);assert.equal(u.estimatedCostUSD.subscription,true);assert.equal(u.estimatedCostUSD.basis,'api-equivalent');
});
test('Long context is priced per request and missing cache produces an explicit range',()=>{
 const u=aiUsage({usage:{input_tokens:300000,output_tokens:10000,input_tokens_details:{cached_tokens:0}}},config,1);assert.equal(u.estimatedCostUSD.min,1.35);assert.equal(u.estimatedCostUSD.longContext,true);
 const range=aiUsage({usage:{input_tokens:100000,output_tokens:10000}},config,1).estimatedCostUSD;assert.equal(range.min,.11);assert.equal(range.max,.3);assert.equal(range.cacheAssumed,true);
 assert.equal(aiUsage({},config,1).estimatedCostUSD,null);assert.equal(aiUsage({usage:{input_tokens:100,output_tokens:10}},{...config,model:'gpt-unknown'},1).estimatedCostUSD,null);assert.equal(aiUsage({usage:{input_tokens:100,output_tokens:10}},{...config,baseUrl:'https://proxy.example'},1).estimatedCostUSD,null);
});
