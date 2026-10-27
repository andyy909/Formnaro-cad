import test from 'node:test';
import assert from 'node:assert/strict';
import {createCadProject,validateCadProject,cadProjectSnapshot,serializeCadProject,parseCadProject,CAD_IDENTITY_MATRIX} from '../src/cad-project.js';
import {validateProjectMesh,meshTopologyClass,projectObjectType,projectObjectGeometryDigest,projectObjectCapabilities,validateSourceReference} from '../src/project-objects.js';

export const openMesh=()=>({verts:[0,0,0,20,0,0,0,20,0],triangles:[0,1,2]});
export const closedMesh=()=>({verts:[0,0,0,20,0,0,0,20,0,0,0,20],triangles:[0,2,1,0,1,3,1,2,3,2,0,3]});
export const meshNode=(id='mesh',mesh=openMesh())=>({id,kind:'mesh',name:'Netzteil',transform:[...CAD_IDENTITY_MATRIX],mesh,color:'#109ca9',opacity:.8,locked:false,hidden:false,layerId:'default',folderId:null});
export const syntheticCad=()=>({id:'cad',kind:'cad',name:'Native Quelle',solid:true,source:'step',transform:[...CAD_IDENTITY_MATRIX],brep:{format:'OpenCascade-BRep',triangulation:false,data:'synthetic-schema-fixture-only'},stats:{bounds:{min:[0,0,0],max:[20,20,20]},volume:8000,solids:1}});

test('four object types share metadata and retain original geometry without conversion',()=>{
  const native=syntheticCad(),closed=meshNode('closed',closedMesh()),open=meshNode('open'),reference={...meshNode('reference'),kind:'referenceMesh'};
  const p=createCadProject({nodes:[native,closed,open,reference]});
  assert.equal(p.version,8);assert.deepEqual(p.nodes.map(projectObjectType),['cad','closedMesh','openMesh','referenceMesh']);
  assert.deepEqual(parseCadProject(serializeCadProject(p)),p);
  assert.equal(p.nodes[0].brep.data,native.brep.data);assert.deepEqual(p.nodes[1].mesh,closed.mesh);
  for(const n of p.nodes.filter(n=>n.kind!=='cad'))assert.equal(n.brep,undefined);
});

test('external version claims stay strict, internal draft upgrades are explicit and old projects remain compatible',()=>{
  const mixed=createCadProject({nodes:[meshNode()]});
  for(const version of [5,7])assert.throws(()=>validateCadProject({...mixed,version}),/Projektformat 8/);
  const old=createCadProject({nodes:[syntheticCad()]});assert.equal(old.version,5);
  const draft=structuredClone(old);draft.nodes.push(meshNode());assert.equal(cadProjectSnapshot(draft).version,8);assert.equal(draft.version,5);
  mixed.nodes=[];assert.equal(cadProjectSnapshot(mixed).version,8,'a mixed project stays version 8 when its last mesh is removed');
});

test('open or damaged triangles can be stored, malformed arrays cannot, and no repair occurs',()=>{
  const damaged=openMesh();damaged.triangles.push(0,1,2,0,0,0);
  const before=structuredClone(damaged),p=createCadProject({nodes:[meshNode('damaged',damaged)]});
  assert.deepEqual(p.nodes[0].mesh,before);assert.deepEqual(damaged,before);assert.equal(projectObjectType(p.nodes[0]),'damagedMesh');
  for(const mesh of [{verts:[NaN,0,0,1,0,0,0,1,0],triangles:[0,1,2]},{...openMesh(),triangles:[0,1,3]},{...openMesh(),triangles:[0,1,1.5]},{...openMesh(),normals:[]}])assert.throws(()=>validateProjectMesh(mesh));
  assert.throws(()=>validateProjectMesh(openMesh(),{vertices:2}));
});

test('topological closure uses exact coordinates without welding or claiming a solid proof',()=>{
  const raw=closedMesh(),verts=[],triangles=[];
  for(const i of raw.triangles){triangles.push(verts.length/3);verts.push(...raw.verts.slice(i*3,i*3+3));}
  const data={verts,triangles},before=structuredClone(data),info=meshTopologyClass(data);
  assert.equal(info.type,'closedMesh');assert.equal(info.solidProven,false);assert.deepEqual(data,before);
  const wrong=closedMesh();[wrong.triangles[0],wrong.triangles[1]]=[wrong.triangles[1],wrong.triangles[0]];assert.equal(meshTopologyClass(wrong).type,'damagedMesh');
});

test('CAD sources cannot contain mesh nodes and meshes cannot masquerade as BRep or parametric CAD',()=>{
  for(const fields of [{solid:true},{brep:syntheticCad().brep},{source:'native'},{stats:syntheticCad().stats},{recipe:{type:'box',size:[20,20,20]}},{children:[syntheticCad()]}])assert.throws(()=>createCadProject({nodes:[{...meshNode(),...fields}]}));
  const group={...syntheticCad(),source:'group',operation:'union',children:[meshNode()]};assert.throws(()=>createCadProject({nodes:[group]}));
  assert.throws(()=>createCadProject({nodes:[{...syntheticCad(),mesh:openMesh()}]}));
});

test('historical source reference roundtrips, can outlive the source and requires mixed version',()=>{
  const source=syntheticCad(),digest=projectObjectGeometryDigest(source),reference={objectId:source.id,geometryDigest:digest,operation:'cad-to-mesh'};
  const derived={...meshNode(),metadata:{sourceReference:reference,notes:'Original erhalten'}};
  const p=createCadProject({nodes:[source,derived]});assert.deepEqual(parseCadProject(serializeCadProject(p)).nodes[1].metadata.sourceReference,reference);
  p.nodes.shift();assert.deepEqual(cadProjectSnapshot(p).nodes[0].metadata.sourceReference,reference);
  const native={...source,metadata:{sourceReference:{...reference,operation:'mesh-to-cad'}}};assert.equal(createCadProject({nodes:[native]}).version,8);
  for(const change of [{objectId:''},{geometryDigest:'not-a-digest'},{operation:'auto-convert'},{token:'secret'}])assert.throws(()=>validateSourceReference({...reference,...change}));
});

test('source identity covers geometry and complete placement but ignores object appearance',()=>{
  const n=meshNode('m',closedMesh()),digest=projectObjectGeometryDigest(n);
  for(const change of [copy=>copy.mesh.verts[0]++,copy=>copy.mesh.triangles.reverse(),copy=>copy.transform[4]=.25,copy=>copy.transform[12]++]){const copy=structuredClone(n);change(copy);assert.notEqual(projectObjectGeometryDigest(copy),digest);}
  const style={...n,name:'anderer Name',color:'#ff0000',locked:true};assert.equal(projectObjectGeometryDigest(style),digest);
  const cad=syntheticCad(),changed=structuredClone(cad);changed.brep.data+='changed';assert.notEqual(projectObjectGeometryDigest(cad),projectObjectGeometryDigest(changed));
});

test('solid tools require a current separate kernel proof, never a closed label from file data',()=>{
  const n=meshNode('closed',closedMesh());assert.equal(projectObjectCapabilities(n).solidTools,false);
  const solidProof={ok:true,geometryDigest:projectObjectGeometryDigest(n)};assert.equal(projectObjectCapabilities(n,{solidProof}).solidTools,true);
  n.mesh.verts[0]++;assert.equal(projectObjectCapabilities(n,{solidProof}).solidTools,false);
  assert.equal(projectObjectCapabilities({...n,kind:'referenceMesh'},{solidProof}).solidTools,false);
});

test('mutable topology is reclassified and shared affine transforms, organization and locks roundtrip',()=>{
  const n=meshNode('mutable',closedMesh());assert.equal(projectObjectType(n),'closedMesh');n.mesh.triangles.splice(0,3);assert.equal(projectObjectType(n),'openMesh');
  n.transform=[-2,.3,0,0,1,3,.4,0,0,.2,.5,0,14,-8,50,1];n.locked=true;n.layerId='assembly';n.folderId='parts';
  const p=createCadProject({nodes:[n],layers:[{id:'default',name:'Standard',hidden:false,locked:false},{id:'assembly',name:'Baugruppe',hidden:false,locked:true}],folders:[{id:'parts',name:'Teile',layerId:'assembly',parentId:null,hidden:true,locked:false}]});
  assert.deepEqual(parseCadProject(serializeCadProject(p)),p);assert.deepEqual(p.nodes[0].transform,n.transform);
});
