import test from 'node:test';
import assert from 'node:assert/strict';
import {DOMParser} from '@xmldom/xmldom';
import {Worker} from 'node:worker_threads';
import {Matrix4,Box3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createCadController} from '../src/cad-controller.js';
import {parseThreeMF,parseGltf} from '../src/exchange-formats.js';
import {sampleParts,bounds} from './exchange-fixtures.mjs';
globalThis.DOMParser=DOMParser;globalThis.ProgressEvent??=class{constructor(type,init){Object.assign(this,{type},init);}};
function controller(){return createCadController({createWorker:()=>{const w=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),adapter={onmessage:null,onerror:null,postMessage:d=>w.postMessage(d),terminate:()=>w.terminate()};w.on('message',data=>adapter.onmessage?.({data}));w.on('error',e=>adapter.onerror?.(e));return adapter;}});}
test('Native CAD exports mixed solids/references, selected and hidden parts, preserving sources',async()=>{
 const cad=controller();try{
  await cad.execute({kind:'create',recipe:{type:'box',size:[10,8,6]},options:{id:'native',name:'Native',color:'#22cc66'}});const draft=cad.snapshot();
  for(const [i,p]of sampleParts().entries())draft.nodes.push({id:'ref'+i,kind:'referenceMesh',name:p.name,color:p.color,opacity:1,transform:i?new Matrix4().makeScale(-1,1,1).toArray():new Matrix4().toArray(),layerId:draft.activeLayerId,folderId:draft.activeFolderId,mesh:p.mesh,metadata:{importedFile:{name:'Assembly.3mf',type:'3mf'}}});
  await cad.open(draft);const source=cad.serialize(),undo=cad.state().undo;
  for(const format of ['3mf','gltf','glb']){const out=await cad.exportModel({format}),parsed=format==='3mf'?parseThreeMF(out.data):await parseGltf(out.data,{binary:format==='glb'});assert.equal(parsed.parts.length,3);assert.ok(parsed.parts.some(p=>p.color==='#22cc66'));const mirrored=parsed.parts.find(p=>p.name===sampleParts()[1].name);assert.ok(Math.abs(bounds(mirrored).center[0]-18)<.0001);
   const selected=await cad.exportModel({format,ids:['ref0']}),one=format==='3mf'?parseThreeMF(selected.data):await parseGltf(selected.data,{binary:format==='glb'});assert.equal(one.parts.length,1);assert.equal(one.parts[0].color,'#079ca9');
   if(format==='glb'){const loaded=await new GLTFLoader().parseAsync(out.data.buffer.slice(out.data.byteOffset,out.data.byteOffset+out.data.byteLength),'');assert.equal(loaded.scene.children.length,3);const box=new Box3().setFromObject(loaded.scene);assert.ok(Number.isFinite(box.min.x));loaded.scene.traverse(n=>{n.geometry?.dispose();n.material?.dispose();});}
  }
  assert.equal(cad.serialize(),source);assert.equal(cad.state().undo,undo);
  const hidden=cad.snapshot();hidden.nodes[1].hidden=true;hidden.layers.push({id:'hidden',name:'Hidden',hidden:true,locked:false});hidden.nodes[2].layerId='hidden';await cad.open(hidden);assert.equal(parseThreeMF((await cad.exportModel({format:'3mf'})).data).parts.length,1);
  assert.ok((await cad.exportModel({format:'step'})).data.length>100);assert.ok((await cad.exportModel({format:'stl'})).data.length>100);
 }finally{cad.dispose();}
});
