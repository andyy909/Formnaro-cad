import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {programQuestion,searchProgramHelp} from '../src/cad-program-help.js';
import {runCadAIRequest} from '../src/cad-ai-request.js';
const require=createRequire(import.meta.url),{generate}=require('../backend/ai-provider.cjs');

test('Concrete navigation and explanation requests preserve a pending modelling task',()=>{
 for(const prompt of ['Zeig mir die Schnittansicht.','Wo ist die Schnittansicht?','Wie ändere ich das Raster?','Zeig mir Netz in CAD.','Bitte führe mich zu den KI-Verbrauchskosten.','Kannst du mir die Einstellungen zeigen?','Where is the section view?'])assert.equal(programQuestion(prompt),true,prompt);
 for(const prompt of ['Baue eine Platte mit vier Bohrungen.','Erstelle eine Platte und erkläre die Schritte.','Zeig mir ein neues Gehäuse mit vier Bohrungen.','Zeig Schritt für Schritt, wie du einen Quader 20 mal 30 mal 10 mm aufbaust.'])assert.equal(programQuestion(prompt),false,prompt);
});

test('Local help can find navigation controls already registered in the target catalogue',()=>{
 assert(searchProgramHelp('Rasterfang').some(row=>row.id==='grid'));
 assert(searchProgramHelp('KI Verbrauch').some(row=>row.id==='settings:usage'));
});

const scene={revision:'fixture',selectionTargets:[]};
const access=()=>({programOnly:true,scene:()=>scene,context:()=>({}),programAssistant:{execute:async value=>({documentation:[{label:value.query??'shown'}],ui:{mode:'normal'}})}});

for(const maxSteps of [24,80])test(`Navigation cannot spend the ${maxSteps}-step modelling budget on repeated help`,async()=>{
 let calls=0;
 await assert.rejects(runCadAIRequest({maxSteps,input:{prompt:'Wo ist die Schnittansicht?'},access:access(),generate:async()=>({revision:scene.revision,assistant:{kind:'help',query:'distinct help '+ ++calls}})}),error=>error.code==='AI_PROGRAM_HELP_BUDGET'&&/Bedienhilfe.*3|3.*Bedienhilfe/.test(error.message));
 assert.equal(calls,3);
});

test('A direct guide needs one generation; local help followed by a guide needs two',async()=>{
 for(const helpFirst of [false,true]){
  let calls=0;
  const result=await runCadAIRequest({maxSteps:24,input:{prompt:'Zeig die Schnittansicht'},access:access(),generate:async args=>{
   calls++;assert.equal(args.context.agentWorkflow.programHelp.maxRequests,3);
   return helpFirst&&calls===1?{revision:scene.revision,assistant:{kind:'help',query:'section'}}:{revision:scene.revision,assistant:{kind:'guide',steps:[{action:'point',target:'tool:section'}]},message:'Schnittansicht gezeigt.'};
  }});
  assert.equal(calls,helpFirst?2:1);assert.equal(result.message,'Schnittansicht gezeigt.');
 }
});

test('A modelling demonstration keeps its configured correction budget after a navigation prelude',async()=>{
 let calls=0,previews=0;
 const proposal={revision:scene.revision,previewId:'demo',verification:{passed:true,checks:[]}};
 const app=access();app.programAssistant.demonstrate=async()=>({proposal,commands:[{op:'create'}],report:{completed:true}});
 app.preview=async()=>{if(++previews===1)throw Object.assign(Error('Einmalige Modellkorrektur'),{code:'AI_OUTPUT_INVALID',feedback:{retryable:true}});return proposal;};
 const result=await runCadAIRequest({maxSteps:24,input:{prompt:'Erkläre und zeige ein Modell'},access:app,generate:async()=>{
  calls++;
  if(calls<=2)return {revision:scene.revision,assistant:{kind:'help',query:'stage '+calls}};
  if(calls===3)return {revision:scene.revision,commands:[{op:'create'}]};
  return {revision:scene.revision,assistant:{kind:'demonstrate',title:'Neues Teil',stages:[{text:'Teil erstellen',commands:[{op:'create'}]}]}};
 }});
 assert.equal(calls,4);assert.equal(result.proposal.previewId,'demo');
});

test('Invalid paid provider replies count toward the three navigation generations',async()=>{
 const previous=globalThis.fetch;let calls=0,charged=0;const app=access();app.context=()=>({programAssistant:{}});
 try{
  globalThis.fetch=async()=>{
   calls++;const reply={revision:scene.revision,assistant:{kind:'guide',steps:[{action:'point',target:'tool:section'}]},...(calls<3?{checks:[]}:{message:'Schnittansicht gezeigt.'})};
   return new Response(JSON.stringify({usage:{prompt_tokens:20,completion_tokens:4},choices:[{message:{content:JSON.stringify(reply)}}]}));
  };
  const result=await runCadAIRequest({maxSteps:80,input:{prompt:'Zeig die Schnittansicht'},access:app,onUsage:()=>charged++,generate:args=>generate({baseUrl:'http://localhost:9999',model:'fixture',protocol:'chat'},'',args)});
  assert.equal(calls,3);assert.equal(charged,3);assert.equal(result.message,'Schnittansicht gezeigt.');
 }finally{globalThis.fetch=previous;}
});

for(const initial of [{commands:[{op:'create',as:'untrusted'}]},{analysis:[{id:'untrusted',engine:'cad',kind:'measure'}]},{assistant:{kind:'demonstrate',title:'untrusted',stages:[{text:'untrusted',commands:[{op:'create'}]}]}}])test(`A compact navigation reply cannot execute ${Object.keys(initial)[0]} before the full modelling contract is sent`,async()=>{
 let calls=0,previews=0;const app=access();
 app.context=options=>options?.programHelpOnly?{programHelpOnly:true,programAssistant:{}}:{commandSchema:{marker:'full'}};
 app.preview=async request=>{previews++;assert.equal(request.commands[0].as,'checked');return {revision:scene.revision,previewId:'checked',verification:{passed:true,checks:[]}};};
 app.analyze=()=>{throw Error('Compact measurements must not run');};
 app.programAssistant.demonstrate=()=>{throw Error('Compact demonstrations must not run');};
 const result=await runCadAIRequest({maxSteps:24,input:{prompt:'Zeig mir ein Werkzeug'},access:app,generate:async args=>{
  if(++calls===1){assert.equal(args.context.programHelpOnly,true);return {revision:scene.revision,...initial};}
  assert.equal(args.context.commandSchema.marker,'full');assert.match(args.correction,/nicht ausgeführt/);
  return {revision:scene.revision,commands:[{op:'create',as:'checked'}]};
 }});
 assert.equal(calls,2);assert.equal(previews,1);assert.equal(result.proposal.previewId,'checked');
});
