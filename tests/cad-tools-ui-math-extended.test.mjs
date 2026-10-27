import test from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4,PerspectiveCamera} from 'three';
import {pathToFileURL} from 'node:url';
import {createCadProject} from '../src/cad-project.js';
import {createCadService} from '../src/cad-service.js';
import {createCadCommandRouter} from '../src/cad-command-router.js';
import {createCadPrecisionNative} from '../src/cad-precision-native.js';
import {cadFitDimensions,cadSelectionFrustumPlanes} from '../src/cad-tools-ui-math.js';
import {cadIdentity,cadPoint} from '../src/cad-affine.js';

const moduleUrl=process.env.FORMNARO_CAD_MODULE?pathToFileURL(process.env.FORMNARO_CAD_MODULE):new URL('../cad-kernel-build/runtime/formnaro_cad.js',import.meta.url),loader=(await import(moduleUrl.href)).default,oc=await loader({print:()=>{},printErr:()=>{}});
const close=(a,b,error=1e-5)=>assert.ok(Math.abs(a-b)<=error,`${a} vs ${b}`),closeVector=(a,b,error=1e-5)=>a.forEach((v,k)=>close(v,b[k],error));

test('CAD fit size commands add the requested physical clearance under a sheared and mirrored parent without moving the source center',async()=>{
  const service=createCadService({oc});try{
    const placement=new Matrix4().makeRotationZ(.4).multiply(new Matrix4().makeScale(-1,1,1)).setPosition(2,4,1).toArray(),child=service.nativeNode({type:'box',size:[20,10,8]},{id:'child',transform:placement}),parent=[2,0,0,0,.6,1.2,0,0,0,.3,.8,0,10,-5,2,1],initial=await service.rebuild(createCadProject({nodes:[{id:'root',kind:'cad',name:'Sheared parent',source:'group',solid:true,operation:'union',children:[child],transform:parent,brep:child.brep,stats:child.stats}]})),router=createCadCommandRouter({oc,service}),before=router.scene(initial).objects.find(item=>item.id==='child'),fit=cadFitDimensions(before,{gap:.2,axes:[0,1],kind:'opening'}),oldCenter=cadPoint(before.worldMatrix,[0,0,0]),result=await router.run(initial,{kind:'batch',commands:[{op:'update',target:before.target,set:{size:fit.size,pos:fit.position}}]},{baseline:initial}),after=router.scene(result.project).objects.find(item=>item.id==='child'),actual=cadFitDimensions(after,{gap:0,axes:[0,1],kind:'opening'});
    closeVector(actual.before,[fit.before[0]+.4,fit.before[1]+.4,fit.before[2]]);closeVector(cadPoint(after.worldMatrix,[0,0,0]),oldCenter);assert.deepEqual(result.project.nodes[0].transform,parent);assert.ok(new Matrix4().fromArray(after.worldMatrix).determinant()<0);for(let k=0;k<3;k++){const a=before.worldMatrix.slice(k*4,k*4+3),b=after.worldMatrix.slice(k*4,k*4+3);closeVector(a.map(v=>v/Math.hypot(...a)),b.map(v=>v/Math.hypot(...b)));}
  }finally{service.dispose();}
});

test('Perspective screen rectangles become native complete-curve frustum selection instead of endpoint selection',()=>{
  const service=createCadService({oc});try{const camera=new PerspectiveCamera(45,1,.1,1000);camera.up.set(0,0,1);camera.position.set(0,-80,70);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);const node=service.nativeNode({type:'cylinder',size:[20,20,20]},{id:'cad'}),queries=createCadPrecisionNative({oc,service}),rect={left:0,top:0,width:1000,height:1000},full=cadSelectionFrustumPlanes(camera,rect,[100,100,900,900]),all=queries.edgesInRectangle({node,planes:full}),narrow=cadSelectionFrustumPlanes(camera,rect,[475,475,525,525]),partial=queries.edgesInRectangle({node,planes:narrow});assert.equal(full.length,6);assert.equal(all.edgeTokens.length,3);assert.equal(partial.edgeTokens.length,0);assert.throws(()=>cadSelectionFrustumPlanes(camera,rect,[0,0,0,1]),/keine Fläche/);assert.throws(()=>cadFitDimensions({kind:'referenceMesh'},{gap:.2}),/CAD-Form/);
  }finally{service.dispose();}
});
