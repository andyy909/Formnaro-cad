import fs from 'node:fs';
import Module from 'manifold-3d/manifold';
import {makeNode,setKernel,groupNodes,worldManifold,normalizeMesh,meshData} from '../src/geometry.js';
import {coloredParts,threeMF,gltf} from '../src/exports.js';
const kernel=await Module();kernel.setup();setKernel(kernel);fs.mkdirSync('work/v09/exports',{recursive:true});
const a=makeNode('box',[-12,0,5],{size:[30,30,10],color:'#f07040'}),b=makeNode('gear',[18,0,5],{color:'#2980a0'}),hole=makeNode('cylinder',[-12,0,5],{size:[8,8,20],solid:false}),g=groupNodes([a,b,hole]);g.multicolor=true;
const parts=coloredParts(g),full=worldManifold(g),volume=full.volume();full.delete();
fs.writeFileSync('work/v09/exports/Farbgruppe.3mf',threeMF(parts));fs.writeFileSync('work/v09/exports/Farbgruppe.gltf',gltf(parts));fs.writeFileSync('work/v09/exports/expected.json',JSON.stringify({parts:parts.length,volume,triangles:parts.reduce((s,p)=>s+p.data.triangles.length/3,0)},null,2));
// Additional load fixtures: gears and a genuinely dense imported sphere mesh.
const gears=Array.from({length:32},(_,i)=>makeNode('gear',[i%8*35,Math.floor(i/8)*35,5],{segments:96}));
const sphere=worldManifold(makeNode('sphere',null,{segments:128})),mesh=normalizeMesh(meshData(sphere));sphere.delete();const imports=Array.from({length:12},(_,i)=>makeNode('import',[i%4*30,Math.floor(i/4)*30,10],{mesh:mesh.mesh,size:mesh.size}));
fs.writeFileSync('work/v09/exports/load-fixtures.json',JSON.stringify({gears,imports}));
console.log(JSON.stringify({parts:parts.length,volume,gears:gears.length,importedTriangles:imports[0].mesh.triangles.length/3}));
