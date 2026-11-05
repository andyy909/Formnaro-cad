const test=require('node:test'),assert=require('node:assert/strict');
const {reference,withToolReference,compactToolContext}=require('../backend/ai-tool-reference.cjs');
test('every registered tool has a truthful read-only reference, including search and exact alignment controls',async()=>{
 const {PROGRAM_TOOLS}=await import('../src/cad-program-help.js');
 for(const t of PROGRAM_TOOLS){const r=await reference({tool:t.id});assert.equal(r.ok,true);assert.equal(r.tool.documentationLevel,'documented');assert(r.tool.purpose.length>20);assert.equal(r.tool.id,t.id);}
 const r=await reference({tool:'align'});assert(r.tool.controls.some(c=>c.target==='ui:id:align-y-center'));
 const grid=await reference({tool:'array'});assert(grid.tool.controls.find(c=>c.target==='ui:id:array-kind').options.some(o=>o.value==='grid'));assert.equal(grid.tool.modelExample.op,'pattern');
 assert((await reference({query:'Passung'})).matches.some(t=>t.id==='tool:general-fit'));
 assert.equal((await reference({tool:'no-such-tool'})).ok,false);
 for(const input of [{tool:'array',url:'https://example.test'},{path:'C:/private'},{query:'x\nsecret'}])await assert.rejects(reference(input));
});
test('practice lookups exclude parent state and offer only the locked visible UI contract',async()=>{
 const context={practiceOnly:true,agentUI:{targets:[]},commandSchema:{secretShapeContract:true},programAssistant:{state:{mode:'normal',dialog:{value:'private-parent-value'},targets:[{id:'tool:align',private:true}]}},shapes:[{type:'box'}]};
 const r=await reference({tool:'align'},context);assert(!JSON.stringify(r).includes('private-parent'));assert(!r.tool.activePanel);assert(!r.tool.availability);
 const drawing=await reference({tool:'drawing'},context);
 assert(drawing.tool.steps.some(step=>step.includes('„Blatt übernehmen“ speichert')&&step.includes('endet damit die Blattbearbeitung')));
 assert(drawing.tool.steps.some(step=>step.includes('ui:id:drawing-title-block anklicken')&&step.includes('ui:id:drawing-title setzen')&&step.includes('Blattname')));
 const full=await reference({section:'modeling'},context);assert.equal(full.kind,'practice-ui-contract');assert(!full.contract.commandSchema);assert(!full.contract.programAssistant);assert.equal(full.contract.practicePolicy.directGeometry,false);assert(!full.contract.practiceCommandSchema.oneOf.some(s=>['python','script','pattern'].includes(s.properties.op.const)));
 const normalContract=await reference({section:'modeling'},{...context,practiceOnly:false});assert.equal(normalContract.contract.commandSchema.secretShapeContract,true);
 const normal=await reference({tool:'align'},{...context,practiceOnly:false});assert.equal(normal.tool.activePanel.value,'private-parent-value');
});
test('provider lookup loop returns actual metadata before answering and sums all usage rounds',async()=>{
 const seen=[],envelope={system:'Answer JSON.',user:'Show a pattern',context:{toolReference:{version:1}},input:{history:[],images:[]}};
 const reply=await withToolReference({envelope,complete:async e=>{seen.push(e);return {text:seen.length===1?' {"toolReference":{"tool":"array"}}':'{"message":"done"}',data:{usage:{input_tokens:10,output_tokens:5,input_tokens_details:{cached_tokens:2}}}};}});
 assert.equal(seen.length,2);assert(seen[1].user.includes('array-columns'));assert.equal(reply.data.usage.input_tokens,20);assert.equal(reply.data.usage.output_tokens,10);assert.equal(reply.data.usage.input_tokens_details.cached_tokens,4);assert.equal(reply.data.toolReferences[0].tool,'tool:array');assert(!reply.data.toolReferences[0].result);
});
test('unknown lookups become feedback without execution and context compaction keeps IDs and all command schemas',async()=>{
 const envelopes=[];const r=await withToolReference({envelope:{system:'x',user:'y',context:{toolReference:{version:1}},input:{history:[]}},complete:async e=>{envelopes.push(e);return {text:envelopes.length===1?' {"toolReference":{"tool":"unknown"}}':'{"message":"known limitation"}',data:{usage:{input_tokens:1,output_tokens:1}}};}});
 assert(envelopes[1].user.includes('Unbekanntes'));assert.equal(r.data.toolReferences[0].ok,false);
 const c={commandSchema:{all:true},designFreedom:{retain:true},agentUI:{targets:[{id:'tool:array',label:'Muster',description:'long',requirement:'one'}]},programAssistant:{catalogue:[{id:'tool:array',label:'Muster',description:'long'}]}};
 const compact=compactToolContext(c);assert.equal(compact.commandSchema,c.commandSchema);assert.equal(compact.designFreedom,c.designFreedom);assert.equal(compact.agentUI.targets[0].id,'tool:array');assert(!compact.agentUI.targets[0].description);assert.equal(c.agentUI.targets[0].description,'long');
});
test('practice format feedback preserves the actual failure while the provider corrects a nested message',async()=>{
 const actual='Die gemessene Formabweichung beträgt 6 mm (Reparaturbudget 0.15 mm).';
 const invalid={revision:'current',assistant:{kind:'practice',plan:{version:1,title:'Reparatur',
  actions:[{kind:'ui',target:'ui:id:converter-repair',action:'set',value:'off'}]},message:actual}};
 let rounds=0;
 const result=await withToolReference({envelope:{system:'JSON',user:'Validation feedback:\n'+actual,sceneRevision:'current',
  input:{history:[]},context:{toolReference:{version:1},practiceOnly:true}},complete:async request=>{
  if(++rounds===1)return {text:JSON.stringify(invalid)};
  assert(request.user.includes(actual));
  assert.match(request.user,/Put message at the top level/);
  return {text:JSON.stringify({message:actual})};
 }});
 assert.equal(rounds,2);
 assert.deepEqual(JSON.parse(result.text),{message:actual});
});
test('an incomplete practice reply receives the exact brace diagnostic before any execution',async()=>{
 const valid={revision:'current',assistant:{kind:'practice',plan:{version:1,title:'Zeichnung',
  actions:[{kind:'ui',target:'view:fit',action:'click'}]}}};
 const malformed=JSON.stringify({...valid,assistant:{...valid.assistant,message:'Absicht'}}).slice(0,-1);
 let rounds=0;
 const result=await withToolReference({envelope:{system:'JSON',user:'Zeichnung',sceneRevision:'current',
  input:{history:[]},context:{toolReference:{version:1},practiceOnly:true}},complete:async request=>{
  if(++rounds===1)return {text:malformed};
  assert.match(request.user,/final top-level closing brace is missing/);
  assert.match(request.user,/nothing executed/);
  return {text:JSON.stringify(valid)};
 }});
 assert.equal(rounds,2);
 assert.deepEqual(JSON.parse(result.text),valid);
});
test('practice tools with fields receive their real schema before a guessed plan can execute',async()=>{
 const seen=[],plan={assistant:{kind:'practice',plan:{version:1,title:'Raster',actions:[{kind:'ui',action:'click',target:'ui:tool:array'},{kind:'ui',action:'set',target:'ui:label:Reihen',value:'2'}]}}};
 const reply=await withToolReference({envelope:{system:'JSON',user:'Raster',input:{history:[]},context:{toolReference:{version:1},practiceOnly:true}},complete:async e=>{seen.push(e);return {text:JSON.stringify(seen.length===1?plan:{assistant:{kind:'practice',plan:{version:1,title:'Raster',actions:[{kind:'ui',action:'click',target:'ui:tool:array'},{kind:'ui',target:'ui:id:array-kind',action:'choose',value:'grid'}]}}}),data:{usage:{input_tokens:11,output_tokens:3}}};}});
 assert.equal(seen.length,2);assert(seen[1].user.includes('array-columns'));assert(seen[1].user.includes('not executed'));assert.equal(reply.data.usage.input_tokens,22);assert.equal(reply.data.toolReferences[0].source,'planned-tool-fields');
});
test('copied standalone MCP and Python adapters return shared tool details and actual screenshot image blocks',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
 const {ACPClient}=require('../backend/mistral-acp.cjs'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-tool-reference-')),connection=path.join(directory,'connection.json'),token=crypto.randomBytes(32).toString('hex'),calls=[];
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Wf8AAAAASUVORK5CYII=';
 const server=http.createServer(async(req,res)=>{try{assert.equal(req.headers.authorization,'Bearer '+token);let body='';for await(const chunk of req)body+=chunk;const args=body?JSON.parse(body):undefined;calls.push({path:req.url,args});let value;
  if(req.url==='/v1/context')value={requestSchema:{},exportSchema:{},agentUI:{available:true,requestSchema:{}},toolReference:{version:1}};
  else if(req.url==='/v1/ui'){assert.equal(args.action,'help');value={toolReference:await reference(args.query.startsWith('tool:')?{tool:args.query}:{query:args.query})};}
  else if(req.url==='/v1/screenshot')value={dataBase64:png};else throw Error('Unexpected mutation '+req.url);
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));}catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));fs.writeFileSync(connection,JSON.stringify({url:'http://127.0.0.1:'+server.address().port,token}));fs.copyFileSync(path.join(__dirname,'../backend/mistral-mcp.cjs'),path.join(directory,'mcp.cjs'));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));assert(directory.startsWith(path.join(os.tmpdir(),'formnaro-tool-reference-')));fs.rmSync(directory,{recursive:true,force:true});});
 for(const [command,args]of [[process.execPath,[path.join(directory,'mcp.cjs'),connection]],['python',[path.join(__dirname,'../scripts/offlinecad_ai.py'),'--connection',connection,'--mcp']]]){
  const client=new ACPClient({command,args,cwd:directory,env:process.env});try{
   await client.call('initialize',{protocolVersion:'2025-11-25'});const tools=await client.call('tools/list',{});assert(tools.tools.some(x=>x.name==='offlinecad_tool_info'));
   const reply=await client.call('tools/call',{name:'offlinecad_tool_info',arguments:{tool:'array'}});assert(!reply.isError,JSON.stringify(reply));assert.equal(JSON.parse(reply.content[0].text).tool.id,'tool:array');
   const bad=await client.call('tools/call',{name:'offlinecad_tool_info',arguments:{tool:'array',query:'oops'}});assert(bad.isError);
   const screenshot=await client.call('tools/call',{name:'offlinecad_screenshot',arguments:{}});assert.deepEqual(screenshot.content,[{type:'image',mimeType:'image/png',data:png}]);
  }finally{await client.stop();}
 }
 assert.equal(calls.filter(x=>x.path==='/v1/ui').length,2);assert(calls.every(x=>['/v1/context','/v1/ui','/v1/screenshot'].includes(x.path)));
});

test('shared lookup exposes the live selection and availability only outside practice',async()=>{
 const state={mode:'normal',selection:{count:1,targets:[{rootId:'selected-body',path:[]}]},
  targets:[{id:'tool:drawing',visible:false,disabled:true,present:true}],
  dialog:{nextAction:{blockedTarget:'ui:id:drawing-title',target:'ui:id:drawing-title-block',action:'click'}}};
 const ctx={programAssistant:{state}};
 const normal=(await reference({tool:'drawing'},ctx)).tool;
 assert.equal(normal.runtimeStatus,'disabled');
 assert.equal(normal.selection.targets[0].rootId,'selected-body');
 assert.equal(normal.activePanel.nextAction.target,'ui:id:drawing-title-block');
 const practice=(await reference({tool:'drawing'},{...ctx,practiceOnly:true})).tool;
 for(const key of ['runtimeStatus','selection','activePanel'])assert.equal(practice[key],undefined);
});
