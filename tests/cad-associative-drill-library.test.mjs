import test from 'node:test';
import assert from 'node:assert/strict';
import loader from '../cad-kernel-build/runtime/formnaro_cad.js';
import {createCadProject,parseCadProject,serializeCadProject} from '../src/cad-project.js';
import {createCadService} from '../src/cad-service.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadToolsNative} from '../src/cad-tools-native.js';
import {createCadPersistence} from '../src/cad-persistence.js';

const oc=await loader({print:()=>{},printErr:()=>{}});
test('nested associative bores survive library save, independent insertion and undo',async()=>{
 const service=createCadService({oc});try{
  const body=service.nativeNode({type:'box',size:[40,20,4]},{id:'body'}),unrelated=service.nativeNode({type:'box',size:[4,4,4]},{id:'other'}),initial=createCadProject({nodes:[body,unrelated]}),store=createCadTransactions({initial,build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions:store});
  for(const [i,x] of [-10,10].entries()){const root=i?'first':'body',resultId=i?'second':'first';store.apply(await tools.previewDrill({id:root,resultId,reference:{ray:{origin:[x,0,30],direction:[0,0,-1]}},associative:true,diameter:4,revision:store.revision()}));}
  const before=store.snapshot(),values=new Map();let count=0;
  const persistence=createCadPersistence({storage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},transactions:store,verify:p=>service.rebuild(p),makeId:()=>`library-copy-${++count}`});
  persistence.saveTemplate({id:'template',name:'Doppelte Bohrung',ids:['second']});const proposal=await persistence.previewTemplate({id:'template',revision:store.revision()});
  assert.deepEqual(store.snapshot(),before);assert.equal(proposal.project.nodes.length,3);store.apply(proposal);
  const after=store.snapshot(),copy=after.nodes[2];assert.deepEqual(after.nodes.slice(0,2),before.nodes);assert.notEqual(copy.id,'second');
  assert.equal(copy.drill.sourceId,copy.children[0].id);assert.equal(copy.drill.boxId,copy.children[0].children[0].id);assert.equal(copy.children[0].drill.sourceId,copy.children[0].children[0].id);
  assert.ok(Math.abs(copy.stats.volume-before.nodes[0].stats.volume)<1e-6);assert.deepEqual(parseCadProject(serializeCadProject(after)),after);store.undo();assert.deepEqual(store.snapshot(),before);store.redo();assert.deepEqual(store.snapshot(),after);
 }finally{service.dispose();}
});
