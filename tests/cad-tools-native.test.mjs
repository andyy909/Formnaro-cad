// Actual stock OCCT proofs for the isolated tool core. Extended native ray and
// general affine calls have a separate mandatory artifact gate, never mocks.
import test from 'node:test';
import assert from 'node:assert/strict';
import OCModule from 'replicad-opencascadejs';
import {Matrix4,Quaternion,Vector3} from 'three';
import {createCadService} from '../src/cad-service.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadProject,cadProjectRevision,serializeCadProject} from '../src/cad-project.js';
import {cadIdentity,cadPoint} from '../src/cad-affine.js';
import {createCadToolsNative,cadWorkplaneFromHit,measureCadPoints} from '../src/cad-tools-native.js';

const oc=await OCModule({print:()=>{},printErr:()=>{}});
const close=(a,b,error=1e-7)=>assert.ok(Math.abs(a-b)<=error,`${a} vs ${b}`);
const closeVector=(a,b,error=1e-7)=>a.forEach((v,k)=>close(v,b[k],error));
const placement=(x,y,z=0)=>new Matrix4().makeTranslation(x,y,z).toArray();
async function context(makeNodes){const service=createCadService({oc});try{const initial=await service.rebuild(createCadProject({nodes:makeNodes(service)})),transactions=createCadTransactions({initial,build:project=>service.rebuild(project)});return {service,transactions,tools:createCadToolsNative({oc,service,transactions})};}catch(error){service.dispose();throw error;}}
function cylinder(service,id,transform=cadIdentity(),solid=true){return service.nativeNode({type:'cylinder',size:[20,20,10]},{id,transform,solid});}

test('Native tool bounds ignore stored stats and rotated CAD AABB corners',async()=>{
  const c=await context(service=>[cylinder(service,'cylinder',new Matrix4().makeRotationZ(Math.PI/4).toArray())]);
  try{
    const project=c.transactions.snapshot();project.nodes[0].stats.bounds={min:[-100,-100,-100],max:[100,100,100]};project.nodes[0].stats.volume=99999;
    const bounds=c.tools.bounds({ids:['cylinder'],project});closeVector(bounds.size,[20,20,10]);closeVector(bounds.center,[0,0,0]);
    const frame=new Matrix4().makeTranslation(20,-8,3).multiply(new Matrix4().makeRotationZ(.3)).toArray(),framed=c.tools.bounds({ids:['cylinder'],frame});
    closeVector(framed.size,[20,20,10]);assert.equal(framed.byId[0].id,'cylinder');assert.ok(Math.abs(framed.center[0])>1);
    const before=cadProjectRevision(c.transactions.snapshot());c.service.display(c.transactions.snapshot(),{deflection:1,angleDegrees:45});assert.equal(cadProjectRevision(c.transactions.snapshot()),before);closeVector(c.tools.bounds({ids:['cylinder']}).size,bounds.size);
  }finally{c.service.dispose();}
});

test('Native closest-body distance resolves diagonal cylinders whose display-independent AABBs overlap',async()=>{
  const c=await context(service=>[cylinder(service,'left'),cylinder(service,'right',placement(15,15))]);
  try{const result=c.tools.minimumDistance({fromId:'left',toId:'right'});close(result.distance,Math.sqrt(450)-20,1e-6);close(result.distance,measureCadPoints(result.from,result.to).distance,1e-6);assert.ok(result.solutions>=1);}
  finally{c.service.dispose();}
});

test('Alignment in a rotated frame and exact anchor movement keep recipe data and one confirmed Undo',async()=>{
  const c=await context(service=>[cylinder(service,'move',placement(24,-8,3)),cylinder(service,'target',placement(0,10,0))]);
  try{
    const before=c.transactions.snapshot(),original=serializeCadProject(before),frame=new Matrix4().makeRotationZ(.7).toArray();
    const preview=await c.tools.previewAlign({ids:['move'],targetId:'target',axis:0,mode:'min',targetMode:'max',frame,revision:c.transactions.revision()});
    assert.equal(serializeCadProject(c.transactions.snapshot()),original);const applied=c.transactions.apply(preview),bounds=c.tools.bounds({ids:['move','target'],frame});close(bounds.byId[0].min[0],bounds.byId[1].max[0]);assert.deepEqual(applied.project.nodes[0].recipe,before.nodes[0].recipe);assert.equal(c.transactions.state().undo,1);
    const anchor=[0,0,-5],target=[1.23456789,-2.34567891,3.45678912],next=await c.tools.previewAnchor({id:'move',localPoint:anchor,targetPoint:target,revision:c.transactions.revision()});c.transactions.apply(next);closeVector(cadPoint(c.transactions.snapshot().nodes[0].transform,anchor),target,1e-12);
    c.transactions.undo();close(c.tools.bounds({ids:['move','target'],frame}).byId[0].min[0],bounds.byId[0].min[0]);c.transactions.undo();assert.equal(serializeCadProject(c.transactions.snapshot()),original);
  }finally{c.service.dispose();}
});

test('Native union/difference sources survive edits, suppression, dissolve, Undo and format-5 snapshots',async()=>{
  const c=await context(service=>{
    const body=cylinder(service,'body'),hole=service.nativeNode({type:'cylinder',size:[6,6,20]},{id:'hole',solid:false});return [body,hole];
  });
  try{
    const frame=placement(5,-3,2),p=await c.tools.previewGroup({ids:['body','hole'],id:'group',frame,revision:c.transactions.revision()});assert.equal(c.transactions.snapshot().nodes.length,2);c.transactions.apply(p);
    let group=c.transactions.snapshot().nodes[0];close(group.stats.volume,Math.PI*(100-9)*10,1e-5);assert.equal(group.children[1].id,'hole');closeVector(cadPoint(group.transform,cadPoint(group.children[0].transform,[0,0,0])),[0,0,0]);
    const edited=await c.tools.previewEditSource({groupId:'group',path:['hole'],patch:{recipe:{type:'cylinder',size:[8,8,20]}},revision:c.transactions.revision()});c.transactions.apply(edited);close(c.transactions.snapshot().nodes[0].stats.volume,Math.PI*(100-16)*10,1e-5);
    const suppressed=await c.tools.previewSuppressSource({groupId:'group',path:['hole'],suppressed:true,revision:c.transactions.revision()});c.transactions.apply(suppressed);close(c.transactions.snapshot().nodes[0].stats.volume,Math.PI*100*10,1e-5);
    const dissolved=await c.tools.previewDissolve({id:'group',revision:c.transactions.revision()});c.transactions.apply(dissolved);const sources=c.transactions.snapshot().nodes;assert.equal(sources.length,2);assert.equal(sources[1].hidden,true);assert.equal(sources[1].suppressed,undefined);assert.deepEqual(sources[1].recipe.size,[8,8,20]);closeVector(cadPoint(sources[0].transform,[0,0,0]),[0,0,0]);
    c.transactions.undo();group=c.transactions.snapshot().nodes[0];assert.equal(group.source,'group');assert.equal(group.children[1].suppressed,true);assert.equal(group.brep.triangulation,false);
  }finally{c.service.dispose();}
});

test('Actual native intersection and invalid source edits preserve unrelated roots and confirmed state',async()=>{
  const c=await context(service=>[service.nativeNode({type:'box',size:[10,10,10]},{id:'left'}),service.nativeNode({type:'box',size:[10,10,10]},{id:'right',transform:placement(4,0)}),cylinder(service,'other',placement(40,0))]);
  try{
    const other=structuredClone(c.transactions.snapshot().nodes[2]),preview=await c.tools.previewGroup({ids:['left','right'],id:'intersection',operation:'intersection',revision:c.transactions.revision()});c.transactions.apply(preview);close(c.transactions.snapshot().nodes[0].stats.volume,600);assert.deepEqual(c.transactions.snapshot().nodes[1],other);
    const before=serializeCadProject(c.transactions.snapshot()),undo=c.transactions.state().undo;
    await assert.rejects(c.tools.previewEditSource({groupId:'intersection',path:['right'],patch:{transform:placement(30,0)},revision:c.transactions.revision()}),/CAD-Operation ergibt keinen Körper|CAD-Körper/);assert.equal(serializeCadProject(c.transactions.snapshot()),before);assert.equal(c.transactions.state().undo,undo);
    assert.throws(()=>c.tools.previewEditSource({groupId:'intersection',path:['no-such-child'],patch:{solid:false},revision:c.transactions.revision()}),{code:'INVALID_CAD_SOURCE_PATH'});
  }finally{c.service.dispose();}
});

test('Reference meshes, locked containers, stale revisions and missing native ray interfaces fail explicitly',async()=>{
  const c=await context(service=>[cylinder(service,'cad'),{id:'mesh',kind:'referenceMesh',name:'Reference',transform:cadIdentity(),mesh:{verts:[0,0,0,1,0,0,0,1,0],triangles:[0,1,2]}}]);
  try{
    assert.throws(()=>c.tools.bounds({ids:['mesh']}),{code:'REFERENCE_MESH_NOT_CAD'});assert.throws(()=>c.tools.previewGroup({ids:['cad','mesh'],revision:c.transactions.revision()}),{code:'REFERENCE_MESH_NOT_CAD'});
    assert.throws(()=>c.tools.previewAnchor({id:'cad',localPoint:[0,0,0],targetPoint:[1,2,3],revision:'stale'}),{code:'STALE_REVISION'});
    assert.throws(()=>c.tools.rayPick({ray:{origin:[30,0,0],direction:[-1,0,0]}}),/IntCurvesFace/);
    const locked=c.transactions.snapshot();locked.layers[0].locked=true;c.transactions.apply(await c.transactions.preview({project:locked,revision:c.transactions.revision()}));
    assert.throws(()=>c.tools.previewAnchor({id:'cad',localPoint:[0,0,0],targetPoint:[1,2,3],revision:c.transactions.revision()}),{code:'LOCKED_CAD_OBJECT'});
  }finally{c.service.dispose();}
});

test('Loose negative CAD sources are excluded from placement rays unless explicitly requested',async()=>{
  const c=await context(service=>[cylinder(service,'hole',cadIdentity(),false)]);
  try{const ray={origin:[30,0,0],direction:[-1,0,0]};assert.equal(c.tools.rayPick({ray}),null);assert.throws(()=>c.tools.rayPick({ray,includeHoles:true}),/IntCurvesFace/);assert.throws(()=>c.tools.rayPick({ray,includeHoles:'yes'}),{code:'INVALID_CAD_SELECTION'});}
  finally{c.service.dispose();}
});

test('Workplane orientation uses the geometric normal; missing native rebind interfaces preserve confirmed state',async()=>{
  const c=await context(service=>[cylinder(service,'cad')]);
  try{
    const hit={objectId:'cad',point:[6,8,0],normal:[.6,.8,0],faceIndex:99},plane=cadWorkplaneFromHit(hit),z=new Vector3(0,0,1).applyQuaternion(new Quaternion(...plane.orientation)).toArray();closeVector(z,hit.normal,1e-12);assert.equal(plane.reference.topology.topologyId,undefined);assert.equal(plane.reference.topology.faceIndex,undefined);
    const before=serializeCadProject(c.transactions.snapshot()),draft=c.transactions.snapshot();draft.workplane=plane;await assert.rejects(c.transactions.preview({project:draft,revision:c.transactions.revision()}),/native Strahl|Normalschnittstelle/);assert.equal(serializeCadProject(c.transactions.snapshot()),before);assert.equal(c.transactions.state().undo,0);
  }finally{c.service.dispose();}
});

test('Workplane references retain local geometric anchors through shear and a mirror',()=>{
  const matrix=[-2,0,0,0,.5,1,0,0,0,.3,1,0,7,-3,2,1],localPoint=[6,8,0],worldNormal=new Vector3(-.3,.95,-.285).normalize().toArray();
  const plane=cadWorkplaneFromHit({objectId:'cad',point:cadPoint(matrix,localPoint),normal:worldNormal},{transform:matrix}),anchor=plane.reference.topology.anchor;
  closeVector(anchor.point,localPoint,1e-12);closeVector(anchor.normal,[.6,.8,0],1e-12);close(anchor.normal.reduce((sum,v,k)=>sum+v*anchor.tangent[k],0),0,1e-12);
  closeVector(new Vector3(0,0,1).applyQuaternion(new Quaternion(...plane.orientation)).toArray(),worldNormal,1e-12);
});
