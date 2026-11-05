const test=require('node:test'),assert=require('node:assert/strict');
const {createAIProfiles}=require('../backend/ai-profiles.cjs');
const {generate,validateConfig}=require('../backend/ai-provider.cjs');
const {reasoningEfforts}=require('../backend/ai-reasoning.cjs');
function harness(){let stored;return {options:{canEncrypt:()=>true,encrypt:s=>'encrypted:'+s,decrypt:s=>s.slice(10),persist:s=>{stored=structuredClone(s);}},stored:()=>stored};}
test('Status distinguishes session-only, persisted, undecryptable and removed keys across restarts',()=>{
 const h=harness(),p=createAIProfiles(h.options);p.selectProvider('https://api.deepseek.com');p.save({config:{...p.active().config,rememberKey:true},key:'secret-fixture-a'});
 p.selectProvider('https://generativelanguage.googleapis.com');p.save({config:{...p.active().config,model:'gemini-3.8-flash'},key:'secret-fixture-b'});
 const entry=(s,id)=>s.providers.find(p=>p.id===id);assert.equal(entry(p.publicSettings(),'https://api.deepseek.com').credentialState,'saved');assert.equal(entry(p.publicSettings(),'https://generativelanguage.googleapis.com').credentialState,'session');
 const restored=createAIProfiles({...h.options,stored:h.stored()});assert.equal(entry(restored.publicSettings(),'https://api.deepseek.com').credentialState,'saved');assert.equal(entry(restored.publicSettings(),'https://generativelanguage.googleapis.com').credentialState,'missing');
 const locked=createAIProfiles({...h.options,stored:h.stored(),decrypt:()=>{throw Error('different PC');}});assert.equal(entry(locked.publicSettings(),'https://api.deepseek.com').credentialState,'unavailable');assert.equal(entry(locked.publicSettings(),'https://api.deepseek.com').hasSavedKey,true);assert.equal(entry(locked.publicSettings(),'https://api.deepseek.com').hasKey,false);
 restored.selectProvider('https://api.deepseek.com');restored.save({config:restored.active().config,clearKey:true});assert.equal(entry(restored.publicSettings(),'https://api.deepseek.com').hasSavedKey,false);assert(!JSON.stringify(p.publicSettings()).includes('secret-fixture'));assert(!JSON.stringify(locked.publicSettings()).includes('secret-fixture'));
});
test('Usage markers persist per provider and switching preserves every other encrypted key',()=>{
 const h=harness(),p=createAIProfiles(h.options);for(const id of ['https://api.deepseek.com','https://api.x.ai']){p.selectProvider(id);p.save({config:{...p.active().config,model:'fixture',rememberKey:true},key:'fixture-'+id});}const before=h.stored().profiles.map(p=>p.encryptedKey);p.markUsed(p.active().config);const restored=createAIProfiles({...h.options,stored:h.stored()});assert(restored.publicSettings().providers.find(p=>p.id==='https://api.x.ai').lastUsedAt);assert.equal(restored.publicSettings().providers.find(p=>p.id==='https://api.deepseek.com').lastUsedAt,null);assert.deepEqual(h.stored().profiles.map(p=>p.encryptedKey),before);
 restored.selectProvider('https://api.deepseek.com');assert.equal(restored.active().key,'fixture-https://api.deepseek.com');
});
const families=[
 ['Groq','https://api.groq.com/openai/v1','openai/gpt-oss-120b','chat','high',{reasoning_effort:'high'}],
 ['Google','https://generativelanguage.googleapis.com/v1beta/openai','gemini-3.8-flash','chat','medium',{reasoning_effort:'medium'}],
 ['Claude','https://api.anthropic.com/v1','claude-sonnet-4-6','messages','high',{output_config:{effort:'high'},thinking:{type:'adaptive'}}],
 ['Grok','https://api.x.ai/v1','grok-4.7','chat','xhigh',{reasoning_effort:'xhigh'}],
 ['Qwen','https://dashscope-intl.aliyuncs.com/compatible-mode/v1','qwen3.8-max','chat','disabled',{enable_thinking:false}],
 ['Kimi','https://api.moonshot.ai/v1','kimi-k2.6','chat','disabled',{thinking:{type:'disabled'}}],
 ['GLM','https://api.z.ai/api/paas/v4','glm-5.2','chat','enabled',{thinking:{type:'enabled'}}]
];
for(const [label,baseUrl,model,protocol,effort,expected]of families)test(label+': selected effort reaches the real request body and auto omits it',async()=>{
 let body,calls=0;const original=global.fetch;global.fetch=async(url,options)=>{calls++;body=JSON.parse(options.body);return new Response(JSON.stringify(protocol==='messages'?{content:[{type:'text',text:'{"message":"ok"}'}]}:{choices:[{message:{content:'{"message":"ok"}'}}]}));};
 try{const config={baseUrl,model,protocol,providerReasoningEffort:effort};assert(reasoningEfforts(config).includes(effort));await generate(config,'fixture',{prompt:'Explain',context:{},scene:{revision:'r'},chat:true});for(const key of Object.keys(expected))assert.deepEqual(body[key],expected[key]);
 await generate({...config,providerReasoningEffort:'auto'},'fixture',{prompt:'Explain',context:{},scene:{revision:'r'},chat:true});for(const key of ['reasoning_effort','output_config','enable_thinking','thinking'])assert.equal(body[key],undefined);assert.equal(calls,2);
 await assert.rejects(generate({...config,model:'unknown-future-model'},'fixture',{prompt:'Explain',context:{},scene:{revision:'r'},chat:true}),/nicht bestätigt/);assert.equal(calls,2);
 }finally{global.fetch=original;}
});
test('Provider reasoning survives reload, stays separate and resets on a new model',()=>{
 const h=harness(),p=createAIProfiles(h.options);p.selectProvider('https://generativelanguage.googleapis.com');p.selectModel('gemini-3.8-flash');p.selectEffort('medium');p.selectProvider('https://api.anthropic.com');p.selectModel('claude-sonnet-4-6');p.selectEffort('high');const restored=createAIProfiles({...h.options,stored:h.stored()});assert.equal(restored.active().config.providerReasoningEffort,'high');restored.selectProvider('https://generativelanguage.googleapis.com');assert.equal(restored.active().config.providerReasoningEffort,'medium');restored.selectModel('gemini-4-argon');assert.equal(restored.active().config.providerReasoningEffort,'auto');assert.throws(()=>validateConfig({providerReasoningEffort:'invented'}));
 assert(!reasoningEfforts({baseUrl:'https://api.z.ai',model:'glm-5.3'}).includes('disabled'));assert(!reasoningEfforts({baseUrl:'https://generativelanguage.googleapis.com',model:'gemini-2.5-pro'}).includes('none'));assert.deepEqual(reasoningEfforts({baseUrl:'https://api.minimax.io',model:'MiniMax-M2.7'}),[]);
});
test('Groq is distinct from Grok and filters audio/safety models from the chat catalogue',()=>{
 const {API_PROVIDERS}=require('../backend/ai-provider-presets.cjs'),{modelCatalog}=require('../backend/ai-models.cjs'),groq=API_PROVIDERS.find(p=>p.id==='https://api.groq.com');assert.equal(groq.baseUrl,'https://api.groq.com/openai/v1');assert.equal(groq.protocol,'chat');assert(API_PROVIDERS.some(p=>p.id==='https://api.x.ai'));
 const catalog=modelCatalog(groq,[{id:'openai/gpt-oss-120b'},{id:'whisper-large-v3'},{id:'canopylabs/orpheus-v1-english'},{id:'meta-llama/llama-guard-4-12b'}]);assert.deepEqual(catalog.map(p=>p.id),['openai/gpt-oss-120b']);assert.deepEqual(catalog[0].reasoningEfforts,['low','medium','high']);
});
