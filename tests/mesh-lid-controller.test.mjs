import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {Worker} from 'node:worker_threads';
import {createCadController} from '../src/cad-controller.js';
import {createCadProject,parseCadProject} from '../src/cad-project.js';
import {createCadAutomationAccess} from '../src/cad-automation-access.js';
import {runCadAIRequest} from '../src/cad-ai-request.js';
import {validateMeshAICommand,runMixedCadAIBatch} from '../src/cad-mixed-ai.js';
import {cadAIContext} from '../src/cad-ai-context.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {lidHousing} from './fixtures/mesh-lid-fixtures.mjs';
import {meshLidReportText} from '../src/cad-ai-lid-report.js';
const kernel=await Module();kernel.setup();
const factory=file=>()=>{const w=new Worker(new URL(file,import.meta.url)),a={onmessage:null,onerror:null,postMessage:v=>w.postMessage(v),terminate:()=>w.terminate()};w.on('message',v=>a.onmessage?.({data:v}));w.on('error',e=>a.onerror?.(e));return a;};
function fixture({damaged=false,locked=false}={}){
 const initial=createCadProject();initial.version=8;initial.nodes=[{...lidHousing(kernel,{damaged}),layerId:'default',folderId:null,locked}];
 const cad=createCadController({initial,createWorker:factory('./fixtures/cad-node-worker.mjs'),createMeshWorker:factory('./fixtures/mesh-engine-node-worker.mjs')});let scene,selected=[{rootId:'housing',path:[]}];
 const refresh=async()=>{scene=await cad.describe();},access=createCadAutomationAccess({controller:cad,getScene:()=>scene,refresh,getSelection:()=>selected});
 return {cad,access,refresh,setSelection:s=>{selected=s;}};
}
const command=scene=>{const c=scene.meshLids.candidates.find(c=>c.normal[2]>.9);assert.ok(c);return {op:'mesh',tool:'lid',target:'housing',as:'lid',name:'Deckel M4',options:{geometryDigest:scene.meshLids.geometryDigest,candidateId:c.candidateId,normal:c.normal,thickness:2.5,lipHeight:1.6,lipWall:1.2,clearance:.25,holeDiameter:4.5}};};
test('KI request receives measured opening, builds a transient proposal and publishes only on explicit Apply; Undo and file roundtrip preserve originals',async()=>{
 const h=fixture();try{await h.refresh();const before=h.cad.serialize(),original=h.cad.snapshot().nodes[0],depth=h.cad.state().undo;
  const result=await runCadAIRequest({input:{prompt:'Deckel für die Öffnung mit M4-Zylinderschrauben'},access:h.access,generate:async args=>{assert.ok(args.context.lidContract);assert.equal(args.scene.meshLids.candidates.find(c=>c.normal[2]>.9).fasteners.length,2);return {revision:args.scene.revision,label:'Deckel M4',commands:[command(args.scene)]};}});
  assert.equal(h.cad.serialize(),before);assert.equal(h.cad.state().undo,depth);assert.equal(result.proposal.report.meshOperations[0].storedLipClearanceVerified,true);assert.equal(result.proposal.after.length,2);
  const candidate=h.cad.getPreview(result.proposal.previewId).project,lid=candidate.nodes.find(n=>n.id===result.proposal.aliases.lid);assert.deepEqual(candidate.nodes[0],original);assert.deepEqual(lid.meshSource.sources[0],original);assert.equal(lid.meshSource.operation.type,'lid');assert.equal(lid.name,'Deckel M4');
  await h.access.apply({previewId:result.proposal.previewId,revision:result.proposal.revision});assert.equal(h.cad.state().undo,depth+1);const applied=h.cad.serialize();assert.deepEqual(parseCadProject(applied).nodes[0],original);
  const data=await h.cad.exportModel({format:'stl',ids:[lid.id]});assert.ok(data.data.byteLength>84);const bytes=new Uint8Array(data.data),text=new TextDecoder().decode(bytes);let count;
  if(text.startsWith('solid ')){count=(text.match(/endfacet/g)??[]).length;assert.equal((text.match(/\bvertex\b/g)??[]).length,count*3);}else{count=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(80,true);assert.equal(bytes.length,84+count*50);}assert.equal(count,lid.mesh.triangles.length/3);
  h.cad.undo();assert.equal(h.cad.serialize(),before);h.cad.redo();assert.equal(h.cad.serialize(),applied);
  await h.cad.open(parseCadProject(applied));assert.deepEqual(h.cad.snapshot().nodes[0],original);assert.ok((await h.cad.inspectMeshSolid(h.cad.snapshot().nodes[1])).ok);
  await assert.rejects(h.cad.preview({type:'mesh-source-edit',id:lid.id,path:['housing'],set:{size:[10,10,10]}}),/Original|Verlauf/);
 }finally{h.cad.dispose();}
});
test('Damaged input still exposes measured lid candidates while body tools remain explicitly unproven',async()=>{
 const h=fixture({damaged:true});try{await h.refresh();const s=await h.access.sceneForAI();assert.equal(s.meshInspection.ok,false);assert.ok(s.meshLids.candidates.length);const before=h.cad.serialize(),p=await h.access.preview({revision:s.revision,commands:[command(s)]});assert.equal(h.cad.serialize(),before);h.access.discard(p.previewId);assert.equal(h.cad.state().previews,0);}finally{h.cad.dispose();}
});
test('A stale opening identity, discard and a failed later command never modify the confirmed project or history',async()=>{
 const h=fixture();try{await h.refresh();const s=await h.access.sceneForAI(),c=command(s),before=h.cad.serialize(),depth=h.cad.state().undo;
  await assert.rejects(h.access.preview({revision:s.revision,commands:[c,{op:'mesh',tool:'role',target:'missing',role:'hole'}]}));assert.equal(h.cad.serialize(),before);assert.equal(h.cad.state().undo,depth);
  const p=await h.access.preview({revision:s.revision,commands:[c]});h.access.discard(p.previewId);await assert.rejects(h.access.apply({previewId:p.previewId,revision:p.revision}));assert.equal(h.cad.serialize(),before);
  const moved=h.cad.snapshot();moved.nodes[0].transform[12]+=2;await h.cad.open(moved);await h.refresh();const changed=h.cad.serialize();await assert.rejects(h.access.preview({revision:h.cad.revision(),commands:[c]}),/geändert|analysieren/);assert.equal(h.cad.serialize(),changed);
 }finally{h.cad.dispose();}
});
test('Inherited locks and a non-material role cannot be bypassed with a forged lid command',async()=>{
 const h=fixture();try{await h.refresh();const c=command(await h.access.sceneForAI()),p=h.cad.snapshot();p.layers.find(l=>l.id==='default').locked=true;await h.cad.open(p);await h.refresh();const s=await h.access.sceneForAI();assert.equal(s.meshLids,undefined);const before=h.cad.serialize();await assert.rejects(h.access.preview({revision:s.revision,commands:[c]}),/gesperrt/);assert.equal(h.cad.serialize(),before);}finally{h.cad.dispose();}
});
test('Lid schema rejects arbitrary executable payloads and context explains measured identities and preview limits',()=>{
 const context=cadAIContext(),schema=context.requestSchema.properties.commands.items.oneOf.find(s=>s.properties.tool?.const==='lid');assert.ok(schema);assert.match(context.lidContract.analysis,/never invent/);assert.match(context.lidContract.construction,/M4/);
 const valid={op:'mesh',tool:'lid',target:'housing',options:{geometryDigest:'a'.repeat(64),candidateId:'lid-'+'b'.repeat(24),normal:[0,0,1]}};assert.deepEqual(validateMeshAICommand(valid),valid);
 for(const c of [{...valid,script:'x'},{...valid,options:{...valid.options,triangles:[1,2,3]}},{...valid,options:{...valid.options,thickness:NaN}},{...valid,options:{...valid.options,candidateId:'guess'}}])assert.throws(()=>validateMeshAICommand(c),{code:'INVALID_MESH_COMMAND'});
});
test('The visible proposal distinguishes checked geometry, measured fasteners and the outstanding physical fit test',()=>{
 const r={meshOperations:[{tool:'lid',solidProven:true,storedLipClearanceVerified:true,fasteners:[{},{}],holeDiameter:4.5,thickness:2.5,lipHeight:1.6,clearance:.25}]};
 const de=meshLidReportText(r).flat().join(' '),en=meshLidReportText(r,'en').flat().join(' ');assert.match(de,/2 gemessene/);assert.match(de,/4,5 mm/);assert.match(de,/noch zu prüfen/);assert.match(en,/Physical fit/);
 assert.deepEqual(meshLidReportText({meshOperations:[{...r.meshOperations[0],storedLipClearanceVerified:false}]}),[]);
});
test('Independent direct and mixed transaction guards reject a worker that changes an original while adding a lid',async()=>{
 const initial=createCadProject();initial.version=8;initial.nodes=[{...lidHousing(kernel),layerId:'default',folderId:null}];
 const store=createCadTransactions({initial,build:async p=>{p.nodes[0].name='illegally changed';p.nodes.push({...structuredClone(p.nodes[0]),id:'lid'});return p;}});
 await assert.rejects(store.preview({revision:store.revision(),project:initial,operation:{type:'mesh-lid',id:'housing',resultId:'lid'}}),{code:'LID_ORIGINAL'});assert.deepEqual(store.snapshot(),initial);
 const native=async({project})=>({project}),c={op:'mesh',tool:'lid',target:'housing',options:{geometryDigest:'a'.repeat(64),candidateId:'lid-'+'b'.repeat(24),normal:[0,0,1]}};
 await assert.rejects(runMixedCadAIBatch({project:initial,baseline:initial,commands:[c],runNative:native,runMesh:async({project,operation})=>{const p=structuredClone(project);p.nodes[0].name='bad';p.nodes.push({...structuredClone(p.nodes[0]),id:operation.resultId});return {project:p,selectedIds:[operation.resultId]};}}),/exakt erhalten/);
});
