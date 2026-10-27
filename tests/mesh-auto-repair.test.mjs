import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Worker} from 'node:worker_threads';
import Module from 'manifold-3d/manifold';
import {createMeshEngineAdapter} from '../src/mesh-engine-adapter.js';
import {meshEngineRequest} from '../src/mesh-engine-runtime.js';
import {createCadProject,cadProjectSnapshot,parseCadProject,serializeCadProject} from '../src/cad-project.js';
import {meshSelectionGeometryDigest} from '../src/mesh-selection-data.js';
import {createCadWorkerClient} from '../src/cad-worker-client.js';

const kernel=await Module({wasmBinary:fs.readFileSync(new URL('../node_modules/manifold-3d/manifold.wasm',import.meta.url))});
kernel.setup();
const engine=createMeshEngineAdapter({kernel});
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const node=project=>project.nodes.find(n=>n.id==='body');
const native=()=>({id:'native',kind:'cad',name:'Unrelated native body',source:'native',recipe:{type:'box',size:[5,6,7]},brep:{format:'OpenCascade-BRep',data:'synthetic-boundary-only',triangulation:false},stats:{bounds:{min:[0,0,0],max:[5,6,7]},volume:210,solids:1},transform:[...identity],solid:true,color:'#4488cc',layerId:'default',folderId:null});
const unrelated=()=>({id:'unrelated',kind:'mesh',name:'Unrelated open mesh',transform:[...identity],mesh:{verts:[30,0,0,31,0,0,30,1,0],triangles:[0,1,2]},color:'#aabbcc',layerId:'default',folderId:null});
async function cube(){
  const result=await engine.edit({project:createCadProject(),operation:{type:'mesh-create',shape:'box',id:'body',position:[0,0,5],size:[20,20,10]}});
  return cadProjectSnapshot({...result.project,nodes:[native(),...result.project.nodes,unrelated()]});
}
const query=(project,extra={})=>meshEngineRequest(engine,{job:'toolsQuery',project,kind:'autoRepair',id:'body',attemptedDigests:[],...extra});
const duplicate=project=>node(project).mesh.triangles.push(...node(project).mesh.triangles.slice(0,3));
const pointSet=mesh=>new Set(Array.from({length:mesh.verts.length/3},(_,i)=>JSON.stringify(mesh.verts.slice(i*3,i*3+3))));
function unchanged(project,before){assert.deepEqual(project,before,'a repair query must leave the input project unchanged');}
async function applyChecked(project,proposal){
  const before=structuredClone(project),source=structuredClone(node(project));
  assert.equal(proposal.status,'repaired');
  assert.equal(proposal.geometryDigest,meshSelectionGeometryDigest(source));
  const result=await engine.edit({project,operation:proposal.operation}),repaired=node(result.project);
  assert.equal(engine.inspectSolid(repaired).ok,true,'only a proven material body can be accepted');
  assert.equal(proposal.outputDigest,meshSelectionGeometryDigest(repaired));
  assert.deepEqual(repaired.transform,source.transform,'the complete source placement must remain exact');
  assert.deepEqual(repaired.meshSource.sources,[source],'the complete damaged original must be retained');
  assert.deepEqual(result.project.nodes.find(n=>n.id==='native'),before.nodes.find(n=>n.id==='native'));
  assert.deepEqual(result.project.nodes.find(n=>n.id==='unrelated'),before.nodes.find(n=>n.id==='unrelated'));
  const originalPoints=pointSet(source.mesh);
  for(const point of pointSet(repaired.mesh))assert.ok(originalPoints.has(point),'repair must not move or invent a point');
  assert.deepEqual(parseCadProject(serializeCadProject(result.project)),result.project,'the repaired original must survive project serialization');
  unchanged(project,before);
  return repaired;
}

test('automatic repair leaves a valid cube and all project bytes unchanged',async()=>{
  const project=await cube(),before=structuredClone(project),result=await query(project);
  assert.equal(result.status,'healthy');
  assert.equal(result.geometryDigest,meshSelectionGeometryDigest(node(project)));
  assert.equal(result.operation,undefined);
  unchanged(project,before);
});

test('automatic duplicate cleanup proposes the existing source-bound simple repair and preserves unrelated objects',async()=>{
  const project=await cube();duplicate(project);
  node(project).metadata.sourceReference={objectId:'original-cad-source',geometryDigest:'a'.repeat(64),operation:'cad-to-mesh'};
  const before=structuredClone(project),proposal=await query(project);
  unchanged(project,before);
  assert.equal(proposal.operation.type,'mesh-simple-repair');
  assert.equal(proposal.operation.options.geometryDigest,meshSelectionGeometryDigest(node(project)));
  assert.deepEqual(proposal.operation.options.removeComponents,[],'small components must never be selected for automatic deletion');
  const repaired=await applyChecked(project,proposal);
  assert.deepEqual(repaired.metadata.sourceReference,node(project).metadata.sourceReference,'historical source identity must survive automatic cleanup');
  assert.equal(repaired.mesh.triangles.length,node(project).mesh.triangles.length-3);
  assert.equal(engine.inspectSolid(repaired).volume,4000);
  const stale=structuredClone(project);node(stale).mesh.verts[0]+=.1;
  await assert.rejects(engine.edit({project:stale,operation:proposal.operation}),{code:'MESH_REPAIR_STALE'});
});

test('automatic repair corrects one reversed face through the existing simple recipe',async()=>{
  const project=await cube(),triangles=node(project).mesh.triangles;
  [triangles[1],triangles[2]]=[triangles[2],triangles[1]];
  const before=structuredClone(project),proposal=await query(project);
  unchanged(project,before);
  assert.equal(proposal.operation.type,'mesh-simple-repair');
  assert.equal(proposal.operation.options.orient,true);
  const repaired=await applyChecked(project,proposal);
  assert.equal(repaired.mesh.triangles.length,triangles.length);
  assert.equal(engine.inspectSolid(repaired).volume,4000);
});

test('automatic small-hole repair closes a missing cube top through the existing bounded recipe',async()=>{
  const project=await cube(),mesh=node(project).mesh,maxZ=Math.max(...mesh.verts.filter((_,i)=>i%3===2));
  const faces=Array.from({length:mesh.triangles.length/3},(_,i)=>mesh.triangles.slice(i*3,i*3+3));
  const top=faces.filter(face=>face.every(index=>mesh.verts[index*3+2]===maxZ));
  assert.equal(top.length,2,'the synthetic defect removes exactly the two top triangles');
  mesh.triangles=faces.filter(face=>!face.every(index=>mesh.verts[index*3+2]===maxZ)).flat();
  const before=structuredClone(project),proposal=await query(project);
  unchanged(project,before);
  assert.equal(proposal.operation.type,'mesh-repair');
  assert.equal(proposal.operation.fillSmallHoles,true);
  const repaired=await applyChecked(project,proposal);
  assert.equal(repaired.mesh.triangles.length,36);
  assert.equal(engine.inspectSolid(repaired).volume,4000);
});

test('an irreparable open triangle has no operation and remains byte-for-byte unchanged',async()=>{
  const project=await cube();node(project).mesh={verts:[0,0,0,1,0,0,0,1,0],triangles:[0,1,2]};delete node(project).meshSource;
  const before=structuredClone(project),result=await query(project);
  assert.equal(result.status,'unrepairable');
  assert.equal(result.geometryDigest,meshSelectionGeometryDigest(node(project)));
  assert.equal(result.operation,undefined);
  assert.ok(result.reason);
  unchanged(project,before);
});

test('automatic repair keeps disconnected material components and never deletes an open island to obtain a solid',async()=>{
  const project=await cube(),mesh=node(project).mesh,vertices=mesh.verts.length/3,firstMesh=structuredClone(mesh);
  mesh.verts.push(...firstMesh.verts.map((v,i)=>i%3===0?v+3:v));
  mesh.triangles.push(...firstMesh.triangles.map(index=>index+vertices));
  delete node(project).meshSource;duplicate(project);
  const proposal=await query(project),repaired=await applyChecked(project,proposal);
  assert.equal(engine.inspectSolid(repaired).volume,8000,'both disconnected cubes must remain material');
  assert.deepEqual(proposal.operation.options.removeComponents,[]);
  const withIsland=structuredClone(project),island=node(withIsland).mesh,index=island.verts.length/3;
  island.verts.push(10,0,0,11,0,0,10,1,0);island.triangles.push(index,index+1,index+2);
  const before=structuredClone(withIsland),result=await query(withIsland);
  assert.equal(result.status,'unrepairable');
  assert.equal(result.operation,undefined);
  unchanged(withIsland,before);
});

test('locked, hidden, inherited locked or hidden, and protected meshes are skipped unchanged',async()=>{
  const changes=[
    project=>{node(project).locked=true;},
    project=>{node(project).hidden=true;},
    project=>{project.layers[0].locked=true;},
    project=>{project.layers[0].hidden=true;},
    project=>{project.folders=[{id:'parent',name:'Parent',layerId:'default',parentId:null,locked:true,hidden:false},{id:'child',name:'Child',layerId:'default',parentId:'parent',locked:false,hidden:false}];node(project).folderId='child';},
    project=>{project.folders=[{id:'parent',name:'Parent',layerId:'default',parentId:null,locked:false,hidden:true},{id:'child',name:'Child',layerId:'default',parentId:'parent',locked:false,hidden:false}];node(project).folderId='child';},
    project=>{node(project).metadata.meshProtection={format:'FormnaroMeshProtection',version:1,regions:[{id:'contact',name:'Contact area',purpose:'contact',geometryDigest:meshSelectionGeometryDigest(node(project)),triangleIds:[0]}]};}
  ];
  for(const change of changes){
    const project=await cube();duplicate(project);change(project);
    const before=structuredClone(project),result=await query(project);
    assert.equal(result.status,'skipped');assert.equal(result.operation,undefined);unchanged(project,before);
  }
});

test('the same attempted source digest is skipped while a genuinely changed source remains eligible',async()=>{
  const project=await cube();duplicate(project);
  const before=structuredClone(project),geometryDigest=meshSelectionGeometryDigest(node(project));
  const result=await query(project,{attemptedDigests:[geometryDigest]});
  assert.equal(result.status,'skipped');assert.equal(result.geometryDigest,geometryDigest);assert.equal(result.operation,undefined);unchanged(project,before);
  const changed=structuredClone(project);node(changed).mesh.triangles.push(...node(changed).mesh.triangles.slice(3,6));
  assert.notEqual(meshSelectionGeometryDigest(node(changed)),geometryDigest);
  assert.equal((await query(changed,{attemptedDigests:[geometryDigest]})).status,'repaired');
});

test('automatic repair retains mirrored, translated and sheared affine placement exactly',async()=>{
  const project=await cube();duplicate(project);
  node(project).transform=[-20,.3,0,0,5,20,.4,0,0,.2,10,0,40,-12,27,1];
  Object.assign(node(project),{name:'Mirrored original',color:'#123456',opacity:.55,meshRole:'hole'});
  node(project).metadata.notes='Retain these exact source notes.';
  const before=structuredClone(project),proposal=await query(project),repaired=await applyChecked(project,proposal);
  unchanged(project,before);
  assert.deepEqual(repaired.transform,node(project).transform);
  for(const field of ['name','color','opacity','meshRole','metadata']){
    if(field==='metadata')assert.equal(repaired.metadata.notes,node(project).metadata.notes);
    else assert.deepEqual(repaired[field],node(project)[field]);
  }
});

test('the actual mesh worker carries the pure repair proposal and applies the existing operation unchanged',async()=>{
  const project=await cube();duplicate(project);const before=structuredClone(project);
  const service=createCadWorkerClient({confirmed:()=>project,createWorker:()=>{
    const worker=new Worker(new URL('./fixtures/mesh-engine-node-worker.mjs',import.meta.url));
    const bridge={onmessage:null,onerror:null,postMessage:data=>worker.postMessage(data),terminate:()=>worker.terminate()};
    worker.on('message',data=>bridge.onmessage?.({data}));worker.on('error',error=>bridge.onerror?.(error));return bridge;
  }});
  try{
    const proposal=await service.run({job:'toolsQuery',project,kind:'autoRepair',id:'body',attemptedDigests:[]},{revision:'source-revision'});
    assert.equal(proposal.status,'repaired');unchanged(project,before);
    const result=await service.run({job:'edit',project,operation:proposal.operation},{revision:'source-revision'});
    assert.equal(engine.inspectSolid(node(result.project)).ok,true);
    assert.equal(meshSelectionGeometryDigest(node(result.project)),proposal.outputDigest);
    assert.deepEqual(node(result.project).meshSource.sources,[node(before)]);
    assert.deepEqual(result.project.nodes.find(n=>n.id==='native'),before.nodes.find(n=>n.id==='native'));
    assert.deepEqual(result.project.nodes.find(n=>n.id==='unrelated'),before.nodes.find(n=>n.id==='unrelated'));
    unchanged(project,before);
  }finally{service.dispose();}
});
