import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'manifold-3d/manifold';
import {Worker} from 'node:worker_threads';
import {DOMParser} from '@xmldom/xmldom';
import {createCadController} from '../src/cad-controller.js';
import {cadProjectSnapshot,serializeCadProject,parseCadProject} from '../src/cad-project.js';
import {createMeshEngineAdapter} from '../src/mesh-engine-adapter.js';
import {makeNode,setKernel} from '../src/mesh-engine/geometry.js';
import {defaultOrganization} from '../src/mesh-engine/organization.js';
import {parseThreeMF,parseGltf} from '../src/exchange-formats.js';
import {projectObjectType,projectObjectGeometryDigest} from '../src/project-objects.js';
import {createCadRecovery,CAD_AUTOSAVE_KEY,CAD_LEGACY_AUTOSAVE_KEY,MIXED_AUTOSAVE_KEY} from '../src/cad-recovery.js';
import {createCadPersistence} from '../src/cad-persistence.js';
globalThis.DOMParser=DOMParser;

const openMesh=()=>({verts:[0,0,0,20,0,0,0,20,0],triangles:[0,1,2]});
const closedMesh=()=>({verts:[0,0,0,20,0,0,0,20,0,0,0,20],triangles:[0,2,1,0,1,3,1,2,3,2,0,3]});
const meshNode=(id,mesh)=>({id,kind:'mesh',name:id,transform:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],mesh,color:'#109ca9',opacity:.8,layerId:'default',folderId:null});
function factory(file){return ()=>{const w=new Worker(new URL(file,import.meta.url)),adapter={onmessage:null,onerror:null,postMessage:d=>w.postMessage(d),terminate:()=>w.terminate()};w.on('message',data=>adapter.onmessage?.({data}));w.on('error',e=>adapter.onerror?.(e));return adapter;};}
const controller=()=>createCadController({createWorker:factory('./fixtures/cad-node-worker.mjs'),createMeshWorker:factory('./fixtures/mesh-engine-node-worker.mjs')});
const kernel=await Module({wasmBinary:fs.readFileSync(new URL('../node_modules/manifold-3d/manifold.wasm',import.meta.url))});kernel.setup();setKernel(kernel);
const legacy=(version=4)=>({format:'OfflineCAD',version,name:'Alte Netzbaugruppe',nodes:[{...makeNode('box',[30,-12,7],{id:'box',size:[20,10,8],locked:true,notes:'Original',rot:[0,0,30]}),layerId:'default',folderId:null}],bed:[200,200],planeZ:0,workplane:{origin:[0,0,0],orientation:[0,0,0,1],reference:null},coordinateMode:'world',...defaultOrganization(),ruler:{origin:[4,5,6],mode:'min'}});

test('legacy versions use the retained mesh reader and preserve all original fields and recipes',()=>{
  const engine=createMeshEngineAdapter({kernel});
  for(const version of [1,2,3,4,6]){const input=legacy(version);if(version===1){delete input.workplane;delete input.layers;delete input.folders;input.planeZ=4;}
    const encoded=JSON.stringify(input),before=structuredClone(input),result=engine.importLegacy(encoded),p=result.project;
    assert.equal(p.version,8);assert.equal(p.nodes[0].kind,'mesh');assert.equal(p.nodes[0].locked,true);assert.equal(p.nodes[0].meshSource.node.params.edgeStyle,'none');assert.equal(p.nodes[0].metadata.notes,'Original');assert.deepEqual(JSON.parse(p.migrationSource.data),before);assert.deepEqual(input,before);assert.deepEqual(parseCadProject(serializeCadProject(p)),p);
  }
});

test('legacy invalid data and duplicate source IDs fail without changing original input',()=>{
  const engine=createMeshEngineAdapter({kernel});
  for(const change of [p=>p.nodes[0].size[0]=0,p=>p.nodes.push(structuredClone(p.nodes[0])),p=>p.version=5,p=>p.ruler.origin[0]=Infinity]){const p=legacy();change(p);const original=structuredClone(p);assert.throws(()=>engine.importLegacy(JSON.stringify(p)));assert.deepEqual(p,original);}
});

test('mixed native CAD, closed and open mesh share a real worker, file state, export and one history',async()=>{
  const cad=controller();try{
    await cad.execute({kind:'create',recipe:{type:'box',size:[10,8,6]},options:{id:'cad',name:'Native CAD',color:'#22cc66'}});
    const baseline=cad.serialize(),native=cad.snapshot().nodes[0],draft=cad.snapshot();draft.nodes.push(meshNode('closed',closedMesh()),meshNode('open',openMesh()));draft.nodes[1].transform[12]=40;draft.nodes[2].transform[12]=-40;
    const revision=cad.revision(),undo=cad.state().undo,proposal=await cad.preview(undefined,{project:draft,revision,label:'Gemischte Teile'});
    assert.equal(cad.serialize(),baseline);assert.equal(cad.state().undo,undo);
    const display=await cad.display(proposal.project);assert.equal(display.meshes.length,3);assert.equal(display.meshes[0].kind,'cad');assert.deepEqual(display.meshes[2].mesh,openMesh());
    cad.apply(proposal);assert.equal(cad.state().undo,undo+1);const mixed=cad.serialize();assert.equal(JSON.parse(mixed).version,8);assert.deepEqual(cad.snapshot().nodes[0],native);
    const scene=await cad.describe();assert.deepEqual(scene.objects.map(o=>o.objectType),['cad','closedMesh','openMesh']);assert.equal(scene.objects[1].capabilities.solidTools,false);assert.equal(scene.objects[2].worldBounds.size[2],0);
    const proof=await cad.inspectMeshSolid(cad.snapshot().nodes[1]);assert.equal(proof.ok,true);assert.equal(proof.geometryDigest,projectObjectGeometryDigest(cad.snapshot().nodes[1]));await assert.rejects(()=>cad.inspectMeshSolid(cad.snapshot().nodes[2]));
    for(const format of ['3mf','gltf','glb']){const result=await cad.exportModel({format}),parsed=format==='3mf'?parseThreeMF(result.data):await parseGltf(result.data,{binary:format==='glb'});assert.equal(parsed.parts.length,3);assert.equal(parsed.parts.find(p=>p.name==='open').mesh.triangles.length,3);}
    const restored=await cad.open(mixed);assert.equal(restored.changed,false);assert.equal(cad.serialize(),mixed);cad.undo();assert.equal(cad.serialize(),baseline);cad.redo();assert.equal(cad.serialize(),mixed);
    const moved=cad.snapshot();moved.nodes[2].transform[13]=12;const stale=await cad.preview(undefined,{project:moved});const another=cad.snapshot();another.name='Änderung';await cad.open(another);assert.throws(()=>cad.apply(stale),{code:'STALE_REVISION'});assert.deepEqual(cad.snapshot().nodes[0],native);
    const invalid=cad.snapshot();invalid.nodes[2].mesh.triangles[0]=999;await assert.rejects(()=>cad.preview(undefined,{project:invalid}));assert.equal(cad.snapshot().name,'Änderung');
  }finally{cad.dispose();}
});

test('legacy migration through separate worker is atomic and restores native CAD on undo',async()=>{
  const cad=controller();try{await cad.execute({kind:'create',recipe:{type:'box',size:[10,8,6]},options:{id:'cad'}});const before=cad.serialize(),encoded=JSON.stringify(legacy()),prepared=await cad.readProject(encoded);assert.equal(cad.serialize(),before);assert.equal(prepared.migration,true);assert.equal(prepared.project.migrationSource.data,encoded);
    await cad.open(prepared.project);const migrated=cad.serialize();assert.equal(cad.snapshot().nodes[0].name,'Quader');cad.undo();assert.equal(cad.serialize(),before);cad.redo();assert.equal(cad.serialize(),migrated);
  }finally{cad.dispose();}
});

test('mixed recovery preserves previous CAD autosaves and corrupt new recovery blocks every write',async()=>{
  const old=serializeCadProject({...(await import('../src/cad-project.js')).createCadProject()}),values=new Map([[CAD_AUTOSAVE_KEY,old],[CAD_LEGACY_AUTOSAVE_KEY,old]]),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},recovery=createCadRecovery(storage);
  await recovery.load(p=>p);const mixed=JSON.parse(old);mixed.nodes.push(meshNode('open',openMesh()));const encoded=serializeCadProject(mixed);
  recovery.write(encoded,{version:8});assert.equal(values.get(CAD_AUTOSAVE_KEY),old);assert.equal(values.get(CAD_LEGACY_AUTOSAVE_KEY),old);assert.equal(values.get(MIXED_AUTOSAVE_KEY),encoded);
  recovery.write(old,{version:5});assert.equal(values.get(MIXED_AUTOSAVE_KEY),old);assert.equal(values.get(CAD_AUTOSAVE_KEY),old);
  values.set(MIXED_AUTOSAVE_KEY,'broken-mixed-autosave');const corrupt=createCadRecovery(storage);await assert.rejects(()=>corrupt.load(p=>p));assert.equal(corrupt.write(encoded,{version:8}),false);assert.equal(values.get(MIXED_AUTOSAVE_KEY),'broken-mixed-autosave');assert.equal(values.get(CAD_AUTOSAVE_KEY),old);
});

test('native edits preserve mixed mesh sources; selection, hidden containers, mirror and hole roles control export',async()=>{
  const cad=controller();try{
    await cad.execute({kind:'create',recipe:{type:'box',size:[10,8,6]},options:{id:'cad'}});const draft=cad.snapshot();draft.nodes.push({...meshNode('kept',closedMesh()),locked:true},{...meshNode('hole',closedMesh()),meshRole:'hole'});draft.nodes[1].transform[0]=-1;await cad.open(draft);
    const meshBefore=cad.snapshot().nodes.slice(1);await cad.execute({kind:'batch',commands:[{op:'update',target:'cad',set:{size:[12,8,6]}}]});assert.deepEqual(cad.snapshot().nodes.slice(1),meshBefore);assert.notEqual(cad.snapshot().nodes[0].transform[0],draft.nodes[0].transform[0]);
    const selected=parseThreeMF((await cad.exportModel({format:'3mf',ids:['kept','hole']})).data);assert.equal(selected.parts.length,1);assert.equal(selected.parts[0].name,'kept');const proof=createMeshEngineAdapter({kernel}).inspectSolid({...meshNode('proof',selected.parts[0].mesh)});assert.ok(proof.volume>0,'mirrored winding retained outward orientation');
    const hidden=cad.snapshot();hidden.layers.push({id:'hidden',name:'Hidden',hidden:true,locked:true});hidden.nodes[1].layerId='hidden';await cad.open(hidden);const visible=parseThreeMF((await cad.exportModel({format:'3mf'})).data);assert.equal(visible.parts.length,1);assert.equal(cad.snapshot().nodes[1].locked,true);
  }finally{cad.dispose();}
});

test('selected CAD templates exclude unrelated archived mesh projects and remain compatible CAD files',async()=>{
 const cad=controller();try{
  const original=createMeshEngineAdapter({kernel}).importLegacy(JSON.stringify(legacy())).project;await cad.open(original);await cad.execute({kind:'create',recipe:{type:'box',size:[10,8,6]},options:{id:'new-cad'}});
  const confirmed=cad.serialize(),values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},persistence=createCadPersistence({storage,transactions:cad.transactions,verify:p=>cad.verify(p)});
  const template=persistence.saveTemplate({id:'only-cad',name:'Nur CAD',ids:['new-cad']});assert.equal(template.project.version,5);assert.equal(template.project.nodes.length,1);assert.equal(template.project.migrationSource,undefined);assert.equal(template.project.workspace,undefined);assert.equal(cad.serialize(),confirmed);assert.ok(!persistence.exportLibrary().includes('Originalparameter'));
 }finally{cad.dispose();}
});
