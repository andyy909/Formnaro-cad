import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {aiFeedback,correctionFeedback} from '../src/ai-feedback.js';
import {runCadAIRequest as run} from '../src/cad-ai-request.js';
const require=createRequire(import.meta.url),{generate}=require('../backend/ai-provider.cjs');
test('Trusted rules accompany all three attempts in both protocols, with and without conversation',async()=>{
 const original=global.fetch;
 try{for(const protocol of ['chat','responses'])for(const chat of [false,true]){
  const bodies=[];global.fetch=async(_url,options)=>{const body=JSON.parse(options.body);bodies.push(body);const content=JSON.stringify({revision:'current',label:'Fixture',commands:[{op:'update',target:'part',set:{size:[10,10,10]}}]});return new Response(JSON.stringify(protocol==='chat'?{choices:[{finish_reason:'stop',message:{content}}]}:{output:[{type:'message',content:[{type:'output_text',text:content}]}]}));};
  const access={scene:()=>({revision:'current',selectionTargets:[]}),context:()=>({units:'mm'}),preview:async()=>{throw Object.assign(Error('retry fixture'),{code:'INVALID_COMMAND',feedback:{commandIndex:1,target:'part',retryable:true}});}};
  await assert.rejects(run({access,input:{prompt:'Make a supported change',chat,history:[{role:'assistant',text:'Older suggestion'}]},generate:args=>generate({protocol,baseUrl:'https://api.deepseek.com',model:'deepseek-flash'},'synthetic-fixture',args)}),/retry fixture/);
  assert.equal(bodies.length,3);
  for(const body of bodies){const system=body.instructions??body.messages[0].content;assert.match(system,/Formnaro-working-rules\/1/);assert.match(system,/worldAxisSize/);assert.match(system,/one-based commandIndex/);assert.match(system,/Never auto-Apply/);assert.match(system,/NETZ:|CAD:/);}
  for(const body of bodies.slice(1)){const payload=JSON.stringify(body);assert.match(payload,/retryable/);assert.match(payload,/rejectedBatch/);}
 }}finally{global.fetch=original;}
});
test('Every CAD request receives Formnaro-specific guidance and the STL conversion limitation',async()=>{
 const original=global.fetch,bodies=[];
 try{global.fetch=async(_url,options)=>{bodies.push(JSON.parse(options.body));return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({message:'ok'})}]}]}));};
  for(let i=0;i<2;i++)await generate({protocol:'responses',baseUrl:'https://api.deepseek.com',model:'deepseek-flash'},'synthetic-key',{prompt:'Erkläre Netz in CAD',scene:{revision:'current'},context:{},chat:true});
  for(const body of bodies){assert.match(body.instructions,/Formnaro-Assistent: Programm- und Bedienregeln/);assert.match(body.instructions,/garantiert keine parametrisch bearbeitbaren Skizzen/);}
 }finally{global.fetch=original;}
});
test('Explicit non-retryable feedback ends correction immediately',async()=>{
 let calls=0;await assert.rejects(run({input:{},access:{scene:()=>({revision:'current'}),context:()=>({}),preview:()=>{throw Object.assign(Error('blocked'),{feedback:{retryable:false}});}},generate:async()=>{calls++;return {commands:[{op:'update'}]};}}),/blocked/);assert.equal(calls,1);
 assert.equal(aiFeedback({code:'CAD_REEXTRACT_REQUIRED',message:'protected'}).retryable,false);
 assert.equal(aiFeedback({code:'LOCKED_CAD_OBJECT',message:'locked'}).retryable,false);
});
test('Rejected proposals are bounded valid JSON and exclude bulk/secret-bearing properties',()=>{
 const commands=Array.from({length:200},()=>({op:'update',target:{rootId:'part',path:['child']},set:{size:[10,10,10],brep:'PRIVATE_BREP',image:'PRIVATE_IMAGE',apiKey:'PRIVATE_KEY'},geometry:'PRIVATE_MESH'}));
 const text=correctionFeedback(Object.assign(Error('invalid'),{code:'INVALID_COMMAND',feedback:{commandIndex:2,field:'set.size',value:[-1,10,10],range:{min:.01,max:10000}}}),{revision:'current',commands});
 assert.ok(text.length<10000);const payload=JSON.parse(text.split('\n')[1]);assert.equal(payload.feedback.commandIndex,2);assert.deepEqual(payload.feedback.range,{min:.01,max:10000});assert.equal(payload.rejectedBatch.truncated,true);assert.equal(payload.rejectedBatch.commands[0].target.path[0],'child');assert.doesNotMatch(text,/PRIVATE_/);
});
