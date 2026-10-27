import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {Matrix4,Vector3,Quaternion,Euler} from 'three';
import load from '../cad-kernel-build/runtime/formnaro_cad.js';
import {createCadService} from '../src/cad-service.js';
import {createCadProject,parseCadProject,serializeCadProject} from '../src/cad-project.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadToolsNative} from '../src/cad-tools-native.js';
import {createCadCommandRouter,cloneCadSources} from '../src/cad-command-router.js';
import {cadIdentity,dissolveCadGroup} from '../src/cad-affine.js';
import {cadBoolean,writeCadBrep,validateCadSolid} from '../src/cad-native-kernel.js';
import {exportCadStep} from '../src/cad-step-io.js';
import {cadGeometryDigest,cadSourceGeometryDigest} from '../src/cad-geometry-digest.js';
import {createCadFinishNative,listCadEdgesNative} from '../src/cad-finish-native.js';
const oc=await load({print:()=>{},printErr:()=>{}}),near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} versus ${b}`);
function compound(items){const shape=new oc.TopoDS_Compound(),builder=new oc.TopoDS_Builder();try{builder.MakeCompound(shape);for(const item of items)builder.Add(shape,item);return shape;}finally{builder.delete();}}
function rawBox(service,size,position=[0,0,0]){return service.worldShape(service.nativeNode({type:'box',size},{transform:new Matrix4().makeTranslation(...position).toArray()}));}
async function fixture({positions=[[0,0,0],[30,0,0]],transform=cadIdentity(),cavity=false,nested=false}={}){
 const service=createCadService({oc}),owned=[];let shapes;
 if(cavity){const outer=rawBox(service,[30,30,30]),hole=rawBox(service,[20,20,20]);owned.push(outer,hole);const hollow=cadBoolean(oc,'difference',outer,hole),small=rawBox(service,[8,8,8],nested?[0,0,0]:[50,0,0]);owned.push(hollow,small);shapes=[hollow,small];}else{shapes=positions.map(pos=>rawBox(service,[10,10,10],pos));owned.push(...shapes);}
 const source=compound(shapes);owned.push(source);let body;try{body=service.stepNode(exportCadStep(oc,[{shape:source,name:'STEP fixture',color:'#1288ab'}]),{id:'body',name:'Assembly',transform,color:'#1288ab',metadata:{notes:'Keep'}});}finally{owned.reverse().forEach(s=>s.delete());}
 const other=service.nativeNode({type:'box',size:[3,4,5]},{id:'other',transform:new Matrix4().makeTranslation(200,0,0).toArray()}),initial=await service.rebuild(createCadProject({nodes:[body,other]})),transactions=createCadTransactions({initial,build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions});return {service,initial,transactions,tools};
}
test('Geometry SHA-256 agrees with native crypto and source identity ignores IDs/styles but detects native geometry edits',()=>{
 for(const text of ['', 'abc','ü𝟘−','a'.repeat(1000000),randomBytes(10000).toString('hex')])assert.equal(cadGeometryDigest(text),createHash('sha256').update(text).digest('hex'));
 const n={id:'root',kind:'cad',source:'native',transform:cadIdentity(),recipe:{type:'box',size:[10,10,10]},solid:true,color:'#112233'},hash=cadSourceGeometryDigest(n),copy=cloneCadSources(n);copy.color='#abcdef';copy.name='Different';assert.equal(cadSourceGeometryDigest(copy),hash);copy.recipe.size[0]=11;assert.notEqual(cadSourceGeometryDigest(copy),hash);
});
test('Imported separated STEP solids become independent native roots with complete sources, exact Undo/Redo and reload',async()=>{
 const f=await fixture();try{const before=f.transactions.serialize(),proposal=await f.tools.previewExtract({id:'body',revision:f.transactions.revision()}),parts=proposal.project.nodes.filter(n=>n.source==='extraction');assert.equal(parts.length,2);assert.equal(proposal.project.version,7);assert.deepEqual(proposal.project.nodes.at(-1),f.initial.nodes[1]);for(const p of parts){assert.equal(p.stats.solids,1);near(p.stats.volume,1000);assert.equal(p.children[0].brep.data,f.initial.nodes[0].brep.data);assert.deepEqual(p.transform,f.initial.nodes[0].transform);assert.deepEqual(p.children[0].transform,cadIdentity());assert.deepEqual(p.metadata,f.initial.nodes[0].metadata);assert.throws(()=>dissolveCadGroup(p),/vollständige Original/);const read=f.service.stepNode(f.service.exportStep(proposal.project,{ids:[p.id]}),{id:'read'});near(read.stats.volume,1000);}assert.notEqual(parts[0].children[0].id,parts[1].children[0].id);assert.equal(f.transactions.serialize(),before);f.transactions.apply(proposal);assert.equal(f.transactions.state().undo,1);const after=f.transactions.serialize();f.transactions.undo();assert.equal(f.transactions.serialize(),before);f.transactions.redo();assert.equal(f.transactions.serialize(),after);const reopened=await f.service.rebuild(parseCadProject(after));assert.deepEqual(reopened,proposal.project);
 }finally{f.service.dispose();}
});
test('Cavity shells stay in their owner; a separate body inside an empty cavity has positive native separation',async()=>{
 for(const nested of [false,true]){const f=await fixture({cavity:true,nested});try{const p=await f.tools.previewExtract({id:'body',revision:f.transactions.revision()}),parts=p.project.nodes.filter(n=>n.source==='extraction').sort((a,b)=>a.stats.volume-b.stats.volume);near(parts[0].stats.volume,512);near(parts[1].stats.volume,19000);assert.equal(parts[1].stats.solids,1);near(parts.reduce((v,n)=>v+n.stats.volume,0),19512);for(const n of parts){const read=f.service.stepNode(f.service.exportStep(p.project,{ids:[n.id]}),{id:'read'});near(read.stats.volume,n.stats.volume);}}finally{f.service.dispose();}}
});
test('Overlapping, face/edge/point touching and fully enclosed material bodies fail without replacing the imported original',async()=>{
 for(const positions of [[[0,0,0],[5,0,0]],[[0,0,0],[10,0,0]],[[0,0,0],[10,10,0]],[[0,0,0],[10,10,10]],[[0,0,0],[0,0,0]]]){const f=await fixture({positions});try{const before=f.transactions.serialize();await assert.rejects(f.tools.previewExtract({id:'body',revision:f.transactions.revision()}),{code:'CAD_SOLIDS_TOUCH'});assert.equal(f.transactions.serialize(),before);assert.equal(f.transactions.state().undo,0);}finally{f.service.dispose();}}
});
test('The full affine frame and body-relative placement survive extraction, move, reflection and nonuniform scale',async()=>{
 const matrix=new Matrix4().compose(new Vector3(17,8,30),new Quaternion().setFromEuler(new Euler(.3,-.4,.7)),new Vector3(-1.3,.7,1.5)).toArray();matrix[4]+=.2;const f=await fixture({transform:matrix});try{const proposal=await f.tools.previewExtract({id:'body',revision:f.transactions.revision()}),parts=proposal.project.nodes.filter(n=>n.source==='extraction'),original=f.service.inspect(f.initial.nodes[0]).volume;for(const p of parts){assert.deepEqual(p.transform,matrix);assert.deepEqual(p.children[0].transform,cadIdentity());near(f.service.inspect(p).volume,original/2,1e-4);}const beforeOther=structuredClone(parts[1]);parts[0].transform[12]+=20;parts[0].color='#abcdef';const changed=await f.service.rebuild(proposal.project);assert.deepEqual(changed.nodes.find(n=>n.id===beforeOther.id),beforeOther);assert.equal(changed.nodes[0].color,'#abcdef');
 }finally{f.service.dispose();}
});
test('Geometry correspondence rejects source transforms, BRep substitutions and false solid signatures atomically',async()=>{
 const f=await fixture();try{const proposal=await f.tools.previewExtract({id:'body',revision:f.transactions.revision()}),original=serializeCadProject(proposal.project);for(const change of [p=>p.nodes[0].children[0].transform[12]++,p=>p.nodes[0].children[0].brep.data=f.initial.nodes[1].brep.data,p=>p.nodes[0].extraction.solidSignature='0'.repeat(64)]){const p=structuredClone(proposal.project);change(p);await assert.rejects(f.service.rebuild(p),{code:'CAD_REEXTRACT_REQUIRED'});}assert.equal(serializeCadProject(proposal.project),original);
 }finally{f.service.dispose();}
});
test('Geometry-derived IDs are stable under duplicate/library renumbering, and ordinary format5 remains separate',async()=>{
 const f=await fixture();try{const p=(await f.tools.previewExtract({id:'body',revision:f.transactions.revision()})).project,copy=cloneCadSources(p.nodes[0]);assert.notEqual(copy.children[0].id,p.nodes[0].children[0].id);assert.equal(cadSourceGeometryDigest(copy.children[0]),copy.extraction.sourceSignature);const candidate={...p,nodes:[copy]};await f.service.rebuild(candidate);const wrong=structuredClone(candidate);wrong.version=5;assert.throws(()=>parseCadProject(wrong),/format 7/);wrong.version=6;assert.throws(()=>parseCadProject(wrong));assert.equal(createCadProject().version,5);
 }finally{f.service.dispose();}
});
test('Native extraction API aliases return every new body and inherited locks/stale revisions prevent preview',async()=>{
 const f=await fixture();try{await assert.rejects(f.tools.previewExtract({id:'body',revision:'old'}),{code:'STALE_REVISION'});const router=createCadCommandRouter({oc,service:f.service}),locked=f.transactions.snapshot();locked.layers[0].locked=true;await assert.rejects(router.run(locked,{kind:'batch',commands:[{op:'extractSolids',target:'body'}]}),/gesperrt/);const result=await router.run(f.initial,{kind:'batch',commands:[{op:'extractSolids',target:'body',as:'bodies'}]});assert.equal(result.aliases.bodies.length,2);assert.ok(result.aliases.bodies.every(id=>result.project.nodes.some(n=>n.id===id&&n.source==='extraction')));assert.equal(router.scene(result.project).projectVersion,7);
 }finally{f.service.dispose();}
});
test('Native group sources rebuild in the recorded construction frame and reject original source recipe edits',async()=>{
 const service=createCadService({oc});try{const a=service.nativeNode({type:'box',size:[10,10,10]},{id:'a'}),b=service.nativeNode({type:'cylinder',size:[8,8,10]},{id:'b',transform:new Matrix4().makeTranslation(30,0,0).toArray()}),group={...a,id:'group',source:'group',operation:'union',children:[a,b]};delete group.recipe;const initial=await service.rebuild(createCadProject({nodes:[group]})),tx=createCadTransactions({initial,build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions:tx}),proposal=await tools.previewExtract({id:'group',revision:tx.revision()});const p=proposal.project;p.nodes[0].transform=new Matrix4().makeRotationZ(.4).setPosition(10,20,30).toArray();await service.rebuild(p);const source=p.nodes[0].children[0];source.children[0].recipe.size[0]=11;await assert.rejects(service.rebuild(p),{code:'CAD_REEXTRACT_REQUIRED'});
 }finally{service.dispose();}
});
test('Extracted native bodies retain result-level finishing and reset without restoring the complete original',async()=>{
 const service=createCadService({oc,finish:createCadFinishNative({oc})});let shape,other,assembly;try{shape=service.worldShape(service.nativeNode({type:'cylinder',size:[20,20,16]},{id:'cylinder'}));other=rawBox(service,[5,5,5],[30,0,0]);assembly=compound([shape,other]);const body=service.stepNode(exportCadStep(oc,[{shape:assembly,name:'Fixture'}]),{id:'body'}),initial=await service.rebuild(createCadProject({nodes:[body]})),tx=createCadTransactions({initial,build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions:tx}),proposal=await tools.previewExtract({id:'body',revision:tx.revision()}),part=proposal.project.nodes.find(n=>n.stats.volume>1000),local=service.worldShape(part);let cap;try{cap=listCadEdgesNative(oc,local,{origin:{rootId:part.id,path:[]}}).find(e=>e.geometry.kind==='circle'&&e.geometry.closed);}finally{local.delete();}assert.ok(cap);const router=createCadCommandRouter({oc,service}),finished=(await router.run(proposal.project,{kind:'finish',target:part.id,step:{id:'rim',kind:'round',amount:.5,edges:[cap.reference]}})).project;assert.ok(finished.nodes.find(n=>n.id===part.id).stats.volume<part.stats.volume);const reset=(await router.run(finished,{kind:'editFinish',target:part.id,steps:[]})).project;assert.deepEqual(reset,proposal.project);
 }finally{assembly?.delete();other?.delete();shape?.delete();service.dispose();}
});
