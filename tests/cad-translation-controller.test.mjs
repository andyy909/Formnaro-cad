import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createCadController} from '../src/cad-controller.js';
import {cadProjectRevision} from '../src/cad-project.js';
import {createFnpackResolver,encodeFnpackProject} from '../src/cad-fnpack-data.js';

test('Verified root translations use no worker jobs, survive Undo and invalidate on geometry, rotation and quality changes',async()=>{
 let jobs=0,prepared,controller,resolver;
 const createWorker=()=>{const native=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),adapter={onmessage:null,onerror:null,postMessage:data=>{if(data.type==='compute')jobs++;native.postMessage(data)},terminate:()=>native.terminate()};native.on('message',data=>adapter.onmessage?.({data}));native.on('error',error=>adapter.onerror?.(error));return adapter;};
 controller=createCadController({createWorker,reuseTranslations:true,getDisplayIds:project=>project.nodes.map(node=>node.id),resolveGeometry:(...args)=>resolver.hydrate(...args),prepareCommit:async(project,{preparedView}={})=>prepared=preparedView??{...await controller.display(project),scene:await controller.describe(project)}});
 try{
  await controller.execute({kind:'batch',commands:[{op:'create',type:'box',size:[20,12,8],as:'body'}]});
  const baseline=controller.serialize(),original=structuredClone(prepared.scene),start=jobs;
  for(let i=0;i<3;i++){const p=controller.snapshot();p.nodes[0].transform[12]+=4;const proposal=await controller.preview(undefined,{project:p});assert.equal(controller.serialize()===baseline,i===0);assert.equal(prepared.scene.objects[0].worldMatrix[12],4*(i+1));controller.apply(proposal);assert.equal(prepared.revision,controller.revision());}
  assert.equal(jobs,start);assert.equal(controller.state().undo,4);
  const reference=await controller.describe();assert.deepEqual(prepared.scene.objects,reference.objects);
  controller.undo();const restored=controller.snapshot();restored.nodes[0].transform[13]+=9;const before=jobs;const proposal=await controller.preview(undefined,{project:restored});controller.apply(proposal);assert.equal(jobs,before);assert.equal(prepared.scene.objects[0].worldMatrix[12],8);
  const altered=controller.snapshot();altered.nodes[0].transform[0]=2;const nativeStart=jobs;controller.apply(await controller.preview(undefined,{project:altered}));assert(jobs>nativeStart);
  controller.setDisplayQuality({deflection:.01,angleDegrees:5});const qualityStart=jobs,draft=controller.snapshot();draft.nodes[0].transform[12]++;controller.apply(await controller.preview(undefined,{project:draft}));assert(jobs>qualityStart);
  controller.setDisplayQuality({deflection:.25,angleDegrees:20});
  await controller.display();
  const afterDisplay=jobs, simplified=controller.snapshot();
  simplified.nodes[0].transform[12]++;
  controller.apply(await controller.preview(undefined,{project:simplified}));
  assert.equal(jobs,afterDisplay,'a display-only refresh reuses the confirmed native scene for translations');
  const rev=controller.revision(),invalid=controller.snapshot();invalid.nodes[0].transform[12]=100001;await assert.rejects(controller.preview(undefined,{project:invalid}));assert.equal(controller.revision(),rev);
  assert.equal(original.objects[0].worldMatrix[12],0);assert.equal(cadProjectRevision(controller.snapshot()),rev);
  while(controller.serialize()!==baseline&&controller.state().undo>1)controller.undo();assert.equal(controller.serialize(),baseline);
  await controller.describe();await controller.display();const refreshedStart=jobs,refreshed=controller.snapshot();refreshed.nodes[0].transform[12]=12;controller.apply(await controller.preview(undefined,{project:refreshed}));assert.equal(jobs,refreshedStart,'native refresh after deep Undo must restore the translation proof');
  const packed=encodeFnpackProject(controller.snapshot()),blocks=new Map(packed.blocks.map(block=>[block.sha256,block.bytes]));
  resolver=createFnpackResolver({readBlock:async hash=>blocks.get(hash)});
  await controller.open(packed.project);
  controller.setDisplayQuality({deflection:.02,angleDegrees:8});
  await controller.display();
  const packedStart=jobs,packedMove=controller.snapshot();
  packedMove.nodes[0].transform[12]++;
  controller.apply(await controller.preview(undefined,{project:packedMove}));
  assert.equal(jobs,packedStart,'opening a package preserves the translation proof across a display change');
  assert.deepEqual(controller.snapshot().nodes[0].brep,packed.project.nodes[0].brep);
  const roleStart=jobs;
  for(const solid of [false,true]){
    const role=controller.snapshot();role.nodes[0].solid=solid;
    controller.apply(await controller.preview(undefined,{project:role}));
    assert.equal(prepared.scene.objects[0].solid,solid);
    assert.equal(prepared.scene.objects[0].capabilities.convertToMesh,solid);
    assert.deepEqual(controller.snapshot().nodes[0].brep,packed.project.nodes[0].brep);
  }
  assert.equal(jobs,roleStart,'standalone role changes do not hydrate or rebuild native geometry');
 }finally{controller.dispose();}
});
