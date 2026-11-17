import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {cadAIContext} from '../src/cad-ai-context.js';
import {cadAIRequestContext} from '../src/cad-ai-program-context.js';
import {exerciseCadAIUI} from './fixtures/cad-ai-ui-harness.mjs';

const require=createRequire(import.meta.url),{generate}=require('../backend/ai-provider.cjs');
const full=()=>({...cadAIContext(),localEngines:{freecad:true},programAssistant:{...cadAIContext().programAssistant,state:{mode:'solid',targets:[{id:'tool:cad-loft',present:true,visible:false,disabled:true}]}}});

test('Navigation transmits the actual catalogue and UI state without native command schemas',()=>{
 const original=full(),before=JSON.stringify(original),compact=cadAIRequestContext(original,{programHelpOnly:true});
 assert.equal(compact.programHelpOnly,true);
 assert.deepEqual(compact.programAssistant.catalogue,original.programAssistant.catalogue);
 assert.deepEqual(compact.programAssistant.state,original.programAssistant.state);
 assert.deepEqual(compact.localEngines,original.localEngines);
 for(const field of ['commandSchema','requestSchema','programTools','analysisContract','resultChecks','examples'])assert.equal(compact[field],undefined,field);
 assert(JSON.stringify(compact).length<JSON.stringify(original).length*.12);
 assert.equal(JSON.stringify(original),before,'Original modelling contract remains untouched');
});

test('Normal model requests and full-context fallback retain the complete command contract',()=>{
 const original=full();
 for(const options of [undefined,{}, {programHelpOnly:false}])assert.equal(cadAIRequestContext(original,options),original);
 assert.equal(cadAIRequestContext({version:1},{programHelpOnly:true}).programHelpOnly,undefined);
});

test('Provider serializes compact navigation and full modelling context through the real request path',async()=>{
 const oldFetch=global.fetch,requests=[];
 global.fetch=async(_url,options)=>{requests.push(JSON.parse(options.body));return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({message:'Vorhandenes Werkzeug.'})}]}]}));};
 try{
  const scene={revision:'current',selectionTargets:[{rootId:'locked-original'}],objects:[]},context=full(),config={protocol:'responses',baseUrl:'https://example.invalid',model:'fixture',maxOutputTokens:6000};
  for(const programHelpOnly of [true,false])await generate(config,'synthetic-key',{prompt:'Zeig mir die Schnittansicht.',context:cadAIRequestContext(context,{programHelpOnly}),scene,chat:true});
  const [navigation,modelling]=requests.map(r=>r.instructions);
  assert(navigation.length<modelling.length,'Navigation omits modelling schemas in the actual provider payload');
  assert.match(navigation,/"programHelpOnly":true/);
  assert.match(navigation,/"mode":"solid"/);
  assert.match(navigation,/commandSchema/); // mentioned only in the explicit scope text
  assert.match(navigation,/You are the Formnaro navigation assistant/);
  assert(!navigation.includes('You are a precise, capable CAD assistant.'));
  assert(!navigation.includes('"commandSchema":{'));
  assert(modelling.includes('"commandSchema":{'));
  assert.match(requests[0].input,/locked-original/,'Selection and scene revision still accompany navigation');
 }finally{global.fetch=oldFetch;}
});

test('Ordinary chat chooses navigation scope per generation, allowing safe full-contract regeneration',async()=>{
 const context=full(),scene={revision:'current',selectionTargets:[],objects:[]},requests=[];
 const access={
  scene:()=>scene,context:()=>context,
  preview:()=>assert.fail('A command from the compact catalogue must never be previewed'),
 };
 const programAssistant={isProgramQuestion:()=>true,context:()=>context.programAssistant};
 const desktop={
  getAISettings:async()=>({protocol:'responses',baseUrl:'https://example.invalid',model:'fixture'}),
  getFreeCADStatus:async()=>({available:true}),
  generateAI:async request=>{
   requests.push(request);
   if(requests.length===1)return {revision:scene.revision,commands:[{op:'create',type:'box'}]};
   return {revision:scene.revision,message:'Vollständigen Modelliervertrag erhalten.'};
  },
 };
 await exerciseCadAIUI({access,desktop,programAssistant},async({send})=>{
  const answer=await send({prompt:'Zeig mir die Schnittansicht.',chat:true});
  assert.equal(answer.message,'Vollständigen Modelliervertrag erhalten.');
 });
 assert.equal(requests.length,2);
 const [navigation,modelling]=requests;
 assert.equal(navigation.context.programHelpOnly,true);
 assert.deepEqual(navigation.context.programAssistant.state,context.programAssistant.state);
 assert.equal(navigation.context.commandSchema,undefined);
 assert.equal(modelling.context.programHelpOnly,undefined);
 assert.deepEqual(modelling.context.commandSchema,context.commandSchema);
 assert.match(modelling.correction,/Modellbefehle wurden nicht ausgeführt/);
});
