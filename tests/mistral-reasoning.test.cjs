const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{EventEmitter}=require('node:events');
const {reasoningEfforts,requestEffort}=require('../backend/ai-reasoning.cjs');
const {validateConfig,completeModel}=require('../backend/ai-provider.cjs');
const {createAIProfiles}=require('../backend/ai-profiles.cjs');
const {createMistralVibe}=require('../backend/mistral-vibe.cjs');
const base={baseUrl:'https://api.mistral.ai/v1',protocol:'chat',model:'mistral-large-4'};
test('Mistral has model-specific supported levels, without inventing medium for Medium 3.5',()=>{
 assert.deepEqual(reasoningEfforts(base),['low','medium','high']);
 assert.deepEqual(reasoningEfforts({...base,model:'mistral-medium-3.5'}),['none','high']);
 assert.deepEqual(reasoningEfforts({...base,model:'unknown'}),[]);
 assert.equal(requestEffort({...base,mistralReasoningEffort:'medium'}),'medium');
 assert.throws(()=>requestEffort({...base,mistralReasoningEffort:'max'}));
});
test('Mistral reasoning persists per provider and resets when changing models',()=>{
 let stored;const p=createAIProfiles({persist:s=>{stored=s;},canEncrypt:()=>false});p.selectProvider('mistral-vibe');p.selectModel('mistral-large-4');p.selectEffort('medium');assert.equal(p.active().config.mistralReasoningEffort,'medium');
 const q=createAIProfiles({stored,persist(){},canEncrypt:()=>false});assert.equal(q.active().config.mistralReasoningEffort,'medium');q.selectProvider('https://api.deepseek.com');assert.equal(q.active().config.reasoningEffort,'high');q.selectProvider('mistral-vibe');assert.equal(q.active().config.mistralReasoningEffort,'medium');q.selectModel('mistral-medium-3.5');assert.equal(q.active().config.mistralReasoningEffort,'auto');
});
test('Normal chat forwards the selected Mistral effort through both API and Vibe routes',async()=>{
 const config=validateConfig({...base,mistralReasoningEffort:'medium'}),input={history:[],images:[]};let sent;
 await completeModel({...config,authMode:'mistral-vibe'},'',{system:'JSON',user:'test',input},null,{mistralComplete:async args=>{sent=args;return {text:'{}'};}});assert.equal(sent.reasoningEffort,'medium');
 const original=global.fetch;try{global.fetch=async(_url,options)=>{sent=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{message:{content:[{type:'thinking',thinking:[{type:'text',text:'private reasoning'}]},{type:'text',text:'{}'}]}}]}));};const result=await completeModel(config,'fixture',{system:'JSON',user:'test',input,effort:requestEffort(config)});assert.equal(sent.reasoning_effort,'medium');assert.equal(result.text,'{}');}finally{global.fetch=original;}
});
test('Vibe sends real ACP thinking selection before each prompt and restores default without losing the conversation',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-reasoning-')),calls=[];let thinking='high',selected='mistral-large-4';
 const options=()=>[{id:'model',category:'model',currentValue:selected,options:[{value:'mistral-large-4'}]},{id:'thinking',category:'thinking',currentValue:thinking,options:['low','medium','high'].map(value=>({value,name:value}))}];
 class Client extends EventEmitter{async initialize(){}async call(method,args){calls.push({method,args});if(method==='_auth/status')return {authenticated:true};if(method==='session/new')return {sessionId:'s',configOptions:options()};if(method==='session/set_config_option'){if(args.configId==='model')selected=args.value;else thinking=args.value;return {configOptions:options()};}if(method==='session/prompt'){this.emit('update',{sessionId:'s',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'{}'}}});return {stopReason:'end_turn'};}return {};}close(){this.closed=true;this.emit('closed');}}
 const m=createMistralVibe({directory,connectionFile:path.join(directory,'bridge.json'),command:()=>'/fixture/vibe',Client});fs.writeFileSync(path.join(directory,'bridge.json'),'{}');
 try{const args={model:selected,conversationId:'same',system:'JSON',user:'test',input:{images:[],history:[]}};assert.equal((await m.complete({...args,reasoningEffort:'medium'})).confirmedEffort,'medium');assert.equal(thinking,'medium');assert.equal((await m.complete({...args,reasoningEffort:'low'})).confirmedEffort,'low');assert.equal(thinking,'low');assert.equal((await m.complete({...args,reasoningEffort:'auto'})).confirmedEffort,'high');assert.equal(thinking,'high');assert.equal(calls.filter(c=>c.method==='session/new').length,1);await assert.rejects(m.complete({...args,reasoningEffort:'max'}),/Denkstufe/);await m.sendAgent({model:selected,prompt:'Test',requestId:'agent',reasoningEffort:'medium'});assert.equal(thinking,'medium');assert(calls.some(c=>c.method==='session/set_config_option'&&c.args.configId==='thinking'&&c.args.value==='medium'));}finally{m.dispose();fs.rmSync(directory,{recursive:true,force:true});}
});
