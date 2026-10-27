import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d/manifold';
import {makeNode,setKernel,groupNodes,meshData,worldManifold,fromMesh} from '../src/geometry.js';
import {adoptComputedHistory,synchronizeHistory} from '../src/history.js';
import {createEditTransaction} from '../src/edit-transaction.js';
import {inspectModel} from '../src/model-analysis.js';
import {sectionGeometry} from '../src/section-geometry.js';
import {coloredParts} from '../src/exports.js';
import {serializeFile} from '../src/file-data.js';
const kernel=await Module();kernel.setup();setKernel(kernel);
test('Worker queue accepts only the latest draft, merges waiting states, commits once',async()=>{
 let capture=0,live=0,commits=0,running=0,maximum=0,requests=[];const pending=[];
 const tx=createEditTransaction({capture:()=>{capture++;return 0;},compute:v=>{running++;maximum=Math.max(maximum,running);requests.push(v);return new Promise(r=>pending.push(()=>{running--;r(v);}));},accept:r=>live=r,commit:()=>commits++,rollback:b=>live=b,abort:()=>{}});
 tx.submit(1);tx.submit(2);const done=tx.submit(3,{finish:true});pending.shift()();await new Promise(r=>setTimeout(r,0));assert.equal(live,0);assert.deepEqual(requests,[1,3]);pending.shift()();await done;assert.equal(live,3);assert.equal(capture,1);assert.equal(commits,1);assert.equal(maximum,1);
});
test('Cancelled transaction rejects late replies and allows a fresh computation',async()=>{
 let resolve,live=7,commits=0;const tx=createEditTransaction({capture:()=>live,compute:()=>new Promise(r=>resolve=r),accept:r=>live=r,commit:()=>commits++,rollback:b=>live=b,abort:()=>{}});
 const done=tx.submit(9,{finish:true});live=9;tx.cancel();await assert.rejects(done,{name:'AbortError'});resolve(9);await new Promise(r=>setTimeout(r,0));assert.equal(live,7);assert.equal(commits,0);const again=tx.submit(12,{finish:true});resolve(12);await again;assert.equal(live,12);assert.equal(commits,1);
});
test('A failed newest computation restores the baseline without committing',async()=>{
 let live=5,commits=0;const tx=createEditTransaction({capture:()=>5,compute:async()=>{throw Error('Invalid geometry');},accept:r=>live=r,commit:()=>commits++,rollback:b=>live=b,abort:()=>{}});live=11;await assert.rejects(tx.submit(11,{finish:true}),/Invalid/);assert.equal(live,5);assert.equal(commits,0);
});
test('Inspection reports exact collisions, touching, rotated mirrored plates and actual sample points',()=>{
 const a=makeNode('box',[0,0,10]),b=makeNode('box',[10,0,10]),r=inspectModel([a,b]);assert.ok(Math.abs(r.collisions[0].volume-4000)<.01);assert.equal(r.collisions[0].aId,a.id);b.pos[0]=20;assert.equal(inspectModel([a,b]).collisions.length,0);
 for(const width of [.8,1.2])for(const quality of [1500,6000])for(const mirror of [-1,1]){const n=makeNode('box',[0,0,10],{size:[20,20,width],rot:[23,47,18],mirror:[mirror,1,1]}),r=inspectModel([n],{quality});assert.equal(r.thin.length,width<1?1:0);assert.equal(r.parts[0].samples,12);assert.equal(r.samples,12);assert.equal(r.parts[0].id,n.id);assert.ok(r.parts[0].measurements.length<=20);assert.ok(Math.abs(r.parts[0].minimum-width)<1e-4);assert.ok(r.parts[0].minimumPoint.from.length===3);}
 const sphere=makeNode('sphere',null,{segments:128});for(const quality of [1500,6000])assert.equal(inspectModel([sphere],{quality}).samples,quality);
});
test('Closed cuts of tube, enclosure, multicolor group and imported mesh preserve the original geometry',()=>{
 const tube=makeNode('tube'),shell=makeNode('shellbox'),a=makeNode('box',[-8,0,10],{color:'#ff0000'}),b=makeNode('box',[8,0,10],{color:'#0000ff'}),hole=makeNode('cylinder',[0,0,10],{size:[5,5,30],solid:false}),group=groupNodes([a,b,hole]);group.multicolor=true;
 const full=worldManifold(tube),data=meshData(full);full.delete();const imported=makeNode('import',[0,0,0],{mesh:data,size:[1,1,1]});
 for(const n of [tube,shell,group,imported])for(const axis of [0,1,2])for(const direction of [-1,1]){const before=JSON.stringify(n),m=worldManifold(n),box=m.boundingBox(),center=(box.min[axis]+box.max[axis])/2,normal=[0,0,0];normal[axis]=direction;const r=sectionGeometry([n],{normal,offset:center*direction})[0];assert.equal(r.status,'NoError');assert.ok(r.caps.triangles.length>0);const mesh=fromMesh({verts:r.surface.verts,triangles:[...r.surface.triangles,...r.caps.triangles]});try{assert.equal(mesh.status(),'NoError');assert.ok(mesh.volume()>0&&mesh.volume()<m.volume());}finally{mesh.delete();m.delete();}assert.equal(JSON.stringify(n),before);}
 const r=sectionGeometry([tube],{normal:[0,0,-1],offset:-tube.pos[2]})[0];for(let t=0;t<r.caps.triangles.length;t+=3){const points=r.caps.triangles.slice(t,t+3).map(i=>r.caps.verts.slice(i*3,i*3+3)),center=[0,1].map(k=>points.reduce((sum,p)=>sum+p[k],0)/3);assert.ok(Math.hypot(...center)>4,'Tube bore must remain open');}
});
test('Trusted history preserves meshes exactly while duplicate IDs are rejected globally',()=>{
 const g=groupNodes([makeNode('box'),makeNode('box',[15,0,10])]),copy=structuredClone(g),before=JSON.stringify(copy);adoptComputedHistory([copy]);synchronizeHistory([copy]);assert.equal(JSON.stringify(copy),before);const duplicate=structuredClone(copy.children[0]);assert.throws(()=>synchronizeHistory([copy,duplicate]),/Doppelte/);
});
test('Colored CSG does not export numerical boundary slivers as an extra slicer object',()=>{
 const a=makeNode('box',[-12,0,5],{size:[30,30,10]}),b=makeNode('gear',[18,0,5]),hole=makeNode('cylinder',[-12,0,5],{size:[8,8,20],solid:false}),g=groupNodes([a,b,hole]);g.multicolor=true;
 const parts=coloredParts(g);assert.equal(parts.length,2);const full=worldManifold(g);let volume=0;for(const p of parts){const m=fromMesh(p.data);volume+=m.volume();m.delete();}assert.ok(Math.abs(volume-full.volume())<.01);full.delete();
});
test('Grouping rejects a result outside project limits instead of creating an unreopenable model',()=>{
 const a=makeNode('box'),b=makeNode('box',[10020,0,10]),before=JSON.stringify([a,b]);assert.throws(()=>groupNodes([a,b]),/zu großes Teil/);assert.equal(JSON.stringify([a,b]),before);
});
test('Compact save data respects the same UTF-8 byte limits as the file reader',()=>{
 const value={name:'ä 日本語',data:[1,2,3]},json=serializeFile(value,100,'Testdatei');assert.deepEqual(JSON.parse(json),value);const length=new TextEncoder().encode(json).length;assert.equal(serializeFile(value,length,'Testdatei'),json);assert.throws(()=>serializeFile(value,length-1,'Testdatei'),/zu groß/);
});
