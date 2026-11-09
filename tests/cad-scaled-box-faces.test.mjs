import test from 'node:test';import assert from 'node:assert/strict';
import loader from '../cad-kernel-build/runtime/formnaro_cad.js';
import {createCadService} from '../src/cad-service.js';
import {cadReferencePointsNative} from '../src/cad-reference-points.js';
import {writeCadBrep} from '../src/cad-native-kernel.js';
import {affineCadNativeStock} from '../src/cad-drill-stock-native.js';
const oc=await loader({print(){},printErr(){}});
test('affinely resized native stock keeps selectable exact planar faces after placement',()=>{
 const service=createCadService({oc});try{
  const n=service.nativeNode({type:'box',size:[20,20,20]});n.transform=[3,0,0,0,0,2,0,0,0,0,.4,0,10,-5,4,1];
  const shape=service.worldShape(n);try{
   const placed={...n,transform:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],brep:{...n.brep,data:writeCadBrep(oc,shape)}};
   const faces=cadReferencePointsNative(oc,placed).points.filter(p=>p.kind==='face-centroid');assert.equal(faces.length,6);assert(faces.some(p=>Math.abs(p.point[2]-8)<1e-7&&p.normal[2]>.999));
  }finally{shape.delete();}
 }finally{service.dispose();}
});
test('analytic stock reconstruction refuses altered retained geometry',()=>{
 const service=createCadService({oc});try{
  const box=service.nativeNode({type:'box',size:[20,20,20]}),other=service.nativeNode({type:'cylinder',size:[20,20,20]});box.transform=[3,0,0,0,0,2,0,0,0,0,.4,0,10,-5,4,1];box.brep=other.brep;
  assert.equal(affineCadNativeStock(oc,box,other.stats.bounds),null);
 }finally{service.dispose();}
});
