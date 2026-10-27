import test from 'node:test';
import assert from 'node:assert/strict';
import {DOMParser} from '@xmldom/xmldom';
import {strToU8} from 'fflate';
import {parseThreeMF,parseGltf,gltfToGlb,exchangeMainFile,EXCHANGE_LIMITS} from '../src/exchange-formats.js';
import {boxPart,sampleParts,sample3mf,meshXml,modelXml,package3mf,sampleGltf,bounds} from './exchange-fixtures.mjs';
globalThis.DOMParser=DOMParser;
function near(actual,expected,tolerance=.0001){assert.equal(actual.length,expected.length);actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<tolerance,`${v} != ${expected[i]}`));}
test('3MF: separate names, exact coordinates, colours and nonstandard model path',()=>{
 const result=parseThreeMF(sample3mf());assert.equal(result.parts.length,2);assert.deepEqual(result.warnings,[]);
 result.parts.forEach((part,i)=>{assert.equal(part.name,sampleParts()[i].name);assert.equal(part.color,sampleParts()[i].color);assert.deepEqual(part.mesh,sampleParts()[i].mesh);});
});
test('3MF: inch units, build and nested component transforms, mirrored winding',()=>{
 const p=boxPart('inch','#77a8b5',[0,0,0],[1,2,3]),xml=modelXml(`<object id="2">${meshXml(p)}</object><object id="3"><components><component objectid="2" transform="-1 0 0 0 1 0 0 0 1 2 0 0"/></components></object>`,'<item objectid="3" transform="1 0 0 0 1 0 0 0 1 0 4 0"/>','unit="inch"');
 const [part]=parseThreeMF(package3mf(xml)).parts;near(bounds(part).center,[50.8,101.6,0]);near(bounds(part).size,[25.4,50.8,76.2]);assert.deepEqual(part.mesh.triangles.slice(0,3),[p.mesh.triangles[0],p.mesh.triangles[2],p.mesh.triangles[1]]);
});
test('3MF production: cross-file components and child units',()=>{
 const p=boxPart('child','#77a8b5',[0,0,0],[1,2,3]),sub=modelXml(`<object id="2" name="Extern">${meshXml(p)}</object>`,undefined,'unit="centimeter"');
 const main=modelXml('<object id="2"><components><component objectid="2" p:path="/3D/Objects/child.model" transform="1 0 0 0 1 0 0 0 1 40 0 0"/></components></object>',undefined,'xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p"');
 const [part]=parseThreeMF(package3mf(main,{others:{'3D/Objects/child.model':strToU8(sub)}})).parts;assert.equal(part.name,'Extern');near(bounds(part).size,[10,20,30]);near(bounds(part).center,[40,0,0]);
});
test('3MF: material colours with alpha, colorgroups and explicit appearance warnings',()=>{
 const p=boxPart(),xml=modelXml(`<m:colorgroup xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02" id="1"><m:color color="#11223380"/></m:colorgroup><object id="2" pid="1" pindex="0">${meshXml(p)}</object>`);
 const [part]=parseThreeMF(package3mf(xml)).parts;assert.equal(part.color,'#112233');assert.equal(part.opacity,128/255);
});
test('3MF rejects cycles, missing refs, unsupported units/extensions, entities and bad indices',()=>{
 const p=boxPart();for(const xml of [modelXml('<object id="2"><components><component objectid="2"/></components></object>'),modelXml(''),modelXml(`<object id="2">${meshXml(p)}</object>`,undefined,'unit="yard"'),modelXml(`<object id="2">${meshXml(p)}</object>`,undefined,'xmlns:x="urn:unknown" requiredextensions="x"'),modelXml(`<object id="2">${meshXml(p).replace('v1="0"','v1="999999"')}</object>`),'<!DOCTYPE model [<!ENTITY x "abc">]>'+modelXml('')])assert.throws(()=>parseThreeMF(package3mf(xml)));
});
test('3MF skips nonprintable build objects and rejects empty builds',()=>{
 const object=`<object id="2">${meshXml(boxPart())}</object>`;assert.throws(()=>parseThreeMF(package3mf(modelXml(object,'<item objectid="2" printable="0"/>'))));const r=parseThreeMF(package3mf(modelXml(object,'<item objectid="2"/><item objectid="2" printable="0"/>')));assert.equal(r.parts.length,1);assert.equal(r.warnings.length,1);
});
test('glTF and GLB: separate parts, metres/Y-up to mm/Z-up, colours, multiple buffers',async()=>{
 const g=sampleGltf(),json=JSON.stringify(g),glb=gltfToGlb(json),parsed=await parseGltf(json),binary=await parseGltf(glb,{binary:true});assert.deepEqual(parsed,binary);assert.equal(binary.parts.length,2);assert.deepEqual(binary.parts.map(p=>p.color),['#ff0000','#0000ff']);binary.parts.forEach((p,i)=>near(bounds(p).center,bounds(sampleParts()[i]).center));
});
test('glTF: hierarchy, instances and mirrored transforms retain absolute placement',async()=>{
 const g=sampleGltf();g.nodes=[{translation:[.1,.2,.3],children:[1,2]},{mesh:0,scale:[-1,1,1]},{mesh:0,translation:[.04,0,0]}];g.scenes=[{nodes:[0]}];const r=await parseGltf(JSON.stringify(g));assert.equal(r.parts.length,2);near(bounds(r.parts[0]).center,[60,-312,185]);near(bounds(r.parts[1]).center,[180,-312,185]);
});
test('glTF: external buffers are selected locally and never fetched',async()=>{
 const g=sampleGltf(),files=g.buffers.map((b,i)=>{const bytes=Buffer.from(b.uri.split(',')[1],'base64');b.uri=`buffer${i}.bin`;return {name:b.uri,size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};});assert.equal((await parseGltf(JSON.stringify(g),{files})).parts.length,2);await assert.rejects(()=>parseGltf(JSON.stringify(g)),/Begleitdatei/);g.buffers[0].uri='https://example.invalid/model.bin';await assert.rejects(()=>parseGltf(JSON.stringify(g),{files}),/Extern/);
});
test('glTF rejects bad GLB chunks, unsafe accessors, missing nodes, cycles and compressed meshes',async()=>{
 for(const change of [g=>g.nodes[0].children=[0],g=>g.accessors[0].count=1e9,g=>g.accessors[0].byteOffset=1e8,g=>g.meshes[0].primitives[0].indices=999,g=>g.extensionsRequired=['KHR_draco_mesh_compression'],g=>g.nodes[0].skin=0,g=>g.scenes[0].nodes=[999],g=>g.bufferViews[0].byteLength=1e8]){const g=sampleGltf();change(g);await assert.rejects(()=>parseGltf(JSON.stringify(g)));}
 const b=gltfToGlb(JSON.stringify(sampleGltf()));new DataView(b.buffer).setUint32(12,b.length,true);await assert.rejects(()=>parseGltf(b,{binary:true}),/Blockgröße/);
});
test('file selection identifies one model and its optional binary companions',()=>{
 const f={name:'model.gltf'},bin={name:'model.bin'};assert.equal(exchangeMainFile([bin,f]),f);assert.throws(()=>exchangeMainFile([f,{name:'second.3mf'}]));assert.throws(()=>exchangeMainFile([bin]));assert.equal(EXCHANGE_LIMITS.parts,500);
});
test('3MF: every core unit and off-diagonal transforms are interpreted exactly',()=>{
 const p=boxPart('unit','#77a8b5',[0,0,0],[1,2,3]);for(const [unit,factor]of Object.entries({micron:.001,millimeter:1,centimeter:10,meter:1000,inch:25.4,foot:304.8})){
  const xml=modelXml(`<object id="2">${meshXml(p)}</object>`,'<item objectid="2" transform="0 1 0 -1 0 0 0.25 0 1 10 20 30"/>',`unit="${unit}"`),part=parseThreeMF(package3mf(xml)).parts[0];near(bounds(part).center,[10,20,30].map(v=>v*factor));near(bounds(part).size,[2.75,1,3].map(v=>v*factor));
 }
});
test('3MF preflights oversized ZIP entries before decompression',()=>{
 const b=sample3mf(),v=new DataView(b.buffer,b.byteOffset,b.byteLength);for(let i=0;i<b.length-24;i++)if(v.getUint32(i,true)===0x02014b50){v.setUint32(i+24,EXCHANGE_LIMITS.expandedBytes+1,true);break;}assert.throws(()=>parseThreeMF(b),/groß|Paketgröße/);
});
test('glTF: interleaved and sparse positions retain the same assembly',async()=>{
 const g=sampleGltf(),expected=(await parseGltf(JSON.stringify(g))).parts;
 const old=Buffer.from(g.buffers[0].uri.split(',')[1],'base64'),count=g.accessors[0].count,strided=Buffer.alloc(count*16+g.bufferViews[1].byteLength);for(let i=0;i<count;i++)old.copy(strided,i*16,i*12,i*12+12);old.copy(strided,count*16,count*12);
 g.buffers[0]={byteLength:strided.length,uri:'data:application/octet-stream;base64,'+strided.toString('base64')};g.bufferViews[0].byteLength=count*16;g.bufferViews[0].byteStride=16;g.bufferViews[1].byteOffset=count*16;
 assert.deepEqual((await parseGltf(JSON.stringify(g))).parts,expected);
 const sparse=sampleGltf(),indices=Uint8Array.from({length:count},(_,i)=>i);sparse.buffers.push({byteLength:indices.length,uri:'data:application/octet-stream;base64,'+Buffer.from(indices).toString('base64')});sparse.bufferViews.push({buffer:2,byteLength:indices.length});delete sparse.accessors[0].bufferView;sparse.accessors[0].sparse={count,indices:{bufferView:4,componentType:5121},values:{bufferView:0}};
 assert.deepEqual((await parseGltf(JSON.stringify(sparse))).parts,expected);
});
test('glTF refuses out-of-range primitive indices even when another primitive has enough vertices',async()=>{
 const g=sampleGltf(),data=Buffer.from(g.buffers[0].uri.split(',')[1],'base64');data.writeUInt32LE(30,g.bufferViews[1].byteOffset);g.buffers[0].uri='data:application/octet-stream;base64,'+data.toString('base64');g.meshes[0].primitives.push({...g.meshes[0].primitives[0]});await assert.rejects(()=>parseGltf(JSON.stringify(g)),/Primitiveindex/);
});
