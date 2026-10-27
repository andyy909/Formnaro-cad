const test=require('node:test'),assert=require('node:assert/strict');
const {reasoningEfforts,requestEffort}=require('../backend/ai-reasoning.cjs');
const {generate,validateConfig,testConnection}=require('../backend/ai-provider.cjs');
const {createAIProfiles}=require('../backend/ai-profiles.cjs');
const {modelCatalog}=require('../backend/ai-models.cjs');
const {readChatGPTResponse}=require('../backend/chatgpt-stream.cjs');
const config={baseUrl:'https://api.openai.com/v1',model:'gpt-6-astra',authMode:'chatgpt'};
const complete={status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"message":"OK"}'}]}]};
function stream(headers){return new Response(Buffer.from('event: response.completed\ndata: '+JSON.stringify({type:'response.completed',response:complete})+'\n\n'),{headers});}
test('Live regression: valid completed SSE without Content-Type is accepted; HTML and partial data still fail',async()=>{
 assert.equal(stream().headers.get('content-type'),null);assert.deepEqual(await readChatGPTResponse(stream()),complete);assert.deepEqual(await readChatGPTResponse(stream({'content-type':'text/plain'})),complete);
 for(const text of ['<html>Login</html>','data: {"type":"response.output_text.delta","delta":"partial"}\n\n','{"status":"completed","output":[]}'])await assert.rejects(readChatGPTResponse(new Response(Buffer.from(text))));
});
test('Live regression: output_item.done supplies text when terminal output is empty, only after successful completion',async()=>{
 const item=complete.output[0],done='data: '+JSON.stringify({type:'response.output_item.done',output_index:0,item})+'\n\n',terminal='data: '+JSON.stringify({type:'response.completed',response:{status:'completed',output:[]}})+'\n\n';
 assert.deepEqual((await readChatGPTResponse(new Response(Buffer.from(done+terminal)))).output,[item]);await assert.rejects(readChatGPTResponse(new Response(Buffer.from(done))));await assert.rejects(readChatGPTResponse(new Response(Buffer.from(done+'data: {"type":"response.failed","response":{}}\n\n'))));
 const parsed=await readChatGPTResponse(new Response(Buffer.from('data: {"type":"response.output_item.added","output_index":0,"item":'+JSON.stringify(item)+'}\n\n'+terminal)));assert.deepEqual(parsed.output,[]);
});
test('Reasoning capabilities depend on model; declared empty list does not fall back',()=>{
 assert.deepEqual(reasoningEfforts(config),['low','medium','high','xhigh','max']);assert(!reasoningEfforts(config).includes('none'));assert(reasoningEfforts({...config,model:'gpt-6-luna'}).includes('none'));assert(reasoningEfforts({...config,model:'gpt-5'}).includes('minimal'));assert(!reasoningEfforts({...config,model:'gpt-5.5'}).includes('max'));assert.deepEqual(reasoningEfforts({...config,model:'future'}),[]);
 assert.deepEqual(reasoningEfforts(config,{supported_reasoning_levels:[]}),[]);assert.deepEqual(reasoningEfforts(config,{supported_reasoning_levels:[{effort:'medium'},{effort:'max'}, {effort:'invented'}]}),['medium','max']);
 assert.equal(requestEffort({...config,openAIReasoningEffort:'auto'}),undefined);assert.throws(()=>requestEffort({...config,openAIReasoningEffort:'none'}));assert.throws(()=>validateConfig({...config,openAIReasoningEffort:'invalid'}));
});
test('Chosen effort reaches actual Responses/SSE and API chat bodies; auto omits it',async()=>{
 const original=global.fetch;let body;global.fetch=async(_url,options)=>{body=JSON.parse(options.body);return body.stream?stream():new Response(JSON.stringify(body.instructions?complete:{choices:[{message:{content:'{"message":"OK"}'}}]}));};
 try{for(const mode of ['chatgpt','api-key'])for(const effort of ['auto','low','medium','high','xhigh','max']){const result=await generate({...config,authMode:mode,openAIReasoningEffort:effort},'fixture',{prompt:'Hallo',context:{},scene:{revision:'r'},chat:true});assert.equal(result.message,'OK');assert.equal(body.reasoning?.effort,effort==='auto'?undefined:effort);assert.equal(result.usage.effort,effort==='auto'?null:effort);if(mode==='chatgpt'){assert.equal(body.stream,true);assert(!('max_output_tokens' in body));}}
 await generate({...config,authMode:'api-key',protocol:'chat',openAIReasoningEffort:'medium'},'fixture',{prompt:'Hallo',context:{},scene:{revision:'r'},chat:true});assert.equal(body.reasoning_effort,'medium');
 }finally{global.fetch=original;}
});
test('Account catalog retains server reasoning choices instead of applying another model defaults',async()=>{
 const original=global.fetch;global.fetch=async()=>new Response(JSON.stringify({models:[{slug:'future-model',visibility:'list',supported_reasoning_levels:[{effort:'low'},{effort:'max'}]}]}));try{const result=await testConnection(config,'fixture');assert.deepEqual(modelCatalog(config,result.details)[0].reasoningEfforts,['low','max']);}finally{global.fetch=original;}
});
test('OpenAI defaults migrate without raising effort; selection persists separately from DeepSeek and resets on model change',()=>{
 let stored;const options={canEncrypt:()=>false,persist:s=>stored=s},p=createAIProfiles(options);p.selectProvider('chatgpt');assert.equal(p.active().config.openAIReasoningEffort,'auto');p.selectModel('gpt-6-astra');p.selectEffort('max');assert.equal(p.active().config.openAIReasoningEffort,'max');const r=createAIProfiles({...options,stored});assert.equal(r.active().config.openAIReasoningEffort,'max');r.selectProvider('https://api.deepseek.com');r.selectEffort('low');assert.equal(r.active().config.reasoningEffort,'low');r.selectProvider('chatgpt');assert.equal(r.active().config.openAIReasoningEffort,'max');r.selectModel('gpt-6-luna');assert.equal(r.active().config.openAIReasoningEffort,'auto');
});
