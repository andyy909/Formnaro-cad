// Mandatory real-artifact gate for native ray/workplane/placement and full
// affine tool behavior. A missing extended kernel is a failure, never a skip.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {Quaternion,Vector3} from 'three';
import {createCadService} from '../src/cad-service.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadProject,serializeCadProject} from '../src/cad-project.js';
import {cadIdentity,cadPoint} from '../src/cad-affine.js';
import {createCadToolsNative} from '../src/cad-tools-native.js';

const moduleUrl=process.env.FORMNARO_CAD_MODULE?pathToFileURL(process.env.FORMNARO_CAD_MODULE):new URL('../cad-kernel-build/runtime/formnaro_cad.js',import.meta.url);
let loader;try{loader=(await import(moduleUrl.href)).default;}catch(error){throw Error(`Der erweiterte gemeinsame CAD-Kern fehlt (${fileURLToPath(moduleUrl)}). Zuerst cad-kernel-build/build.ps1 ausführen.`,{cause:error});}
const oc=await loader({print:()=>{},printErr:()=>{}}),close=(a,b,error=1e-6)=>assert.ok(Math.abs(a-b)<=error,`${a} vs ${b}`),closeVector=(a,b,error=1e-6)=>a.forEach((v,k)=>close(v,b[k],error));
async function context(makeNodes){const service=createCadService({oc});try{const initial=await service.rebuild(createCadProject({nodes:makeNodes(service)})),transactions=createCadTransactions({initial,build:project=>service.rebuild(project)});return {service,transactions,tools:createCadToolsNative({oc,service,transactions})};}catch(error){service.dispose();throw error;}}

test('Real native cylinder ray/workplane use a curved CAD normal independent of display quality',async()=>{
  const holePlacement=cadIdentity();holePlacement[12]=25;holePlacement[13]=3;
  const c=await context(service=>[service.nativeNode({type:'cylinder',size:[20,20,20]},{id:'target'}),service.nativeNode({type:'cylinder',size:[6,6,8]},{id:'hole',solid:false,transform:holePlacement})]);
  try{
    const ray={origin:[30,3,0],direction:[-1,0,0]},x=Math.sqrt(91),before=serializeCadProject(c.transactions.snapshot()),base=c.tools.rayPick({ray});assert.equal(base.objectId,'target');closeVector(base.point,[x,3,0]);closeVector(base.normal,[x/10,.3,0]);
    assert.equal(c.tools.rayPick({ray,includeHoles:true}).objectId,'hole');
    c.service.display(c.transactions.snapshot(),{deflection:1,angleDegrees:45});assert.deepEqual(c.tools.rayPick({ray}),base);c.service.display(c.transactions.snapshot(),{deflection:.002,angleDegrees:2});assert.deepEqual(c.tools.rayPick({ray}),base);
    const preview=await c.tools.previewWorkplane({ray,revision:c.transactions.revision()});assert.equal(serializeCadProject(c.transactions.snapshot()),before);c.transactions.apply(preview);const plane=c.transactions.snapshot().workplane;closeVector(plane.origin,base.point);closeVector(new Vector3(0,0,1).applyQuaternion(new Quaternion(...plane.orientation)).toArray(),base.normal);assert.equal(plane.reference.topology.topologyId,undefined);assert.equal(c.transactions.state().undo,1);c.transactions.undo();assert.equal(serializeCadProject(c.transactions.snapshot()),before);
  }finally{c.service.dispose();}
});

test('Real CAD placement preserves full affine recipe placement while its bottom normal follows the surface',async()=>{
  const matrix=[-1.2,.3,0,0,.4,1,0,0,.2,.1,1.1,0,0,0,30,1];
  const c=await context(service=>[service.nativeNode({type:'cylinder',size:[20,20,20]},{id:'target'}),service.nativeNode({type:'box',size:[4,6,8]},{id:'move',transform:matrix})]);
  try{
    const ray={origin:[30,3,0],direction:[-1,0,0]},hit=c.tools.rayPick({ray,ids:['target']}),before=c.transactions.snapshot(),anchor=[0,0,-4],preview=await c.tools.previewPlace({id:'move',ray,targetIds:['target'],localPoint:anchor,revision:c.transactions.revision()});c.transactions.apply(preview);const moved=c.transactions.snapshot().nodes[1];closeVector(cadPoint(moved.transform,anchor),hit.point);assert.deepEqual(moved.recipe,before.nodes[1].recipe);
    const a=[moved.transform[0],moved.transform[1],moved.transform[2]],b=[moved.transform[4],moved.transform[5],moved.transform[6]],worldPlaneNormal=new Vector3(...a).cross(new Vector3(...b)).normalize();
    // The source contains a mirror; its geometric plane normal has the
    // opposite cross-product orientation to the local +Z covector.
    worldPlaneNormal.negate();closeVector(worldPlaneNormal.toArray(),hit.normal);c.transactions.undo();assert.deepEqual(c.transactions.snapshot(),before);
  }finally{c.service.dispose();}
});

test('Real affine grouping/dissolve retains source matrices and ambiguous coincident hits fail',async()=>{
  const matrix=[-1.2,.3,0,0,.4,1,0,0,.2,.1,1.1,0,0,0,0,1],frame=[1,.2,0,0,.3,1,0,0,0,.1,1,0,3,4,5,1];
  const c=await context(service=>[service.nativeNode({type:'box',size:[4,6,8]},{id:'one',transform:matrix}),service.nativeNode({type:'box',size:[4,6,8]},{id:'two',transform:matrix})]);
  try{
    assert.throws(()=>c.tools.rayPick({ray:{origin:[30,0,0],direction:[-1,0,0]}}),{code:'AMBIGUOUS_CAD_HIT'});
    const before=c.transactions.snapshot(),group=await c.tools.previewGroup({ids:['one','two'],id:'group',frame,revision:c.transactions.revision()});c.transactions.apply(group);const dissolve=await c.tools.previewDissolve({id:'group',revision:c.transactions.revision()});c.transactions.apply(dissolve);const after=c.transactions.snapshot();
    for(let i=0;i<2;i++){assert.deepEqual(after.nodes[i].recipe,before.nodes[i].recipe);closeVector(cadPoint(after.nodes[i].transform,[1,2,3]),cadPoint(before.nodes[i].transform,[1,2,3]),1e-12);assert.equal(after.nodes[i].brep.triangulation,false);assert.equal(after.nodes[i].source,'native');}
  }finally{c.service.dispose();}
});
