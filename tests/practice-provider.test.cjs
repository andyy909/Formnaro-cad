const test=require('node:test'),assert=require('node:assert/strict');const {generate}=require('../backend/ai-provider.cjs');
const practice={revision:'r1',assistant:{kind:'practice',plan:{version:1,title:'Lochplatte',actions:[{kind:'shape',type:'box',as:'base'},{kind:'shape',type:'cylinder',as:'hole'},{kind:'role',value:'hole'},{kind:'select',targets:['base','hole']},{kind:'group',as:'result'}]}},message:'Eine Übung im eigenen Fenster.'};
test('separate practice requests never reuse the main or an earlier practice provider conversation',async()=>{
 const ids=[],config={authMode:'mistral-vibe',baseUrl:'https://api.mistral.ai/v1',model:'fixture',protocol:'chat'},options={mistralComplete:async e=>{ids.push(e.conversationId);return {text:'{"message":"OK"}',usage:{input_tokens:1,output_tokens:1}};}};
 for(const practiceOnly of [true,true,false])await generate(config,'',{prompt:'Test',chat:true,conversationId:'same-main-chat',context:{practiceOnly},scene:{revision:'r1'}},undefined,options);
 assert.match(ids[0],/^practice-/);assert.match(ids[1],/^practice-/);assert.notEqual(ids[0],ids[1]);assert.equal(ids[2],'same-main-chat');
});
test('task-locked practice excludes parent data even on a modelling-detail lookup',async()=>{
 const old=globalThis.fetch,requests=[];try{globalThis.fetch=async(_url,options)=>{const body=JSON.parse(options.body);requests.push(body);return new Response(JSON.stringify({usage:{input_tokens:7,output_tokens:3},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(requests.length===1?{toolReference:{section:'modeling'}}:{message:'UI only'})}]}]}));};
  const result=await generate({baseUrl:'http://localhost:9999',model:'fixture',protocol:'responses'},'',{prompt:'Übungsmodus',chat:true,context:{practiceOnly:true,toolReference:{version:1},programAssistant:{state:{selection:'PARENT_SELECTION'}},commandSchema:{secret:'UNRESTRICTED_COMMANDS'},agentUI:{state:{field:'PARENT_FIELD'},targets:[],layoutContext:'PARENT_LAYOUT'},featureScope:{secret:'PARENT_FEATURE'}},scene:{revision:'r1',objects:[{name:'PARENT_OBJECT'}]},history:[{role:'user',text:'PARENT_CHAT'}],modelingContext:'PARENT_NOTES'});
  assert.equal(requests.length,2);assert.doesNotMatch(JSON.stringify(requests),/PARENT_|UNRESTRICTED_COMMANDS/);assert.match(requests[1].input,/practice-ui-contract/);assert.equal(result.usage.inputTokens,14);
 }finally{globalThis.fetch=old;}
});
for(const protocol of ['responses','chat'])test('isolated practice locks UI construction and excludes unrestricted/parent context '+protocol,async()=>{
 const original=globalThis.fetch;let body;
 try{globalThis.fetch=async(_url,options)=>{body=JSON.parse(options.body);const text=JSON.stringify(practice);return new Response(JSON.stringify({usage:{input_tokens:100,output_tokens:100,prompt_tokens:100,completion_tokens:100},output:[{type:'message',content:[{type:'output_text',text}]}],choices:[{message:{content:text}}]}));};
  const result=await generate({baseUrl:'http://localhost:9999',model:'fixture',protocol},'',{prompt:'Zeig im Übungsfenster eine Platte',chat:true,context:{practiceOnly:true,programAssistant:{reply:'FULL_SCHEMA_SECRET_MARKER'},commandSchema:'X'.repeat(200000)},scene:{revision:'r1',objects:[],selectionTargets:[]},modelingContext:'PRIVATE_PERSONAL_NOTES_MARKER'});
  const system=protocol==='responses'?body.instructions:body.messages[0].content;
  assert.doesNotMatch(system,/X{100}|FULL_SCHEMA_SECRET_MARKER|PRIVATE_PERSONAL_NOTES_MARKER/);assert.match(system,/VISIBLE USER INTERFACE/);assert.match(system,/shape/);assert.match(system,/group/);assert.match(system,/gear-create/);assert.match(system,/scripts/);assert.match(system,/50/);assert.match(system,/separate|isolated/i);assert.equal(result.assistant.kind,'practice');assert.equal(result.assistant.plan.actions.length,5);
 }finally{globalThis.fetch=original;}
});
test('normal model and converter requests retain their own contexts even with different markers',async()=>{
 const old=globalThis.fetch;let body;
 try{globalThis.fetch=async(_url,options)=>{body=JSON.parse(options.body);return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({message:'OK'})}]}]}));};
  const config={baseUrl:'http://localhost:9999',model:'fixture',protocol:'responses'};
  await generate(config,'',{prompt:'Erstelle ein Modell',chat:true,context:{commandSchema:'CAD_SCHEMA_MARKER'},scene:{revision:'r1'},modelingContext:'PERSONAL_REFERENCE'});
  assert.match(body.instructions,/CAD_SCHEMA_MARKER/);assert.match(body.instructions,/PERSONAL_REFERENCE/);assert.doesNotMatch(body.instructions,/Allowed actions, in order/);
  await generate(config,'',{prompt:'Konverter',domain:'converter',chat:true,context:{practiceOnly:true,converterMarker:'CONVERTER_SCHEMA_MARKER'},scene:{revision:'r1'}});
  assert.match(body.instructions,/CONVERTER_SCHEMA_MARKER/);assert.doesNotMatch(body.instructions,/Allowed actions, in order/);
 }finally{globalThis.fetch=old;}
});
