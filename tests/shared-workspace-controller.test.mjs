import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import * as THREE from 'three';
import {createCadController} from '../src/cad-controller.js';
import {createCadProject,parseCadProject,serializeCadProject,cadProjectSnapshot,createCadWorkspaceSerializer} from '../src/cad-project.js';
import {makeMeshWorkplane,meshWorkplaneGeometryDigest} from '../src/mesh-workplane.js';
import {CAD_QUALITY_DEFAULTS} from '../src/cad-quality.js';
import {defaultLayout} from '../src/layout-preferences.js';

const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const open=(id='open',kind='mesh')=>({id,kind,name:id,color:'#109ca9',layerId:'default',folderId:null,transform:[...identity],mesh:{verts:[0,0,0,20,0,0,0,20,0],triangles:[0,1,2]}});
const cube=(id='cube',x=0)=>({id,kind:'mesh',name:id,color:'#109ca9',layerId:'default',folderId:null,transform:[1,0,0,0,0,1,0,0,0,0,1,0,x,0,0,1],mesh:{verts:[-10,-10,0,10,-10,0,10,10,0,-10,10,0,-10,-10,20,10,-10,20,10,10,20,-10,10,20],triangles:[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]}});
function factory(file){return ()=>{const worker=new Worker(new URL(file,import.meta.url)),bridge={onmessage:null,onerror:null,postMessage:data=>worker.postMessage(data),terminate:()=>worker.terminate()};worker.on('message',data=>bridge.onmessage?.({data}));worker.on('error',error=>bridge.onerror?.(error));return bridge;};}
const fixture=initial=>createCadController({initial:initial??createCadProject(),createWorker:factory('./fixtures/cad-node-worker.mjs'),createMeshWorker:factory('./fixtures/mesh-engine-node-worker.mjs')});
const near=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const vectorNear=(a,b,tolerance=1e-7)=>a.forEach((value,i)=>near(value,b[i],tolerance));
const worldPoint=(node,point)=>new THREE.Vector3(...point).applyMatrix4(new THREE.Matrix4().fromArray(node.transform)).toArray();
async function commit(cad,project){const proposal=await cad.preview(undefined,{project});cad.apply(proposal);return proposal;}
async function anchoredCube(cad,{second=false}={}){
  await cad.execute({kind:'create',recipe:{type:'box',size:[6,8,4]},options:{id:'native',name:'Native preserved'}});const draft=cad.snapshot();draft.nodes.push(cube(),...(second?[cube('other',30)]:[]));draft.workplane=makeMeshWorkplane(draft.nodes[1],2,[3,2,20]);await commit(cad,draft);return cad.snapshot();
}
const workspace=version=>({version,view:{projection:'orthographic',position:[120,-140,90],target:[0,0,0],up:[0,0,1],zoom:1.25},selection:[{rootId:'native',path:[]}],mode:'translate',snap:.5,quality:structuredClone(CAD_QUALITY_DEFAULTS),layout:defaultLayout(),...(version===2?{tree:{expanded:[{kind:'object',rootId:'native',path:[]},{kind:'meshSource',rootId:'cube',path:['source']}]} }:{})});

test('one controller follows mesh face anchors through native batch transforms and full affine draft edits',async()=>{
  const cad=fixture();try{
    const baseline=await anchoredCube(cad),native=baseline.nodes[0],mesh=structuredClone(baseline.nodes[1]),reference=structuredClone(baseline.workplane.reference),before=cad.serialize();
    const move=await cad.preview({kind:'batch',commands:[{op:'transform',target:'cube',translate:[12,-7,5],rotate:[15,5,30],scale:[1.2,.8,1.1],space:'world'}]});assert.equal(cad.serialize(),before);assert.deepEqual(move.project.nodes[0],native);vectorNear(move.project.workplane.origin,worldPoint(move.project.nodes[1],reference.point));assert.deepEqual(move.project.workplane.reference,reference);cad.apply(move);
    const placed=cad.snapshot();placed.nodes[1].transform=[-2,.3,0,0,1,3,.4,0,.6,.2,.5,0,14,-8,50,1];const proposal=await commit(cad,placed),after=cad.serialize(),normal=new THREE.Vector3(...reference.normal).applyMatrix3(new THREE.Matrix3().getNormalMatrix(new THREE.Matrix4().fromArray(placed.nodes[1].transform))).normalize(),actualNormal=new THREE.Vector3(0,0,1).applyQuaternion(new THREE.Quaternion(...proposal.project.workplane.orientation));vectorNear(proposal.project.workplane.origin,worldPoint(placed.nodes[1],reference.point));vectorNear(actualNormal.toArray(),normal.toArray());assert.deepEqual(proposal.project.nodes[1].mesh,mesh.mesh);assert.deepEqual(proposal.project.nodes[0],native);assert.equal(meshWorkplaneGeometryDigest(proposal.project.nodes[1]),reference.geometryDigest);
    cad.undo();cad.redo();assert.equal(cad.serialize(),after);assert.deepEqual(parseCadProject(after),cad.snapshot());
  }finally{cad.dispose();}
});

test('mesh creation follows the shared tilted plane through preview, source edits and one undo history',async()=>{
  const cad=fixture();try{
    const baseline=await anchoredCube(cad),native=structuredClone(baseline.nodes[0]),source=structuredClone(baseline.nodes[1]),plane=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(.35,-.6,.2)).setPosition(25,-15,12),draft=cad.snapshot();draft.workplane={origin:[25,-15,12],orientation:new THREE.Quaternion().setFromRotationMatrix(plane).toArray(),reference:null};await commit(cad,draft);const before=cad.serialize(),depth=cad.state().undo,frame=plane.toArray(),operation={type:'mesh-create',shape:'box',id:'plane-created',position:[0,0,5],size:[8,6,10],frame};
    const proposal=await cad.preview(operation);assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,depth);const created=proposal.project.nodes.find(n=>n.id==='plane-created'),expected=plane.clone().multiply(new THREE.Matrix4().makeTranslation(0,0,5)).multiply(new THREE.Matrix4().makeScale(8,6,10));vectorNear(created.transform,expected.toArray());assert.deepEqual(created.meshSource.node.pos,[0,0,5]);assert.deepEqual(created.meshSource.node.size,[8,6,10]);assert.deepEqual(proposal.project.nodes[0],native);assert.deepEqual(proposal.project.nodes[1],source);assert.deepEqual(proposal.project.workplane,draft.workplane);cad.apply(proposal);const after=cad.serialize();assert.equal(cad.state().undo,depth+1);cad.undo();assert.equal(cad.serialize(),before);cad.redo();assert.equal(cad.serialize(),after);
    await cad.execute({type:'mesh-source-edit',id:'plane-created',path:[],set:{size:[10,6,10]}});const resized=cad.snapshot().nodes.find(n=>n.id==='plane-created'),resizedExpected=plane.clone().multiply(new THREE.Matrix4().makeTranslation(0,0,5)).multiply(new THREE.Matrix4().makeScale(10,6,10));vectorNear(resized.transform,resizedExpected.toArray());assert.deepEqual(cad.snapshot().nodes[0],native);assert.deepEqual(cad.snapshot().nodes[1],source);assert.deepEqual(parseCadProject(cad.serialize()),cad.snapshot());
    const invalid=frame.map((v,i)=>i===15?0:v),saved=cad.serialize();await assert.rejects(()=>cad.preview({...operation,id:'invalid-frame',frame:invalid}));assert.equal(cad.serialize(),saved);
  }finally{cad.dispose();}
});

test('mesh geometry edits, split and grouping detach at the confirmed world pose and undo restores the reference',async()=>{
  const cad=fixture();try{
    await anchoredCube(cad,{second:true});const moved=cad.snapshot();moved.nodes[1].transform[12]=7;moved.nodes[1].transform[14]=4;await commit(cad,moved);const before=cad.serialize(),anchor=structuredClone(cad.snapshot().workplane),native=structuredClone(cad.snapshot().nodes[0]);
    for(const operation of [{type:'mesh-split',id:'cube',plane:{normal:[1,0,0],offset:7}},{type:'mesh-group',ids:['cube','other'],operation:'union'}]){
      const proposal=await cad.preview(operation);assert.equal(cad.serialize(),before);assert.equal(proposal.project.workplane.reference,null);vectorNear(proposal.project.workplane.origin,anchor.origin);vectorNear(proposal.project.workplane.orientation,anchor.orientation);assert.deepEqual(proposal.project.nodes[0],native);assert.ok(proposal.warnings.some(value=>value.includes('Netzbezugsfläche')));cad.apply(proposal);const after=cad.serialize();cad.undo();assert.equal(cad.serialize(),before);cad.redo();assert.equal(cad.serialize(),after);cad.undo();
    }
    const changed=cad.snapshot();changed.nodes[1].mesh.verts[0]-=1;changed.nodes[1].transform[12]=99;const preview=await cad.preview(undefined,{project:changed});assert.equal(preview.project.workplane.reference,null);vectorNear(preview.project.workplane.origin,anchor.origin);assert.deepEqual(preview.project.nodes[0],native);cad.apply(preview);cad.undo();assert.equal(cad.serialize(),before);
  }finally{cad.dispose();}
});

test('native CAD grouping, source edits and dissolve leave an unrelated mesh workplane and sources intact',async()=>{
  const cad=fixture();try{
    await anchoredCube(cad);await cad.execute({kind:'create',recipe:{type:'box',size:[5,8,4]},options:{id:'native2',name:'Second native',transform:[1,0,0,0,0,1,0,0,0,0,1,0,4,0,0,1]}});const mesh=structuredClone(cad.snapshot().nodes.find(n=>n.id==='cube')),plane=structuredClone(cad.snapshot().workplane),native=structuredClone(cad.snapshot().nodes.find(n=>n.id==='native'));
    const groupProposal=await cad.preview({kind:'batch',commands:[{op:'group',targets:['native','native2'],as:'joined'}]});cad.apply(groupProposal);const group=cad.snapshot().nodes.find(n=>n.kind==='cad');assert.deepEqual(cad.snapshot().workplane,plane);assert.deepEqual(cad.snapshot().nodes.find(n=>n.id==='cube'),mesh);assert.equal(group.children.find(n=>n.id==='native').brep.data,native.brep.data);
    await cad.execute({kind:'batch',commands:[{op:'update',target:{rootId:group.id,path:['native2']},set:{size:[6,8,4],name:'Edited native source'}}]});assert.deepEqual(cad.snapshot().workplane,plane);assert.deepEqual(cad.snapshot().nodes.find(n=>n.id==='cube'),mesh);
    await cad.execute({kind:'tool',name:'previewDissolve',options:{id:group.id}});assert.deepEqual(cad.snapshot().workplane,plane);assert.deepEqual(cad.snapshot().nodes.find(n=>n.id==='cube'),mesh);
  }finally{cad.dispose();}
});

test('deleting mesh roots by CAD command or common draft keeps the last plane and a reversible history',async()=>{
  const cad=fixture();try{
    await anchoredCube(cad);const before=cad.serialize(),plane=structuredClone(cad.snapshot().workplane),native=structuredClone(cad.snapshot().nodes[0]);
    const deleted=await cad.preview({kind:'batch',commands:[{op:'delete',target:'cube'}]});assert.equal(deleted.project.workplane.reference,null);vectorNear(deleted.project.workplane.origin,plane.origin);assert.deepEqual(deleted.project.nodes,[native]);cad.apply(deleted);cad.undo();assert.equal(cad.serialize(),before);
    const draft=cad.snapshot();draft.nodes=draft.nodes.filter(n=>n.id!=='cube');const removed=await cad.preview(undefined,{project:draft});assert.equal(removed.project.workplane.reference,null);vectorNear(removed.project.workplane.origin,plane.origin);assert.ok(removed.warnings.length>0);cad.apply(removed);const after=cad.serialize();cad.undo();assert.equal(cad.serialize(),before);cad.redo();assert.equal(cad.serialize(),after);
  }finally{cad.dispose();}
});

test('a reference-only CAD5 project promotes to format8 only when a mesh plane is attached',async()=>{
  const initial=createCadProject({nodes:[open('reference','referenceMesh')]}),oldBytes=serializeCadProject(initial);assert.equal(initial.version,5);const cad=fixture(initial);try{
    const draft=cad.snapshot();draft.workplane=makeMeshWorkplane(draft.nodes[0],0,[4,5,0]);const proposal=await cad.preview(undefined,{project:draft});assert.equal(proposal.project.version,8);assert.equal(cad.serialize(),oldBytes);cad.apply(proposal);const saved=cad.serialize();assert.equal(JSON.parse(saved).workplane.reference.kind,'mesh');await cad.open(saved);assert.equal(cad.serialize(),saved);cad.undo();assert.equal(cad.serialize(),oldBytes);cad.redo();assert.equal(cad.serialize(),saved);
    const claimed=JSON.parse(saved);claimed.version=5;assert.throws(()=>parseCadProject(JSON.stringify(claimed)),/Projektformat 8/);
  }finally{cad.dispose();}
});

test('workspace2 source tree uses format8; old CAD5 workspace1 and native bytes remain compatible',async()=>{
  const cad=fixture();try{
    await cad.execute({kind:'create',recipe:{type:'box',size:[6,8,4]},options:{id:'native'}});const native=structuredClone(cad.snapshot().nodes[0]),oldBytes=cad.serialize(),oldWorkspace=workspace(1),serializer=createCadWorkspaceSerializer(cad.snapshot());const legacy=serializer(oldWorkspace);assert.equal(JSON.parse(legacy).version,5);assert.deepEqual(parseCadProject(legacy).workspace,oldWorkspace);assert.deepEqual(parseCadProject(legacy).nodes[0],native);assert.equal(cad.serialize(),oldBytes);assert.throws(()=>serializer(workspace(2)),/Projektformat 8/);
    const draft=cad.snapshot();draft.workspace=workspace(2);await commit(cad,draft);const saved=cad.serialize(),parsed=parseCadProject(saved);assert.equal(parsed.version,8);assert.deepEqual(parsed.workspace.tree,draft.workspace.tree);assert.deepEqual(parsed.nodes[0],native);assert.equal(cad.serializeWorkspace(draft.workspace),saved);
    const falseClaim=JSON.parse(saved);falseClaim.version=5;assert.throws(()=>parseCadProject(JSON.stringify(falseClaim)),/Projektformat 8/);const malformed=cad.snapshot();malformed.workspace.tree.expanded.push(structuredClone(malformed.workspace.tree.expanded[0]));assert.throws(()=>parseCadProject(JSON.stringify(malformed)),/Doppelter/);assert.equal(cad.serialize(),saved);cad.undo();assert.equal(cad.serialize(),oldBytes);cad.redo();assert.equal(cad.serialize(),saved);
  }finally{cad.dispose();}
});

test('stale or malformed external anchors reject, malformed previews reject and a later revision rejects stale apply',async()=>{
  const cad=fixture();try{
    await anchoredCube(cad);const before=cad.serialize(),undo=cad.state().undo;
    for(const change of [ref=>ref.geometryDigest='0'.repeat(64),ref=>ref.point=[500,500,500],ref=>ref.normal=[0,0,0],ref=>ref.extra=true]){const malformed=JSON.parse(before);change(malformed.workplane.reference);await assert.rejects(()=>cad.readProject(JSON.stringify(malformed)));assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,undo);}
    for(const change of [ref=>ref.normal=[0,0,0],ref=>ref.tangent=[0,0,1],ref=>ref.extra=true]){const malformed=cad.snapshot();change(malformed.workplane.reference);await assert.rejects(()=>cad.preview(undefined,{project:malformed}));assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,undo);}
    const draft=cad.snapshot();draft.nodes[1].transform[12]=4;const stale=await cad.preview(undefined,{project:draft}),other=cad.snapshot();other.name='Later revision';await commit(cad,other);assert.throws(()=>cad.apply(stale),{code:'STALE_REVISION'});assert.equal(cad.snapshot().name,'Later revision');assert.deepEqual(cad.snapshot().nodes[0],JSON.parse(before).nodes[0]);
  }finally{cad.dispose();}
});
