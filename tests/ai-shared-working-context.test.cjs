const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {completeModel,DEFAULT_CONFIG}=require('../backend/ai-provider.cjs'),{sharedAgentContext}=require('../backend/ai-working-rules.cjs');
for(const protocol of ['responses','chat','messages'])for(const mode of ['modeling','practice'])test(mode+' context reaches the first '+protocol+' request without extending the user prompt',async()=>{
 const previous=global.fetch;let sent;const prompt='Wie richte ich zwei Teile aus?',shared=sharedAgentContext(mode),other=sharedAgentContext(mode==='practice'?'modeling':'practice');
 try{global.fetch=async(url,options)=>{sent=JSON.parse(options.body);return new Response(JSON.stringify(protocol==='chat'?{choices:[{message:{content:'{"message":"ok"}'}}]}:protocol==='messages'?{content:[{type:'text',text:'{"message":"ok"}'}]}:{output:[{type:'message',content:[{type:'output_text',text:'{"message":"ok"}'}]}]}));};
  await completeModel({...DEFAULT_CONFIG,protocol,baseUrl:'http://127.0.0.1:9999/v1',model:'local-fixture'},'',{system:'Existing protocol contract.',user:prompt,input:{history:[],images:[]},context:{practiceOnly:mode==='practice'}},undefined);
  const system=protocol==='responses'?sent.instructions:protocol==='messages'?sent.system:sent.messages[0].content;
  assert(system.includes(shared.instructions));assert.equal(system.split(shared.instructions).length,2);assert(system.includes('Existing protocol contract.'));
  assert(!system.includes(other.instructions));assert.equal(system.includes('Formnaro layout and native UI usage'),mode==='practice');
  const user=protocol==='responses'?sent.input:sent.messages.at(-1).content;assert.equal(Array.isArray(user)?user.map(v=>v.text??'').join(''):user,prompt);
 }finally{global.fetch=previous;}
});

test('existing Mistral account completion receives the same shared text in its initial system envelope',async()=>{
 const prompt='Zeig mir Aushöhlen.',shared=sharedAgentContext();let envelope;
 await completeModel({...DEFAULT_CONFIG,authMode:'mistral-vibe',protocol:'chat',baseUrl:'https://api.mistral.ai/v1',model:'mistral-large-4'},'',{system:'Practice contract.',user:prompt,input:{history:[],images:[]}},undefined,{mistralComplete:async value=>{envelope=value;return {text:'{"message":"ok"}',model:'mistral-large-4'};}});
 assert(envelope.system.includes(shared.instructions));assert.equal(envelope.user,prompt);
});

test('external context supplies the application-owned shared file instead of trusting a renderer-supplied replacement',async()=>{
 const {startBridge}=require('../backend/api-bridge.cjs'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-shared-context-')),bridge=await startBridge({directory,rpc:async()=>({revision:'r',workingContext:{instructions:'untrusted replacement'}})});
 try{const response=await fetch(bridge.descriptor.url+'/v1/context',{headers:{Authorization:'Bearer '+bridge.descriptor.token}});assert.equal(response.status,200);const value=await response.json();assert.deepEqual(value.workingContext,sharedAgentContext());assert.equal(value.revision,'r');}
 finally{await bridge.close();fs.rmSync(directory,{recursive:true,force:true});}
});

test('practice gets its layout context from UI state without adding it to ordinary modelling context',async()=>{
 const {startBridge}=require('../backend/api-bridge.cjs'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-ui-context-')),bridge=await startBridge({directory,rpc:async()=>({state:{targets:[]}})}),headers={Authorization:'Bearer '+bridge.descriptor.token,'Content-Type':'application/json'};
 try{const normal=await (await fetch(bridge.descriptor.url+'/v1/context',{headers})).json(),practice=await (await fetch(bridge.descriptor.url+'/v1/ui',{method:'POST',headers,body:JSON.stringify({action:'state'})})).json();assert.equal(normal.workingContext.mode,'modeling');assert.equal(normal.workingContext.layoutContext,undefined);assert.equal(practice.workingContext.mode,'practice');assert(practice.workingContext.layoutContext.instructions.includes('Zahnrad-Einrasten'));}
 finally{await bridge.close();fs.rmSync(directory,{recursive:true,force:true});}
});
