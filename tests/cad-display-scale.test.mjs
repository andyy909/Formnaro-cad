import test from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4,Quaternion,Euler,Vector3} from 'three';
import {cadDisplayStretch} from '../src/cad-display-scale.js';
import {loadCadKernel} from '../src/cad-kernel-loader.js';
import {createCadService} from '../src/cad-service.js';
import {createCadProject} from '../src/cad-project.js';
import {cadIdentity,cadPoint} from '../src/cad-affine.js';
const pose=(angles,scale=[1,1,1])=>new Matrix4().compose(new Vector3(3,4,5),new Quaternion().setFromEuler(new Euler(...angles)),new Vector3(...scale)).toArray();
test('world rotations share a conservative display stretch for uniform and anisotropic bodies',()=>{
 for(const scale of [[1,1,1],[2,2,2],[.3,2,1.4],[-1,1,1]]){
  const values=[0,.13,.29,.51,.87,1.3].map(a=>cadDisplayStretch(pose([a,2*a,-3*a],scale)));assert(values.every(v=>v===values[0]),JSON.stringify(values));assert(values[0]>=Math.max(...scale.map(Math.abs)));
 }
 const shear=[1,.2,0,0,.7,1,.1,0,0,.3,1,0,0,0,0,1],bound=cadDisplayStretch(shear);
 for(let i=0;i<2000;i++){const p=new Vector3(Math.sin(i*2.4),Math.cos(i*1.7),Math.sin(i*.3)).normalize(),v=p.clone().applyMatrix4(new Matrix4().fromArray(shear));assert(v.length()<=bound+1e-13);}
 assert.throws(()=>cadDisplayStretch(Array(16).fill(0)));assert.throws(()=>cadDisplayStretch(Array(16).fill(Infinity)));
});
test('native curved parts and colored groups rotate without re-tessellation or color intersections; affine scale keeps its world budget',async()=>{
 const oc=await loadCadKernel({print:()=>{},printErr:()=>{}}),service=createCadService({oc}),original=oc.ReplicadMeshExtractor.extract;let calls=0;
 try{
  const body=service.nativeNode({type:'cylinder',size:[30,30,10]},{id:'body',color:'#dd6633'}),other=service.nativeNode({type:'box',size:[18,18,10]},{id:'other',color:'#3377cc'});other.transform[12]=18;
  const g={...body,id:'group',source:'group',operation:'union',children:[body,other],multicolor:true};delete g.recipe;let p=await service.rebuild(createCadProject({nodes:[g]}));
  const brep=p.nodes[0].brep.data,first=service.display(p,undefined,{colored:true});assert(first.length>=2);oc.ReplicadMeshExtractor.extract=Object.assign(function(...args){calls++;return original.apply(this,args);},original);
  for(const a of [.17,.37,.8,1.12]){p.nodes[0].transform=pose([a,-a*2,a*3]);const next=service.display(p,undefined,{colored:true});assert.deepEqual(next.map(v=>v.mesh),first.map(v=>v.mesh));assert.deepEqual(next.map(v=>v.color),first.map(v=>v.color));assert(next.every(v=>JSON.stringify(v.transform)===JSON.stringify(p.nodes[0].transform)));assert.equal(calls,0);assert.equal(p.nodes[0].brep.data,brep);}
  p.nodes[0].transform=pose([.4,.8,-.2],[-1.5,.7,1.2]);const stretched=service.display(p,undefined,{colored:true});assert(calls>0);assert(stretched.every(r=>r.mesh.vertices.every(Number.isFinite)));assert.equal(p.nodes[0].brep.data,brep);
  const before=JSON.stringify(stretched),again=service.display(p,undefined,{colored:true});assert.equal(JSON.stringify(again),before);
  // A fresh world-space native analysis independently checks placement. All
  // display points must stay within native body bounds plus display budget.
  const proof=service.inspect(p.nodes[0]);for(const r of again)for(let i=0;i<r.mesh.vertices.length;i+=3){const point=cadPoint(r.transform,r.mesh.vertices.slice(i,i+3));assert(point.every((v,k)=>v>=proof.worldBounds.min[k]-.021&&v<=proof.worldBounds.max[k]+.021));}
  p.nodes[0].children[0].color='#33bb77';assert(service.display(p,undefined,{colored:true}).some(r=>r.color==='#33bb77'));
 }finally{oc.ReplicadMeshExtractor.extract=original;service.dispose();}
});
