const test=require('node:test'),assert=require('node:assert/strict');
const {createAIProfiles}=require('../backend/ai-profiles.cjs'),{modelCatalog}=require('../backend/ai-models.cjs'),{generate}=require('../backend/ai-provider.cjs');
const ds={baseUrl:'https://api.deepseek.com',model:'deepseek-v4-pro',protocol:'responses',rememberKey:true,bridgeEnabled:true};
function store(stored,options={}){let saved;const crypto={canEncrypt:()=>true,encrypt:value=>Buffer.from('encrypted:'+value).toString('base64'),decrypt:value=>Buffer.from(value,'base64').toString().slice(10)};return {get saved(){return saved;},api:createAIProfiles({stored,...crypto,persist:value=>{saved=structuredClone(value);},...options})};}
test('Legacy active key stays byte-identical when selecting models; provider keys are isolated and survive restart',()=>{
 const encryptedKey=Buffer.from('encrypted:dummy-deepseek').toString('base64'),s=store({config:ds,encryptedKey});assert.equal(s.api.active().key,'dummy-deepseek');s.api.selectModel('deepseek-flash');assert.equal(s.saved.encryptedKey,encryptedKey);assert.equal(s.api.active().config.bridgeEnabled,true);
 s.api.selectProvider('https://api.openai.com');assert.equal(s.api.active().key,'');assert.equal(s.api.active().config.bridgeEnabled,true);s.api.save({config:{...s.api.active().config,model:'gpt-test',rememberKey:true},key:'dummy-openai'});s.api.selectProvider('https://api.deepseek.com');assert.equal(s.api.active().key,'dummy-deepseek');assert.equal(s.api.active().config.model,'deepseek-flash');
 const restored=store(s.saved).api;restored.selectProvider('https://api.openai.com');assert.equal(restored.active().key,'dummy-openai');restored.selectProvider('https://api.deepseek.com');assert.equal(restored.active().key,'dummy-deepseek');assert.equal(restored.active().config.model,'deepseek-flash');assert.ok(!JSON.stringify(restored.publicSettings()).includes('dummy-'));assert.equal(restored.redact('dummy-openai / dummy-deepseek'),'[redacted] / [redacted]');
});
test('Clearing one provider key retains other keys, and session-only keys never reach disk',()=>{
 const s=store();s.api.save({config:ds,key:'dummy-deepseek'});s.api.save({config:{...ds,baseUrl:'https://api.openai.com/v1',model:'gpt-test'},key:'dummy-openai'});s.api.save({config:s.api.active().config,clearKey:true});assert.equal(s.api.active().key,'');s.api.selectProvider('https://api.deepseek.com');assert.equal(s.api.active().key,'dummy-deepseek');
 s.api.save({config:{...ds,rememberKey:false},key:'session-only'});assert.equal(s.api.active().key,'session-only');assert.equal(s.saved.encryptedKey,undefined);assert.ok(!JSON.stringify(s.saved).includes('session-only'));assert.equal(store(s.saved).api.active().key,'');
});
test('Unavailable machine encryption preserves the original encrypted credential for later recovery',()=>{
 const encryptedKey=Buffer.from('encrypted:dummy-deepseek').toString('base64'),s=store({config:ds,encryptedKey},{canEncrypt:()=>false,decrypt:()=>{throw Error('Unavailable');}});assert.equal(s.api.publicSettings().hasKey,false);s.api.selectModel('deepseek-flash');assert.equal(s.saved.encryptedKey,encryptedKey);s.api.selectProvider('https://api.openai.com');assert.equal(s.saved.profiles[0].encryptedKey,encryptedKey);assert.equal(store(s.saved).api.serialize().profiles[0].encryptedKey,encryptedKey);
});
test('Failed persistence rolls back profile/model/key changes; unknown destinations cannot receive a stored key',()=>{
 const s=store({config:ds,encryptedKey:Buffer.from('encrypted:dummy-deepseek').toString('base64')},{persist:()=>{throw Error('disk full');}});assert.throws(()=>s.api.selectModel('deepseek-v4-pro'),/disk full/);assert.equal(s.api.active().config.model,'deepseek-flash');assert.equal(s.api.active().key,'dummy-deepseek');assert.throws(()=>s.api.selectProvider('https://evil.example'),/Unbekannter/);
 const normal=store();normal.api.save({config:ds,key:'dummy-deepseek'});normal.api.save({config:{...ds,baseUrl:'https://other.example/v1',model:'custom'},key:''});assert.equal(normal.api.active().key,'');
});
test('Model catalog includes all current DeepSeek variants and compatible aliases; GPT discovery excludes incompatible endpoints',()=>{
 const deepseek=modelCatalog(ds,[{id:'deepseek-new',name:'New DeepSeek',input_modalities:['text','image']}]);assert.deepEqual(deepseek.map(m=>m.id),['deepseek-flash','deepseek-v4-pro','deepseek-v4-flash','deepseek-v4-flash-vision-exp','deepseek-new']);assert.equal(deepseek.find(m=>m.id==='deepseek-v4-pro').vision,false);
 const gpt=modelCatalog({baseUrl:'https://api.openai.com/v1',model:''},[{id:'gpt-test'},{id:'gpt-test-mini',input_modalities:['text','image']},{id:'gpt-image-2'},{id:'gpt-realtime'},{id:'text-embedding-3-large'},{id:'gpt-audio'},{id:'ft:gpt-test:custom'}]);assert.deepEqual(gpt.map(m=>m.id),['gpt-test','gpt-test-mini','ft:gpt-test:custom']);assert.equal(gpt[0].vision,null);assert.equal(gpt[1].vision,true);
});
test('Known text-only DeepSeek rejects current or historical images before contacting the provider',async()=>{
 const image={name:'reference.png',mimeType:'image/png',dataUrl:'data:image/png;base64,iVBORw0KGgo='},args={prompt:'Describe',context:{},scene:{revision:'123'},chat:true};const original=global.fetch;let calls=0;global.fetch=async()=>{calls++;throw Error('Unexpected fetch');};try{await assert.rejects(generate(ds,'dummy', {...args,images:[image]}),/unterstützt keine Bilder/);await assert.rejects(generate(ds,'dummy',{...args,history:[{role:'user',text:'picture',images:[image]}]}),/unterstützt keine Bilder/);assert.equal(calls,0);}finally{global.fetch=original;}
});

test('Mistral discovery groups reported aliases, keeps separate versions and sends the selected effort through its supported ID', async () => {
 const {testConnection}=require('../backend/ai-provider.cjs');
 const {findCatalogModel}=require('../backend/ai-models.cjs');
 const config={baseUrl:'https://api.mistral.ai/v1',model:'mistral-large-latest',protocol:'chat'};
 const rows=[
  {id:'mistral-small-2603',name:'mistral-small-2603'},
  {id:'mistral-large-latest',name:'mistral-large-4',aliases:['mistral-large-4','mistral-large-4-0']},
  {id:'mistral-large-4-0',name:'mistral-large-4',supported_reasoning_levels:['medium','high']},
  {id:'mistral-large-4',name:'mistral-large-4',supported_reasoning_levels:['low']},
  {id:'mistral-large-2512',name:'mistral-large-2512'},
  {id:'custom-a',name:'Custom'},
  {id:'custom-b',name:'Custom'},
 ];
 const sent=[],original=global.fetch;
 global.fetch=async (url,options)=>{
  if(new URL(url).pathname==='/v1/models')return Response.json({data:rows});
  sent.push(JSON.parse(options.body));
  return Response.json({choices:[{message:{content:'{"message":"OK"}'}}]});
 };
 try{
  const {details}=await testConnection(config,'fixture');
  const models=modelCatalog(config,details);
  assert.deepEqual(models.map(m=>m.id),['mistral-large-4','mistral-small-2603','mistral-large-2512','custom-a','custom-b']);
  assert.equal(models[0].name,'Mistral Large 4');
  assert.deepEqual(models[0].reasoningEfforts,['low','medium','high']);
  assert.equal(findCatalogModel(models,config.model),models[0]);
  const modelDetails=findCatalogModel(details,config.model);
  for(const level of ['high','auto','low']){
   await generate({...config,mistralReasoningEffort:level},'fixture',
    {prompt:'Hallo',context:{},scene:{revision:'test'},chat:true},undefined,{modelDetails});
  }
  assert.deepEqual(sent.map(body=>[body.model,body.reasoning_effort]),[
   ['mistral-large-4-0','high'],['mistral-large-4',undefined],['mistral-large-4','low'],
  ]);
 }finally{global.fetch=original;}
});
