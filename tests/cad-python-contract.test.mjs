import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {cadAIContext} from '../src/cad-ai-context.js';
import {validateProgramCommand} from '../src/cad-ai-program.js';
import {createCadController} from '../src/cad-controller.js';
const factory=()=>{const worker=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url));const api={postMessage:m=>worker.postMessage(m),terminate:()=>worker.terminate()};worker.on('message',data=>api.onmessage?.({data}));worker.on('error',error=>api.onerror?.(error));return api;};

test('Python has its own bounded command and published modelling contract',()=>{
 const context=cadAIContext();assert.ok(context.requestSchema.properties.commands.items.oneOf.some(s=>s.properties?.op?.const==='python'));assert.equal(context.programTools.python.version,1);
 for(const helper of ['model.cut','model.polygon','await model.query','Client.preview'])assert.ok(JSON.stringify(context.programTools.python).includes(helper));
 assert.deepEqual(validateProgramCommand({op:'python',code:'result=6*7'}),{op:'python',code:'result=6*7'});
 for(const c of [{op:'python',code:''},{op:'python',code:'x'.repeat(100001)},{op:'python',code:'pass',workerSource:'evil'},{op:'python',code:'pass',modules:{}},{op:'python',code:'pass',path:'private'}])assert.throws(()=>validateProgramCommand(c));
});

test('Python cannot recurse into scripts or widen read capabilities',async()=>{
 for(const [method,args]of [['run',{op:'python',code:'pass'}],['run',{op:'script',code:'return 1'}],['query',{engine:'desktop',kind:'readFile'}],['query',{engine:'cad',kind:'fontLibrary'}]]){
  const controller=createCadController({createWorker:factory,runPython:async({call})=>call(method,args)});
  try{const before=controller.serialize();await assert.rejects(controller.preview({kind:'batch',commands:[{op:'python',code:'stubbed Python capability probe'}]}));assert.equal(controller.serialize(),before);assert.equal(controller.state().undo,0);assert.equal(controller.state().previews,0);}finally{controller.dispose();}
 }
});

test('Python can use ordinary measured model tools but cannot edit parameter metadata through them',async()=>{
 const controller=createCadController({createWorker:factory,runPython:async({call})=>{await call('run',{op:'tool',engine:'cad',operation:{kind:'create',recipe:{type:'box',size:[4,5,6]},options:{}}});return call('run',{op:'tool',engine:'cad',operation:{kind:'projectParameters',data:{}}});}});
 try{const before=controller.serialize();await assert.rejects(controller.preview({kind:'batch',commands:[{op:'python',code:'stubbed metadata bypass probe'}]}),/homogene|Projektparameter/);assert.equal(controller.serialize(),before);assert.equal(controller.state().undo,0);}finally{controller.dispose();}
});

test('Local worker aliases follow sources through two groups and remain editable and queryable',async()=>{
 let observed;
 const controller=createCadController({createWorker:factory,runPython:async({call})=>{
  await call('run',{op:'create',type:'box',size:[30,20,6],pos:[15,10,3],as:'floor'});
  await call('run',{op:'create',type:'box',size:[30,4,10],pos:[15,2,11],as:'wall'});
  await call('run',{op:'group',targets:['$floor','$wall'],as:'body'});
  await call('run',{op:'create',type:'cylinder',size:[4,4,10],pos:[10,10,3],solid:false,as:'hole'});
  await call('run',{op:'group',targets:['$body','$hole'],as:'result'});
  observed=await call('query',{engine:'cad',kind:'bounds',options:{targets:['$floor']}});
  await call('run',{op:'update',target:'$floor',set:{size:[30,20,8]}});
  const changed=await call('query',{engine:'cad',kind:'bounds',options:{targets:['$floor']}});assert.ok(Math.abs(changed.size[2]-8)<1e-5);return {observed};
 }});
 try{const before=controller.serialize(),p=await controller.preview({kind:'batch',commands:[{op:'python',code:'real native-call alias regression'}]});assert.equal(observed.byId[0].target.path.length,2);assert.ok(observed.byId[0].size.every((v,i)=>Math.abs(v-[30,20,6][i])<1e-5));assert.deepEqual(p.aliases.floor,observed.byId[0].target);assert.equal(p.project.nodes[0].children[0].children[0].recipe.size[2],6);assert.equal(controller.serialize(),before);assert.equal(controller.state().undo,0);controller.discard(p.previewId);}finally{controller.dispose();}
});
