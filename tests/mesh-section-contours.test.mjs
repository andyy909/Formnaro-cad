import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {Matrix4,Vector3} from 'three';
import {meshSectionContours} from '../src/mesh-section-contours.js';
import {resolveCadSketch} from '../src/cad-sketch.js';
import {profileElementSamples} from '../src/sketch-profile.js';
import {pageAIAnalysisResult} from '../src/cad-ai-analysis.js';
import {lidHousing} from './fixtures/mesh-lid-fixtures.mjs';
const kernel=await Module();kernel.setup();
const query={normal:[0,0,1],planePoint:[0,0,10],includePoints:true};
test('Exact plane gives complete nested loops and usable native profile while preserving the original',()=>{
 const n=lidHousing(kernel),before=structuredClone(n),r=meshSectionContours(n,query);
 assert.deepEqual(n,before);assert.equal(r.complete,true);assert.equal(r.totalLoops,4);assert.equal(r.loops.filter(l=>l.role==='hole').length,3);assert.ok(r.loops.every(l=>l.complete&&l.points.length===l.pointCount));assert.ok(r.sketch);const s=resolveCadSketch(r.sketch);assert.ok(s.area>0);assert.ok(r.sectionShift>0);assert.equal(r.frame[14],10+r.sectionShift);
 assert.deepEqual(pageAIAnalysisResult(r,{limit:1},32000),r);assert.throws(()=>pageAIAnalysisResult(r,{collection:'loops'},32000),/vollständig/);assert.throws(()=>pageAIAnalysisResult(r,undefined,100),/überschreiten/);
});
test('A requested lower slice keeps its own contours instead of searching for the widest rim',()=>{
 const n=lidHousing(kernel),bottom=meshSectionContours(n,{normal:[0,0,1],planePoint:[0,0,1]}),top=meshSectionContours(n,query);
 assert.equal(bottom.totalLoops,3);assert.equal(top.totalLoops,4);assert.ok(Math.abs(bottom.measurementPlanePoint[2]-1-bottom.sectionShift)<1e-12);
});
test('World frame handles rotation, reflection and shear; measured points stay on the disclosed plane',()=>{
 const n=lidHousing(kernel);n.transform=new Matrix4().set(-1,.2,.1,30,0,1,.2,-20,0,0,1.3,4,0,0,0,1).toArray();
 const r=meshSectionContours(n,{...query,planePoint:[30,-20,17]});assert.ok(new Matrix4().fromArray(r.frame).determinant()>.999999);
 for(const loop of r.loops)for(const p of loop.points){const world=new Vector3(...p,0).applyMatrix4(new Matrix4().fromArray(r.frame));assert.ok(Math.abs(world.z-17-r.sectionShift)<1e-8);}
});
test('Circle fitting discloses chord sag rather than claiming zero error for tessellated circles',()=>{
 const m=kernel.Manifold.cylinder(10,10,10,128),raw=m.getMesh(),n=lidHousing(kernel);m.delete();n.mesh={verts:Array.from(raw.vertProperties),triangles:Array.from(raw.triVerts)};
 const r=meshSectionContours(n,{normal:[0,0,1],planePoint:[0,0,5],fitTolerance:.02});assert.equal(r.sketch.elements.length,1);assert.equal(r.sketch.elements[0].type,'circle');assert.ok(r.loops[0].fitErrorBound>0);assert.ok(r.loops[0].fitErrorBound<=.02);resolveCadSketch(r.sketch);
 const exact=meshSectionContours(n,{normal:[0,0,1],planePoint:[0,0,5],fitTolerance:0});assert.equal(exact.loops[0].elements.length,128);assert.equal(exact.loops[0].fitErrorBound,0);
});
test('Invalid planes, stale identities, gaps and missing parent loops reject or disclose unusable profiles',()=>{
 const n=lidHousing(kernel),r=meshSectionContours(n,query);for(const o of [{...query,planePoint:[0,0,30]},{...query,normal:[0,0,0]},{...query,fitTolerance:1},{...query,loopIndices:[31]},{...query,script:'bad'}])assert.throws(()=>meshSectionContours(n,o));
 assert.throws(()=>meshSectionContours(n,{...query,geometryDigest:'0'.repeat(64)}),{code:'MESH_SECTION_STALE'});
 const hole=meshSectionContours(n,{...query,loopIndices:[1]});assert.equal(hole.complete,false);assert.equal(hole.loops[0].complete,true);assert.equal(hole.sketch,null);assert.match(hole.sketchUnavailable,/parent/);
 const broken=structuredClone(n);const z=10;let cut=-1;for(let i=0;i<broken.mesh.triangles.length;i+=3){const zs=broken.mesh.triangles.slice(i,i+3).map(id=>broken.mesh.verts[id*3+2]);if(Math.min(...zs)<z&&Math.max(...zs)>z){cut=i;break;}}assert.ok(cut>=0);broken.mesh.triangles.splice(cut,3);assert.throws(()=>meshSectionContours(broken,query),{code:'MESH_LID_SECTION'});
});
test('Rounded noncircular profiles retain native arcs and independently sampled curve distances respect the disclosed bound',()=>{
 const points=[];for(let c=0;c<4;c++)for(let j=0;j<=64;j++){const a=(c+j/64)*Math.PI/2;points.push([[17,-17,-17,17][c]+3*Math.cos(a),[7,7,-7,-7][c]+3*Math.sin(a)]);}
 const cs=new kernel.CrossSection([points]),body=cs.extrude(8),raw=body.getMesh(),n=lidHousing(kernel);body.delete();cs.delete();n.mesh={verts:Array.from(raw.vertProperties),triangles:Array.from(raw.triVerts)};
 const r=meshSectionContours(n,{normal:[0,0,1],planePoint:[0,0,4],includePoints:true}),resolved=resolveCadSketch(r.sketch),original=r.loops[0].points,curves=resolved.elements.map(e=>profileElementSamples(e,4096));assert.ok(resolved.elements.filter(e=>e.type==='arc').length>=4);assert.ok(resolved.elements.length<16);
 const edges=p=>p.map((a,i)=>[a,p[(i+1)%p.length]]),distance=(p,list)=>Math.min(...list.map(([a,b])=>{const dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);})),sourceEdges=edges(original),curveEdges=curves.flatMap(p=>p.slice(1).map((b,i)=>[p[i],b]));
 let maximum=0;for(const curve of curves)for(const p of curve)maximum=Math.max(maximum,distance(p,sourceEdges));for(const p of original)maximum=Math.max(maximum,distance(p,curveEdges));assert.ok(maximum<=r.loops[0].fitErrorBound+2e-5,`${maximum} > ${r.loops[0].fitErrorBound}`);
});
