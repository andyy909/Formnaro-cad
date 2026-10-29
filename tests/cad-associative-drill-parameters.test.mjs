import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createCadController} from '../src/cad-controller.js';
import {createCadAutomationAccess} from '../src/cad-automation-access.js';
import {createCadProjectParameters} from '../src/cad-project-parameters-data.js';
function factory(){return ()=>{const worker=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),adapter={onmessage:null,onerror:null,postMessage:message=>worker.postMessage(message),terminate:()=>worker.terminate()};worker.on('message',message=>adapter.onmessage?.({data:message}));worker.on('error',error=>adapter.onerror?.(error));return adapter;};}
test('Projektparameter baut Quader und mitwachsende Bohrung gemeinsam neu auf',async()=>{
 const cad=createCadController({createWorker:factory()});try{
  await cad.execute({kind:'create',recipe:{type:'box',size:[40,20,4]},options:{id:'body'}});
  let scene=await cad.describe();const access=createCadAutomationAccess({controller:cad,getSelection:()=>[{rootId:'part4',path:[]}],getScene:()=>scene,refresh:async()=>{scene=await cad.describe();}}),data={...createCadProjectParameters(),parameters:[{id:'p-height',name:'height',value:4}],bindings:[{id:'b-height',parameterId:'p-height',target:{rootId:'body',path:[]},field:'size.2'}]};
  await access.apply(await access.preview({revision:cad.revision(),commands:[{op:'parameter',action:'put',data},{op:'parameter',action:'update'}]}));
  let id='body';for(const [i,[x,y]] of [[-10,-4],[10,-4],[-10,4],[10,4]].entries()){const next='part'+(i+1);cad.apply(await cad.preview({kind:'tool',name:'previewDrill',options:{id,resultId:next,reference:{ray:{origin:[x,y,30],direction:[0,0,-1]}},associative:true,diameter:4}}));id=next;}
  scene=await cad.describe();const data2=structuredClone(cad.snapshot().projectParameters);assert.deepEqual(data2.bindings[0].target,{rootId:'part4',path:['part3','part2','part1','body']});data2.parameters[0].value=12;
  const preview=await access.preview({revision:cad.revision(),commands:[{op:'parameter',action:'put',data:data2},{op:'parameter',action:'update'}]});const project=access.getPreview(preview.previewId);assert.ok(Math.abs(project.nodes[0].stats.volume-(9600-192*Math.PI))<1e-3, JSON.stringify({volume:project.nodes[0].stats.volume,report:preview.parameterReport}));await access.apply(preview);
  cad.undo();assert.ok(Math.abs(cad.snapshot().nodes[0].stats.volume-(3200-64*Math.PI))<1e-3);cad.redo();assert.ok(Math.abs(cad.snapshot().nodes[0].stats.volume-(9600-192*Math.PI))<1e-3);
  const prior=cad.serialize(),edited=await cad.preview({kind:'tool',name:'previewEditDrill',options:{id:'part4',path:['part3','part2','part1'],patch:{diameter:6},positionReference:{ray:{origin:[-5,-4,30],direction:[0,0,-1]}}}});cad.apply(edited);assert.ok(Math.abs(cad.snapshot().nodes[0].stats.volume-(9600-252*Math.PI))<1e-3);assert.deepEqual(cad.snapshot().projectParameters.bindings[0].target,{rootId:'part4',path:['part3','part2','part1','body']});cad.undo();assert.equal(cad.serialize(),prior);
 }finally{cad.dispose();}
});

test('Bohrungsmuster-Anzahl und Abstand folgen Projektparametern und Varianten',async()=>{
 const cad=createCadController({createWorker:factory()});try{
  await cad.execute({kind:'create',recipe:{type:'box',size:[40,20,4]},options:{id:'body'}});
  cad.apply(await cad.preview({kind:'tool',name:'previewDrill',options:{id:'body',resultId:'part',reference:{ray:{origin:[-10,0,30],direction:[0,0,-1]}},associative:true,diameter:4}}));
  cad.apply(await cad.preview({kind:'tool',name:'previewEditDrill',options:{id:'part',patch:{pattern:{version:1,kind:'line',count:3,step:[8,0],skip:[]}}}}));
  let scene=await cad.describe();const access=createCadAutomationAccess({controller:cad,getSelection:()=>[{rootId:'part',path:[]}],getScene:()=>scene,refresh:async()=>{scene=await cad.describe();}}),data={...createCadProjectParameters(),parameters:[{id:'p-count',name:'count',value:4},{id:'p-step',name:'step',value:8}],bindings:[{id:'b-count',parameterId:'p-count',target:{rootId:'part',path:[]},field:'drill.pattern.count'},{id:'b-step',parameterId:'p-step',target:{rootId:'part',path:[]},field:'drill.pattern.step.0'}],variants:[{id:'small',name:'Klein',values:[{parameterId:'p-count',value:2}],states:[]}]};
  let preview=await access.preview({revision:cad.revision(),commands:[{op:'parameter',action:'put',data},{op:'parameter',action:'update'}]});await access.apply(preview);assert.equal(cad.snapshot().nodes[0].drill.pattern.count,4);assert.ok(Math.abs(cad.snapshot().nodes[0].stats.volume-(3200-64*Math.PI))<1e-3);
  preview=await access.preview({revision:cad.revision(),commands:[{op:'parameter',action:'selectVariant',variantId:'small'},{op:'parameter',action:'update'}]});await access.apply(preview);assert.equal(cad.snapshot().nodes[0].drill.pattern.count,2);assert.ok(Math.abs(cad.snapshot().nodes[0].stats.volume-(3200-32*Math.PI))<1e-3);const confirmed=cad.serialize();cad.undo();assert.equal(cad.snapshot().nodes[0].drill.pattern.count,4);cad.redo();assert.equal(cad.serialize(),confirmed);
  const invalid=structuredClone(cad.snapshot().projectParameters);invalid.parameters.find(p=>p.id==='p-count').value=2.5;invalid.activeVariantId=null;await assert.rejects(()=>access.preview({revision:cad.revision(),commands:[{op:'parameter',action:'put',data:invalid},{op:'parameter',action:'update'}]}));assert.equal(cad.serialize(),confirmed);
 }finally{cad.dispose();}
});

test('Lochkreisradius, Winkel und Startwinkel sind projektparametergebunden',async()=>{
 const cad=createCadController({createWorker:factory()});try{
  await cad.execute({kind:'create',recipe:{type:'box',size:[40,20,4]},options:{id:'body'}});cad.apply(await cad.preview({kind:'tool',name:'previewDrill',options:{id:'body',resultId:'part',reference:{ray:{origin:[-10,0,30],direction:[0,0,-1]}},associative:true,diameter:4}}));
  cad.apply(await cad.preview({kind:'tool',name:'previewEditDrill',options:{id:'part',patch:{pattern:{version:1,kind:'circle',count:4,center:[5,0],radius:5,angle:360,startAngle:0,skip:[]}}}}));
  let scene=await cad.describe();const access=createCadAutomationAccess({controller:cad,getSelection:()=>[{rootId:'part',path:[]}],getScene:()=>scene,refresh:async()=>{scene=await cad.describe();}}),data={...createCadProjectParameters(),parameters:[{id:'r',name:'radius',value:6},{id:'a',name:'angle',value:180},{id:'s',name:'start',value:0}],bindings:[{id:'br',parameterId:'r',target:{rootId:'part',path:[]},field:'drill.pattern.radius'},{id:'ba',parameterId:'a',target:{rootId:'part',path:[]},field:'drill.pattern.angle'},{id:'bs',parameterId:'s',target:{rootId:'part',path:[]},field:'drill.pattern.startAngle'}]};
  await access.apply(await access.preview({revision:cad.revision(),commands:[{op:'parameter',action:'put',data},{op:'parameter',action:'update'}]}));const p=cad.snapshot().nodes[0].drill.pattern;assert.equal(p.radius,6);assert.equal(p.angle,180);assert.equal(p.startAngle,0);assert.ok(Math.abs(cad.snapshot().nodes[0].stats.volume-(3200-64*Math.PI))<1e-3);
  const before=cad.serialize(),invalid=structuredClone(cad.snapshot().projectParameters);invalid.parameters.find(p=>p.id==='a').value=0;await assert.rejects(()=>access.preview({revision:cad.revision(),commands:[{op:'parameter',action:'put',data:invalid},{op:'parameter',action:'update'}]}));assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});

test('Lösen einer Musterposition erhält und verschiebt vorhandene Parameterbindung',async()=>{
 const cad=createCadController({createWorker:factory()});try{
  await cad.execute({kind:'create',recipe:{type:'box',size:[40,20,4]},options:{id:'body'}});cad.apply(await cad.preview({kind:'tool',name:'previewDrill',options:{id:'body',resultId:'part',reference:{ray:{origin:[-10,0,30],direction:[0,0,-1]}},associative:true,diameter:4}}));cad.apply(await cad.preview({kind:'tool',name:'previewEditDrill',options:{id:'part',patch:{pattern:{version:1,kind:'line',count:3,step:[8,0],skip:[]}}}}));
  let scene=await cad.describe();const access=createCadAutomationAccess({controller:cad,getSelection:()=>[{rootId:'part',path:[]}],getScene:()=>scene,refresh:async()=>{scene=await cad.describe();}}),data={...createCadProjectParameters(),parameters:[{id:'count',name:'count',value:3}],bindings:[{id:'binding',parameterId:'count',target:{rootId:'part',path:[]},field:'drill.pattern.count'}]};await access.apply(await access.preview({revision:cad.revision(),commands:[{op:'parameter',action:'put',data},{op:'parameter',action:'update'}]}));
  const before=cad.serialize();cad.apply(await cad.preview({kind:'tool',name:'previewDetachDrillPattern',options:{id:'part',index:1}}));const detached=cad.snapshot(),inner=detached.nodes[0].children[0];assert.deepEqual(detached.projectParameters.bindings[0].target,{rootId:'part',path:[inner.id]});assert.deepEqual(inner.drill.pattern.skip,[1]);assert.ok(Math.abs(detached.nodes[0].stats.volume-(3200-48*Math.PI))<1e-3);
  scene=await cad.describe();const updated=structuredClone(cad.snapshot().projectParameters);updated.parameters[0].value=4;await access.apply(await access.preview({revision:cad.revision(),commands:[{op:'parameter',action:'put',data:updated},{op:'parameter',action:'update'}]}));assert.equal(cad.snapshot().nodes[0].children[0].drill.pattern.count,4);assert.ok(Math.abs(cad.snapshot().nodes[0].stats.volume-(3200-64*Math.PI))<1e-3);cad.undo();cad.undo();assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});
