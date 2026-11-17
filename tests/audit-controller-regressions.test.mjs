import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {Worker} from 'node:worker_threads';import {createCadController} from '../src/cad-controller.js';
import { cadIdentity } from '../src/cad-affine.js';
import { createClipboard } from '../src/app/clipboard.js';
const source=name=>fs.readFileSync(new URL('../src/'+name,import.meta.url),'utf8'),factory=()=>{const w=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),a={postMessage:v=>w.postMessage(v),terminate:()=>w.terminate()};w.on('message',data=>a.onmessage?.({data}));w.on('error',e=>a.onerror?.(e));return a;};
test('BUG-55 every public discard surface releases the controller and transaction preview',async()=>{const cad=createCadController({createWorker:factory});try{const p=await cad.preview({kind:'create',recipe:{type:'box',size:[2,3,4]},options:{id:'a'}});assert(cad.getPreview(p.previewId));cad.transactions.discard(p.previewId);assert.equal(cad.getPreview(p.previewId),undefined);assert.throws(()=>cad.apply(p));}finally{cad.dispose();}});
test('BUG-55 mesh query forwards its cancellation signal without serializing it into the request',async()=>{let terminated=false;const sent=[],fake={postMessage:v=>sent.push(v),terminate:()=>terminated=true},cad=createCadController({createWorker:factory,createMeshWorker:()=>fake}),abort=new AbortController();try{const p=cad.meshQuery('toolsQuery',{kind:'inspect'},{signal:abort.signal});abort.abort();await assert.rejects(p,{name:'AbortError'});assert(terminated);assert(sent.some(x=>x.type==='compute'));assert(sent.every(x=>!Object.hasOwn(x.request??{},'signal')));}finally{cad.dispose();}});
test('BUG-54 runtime disposal settles every pending host call and rejects new calls',async()=>{const text=source('cad-worker-runtime.js'),line=text.split('\n').find(x=>x.includes('function hostRequest(')),dispose=text.match(/dispose:(\(\)=>\{closed=true;[^\n]+?)\,state:/)[1],context={hostRequests:new Map(),hostSequence:0,generation:1,closed:false,service:{dispose(){}},reply(){}};vm.createContext(context);vm.runInContext(line+';this.run=hostRequest;this.dispose='+dispose,context);const a=context.run({generation:1},{}),b=context.run({generation:1},{}),ended=Promise.allSettled([a,b]);context.dispose();const r=await ended;assert(r.every(x=>x.status==='rejected'&&x.reason.name==='AbortError'));assert.equal(context.hostRequests.size,0);await assert.rejects(context.run({generation:1},{}),{name:'AbortError'});});
test('BUG-39 failed copy settles the shared clipboard wait and never poisons subsequent paste', async () => {
  const node = { id: 'a', kind: 'cad', source: 'native', solid: true, layerId: 'default', folderId: null,
    recipe: { type: 'box', size: [2, 3, 4] }, transform: cadIdentity(), brep: { data: 'box BRep' } };
  const model = { version: 30, nodes: [node], layers: [{ id: 'default' }], folders: [],
    activeLayerId: 'default', activeFolderId: null };
  const failedLoad = Promise.withResolvers();
  let fail = true, pastes = 0;
  const clipboard = createClipboard({
    selected: () => [{ target: { rootId: 'a', path: [] } }],
    project: () => model,
    controller: { revision: () => 1, projectScope: () => 1,
      materialize: () => fail ? failedLoad.promise : Promise.resolve(model) },
    activeEasyKind: () => false,
    updateState() {},
    toast() {},
    select() {},
    mutate: async (change) => {
      change(structuredClone(model));
      pastes++;
    },
  });
  const rejected = assert.rejects(clipboard.copySelection(), /read failed/);
  const waitingPaste = clipboard.paste();
  await Promise.resolve();
  assert.equal(pastes, 0);
  failedLoad.reject(Error('read failed'));
  await rejected;
  await waitingPaste;
  await clipboard.paste();
  assert.equal(pastes, 0);
  fail = false;
  await clipboard.copySelection();
  await clipboard.paste();
  assert.equal(pastes, 1);
});
