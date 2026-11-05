const test=require('node:test'),assert=require('node:assert/strict');
const {API_PROVIDERS}=require('../backend/ai-provider-presets.cjs');
const {generate,validateConfig}=require('../backend/ai-provider.cjs');
const {createAIProfiles}=require('../backend/ai-profiles.cjs');
const image={name:'reference.png',mimeType:'image/png',dataUrl:'data:image/png;base64,iVBORw0KGgo='};
const args={prompt:'Erkläre',context:{},scene:{revision:'revision-1'},chat:true};

test('Eleven API families have distinct official origins; switching persists credentials without sharing Vibe/API accounts',()=>{
 assert.equal(API_PROVIDERS.length,11);assert.equal(new Set(API_PROVIDERS.map(p=>p.id)).size,11);let saved;
 const options={canEncrypt:()=>true,encrypt:x=>Buffer.from(x).toString('base64'),decrypt:x=>Buffer.from(x,'base64').toString(),persist:x=>{saved=x;}},profiles=createAIProfiles(options);
 for(const p of API_PROVIDERS){profiles.selectProvider(p.id);const c=profiles.active().config;assert.equal(c.protocol,p.protocol);profiles.save({config:{...c,model:'test-'+p.label,rememberKey:true},key:'fixture-'+p.id});}
 profiles.selectProvider('mistral-vibe');assert.equal(profiles.active().key,'');assert.equal(profiles.active().config.model,'vibe-default');assert.throws(()=>profiles.save({config:profiles.active().config,key:'wrong-key'}),/Anmeld/);
 const restored=createAIProfiles({...options,stored:saved});assert.equal(restored.publicSettings().providerId,'mistral-vibe');
 for(const p of API_PROVIDERS){restored.selectProvider(p.id);assert.equal(restored.active().key,'fixture-'+p.id);}
 restored.selectProvider('mistral-vibe');assert.equal(restored.active().key,'');assert.equal(restored.serialize().config.authMode,'api-key');assert.ok(!JSON.stringify(restored.publicSettings()).includes('fixture-'));
 assert.throws(()=>validateConfig({authMode:'mistral-vibe',baseUrl:'https://other.example',protocol:'chat'}),/Mistral/);
});

for(const p of API_PROVIDERS)test(p.label+': normal chat carries real image bytes and only its own credential with the documented protocol',async()=>{
 const original=global.fetch,calls=[];global.fetch=async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,options,body});const answer=JSON.stringify({message:'Geprüfte Antwort'});return new Response(JSON.stringify(p.protocol==='messages'?{content:[{type:'text',text:answer}],usage:{input_tokens:12,output_tokens:5}}:p.protocol==='responses'?{output:[{type:'message',content:[{type:'output_text',text:answer}]}],usage:{input_tokens:12,output_tokens:5}}:{choices:[{message:{content:answer}}],usage:{prompt_tokens:12,completion_tokens:5}}));};
 try{const config={...p,model:'model-fixture'},reply=await generate(config,'key-'+p.id,{...args,images:[image],history:[{role:'user',text:'Vorheriges Bild',images:[image]}]});assert.equal(reply.message,'Geprüfte Antwort');assert.equal(reply.usage.inputTokens,12);const c=calls[0];assert.equal(c.options.headers.Authorization,'Bearer key-'+p.id);assert.equal(c.url,p.baseUrl+(p.protocol==='messages'?'/messages':p.protocol==='responses'?'/responses':'/chat/completions'));assert.equal(c.options.redirect,'error');assert.ok(JSON.stringify(c.body).includes('iVBORw0KGgo='));
  if(p.protocol==='messages'){assert.equal(c.options.headers['anthropic-version'],'2026-10-21');assert.ok(c.body.system);assert.equal(c.body.max_tokens,12000);assert.equal(c.body.messages[0].content[1].source.media_type,'image/png');assert.equal(c.body.response_format,undefined);}
  if(p.jsonMode===false)assert.equal(c.body.response_format,undefined);
 }finally{global.fetch=original;}
});

test('Vibe account uses ACP completion rather than sending an empty credential to HTTP; images, history and revisions remain validated',async()=>{
 const original=global.fetch;global.fetch=()=>{throw Error('Unexpected HTTP provider call');};let received;
 const config={authMode:'mistral-vibe',protocol:'chat',baseUrl:'https://api.mistral.ai/v1',model:'vibe-default'};
 try{const reply=await generate(config,'', {...args,images:[image]},undefined,{mistralComplete:async value=>{received=value;return {text:JSON.stringify({revision:'revision-1',label:'Platte',commands:[{op:'create',type:'box',size:[20,10,2]}]}),usage:{input_tokens:10,output_tokens:8}};}});assert.equal(reply.commands.length,1);assert.equal(reply.usage.outputTokens,8);assert.ok(received.system.includes('CAD assistant'));assert.deepEqual(received.input.images,[image.dataUrl]);
  await assert.rejects(generate(config,'',args),/nicht verfügbar/);
 }finally{global.fetch=original;}
});

test('Native Claude truncation fails closed; MiniMax thought prefixes do not hide the final JSON',async()=>{
 const original=global.fetch;try{
  global.fetch=async()=>new Response(JSON.stringify({content:[{type:'text',text:'{"message":"partial"}'}],stop_reason:'max_tokens'}));await assert.rejects(generate({baseUrl:'https://api.anthropic.com/v1',protocol:'messages',model:'fixture'},'key',args),/truncated/);
  global.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:'<think>analysis</think>\n{"message":"final"}'}}]}));assert.equal((await generate({baseUrl:'https://api.minimax.io/v1',protocol:'chat',model:'fixture'},'key',args)).message,'final');
 }finally{global.fetch=original;}
});
