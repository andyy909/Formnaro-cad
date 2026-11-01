const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events');
const {conversationUpdate}=require('../backend/ai-conversation.cjs'),{createMistralVibe}=require('../backend/mistral-vibe.cjs');
test('context updates retain the conversation without resending unchanged tools or history',()=>{
 const first=conversationUpdate(null,{system:'RULES',context:{tools:{contract:'TOOL_MARKER'},step:1},input:{history:[]}});
 assert.match(first.text,/TOOL_MARKER/);const next=conversationUpdate(first.state,{system:'RULES',context:{tools:{contract:'TOOL_MARKER'},step:2},input:{history:[]}});
 assert.doesNotMatch(next.text,/TOOL_MARKER|RULES/);assert.match(next.text,/"step":2/);
});
test('Mistral corrections and follow-ups reuse one ACP session; new chats and models start fresh',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-conversation-')),calls=[];let id=0,turn=0;
 class Client extends EventEmitter{
  async initialize(){this.info={protocolVersion:1};}
  async call(method,params){calls.push({method,params});if(method==='_auth/status')return {authenticated:true};if(method==='session/new')return {sessionId:'s'+(++id),configOptions:[{id:'model',category:'model',currentValue:'model-a'}]};if(method==='session/set_config_option')return {configOptions:[{id:'model',category:'model',currentValue:params.value}]};if(method==='session/prompt'){turn++;this.emit('update',{sessionId:params.sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'{"message":"ok"}'}}});return {stopReason:'end_turn',usage:{inputTokens:turn*100,outputTokens:turn*10}};}return {};}
  close(){this.closed=true;this.emit('closed');}
 }
 const manager=createMistralVibe({directory,connectionFile:'unused',command:()=>'/fixture/vibe',Client});
 try{
  const initial={system:'RULE_MARKER',context:{tools:{instructions:'TOOL_MARKER'},step:1},user:'scene revision 1: first request',input:{history:[],images:[]},model:'model-a',conversationId:'chat-a'};
  await manager.complete(initial);const second=await manager.complete({...initial,user:'scene revision 1: correct hinge',context:{...initial.context,step:2}});assert.equal(id,1);assert.equal(second.usage.input_tokens,100);
  const prompts=calls.filter(c=>c.method==='session/prompt');assert.equal(prompts[0].params.sessionId,prompts[1].params.sessionId);assert.match(prompts[0].params.prompt[0].text,/TOOL_MARKER/);assert.doesNotMatch(prompts[1].params.prompt[0].text,/TOOL_MARKER|RULE_MARKER/);
  await manager.complete({...initial,user:'scene revision 2: follow-up',input:{history:[{role:'user',text:'first request',images:[]},{role:'assistant',text:'ok',images:[]},{role:'user',text:'[application feedback] Applied',images:[]}],images:[]}});assert.equal(id,1);assert.match(calls.filter(c=>c.method==='session/prompt').at(-1).params.prompt[0].text,/Applied/);
  await manager.complete({...initial,conversationId:'chat-b'});assert.equal(id,2);await manager.complete({...initial,conversationId:'chat-b',model:'model-b'});assert.equal(id,3);
  const abort=new AbortController();abort.abort();await assert.rejects(manager.complete({...initial,signal:abort.signal}));await manager.complete(initial);assert.equal(id,5);
 }finally{manager.dispose();fs.rmSync(directory,{recursive:true,force:true});}
});
test('all three API formats preserve user/assistant history for subsequent messages',async()=>{
 const {generate}=require('../backend/ai-provider.cjs'),original=global.fetch;let body;
 global.fetch=async(_url,options)=>{body=JSON.parse(options.body);return new Response(JSON.stringify({usage:{input_tokens:10,output_tokens:2},choices:[{message:{content:'{"message":"ok"}'}}],content:[{type:'text',text:'{"message":"ok"}'}],output:[{type:'message',content:[{type:'output_text',text:'{"message":"ok"}'}]}]}));};
 try{for(const protocol of ['responses','chat','messages']){
  await generate({protocol,baseUrl:'https://api.example.test/v1',model:'fixture'},'fixture',{prompt:'continue',conversationId:'same-chat',chat:true,context:{},scene:{revision:'r'},history:[{role:'user',text:'earlier request',images:[]},{role:'assistant',text:'earlier answer',images:[]}]});
  const sent=JSON.stringify(body);assert.match(sent,/earlier request/);assert.match(sent,/earlier answer/);assert.match(sent,/continue/);
 }}finally{global.fetch=original;}
});
