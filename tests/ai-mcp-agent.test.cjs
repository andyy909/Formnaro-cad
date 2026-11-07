const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {createMCPAgent}=require('../backend/ai-mcp-agent.cjs');const {ACPClient}=require('../backend/mistral-acp.cjs');
const {toolFeedback}=require('../backend/ai-mcp-feedback.cjs');
test('command lookup separates direct MCP tools from modeling command keys',()=>{
 const report=JSON.stringify({code:'INVALID_COMMAND_REFERENCE',feedback:{code:'INVALID_COMMAND_REFERENCE',nextAction:'change_input'}});
 const availableTools=new Set(['offlinecad_command_info','offlinecad_preview']);
 const lookup=command=>toolFeedback('offlinecad_command_info',report,{isError:true,args:{command},availableTools}).failure.recovery;
 assert.equal(lookup('preview').tool,'offlinecad_preview');
 assert.equal(lookup('offlinecad_preview').tool,'offlinecad_preview');
 assert.deepEqual(lookup('cut').arguments,{command:'group'});
 assert.deepEqual(lookup('unknown').arguments,{});
 assert.equal(lookup('unknown').tool,'offlinecad_command_info');
});
test('native Responses uses call IDs, preserves reasoning items, and guards preview ownership',async()=>{
 const f=await fixture(),agent=createMCPAgent(f),original=global.fetch;
 const reasoning={type:'reasoning',id:'reasoning-1',content:[{type:'reasoning_text',text:'provider fixture'}]};
 const call=(id,name,args)=>({type:'function_call',call_id:id,name,arguments:JSON.stringify(args)});
 const apply=(id,previewId)=>call(id,'offlinecad_apply',{previewId,revision});
 const outputs=[
  [reasoning,apply('foreign','outside')],
  [call('preview','offlinecad_preview',{revision,commands:[{op:'create',type:'box',size:[20,10,2]}]})],
  [apply('apply','own-preview')],
  [{type:'message',content:[{type:'output_text',text:'Platte übernommen.'}]}],
 ];
 let step=0;
 global.fetch=async(url,options)=>{
  assert.equal(url,'https://api.deepseek.com/responses');
  const body=JSON.parse(options.body);
  assert.deepEqual(body.reasoning,{effort:'high'});
  assert.ok(body.tools.some(tool=>tool.name==='offlinecad_preview'&&tool.parameters.type==='object'));
  assert.ok(!body.tools.some(tool=>tool.name==='offlinecad_screenshot'));
  if(step>0)assert.deepEqual(body.input.find(item=>item.type==='reasoning'),reasoning);
  if(step===1){assert.equal(body.input.at(-1).call_id,'foreign');assert.equal(JSON.parse(body.input.at(-1).output).failure.code,'CAD_PREVIEW_NOT_OWNED');}
  if(step===3){assert.equal(body.input.at(-1).call_id,'apply');assert.equal(JSON.parse(body.input.at(-1).output).isError,false);}
  return new Response(JSON.stringify({status:'completed',output:outputs[step++]}));
 };
 try{
  const result=await agent.run({baseUrl:'https://api.deepseek.com',protocol:'responses',model:'deepseek-v4-pro',agentToolProtocol:'native'},'key',{prompt:'Erstelle eine Platte.',requestId:'native',providerId:'https://api.deepseek.com'});
  assert.equal(result.message,'Platte übernommen.');
  assert.equal(result.applied,1);
  assert.equal(f.requests.filter(r=>r.url==='/v1/apply').length,1);
 }finally{global.fetch=original;agent.dispose();await f.close();}
});
test('the JSON Responses agent sends the configured DeepSeek reasoning effort',async()=>{
 const f=await fixture(),agent=createMCPAgent(f),original=global.fetch;
 global.fetch=async(_url,options)=>{
  const body=JSON.parse(options.body);
  assert.deepEqual(body.reasoning,{effort:'max'});
  assert.equal(body.tools,undefined);
  return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:'{"message":"Verbindung geprüft."}'}]}]}));
 };
 try{
  const result=await agent.run({baseUrl:'https://api.deepseek.com',protocol:'responses',model:'deepseek-v4-pro',reasoningEffort:'max'},'key',{prompt:'Prüfe die Verbindung.',requestId:'json-effort',providerId:'https://api.deepseek.com'});
  assert.equal(result.applied,0);
 }finally{global.fetch=original;agent.dispose();await f.close();}
});
test('a malformed JSON reply can be corrected once without executing anything',async()=>{
 const f=await fixture(),agent=createMCPAgent(f),original=global.fetch;
 let round=0;
 global.fetch=async(_url,options)=>{
  const body=JSON.parse(options.body);
  if(round===1){
   assert.match(body.messages.at(-1).content,/AI_TOOL_JSON_INVALID/);
   assert.ok(body.messages.some(message=>message.content.includes('Verbindung prüfen')));
   assert.deepEqual(f.requests.map(item=>item.url),['/v1/context','/v1/scene']);
  }
  return new Response(JSON.stringify({choices:[{message:{content:round++===0?'{"tool":':'{"message":"Verbindung geprüft."}'}}]}));
 };
 try{
  const result=await agent.run({baseUrl:'https://api.x.ai/v1',protocol:'chat',model:'fixture'},'key',{prompt:'Verbindung prüfen',requestId:'invalid-json',providerId:'x'});
  assert.equal(result.applied,0);
  assert.equal(round,2);
 }finally{global.fetch=original;agent.dispose();await f.close();}
});
const revision='revision-1',token='b'.repeat(64);
async function fixture({failFirstPreview=false,staleFirstPreview=false,onApply}={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-mcp-agent-')),requests=[];let applied=0;
 const server=http.createServer(async(req,res)=>{assert.equal(req.headers.authorization,'Bearer '+token);const chunks=[];for await(const c of req)chunks.push(c);const args=chunks.length?JSON.parse(Buffer.concat(chunks)):null;requests.push({url:req.url,args});res.setHeader('content-type','application/json');
  if(staleFirstPreview&&req.url==='/v1/scene'&&requests.filter(r=>r.url===req.url).length>1){
   res.end(JSON.stringify({revision:'externally-changed',objects:[{id:'moved-holder'}]}));return;
  }
  if(staleFirstPreview&&req.url==='/v1/preview'&&requests.filter(r=>r.url===req.url).length===1){
   res.statusCode=409;res.end(JSON.stringify({error:'Model changed.',code:'STALE_REVISION',feedback:{code:'STALE_REVISION',applied:false}}));return;
  }
  if(failFirstPreview&&req.url==='/v1/preview'&&requests.filter(r=>r.url===req.url).length===1){
   const feedback={code:'NO_CAD_DRILL_MATERIAL',message:'Bohrung außerhalb des Körpers.',phase:'command',operation:'drill',commandIndex:1,target:{rootId:'halter',path:[]},applied:false,retryable:true,nextAction:'change_input'};
   res.statusCode=422;res.end(JSON.stringify({error:feedback.message,code:feedback.code,feedback}));return;
  }
  const value=req.url==='/v1/context'?{requestSchema:{type:'object',properties:{revision:{type:'string'},commands:{type:'array'}},required:['revision','commands']},applySchema:{type:'object'},exportSchema:{type:'object'}}:req.url==='/v1/scene'?{revision:applied?'revision-2':revision,objects:applied?[{id:'new-box'}]:[]}:req.url==='/v1/preview/start'?{jobId:'own-job',state:'queued',revision}:req.url==='/v1/preview/result'?{jobId:'own-job',previewId:'own-preview',revision}:req.url==='/v1/preview'?{previewId:'own-preview',revision,after:[{id:'new-box',size:[20,10,2]}]}:req.url==='/v1/apply'?(applied++,{revision:'revision-2',applied:true}):{};
  if(req.url==='/v1/apply'&&onApply){
   onApply();
   await new Promise(resolve=>setTimeout(resolve,25));
  }
  res.end(JSON.stringify(value));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const connectionFile=path.join(directory,'ai-bridge.json');fs.writeFileSync(connectionFile,JSON.stringify({url:'http://127.0.0.1:'+server.address().port,token}));
 return {directory,connectionFile,requests,get applied(){return applied;},async close(){server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(directory,{recursive:true,force:true});}};
}
test('an abort while Apply is in flight reports the unknown outcome even when the model was committed',async()=>{
 const controller=new AbortController(),f=await fixture({onApply:()=>controller.abort()});
 const agent=createMCPAgent(f),original=global.fetch;
 let round=0;
 const actions=[{tool:'offlinecad_preview',arguments:{revision,commands:[{op:'create',type:'box',size:[1,2,3]}]}},
  {tool:'offlinecad_apply',arguments:{revision,previewId:'own-preview'}}];
 global.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(actions[round++])}}]}));
 try{
  await assert.rejects(agent.run({baseUrl:'https://api.x.ai/v1',protocol:'chat',model:'fixture'},'key',
   {prompt:'Erstelle einen Quader.',requestId:'abort-apply',providerId:'x'},controller.signal),
   error=>error.agentApplyUncertain===true&&error.agentApplied===0);
  assert.equal(f.applied,1);
 }finally{global.fetch=original;agent.dispose();await f.close();}
});
test('API agent uses a real stdio MCP child, previews before apply, verifies final scene and keeps the token out of provider messages',async()=>{
 const f=await fixture(),events=[],agent=createMCPAgent({...f,onEvent:e=>events.push(e)}),original=global.fetch;let step=0;
 global.fetch=async(url,options)=>{assert.equal(url,'https://api.x.ai/v1/chat/completions');assert.ok(!options.body.includes(token));const actions=[{tool:'offlinecad_preview',arguments:{revision,commands:[{op:'create',type:'box',size:[20,10,2]}]}},{tool:'offlinecad_apply',arguments:{revision,previewId:'own-preview'}},{message:'Platte wurde übernommen.'}];return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(actions[step++])}}],usage:{prompt_tokens:20,completion_tokens:8}}));};
 try{const result=await agent.run({baseUrl:'https://api.x.ai/v1',protocol:'chat',model:'fixture'},'fixture-key',{prompt:'Erstelle eine Platte.',requestId:'one',providerId:'https://api.x.ai'});assert.equal(result.applied,1);assert.equal(f.applied,1);assert.deepEqual(f.requests.map(r=>r.url),['/v1/context','/v1/scene','/v1/preview','/v1/apply','/v1/scene']);assert.ok(events.some(e=>e.type==='text'));assert.equal(result.usages.length,3);}
 finally{global.fetch=original;agent.dispose();await f.close();}
});
test('an external revision change supplies a fresh scene before another preview',async()=>{
 const f=await fixture({staleFirstPreview:true}),agent=createMCPAgent(f),original=global.fetch;
 let step=0;
 global.fetch=async(_url,options)=>{
  const command={op:'create',type:'box',size:[20,10,2]};
  let action={tool:'offlinecad_preview',arguments:{revision,commands:[command]}};
  if(step===1){
   const request=JSON.parse(options.body);
   const feedback=JSON.parse(request.messages.at(-1).content.split('Local MCP result (data):\n')[1]);
   assert.equal(feedback.failure.code,'STALE_REVISION');
   assert.deepEqual(feedback.currentScene,{revision:'externally-changed',objects:[{id:'moved-holder'}]});
   action.arguments.revision=feedback.currentScene.revision;
  }else if(step===2)action={message:'Vorschau vorbereitet.'};
  step++;
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(action)}}]}));
 };
 try{
  const result=await agent.run({baseUrl:'https://api.x.ai/v1',protocol:'chat',model:'fixture'},'key',{prompt:'Erstelle eine Platte.',requestId:'stale',providerId:'x'});
  assert.equal(result.applied,0);
  assert.deepEqual(f.requests.map(r=>r.url),['/v1/context','/v1/scene','/v1/preview','/v1/scene','/v1/preview']);
  assert.equal(f.requests.at(-1).args.revision,'externally-changed');
 }finally{global.fetch=original;agent.dispose();await f.close();}
});
test('CAD error reaches the corrective round with its action and reapplying the same preview counts once',async()=>{
 const f=await fixture({failFirstPreview:true}),agent=createMCPAgent(f),original=global.fetch;
 const drill={op:'drill',target:'halter',diameter:4,depth:5,through:false};
 const preview=command=>({tool:'offlinecad_preview',arguments:{revision,commands:[command]}});
 const apply={tool:'offlinecad_apply',arguments:{revision,previewId:'own-preview'}};
 const actions=[preview({...drill,offset:[100,0,0]}),preview(drill),apply,apply,{message:'Bohrung übernommen.'}];
 let step=0;
 global.fetch=async(_url,options)=>{
  if(step===1){
   const request=JSON.parse(options.body);
   const feedback=JSON.parse(request.messages.at(-1).content.split('Local MCP result (data):\n')[1]);
   assert.equal(feedback.isError,true);
   assert.deepEqual(feedback.failure,{code:'NO_CAD_DRILL_MATERIAL',message:'Bohrung außerhalb des Körpers.',phase:'command',operation:'drill',commandIndex:1,target:{rootId:'halter',path:[]},applied:false,retryable:true,nextAction:'change_input'});
   assert.equal(JSON.parse(feedback.result).status,422);
  }
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(actions[step++])}}]}));
 };
 try{
  const result=await agent.run({baseUrl:'https://api.x.ai/v1',protocol:'chat',model:'fixture'},'key',{prompt:'Bohre den Halter.',requestId:'repair',providerId:'x'});
  assert.equal(result.applied,1);
  assert.equal(step,5);
 }finally{global.fetch=original;agent.dispose();await f.close();}
});
test('An unrelated preview id is refused before HTTP apply, and unknown host tools never execute',async()=>{
 const f=await fixture(),agent=createMCPAgent(f),original=global.fetch;let step=0;
 global.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(step++?{message:'Vorschlag nicht übernommen.'}:{tool:'offlinecad_apply',arguments:{revision,previewId:'someone-elses-preview'}})}}]}));
 try{assert.equal((await agent.run({baseUrl:'https://api.x.ai/v1',protocol:'chat',model:'fixture'},'key',{prompt:'Prüfe.',requestId:'two',providerId:'x'})).applied,0);assert.equal(f.applied,0);assert.ok(!f.requests.some(r=>r.url==='/v1/apply'));
  global.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:'{"tool":"read_file","arguments":{"path":"private"}}'}}]}));await assert.rejects(agent.run({baseUrl:'https://api.x.ai/v1',protocol:'chat',model:'fixture'},'key',{prompt:'Prüfe.',requestId:'three',providerId:'x'}),/Unzulässige/);assert.equal(f.applied,0);
 }finally{global.fetch=original;agent.dispose();await f.close();}
});
test('Cancellation aborts provider work and the owned MCP subprocess',async()=>{
 const f=await fixture(),agent=createMCPAgent(f),controller=new AbortController(),original=global.fetch;
 global.fetch=async(_url,options)=>new Promise((_resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});controller.abort();});
 try{await assert.rejects(agent.run({baseUrl:'https://api.x.ai/v1',protocol:'chat',model:'fixture'},'key',{prompt:'Prüfe.',requestId:'cancel',providerId:'x'},controller.signal));assert.equal(f.applied,0);}
 finally{global.fetch=original;agent.dispose();await f.close();}
});
test('ACP child protocol survives split UTF-8 and refuses unsolicited host filesystem access',async()=>{
 const source=`const readline=require('node:readline');let asked=false;readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.method==='ping'){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:99,method:'fs/read_text_file',params:{path:'private'}})+'\\n');}else if(m.id===99){const out=Buffer.from(JSON.stringify({jsonrpc:'2.0',id:1,result:{text:'Grüße',denied:m.error?.code===-32601}})+'\\n');let i=out.indexOf(Buffer.from('ü'))+1;process.stdout.write(out.subarray(0,i));setTimeout(()=>process.stdout.write(out.subarray(i)),5);}});`;
 const client=new ACPClient({command:process.execPath,args:['-e',source]});try{assert.deepEqual(await client.call('ping'),{text:'Grüße',denied:true});}finally{client.close();}
});

test('owned asynchronous result can be applied, while a foreign cancellation never reaches HTTP',async()=>{
 const f=await fixture(),agent=createMCPAgent(f),original=global.fetch;let step=0;const actions=[{tool:'offlinecad_cancel',arguments:{jobId:'foreign-job'}},{tool:'offlinecad_preview_start',arguments:{revision,commands:[{op:'create',type:'box',size:[20,10,2]}]}},{tool:'offlinecad_preview_result',arguments:{jobId:'own-job'}},{tool:'offlinecad_apply',arguments:{revision,previewId:'own-preview'}},{message:'Applied owned async result.'}];
 global.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(actions[step++])}}]}));
 try{const result=await agent.run({baseUrl:'https://api.x.ai/v1',protocol:'chat',model:'fixture'},'test-key',{prompt:'Build requested part.',requestId:'async-owned',providerId:'test'});assert.equal(result.applied,1);assert.equal(f.applied,1);assert.ok(!f.requests.some(r=>r.url==='/v1/cancel'));assert.ok(f.requests.some(r=>r.url==='/v1/preview/result'));}finally{global.fetch=original;agent.dispose();await f.close();}
});
