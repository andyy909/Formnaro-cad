const test=require('node:test'),assert=require('node:assert/strict');const {generate}=require('../backend/ai-provider.cjs');
const practice={revision:'r1',assistant:{kind:'practice',plan:{version:1,title:'Lochplatte',actions:[{kind:'shape',type:'box',as:'base'},{kind:'shape',type:'cylinder',as:'hole'},{kind:'role',value:'hole'},{kind:'select',targets:['base','hole']},{kind:'group',as:'result'}]}},message:'Eine Übung im eigenen Fenster.'};
for(const protocol of ['responses','chat'])test('short isolated practice system uses only its bounded plan '+protocol,async()=>{
 const original=globalThis.fetch;let body;
 try{globalThis.fetch=async(_url,options)=>{body=JSON.parse(options.body);const text=JSON.stringify(practice);return new Response(JSON.stringify({usage:{input_tokens:100,output_tokens:100,prompt_tokens:100,completion_tokens:100},output:[{type:'message',content:[{type:'output_text',text}]}],choices:[{message:{content:text}}]}));};
  const result=await generate({baseUrl:'http://localhost:9999',model:'fixture',protocol},'',{prompt:'Zeig im Übungsfenster eine Platte',chat:true,context:{practiceOnly:true,programAssistant:{reply:'FULL_SCHEMA_SECRET_MARKER'},commandSchema:'X'.repeat(200000)},scene:{revision:'r1',objects:[],selectionTargets:[]},modelingContext:'PRIVATE_PERSONAL_NOTES_MARKER'});
  const system=protocol==='responses'?body.instructions:body.messages[0].content;
  assert(system.length<14000,'practice request system stays short');assert.doesNotMatch(system,/FULL_SCHEMA_SECRET_MARKER|PRIVATE_PERSONAL_NOTES_MARKER/);assert.match(system,/practice/i);assert.match(system,/shape/);assert.match(system,/group/);assert.match(system,/50/);assert.match(system,/separate|isolated/i);assert.equal(result.assistant.kind,'practice');assert.equal(result.assistant.plan.actions.length,5);
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
