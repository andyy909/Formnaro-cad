import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'manifold-3d/manifold';
import {setKernel,makeNode,worldManifold,fitParameters,validNode,groupNodes,meshData,normalizeMesh} from '../src/geometry.js';
import {parameters,gearDimensions,threadDimensions} from '../src/parameters.js';
import {gearOutline,threadMesh,buildParametric} from '../src/parametric-geometry.js';
const kernel=await Module({wasmBinary:fs.readFileSync(new URL('../node_modules/manifold-3d/manifold.wasm',import.meta.url))});kernel.setup();setKernel(kernel);
const close=(a,b,tol=1e-4)=>assert.ok(Math.abs(a-b)<tol,`${a} vs ${b}`);
function measure(n){const m=worldManifold(n);try{assert.equal(m.status(),'NoError');assert.ok(m.volume()>0);return {volume:m.volume(),bounds:m.boundingBox(),mesh:meshData(m)};}finally{m.delete();}}
test('Rounded rectangular boxes keep physical radius and outer size after dimension edits',()=>{
  const n=makeNode('box',[0,0,5],{size:[40,30,10]});n.params={...n.params,edgeStyle:'round',edgeSize:3,edgeScope:'vertical',edgeSteps:24};
  const a=measure(n);close(a.volume,(40*30-(4-Math.PI)*9)*10,1);
  n.size[0]=80;const b=measure(n);close(b.volume-a.volume,40*30*10,.01);close(b.bounds.max[0]-b.bounds.min[0],80);
  n.params.edgeScope='all';assert.ok(measure(n).volume<b.volume);
});
test('A 45-degree bevel removes a known wedge volume and supports top-only cylindrical rims',()=>{
  const n=makeNode('box',[0,0,5],{size:[40,30,10]});n.params={...n.params,edgeStyle:'chamfer',edgeSize:2,edgeScope:'vertical'};close(measure(n).volume,12000-4*2*10);
  const c=makeNode('cylinder',[0,0,5],{size:[20,20,10],segments:128});c.params={...c.params,edgeStyle:'chamfer',edgeSize:2,edgeScope:'top'};
  const m=worldManifold(c);try{const bottom=m.slice(1),top=m.slice(9);try{assert.ok(bottom.area()>top.area());close(bottom.area(),Math.PI*100,.2);close(top.area(),Math.PI*81,.2);}finally{bottom.delete();top.delete();}}finally{m.delete();}
});
test('Tube wall, tapered cone, polygon, star and open housing have genuine editable profiles',()=>{
  const tube=makeNode('tube',[0,0,5],{size:[20,20,10],segments:128});tube.params.wall=2;close(measure(tube).volume,Math.PI*(100-64)*10,.6);tube.params.wall=3;assert.ok(measure(tube).volume>1300);
  tube.params.edgeStyle='chamfer';tube.params.edgeSize=.5;assert.ok(measure(tube).volume<Math.PI*(100-49)*10);
  const cone=makeNode('cone',[0,0,5],{size:[20,20,10],segments:128});cone.params.topDiameter=10;close(measure(cone).volume,Math.PI*10/3*(100+50+25),1);
  const housing=makeNode('shellbox',[0,0,10],{size:[60,40,20]});housing.params.radius=0;close(measure(housing).volume,60*40*20-56*36*18);
  const star=makeNode('star');const five=measure(star).volume;star.params.points=8;assert.notEqual(measure(star).volume,five);
  const poly=makeNode('polygon');poly.params.sides=7;measure(poly);
});
test('Gear has the requested tooth count, module dimensions and sampled involute flank',()=>{
  const n=makeNode('gear');n.params={...n.params,teeth:24,module:2,bore:6,backlash:0};fitParameters(n);
  const p=parameters(n),d=gearDimensions(p),outline=gearOutline(p,64);close(d.pitch,48);close(d.outer,52);close(d.root,43);close(n.size[0],52);close(n.size[1],52);
  // Each tooth has a tip midpoint at the addendum circle, and a periodic flank.
  const pts=outline.filter(([x,y])=>Math.abs(Math.hypot(x,y)-d.outer/2)<1e-7);assert.equal(pts.length,p.teeth*5);
  const half=(Math.PI/2)/p.teeth,invAlpha=Math.tan(d.alpha)-d.alpha,base=outline[1],angle=Math.atan2(base[1],base[0]);close(angle,-half-invAlpha);
  measure(n);const thin=measure(n).volume;n.params.backlash=.3;assert.ok(measure(n).volume<thin);
});
test('Helical gears remain closed, preserve pitch dimensions and accept hubs and keyways',()=>{
  const n=makeNode('gear');n.params={...n.params,teeth:23,module:1.2,helixAngle:25,profileShift:.1,hubDiameter:15,hubHeight:4,bore:6,keyWidth:2,keyDepth:1};fitParameters(n);close(n.size[2],10);
  const d=gearDimensions(n.params);close(d.pitch,1.2*23/Math.cos(25*Math.PI/180));const right=measure(n).volume;n.params.helixAngle=-25;fitParameters(n);close(measure(n).volume,right,.02);
});
test('Thread phase follows pitch, handedness and multistart lead rather than a decorative zigzag',()=>{
  const n=makeNode('thread'),p={...n.params,length:5,pitch:1,diameter:10,leadIn:0,starts:2},data=threadMesh(p,96),nc=96;
  // 24 layers per pitch. Right-handed two-start profile advances half a turn per pitch.
  const radius=(layer,col)=>Math.hypot(data.verts[(layer*nc+col)*3],data.verts[(layer*nc+col)*3+1]);
  for(let i=0;i<nc;i++){close(radius(24,i),radius(0,i));close(radius(6,(i+12)%nc),radius(0,i));}
  close(threadDimensions(p).lead,2);
  const left=threadMesh({...p,hand:'left'},96);for(let layer=0;layer<=120;layer+=3)for(let col=0;col<96;col+=7){const i=(layer*nc+col)*3,j=(layer*nc+(nc-col)%nc)*3;close(Math.hypot(data.verts[i],data.verts[i+1]),Math.hypot(left.verts[j],left.verts[j+1]));}
});
test('Matching printed external and internal threads with radial clearance do not intersect',()=>{
  const rod=makeNode('thread',[0,0,3]);rod.params={...rod.params,length:6,leadIn:0,clearance:.1};fitParameters(rod);rod.pos=[0,0,3];
  const nut=makeNode('nut',[0,0,3]);nut.params={...nut.params,length:6,leadIn:0,clearance:.15};fitParameters(nut);nut.pos=[0,0,3];
  const a=worldManifold(rod),b=worldManifold(nut);try{const interference=kernel.Manifold.intersection(a,b);try{close(interference.volume(),0,.001);}finally{interference.delete();}assert.ok(b.volume()>0);}finally{a.delete();b.delete();}
  rod.params.head='hex';rod.params.headHeight=4;fitParameters(rod);close(rod.size[2],10);measure(rod);
});
test('Internal thread cutter subtracts material and exports a closed reversible result',()=>{
  const cutter=makeNode('thread',[0,0,5],{solid:false});cutter.params={...cutter.params,kind:'cutter',length:12,clearance:.15};fitParameters(cutter);cutter.pos=[0,0,5];
  const body=makeNode('box',[0,0,5],{size:[20,20,10]}),g=groupNodes([body,cutter]);assert.ok(validNode(g));assert.equal(g.children[1].params.kind,'cutter');assert.ok(measure(g).volume<4000);
  const data=JSON.parse(JSON.stringify(g));const imported=normalizeMesh(measure(data).mesh);const restored=makeNode('import',g.pos,{mesh:imported.mesh,size:imported.size});close(measure(restored).volume,measure(g).volume,.03);
});
test('Countersink height and slope follow requested diameters and included angle',()=>{
  const n=makeNode('countersink');n.params={...n.params,bore:4,sinkDiameter:8,length:10,angle:90};fitParameters(n);close(n.size[2],10);n.pos=[0,0,5];
  const m=worldManifold(n);try{const low=m.slice(7),high=m.slice(9);try{close(low.area(),Math.PI*4,.03);close(high.area(),Math.PI*9,.06);}finally{low.delete();high.delete();}}finally{m.delete();}
});
test('Invalid geometry and runaway tessellation are rejected; old parameterless projects remain valid',()=>{
  const n=makeNode('gear');assert.equal(validNode({...n,params:{...n.params,teeth:3}}),false);assert.equal(validNode({...n,params:{...n.params,module:Infinity}}),false);
  n.params.backlash=5;assert.throws(()=>measure(n),/Zähne/);
  const thread=makeNode('thread');thread.params={...thread.params,length:300,pitch:.2};assert.throws(()=>fitParameters(thread),/zu fein/);
  const old=makeNode('gear');delete old.params;assert.ok(validNode(old));measure(old);
  const t=makeNode('tube');t.params.wall=20;assert.throws(()=>measure(t),/Rohrwand/);
});
