import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {Matrix4} from 'three';
import {analyzeMeshFeatures} from '../src/mesh-features.js';
import {createMeshCounterpart,validateCounterpartOptions} from '../src/mesh-counterpart.js';
import {lidHousing} from './fixtures/mesh-lid-fixtures.mjs';
const kernel=await Module();kernel.setup();
function options(n,mode='plug',query={normal:[0,0,1]}){const a=analyzeMeshFeatures(n,query),p=a.profiles.filter(p=>p.counterparts.includes(mode)).sort((a,b)=>b.area-a.area)[0];assert.ok(p);return {geometryDigest:a.geometryDigest,profileId:p.profileId,normal:p.normal,planePoint:p.planePoint,mode,depth:2,clearance:.3,wall:1.2,thickness:2.5};}
function body(mesh,transform){const m=new kernel.Manifold(new kernel.Mesh({numProp:3,vertProperties:new Float32Array(mesh.verts),triVerts:new Uint32Array(mesh.triangles)}));if(!transform)return m;const w=m.transform(transform);m.delete();return w;}
test('General features measure planes, multiple cavity contours and circular bores without exposing raw geometry',()=>{
 const n=lidHousing(kernel),before=structuredClone(n),a=analyzeMeshFeatures(n);assert.deepEqual(n,before);assert.ok(a.planes.length>=3);const top=a.profiles.filter(p=>p.normal[2]>.99);assert.equal(top.filter(p=>p.role==='cavity').length,3);const bores=top.filter(p=>p.circle&&p.role==='cavity');assert.equal(bores.length,2);assert.ok(bores.every(p=>Math.abs(p.circle.diameter-3.5)<.01));assert.ok(!/"(verts|triangles|contour)"/.test(JSON.stringify(a)));
});
for(const mode of ['plug','sleeve','cap'])test(mode+' makes one closed independent counterpart with actual zero source intersection',()=>{
 const n=lidHousing(kernel),before=structuredClone(n),r=createMeshCounterpart(n,options(n,mode),{kernel});assert.deepEqual(n,before);assert.equal(r.report.storedClearanceVerified,true);assert.equal(r.report.physicalFitTested,false);const source=body(n.mesh),out=body(r.mesh),overlap=out.intersect(source),parts=out.decompose();try{assert.equal(out.status(),'NoError');assert.equal(parts.length,1);assert.ok(out.volume()>0);assert.ok(Math.abs(overlap.volume())<1e-6);}finally{source.delete();out.delete();overlap.delete();parts.forEach(p=>p.delete());}
});
test('Concave contour sleeve follows actual offset rather than scaled bounds',()=>{
 const cs=new kernel.CrossSection([[[0,0],[30,0],[30,10],[10,10],[10,30],[0,30]]]),solid=cs.extrude(15),raw=solid.getMesh(),n=lidHousing(kernel);try{n.mesh={verts:Array.from(raw.vertProperties),triangles:Array.from(raw.triVerts)};const r=createMeshCounterpart(n,options(n,'sleeve'),{kernel}),m=body(r.mesh),cut=m.slice(14);try{const point=new kernel.CrossSection([[[20,20],[21,20],[21,21],[20,21]]]),hit=cut.intersect(point);try{assert.equal(hit.area(),0);}finally{point.delete();hit.delete();}assert.ok(cut.toPolygons().length>=2);}finally{cut.delete();m.delete();}}finally{solid.delete();cs.delete();}
});
test('Custom section and arbitrary transformed normals support rotation, reflection, scale and shear',()=>{
 for(const matrix of [new Matrix4().makeRotationX(.43),new Matrix4().makeScale(-1.2,.9,1.4),new Matrix4().set(1,.2,.1,20,0,1,0,-10,0,0,1.3,4,0,0,0,1)]){
  const n=lidHousing(kernel);n.transform=matrix.toArray();const a=analyzeMeshFeatures(n),p=a.profiles.filter(p=>p.role==='cavity'&&p.area>500).sort((a,b)=>b.area-a.area)[0];assert.ok(p);const o={geometryDigest:a.geometryDigest,profileId:p.profileId,normal:p.normal,planePoint:p.planePoint,mode:'plug',depth:1},r=createMeshCounterpart(n,o,{kernel}),out=body(r.mesh,n.transform),src=body(n.mesh,n.transform),hit=out.intersect(src);try{assert.equal(out.status(),'NoError');assert.ok(Math.abs(hit.volume())<1e-5);}finally{out.delete();src.delete();hit.delete();}
 }
 const n=lidHousing(kernel),o=options(n,'plug',{normal:[0,0,1],planePoint:[0,0,16]});assert.ok(createMeshCounterpart(n,o,{kernel}).report.solidProven);
});
test('Stale IDs, malformed data, wrong contour roles and blocked depth leave originals exact',()=>{
 const n=lidHousing(kernel),o=options(n),copy=structuredClone(n);copy.transform[12]+=1;assert.throws(()=>createMeshCounterpart(copy,o,{kernel}),{code:'MESH_COUNTERPART_STALE'});assert.throws(()=>createMeshCounterpart(n,{...o,mode:'sleeve'},{kernel}),/Bauart/);for(const extra of [{code:'evil'},{depth:NaN},{normal:[0,0,0]},{clearance:0},{profileId:'fake'}])assert.throws(()=>validateCounterpartOptions({...o,...extra}));const blocked=lidHousing(kernel,{blocked:true}),before=structuredClone(blocked);assert.throws(()=>createMeshCounterpart(blocked,{...options(blocked),depth:17},{kernel}));assert.deepEqual(blocked,before);
});
test('Open source stays open while safe counterpart is independently checked',()=>{
 const n=lidHousing(kernel,{damaged:true}),before=structuredClone(n),r=createMeshCounterpart(n,options(n),{kernel});assert.deepEqual(n,before);assert.equal(r.report.sourceSolidProven,false);assert.equal(r.report.solidProven,true);
});
test('Rectangular sleeve dimensions and source gap are independently measured from emitted sections',()=>{
 const cube=kernel.Manifold.cube([40,30,20]),raw=cube.getMesh(),n=lidHousing(kernel);cube.delete();n.mesh={verts:Array.from(raw.vertProperties),triangles:Array.from(raw.triVerts)};
 const r=createMeshCounterpart(n,{...options(n,'sleeve'),depth:6,clearance:.3,wall:2},{kernel}),m=body(r.mesh),cut=m.slice(17);
 try{const box=m.boundingBox();assert.ok(Math.abs(box.max[0]-box.min[0]-44.6)<.005);assert.ok(Math.abs(box.max[1]-box.min[1]-34.6)<.005);assert.ok(Math.abs(box.max[2]-box.min[2]-6)<1e-5);const loops=cut.toPolygons().sort((a,b)=>b.length-a.length),inner=loops.find(p=>{const xs=p.map(q=>q[0]);return Math.abs(Math.max(...xs)-Math.min(...xs)-40.6)<.005;});assert.ok(inner);assert.ok(Math.abs(Math.min(...inner.map(p=>p[0]))+.3)<.005);assert.ok(Math.abs(Math.min(...inner.map(p=>p[1]))+.3)<.005);}finally{m.delete();cut.delete();}
});
test('Taper and hidden shoulder over insertion depth affect the counterpart, even away from the reference section',()=>{
 const lower=kernel.Manifold.cube([40,30,18]),step0=kernel.Manifold.cube([44,34,1]),step=step0.translate([-2,-2,17]),top0=kernel.Manifold.cube([40,30,2]),top=top0.translate([0,0,18]),solid=kernel.Manifold.union([lower,step,top]),raw=solid.getMesh(),n=lidHousing(kernel);for(const v of [lower,step0,step,top0,top,solid])v.delete();n.mesh={verts:Array.from(raw.vertProperties),triangles:Array.from(raw.triVerts)};
 const r=createMeshCounterpart(n,{...options(n,'sleeve'),depth:5,clearance:.3,wall:2},{kernel}),m=body(r.mesh);try{const box=m.boundingBox();assert.ok(Math.abs(box.max[0]-box.min[0]-48.6)<.005);assert.ok(Math.abs(box.min[0]+4.3)<.005);}finally{m.delete();}
});
test('Resource limits, arbitrary query payloads and ambiguous/disjoint geometry are bounded',()=>{
 const n=lidHousing(kernel);assert.throws(()=>analyzeMeshFeatures(n,{path:'outside'}));const big=structuredClone(n);big.mesh.triangles=Array(300003).fill(0);assert.throws(()=>analyzeMeshFeatures(big),{code:'MESH_LID_LIMIT'});
 const a=kernel.Manifold.cube([10,10,10]),b0=kernel.Manifold.cube([10,10,10]),b=b0.translate([30,0,0]),both=kernel.Manifold.union([a,b]),raw=both.getMesh();for(const v of [a,b0,b,both])v.delete();n.mesh={verts:Array.from(raw.vertProperties),triangles:Array.from(raw.triVerts)};assert.throws(()=>createMeshCounterpart(n,options(n,'sleeve'),{kernel}),/Außenform/);
});
test('Small protruding bosses cannot hide a surrounding housing opening',()=>{
 const owned=[],own=v=>(owned.push(v),v);try{const box=own(kernel.Manifold.cube([40,30,20])),c0=own(kernel.Manifold.cube([36,26,22])),cavity=own(c0.translate([2,2,2])),shell=own(box.subtract(cavity)),boss0=own(kernel.Manifold.cylinder(20.4,3,3,48)),boss=own(boss0.translate([3,3,0])),solid=own(shell.add(boss)),raw=solid.getMesh(),n=lidHousing(kernel);n.mesh={verts:Array.from(raw.vertProperties),triangles:Array.from(raw.triVerts)};const a=analyzeMeshFeatures(n,{normal:[0,0,1]}),p=a.profiles.find(p=>p.role==='cavity'&&p.area>500);assert.ok(p);assert.ok(p.referenceInset>.4);const r=createMeshCounterpart(n,{geometryDigest:a.geometryDigest,profileId:p.profileId,normal:p.normal,planePoint:p.planePoint,mode:'plug',depth:2},{kernel});assert.ok(r.report.storedClearanceVerified);}finally{for(const v of owned.reverse())v.delete();}
});
