const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {EventEmitter}=require('node:events');const {createMistralVibe,runtimeEnvironment}=require('../backend/mistral-vibe.cjs');

test('ACP integration shares one login, gives normal chat no tools, gives the agent only CAD MCP, and never returns credentials',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-vibe-test-')),connectionFile=path.join(directory,'ai-bridge.json');fs.writeFileSync(connectionFile,JSON.stringify({url:'http://127.0.0.1:1',token:'a'.repeat(64)}));
 let connected=false;const calls=[],events=[];
 class MockClient extends EventEmitter{
  constructor(options){super();this.options=options;this.closed=false;}
  async initialize(){return this.info={protocolVersion:1,authMethods:[{id:'browser-auth'}]};}
  async call(method,params){calls.push({method,params});if(method==='_auth/status')return {authenticated:connected,signOutAvailable:connected};if(method==='authenticate'){connected=true;return {};}
   if(method==='_auth/signOut'){connected=false;return {};}
   if(method==='session/new')return {sessionId:'session-'+calls.length,configOptions:[{id:'model',category:'model',options:[{value:'actual-model',name:'Actual model'}]}],_meta:{workspace_trust:{status:'untrusted',details:{availableDecisions:['trust_cwd']}}}};
   if(method==='session/prompt'){this.emit('update',{sessionId:params.sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'{"message":"Fertig"}'}}});return {stopReason:'end_turn'};}return {};
  }
  close(){this.closed=true;this.emit('closed');}
 }
 const manager=createMistralVibe({directory,connectionFile,command:()=>'/fixture/vibe-acp',Client:MockClient,onEvent:e=>events.push(e)});
 try{
  assert.equal((await manager.refresh()).connected,false);await assert.rejects(manager.catalog(),/anmelden/);const login=await manager.startLogin();assert.equal(login.pending,true);await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));assert.equal((await manager.refresh()).connected,true);
  const catalog=await manager.catalog();assert.deepEqual(catalog.models,['vibe-default','actual-model']);
  assert.equal((await manager.complete({system:'JSON only',user:'Hallo',input:{history:[],images:[]},model:'vibe-default'})).text,'{"message":"Fertig"}');assert.deepEqual(calls.filter(c=>c.method==='session/new').at(-1).params.mcpServers,[]);
  await manager.sendAgent({prompt:'Prüfe nur die Verbindung.',requestId:'agent-1'});const session=calls.filter(c=>c.method==='session/new').at(-1).params;assert.equal(session.mcpServers.length,1);assert.equal(session.mcpServers[0].name,'formnaro');assert.equal(session.mcpServers[0].args[1],connectionFile);assert.ok(!JSON.stringify(calls).includes('a'.repeat(64)));assert.ok(events.some(e=>e.type==='text'));
  assert(calls.filter(c=>c.method==='session/prompt').at(-1).params.prompt[0].text.includes(require('../backend/ai-working-rules.cjs').sharedAgentContext().instructions));
  assert(calls.some(c=>c.method==='_trust/decision'&&c.params.decision==='trust_cwd'&&c.params.cwd===session.cwd));
  assert.equal((await manager.logout()).connected,false);const config=fs.readFileSync(path.join(directory,'home/config.toml'),'utf8');assert.match(config,/enabled_tools = \["formnaro_\*"\]/);assert.ok(!config.includes('token'));assert.ok(!JSON.stringify(manager.publicStatus()).includes('api_key'));
 }finally{manager.dispose();fs.rmSync(directory,{recursive:true,force:true});}
});

test('Vibe child environment excludes unrelated API keys and missing installation fails locally',async()=>{
 const old=process.env.UNRELATED_PROVIDER_KEY;process.env.UNRELATED_PROVIDER_KEY='private';try{assert.equal(runtimeEnvironment('/own/vibe').UNRELATED_PROVIDER_KEY,undefined);}finally{if(old===undefined)delete process.env.UNRELATED_PROVIDER_KEY;else process.env.UNRELATED_PROVIDER_KEY=old;}
 const manager=createMistralVibe({directory:path.join(os.tmpdir(),'unused-formnaro-vibe'),connectionFile:'unused',command:()=>null});assert.equal(manager.publicStatus().installed,false);await assert.rejects(manager.startLogin(),/uv tool install/);manager.dispose();
});

test('Persistent Vibe agent reports per-turn token/cost deltas rather than billing cumulative session counters twice',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-vibe-deltas-')),connectionFile=path.join(directory,'bridge.json');fs.writeFileSync(connectionFile,'{}');let turn=0;
 class Client extends EventEmitter{
  async initialize(){this.info={protocolVersion:1};}
  async call(method,params){if(method==='_auth/status')return {authenticated:true};if(method==='session/new')return {sessionId:'same',configOptions:[{id:'model',category:'model',currentValue:'mistral-small-2603'}]};if(method==='session/set_config_option')return {configOptions:[{id:'model',category:'model',currentValue:params.value}]};if(method==='session/prompt'){turn++;const totals=turn===1?{input:1000,output:100,cost:.1}:{input:1500,output:150,cost:.13};this.emit('update',{sessionId:'same',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'Fertig'}}});this.emit('update',{sessionId:'same',update:{sessionUpdate:'usage_update',_meta:{promptTokens:totals.input,completionTokens:totals.output,cachedTokens:0},cost:{amount:totals.cost,currency:'USD'}}});return {stopReason:'end_turn',usage:{inputTokens:totals.input,outputTokens:totals.output}};}return {};}
  close(){this.closed=true;this.emit('closed');}
 }
 const manager=createMistralVibe({directory,connectionFile,command:()=>'/fixture/vibe',Client});try{const first=await manager.sendAgent({prompt:'Prüfe nur.',requestId:'first',model:'mistral-large-4'}),second=await manager.sendAgent({prompt:'Prüfe erneut.',requestId:'second',model:'mistral-large-4'});assert.equal(first.usage.input_tokens,1000);assert.equal(second.usage.input_tokens,500);assert.equal(second.usage.output_tokens,50);assert.ok(Math.abs(second.costUSD-.03)<1e-12);assert.equal(second.model,'mistral-large-4');}
 finally{manager.dispose();fs.rmSync(directory,{recursive:true,force:true});}
});
