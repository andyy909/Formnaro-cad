const test=require('node:test'),assert=require('node:assert/strict'),{run}=require('../backend/freecad.cjs');
const build=async(steps,output=steps.at(-1).id)=>{const r=await run({plan:{version:1,steps,output}});assert.equal(r.report.valid,true);assert.equal(r.report.closed,true);assert.equal(r.report.check,'passed');return r;};
test('FreeCAD primitives, union, common, section, exact distance, refine and repair',async()=>{
 const r=await build([{id:'b',op:'box',size:[20,20,20]},{id:'c',op:'cylinder',radius:5,height:30,origin:[10,10,-5]},{id:'cone',op:'cone',radius:4,radius2:2,height:10},{id:'ball',op:'sphere',radius:5},{id:'ring',op:'torus',radius:10,radius2:2},{id:'u',op:'fuse',sources:['b','ball']},{id:'i',op:'common',sources:['b','c']},{id:'s',op:'section',source:'b',tool:'ball'},{id:'d',op:'distance',source:'b',tool:'ring'},{id:'clean',op:'refine',source:'i'},{id:'fixed',op:'repair',source:'clean'}]);assert.ok(Math.abs(r.report.volume-Math.PI*25*20)<1e-7);assert.ok(r.measurements[0].distance<1e-9);
});
test('Planar polygon, circle, extrusion, revolution, loft and sweep construct true solids',async()=>{
 const a=await build([{id:'p',op:'polygon',points:[[0,0,0],[10,0,0],[10,20,0],[0,20,0]]},{id:'e',op:'extrude',source:'p',vector:[0,0,5]}]);assert.ok(Math.abs(a.report.volume-1000)<1e-9);
 const b=await build([{id:'p',op:'polygon',points:[[5,0,0],[10,0,0],[10,0,20],[5,0,20]]},{id:'r',op:'revolve',source:'p',axis:[0,0,1],angle:360}]);assert.ok(Math.abs(b.report.volume-Math.PI*75*20)<1e-6);
 const c=await build([{id:'a',op:'circle',radius:5},{id:'b',op:'circle',radius:3,origin:[0,0,20]},{id:'l',op:'loft',sources:['a','b'],ruled:true}]);assert.ok(Math.abs(c.report.volume-Math.PI*20/3*(25+15+9))<1e-4);
 const d=await build([{id:'a',op:'circle',radius:3},{id:'path',op:'wire',points:[[0,0,0],[0,0,20]]},{id:'s',op:'sweep',source:'a',path:'path'}]);assert.ok(Math.abs(d.report.volume-Math.PI*9*20)<1e-7);
});
test('Fillets, chamfers, hollowing, offsets and explicit shell solidification',async()=>{
 for(const op of ['fillet','chamfer']){const r=await build([{id:'b',op:'box',size:[20,20,20]},{id:'f',op,source:'b',edges:[1],radius:1}]);assert.ok(r.report.volume<8000&&r.report.volume>7900);}
 const shell=await build([{id:'b',op:'box',size:[20,20,20]},{id:'s',op:'shell',source:'b',faces:[6],thickness:-2}]);assert.ok(Math.abs(shell.report.volume-(8000-16*16*18))<1e-6);
 const offset=await build([{id:'b',op:'sphere',radius:5},{id:'o',op:'offset',source:'b',distance:1}]);assert.ok(Math.abs(offset.report.volume-4*Math.PI*216/3)<1e-6);
 const solid=await build([{id:'b',op:'box',size:[3,4,5]},{id:'s',op:'solid',source:'b'}]);assert.equal(solid.report.volume,60);
});
test('Real Sketcher constraints and arc profiles solve before extrusion',async()=>{
 const r=await build([{id:'s',op:'sketch',elements:[{type:'circle',center:[0,0],radius:5}],constraints:[{type:'Diameter',args:[0,10]}]},{id:'e',op:'extrude',source:'s',vector:[0,0,10]}]);assert.ok(Math.abs(r.report.volume-Math.PI*25*10)<1e-7);
 const arc=await build([{id:'s',op:'sketch',elements:[{type:'arc',start:[-5,0],mid:[0,5],end:[5,0]},{type:'line',start:[5,0],end:[-5,0]}]},{id:'e',op:'extrude',source:'s',vector:[0,0,2]}]);assert.ok(Math.abs(arc.report.volume-Math.PI*25)<1e-7);
});
