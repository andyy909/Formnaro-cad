const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createChatGPTAuth,verifyIdentity}=require('../backend/chatgpt-auth.cjs');
const {generate,testConnection,validateConfig}=require('../backend/ai-provider.cjs');
const {readChatGPTResponse}=require('../backend/chatgpt-stream.cjs');
const {createAIProfiles}=require('../backend/ai-profiles.cjs');
const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048}),jwk={...publicKey.export({format:'jwk'}),kid:'fixture',alg:'RS256',use:'sig'};
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function jwt(claims,header={alg:'RS256',kid:'fixture'}){const payload=b64(header)+'.'+b64(claims);return payload+'.'+crypto.sign('RSA-SHA256',Buffer.from(payload),privateKey).toString('base64url');}
const json=x=>new Response(JSON.stringify(x),{headers:{'content-type':'application/json'}});
const scopes='openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
function fixture(t){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-oauth-test-')),encKey=crypto.randomBytes(32);let clock=Date.now(),authUrl,calls=[],failRefresh=false,failRevoke=false,subject='person-one';
 const encrypt=value=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',encKey,iv),bytes=Buffer.concat([c.update(value,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),bytes]).toString('base64');};
 const decrypt=value=>{const b=Buffer.from(value,'base64'),d=crypto.createDecipheriv('aes-256-gcm',encKey,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return Buffer.concat([d.update(b.subarray(28)),d.final()]).toString();};
 const fetchImpl=async(url,options={})=>{calls.push({url,options});if(url.endsWith('openid-configuration'))return json({issuer:'https://auth.openai.com',jwks_uri:'https://auth.openai.com/jwks',revocation_endpoint:'https://auth.openai.com/revoke'});if(url.endsWith('/jwks'))return json({keys:[jwk]});if(url.endsWith('/revoke'))return new Response(null,{status:failRevoke?503:200});if(url.endsWith('/token')){const p=options.body;if(p.get('grant_type')==='refresh_token'){if(failRefresh)return new Response(JSON.stringify({error:'invalid_grant'}),{status:400});return json({access_token:'renewed-private-token',refresh_token:'rotated-private-token',token_type:'Bearer',expires_in:3600});}assert.equal(p.get('client_id'),'oaiapp_fixture');assert.equal(p.get('redirect_uri'),authUrl.searchParams.get('redirect_uri'));assert.equal(crypto.createHash('sha256').update(p.get('code_verifier')).digest('base64url'),authUrl.searchParams.get('code_challenge'));return json({access_token:'private-access-token',refresh_token:'private-refresh-token',token_type:'Bearer',expires_in:3600,scope:scopes,id_token:jwt({iss:'https://auth.openai.com',aud:'oaiapp_fixture',sub:subject,email:'test@example.invalid',iat:Math.floor(clock/1000),exp:Math.floor(clock/1000)+3600,nonce:authUrl.searchParams.get('nonce')})});}throw Error('Unexpected endpoint');};
 const options={directory,encrypt,decrypt,canEncrypt:()=>true,openExternal:async url=>{authUrl=new URL(url);},fetchImpl,now:()=>clock},auth=createChatGPTAuth(options);
 t.after(()=>{auth.dispose();fs.rmSync(directory,{recursive:true,force:true});});
 async function callback(params={}){const u=new URL(authUrl.searchParams.get('redirect_uri'));u.search=new URLSearchParams({state:authUrl.searchParams.get('state'),client_id:'oaiapp_fixture',code:'fixture-code',...params});const result=await fetch(u);await result.text();return result.status;}
 return {auth,options,directory,calls,callback,url:()=>authUrl,advance:()=>clock+=3600000,setSubject:v=>subject=v,failRefresh:()=>failRefresh=true,failRevoke:()=>failRevoke=true};
}
test('OAuth validates state, PKCE, signed identity; encrypts credentials and reuses registration and host',async t=>{
 const f=fixture(t);await f.auth.start();const first=f.url(),host=first.searchParams.get('ext_agent_host_id');assert.equal(first.hostname,'auth.openai.com');assert.equal(first.searchParams.get('agent_name_hint'),'Formnaro');assert.equal(first.searchParams.get('client_id'),'dynamic_agent_client');assert.equal(await f.callback({state:'wrong-state'}),400);assert.equal(f.calls.length,0);assert.equal(await f.callback(),200);
 const status=f.auth.publicStatus();assert.equal(status.connected,true);assert.equal(status.email,'test@example.invalid');assert.equal(status.needsWelcome,true);assert(!JSON.stringify(status).includes('private-'));assert(!fs.readFileSync(path.join(f.directory,'accounts.enc'),'utf8').includes('private-'));
 await f.auth.acknowledge();assert.equal(f.auth.publicStatus().needsWelcome,false);const restored=createChatGPTAuth(f.options);assert.equal(restored.publicStatus().connected,true);assert.equal(await restored.token(),'private-access-token');
 await f.auth.start({accountId:status.activeId});assert.equal(f.url().searchParams.get('client_id'),'oaiapp_fixture');assert.equal(f.url().searchParams.get('ext_agent_host_id'),host);assert(!f.url().searchParams.has('agent_name_hint'));assert(f.url().searchParams.has('id_token_hint'));assert.notEqual(f.url().searchParams.get('state'),first.searchParams.get('state'));assert.equal(await f.callback(),200);
});
test('Cancelled and denied login preserves prior account, removes listener/lock, and signed identity mismatch fails',async t=>{
 const f=fixture(t);await f.auth.start();await f.callback();const before=f.auth.publicStatus();await f.auth.start({accountId:before.activeId});f.setSubject('different-person');assert.equal(await f.callback(),400);assert.equal(f.auth.publicStatus().activeId,before.activeId);assert.equal(f.auth.publicStatus().connected,true);
 await f.auth.start();assert.equal(await f.callback({error:'access_denied'}),400);assert.equal(f.auth.publicStatus().activeId,before.activeId);await f.auth.start();const old=f.url().searchParams.get('redirect_uri');f.auth.cancel();await assert.rejects(fetch(old));assert(!fs.existsSync(path.join(f.directory,'session.lock')));
});
test('Refresh rotates once for concurrent calls, persists, and logout revokes then clears tokens but retains mapping',async t=>{
 const f=fixture(t);await f.auth.start();await f.callback();f.advance();assert.deepEqual(await Promise.all([f.auth.token(),f.auth.token()]),['renewed-private-token','renewed-private-token']);assert.equal(f.calls.filter(c=>c.options.body?.get('grant_type')==='refresh_token').length,1);
 const before=f.auth.publicStatus();await f.auth.logout();assert.equal(f.auth.publicStatus().connected,false);assert.equal(f.auth.publicStatus().activeId,before.activeId);assert.equal(f.calls.at(-1).options.body.get('token'),'rotated-private-token');await assert.rejects(f.auth.token(),/anmelden/);
 await f.auth.start({accountId:before.activeId});assert.equal(f.url().searchParams.get('client_id'),'oaiapp_fixture');assert(!f.url().searchParams.has('id_token_hint'));
});
test('Invalid grant requires new sign-in; unconfirmed remote revocation is disclosed',async t=>{
 const f=fixture(t);await f.auth.start();await f.callback();f.advance();f.failRefresh();await assert.rejects(f.auth.token(),/abgelaufen/);assert.equal(f.auth.publicStatus().connected,false);await f.auth.start({accountId:f.auth.publicStatus().activeId});await f.callback();f.failRevoke();await f.auth.logout();assert.match(f.auth.publicStatus().message,/nicht bestätigt/);assert.equal(f.auth.publicStatus().connected,false);
});
test('Concurrent application cannot rotate same credentials during login',async t=>{
 const f=fixture(t);await f.auth.start();const other=createChatGPTAuth(f.options);await assert.rejects(other.start(),/andere Formnaro/);f.auth.cancel();await other.start();other.cancel();
});

test('A synthetic login lock disappearing after EEXIST is retried instead of reported as a live session',async t=>{
 const f=fixture(t),lock=path.join(f.directory,'session.lock'),read=fs.readFileSync;fs.writeFileSync(lock,String(process.pid));let injected=false;
 t.mock.method(fs,'readFileSync',function(file,...args){if(file===lock&&!injected){injected=true;fs.unlinkSync(lock);throw Object.assign(Error('synthetic disappearing lock'),{code:'ENOENT'});}return read.call(this,file,...args);});
 await f.auth.start();assert.equal(injected,true);assert.equal(f.auth.publicStatus().pending,true);f.auth.cancel();assert.equal(fs.existsSync(lock),false);
});
test('Browser launch failure never exposes the authorization URL or retained ID token',async t=>{
 const f=fixture(t);await f.auth.start();await f.callback();const bad=createChatGPTAuth({...f.options,openExternal:async url=>{throw Error(url);}});await assert.rejects(bad.start({accountId:f.auth.publicStatus().activeId}),e=>/Standardbrowser/.test(e.message)&&!e.message.includes('id_token_hint')&&!e.message.includes('auth.openai.com'));assert.equal(bad.publicStatus().pending,false);assert.equal(bad.publicStatus().connected,true);
});
test('JWT rejects wrong issuer, nonce, audience, expiry, signature and algorithm',()=>{
 const valid={iss:'https://auth.openai.com',aud:'oaiapp_fixture',sub:'one',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300,nonce:'nonce'},expect={clientId:'oaiapp_fixture',nonce:'nonce'};assert.equal(verifyIdentity(jwt(valid),[jwk],expect).subject,'one');for(const patch of [{iss:'https://evil.invalid'},{aud:'wrong'},{nonce:'wrong'},{exp:1},{sub:''},{aud:['oaiapp_fixture','another']},{iat:9999999999}])assert.throws(()=>verifyIdentity(jwt({...valid,...patch}),[jwk],expect));assert.throws(()=>verifyIdentity(jwt(valid,{alg:'none',kid:'fixture'}),[jwk],expect));const signed=jwt(valid);assert.throws(()=>verifyIdentity(signed.slice(0,-10)+'AAAAAAAAAA',[jwk],expect));
});
const event=(type,response)=>'data: '+JSON.stringify({type,response})+'\r\n\r\n';
const completed={status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"message":"Hallo"}'}]}],usage:{input_tokens:10,output_tokens:5}};
const stream=text=>new Response(new ReadableStream({start(c){const bytes=Buffer.from(text);for(let n=0;n<bytes.length;n+=3)c.enqueue(bytes.subarray(n,n+3));c.close();}}),{headers:{'content-type':'text/event-stream'}});
test('SSE handles chunked UTF-8/CRLF; incomplete, failed, limits and premature EOF never yield proposals',async()=>{
 assert.deepEqual(await readChatGPTResponse(stream(': ping\r\n\r\n'+event('response.completed',completed))),completed);
 for(const text of [event('response.incomplete',{}),event('response.failed',{error:{code:'subscription_sharing_usage_limit_exceeded'}}),'data: {"type":"response.output_text.delta","delta":"partial"}\n\n','data: invalid\n\n',event('response.completed',completed)+event('response.failed',{})])await assert.rejects(readChatGPTResponse(stream(text)));
 await assert.rejects(readChatGPTResponse(new Response('{}',{status:401})),/anmelden/);
});
test('Abo requests use streamed public Responses, complete history and no unsupported billing/API parameters',async()=>{
 const original=global.fetch;let body;global.fetch=async(url,o)=>{assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(o.redirect,'error');body=JSON.parse(o.body);return stream(event('response.completed',completed));};
 try{const result=await generate({authMode:'chatgpt',model:'allowed-model'},'opaque-oauth-token',{prompt:'Hallo',context:{},scene:{revision:'r'},chat:true});assert.equal(result.message,'Hallo');assert.equal(result.usage.outputTokens,5);assert.equal(body.stream,true);assert.equal(body.store,false);assert(Array.isArray(body.input));assert.equal(body.input[0].role,'user');for(const key of ['max_output_tokens','temperature','previous_response_id','metadata'])assert(!(key in body));assert(body.instructions.includes('CAD assistant'));assert.throws(()=>validateConfig({authMode:'chatgpt',baseUrl:'https://evil.invalid'}));}finally{global.fetch=original;}
});
test('Account model list respects visibility and server order',async()=>{
 const original=global.fetch;global.fetch=async()=>json({models:[{slug:'second',display_name:'Second',visibility:'list'},{slug:'hidden',visibility:'hidden'},{slug:'first',visibility:'list'}]});try{assert.deepEqual((await testConnection({authMode:'chatgpt'},'token')).models,['second','first']);}finally{global.fetch=original;}
});
test('ChatGPT and API profiles at same origin never share keys or selected model',()=>{
 let stored;const options={canEncrypt:()=>true,encrypt:s=>'encrypted:'+s,decrypt:s=>s.slice(10),persist:s=>stored=s},profiles=createAIProfiles(options);profiles.save({config:{baseUrl:'https://api.openai.com/v1',model:'api-model',rememberKey:true},key:'api-secret'});profiles.selectProvider('chatgpt');assert.equal(profiles.active().key,'');assert.equal(profiles.publicSettings().providerId,'chatgpt');profiles.selectModel('plan-model');assert.throws(()=>profiles.save({config:profiles.active().config,key:'should-not-save'}));profiles.selectProvider('https://api.openai.com');assert.equal(profiles.active().key,'api-secret');assert.equal(profiles.active().config.model,'api-model');const restored=createAIProfiles({...options,stored});restored.selectProvider('chatgpt');assert.equal(restored.active().config.model,'plan-model');assert.equal(restored.active().key,'');
});
test('Saved Abo selection remains readable by older API-only releases without overwriting their key',()=>{
 let stored;const p=createAIProfiles({canEncrypt:()=>true,encrypt:s=>'encrypted:'+s,decrypt:s=>s.slice(10),persist:s=>stored=s});p.save({config:{model:'keep-api',rememberKey:true},key:'keep-key'});p.selectProvider('chatgpt');p.selectModel('plan-model');assert.equal(stored.config.model,'keep-api');assert.equal(stored.encryptedKey,'encrypted:keep-key');assert.equal(stored.profiles.length,1);assert.equal(stored.profiles[0].encryptedKey,'encrypted:keep-key');assert.equal(stored.chatgptConfig.model,'plan-model');assert.equal(stored.selectedProviderId,'chatgpt');
});
