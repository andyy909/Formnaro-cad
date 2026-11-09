import test from 'node:test';
import assert from 'node:assert/strict';
import {createPracticeModelUI} from '../src/cad-practice-model-ui.js';
function rig(nodes){const snapshot={nodes},aliases=new Map([['existing-1','original']]);const ui=createPracticeModelUI({controller:{readSnapshot:()=>snapshot},aliases,document:{},access:{}});return {snapshot,aliases,ui};}
test('existing practice alias follows the unique drilled replacement root',()=>{
 const h=rig([{id:'original',kind:'cad'}]);assert.equal(h.ui.rootAlias('existing-1'),'original');
 h.snapshot.nodes=[{id:'drilled',kind:'cad',source:'group',drill:{version:2},children:[{id:'original',kind:'cad'}]}];
 assert.equal(h.ui.rootAlias('existing-1'),'drilled');assert.equal(h.ui.aliasState()[0].kind,'cad');
});
test('replacement alias never selects an unrelated body or ambiguous clone',()=>{
 for(const nodes of [[{id:'other',kind:'cad'}],[1,2].map(i=>({id:'copy'+i,kind:'cad',source:'group',drill:{},children:[{id:'original',kind:'cad'}]})),[{id:'group',kind:'cad',source:'group',children:[{id:'original',kind:'cad'},{id:'other',kind:'cad'}]}]]){const h=rig(nodes);assert.equal(h.ui.rootAlias('existing-1'),'original');assert.equal(h.ui.aliasState()[0].kind,null);}
});
test('a retained positive source follows a normal drilled result but the cutter does not',()=>{
 const h=rig([{id:'drilled',kind:'cad',source:'group',operation:'union',children:[{id:'original',kind:'cad',solid:true},{id:'cutter',kind:'cad',solid:false}]}]);
 h.aliases.set('cut','cutter');assert.equal(h.ui.rootAlias('existing-1'),'drilled');assert.equal(h.ui.rootAlias('cut'),'cutter');assert.equal(h.ui.aliasState().find(x=>x.alias==='cut').kind,null);
});
test('the actual non-associative native drill preserves the practice source alias',async()=>{
 const {Worker}=await import('node:worker_threads'),{createCadController}=await import('../src/cad-controller.js');
 const cad=createCadController({createWorker:()=>{const w=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),a={postMessage:d=>w.postMessage(d),terminate:()=>w.terminate()};w.on('message',d=>a.onmessage?.({data:d}));w.on('error',e=>a.onerror?.(e));return a;}});
 try{await cad.execute({kind:'create',recipe:{type:'cylinder',size:[10,10,12]},options:{id:'original'}});
  const aliases=new Map([['existing-1','original']]),ui=createPracticeModelUI({controller:{readSnapshot:()=>cad.snapshot()},aliases,document:{},access:{}});
  cad.apply(await cad.preview({kind:'tool',name:'previewDrill',options:{id:'original',resultId:'drilled',diameter:4,reference:{ray:{origin:[0,0,30],direction:[0,0,-1]}}}}));
  assert.equal(cad.snapshot().nodes[0].children.length,2);assert.equal(ui.rootAlias('existing-1'),'drilled');assert.equal(ui.aliasState()[0].kind,'cad');
 }finally{cad.dispose();}
});
