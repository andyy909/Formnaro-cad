const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {createMCPAgent}=require('../backend/ai-mcp-agent.cjs');const {ACPClient}=require('../backend/mistral-acp.cjs');
const revision='revision-1',token='b'.repeat(64);
async function fixture(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-mcp-agent-')),requests=[];let applied=0;
 const server=http.createServer(async(req,res)=>{assert.equal(req.headers.authorization,'Bearer '+token);const chunks=[];for await(const c of req)chunks.push(c);const args=chunks.length?JSON.parse(Buffer.concat(chunks)):null;requests.push({url:req.url,args});res.setHeader('content-type','application/json');
  const value=req.url==='/v1/context'?{requestSchema:{type:'object',properties:{revision:{type:'string'},commands:{type:'array'}},required:['revision','commands']},applySchema:{type:'object'},exportSchema:{type:'object'}}:req.url==='/v1/scene'?{revision:applied?'revision-2':revision,objects:applied?[{id:'new-box'}]:[]}:req.url==='/v1/preview/start'?{jobId:'own-job',state:'queued',revision}:req.url==='/v1/preview/result'?{jobId:'own-job',previewId:'own-preview',revision}:req.url==='/v1/preview'?{previewId:'own-preview',revision,after:[{id:'new-box',size:[20,10,2]}]}:req.url==='/v1/apply'?(applied++,{revision:'revision-2',applied:true}):{};
  res.end(JSON.stringify(value));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const connectionFile=path.join(directory,'ai-bridge.json');fs.writeFileSync(connectionFile,JSON.stringify({url:'http://127.0.0.1:'+server.address().port,token}));
 return {directory,connectionFile,requests,get applied(){return applied;},async close(){server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(directory,{recursive:true,force:true});}};
}
test('API agent uses a real stdio MCP child, previews before apply, verifies final scene and keeps the token out of provider messages',async()=>{
 const f=await fixture(),events=[],agent=createMCPAgent({...f,onEvent:e=>events.push(e)}),original=global.fetch;let step=0;
 global.fetch=async(url,options)=>{assert.equal(url,'https://api.x.ai/v1/chat/completions');assert.ok(!options.body.includes(token));const actions=[{tool:'offlinecad_preview',arguments:{revision,commands:[{op:'create',type:'box',size:[20,10,2]}]}},{tool:'offlinecad_apply',arguments:{revision,previewId:'own-preview'}},{message:'Platte wurde übernommen.'}];return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(actions[step++])}}],usage:{prompt_tokens:20,completion_tokens:8}}));};
 try{const result=await agent.run({baseUrl:'https://api.x.ai/v1',protocol:'chat',model:'fixture'},'fixture-key',{prompt:'Erstelle eine Platte.',requestId:'one',providerId:'https://api.x.ai'});assert.equal(result.applied,1);assert.equal(f.applied,1);assert.deepEqual(f.requests.map(r=>r.url),['/v1/context','/v1/scene','/v1/preview','/v1/apply','/v1/scene']);assert.ok(events.some(e=>e.type==='text'));assert.equal(result.usages.length,3);}
 finally{global.fetch=original;agent.dispose();await f.close();}
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
