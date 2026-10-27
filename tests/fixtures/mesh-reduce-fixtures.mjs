import fs from 'node:fs';
import Module from 'manifold-3d/manifold';
import {setKernel,meshData} from '../../src/mesh-engine/geometry.js';
import {meshSelectionGeometryDigest} from '../../src/mesh-selection-data.js';
let loaded;
export function reductionKernel(){return loaded??=(async()=>{const kernel=await Module({wasmBinary:fs.readFileSync(new URL('../../node_modules/manifold-3d/manifold.wasm',import.meta.url))});kernel.setup();setKernel(kernel);return kernel;})();}
export async function denseDrilledMesh(refinement=4){const k=await reductionKernel(),M=k.Manifold,box=M.cube([40,30,12]),move=box.translate([-20,-15,0]),cyl=M.cylinder(20,3,3,48,false),drill=cyl.translate([0,0,-4]),cut=move.subtract(drill),dense=cut.refine(refinement);try{return meshData(dense);}finally{[dense,cut,drill,cyl,move,box].forEach(m=>m.delete());}}
export async function denseBoxMesh(refinement=4){const k=await reductionKernel(),m=k.Manifold.cube([20,20,12]),dense=m.refine(refinement);try{return meshData(dense);}finally{dense.delete();m.delete();}}
export const meshNode=(mesh,id='technical')=>({id,kind:'mesh',name:'Dichtes Gehäuse mit Bohrung',meshRole:'solid',mesh,transform:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],color:'#447788',opacity:.8,layerId:'default',folderId:null,metadata:{notes:'Bohrung Ø 6, Außenmaße 40 × 30 × 12'}});
export function reductionOptions(node,set={}){return {method:'planar-v1',geometryDigest:meshSelectionGeometryDigest(node),scope:'all',triangleIds:[],targetMode:'percent',target:50,maxDeviation:.001,...set};}
export function contactFaces(mesh){const result=[];for(let i=0;i<mesh.triangles.length;i+=3){const p=mesh.triangles.slice(i,i+3).map(v=>mesh.verts.slice(v*3,v*3+3));if(p.every(v=>v[2]===12)&&p.every(v=>v[0]>8))result.push(i/3);}return result;}
