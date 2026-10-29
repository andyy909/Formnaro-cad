import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {readFileSync} from 'node:fs';
import {createCadController} from '../src/cad-controller.js';
import {createCadAutomationAccess} from '../src/cad-automation-access.js';
import {cadAIContext} from '../src/cad-ai-context.js';
function factory(file='./fixtures/cad-node-worker.mjs'){return ()=>{const worker=new Worker(new URL(file,import.meta.url)),adapter={onmessage:null,onerror:null,postMessage:message=>worker.postMessage(message),terminate:()=>worker.terminate()};worker.on('message',message=>adapter.onmessage?.({data:message}));worker.on('error',error=>adapter.onerror?.(error));return adapter;};}
const ref=(x,y,z=30,direction=[0,0,-1])=>({ray:{origin:[x,y,z],direction}});
async function setup(t){const cad=createCadController({createWorker:factory(),createMeshWorker:factory('./fixtures/mesh-engine-node-worker.mjs'),runScript:async({code,call})=>vm.runInNewContext('(async()=>{'+code+'})()',{api:{model:()=>call('model'),query:q=>call('query',structuredClone(q)),run:c=>call('run',structuredClone(c))}},{timeout:1000})});t.after(()=>cad.dispose());await cad.execute({kind:'create',recipe:{type:'box',size:[40,20,4]},options:{id:'body'}});let scene=await cad.describe();const access=createCadAutomationAccess({controller:cad,getScene:()=>scene,refresh:async()=>{scene=await cad.describe();}});return {cad,access};}
const line={version:1,kind:'line',count:3,step:[8,0],skip:[]};
test('KI erstellt und bearbeitet Bohrungsmuster in einer Vorschau und löst Position atomar',async t=>{
 const {cad,access}=await setup(t),before=cad.serialize();
 const proposal=await access.preview({revision:cad.revision(),commands:[{op:'drill',target:'body',reference:ref(-10,0),associative:true,diameter:4,as:'bore'},{op:'editDrill',target:'$bore',patch:{pattern:line}}]});
 assert.equal(cad.serialize(),before);const preview=access.getPreview(proposal.previewId);assert.ok(Math.abs(preview.nodes[0].stats.volume-(3200-48*Math.PI))<1e-3);await access.apply(proposal);
 let scene=await cad.describe(),body=scene.objects.find(o=>o.drill?.pattern);assert.equal(body.drill.pattern.count,3);assert.deepEqual(body.target.path,[]);const previous=cad.serialize();
 const det=await access.preview({revision:cad.revision(),commands:[{op:'detachDrillPattern',target:body.target,index:1}]});assert.equal(cad.serialize(),previous);await access.apply(det);assert.ok(Math.abs(cad.snapshot().nodes[0].stats.volume-(3200-48*Math.PI))<1e-3);assert.deepEqual(cad.snapshot().nodes[0].children[0].drill.pattern.skip,[1]);
 scene=await cad.describe();const earlier=scene.objects.find(o=>o.drill?.pattern);const edit=await access.preview({revision:cad.revision(),commands:[{op:'editDrill',target:earlier.target,patch:{diameter:3}}]});await access.apply(edit);assert.equal(cad.snapshot().nodes[0].children[0].drill.diameter,3);cad.undo();assert.equal(cad.snapshot().nodes[0].children[0].drill.diameter,4);
});
test('KI-Vorschau lehnt ungültiges Muster und veraltete Revision ohne Teilübernahme ab',async t=>{
 const {cad,access}=await setup(t),before=cad.serialize(),revision=cad.revision();
 await assert.rejects(access.preview({revision,commands:[{op:'drill',target:'body',reference:ref(-10,0),associative:true,as:'b'},{op:'editDrill',target:'$b',patch:{pattern:{...line,step:[1,0]}}}]}));assert.equal(cad.serialize(),before);
 await assert.rejects(access.preview({revision,commands:[{op:'drill',target:'body',reference:ref(-10,0),associative:true,as:'b'},{op:'editDrill',target:'$b',patch:{diameter:6,arbitrary:'bad'}}]}));assert.equal(cad.serialize(),before);
 await assert.rejects(access.preview({revision,commands:[{op:'drill',target:'body',reference:ref(-10,0),associative:'yes'}]}));assert.equal(cad.serialize(),before);
 await assert.rejects(access.preview({revision:'stale',commands:[{op:'drill',target:'body',reference:ref(-10,0),associative:true}]}));assert.equal(cad.serialize(),before);
});
test('KI Bis Fläche verlangt die gegenüberliegende native Quaderfläche',async t=>{
 const {cad,access}=await setup(t),before=cad.serialize();
 await assert.rejects(access.preview({revision:cad.revision(),commands:[{op:'drill',target:'body',reference:ref(-10,0),associative:true,termination:'plane'}]}));assert.equal(cad.serialize(),before);
 const result=await access.preview({revision:cad.revision(),commands:[{op:'drill',target:'body',reference:ref(-10,0),associative:true,termination:'plane',stopReference:ref(-10,0,-30,[0,0,1])}]});await access.apply(result);assert.equal(cad.snapshot().nodes[0].drill.termination,'plane');
});
test('KI-Vertragsdateien enthalten die neuen Typen und native Grenzen',()=>{
 const context=cadAIContext(),schemas=context.commandSchema.properties.commands.items.oneOf,ops=schemas.map(s=>s.properties.op.const);assert(ops.includes('editDrill'));assert(ops.includes('detachDrillPattern'));assert.match(context.referenceContract.drill,/opposite planar face/);assert(context.programTools.nativeTools.includes('previewEditDrill'));assert(context.programTools.nativeTools.includes('previewDetachDrillPattern'));
 const generated=JSON.parse(readFileSync(new URL('../ai/OfflineCAD-KI-Kontext.json',import.meta.url))),openapi=JSON.parse(readFileSync(new URL('../ai/OfflineCAD-KI-OpenAPI.json',import.meta.url)));assert.deepEqual(generated.commandSchema,context.commandSchema);assert.deepEqual(generated.programTools,context.programTools);assert.deepEqual(openapi.paths['/v1/preview'].post.requestBody.content['application/json'].schema,context.requestSchema);
});
test('KI wahrt Altbohrungen und vererbte Quellsperren',async t=>{
 const {cad,access}=await setup(t);let p=await access.preview({revision:cad.revision(),commands:[{op:'drill',target:'body',reference:ref(-10,0),diameter:4}]});await access.apply(p);assert.equal(cad.snapshot().nodes[0].drill,undefined);assert.equal(cad.snapshot().nodes[0].children.length,2);
 cad.undo();p=await access.preview({revision:cad.revision(),commands:[{op:'drill',target:'body',reference:ref(-10,0),associative:true}]});await access.apply(p);const locked=cad.snapshot();locked.nodes[0].children[0].locked=true;await cad.open(locked);const before=cad.serialize(),id=cad.snapshot().nodes[0].id;
 await assert.rejects(access.preview({revision:cad.revision(),commands:[{op:'editDrill',target:id,patch:{diameter:6}}]}));assert.equal(cad.serialize(),before);
 await assert.rejects(access.preview({revision:cad.revision(),commands:[{op:'editDrill',target:id,patch:{diameter:6,arbitrary:'bad'}}]}));assert.equal(cad.serialize(),before);
});
test('Alte Flächentokens und Indizes nach einer Bohrung werden atomar abgewiesen',async t=>{
 const {cad,access}=await setup(t),before=cad.serialize(),first={op:'drill',target:'body',reference:ref(-10,0),associative:true,diameter:4,as:'first'};
 for(const second of [
  {op:'drill',target:'$first',reference:{token:'face:1'},associative:true,diameter:1},
  {op:'drill',target:'$first',reference:{ray:{origin:[30,0,0],direction:[-1,-.5,0]},faceIndex:2},associative:true,diameter:1},
  {op:'editDrill',target:'$first',positionReference:{token:'face:2'}},
  {op:'editDrill',target:'$first',patch:{termination:'plane'},stopReference:{token:'face:1'}}
 ]){await assert.rejects(access.preview({revision:cad.revision(),commands:[first,second]}),{code:'STALE_CAD_REFERENCE'});assert.equal(cad.serialize(),before);}
 const ok=await access.preview({revision:cad.revision(),commands:[first,{op:'drill',target:'$first',reference:ref(10,0),associative:true,diameter:4}]});assert.equal(cad.serialize(),before);await access.apply(ok);assert.ok(Math.abs(cad.snapshot().nodes[0].stats.volume-(3200-32*Math.PI))<1e-3);
});
test('Flächentokens werden auch über getrennte Tool- und CAD-Netz-Segmente gesperrt',async t=>{
 const {cad,access}=await setup(t),before=cad.serialize();const drillTool=(id,reference,extra={})=>({op:'tool',engine:'cad',...extra,operation:{kind:'tool',name:'previewDrill',options:{id,reference,associative:true,diameter:4}}});
 const first=drillTool('body',ref(-10,0),{as:'first'}),second=drillTool('$first',{token:'face:1'}),editTool={op:'tool',engine:'cad',operation:{kind:'tool',name:'previewEditDrill',options:{id:'$first',positionReference:{token:'face:2'}}}};
 for(const commands of [[first,second],[first,editTool],[first,{op:'mesh',tool:'create',type:'box',size:[2,2,2],pos:[100,0,0]},second]]){await assert.rejects(access.preview({revision:cad.revision(),commands}),{code:'STALE_CAD_REFERENCE'});assert.equal(cad.serialize(),before);}
 const ok=await access.preview({revision:cad.revision(),commands:[first,drillTool('$first',ref(10,0))]});await access.apply(ok);assert.ok(Math.abs(cad.snapshot().nodes[0].stats.volume-(3200-32*Math.PI))<1e-3);
});
test('Native Tooloptionen lehnen falsche Boolesche Werte und unbekannte Bohrfelder ab',async t=>{
 const {cad,access}=await setup(t),before=cad.serialize();for(const options of [{associative:'yes'},{associative:1},{associative:true,throughh:false}]){await assert.rejects(access.preview({revision:cad.revision(),commands:[{op:'tool',engine:'cad',operation:{kind:'tool',name:'previewDrill',options:{id:'body',reference:ref(-10,0),...options}}}]}));assert.equal(cad.serialize(),before);}
});
test('Skript darf keine alten Topologietokens nach einer Modellmutation verwenden',async t=>{
 const {cad,access}=await setup(t),before=cad.serialize();const code=`
 await api.run({op:'drill',target:'body',reference:{ray:{origin:[-10,0,30],direction:[0,0,-1]}},associative:true,as:'first'});
 await api.run({op:'drill',target:'$first',reference:{token:'face:1'},associative:true});`;
 await assert.rejects(access.preview({revision:cad.revision(),commands:[{op:'script',code}]}),/Flächentoken|Flächenindex/);assert.equal(cad.serialize(),before);
 const safe=code.replace("{token:'face:1'}","{ray:{origin:[10,0,30],direction:[0,0,-1]}}");const preview=await access.preview({revision:cad.revision(),commands:[{op:'script',code:safe}]});await access.apply(preview);assert.ok(Math.abs(cad.snapshot().nodes[0].stats.volume-(3200-32*Math.PI))<1e-3);
});

test('Frisch abgefragtes Script-Token ist an den aktuellen Körper gebunden',async t=>{
 const {cad,access}=await setup(t),before=cad.serialize();const code=`
 await api.run({op:'drill',target:'body',reference:{ray:{origin:[-10,0,30],direction:[0,0,-1]}},associative:true,as:'first'});
 const points=await api.query({engine:'cad',kind:'referencePoints',options:{nodeId:'$first'}});
 const top=points.points.find(p=>p.kind==='face-centroid'&&p.normal[2]>.9);
 await api.run({op:'drill',target:'$first',reference:{token:top.id},associative:true,diameter:1});`;
 const preview=await access.preview({revision:cad.revision(),commands:[{op:'script',code}]});assert.equal(cad.serialize(),before);await access.apply(preview);assert.equal(cad.snapshot().nodes[0].drill.diameter,1);
});
test('Script sperrt veraltete Flächenabfragen und zuvor ausgestellte neue Tokens',async t=>{
 const {cad,access}=await setup(t),before=cad.serialize();const setupScript=`await api.run({op:'drill',target:'body',reference:{ray:{origin:[-10,0,30],direction:[0,0,-1]}},associative:true,as:'first'});`;
 const staleQuery=setupScript+`await api.query({engine:'cad',kind:'faceSketch',options:{nodeId:'$first',faceIndex:2}});`;await assert.rejects(access.preview({revision:cad.revision(),commands:[{op:'script',code:staleQuery}]}),/Flächentoken|Flächenindex/);assert.equal(cad.serialize(),before);
 const staleToken=setupScript+`const points=await api.query({engine:'cad',kind:'referencePoints',options:{nodeId:'$first'}});const top=points.points.find(p=>p.kind==='face-centroid'&&p.normal[2]>.9);await api.run({op:'editDrill',target:'$first',patch:{diameter:5}});await api.run({op:'editDrill',target:'$first',positionReference:{token:top.id}});`;await assert.rejects(access.preview({revision:cad.revision(),commands:[{op:'script',code:staleToken}]}),/Flächentoken|Flächenindex/);assert.equal(cad.serialize(),before);
 const wrongRoot=`const points=await api.query({engine:'cad',kind:'referencePoints',options:{nodeId:'body'}});const top=points.points.find(p=>p.kind==='face-centroid'&&p.normal[2]>.9);await api.run({op:'create',type:'box',size:[40,20,4],pos:[100,0,0],as:'other'});await api.run({op:'drill',target:'$other',reference:{token:top.id},associative:true});`;await assert.rejects(access.preview({revision:cad.revision(),commands:[{op:'script',code:wrongRoot}]}),/Flächentoken|Flächenindex/);assert.equal(cad.serialize(),before);
});
test('Frischer rayPick erlaubt Flächenkopie per gebundenem faceToken und erhält numerischen faceIndex',async t=>{
 const {cad,access}=await setup(t),before=cad.serialize();const code=`await api.run({op:'drill',target:'body',reference:{ray:{origin:[-10,0,30],direction:[0,0,-1]}},associative:true,as:'first'});const hit=await api.query({engine:'cad',kind:'rayPick',options:{ids:['$first'],ray:{origin:[10,0,30],direction:[0,0,-1]}}});if(typeof hit.faceIndex!=='number'||typeof hit.faceToken!=='string')throw Error('Indexformat');const f=await api.query({engine:'cad',kind:'faceSketch',options:{nodeId:'$first',faceToken:hit.faceToken}});await api.run({op:'sketch',sketch:f.sketch,frame:f.frame,as:'copied'});`;const p=await access.preview({revision:cad.revision(),commands:[{op:'script',code}]});assert.equal(cad.serialize(),before);assert.equal(access.getPreview(p.previewId).nodes.length,2);
 const stale=`await api.run({op:'drill',target:'body',reference:{ray:{origin:[-10,0,30],direction:[0,0,-1]}},associative:true,as:'first'});const hit=await api.query({engine:'cad',kind:'rayPick',options:{ids:['$first'],ray:{origin:[10,0,30],direction:[0,0,-1]}}});await api.run({op:'editDrill',target:'$first',patch:{diameter:5}});await api.query({engine:'cad',kind:'faceSketch',options:{nodeId:'$first',faceToken:hit.faceToken}});`;await assert.rejects(access.preview({revision:cad.revision(),commands:[{op:'script',code:stale}]}),/Flächentoken|Flächenindex/);assert.equal(cad.serialize(),before);
});
test('KI erzeugt Zylinderbohrung in einer atomaren Vorschau',async t=>{const cad=createCadController({createWorker:factory(),createMeshWorker:factory('./fixtures/mesh-engine-node-worker.mjs')});t.after(()=>cad.dispose());await cad.execute({kind:'create',recipe:{type:'cylinder',size:[20,20,4]},options:{id:'body'}});let scene=await cad.describe();const access=createCadAutomationAccess({controller:cad,getScene:()=>scene,refresh:async()=>{scene=await cad.describe();}}),before=cad.serialize();const proposal=await access.preview({revision:cad.revision(),commands:[{op:'drill',target:'body',reference:ref(4,0),associative:true,diameter:4,as:'bore'},{op:'editDrill',target:'$bore',patch:{pattern:{version:1,kind:'line',count:2,step:[-8,0],skip:[]}}}]});assert.equal(cad.serialize(),before);await access.apply(proposal);assert.equal(cad.snapshot().version,28);assert.equal(cad.snapshot().nodes[0].drill.feature,'cylinder-face-top');assert.ok(Math.abs(cad.snapshot().nodes[0].stats.volume-92*Math.PI*4)<1e-4);cad.undo();assert.equal(cad.serialize(),before);});
