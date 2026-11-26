import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {Matrix4,Vector3} from 'three';
import {meshSectionContours, planePointToWorld, worldPointToPlane} from '../src/mesh-section-contours.js';
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

test('A densely tessellated corner is not flattened by the section simplifier',()=>{
  // Synthetic prism with a filleted 90° corner. The arc is sampled finely
  // enough that every point lies within the local section tolerance, but the
  // corner is a real 58 mm² feature. Removing all arc points at once replaces
  // it with the chord between the two adjacent sharp vertices.
  const radius=14.25,arcPoints=1500,polygon=[[radius,0],[radius,-50],[100,-50],[100,100],[-50,100],[-50,radius]];
  for(let i=0;i<arcPoints;i++){const a=Math.PI+(i/arcPoints)*(Math.PI/2);polygon.push([radius+radius*Math.cos(a),radius+radius*Math.sin(a)]);}
  const area=polygon.reduce((s,a,i)=>{const b=polygon[(i+1)%polygon.length];return s+a[0]*b[1]-a[1]*b[0];},0)/2;
  const n=lidHousing(kernel),count=polygon.length,verts=[],triangles=[];
  for(const [x,y] of polygon)verts.push(x,y,0);
  for(const [x,y] of polygon)verts.push(x,y,20);
  for(let i=1;i<count-1;i++)triangles.push(0,i+1,i);
  for(let i=1;i<count-1;i++)triangles.push(count,count+i,count+i+1);
  for(let i=0;i<count;i++){const j=(i+1)%count;triangles.push(i,j,count+j,i,count+j,count+i);}
  n.mesh={verts,triangles};
  const r=meshSectionContours(n,{normal:[0,0,1],planePoint:[0,0,10],includePoints:true}),loop=r.outerProfile;
  assert.equal(r.complete,true);
  assert.ok(loop.pointCount>100,`nur ${loop.pointCount} Punkte übrig`);
  assert.ok(Math.abs(loop.area-area)<.01,`Flächenfehler ${loop.area-area} mm²`);
});

test('Measurement mode keeps independent round sections when the outer outline is open',()=>{
  const node=lidHousing(kernel);
  const {verts,triangles}=node.mesh;
  const height=10;
  const face=Array.from({length:triangles.length/3},(_,i)=>i*3).find(i=>{
    const vertices=triangles.slice(i,i+3);
    const z=vertices.map(index=>verts[index*3+2]);
    return vertices.every(index=>verts[index*3]===0)&&Math.min(...z)<height&&Math.max(...z)>height;
  });
  assert.ok(Number.isInteger(face));
  triangles.splice(face,3);
  const request={normal:[0,0,1],planePoint:[0,0,height]};
  assert.throws(()=>meshSectionContours(node,request),{code:'MESH_LID_SECTION'});
  const before=structuredClone(node);
  const result=meshSectionContours(node,{...request,summaryOnly:true});
  assert.deepEqual(node,before);
  assert.equal(result.complete,false);
  assert.equal(result.rejectedComponents,1);
  assert.equal(result.sketch,null);
  const circles=result.measurements.filter(entry=>entry.kind==='circle');
  assert.equal(circles.length,2);
  assert.ok(circles.every(c=>Math.abs(c.diameter-3.5)<.01&&Math.abs(c.center[2]-height)<.001));
  assert.ok(circles.every(c=>c.role==='unknown'));
  assert.deepEqual(pageAIAnalysisResult(result,undefined,4000),result);
});

test('Measurement mode fits many holes without transferring polylines or repeating the sketch',()=>{
  const ids=[];
  const keep=shape=>(ids.push(shape),shape);
  try {
    const M=kernel.Manifold;
    const plate=keep(M.cube([48,56,9]));
    const holes=Array.from({length:14},(_,i)=>{
      const h=keep(M.cylinder(12,1.8,1.8,160));
      return keep(h.translate([8+(i%4)*10,8+Math.floor(i/4)*13,-1]));
    });
    const body=keep(M.difference([plate,...holes]));
    const raw=body.getMesh(),node=lidHousing(kernel);
    node.mesh={verts:Array.from(raw.vertProperties),triangles:Array.from(raw.triVerts)};
    const result=meshSectionContours(node,{normal:[0,0,1],planePoint:[0,0,3],summaryOnly:true});
    assert.equal(result.complete,true);
    assert.equal(result.rejectedComponents,0);
    assert.equal(result.measurements.filter(m=>m.kind==='circle'&&m.role==='hole').length,14);
    assert.ok(JSON.stringify(result).length<4000);
  } finally {
    for(const shape of ids.reverse()) shape.delete();
  }
});

test('R01: Gerichteter Schnitt durch gedrehte/geneigte Kontur mit äußerer Schleife, Innenkreis und exakter 2D<->3D-Rückabbildung', () => {
  const node = lidHousing(kernel);
  // Rotations- und Translationsmatrix
  const rot = new Matrix4().makeRotationAxis(new Vector3(1, 1, 0).normalize(), Math.PI / 4);
  rot.setPosition(25, -15, 30);
  node.transform = rot.toArray();

  // Schnitt senkrecht zur transformierten Z-Achse des Bauteils
  const normal = new Vector3(0, 0, 1).applyAxisAngle(new Vector3(1, 1, 0).normalize(), Math.PI / 4).toArray();
  const planePoint = new Vector3(0, 0, 10).applyMatrix4(rot).toArray();

  const res = meshSectionContours(node, {
    normal,
    planePoint,
    includePoints: true,
  });

  assert.equal(res.complete, true);
  assert.equal(res.status, 'complete');
  assert.equal(res.closed, true);
  assert.ok(res.outerProfile, 'Äußere Schleife (outerProfile) vorhanden');
  assert.equal(res.outerProfile.role, 'outer');
  assert.ok(res.outerLoops.length >= 1, 'Mindestens eine äußere Schleife');
  assert.ok(res.innerLoops.length >= 1, 'Innenkreise / Bohrungen vorhanden');
  assert.ok(res.innerCircles.length >= 1, 'Fitted circles als Bohrungen erkannt');

  // Prüfe Koordinatenrahmen und 2D <-> 3D Welt-Rückabbildung
  assert.ok(Array.isArray(res.frame) && res.frame.length === 16);
  assert.ok(Array.isArray(res.origin) && res.origin.length === 3);
  assert.ok(Array.isArray(res.uAxis) && res.uAxis.length === 3);
  assert.ok(Array.isArray(res.vAxis) && res.vAxis.length === 3);

  // Jeder 2D-Punkt der äußeren Schleife wird exakt auf die Schnittebene im 3D-Raum abgebildet
  for (const pt2d of res.outerProfile.points) {
    const pt3d = planePointToWorld(pt2d, res);
    // Abstand zur Schnittebene: dot(pt3d - origin, normal) muss ~0 sein
    const distToPlane = Math.abs(
      (pt3d[0] - res.origin[0]) * normal[0] +
      (pt3d[1] - res.origin[1]) * normal[1] +
      (pt3d[2] - res.origin[2]) * normal[2]
    );
    assert.ok(distToPlane < 1e-6, `Punkt ${pt3d} liegt nicht exakt auf Schnittebene: ${distToPlane}`);

    // Umkehrabbildung 3D -> 2D
    const backTo2d = worldPointToPlane(pt3d, res);
    assert.ok(Math.hypot(backTo2d[0] - pt2d[0], backTo2d[1] - pt2d[1]) < 1e-6, 'Exakte 2D-Rückabbildung');
  }

  // Für jeden Innenkreis muss der 3D-Mittelpunkt ebenfalls exakt auf der Ebene liegen
  for (const circle of res.innerCircles) {
    assert.ok(Number.isFinite(circle.diameter) && circle.diameter > 0);
    const distToPlane = Math.abs(
      (circle.center[0] - res.origin[0]) * normal[0] +
      (circle.center[1] - res.origin[1]) * normal[1] +
      (circle.center[2] - res.origin[2]) * normal[2]
    );
    assert.ok(distToPlane < 1e-6, 'Kreismittelpunkt liegt auf Schnittebene');
  }
});

test('R01-03: Unterbrochene/offene Außenkontur wird bei allowIncomplete als unvollständig markiert, während gültige Innenkreise erhalten bleiben', () => {
  const node = lidHousing(kernel);
  const { verts, triangles } = node.mesh;
  const height = 10;
  // Entferne gezielt ein Dreieck an der Außenwand, sodass die Außenkontur unterbrochen wird
  const face = Array.from({ length: triangles.length / 3 }, (_, i) => i * 3).find((i) => {
    const vertices = triangles.slice(i, i + 3);
    const z = vertices.map((index) => verts[index * 3 + 2]);
    return vertices.every((index) => verts[index * 3] === 0) && Math.min(...z) < height && Math.max(...z) > height;
  });
  assert.ok(Number.isInteger(face));
  triangles.splice(face, 3);

  const request = { normal: [0, 0, 1], planePoint: [0, 0, height] };

  // Ohne allowIncomplete: strikter Wurf von MESH_LID_SECTION (Rückwärtskompatibilität)
  assert.throws(() => meshSectionContours(node, request), { code: 'MESH_LID_SECTION' });

  // Mit allowIncomplete: true -> kein Fehler, sondern Kennzeichnung als incomplete und Erhalt der Innenkreise
  const res = meshSectionContours(node, { ...request, allowIncomplete: true, includePoints: true });
  assert.equal(res.complete, false, 'Schnitt ist nicht vollständig');
  assert.equal(res.status, 'incomplete', 'Status explizit incomplete');
  assert.equal(res.closed, false, 'Außenkontur nicht geschlossen');
  assert.equal(res.rejectedComponents, 1, 'Genau 1 fehlerhafte/offene Komponente abgewiesen');
  assert.ok(res.openProfile, 'Offenes Außenprofil ist ausgewiesen');
  assert.equal(res.openProfile.status, 'incomplete');
  assert.equal(res.openProfile.closed, false);
  assert.equal(res.outerProfile, null, 'Kein geschlossenes Außenprofil');

  // Innenkreise aus demselben Schnitt bleiben messbar und verfügbar
  assert.ok(res.innerCircles.length >= 2, 'Die zwei Bohrungen bleiben als gültige Innenkreise erhalten');
  assert.ok(res.innerCircles.every((c) => Math.abs(c.diameter - 3.5) < 0.02), 'Bohrungsdurchmesser korrekt gemessen');
  assert.ok(res.innerCircles.every((c) => Math.abs(c.center[2] - height) < 0.01), 'Bohrungsmittelpunkte in Z korrekt');
});
