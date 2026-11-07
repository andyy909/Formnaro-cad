import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {runCadAIRequest} from '../src/cad-ai-request.js';import {PROGRAM_ASSISTANT_CONTRACT} from '../src/cad-program-help.js';
const require=createRequire(import.meta.url),{generate}=require('../backend/ai-provider.cjs');
const plan={version:1,title:'Platte',actions:[{kind:'shape',type:'box',as:'base'},{kind:'shape',type:'cylinder',as:'hole'},{kind:'role',value:'hole'},{kind:'select',targets:['base','hole']},{kind:'group',as:'result'}]};
const response={revision:'current',assistant:{kind:'practice',plan},message:'Die Übung ist abgeschlossen.'};
function setup(report){let calls=0,executions=0,begin=0,previews=0,discards=0,scopes=[];const scene={revision:'current',selectionTargets:[]};const access={practiceRequested:true,programOnly:true,scene:()=>scene,context:o=>{scopes.push(o);return {programAssistant:PROGRAM_ASSISTANT_CONTRACT};},beginTask:()=>{begin++;},preview:()=>{previews++;throw Error('parent preview must not run');},discard:()=>{discards++;},programAssistant:{execute:async v=>{executions++;assert.deepEqual(v,response.assistant);return report;}}};return {access,generate:async()=>{calls++;return response;},stats:()=>({calls,executions,begin,previews,discards,scopes})};}
test('practice executes once with bounded practice scope and leaves parent workspace untouched',async()=>{const s=setup({kind:'practice',ok:true,steps:5});const result=await runCadAIRequest({input:{prompt:'Zeig es im Übungsfenster'},access:s.access,generate:async args=>{assert.equal(args.context.practiceOnly,true);assert.equal(args.context.commandSchema,undefined);assert.equal(args.context.requestSchema,undefined);return s.generate(args);}});const x=s.stats();assert.equal(x.calls,1);assert.equal(x.executions,1);assert.equal(x.begin,0);assert.equal(x.previews,0);assert.equal(x.discards,0);assert.equal(result.assistantReport.kind,'practice');assert.equal(result.assistantReport.ok,true);assert.equal(result.proposal,undefined);});
test('failed practice cannot be presented as successful',async()=>{const s=setup({kind:'practice',ok:false,reason:'Übung abgebrochen'});await assert.rejects(runCadAIRequest({input:{prompt:'Zeig es im Übungsfenster'},access:s.access,generate:s.generate}),/abgebrochen|fehlgeschlagen|nicht abgeschlossen/i);assert.equal(s.stats().executions,1);assert.equal(s.stats().previews,0);});
test('drawing recovery reports the committed sheet and continues in the same practice window',async()=>{
 const s=setup({});
 const drawing={name:'Übungsblatt',views:['front','top','side'],dimensions:[{id:'width',text:'44 mm'}]};
 const fit={kind:'ui',action:'click',target:'view:fit'};
 s.access.programAssistant.execute=async(action,{continuationId})=>{
  if(!continuationId)return {ok:false,continuationId:'child',reason:'Externer Dateidialog',steps:[{drawing}],
   report:{confirmedCount:6,revision:'exercise',dialog:null,failedAction:{target:'ui:tool:save'}}};
  assert.equal(continuationId,'child');
  assert.deepEqual(action.plan.actions,[fit]);
  return {ok:true,resultRef:'checked-child'};
 };
 const result=await runCadAIRequest({input:{prompt:'Zeichnungsblatt nachführen'},access:s.access,generate:async args=>{
  if(!args.correction)return response;
  const correction=JSON.parse(args.correction);
  assert.deepEqual(correction.confirmedDrawing,drawing);
  assert.equal(correction.exerciseRevision,'exercise');
  assert.match(correction.instruction,/already saved.*view:fit/);
  return {...response,assistant:{kind:'practice',plan:{...plan,actions:[fit]}}};
 }});
 assert.equal(result.assistantReport.resultRef,'checked-child');
 assert.equal(s.stats().previews,0);
});
test('a converter diagnosis can close a failed child session without an adoptable result',async()=>{
 const diagnostic='Die Formabweichung beträgt 6 mm (Reparaturbudget 0.15 mm).';
 const s=setup({ok:false,continuationId:'child',reason:diagnostic,
  report:{confirmedCount:1,revision:'exercise',failedAction:{target:'ui:id:converter-run'}}});
 let released=0;
 s.access.programAssistant.releasePractice=async()=>{released++;};
 const result=await runCadAIRequest({input:{prompt:'Warum scheitert die STL?'},access:s.access,generate:async args=>{
  if(!args.correction)return response;
  const feedback=JSON.parse(args.correction);
  assert.equal(feedback.reason,diagnostic);
  assert.match(feedback.instruction,/return only \{"message":/);
  return {message:diagnostic};
 }});
 assert.deepEqual(result,{message:diagnostic});
 assert.equal(s.stats().executions,1);
 assert.equal(s.stats().previews,0);
 assert.equal(released,1);
});
test('isolated practice does not send personal parent-scene objects to provider',async()=>{const s=setup({kind:'practice',ok:true,steps:5});s.access.scene=()=>({revision:'current',selectionTargets:[],objects:[{id:'PARENT_PRIVATE_OBJECT',name:'PARENT_PRIVATE_OBJECT'}]});const result=await runCadAIRequest({input:{prompt:'Zeig es im Übungsfenster'},access:s.access,generate:async args=>{assert.doesNotMatch(JSON.stringify(args),/PARENT_PRIVATE_OBJECT/);assert.equal(args.scene.revision,'current');return response;}});assert.equal(result.assistantReport.ok,true);assert.equal(s.stats().previews,0);});
test('a disobedient practice provider cannot invoke model preview, measurements or a modelling demo in the parent',async()=>{
 for(const bad of [{revision:'current',commands:[{op:'create',type:'box'}]},{revision:'current',analysis:[{kind:'scene'}]},{revision:'current',assistant:{kind:'demonstrate',title:'bad',stages:[]}}]){
  const s=setup({kind:'practice',ok:true,steps:5});let demo=0,measure=0;s.access.programAssistant.demonstrate=async()=>{demo++;throw Error('must not execute');};s.access.analyze=async()=>{measure++;throw Error('must not analyze');};
  await assert.rejects(runCadAIRequest({input:{prompt:'Zeig im Übungsfenster'},access:s.access,generate:async()=>bad}));assert.equal(s.stats().previews,0);assert.equal(demo,0);assert.equal(measure,0);
 }
});
test('real provider parser accepts valid practice aliases and rejects nonexistent alias selections',async()=>{const old=globalThis.fetch;let current=response;try{globalThis.fetch=async()=>new Response(JSON.stringify({usage:{input_tokens:10,output_tokens:1},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(current)}]}]}));const args=[{baseUrl:'http://localhost:9999',model:'fixture',protocol:'responses'},'',{prompt:'Übungsfenster',context:{programAssistant:PROGRAM_ASSISTANT_CONTRACT},scene:{revision:'current'},chat:true}];const accepted=await generate(...args);assert.deepEqual(accepted.assistant.plan,plan);current={...response,assistant:{kind:'practice',plan:{...plan,actions:[{kind:'select',targets:['missing']}]}}};await assert.rejects(generate(...args),/Ungültige Übungsauswahl|Invalid program assistant/i);}finally{globalThis.fetch=old;}});

test('project practice shares only selected descriptions with the provider and gives the copy to the local runner', async () => {
 const s=setup(null);
 const objects=[{alias:'existing-1',name:'Chosen bracket',kind:'cad'}];
 const projectCopy={revision:'current',project:{nodes:[{id:'PRIVATE_ROOT',geometry:'LOCAL_GEOMETRY'}]},selection:[{rootId:'PRIVATE_ROOT',path:[]}]};
 s.access.practiceCopy={objects,projectCopy,assertCurrent:()=>{}};
 const existing={...plan,actions:[{kind:'select',targets:['existing-1']},{kind:'set',field:'size-0',value:44}]};
 let executed=0;
 s.access.programAssistant.execute=async (action,options)=>{
  executed++;
  assert.deepEqual(action.plan,existing);
  assert.equal(options.projectCopy,projectCopy);
  return {kind:'practice',ok:true};
 };
 const originalFetch=globalThis.fetch;
 let requests=0;
 try {
  globalThis.fetch=async (_url,{body})=>{
   requests++;
   assert.match(body,/Chosen bracket/);
   assert.match(body,/existing-1/);
   assert.doesNotMatch(body,/PRIVATE_ROOT|LOCAL_GEOMETRY|PRIVATE_CHAT/);
   return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({
    ...response,assistant:{kind:'practice',plan:existing}
   })}]}]}));
  };
  await runCadAIRequest({input:{prompt:'Übungsfenster',history:[{role:'user',text:'PRIVATE_CHAT'}],chat:true},access:s.access,
   generate:args=>generate({baseUrl:'http://localhost:9999',model:'fixture',protocol:'responses'},'',args)});
  assert.equal(requests,1);
  assert.equal(executed,1);
  assert.equal(s.stats().previews,0);
 } finally {globalThis.fetch=originalFetch;}
});

test('a project exercise without selected bodies describes the copy accurately to the provider',async()=>{
 const s=setup({kind:'practice',ok:true,steps:5});
 const stored=(name,base64,view,mm)=>({reference:{name,view,version:1,scale:{mm,points:[[50,30],[450,30]]}},image:{dataUrl:'data:image/png;base64,'+base64}});
 s.access.practiceCopy={objects:[],projectCopy:{revision:'current',project:{photos:{items:[
  stored('Gespeicherte Front','ZnJvbnQ=','front',40),stored('PRIVATE_PHOTO','cHJpdmF0ZQ==','top',71),
  stored('AMBIGUOUS_FIRST','c2lkZQ==','right',53),stored('AMBIGUOUS_SECOND','c2lkZQ==','right',59)
 ]}},selection:[]},assertCurrent:()=>{}};
 s.access.practiceFiles=[['Vorn.png','ZnJvbnQ='],['Seite.png','c2lkZQ=='],['Oben.png','b3RoZXI=']]
  .map(([name,base64])=>({name,base64,kind:'photo',mimeType:'image/png'}));
 const originalFetch=globalThis.fetch;
 let requests=0;
 try{
  globalThis.fetch=async (_url,{body})=>{
   requests++;
   assert.match(body,/local project copy and no selected body/);
   assert.match(body,/photo-project-multiview/);
   assert.match(JSON.parse(body).instructions,/"savedPhoto":\{"name":"Gespeicherte Front","view":"front","calibration":\{"referenceMm":40,"referencePixels":400\}\}/);
   assert.doesNotMatch(body,/practice window starts empty|PRIVATE_PHOTO|AMBIGUOUS_|ZnJvbnQ=|cHJpdmF0ZQ==/);
   return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(response)}]}]}));
  };
  await runCadAIRequest({input:{prompt:'Verbinde die Ansichten',chat:true},access:s.access,
   generate:args=>generate({baseUrl:'http://localhost:9999',model:'fixture',protocol:'responses'},'',args)});
  assert.equal(requests,1);
 }finally{globalThis.fetch=originalFetch;}
});
