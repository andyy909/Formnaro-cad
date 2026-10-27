import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createCadController} from '../src/cad-controller.js';
import {resizeCadAtCorner,multiplyCadMatrices} from '../src/cad-affine.js';
import {createCadDrawingSheet} from '../src/cad-drawing-data.js';
import {createCadProjectParameters} from '../src/cad-project-parameters-data.js';
function fixture(options={}){let count=0;const cad=createCadController({...options,createWorker:()=>{count++;const native=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),adapter={onmessage:null,onerror:null,postMessage:data=>native.postMessage(data),terminate:()=>native.terminate()};native.on('message',data=>adapter.onmessage?.({data}));native.on('error',error=>adapter.onerror?.(error));return adapter;}});return {cad,count:()=>count};}

test('a confirmed change during an actual STEP or STL export rejects the delayed old revision before exposing bytes',async()=>{
 const exporting=new Set();let buffered,arrived,deliver;const cad=createCadController({createWorker:()=>{const native=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),adapter={onmessage:null,onerror:null,postMessage:message=>{if(message.request?.job==='exportModel')exporting.add(message.id);native.postMessage(message);},terminate:()=>native.terminate()};native.on('message',message=>{if(message.type==='result'&&exporting.has(message.id)){buffered=message;deliver=()=>{exporting.delete(message.id);adapter.onmessage?.({data:message});};arrived();}else adapter.onmessage?.({data:message});});native.on('error',error=>adapter.onerror?.(error));return adapter;}});
 try{await cad.execute({kind:'create',recipe:{type:'box',size:[20,12,6]},options:{id:'body'}});for(const format of ['step','stl']){const proposal=await cad.preview({kind:'batch',commands:[{op:'transform',target:'body',translate:[1,0,0]}]}),gate=new Promise(resolve=>arrived=resolve),pending=cad.exportModel({format,ids:['body']});await gate;assert.ok(buffered.result.data instanceof Uint8Array);cad.apply(proposal);const after=cad.serialize(),depth=cad.state().undo;deliver();await assert.rejects(pending,{code:'STALE_REVISION'});assert.equal(cad.serialize(),after);assert.equal(cad.state().undo,depth);assert.equal(cad.state().busy,false);}}
 finally{deliver?.();cad.dispose();}
});

test('aborting a BUSY-rejected wrapper cannot cancel another preview or erase its result metadata',async()=>{
 const {cad}=fixture();try{
  await cad.execute({kind:'create',recipe:{type:'box',size:[20,12,6]},options:{id:'body'}});
  const wrappers=[signal=>cad.previewContourLinks({action:'update'},{signal}),signal=>cad.previewProjectParameters(createCadProjectParameters(),{signal}),signal=>cad.previewDrawingUpdate({version:1,sheets:[createCadDrawingSheet({id:'sheet',sourceIds:['body']})]},{sheetIds:['sheet'],signal})];
  for(const wrapper of wrappers){const first=cad.preview({kind:'batch',commands:[{op:'create',type:'box',size:[2,3,4],as:'made'}]}),signal=new AbortController(),second=wrapper(signal.signal),rejected=assert.rejects(second,{code:'BUSY'});signal.abort();await rejected;await assert.rejects(cad.preview({kind:'create',recipe:{type:'box',size:[1,1,1]},options:{id:'must-not-exist'}}),{code:'BUSY'});const proposal=await first;assert.equal(typeof proposal.aliases.made,'string');cad.apply(proposal);assert.ok(cad.snapshot().nodes.some(node=>node.id===proposal.aliases.made));assert.ok(!cad.snapshot().nodes.some(node=>node.id==='must-not-exist'));}
 }finally{cad.dispose();}
});

test('Ending an idle interaction preserves the loaded native worker and confirmed model',async()=>{
  const {cad,count}=fixture();try{
    await cad.execute({kind:'create',recipe:{type:'cylinder',size:[20,20,20]},options:{id:'body'}});
    const before=cad.serialize(),generation=cad.state().worker.generation,undo=cad.state().undo;
    for(let i=0;i<4;i++){assert.equal(cad.cancel(),false);await cad.query('bounds',{ids:['body']});}
    assert.equal(count(),1);assert.equal(cad.state().worker.generation,generation);
    assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,undo);
  }finally{cad.dispose();}
});

test('Renderer controller and atomic offline AI batch share native geometry, full matrices, preview and one Undo',async()=>{
  const {cad,count}=fixture();try{
    const before=cad.revision(),proposal=await cad.preview({kind:'batch',commands:[
      {op:'create',type:'cylinder',as:'body',size:[20,20,20],pos:[0,0,10]},
      {op:'create',type:'cylinder',as:'hole',size:[6,6,24],pos:[0,0,10],solid:false},
      {op:'group',targets:['$body','$hole'],as:'bored',name:'Analytisch gebohrter Zylinder'}
    ]},{label:'CAD-Platte'});
    assert.equal(cad.revision(),before);assert.equal(cad.snapshot().nodes.length,0);assert.equal(cad.state().undo,0);
    assert.ok(proposal.aliases.bored);assert.ok(Math.abs(proposal.project.nodes[0].stats.volume-Math.PI*(100-9)*20)<1e-6);
    const first=cad.apply(proposal);assert.equal(first.changed,true);assert.equal(cad.state().undo,1);assert.equal(count(),1);
    const group=cad.snapshot().nodes[0],query=await cad.query('bounds',{ids:[group.id]});assert.deepEqual(query.size,[20,20,20]);
    const coarse=await cad.display(undefined,{deflection:.5,angleDegrees:30}),fine=await cad.display(undefined,{deflection:.01,angleDegrees:5});assert.ok(coarse.meshes[0].mesh.triangles.length<fine.meshes[0].mesh.triangles.length);assert.equal(cad.state().undo,1);assert.equal(count(),1);
    const draft=cad.snapshot();draft.nodes[0].transform=[1.5,0,0,0,.4,-.8,0,0,.2,.1,1.1,0,25,-12,2,1];const placed=await cad.preview(undefined,{project:draft});cad.apply(placed);
    const transformed=await cad.query('scene'),original=transformed.objects.find(n=>n.id===group.id);assert.ok(Math.abs(original.volume-group.stats.volume*1.5*.8*1.1)<1e-5);assert.equal(cad.state().undo,2);
    const saved=cad.serialize(),stored=JSON.parse(saved);assert.equal(stored.version,5);assert.doesNotMatch(saved,/"vertices"|"faceGroups"|"meshBuffers"/);assert.match(stored.nodes[0].brep.data,/Triangulations 0/);assert.doesNotMatch(stored.nodes[0].brep.data,/Triangulations [1-9]/);
    const dissolved=await cad.preview({kind:'tool',name:'previewDissolve',options:{id:group.id}});cad.apply(dissolved);assert.equal(cad.snapshot().nodes.length,2);assert.deepEqual(cad.snapshot().nodes[0].transform,multiplyCadMatrices(draft.nodes[0].transform,group.children[0].transform));
    cad.undo();assert.equal(cad.snapshot().nodes[0].source,'group');cad.undo();assert.deepEqual(cad.snapshot().nodes[0].transform,group.transform);cad.redo();assert.deepEqual(cad.snapshot().nodes[0].transform,draft.nodes[0].transform);
  }finally{cad.dispose();}
});

test('Native command failure and stale proposal preserve the full confirmed controller state',async()=>{
  const {cad}=fixture();try{
    await cad.execute({kind:'create',recipe:{type:'box',size:[20,20,20]},options:{id:'body',name:'Quelle',locked:true}});
    const saved=cad.serialize(),revision=cad.revision(),undo=cad.state().undo;
    await assert.rejects(cad.preview({kind:'batch',commands:[{op:'create',type:'sphere',as:'new'},{op:'delete',target:'body'}]}),{code:'LOCKED_CAD_OBJECT'});
    assert.equal(cad.serialize(),saved);assert.equal(cad.revision(),revision);assert.equal(cad.state().undo,undo);
    const draft=cad.snapshot();draft.nodes[0].locked=false;await cad.open(draft);
    const next=cad.snapshot();next.nodes[0]=resizeCadAtCorner(next.nodes[0],[25,20,20]);const proposal=await cad.preview(undefined,{project:next});cad.undo();
    assert.throws(()=>cad.apply(proposal),{code:'STALE_REVISION'});assert.equal(cad.snapshot().nodes[0].locked,true);
  }finally{cad.dispose();}
});

test('Controller abort terminates real native work in under a second and restarts from confirmed BRep state',async()=>{
  const {cad,count}=fixture();try{
    await cad.execute({kind:'create',recipe:{type:'box',size:[20,20,20]},options:{id:'baseline',name:'Bestätigt'}});
    const revision=cad.revision(),saved=cad.serialize(),pending=cad.preview({kind:'batch',commands:Array.from({length:100},(_,n)=>({op:'create',type:'gear',name:'Zahnrad '+n,params:{teeth:60,module:1}}))});
    await new Promise(resolve=>setTimeout(resolve,30));const start=performance.now();cad.cancel();await assert.rejects(pending);assert.ok(performance.now()-start<1000);assert.equal(cad.revision(),revision);assert.equal(cad.serialize(),saved);
    assert.equal(cad.state().busy,false);const bounds=await cad.query('bounds',{ids:['baseline']});assert.deepEqual(bounds.size,[20,20,20]);assert.equal(count(),2);
  }finally{cad.dispose();}
});

test('Native candidate display preparation failure preserves confirmed CAD and both history boundaries',async()=>{
  let rejectDisplay=false;const {cad}=fixture({prepareCommit:async project=>{if(rejectDisplay)throw Error('Controlled display allocation failure');const display=await cad.display(project);assert.ok(display.meshes.every(record=>record.mesh.normals.length===record.mesh.vertices.length));}});
  try{await cad.execute({kind:'create',recipe:{type:'box',size:[20,20,20]},options:{id:'body',name:'Confirmed body'}});await cad.execute({kind:'batch',commands:[{op:'transform',target:'body',translate:[3,0,0]}]});cad.undo();const saved=cad.serialize(),state=cad.state();rejectDisplay=true;await assert.rejects(cad.preview({kind:'batch',commands:[{op:'create',type:'sphere'}]}),/Controlled display allocation failure/);assert.equal(cad.serialize(),saved);assert.equal(cad.state().undo,state.undo);assert.equal(cad.state().redo,state.redo);assert.equal(cad.state().busy,false);rejectDisplay=false;cad.redo();assert.equal(cad.snapshot().nodes[0].transform[12],3);assert.equal(cad.snapshot().nodes.length,1);}finally{cad.dispose();}
});
