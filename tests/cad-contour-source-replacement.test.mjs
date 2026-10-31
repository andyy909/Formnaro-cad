import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {mkdtemp,writeFile,readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createCadController} from '../src/cad-controller.js';
import {parseCadProject,cadProjectStoredVersion} from '../src/cad-project.js';
import {cadContourLinkProblems} from '../src/cad-linked-contours-data.js';
import {createCadDrawingSheet} from '../src/cad-drawing-data.js';
import {encodeFnpackProject,createFnpackResolver,stripGeometryIdentity} from '../src/cad-fnpack-data.js';
import {hasGeometryRefs} from '../src/cad-geometry-ref.js';

const target=(rootId,path=[])=>({rootId,path}),near=(a,b)=>assert(Math.abs(a-b)<1e-5,`${a} != ${b}`);
const factory=()=>{const thread=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),adapter={postMessage:value=>thread.postMessage(value),terminate:()=>thread.terminate()};thread.on('message',data=>adapter.onmessage?.({data}));thread.on('error',e=>adapter.onerror?.(e));return adapter;};
async function fixture({nested=false}={}){
 const cad=createCadController({createWorker:factory});
 for(const [id,size,x,y,z]of [['original',[20,12,6],0,0,0],['replacement',[30,16,10],60,0,3],['keep',[3,4,5],140,0,0],...(nested?[['anchor',[2,2,2],0,30,0]]:[])])await cad.execute({kind:'create',recipe:{type:'box',size},options:{id,name:id,transform:[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1]}});
 if(nested)await cad.execute({kind:'tool',name:'previewGroup',options:{ids:['original','anchor'],id:'source-group'}});
 const source=nested?target('source-group',['original']):target('original'),first=await cad.previewContourLinks({action:'create',source,selector:{kind:'native-role',role:'box.z.max'},height:3,name:'First contour'});cad.apply(first);const firstId=first.aliases.sketch,firstLink=first.project.contourLinks.links[0].id;
 const next=await cad.previewContourLinks({action:'create',source:target(firstId),selector:{kind:'native-role',role:'sketch.cap.max'},height:2,name:'Following contour'});cad.apply(next);const nextId=next.aliases.sketch;
 const sheet=createCadDrawingSheet({id:'affected-sheet',sourceIds:[firstId,nextId]}),other=createCadDrawingSheet({id:'unrelated-sheet',sourceIds:['keep']});cad.apply(await cad.previewDrawings({version:1,sheets:[sheet,other]}));cad.apply(await cad.previewDrawingUpdate(cad.snapshot().drawings,{sheetIds:[sheet.id,other.id]}));
 return {cad,source,firstId,nextId,firstLink};
}
async function checkProjection(cad,project){for(const view of project.drawings.sheets.find(s=>s.id==='affected-sheet').views)assert.deepEqual(view.projection,await cad.query('drawingProjection',{ids:view.sourceIds,view:view.kind}));}
function assertSourcePreserved(before,after,ids){for(const id of ids)assert.deepEqual(after.nodes.find(n=>n.id===id),before.nodes.find(n=>n.id===id));}

test('public explicit contour source replacement updates following contours and affected drawings in one undoable proposal',async()=>{
 const f=await fixture(),{cad}=f;try{
  const before=cad.serialize(),prior=cad.snapshot(),depth=cad.state().undo,candidate=await cad.query('linkedFaceCandidate',{source:target('replacement'),ray:{origin:[60,0,100],direction:[0,0,-1]}}),proposal=await cad.previewContourLinks({action:'rebind',id:f.firstLink,source:target('replacement'),selector:candidate.selector});
  assert.equal(cad.serialize(),before);assert.deepEqual(proposal.contourReport.updatedLinkIds,prior.contourLinks.links.map(l=>l.id));assert.deepEqual(proposal.drawingReport.updatedSheetIds,['affected-sheet']);assert.deepEqual(proposal.project.drawings.sheets[1],prior.drawings.sheets[1]);assertSourcePreserved(prior,proposal.project,['original','replacement','keep']);
  near(proposal.project.nodes.find(n=>n.id===f.firstId).stats.volume,30*16*3);near(proposal.project.nodes.find(n=>n.id===f.nextId).stats.volume,30*16*2);near(proposal.project.nodes.find(n=>n.id===f.firstId).transform[14],8);near(proposal.project.nodes.find(n=>n.id===f.nextId).transform[14],11);assert.deepEqual(cadContourLinkProblems(proposal.project),[]);
  cad.apply(proposal);assert.equal(cad.state().undo,depth+1);await checkProjection(cad,cad.snapshot());const after=cad.serialize();cad.undo();assert.equal(cad.serialize(),before);cad.redo();assert.equal(cad.serialize(),after);await cad.open(after);assert.equal(cad.serialize(),after);
 }finally{cad.dispose();}
});

test('a lost nested contour source path repairs through explicit current source selection and physical OCAD/FNPACK round trips',async()=>{
 const f=await fixture({nested:true}),{cad}=f;try{
  const lost=cad.snapshot(),regenerated=lost.nodes.find(n=>n.id==='source-group').children.find(n=>n.id==='original');regenerated.id='regenerated-child';regenerated.recipe.size=[28,14,10];await cad.open(lost);assert(cadContourLinkProblems(cad.snapshot()).some(p=>p.linkId===f.firstLink));const before=cad.serialize(),source=target('source-group',['regenerated-child']),candidate=await cad.query('linkedFaceCandidate',{source,ray:{origin:[0,0,100],direction:[0,0,-1]}}),proposal=await cad.previewContourLinks({action:'rebind',id:f.firstLink,source,selector:candidate.selector});
  assert.equal(cad.serialize(),before);assert.deepEqual(proposal.project.contourLinks.links[0].source,source);assert.deepEqual(cadContourLinkProblems(proposal.project),[]);near(proposal.project.nodes.find(n=>n.id===f.firstId).stats.volume,28*14*3);near(proposal.project.nodes.find(n=>n.id===f.nextId).stats.volume,28*14*2);cad.apply(proposal);await checkProjection(cad,cad.snapshot());
  const project=cad.snapshot(),parent=path.resolve('work/contour-source-replacement');await mkdir(parent,{recursive:true});const directory=await mkdtemp(path.join(parent,'files-')),ocad=path.join(directory,'repaired.ocad');await writeFile(ocad,cad.serialize(),'utf8');assert.deepEqual(parseCadProject(await readFile(ocad,'utf8')),project);
  const encoded=encodeFnpackProject(project);await writeFile(path.join(directory,'project.json'),JSON.stringify(encoded.project),'utf8');for(const block of encoded.blocks)await writeFile(path.join(directory,block.sha256+'.bin'),block.bytes);const resolver=createFnpackResolver({readBlock:hash=>readFile(path.join(directory,hash+'.bin'))}),hydrated=stripGeometryIdentity(await resolver.hydrate(JSON.parse(await readFile(path.join(directory,'project.json'),'utf8'))));assert.deepEqual(hydrated,{...project,version:Math.max(17,cadProjectStoredVersion(project))});await cad.open(hydrated);assert.deepEqual(cadContourLinkProblems(cad.snapshot()),[]);await checkProjection(cad,cad.snapshot());const step=await cad.exportModel({format:'step',ids:[f.firstId,f.nextId]});assert(step.data.length>1000);
 }finally{cad.dispose();}
});

test('lazy public contour rebind loads the new source and complete affected views while unrelated source and sheet blocks remain unread',async()=>{
 const f=await fixture(),encoded=encodeFnpackProject(f.cad.snapshot());f.cad.dispose();const blocks=new Map(encoded.blocks.map(b=>[b.sha256,b.bytes])),unrelated=new Set(encoded.project.nodes.filter(n=>['original','keep'].includes(n.id)).map(n=>n.brep.sha256)),reads=[],resolver=createFnpackResolver({readBlock:async hash=>{assert(!unrelated.has(hash),'unrelated geometry must stay deferred');reads.push(hash);return blocks.get(hash);}}),cad=createCadController({initial:encoded.project,createWorker:factory,resolveGeometry:resolver.hydrate,getDisplayIds:()=>[]});try{
  const before=cad.serialize(),proposal=await cad.previewContourLinks({action:'rebind',id:f.firstLink,source:target('replacement'),selector:{kind:'native-role',role:'box.z.max'}});assert.equal(cad.serialize(),before);assert(reads.includes(encoded.project.nodes.find(n=>n.id==='replacement').brep.sha256));for(const id of ['original','keep'])assert(hasGeometryRefs(proposal.project.nodes.find(n=>n.id===id)));assert.deepEqual(proposal.project.drawings.sheets[1],encoded.project.drawings.sheets[1]);assert.deepEqual(proposal.drawingReport.updatedSheetIds,['affected-sheet']);assert.deepEqual(cadContourLinkProblems(proposal.project),[]);cad.apply(proposal);await checkProjection(cad,cad.snapshot());cad.undo();assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});

test('failed, cancelled, stale and locked source reassignment leaves the confirmed contour chain and older preview intact',async()=>{
 const f=await fixture(),{cad}=f;try{const request={action:'rebind',id:f.firstLink,source:target('replacement'),selector:{kind:'native-role',role:'box.z.max'}},before=cad.serialize(),older=await cad.previewContourLinks(request);await assert.rejects(cad.previewContourLinks({...request,source:target('deleted')}));assert(cad.getPreview(older.previewId));assert.equal(cad.serialize(),before);await assert.rejects(cad.previewContourLinks(request,{signal:AbortSignal.abort()}),{name:'AbortError'});await assert.rejects(cad.previewContourLinks(request,{revision:'stale'}),{code:'STALE_REVISION'});assert.equal(cad.serialize(),before);const locked=cad.snapshot();locked.nodes.find(n=>n.id===f.firstId).locked=true;await cad.open(locked);const lockedBefore=cad.serialize();await assert.rejects(cad.previewContourLinks(request),{code:'LOCKED_CONTOUR_TARGET'});assert.equal(cad.serialize(),lockedBefore);}finally{cad.dispose();}
});

test('automatic dependent sheet refresh cannot publish an unrelated stale contour branch on the same sheet',async()=>{
 const f=await fixture(),{cad}=f;try{const extra=await cad.previewContourLinks({action:'create',source:target('keep'),selector:{kind:'native-role',role:'box.z.max'},height:2});cad.apply(extra);const drawings=cad.snapshot().drawings;drawings.sheets[0].views.push({id:'unrelated-shared-view',kind:'top',sourceIds:[extra.aliases.sketch],position:[150,200]});cad.apply(await cad.previewDrawings(drawings));cad.apply(await cad.previewDrawingUpdate(cad.snapshot().drawings,{sheetIds:['affected-sheet']}));const stale=cad.snapshot();stale.nodes.find(n=>n.id==='keep').recipe.size[0]=5;await cad.open(stale);const before=cad.serialize();await assert.rejects(cad.previewContourLinks({action:'rebind',id:f.firstLink,source:target('replacement'),selector:{kind:'native-role',role:'box.z.max'}}),{code:'CONTOUR_REBIND_SCOPE_REQUIRED'});assert.equal(cad.serialize(),before);}finally{cad.dispose();}
});
