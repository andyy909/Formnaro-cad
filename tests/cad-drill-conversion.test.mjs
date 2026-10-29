import test from 'node:test';
import assert from 'node:assert/strict';
import {createCadService} from '../src/cad-service.js';
import {createCadProject,parseCadProject,serializeCadProject} from '../src/cad-project.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadToolsNative} from '../src/cad-tools-native.js';
import {createCadCommandRouter} from '../src/cad-command-router.js';
import {encodeFnpackProject,createFnpackResolver,stripGeometryIdentity} from '../src/cad-fnpack-data.js';
const loader=(await import('../cad-kernel-build/runtime/formnaro_cad.js')).default;
const oc=await loader({print:()=>{},printErr:()=>{}});
const reference={ray:{origin:[5,3,30],direction:[0,0,-1]}};
const dimensions={reference,kind:'plain',through:true,diameter:4,depth:10,headDiameter:8,headDepth:2,angle:90,gap:0};
async function fixture(kind='plain'){
 const service=createCadService({oc}),body=service.nativeNode({type:'box',size:[40,20,4]},{id:'body'});
 const transactions=createCadTransactions({initial:createCadProject({nodes:[body]}),build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions});
 transactions.apply(await tools.previewDrill({...dimensions,kind,id:'body',resultId:'legacy',revision:transactions.revision()}));
 return {service,transactions,tools};
}
for(const kind of ['plain','counterbore','countersink'])test('Alte Bohrgruppe ausdrücklich überführen: '+kind,async()=>{
 const {service,transactions:t,tools}=await fixture(kind);try{
  const before=t.snapshot(),revision=t.revision(),proposal=await tools.previewConvertDrill({...dimensions,kind,id:'legacy',confirmed:true,revision});
  assert.deepEqual(t.snapshot(),before);assert.equal(proposal.project.nodes[0].id,'legacy');assert.equal(proposal.project.nodes[0].children[0].id,'body');assert.equal(proposal.project.nodes[0].drill.kind,kind);
  t.discard(proposal.previewId);assert.deepEqual(t.snapshot(),before);
  t.apply(await tools.previewConvertDrill({...dimensions,kind,id:'legacy',confirmed:true,revision}));const converted=t.snapshot();assert.deepEqual(parseCadProject(serializeCadProject(converted)),converted);
  const encoded=encodeFnpackProject(converted),blocks=new Map(encoded.blocks.map(b=>[b.sha256,b.bytes])),hydrated=await createFnpackResolver({readBlock:async hash=>blocks.get(hash)}).hydrate(encoded.project);assert.deepEqual(stripGeometryIdentity(hydrated),converted);
  t.undo();assert.deepEqual(t.snapshot(),before);t.redo();assert.deepEqual(t.snapshot(),converted);
  t.apply(await tools.previewEditSource({groupId:'legacy',path:['body'],patch:{recipe:{type:'box',size:[40,20,12]}},revision:t.revision()}));
  assert.ok(t.snapshot().nodes[0].stats.volume<9600);assert.ok(t.snapshot().nodes[0].stats.volume>converted.nodes[0].stats.volume);
 }finally{service.dispose();}
});
test('Falsche Maße und versetztes Loch trotz gleichen Volumens übernehmen nichts',async()=>{
 const {service,transactions:t,tools}=await fixture();try{
  const before=t.snapshot(),revision=t.revision();
  for(const patch of [{diameter:6},{reference:{ray:{origin:[-5,3,30],direction:[0,0,-1]}}},{through:false,depth:2}]){
   await assert.rejects(tools.previewConvertDrill({...dimensions,...patch,id:'legacy',confirmed:true,revision}),{code:'CAD_DRILL_CONVERSION_MISMATCH'});
   assert.deepEqual(t.snapshot(),before);assert.equal(t.state().previews,0);
  }
  await assert.rejects(tools.previewConvertDrill({...dimensions,id:'legacy',revision}),{code:'CAD_DRILL_CONFIRMATION_REQUIRED'});
  await assert.rejects(tools.previewConvertDrill({...dimensions,id:'legacy',confirmed:true,resultId:'other',revision}),{code:'INVALID_CAD_DRILL_CONVERSION'});
  await assert.rejects(tools.previewConvertDrill({...dimensions,id:'legacy',confirmed:true,revision:'old'}),{code:'STALE_REVISION'});
 }finally{service.dispose();}
});
test('Überführung über denselben Router wie die Oberfläche',async()=>{
 const {service,transactions:t}=await fixture();try{
  const input=t.snapshot(),router=createCadCommandRouter({oc,service}),result=await router.run(input,{kind:'tool',name:'previewConvertDrill',options:{...dimensions,id:'legacy',confirmed:true}});
  assert.equal(result.project.nodes[0].drill.termination,'through');assert.deepEqual(t.snapshot(),input);
  await assert.rejects(router.run(input,{kind:'tool',name:'previewConvertDrill',options:{...dimensions,id:'legacy',confirmed:true,unknown:true}}),{code:'INVALID_COMMAND'});
 }finally{service.dispose();}
});
test('Sperren und Zusatzdaten alter Bohrgruppen bleiben geschützt',async()=>{
 const {service,transactions:t}=await fixture();try{
  for(const change of [p=>p.nodes[0].locked=true,p=>p.nodes[0].children[1].locked=true,p=>p.nodes[0].suppressed=true,p=>p.nodes[0].children[1].metadata={notes:'Behalten'},p=>p.nodes[0].metadata={stepFaceColors:[{faceIndex:1,color:'#ff0000',opacity:1}]}]){
   const project=t.snapshot();change(project);const store=createCadTransactions({initial:project,build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions:store});
   await assert.rejects(tools.previewConvertDrill({...dimensions,id:'legacy',confirmed:true,revision:store.revision()}));assert.deepEqual(store.snapshot(),project);assert.equal(store.state().previews,0);
  }
 }finally{service.dispose();}
});
