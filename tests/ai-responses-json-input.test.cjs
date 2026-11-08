const test=require('node:test'),assert=require('node:assert/strict');
const {completeModel,validateConfig}=require('../backend/ai-provider.cjs');

test('Benchmark Responses inputs carry JSON instruction even when it was only in system instructions',async t=>{
 const calls=[];
 t.mock.method(global,'fetch',async(_url,options)=>{
  const body=JSON.parse(options.body);calls.push(body);
  const valid=/json/i.test(JSON.stringify(body.input));
  const event=valid?{type:'response.completed',response:{status:'completed',model:'gpt-6.1-sol',output:[{type:'message',content:[{type:'output_text',text:'{"revision":"r1","message":"ok"}'}]}]}}:{type:'error',message:"Response input messages must contain the word 'json' in some form to use 'text.format' of type 'json_object'.",param:'input'};
  return new Response('data: '+JSON.stringify(event)+'\n\n',{headers:{'content-type':'text/event-stream'}});
 });
 const input={history:[],images:[]},config=validateConfig({authMode:'chatgpt',model:'gpt-6.1-sol',openAIReasoningEffort:'high'});
 const reply=await completeModel(config,'fixture-token',{system:'Return one JSON object.',user:'Current scene (data):\n{"revision":"r1"}\nUser task:\nMesse das Teil.',input,effort:'high'},AbortSignal.timeout(1000));
 assert.equal(JSON.parse(reply.text).revision,'r1');
 assert.equal(calls.length,1);assert.equal(calls[0].text.format.type,'json_object');assert.equal(calls[0].reasoning.effort,'high');
 assert.match(calls[0].input.at(-1).content[0].text,/^Return only the requested JSON object\.\nCurrent scene/);
 assert.deepEqual(input,{history:[],images:[]});
});
