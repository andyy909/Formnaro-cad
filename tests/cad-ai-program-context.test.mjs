import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {cadAIContext} from '../src/cad-ai-context.js';
import {cadAIRequestContext, cadAIRequestScene} from '../src/cad-ai-program-context.js';
import {exerciseCadAIUI} from './fixtures/cad-ai-ui-harness.mjs';

const require=createRequire(import.meta.url),{generate}=require('../backend/ai-provider.cjs');
const full=()=>({...cadAIContext(),localEngines:{freecad:true},programAssistant:{...cadAIContext().programAssistant,state:{mode:'solid',targets:[{id:'tool:cad-loft',present:true,visible:false,disabled:true}]}}});
const objectScene=()=>({revision:'current',selection:['locked-original'],selectionTargets:[{rootId:'locked-original',path:[]}],objects:[{id:'locked-original',target:{rootId:'locked-original',path:[]},name:'Gesperrte Platte',kind:'cad',locked:true,worldBounds:{min:[-10,-10,0],max:[10,10,6],size:[20,20,6],center:[0,0,3]},volume:2400},{id:'other',target:{rootId:'other',path:[]},name:'Anderes Teil',kind:'cad',worldBounds:{min:[20,0,0],max:[30,10,6],size:[10,10,6],center:[25,5,3]},volume:600}]});
const selectedScene=()=>({...full(),...objectScene()});

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

test('Pure program help sends only the confirmed revision and the needed selection description',()=>{
 const original=selectedScene(),before=JSON.stringify(original),compact=cadAIRequestScene(original,{programHelpOnly:true});
 assert.equal(compact.revision,original.revision);
 assert.deepEqual(compact.selection,original.selection);
 assert.deepEqual(compact.selectionTargets,original.selectionTargets);
 assert.deepEqual(compact.selectionDescription,[{target:{rootId:'locked-original',path:[]},name:'Gesperrte Platte',kind:'cad',locked:true}]);
 assert.equal(compact.objects,undefined);
 assert(JSON.stringify(compact).length<JSON.stringify(original).length/4);
 assert.equal(JSON.stringify(original),before,'Confirmed scene, revision and selection stay available for checks');
 for(const options of [undefined,{}, {programHelpOnly:false}])assert.equal(cadAIRequestScene(original,options),original);
 assert.deepEqual(cadAIRequestScene({revision:'r'},{programHelpOnly:true}),{revision:'r'});
});

test('Provider serializes compact navigation and full modelling context through the real request path',async()=>{
 const oldFetch=global.fetch,requests=[];
 global.fetch=async(_url,options)=>{requests.push(JSON.parse(options.body));return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({message:'Vorhandenes Werkzeug.'})}]}]}));};
 try{
  const scene=objectScene(),context=full(),config={protocol:'responses',baseUrl:'https://example.invalid',model:'fixture',maxOutputTokens:6000};
  for(const programHelpOnly of [true,false])await generate(config,'synthetic-key',{prompt:'Zeig mir die Schnittansicht.',context:cadAIRequestContext(context,{programHelpOnly}),scene:cadAIRequestScene(scene,{programHelpOnly}),chat:true});
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
  assert.match(requests[0].input,/Gesperrte Platte/,'Needed selection description still accompanies navigation');
  assert(!requests[0].input.includes('worldBounds'),'Geometry records are omitted from navigation');
  assert.match(requests[1].input,/"worldBounds"/,'The full modelling scene keeps its geometry records');
 }finally{global.fetch=oldFetch;}
});

test('Ordinary chat chooses navigation scope per generation, allowing safe full-contract regeneration',async()=>{
 const context=selectedScene(),scene=objectScene(),requests=[];
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
 assert.equal(navigation.scene.revision,'current');
 assert.deepEqual(navigation.scene.selectionTargets,scene.selectionTargets);
 assert.deepEqual(navigation.scene.selectionDescription,[{target:{rootId:'locked-original',path:[]},name:'Gesperrte Platte',kind:'cad',locked:true}]);
 assert.equal(navigation.scene.objects,undefined);
 assert(JSON.stringify(navigation.scene).length<JSON.stringify(scene).length,'Navigation omits the geometry records');
 assert.equal(modelling.context.programHelpOnly,undefined);
 assert.deepEqual(modelling.context.commandSchema,context.commandSchema);
 assert.deepEqual(modelling.scene,scene,'The modelling fallback sends the normal full scene again');
 assert.match(modelling.correction,/Modellbefehle wurden nicht ausgeführt/);
});
