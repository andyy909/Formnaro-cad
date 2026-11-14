const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {validateConfig,completeModel}=require('../backend/ai-provider.cjs');
const completed=text=>new Response('data: '+JSON.stringify({type:'response.completed',response:{status:'completed',model:'gpt-6.1-sol',output:[{type:'message',content:[{type:'output_text',text}]}],usage:{input_tokens:10,output_tokens:5}}})+'\n\n');
test('a lab series renews ChatGPT credentials after expiry between trials without changing roles',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-token-renewal-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 let expired=false,requests=0,resolutions=0;
 const config=validateConfig({baseUrl:'https://api.openai.com/v1',authMode:'chatgpt',protocol:'responses',model:'gpt-6.1-sol'});
 const credentials=()=>({config,key:''});
 const runner=require('../backend/ai-diagnostics.cjs').createDiagnostics({app:{},directory,credentials,reviewerEnabled:false,
  connections:{connection:credentials,providers:()=>[{id:'chatgpt',label:'ChatGPT',configured:true,hasKey:true}],catalog:async()=>({hasKey:true,availableModelIds:['gpt-6.1-sol'],models:[{id:'gpt-6.1-sol',vision:true,reasoningEfforts:['high']}]}),credential:async()=>{resolutions++;return expired?'fresh-token-fixture':'initial-token-fixture';}},
  provider:{completeModel},
  openChild:()=>({call:async m=>m==='setup'?{scene:{revision:'0123456789abcdef',objects:[],selectionTargets:[]},context:{},validationContext:(await import('../src/cad-ai-context.js')).cadAIContext(),project:{nodes:[]}}:m==='capture'?'data:image/png;base64,AQID':{},cancel(){},close:async()=>({code:0,signal:null})})});
 t.mock.method(globalThis,'fetch',async(url,o)=>{requests++;assert.equal(o.headers.Authorization,'Bearer '+(expired?'fresh-token-fixture':'initial-token-fixture'),'Expired series credential was reused');assert.equal(JSON.parse(o.body).model,'gpt-6.1-sol');expired=true;return completed(JSON.stringify({tool:'offlinecad_preview',arguments:{revision:'0123456789abcdef',commands:[{op:'create',type:'box',size:[1,2,3]}]}}));});
 const plan={...require('../backend/ai-test-lab-plan.cjs').preset(),caseIds:['drill'],variants:['A'],efforts:['high'],repeats:2,monitor:{mode:'off'},roles:{modeler:{providerId:'chatgpt',model:'gpt-6.1-sol',effort:'high'},supervisor:{providerId:'current',model:'',effort:'low'},reviewer:{providerId:'current',model:'',effort:'high'}}};
 await runner.start({mode:'lab',plan});
 assert.equal(requests,2);assert(runner.state().records.every(r=>!r.error),'The second trial must not fail on an expired access token.');assert(resolutions>=2);
 const text=fs.readdirSync(directory).filter(n=>n.endsWith('.json')).map(n=>fs.readFileSync(path.join(directory,n),'utf8')).join('');assert(!text.includes('initial-token-fixture'));assert(!text.includes('fresh-token-fixture'));
});

test('credentials renew inside one tool-reference/format-correction turn and never enter the wire body',async t=>{
 const config=validateConfig({authMode:'chatgpt',protocol:'responses',model:'gpt-6.1-sol'});let calls=0,resolutions=0;
 const credential=async signal=>{signal?.throwIfAborted();return 'turn-secret-'+(++resolutions);};
 t.mock.method(globalThis,'fetch',async(url,o)=>{calls++;assert.equal(o.headers.Authorization,'Bearer turn-secret-'+calls);assert(!o.body.includes('turn-secret-'));if(calls===1)return completed(JSON.stringify({toolReference:{tool:'tool:drill'}}));if(calls===2)return completed('{malformed');assert(o.body.includes('cad-ref-apply'));return completed(JSON.stringify({status:'completed',message:'Reference read.'}));});
 const reply=await completeModel(config,'expired-initial',{system:'JSON',user:'Read drilling help.',input:{history:[],images:[]},context:{toolReference:{version:1},practiceOnly:true}},new AbortController().signal,{credential});
 assert.equal(calls,3);assert.equal(resolutions,3);assert.equal(JSON.parse(reply.text).message,'Reference read.');assert(!JSON.stringify(reply.data).includes('turn-secret-'));
});

test('an aborted or failed credential refresh sends no provider request and is not retried',async t=>{
 let requests=0;t.mock.method(globalThis,'fetch',async()=>{requests++;throw Error('must not send');});
 const config=validateConfig({authMode:'chatgpt',protocol:'responses',model:'gpt-6.1-sol'}),envelope={system:'JSON',user:'hello',input:{history:[],images:[]}};
 let resolutions=0;await assert.rejects(completeModel(config,'expired',envelope,new AbortController().signal,{credential:async()=>{resolutions++;throw Object.assign(Error('Sign in required.'),{code:'CHATGPT_LOGIN_REQUIRED'});}}),{code:'CHATGPT_LOGIN_REQUIRED'});
 const c=new AbortController();c.abort();await assert.rejects(completeModel(config,'expired',envelope,c.signal,{credential:async()=>{resolutions++;return 'unused';}}));assert.equal(requests,0);assert.equal(resolutions,1);
});
