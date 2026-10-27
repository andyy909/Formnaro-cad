import test from 'node:test';
import assert from 'node:assert/strict';
import {createCadController} from '../src/cad-controller.js';
import {createCadProject} from '../src/cad-project.js';
import {meshEngineRequest} from '../src/mesh-engine-runtime.js';
const transform=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const mesh={id:'mesh',kind:'mesh',name:'Target',mesh:{verts:[0,0,0,1,0,0,0,1,0],triangles:[0,1,2]},transform,color:'#ff0000',layerId:'default',folderId:null};
const cad={id:'unrelated',kind:'cad',name:'Unrelated CAD',source:'step',solid:true,transform,brep:{format:'OpenCascade-BRep',data:'synthetic-brep'.repeat(10000),triangulation:false},stats:{bounds:{min:[0,0,0],max:[1,1,1]},volume:1,solids:1}};
function fixture(){
 const messages=[];let generation;
 const worker={onmessage:null,onerror:null,terminate(){},postMessage(message){messages.push(structuredClone(message));if(message.type==='initialize'){generation=message.generation;return;}queueMicrotask(async()=>{const result=await meshEngineRequest({inspectSolid:node=>({ok:node.id==='mesh',id:node.id}),analyzeEdges:node=>({id:node.id,edges:[]}),toolsQuery:request=>({ids:request.project.nodes.map(n=>n.id)})},message.request);worker.onmessage?.({data:{type:'result',generation,id:message.id,revision:message.revision,result}});});}};
 const controller=createCadController({initial:createCadProject({nodes:[mesh,cad]}),createWorker:()=>{throw Error('Native worker unnecessary for a mesh-only inspection');},createMeshWorker:()=>worker});
 return {controller,messages};
}
test('single mesh inspections transfer only that node and never duplicate the confirmed project at initialization',async()=>{
 const {controller,messages}=fixture();try{const before=controller.serialize(),revision=controller.revision();
  assert.deepEqual(await controller.inspectMeshSolid(controller.snapshot().nodes[0]),{ok:true,id:'mesh'});
  assert.deepEqual(await controller.meshQuery('analyzeEdges',{id:'mesh'}),{id:'mesh',edges:[]});
  assert.equal(messages[0].type,'initialize');assert.equal(messages[0].confirmed,null);
  for(const message of messages.filter(m=>m.type==='compute')){assert.deepEqual(Object.keys(message.request).sort(),['job','node']);assert.equal(message.request.node.id,'mesh');assert.equal(JSON.stringify(message).includes(cad.brep.data),false);assert.equal(message.revision,revision);}
  assert.equal(controller.serialize(),before);assert.equal(controller.state().undo,0);
 }finally{controller.dispose();}
});
test('project-wide mesh tools still receive the complete current project',async()=>{
 const {controller,messages}=fixture();try{assert.deepEqual(await controller.meshQuery('toolsQuery',{kind:'features',id:'mesh'}),{ids:['mesh','unrelated']});assert.equal(messages.at(-1).request.project.nodes.length,2);}finally{controller.dispose();}
});
