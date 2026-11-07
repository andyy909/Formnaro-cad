const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createLabRoles,validateSelection,applyEffort}=require('../backend/ai-lab-roles.cjs');
const {validateConfig}=require('../backend/ai-provider.cjs');
const {preset,expandPlan}=require('../backend/ai-test-lab-plan.cjs');
const A='https://api.deepseek.com',B='https://api.openai.com',C='chatgpt';
const profiles={
 [A]:{key:'secret-modeler-123456789',config:validateConfig({baseUrl:A,model:'deepseek-flash',protocol:'responses',reasoningEffort:'high'})},
 [B]:{key:'secret-supervisor-123456789',config:validateConfig({baseUrl:B+'/v1',model:'gpt-6-luna',protocol:'responses',openAIReasoningEffort:'low'})},
 [C]:{key:'',config:validateConfig({baseUrl:B+'/v1',model:'gpt-6.1-sol',protocol:'responses',authMode:'chatgpt',openAIReasoningEffort:'high'})}
};
const selected={modeler:{providerId:A,model:'deepseek-flash',effort:'high'},supervisor:{providerId:B,model:'gpt-6-luna',effort:'low'},reviewer:{providerId:C,model:'gpt-6.1-sol',effort:'high'}};
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-lab-roles-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function connections(){return {connection:id=>{assert.ok(profiles[id]);return structuredClone(profiles[id]);},providers:()=>Object.entries(profiles).map(([id,p])=>({id,label:id,model:p.config.model,authMode:p.config.authMode,hasKey:true,configured:true})),credential:async(c,key)=>c.authMode==='chatgpt'?'secret-reviewer-123456789':key,catalog:async({config,key})=>({hasKey:true,availableModelIds:[config.model],models:[{id:config.model,name:config.model,vision:true,reasoningEfforts:config.baseUrl.includes('deepseek')?['low','high','max']:['low','medium','high','max']}]}),redact:s=>Object.values(profiles).reduce((v,p)=>p.key?v.split(p.key).join('[redacted]'):v,s)};}
const credentials=()=>structuredClone(profiles[A]);
test('Role selections reject secret/config injection and never contain arbitrary endpoints',()=>{
 assert.throws(()=>validateSelection({apiKey:'secret'},'modeler'),/Agentenauswahl/);
 assert.throws(()=>validateSelection({providerId:'https://user:secret@example.com'},'reviewer'),/Profilkennung/);
 assert.throws(()=>validateSelection({providerId:'https://example.com/path'},'reviewer'),/Profilkennung/);
 assert.throws(()=>validateSelection({effort:'series'},'reviewer'),/Denkstufe/);
});
test('Each role resolves a different saved profile, model and supported effort without selecting the chat profile',async t=>{
 const dir=temp(t),r=createLabRoles({directory:dir,credentials,provider:{},connections:connections()});
 for(const role of Object.keys(selected))r.save(role,selected[role]);
 const [a,b,c]=await Promise.all(Object.entries(selected).map(([role,s])=>r.resolve(role,s)));
 assert.equal(a.config.model,'deepseek-flash');assert.equal(a.key,profiles[A].key);assert.equal(a.effort,'high');
 assert.equal(b.config.model,'gpt-6-luna');assert.equal(b.key,profiles[B].key);assert.equal(b.config.openAIReasoningEffort,'low');
 assert.equal(c.config.authMode,'chatgpt');assert.equal(c.key,'secret-reviewer-123456789');assert.equal(c.effort,'high');
 assert.equal(credentials().config.model,'deepseek-flash');
 const text=JSON.stringify(r.state())+fs.readFileSync(path.join(dir,'Labor-Agenten.json'),'utf8');for(const secret of [profiles[A].key,profiles[B].key,c.key])assert.ok(!text.includes(secret));
 assert.deepEqual(createLabRoles({directory:dir,credentials,provider:{},connections:connections()}).state().selections,selected);
 assert.ok(!JSON.stringify(r.redact({text:a.key+' '+b.key+' '+c.key})).includes('secret-'));
});
test('Unsupported effort or unavailable model is rejected before generation; fixed effort collapses the matrix',async t=>{
 const r=createLabRoles({directory:temp(t),credentials,provider:{},connections:connections()});
 await assert.rejects(r.resolve('modeler',{...selected.modeler,model:'not-in-account'}),/nicht verfügbar/);
 await assert.rejects(r.resolve('modeler',{...selected.modeler,effort:'medium'}),/Denkstufe/);
 const p={...preset(),caseIds:['drill'],variants:['A'],roles:selected};const expanded=expandPlan(p);assert.equal(expanded.trials,1);assert.equal(expanded.rows[0].effort,'high');
 assert.notEqual(expanded.planHash,expandPlan({...p,roles:{...selected,modeler:{...selected.modeler,effort:'low'}}}).planHash);
 const legacy=expandPlan({...preset(),caseIds:['drill'],variants:['A']});assert.equal(legacy.trials,3);
});
test('Explicit server reasoning levels work for models without a built-in name rule',()=>{
 const config=validateConfig({baseUrl:B+'/v1',model:'private-reasoner',protocol:'responses'});
 const value=applyEffort(config,'medium',{supported_reasoning_levels:['medium']});assert.equal(value.effort,'medium');assert.equal(value.config.openAIReasoningEffort,'medium');
});
test('Chat and Messages providers record their real requests without forcing Responses streaming',async t=>{
 const original=global.fetch;t.after(()=>{global.fetch=original;});
 for(const protocol of ['chat','messages']){
  const events=[];global.fetch=async(url,options)=>{const body=JSON.parse(options.body);assert.equal(body.stream,undefined);return new Response(JSON.stringify(protocol==='chat'?{model:'local-model',choices:[{message:{content:'{"message":"ok"}'}}],usage:{prompt_tokens:10,completion_tokens:2}}:{model:'local-model',content:[{type:'text',text:'{"message":"ok"}'}],usage:{input_tokens:10,output_tokens:2}}),{headers:{'content-type':'application/json'}});};
  const c=validateConfig({baseUrl:'http://localhost:8123',model:'local-model',protocol,maxOutputTokens:4096});
  const r=await require('../backend/ai-provider.cjs').completeModel(c,'',{system:'One JSON object only.',user:'Test',input:{history:[],images:[]},onDiagnostic:e=>events.push(e)},AbortSignal.timeout(5000));
  assert.equal(r.text,'{"message":"ok"}');assert.equal(events.filter(e=>e.type==='request').length,1);assert.ok(events.some(e=>e.type==='notice'));
 }
});
test('Messages cache usage and subscription billing remain separate from the raw provider envelope',async()=>{
 const {aiUsage}=require('../backend/ai-usage.cjs'),{usagePrice}=await import('../ai/diagnostic-costs.mjs');
 const raw={input_tokens:10,cache_read_input_tokens:30,cache_creation_input_tokens:5,output_tokens:2};
 const billing=aiUsage({usage:raw},validateConfig({baseUrl:'https://api.anthropic.com',protocol:'messages',model:'claude-test'}),1);
 const value=usagePrice(raw,{input:1,output:2,cached:.1},'2026-11-07T10:00:00Z',billing);assert.equal(value.input,45);assert.equal(value.cached,30);assert.equal(value.output,2);assert.equal(raw.input_tokens,10);
});
test('Modeler, monitor and analyst use their own tokens and record separate model identities in one real lifecycle',async t=>{
 const dir=temp(t),revision='0123456789abcdef',calls=[];let closed=0;
 const runner=require('../backend/ai-diagnostics.cjs').createDiagnostics({app:{},directory:dir,credentials,connections:connections(),provider:{testConnection:async()=>({models:['deepseek-flash']}),completeModel:async(c,key,e)=>{
  const role=e.system.includes('third Formnaro lab agent')?'reviewer':e.system.includes('independent Formnaro experiment supervisor')?'supervisor':'modeler';calls.push({role,model:c.model,key,effort:e.effort});e.onDiagnostic?.({type:'request',body:{model:c.model}});
  const content=role==='modeler'?{tool:'offlinecad_preview',arguments:{revision,commands:[{op:'create',type:'box',size:[1,2,3]}]}}:role==='supervisor'?{verdict:'continue',reasonCode:'none',confidence:.8,explanation:'Valid proposal',evidence:'Local schema'}:{summary:'Ein Startversuch ausgewertet.',findings:[],nextChecks:['Geometrie in einem vollständigen Versuch prüfen.']};
  if(role==='reviewer'){assert.equal(closed,1);assert.equal(JSON.parse(e.user).counts.finished,1);}
  return {text:JSON.stringify(content),data:{model:c.model,usage:{input_tokens:100,output_tokens:10,input_tokens_details:{cached_tokens:0}}}};
 }},openChild:()=>({call:async(method)=>{if(method==='setup')return {scene:{revision,objects:[],selectionTargets:[]},context:{},validationContext:(await import('../src/cad-ai-context.js')).cadAIContext(),project:{nodes:[]}};if(method==='capture')return 'data:image/png;base64,AQID';return {};},cancel(){},close:async()=>{closed++;return {code:0,signal:null};}})});
 const plan={...preset(),caseIds:['drill'],variants:['A'],roles:selected};await runner.start({mode:'lab',plan});
 assert.deepEqual(calls.map(c=>c.role),['modeler','supervisor','reviewer']);assert.deepEqual(calls.map(c=>c.model),['deepseek-flash','gpt-6-luna','gpt-6.1-sol']);assert.deepEqual(calls.map(c=>c.key),[profiles[A].key,profiles[B].key,'secret-reviewer-123456789']);
 const record=runner.read(runner.state().records[0].id);assert.equal(record.roles.supervisor.providerId,B);assert.equal(record.roles.reviewer.providerId,C);assert.equal(record.modelIdentity.exactMatch,true);assert.equal(record.monitor.judgments.length,1);
 const analysis=runner.state().lab.reviewer.reviews[0];assert.equal(analysis.status,'completed');assert.equal(analysis.role.model,'gpt-6.1-sol');assert.equal(analysis.usageEvents.length,1);
 const files=fs.readdirSync(dir).filter(n=>n.endsWith('.json'));const all=files.map(n=>fs.readFileSync(path.join(dir,n),'utf8')).join('\n');for(const key of calls.map(c=>c.key))assert.ok(!all.includes(key));
});
