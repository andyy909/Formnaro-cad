import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createCadController} from '../src/cad-controller.js';
import {createCadAutomationAccess} from '../src/cad-automation-access.js';
import {createCadDrawingSheet,cadDrawingProblems,cadDrawingSourceSignatures} from '../src/cad-drawing-data.js';
import {previewCadDrawingCommands,exportCadDrawing,validateCadDrawingCommands,CAD_DRAWING_COMMAND_SCHEMAS,cadDrawingPreviewSummary} from '../src/cad-drawing-automation.js';
import {cadAIContext} from '../src/cad-ai-context.js';

function factory(onPost){return ()=>{const worker=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),adapter={onmessage:null,onerror:null,postMessage:message=>{onPost(message);worker.postMessage(message);},terminate:()=>worker.terminate()};worker.on('message',message=>adapter.onmessage?.({data:message}));worker.on('error',error=>adapter.onerror?.(error));return adapter;};}
async function fixture(){const posts=[],cad=createCadController({createWorker:factory(message=>posts.push(message))});await cad.execute({kind:'create',recipe:{type:'box',size:[20,30,40]},options:{id:'body',name:'Original'}});let scene=await cad.describe();const access=createCadAutomationAccess({controller:cad,getScene:()=>scene,refresh:async()=>{scene=await cad.describe();},printDrawingPdf:async value=>{assert.ok(value.svg.startsWith('<svg'));assert.deepEqual([value.widthMm,value.heightMm],[297,210]);return new TextEncoder().encode('%PDF-test-local');}});return {cad,access,posts};}
const put=sheet=>({op:'drawing',action:'put',sheet}),update=sheetId=>({op:'drawing',action:'update',sheetId});

test('automatic dimension API previews reuse native caches, apply one Undo and reject stale or forged requests',async()=>{
 const {cad,access,posts}=await fixture();try{
  const sheet=createCadDrawingSheet({id:'auto-sheet',sourceIds:['body']}),first=await previewCadDrawingCommands(cad,{revision:cad.revision(),commands:[put(sheet),update(sheet.id)]});cad.apply(first);const before=cad.serialize(),depth=cad.state().undo,original=cad.snapshot().nodes;
  posts.length=0;const proposal=await access.preview({revision:cad.revision(),commands:[{op:'drawing',action:'dimension',sheetId:sheet.id,mode:'detailed'}]});assert.equal(posts.filter(p=>p.request?.query?.kind==='drawingProjection'||['rebuild','command','create'].includes(p.request?.job)).length,0);assert.equal(cad.serialize(),before);const preview=access.getPreview(proposal.previewId);assert.equal(preview.version,18);assert(preview.drawings.sheets[0].annotations.length>=3);assert(proposal.drawings.sheets[0].annotations.every(a=>Number.isFinite(a.value)));assert.deepEqual(preview.nodes,original);
  await access.apply({revision:proposal.revision,previewId:proposal.previewId});const saved=cad.serialize();assert.equal(cad.state().undo,depth+1);cad.undo();assert.equal(cad.serialize(),before);cad.redo();assert.equal(cad.serialize(),saved);
  const repeat=await previewCadDrawingCommands(cad,{revision:cad.revision(),commands:[{op:'drawing',action:'dimension',sheetId:sheet.id,mode:'detailed'}]});assert.deepEqual(repeat.project.drawings,cad.snapshot().drawings);cad.discard(repeat.previewId);
  for(const command of [{op:'drawing',action:'dimension',sheetId:sheet.id,mode:'all'},{op:'drawing',action:'dimension',sheetId:sheet.id,mode:'basic',value:12}])assert.throws(()=>validateCadDrawingCommands([command]));
  await cad.execute({kind:'batch',commands:[{op:'transform',target:'body',translate:[10,0,0]}]});await assert.rejects(previewCadDrawingCommands(cad,{revision:cad.revision(),commands:[{op:'drawing',action:'dimension',sheetId:sheet.id,mode:'basic'}]}),/aktualisieren/);
 }finally{cad.dispose();}
});

test('local drawing preview/update/apply creates one Undo and preserves all original geometry',async()=>{
 const {cad,access,posts}=await fixture();try{
  const sheet=createCadDrawingSheet({id:'sheet',sourceIds:['body'],titleBlock:{title:'Prüfteil'}}),before=cad.serialize(),original=cad.snapshot().nodes,undo=cad.state().undo;
  posts.length=0;const proposal=await access.preview({revision:cad.revision(),commands:[put(sheet),update(sheet.id)],label:'Blatt anlegen'});assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,undo);const view=access.getPreview(proposal.previewId);assert.deepEqual(view.nodes,original);assert.equal(view.version,14);assert.equal(view.drawings.sheets[0].views.length,3);assert.equal(posts.filter(p=>p.request?.query?.kind==='drawingProjection').length,3);assert.equal(posts.filter(p=>['rebuild','command','create'].includes(p.request?.job)).length,0);
  assert.equal(proposal.drawings.sheetCount,1);assert.equal(proposal.drawings.viewCount,3);assert.equal(proposal.drawings.truncated,false);assert.equal(proposal.drawings.sheets[0].paper,'A4');assert.equal(proposal.drawings.sheets[0].views[0].curves[0].kind,'line');assert.ok(proposal.drawings.sheets[0].views[0].curves.every(c=>c.id&&c.length>0));assert.equal(proposal.drawings.sourceSignatures[0].id,'body');assert.match(proposal.drawings.sourceSignatures[0].signature,/^[a-f0-9]{64}$/);
  await access.apply({revision:proposal.revision,previewId:proposal.previewId});assert.equal(cad.state().undo,undo+1);assert.deepEqual(cad.snapshot().nodes,original);assert.equal(cadDrawingProblems(cad.snapshot().drawings.sheets[0],{sourceSignatures:cadDrawingSourceSignatures(cad.snapshot())}).length,0);
  const after=cad.serialize();cad.undo();assert.equal(cad.serialize(),before);cad.redo();assert.equal(cad.serialize(),after);
  const svg=await access.export({format:'drawing-svg',sheetId:'sheet'}),dxf=await access.export({format:'drawing-dxf',sheetId:'sheet'}),pdf=await access.export({format:'drawing-pdf',sheetId:'sheet'});assert.equal(svg.mimeType,'image/svg+xml');assert.match(Buffer.from(svg.dataBase64,'base64').toString(),/width="297mm" height="210mm"/);assert.match(Buffer.from(dxf.dataBase64,'base64').toString(),/AC1015/);assert.equal(pdf.mimeType,'application/pdf');assert.match(Buffer.from(pdf.dataBase64,'base64').toString(),/^%PDF-/);assert.equal(cad.serialize(),after);
 }finally{cad.dispose();}
});

test('drawing preview summary exposes measured values and explicitly bounds curve and text payloads',async()=>{
 const {cad}=await fixture();try{
  const sheet=createCadDrawingSheet({id:'sheet',sourceIds:['body']}),preview=await previewCadDrawingCommands(cad,{revision:cad.revision(),commands:[put(sheet),update('sheet')]}),project=preview.project,stored=project.drawings.sheets[0],first=stored.views[0].projection.curves.find(c=>c.kind==='line');
  stored.annotations.push({id:'length',kind:'length',viewId:stored.views[0].id,curveIds:[first.id],position:[30,30]});const original=JSON.stringify(project),summary=cadDrawingPreviewSummary(project);assert.equal(summary.sheets[0].annotations[0].value,Math.hypot(...first.a.map((v,k)=>v-first.b[k])));assert.match(summary.sheets[0].annotations[0].text,/mm$/);assert.equal(JSON.stringify(project),original);
  for(const view of stored.views)view.projection.curves=Array.from({length:300},(_,i)=>({...first,id:'bounded-'+i}));for(let i=0;i<999;i++)stored.annotations.push({id:'label-'+i,kind:'label',text:'x'.repeat(1000),position:[30,30]});
  const bounded=cadDrawingPreviewSummary(project);assert.equal(bounded.curveCount,900);assert.equal(bounded.annotationCount,1000);assert.equal(bounded.truncated,true);assert.ok(bounded.sheets[0].views.reduce((n,v)=>n+v.curves.length,0)<=200);assert.ok(bounded.sheets[0].annotations.length<=100);assert.ok(new TextEncoder().encode(JSON.stringify(bounded)).length<=160000);cad.discard(preview.previewId);
 }finally{cad.dispose();}
});

test('AI measured role capture is native-owned and layout omission cannot silently discard stable references',async()=>{
 const {cad,posts}=await fixture();try{
  const sheet=createCadDrawingSheet({id:'role-sheet',sourceIds:['body']}),first=await previewCadDrawingCommands(cad,{revision:cad.revision(),commands:[put(sheet),update(sheet.id)]});cad.apply(first);
  const draft=cad.snapshot().drawings.sheets[0],view=draft.views[0],curve=view.projection.curves.find(curve=>curve.kind==='line'&&curve.sourceReferences);assert.ok(curve,'native fixture needs a complete stable curve');
  draft.annotations=[{id:'measured-role',kind:'length',viewId:view.id,curveIds:[curve.id],sourceSignatures:structuredClone(view.projection.sourceSignatures),position:[40,40]}];
  const added=await previewCadDrawingCommands(cad,{revision:cad.revision(),commands:[put(draft)]});assert.deepEqual(added.project.drawings.sheets[0].annotations[0].curveReferences,[{sourceReferences:curve.sourceReferences}]);cad.apply(added);
  const saved=cad.snapshot().drawings.sheets[0],layout=structuredClone(saved);layout.annotations[0].position=[60,45];delete layout.annotations[0].curveReferences;posts.length=0;
  const edited=await previewCadDrawingCommands(cad,{revision:cad.revision(),commands:[put(layout)]});assert.deepEqual(edited.project.drawings.sheets[0].annotations[0].curveReferences,saved.annotations[0].curveReferences);assert.equal(posts.length,0);cad.discard(edited.previewId);
  for(const mutate of [value=>value.annotations[0].curveReferences[0].sourceReferences[0].role+='-forged',value=>value.annotations[0].unresolved=true]){const forged=structuredClone(saved);mutate(forged);await assert.rejects(previewCadDrawingCommands(cad,{revision:cad.revision(),commands:[put(forged)]}),/schreibgeschützt/);}
 }finally{cad.dispose();}
});

test('layout-only AI put reuses confirmed curves, refuses fabricated geometry, and remove/undo preserves sources',async()=>{
 const {cad,access,posts}=await fixture();try{
  const sheet=createCadDrawingSheet({id:'sheet',sourceIds:['body']}),first=await previewCadDrawingCommands(cad,{revision:cad.revision(),commands:[put(sheet),update('sheet')]});cad.apply(first);
  const saved=cad.snapshot().drawings.sheets[0],changed=structuredClone(saved);changed.scale=.5;changed.views[0].position=[84,61];for(const v of changed.views)delete v.projection;posts.length=0;
  const preview=await previewCadDrawingCommands(cad,{revision:cad.revision(),commands:[put(changed)]});assert.equal(posts.length,0);assert.deepEqual(preview.project.drawings.sheets[0].views[0].projection,saved.views[0].projection);cad.apply(preview);
  const before=cad.serialize(),forged=structuredClone(cad.snapshot().drawings.sheets[0]);forged.views[0].projection.curves[0].a[0]+=10;await assert.rejects(previewCadDrawingCommands(cad,{revision:cad.revision(),commands:[put(forged)]}),/Projektionskurven/);assert.equal(cad.serialize(),before);
  // A changed reference may retain its authentic old curves as a visibly
  // stale draft, just like the UI. It must never become an exportable result.
  const unbound=structuredClone(cad.snapshot().drawings.sheets[0]);unbound.views[0].sourceIds=['other'];posts.length=0;const rebound=await previewCadDrawingCommands(cad,{revision:cad.revision(),commands:[put(unbound)]});assert.equal(posts.length,0);assert.equal(cad.serialize(),before);assert.deepEqual(rebound.project.drawings.sheets[0].views[0].projection,unbound.views[0].projection);assert.ok(cadDrawingProblems(rebound.project.drawings.sheets[0],{sourceSignatures:new Map()}).some(p=>p.code==='STALE_SOURCE'));cad.discard(rebound.previewId);
  const removal=await access.preview({revision:cad.revision(),commands:[{op:'drawing',action:'remove',sheetId:'sheet'}]});await access.apply(removal);assert.equal(cad.snapshot().drawings.sheets.length,0);cad.undo();assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});

test('stale source and lost measure references block all sheet exports until explicit repair',async()=>{
 const {cad,access}=await fixture();try{
  const sheet=createCadDrawingSheet({id:'sheet',sourceIds:['body']}),first=await previewCadDrawingCommands(cad,{revision:cad.revision(),commands:[put(sheet),update('sheet')]});cad.apply(first);
  const measured=cad.snapshot().drawings.sheets[0],curve=measured.views[0].projection.curves.find(c=>c.kind==='line');measured.annotations.push({id:'length',kind:'length',viewId:measured.views[0].id,curveIds:[curve.id],position:[30,30]});cad.apply(await previewCadDrawingCommands(cad,{revision:cad.revision(),commands:[put(measured)]}));
  await cad.execute({kind:'batch',commands:[{op:'update',target:'body',set:{pos:[7,0,0]}}]});const before=cad.serialize();
  for(const format of ['drawing-svg','drawing-dxf','drawing-pdf'])await assert.rejects(access.export({format,sheetId:'sheet'}),{code:'CAD_DRAWING_UPDATE_REQUIRED'});assert.equal(cad.serialize(),before);
  const updatePreview=await previewCadDrawingCommands(cad,{revision:cad.revision(),commands:[update('sheet')]});cad.apply(updatePreview);assert.equal((await access.export({format:'drawing-svg',sheetId:'sheet'})).mimeType,'image/svg+xml');assert.equal(cad.snapshot().drawings.sheets[0].annotations[0].id,'length');
  // A pose edit has an exact role correspondence in format14. Replacing the
  // actual box with a cylinder removes that role and must still block export.
  const replacement=cad.snapshot();replacement.nodes[0].recipe={type:'cylinder',size:[20,20,40]};cad.apply(await cad.preview(undefined,{project:replacement}));cad.apply(await previewCadDrawingCommands(cad,{revision:cad.revision(),commands:[update('sheet')]}));
  await assert.rejects(access.export({format:'drawing-svg',sheetId:'sheet'}),error=>error.code==='CAD_DRAWING_UPDATE_REQUIRED'&&error.problems.some(p=>p.code==='LOST_DIMENSION_REFERENCE'));
  const lost=cad.snapshot().drawings.sheets[0];assert.equal(lost.annotations[0].unresolved,true);delete lost.annotations[0].unresolved;delete lost.annotations[0].curveReferences;const kept=await previewCadDrawingCommands(cad,{revision:cad.revision(),commands:[put(lost)]});assert.equal(kept.project.drawings.sheets[0].annotations[0].unresolved,true);cad.discard(kept.previewId);
  const repaired=cad.snapshot().drawings.sheets[0];repaired.annotations=[];cad.apply(await previewCadDrawingCommands(cad,{revision:cad.revision(),commands:[put(repaired)]}));assert.equal((await access.export({format:'drawing-svg',sheetId:'sheet'})).mimeType,'image/svg+xml');
 }finally{cad.dispose();}
});

test('drawing commands reject mixed batches and stale/cancelled responses without partial commit',async()=>{
 const {cad}=await fixture();try{
  const sheet=createCadDrawingSheet({id:'sheet',sourceIds:['body']}),before=cad.serialize();
  assert.throws(()=>validateCadDrawingCommands([put(sheet),{op:'create',type:'box'}]),/getrennt/);assert.throws(()=>validateCadDrawingCommands([{op:'drawing',action:'update',sheetId:'sheet',extra:1}]),/Unbekannter/);
  await assert.rejects(previewCadDrawingCommands(cad,{revision:'stale',commands:[put(sheet)]}),{code:'STALE_REVISION'});
  await assert.rejects(previewCadDrawingCommands(cad,{revision:cad.revision(),commands:[put(sheet),update('missing')]}),/Blattkennung/);assert.equal(cad.serialize(),before);
  const realQuery=cad.query;cad.query=async(...args)=>{const result=await realQuery(...args);cad.cancel();throw Object.assign(Error('cancelled'),{name:'AbortError'});};await assert.rejects(previewCadDrawingCommands(cad,{revision:cad.revision(),commands:[put(sheet),update('sheet')]}),{name:'AbortError'});cad.query=realQuery;assert.equal(cad.serialize(),before);
  let revision='old';const fake={revision:()=>revision,readSnapshot:()=>cad.snapshot(),query:async(...args)=>{const result=await realQuery(...args);revision='new';return result;},previewDrawings:()=>{throw Error('must not preview stale result');}};await assert.rejects(previewCadDrawingCommands(fake,{revision:'old',commands:[put(sheet),update('sheet')]}),{code:'STALE_REVISION'});assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});

test('AI sheets centre distant parts and retain manually placed centres across refresh and cached scale changes',async()=>{
 const {cad}=await fixture();try{
  await cad.execute({kind:'batch',commands:[{op:'update',target:'body',set:{pos:[2000,-1000,300]}}]});
  const sheet=createCadDrawingSheet({id:'far-sheet',sourceIds:['body']}),centres=new Map(sheet.views.map(v=>[v.id,[...v.position]]));
  const centre=(view,scale)=>view.position.map((value,k)=>value+(k?-1:1)*(view.projection.bounds.min[k]+view.projection.bounds.max[k])/2*scale);
  cad.apply(await previewCadDrawingCommands(cad,{revision:cad.revision(),commands:[put(sheet),update(sheet.id)]}));
  let current=cad.snapshot().drawings.sheets[0];for(const view of current.views)centre(view,current.scale).forEach((value,k)=>assert.ok(Math.abs(value-centres.get(view.id)[k])<1e-8));
  current.views[0].position[0]+=12;centres.get(current.views[0].id)[0]+=12;current.scale=.5;
  // An explicit paper translation remains intentional; scale-only unchanged
  // positions keep their paper centres automatically.
  const explicit=[...current.views[0].position];cad.apply(await previewCadDrawingCommands(cad,{revision:cad.revision(),commands:[put(current)]}));
  current=cad.snapshot().drawings.sheets[0];assert.deepEqual(current.views[0].position,explicit);for(const view of current.views.slice(1))centre(view,current.scale).forEach((value,k)=>assert.ok(Math.abs(value-centres.get(view.id)[k])<1e-8));
  const beforeMove=new Map(current.views.map(v=>[v.id,centre(v,current.scale)]));await cad.execute({kind:'batch',commands:[{op:'update',target:'body',set:{pos:[2500,-900,350]}}]});
  cad.apply(await previewCadDrawingCommands(cad,{revision:cad.revision(),commands:[update(sheet.id)]}));current=cad.snapshot().drawings.sheets[0];for(const view of current.views)centre(view,current.scale).forEach((value,k)=>assert.ok(Math.abs(value-beforeMove.get(view.id)[k])<1e-8));
 }finally{cad.dispose();}
});

test('sheet export arguments and asynchronous PDF are revision checked, with documented local schemas',async()=>{
 const {cad,access}=await fixture();try{
  const sheet=createCadDrawingSheet({id:'sheet',sourceIds:['body']});cad.apply(await previewCadDrawingCommands(cad,{revision:cad.revision(),commands:[put(sheet),update('sheet')]}));
  for(const args of [{format:'drawing-svg'},{format:'drawing-dxf',sheetId:'sheet',ids:['body']},{format:'drawing-pdf',sheetId:'sheet',quality:{}},{format:'step',sheetId:'sheet'}])await assert.rejects(access.export(args));
  await assert.rejects(exportCadDrawing(cad,{format:'drawing-pdf',sheetId:'sheet'},{printDrawingPdf:async()=>new Uint8Array([1])}),/PDF/);
  await assert.rejects(exportCadDrawing(cad,{format:'drawing-pdf',sheetId:'sheet'},{printDrawingPdf:async()=>{await cad.execute({kind:'batch',commands:[{op:'update',target:'body',set:{name:'Changed during PDF'}}]});return new TextEncoder().encode('%PDF-test');}}),{code:'STALE_REVISION'});
  const context=cadAIContext();assert.ok(context.supportedProjectVersions.includes(12));assert.ok(context.programTools.queries.cad.includes('drawingProjection'));assert.deepEqual(context.commandSchema.properties.commands.items.oneOf.filter(s=>s.properties.op.const==='drawing'),CAD_DRAWING_COMMAND_SCHEMAS);for(const format of ['drawing-svg','drawing-dxf','drawing-pdf'])assert.ok(context.exportSchema.properties.format.enum.includes(format));
 }finally{cad.dispose();}
});
