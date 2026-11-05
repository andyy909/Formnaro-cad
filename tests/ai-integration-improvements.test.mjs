import {trackedAIAnalysis} from '../src/cad-ai-analysis-access.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import {Matrix4,Vector3} from 'three';
import {cadAIContext} from '../src/cad-ai-context.js';
import {runCadAIRequest} from '../src/cad-ai-request.js';
import {createCadController} from '../src/cad-controller.js';
import {createCadAutomationAccess} from '../src/cad-automation-access.js';
import {validateAIResultChecks,aiProposalWarning} from '../src/cad-ai-result-checks.js';
import {visualReviewInput} from '../src/cad-ai-visual-review.js';
const {providerContext}=createRequire(import.meta.url)('../backend/ai-provider-context.cjs');
const scene=()=>({revision:'r',selectionTargets:[]}),image={name:'preview.png',mimeType:'image/png',dataUrl:'data:image/png;base64,iVBORw0KGgo='};
function expandProviderDictionary(root){
 const expand=(value,chain=[])=>{if(!value||typeof value!=='object')return value;if(Array.isArray(value))return value.map(v=>expand(v,chain));if(Object.keys(value).length===1&&typeof value.$ref==='string'&&(value.$ref==='#/commandSchema'||value.$ref.startsWith('#/providerDefinitions/'))){const ref=value.$ref;assert(!chain.includes(ref),'Cyclic provider reference');const target=ref.slice(2).split('/').reduce((v,key)=>v?.[key],root);assert.notEqual(target,undefined,'Missing provider reference: '+ref);return expand(target,[...chain,ref]);}return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,expand(v,chain)]));};
 const {providerDefinitions,providerEncoding,...contract}=root;return expand(contract);
}

test('Provider dictionary reconstructs distinct command and request schemas without data loss',()=>{
 const c=cadAIContext(),p=providerContext(c);assert.deepEqual(expandProviderDictionary(p),c);assert.deepEqual(c.requestSchema.properties.commands,c.commandSchema.properties.commands);assert.deepEqual(c.requestSchema.properties.responseDetail.enum,['summary','full']);assert(JSON.stringify(c).length-JSON.stringify(p).length>100000);assert(!c.sketchContract.includes('No persistent'));assert.match(c.sketchContract,/Version3/);
 const damaged=structuredClone(p);delete damaged.providerDefinitions[Object.keys(damaged.providerDefinitions)[0]];assert.throws(()=>expandProviderDictionary(damaged),/Missing provider reference/);
 const different={commandSchema:{a:1},requestSchema:{b:2}};assert.equal(providerContext(different),different);
});

test('All failed measured values reach correction with immutable requirements',async()=>{
 let n=0,feedback;const checks=[{kind:'volume',target:'x',expected:50},{kind:'solids',target:'x',expected:1}];
 const r=await runCadAIRequest({input:{},access:{scene,context:()=>({}),preview:async()=>n===1?{previewId:'p',verification:{passed:false,checks:checks.map((c,i)=>({...c,passed:false,error:{code:'AI_RESULT_MISMATCH',message:'mismatch'},feedback:{checkIndex:i+1,checkKind:c.kind,expected:c.expected,actual:i?2:65}}))}}:{previewId:'q',verification:{passed:true}},discard(){}},generate:async args=>{if(n++)feedback=args.correction;return {revision:'r',commands:[],...(n===1?{checks}:{})};}});
 assert.equal(r.correctionAttempts,1);const data=JSON.parse(feedback.split('\n')[1]);assert.deepEqual(data.feedback.failures.map(f=>f.actual),[65,2]);assert.deepEqual(r.checks,checks);
});

test('Analysis passes the request budget and clears its busy state after a failed measurement',async()=>{
 const requests=[{id:'measure',engine:'cad',kind:'bounds'}],options={reportBudget:2048,allowIntermediate:true},states=[],failure=Error('Measurement failed');
 const analyze=trackedAIAnalysis(async(actual,actualOptions)=>{assert.equal(actual,requests);assert.deepEqual(actualOptions,options);throw failure;},value=>states.push(value));
 await assert.rejects(analyze(requests,options),error=>error===failure);assert.deepEqual(states,[true,false]);
});

test('Visual review receives measured uncommitted candidate; correction reruns pinned checks and review',async()=>{
 let calls=0,previews=0,inspections=0;const discarded=[],check={kind:'size',target:'$p',space:'edit',expected:[2,3,4]};
 const access={scene,context:()=>({}),preview:async request=>{assert.deepEqual(request.checks,[check]);return {previewId:'p'+(++previews),revision:'r',verification:{passed:true,checks:[]}};},inspectPreview:async id=>{inspections++;return {previewId:id,revision:'r',images:[image],views:['four'],scope:'test'};},discard:id=>discarded.push(id)};
 const r=await runCadAIRequest({input:{prompt:'make'},access,generate:async args=>{
  calls++;if(calls===1)return {revision:'r',commands:[{op:'create'}],checks:[check]};
  assert.equal(args.images[0],image);assert.equal(args.visualFeedback.proposal.commands.length,1);
  if(calls===2)return {revision:'r',commands:[{op:'correct'}],checks:[]};
  return {revision:'r',review:{previewId:'p2',accepted:true,observations:'Four views inspected.'}};
 }});
 assert.equal(calls,3);assert.equal(previews,2);assert.equal(inspections,2);assert.equal(r.proposal.visualReview.status,'reviewed');assert.equal(r.correctionAttempts,1);assert.deepEqual(discarded,['p1']);
});

test('Visual evidence cannot approve failed dimensions, stale candidates, or cancelled work',async()=>{
 for(const mode of ['stale','cancel','failed']){
  let active=true,n=0;const discarded=[];const access={scene,context:()=>({}),discard:id=>discarded.push(id),preview:async()=>({previewId:'p',revision:'r',verification:mode==='failed'?{passed:false,checks:[{passed:false,error:{code:'AI_RESULT_MISMATCH',message:'bad size'},feedback:{retryable:true}}]}:{passed:true}}),inspectPreview:async()=>{if(mode==='cancel')active=false;return {previewId:'p',revision:mode==='stale'?'old':'r',images:[image]};}};
  const run=()=>runCadAIRequest({input:{},access,isCurrent:()=>active,generate:async()=>++n===1?{revision:'r',commands:[]}:{revision:'r',review:{previewId:'p',accepted:true,observations:'looks good'}}});
  if(mode==='failed'){const r=await run();assert.equal(r.proposal.verification.passed,false);assert.notEqual(r.proposal.visualReview?.status,'reviewed');}
  else {await assert.rejects(run());assert.deepEqual(discarded,['p']);}
 }
});

test('Visual review never drops existing user images to make space',()=>{
 const input={images:Array(8).fill(image)};assert.throws(()=>visualReviewInput(input,{commands:[]},{previewId:'p',revision:'r'},{images:[image]}),/kein Platz/);assert.equal(input.images.length,8);
});

test('A failed final visual request retains the usable candidate with an honest acceptance warning',async()=>{
 let calls=0;const discarded=[];
 const r=await runCadAIRequest({input:{},access:{scene,context:()=>({}),preview:async()=>({previewId:'usable',revision:'r',verification:{passed:true,checks:[]}}),inspectPreview:async()=>({previewId:'usable',revision:'r',images:[image],views:['four']}),discard:id=>discarded.push(id)},generate:async()=>{if(++calls===1)return {revision:'r',commands:[]};throw Error('Review service unavailable');}});
 assert.equal(r.proposal.previewId,'usable');assert.equal(r.proposal.verification.passed,true);assert.equal(r.proposal.visualReview.status,'incomplete');assert.match(aiProposalWarning(r.proposal),/Review service unavailable/);assert.deepEqual(discarded,[]);
});

test('Actual UI analysis adapter delivers both bounded reports without a repair round',async()=>{
 let calls=0,delivered=0;const budgets=[],states=[];
 const analyze=trackedAIAnalysis(async(q,{reportBudget=14000}={})=>{budgets.push(reportBudget);return {results:[{id:q[0].id,value:'m'.repeat(Math.min(12500,reportBudget-1200))}]};},v=>states.push(v));
 await runCadAIRequest({input:{},access:{scene,context:()=>({}),analyze},onCorrection:()=>assert.fail('No correction needed'),generate:async args=>{
  delivered=args.analysisResults?.length??0;calls++;
  return calls===1?{revision:'r',analysis:[{id:'catalog',engine:'cad',kind:'bounds',options:{ids:Array.from({length:450},(_,i)=>'part-'+String(i).padStart(16,'0'))}}]}:calls===2?{revision:'r',analysis:[{id:'detail',engine:'cad',kind:'bounds'}]}:{message:'done'};
 }});
 assert.equal(delivered,2);assert.equal(budgets[0],14000);assert(budgets[1]<7000);assert.deepEqual(states,[true,false,true,false]);
});

test('Both provider protocols retain request options, preview images and bound review identity',async()=>{
 const {generate}=createRequire(import.meta.url)('../backend/ai-provider.cjs'),original=globalThis.fetch;
 try{for(const protocol of ['responses','chat']){
  globalThis.fetch=async(url,options)=>{const b=JSON.parse(options.body),system=b.instructions??b.messages[0].content;assert(system.includes('"requestSchema":'));assert(system.includes('"responseDetail":'));assert(system.includes('"intermediateDisplay":'));const content=protocol==='responses'?b.input.at(-1).content:b.messages.at(-1).content;assert(content.some(c=>c.type==='input_image'||c.type==='image_url'));const answer={revision:'r',review:{previewId:'p',accepted:true,observations:'checked'}};return new Response(JSON.stringify(protocol==='responses'?{output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(answer)}]}]}:{choices:[{message:{content:JSON.stringify(answer)}}]}));};
  const r=await generate({protocol,baseUrl:'http://127.0.0.1/v1',model:'fixture'},'',{prompt:'make',scene:scene(),context:cadAIContext(),images:[image],visualFeedback:{previewId:'p',revision:'r'}},new AbortController().signal);assert.equal(r.review.previewId,'p');assert.equal(r.review.accepted,true);
 }}finally{globalThis.fetch=original;}
});

function controller(){return createCadController({createWorker:()=>{const w=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),a={postMessage:d=>w.postMessage(d),terminate:()=>w.terminate()};w.on('message',d=>a.onmessage?.({data:d}));w.on('error',e=>a.onerror?.(e));return a;}});}
test('Native bore proves diameter, endpoints and continuous wall; rejects wrong diameter/depth/axis and insufficient wall',async()=>{
 const cad=controller();try{
  const before=cad.serialize(),p=await cad.preview({kind:'batch',commands:[{op:'create',type:'box',size:[30,30,10],pos:[0,0,5],as:'plate'},{op:'create',type:'cylinder',size:[6,6,14],pos:[0,0,5],solid:false,as:'hole'},{op:'group',targets:['$plate','$hole'],as:'body'}]});
  const c={kind:'bore',target:'$body',from:[0,0,0],to:[0,0,10],diameter:6,minWall:1};
  const r=await cad.checkPreview(p.previewId,[c]);assert.equal(r.checks[0].actual.diameter,6);assert.equal(r.checks[0].actual.depth,10);assert.equal(r.checks[0].actual.surroundingMaterial,true);assert.equal(cad.serialize(),before);
  for(const bad of [{diameter:8},{to:[0,0,9]},{from:[1,0,0],to:[1,0,10]},{minWall:14}])await assert.rejects(cad.checkPreview(p.previewId,[{...c,...bad}]),{code:'AI_RESULT_MISMATCH'});
  cad.apply({previewId:p.previewId,revision:p.revision});const base=cad.snapshot(),m=new Matrix4().makeRotationY(.61).setPosition(12,-8,3);base.nodes[0].transform=m.toArray();await cad.open(base);
  const measured=await cad.analyze([{id:'bore',engine:'cad',kind:'bore',options:{...c,kind:undefined,target:base.nodes[0].id,from:new Vector3(...c.from).applyMatrix4(m).toArray(),to:new Vector3(...c.to).applyMatrix4(m).toArray()}}].map(q=>{delete q.options.kind;return q;}));assert.equal(measured.results[0].value.diameter,6);
  const q=await cad.preview({kind:'batch',commands:[{op:'update',target:base.nodes[0].id,set:{name:'rotated'}}]});
  const point=a=>new Vector3(...a).applyMatrix4(m).toArray(),rotated=await cad.checkPreview(q.previewId,[{...c,target:base.nodes[0].id,from:point(c.from),to:point(c.to)}]);assert(Math.abs(rotated.checks[0].actual.depth-10)<1e-7);
  assert.throws(()=>validateAIResultChecks([{...c,minWall:.001}]),{code:'AI_CHECK_INVALID'});
 }finally{cad.dispose();}
});

test('Rejected STL repair explains solid prerequisite and stops futile automatic retries',async()=>{
 const {runModelConversion}=await import('../src/cad-ai-local-tools.js'),{createCadProject}=await import('../src/cad-project.js');
 const project=createCadProject({version:8,nodes:[{id:'mesh',name:'synthetic',kind:'mesh',layerId:'default',folderId:null,transform:new Matrix4().toArray(),meshRole:'solid',mesh:{verts:[0,0,0,1,0,0,0,1,0,0,0,1],triangles:[0,2,1,0,1,3,1,2,3,2,0,3]}}]});
 const before=JSON.stringify(project);let calls=0;
 await assert.rejects(runModelConversion({project,target:{rootId:'mesh',path:[]},action:'convert',desktop:{analyseStl(){},async convertStl(){calls++;throw Error('Netzreparatur abgelehnt: Formabweichung 3 mm (Reparaturbudget 0.15 mm).');}}}),e=>e.code==='CAD_CONVERTER_REPAIR_REJECTED'&&e.feedback.retryable===true&&e.feedback.toolFailure.scope==='converter-only'&&e.feedback.toolFailure.retrySameTool===false&&e.message.includes('geschlossenes mannigfaltiges Netz'));
 assert.equal(calls,1);assert.equal(JSON.stringify(project),before);
});

test('A hollow cylindrical body distinguishes the inner bore from its coaxial outer wall',async()=>{
 const cad=controller();try{
  const p=await cad.preview({kind:'batch',commands:[{op:'create',type:'cylinder',as:'outside',size:[20,20,10],pos:[0,0,5]},{op:'create',type:'cylinder',as:'inside',size:[6,6,14],pos:[0,0,5],solid:false},{op:'group',targets:['$outside','$inside'],as:'tube'}]});
  const r=await cad.checkPreview(p.previewId,[{kind:'bore',target:'$tube',from:[0,0,0],to:[0,0,10],diameter:6,minWall:1}]);assert.equal(r.checks[0].actual.diameter,6);assert.equal(r.checks[0].actual.surroundingMaterial,true);
 }finally{cad.dispose();}
});

test('Normal chat fits and sees the viewport, then sees and revises a draft before Apply',async()=>{
 let fits=0,previews=0,calls=0;const discarded=[];
 const commands=[{op:'create',type:'box'}],revised=[{op:'create',type:'cylinder'}];
 const access={scene,context:()=>({}),fitView:()=>{fits++;},
  screenshot:async()=>({mimeType:'image/png',dataBase64:image.dataUrl.split(',')[1]}),
  preview:async()=>({previewId:'draft'+ ++previews,revision:'r'}),
  inspectPreview:async id=>({previewId:id,revision:'r',views:['iso'],images:[image]}),
  discard:id=>discarded.push(id)};
 const result=await runCadAIRequest({input:{modelChecks:false},access,generate:async args=>{
  assert.deepEqual(args.context.viewContract.actions,['fit','screenshot','candidate']);
  switch(++calls){
   case 1:return {revision:'r',view:'fit'};
   case 2:assert.equal(args.context.viewFeedback.action,'fit');return {revision:'r',view:'screenshot'};
   case 3:assert.equal(args.images[0].dataUrl,image.dataUrl);return {revision:'r',commands,view:'candidate'};
   case 4:assert.deepEqual(args.context.viewFeedback.commands,commands);assert.equal(args.images[0].dataUrl,image.dataUrl);return {revision:'r',commands:revised};
   default:assert.fail('Unexpected extra provider call');
  }
 }});
 assert.equal(fits,2);assert.equal(result.proposal.previewId,'draft2');assert.deepEqual(result.commands,revised);assert.deepEqual(discarded,['draft1']);
});

test('View requests omit image actions for text-only models and reject stale replies',async()=>{
 let fits=0;
 const access={scene,context:()=>({}),fitView:()=>{fits++;},screenshot:()=>assert.fail('unexpected image')};
 await assert.rejects(runCadAIRequest({input:{modelChecks:false},visualReview:false,access,maxCorrections:0,generate:async args=>{
  assert.deepEqual(args.context.viewContract.actions,['fit']);return {revision:'stale',view:'fit'};
 }}),/Ungültige KI-Ansichtsanfrage/);
 assert.equal(fits,0);
});

test('Desktop provider preserves a requested candidate image and rejects mixed camera operations',async()=>{
 const {generate}=createRequire(import.meta.url)('../backend/ai-provider.cjs'),original=globalThis.fetch;
 const config={protocol:'chat',baseUrl:'http://127.0.0.1/v1',model:'fixture'};
 const context={viewContract:{actions:['fit','candidate'],reply:'Request candidate views when needed.'}};
 let answer={revision:'r',view:'candidate',commands:[{op:'create',type:'box'}]};
 try{
  globalThis.fetch=async(_url,options)=>{
   assert.match(JSON.parse(options.body).messages[0].content,/viewContract/);
   return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(answer)}}]}));
  };
  const run=()=>generate(config,'',{prompt:'make',scene:scene(),context},new AbortController().signal);
  assert.equal((await run()).view,'candidate');
  answer={revision:'r',view:'fit'};
  assert.equal((await run()).view,'fit');
  answer.commands=[];
  await assert.rejects(run(),/Invalid camera action/);
 }finally{globalThis.fetch=original;}
});

test('Navigation chat can request a viewport image without gaining draft tools',async()=>{
 let calls=0;
 const access={scene,programOnly:true,context:()=>({programHelpOnly:true}),fitView:()=>{},inspectPreview:()=>assert.fail('unexpected draft'),
  screenshot:async()=>({mimeType:'image/png',dataBase64:image.dataUrl.split(',')[1]})};
 const result=await runCadAIRequest({input:{},access,generate:async args=>{
  assert.deepEqual(args.context.viewContract.actions,['fit','screenshot']);
  if(++calls===1)return {revision:'r',view:'screenshot'};
  assert.equal(args.context.viewFeedback.status,'completed');
  assert.equal(args.images[0].dataUrl,image.dataUrl);
  return {message:'Bild erhalten'};
 }});
 assert.equal(result.message,'Bild erhalten');
});

test('confirmed viewport capture rejects an open preview and binds the returned image to the model revision',async()=>{
 let revision='r',scope=1,busy=false,afterCapture;
 const dataBase64=image.dataUrl.split(',')[1];
 const access=createCadAutomationAccess({controller:{revision:()=>revision,projectScope:()=>scope},isBusy:()=>busy,
  screenshot:async options=>{assert.deepEqual(options,{confirmed:true});afterCapture?.();return image.dataUrl;}});
 assert.deepEqual(await access.confirmedScreenshot('r'),
  {revision:'r',mimeType:'image/png',dataBase64,source:'confirmed-model',applied:true});
 busy=true;
 await assert.rejects(access.confirmedScreenshot('r'),{code:'BUSY'});
 busy=false;afterCapture=()=>{scope++;};
 await assert.rejects(access.confirmedScreenshot('r'),{code:'STALE_REVISION'});
 afterCapture=()=>{revision='new';};
 await assert.rejects(access.confirmedScreenshot('r'),{code:'STALE_REVISION'});
});

test('a confirmed view reports the applied revision with its image and cannot be requested as an exercise view',async()=>{
 let calls=0;
 const access={scene,context:()=>({}),programOnly:true,fitView:()=>{},
  confirmedScreenshot:async revision=>({revision,mimeType:'image/png',dataBase64:image.dataUrl.split(',')[1],source:'confirmed-model',applied:true})};
 const result=await runCadAIRequest({input:{},access,generate:async args=>{
  assert.deepEqual(args.context.viewContract.actions,['fit','confirmed']);
  if(++calls===1)return {revision:'r',view:'confirmed'};
  assert.deepEqual(args.context.viewFeedback,{action:'confirmed',status:'completed',source:'confirmed-model',revision:'r',applied:true});
  assert.equal(args.images[0].dataUrl,image.dataUrl);
  return {message:'Bestätigtes Bild erhalten'};
 }});
 assert.equal(result.message,'Bestätigtes Bild erhalten');
 await runCadAIRequest({input:{},access:{...access,practiceRequested:true},generate:async args=>{
  assert.equal(args.context.viewContract,undefined);
  return {message:'Übung ohne Hauptfensterbild'};
 }});
});

test('blind bore check proves material beyond the directed bore end',async()=>{
 const cad=controller();
 try{
  const p=await cad.preview({kind:'batch',commands:[
   {op:'create',type:'box',size:[30,30,10],pos:[0,0,5],as:'plate'},
   {op:'create',type:'cylinder',size:[6,6,8],pos:[0,0,9],solid:false,as:'hole'},
   {op:'group',targets:['$plate','$hole'],as:'body'}
  ]});
  const c={kind:'bore',target:'$body',from:[0,0,10],to:[0,0,5],diameter:6,minWall:1,minBottom:4};
  const passed=await cad.checkPreview(p.previewId,[c]);
  assert.equal(passed.checks[0].actual.bottomPresent,true);
  for(const bad of [{minBottom:6},{from:c.to,to:c.from}]){
   await assert.rejects(cad.checkPreview(p.previewId,[{...c,...bad}]),e=>e.code==='AI_RESULT_MISMATCH'&&e.feedback.actual.bottomPresent===false);
  }
 }finally{cad.dispose();}
});

test('large AI scene uses the exact selected source path and omits unrelated recipes',async()=>{
 const target={rootId:'assembly',path:['spindle']};
 const selected={id:'spindle',target,name:'Spindel',kind:'cad'};
 const root={id:'assembly',target:{rootId:'assembly',path:[]},name:'Assembly',kind:'cad',recipe:{data:'x'.repeat(710000)}};
 const scene={revision:'r1',objects:[root,selected]};
 const project={nodes:[]};
 const access=createCadAutomationAccess({controller:{revision:()=>scene.revision,readSnapshot:()=>project},getScene:()=>scene,getSelection:()=>[target],refresh:async()=>{}});
 assert.deepEqual(access.chatSelection(),['Spindel']);
 const result=await access.sceneForAI();
 assert.deepEqual(result.objects,[selected]);
 assert.deepEqual(result.selectionTargets,[target]);
 assert.equal(result.scope.totalObjects,2);
});
