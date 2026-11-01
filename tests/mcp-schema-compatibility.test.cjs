const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {ACPClient}=require('../backend/mistral-acp.cjs');

for(const runtime of ['node','python'])test(runtime+' stdio MCP schemas declare object roots, including the UI union',async t=>{
 const python=process.env.PYTHON??'python';if(runtime==='python'&&require('node:child_process').spawnSync(python,['--version']).status!==0){t.skip('Python is not installed');return;}
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-mcp-schema-')),connection=path.join(directory,'bridge.json');
 const ui={oneOf:[{type:'object',properties:{action:{const:'status'}},required:['action'],additionalProperties:false}]};
 const calls=[];const server=http.createServer(async(req,res)=>{assert.equal(req.headers.authorization,'Bearer '+'a'.repeat(64));res.setHeader('Content-Type','application/json');if(req.method==='POST'){const chunks=[];for await(const chunk of req)chunks.push(chunk);calls.push({url:req.url,body:JSON.parse(Buffer.concat(chunks))});res.end(JSON.stringify({ok:true}));return;}res.end(JSON.stringify({analysisSchema:{type:'object',properties:{revision:{type:'string'},queries:{type:'array'}},required:['revision','queries'],additionalProperties:false},discardSchema:{type:'object',properties:{previewId:{type:'string'},revision:{type:'string'}},required:['previewId','revision'],additionalProperties:false},requestSchema:{type:'object'},exportSchema:{type:'object'},agentUI:{available:true,requestSchema:ui},programTools:{python:true}}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));fs.writeFileSync(connection,JSON.stringify({url:'http://127.0.0.1:'+server.address().port,token:'a'.repeat(64)}));
 const client=new ACPClient(runtime==='node'?{command:process.execPath,args:[path.resolve(__dirname,'../backend/mistral-mcp.cjs'),connection]}:{command:python,args:[path.resolve(__dirname,'../scripts/offlinecad_ai.py'),'--connection',connection,'--mcp']});
 try{const startup=await client.call('initialize',{protocolVersion:'2025-03-26'});assert(startup.instructions.includes(require('../backend/ai-working-rules.cjs').sharedAgentContext().instructions));const result=await client.call('tools/list');assert(result.tools.some(t=>t.name==='offlinecad_discard'));assert(result.tools.some(t=>t.name==='offlinecad_analyze'));assert(result.tools.length>=10);for(const tool of result.tools)assert.equal(tool.inputSchema.type,'object',tool.name);assert.deepEqual(result.tools.find(t=>t.name==='offlinecad_ui').inputSchema,{type:'object',...ui});
  const analysis={revision:'r',queries:[{id:'j',engine:'app',kind:'joints'}]},discard={revision:'r',previewId:'p'};
  assert.equal((await client.call('tools/call',{name:'offlinecad_analyze',arguments:analysis})).isError,false);assert.equal((await client.call('tools/call',{name:'offlinecad_discard',arguments:discard})).isError,false);
  assert.deepEqual(calls,[{url:'/v1/analysis',body:analysis},{url:'/v1/discard',body:discard}]);
 }
 finally{await client.stop();await new Promise(resolve=>server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});}
});
