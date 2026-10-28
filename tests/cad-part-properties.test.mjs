import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePartProperties,partSurfaceDigest,partSurfaceState,paintPartFaces,partFaceColors,splitPartSurfaceMesh,validateExplosion,explosionOffsets,summarizeParts,partsCsv} from '../src/cad-part-properties.js';
import {createCadProject,cadProjectSnapshot,parseCadProject,serializeCadProject,createCadWorkspaceSerializer} from '../src/cad-project.js';
import {encodeFnpackProject,createFnpackResolver} from '../src/cad-fnpack-data.js';
import {CAD_QUALITY_DEFAULTS} from '../src/cad-quality.js';
import {defaultLayout} from '../src/layout-preferences.js';
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const node=()=>({id:'tetra',kind:'mesh',name:'Tetraeder',transform:[...identity],meshRole:'solid',mesh:{verts:[0,0,0,2,0,0,0,4,0,0,0,6],triangles:[0,2,1,0,1,3,1,2,3,2,0,3]},color:'#8899aa',opacity:1,layerId:'default',folderId:null,metadata:{notes:'Original'}});
test('Explicit density is required for a mass; colors and names never invent one',()=>{
 assert.deepEqual(validatePartProperties({version:1,material:{name:'Kunststoff',densityGcm3:null}}),{version:1,material:{name:'Kunststoff',densityGcm3:null}});
 for(const densityGcm3 of [undefined,0,-1,Infinity,NaN,1001,'1.2'])assert.throws(()=>validatePartProperties({version:1,material:{name:'Material',densityGcm3}}));
 const a=summarizeParts([{id:'a',massG:2,centerMm:[0,0,0]},{id:'b',massG:null,centerMm:[10,0,0]}]);assert.equal(a.complete,false);assert.equal(a.totalMassG,null);assert.equal(a.centerMm,null);assert.equal(a.knownMassG,2);
 const b=summarizeParts([{massG:1,centerMm:[0,2,4]},{massG:3,centerMm:[8,6,0]}]);assert.equal(b.totalMassG,4);assert.deepEqual(b.centerMm,[6,5,1]);
});
test('Surface groups retain exact geometry and are invalidated by payload edits, not placement',()=>{
 const n=node(),before=structuredClone(n.mesh);paintPartFaces(n,{name:'Oben',color:'#ff0000',faceIds:[2]});assert.deepEqual(n.mesh,before);assert(partSurfaceState(n).current);
 n.transform[12]=40;assert(partSurfaceState(n).current);paintPartFaces(n,{name:'Kante',color:'#00ff00',faceIds:[1,2]});assert.deepEqual(n.metadata.partProperties.surfaces.groups,[{name:'Kante',color:'#00ff00',faceIds:[1,2]}]);
 const parts=splitPartSurfaceMesh(n,{vertices:n.mesh.verts,triangles:n.mesh.triangles});assert.equal(parts.reduce((a,p)=>a+p.mesh.triangles.length/3,0),4);assert(parts.some(p=>p.color==='#00ff00'&&p.mesh.triangles.length===6));
 n.mesh.verts[0]=.1;assert.equal(partSurfaceState(n).current,false);assert.equal(splitPartSurfaceMesh(n,{vertices:n.mesh.verts,triangles:n.mesh.triangles}).length,1);
});
test('New properties upgrade only used projects to 25; old declarations cannot smuggle them',async()=>{
 const n=node(),base=createCadProject({nodes:[n]});assert.equal(base.version,8);n.metadata.partProperties={version:1,material:{name:'Explizit',densityGcm3:2}};paintPartFaces(n,{name:'Farbe',color:'#124abc',faceIds:[0]});const p=cadProjectSnapshot({...base,nodes:[n]});assert.equal(p.version,25);assert.deepEqual(parseCadProject(serializeCadProject(p)),p);assert.throws(()=>parseCadProject({...p,version:24}));
 const encoded=encodeFnpackProject(p);const ref=encoded.project.nodes[0];assert.equal(partSurfaceDigest(n),partSurfaceDigest(ref));const resolver=createFnpackResolver({readBlock:async hash=>encoded.blocks.find(b=>b.sha256===hash).bytes});const restored=await resolver.hydrate(encoded.project);assert(partSurfaceState(restored.nodes[0]).current);assert.equal(restored.nodes[0].metadata.partProperties.material.densityGcm3,2);
});
test('Explosion vectors produce display offsets with no changes to mounting matrices',()=>{
 const p=createCadProject({nodes:[node()]}),before=serializeCadProject(p),e={version:1,distance:40,parts:[{id:'tetra',direction:[0,0,1]},{id:'removed',direction:[1,0,0]}]};assert.deepEqual(explosionOffsets(e,p),[{id:'tetra',offset:[0,0,40]}]);assert.equal(serializeCadProject(p),before);assert.throws(()=>validateExplosion({...e,distance:-1}));assert.throws(()=>validateExplosion({...e,parts:[{id:'tetra',direction:[0,0,2]}]}));
});
test('CSV retains material and unit columns, quotes separators and neutralizes spreadsheet formulas',()=>{
 const csv=partsCsv({rows:[{id:'1',name:'=1+1',material:'A;B',densityGcm3:2,volumeMm3:8,massG:.016,centerMm:[.5,-1,1.5],status:'Geprüft'}]});assert(csv.includes('"\'=1+1"'));assert(csv.includes('"A;B"'));assert(csv.includes('Masse g'));assert(csv.includes('"0.016"'));assert(csv.includes('"-1"'));assert(!csv.includes('"\'-1"'));
});
test('A cached workspace serializer switches between load-set and explosion format without retaining an old prefix',()=>{
 const serialize=createCadWorkspaceSerializer(createCadProject()),base={version:5,view:{projection:'perspective',position:[100,-100,100],target:[0,0,0],up:[0,0,1],zoom:1},selection:[],mode:'translate',snap:1,quality:structuredClone(CAD_QUALITY_DEFAULTS),layout:defaultLayout(),tree:{expanded:[]},loadSet:null};
 assert.equal(parseCadProject(serialize(base)).version,8);
 const e={...base,version:6,explosion:{version:1,distance:30,parts:[]}};assert.equal(parseCadProject(serialize(e)).version,25);assert.equal(parseCadProject(serialize(base)).version,8);assert.equal(parseCadProject(serialize({...e,explosion:{...e.explosion,distance:60}})).workspace.explosion.distance,60);
});
test('Painting one imported STEP face preserves every unselected imported face color and source group priority',()=>{
 const imported=[{faceIndex:1,color:'#ff0000',opacity:1},{faceIndex:2,color:'#00ff00',opacity:1}],n={kind:'cad',source:'step',brep:{format:'OpenCascade-BRep',data:'synthetic identity only'},metadata:{stepFaceColors:structuredClone(imported)},color:'#8294aa',opacity:1};
 paintPartFaces(n,{name:'Eigene',color:'#0000ff',faceIds:[1]});assert.equal(partFaceColors(n).find(f=>f.faceIndex===1).color,'#0000ff');assert.equal(partFaceColors(n).find(f=>f.faceIndex===2).color,'#00ff00');assert.deepEqual(n.metadata.stepFaceColors,imported);
 n.multicolor=true;n.children=[{}];assert.equal(partSurfaceState(n).active,false);assert.throws(()=>paintPartFaces(n,{name:'X',color:'#ffffff',faceIds:[2]}),/Quellenfarben/);assert.deepEqual(partFaceColors(n),imported);
 n.multicolor=false;assert.equal(partSurfaceState(n).active,true);delete n.metadata.partProperties.surfaces;assert.deepEqual(partFaceColors(n),imported);
 const mesh=node();mesh.meshSource={appearance:{multicolor:true}};assert.throws(()=>paintPartFaces(mesh,{name:'X',color:'#ffffff',faceIds:[0]}),/Quellenfarben/);
});
