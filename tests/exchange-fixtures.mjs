import {BoxGeometry,Vector3,Matrix4} from 'three';
import {zipSync,strToU8} from 'fflate';
export function boxPart(name='Deckel',color='#079ca9',center=[40,-15,12],size=[20,12,8]){
 const g=new BoxGeometry(...size),a=g.attributes.position,verts=[];for(let i=0;i<a.count;i++)verts.push(...new Vector3().fromBufferAttribute(a,i).add(new Vector3(...center)).toArray());
 const part={name,color,opacity:1,mesh:{verts,triangles:Array.from(g.index.array)}};g.dispose();return part;
}
export const sampleParts=()=>[boxPart('Gehäuse & <A>','#079ca9'),boxPart('Deckel blau','#304d96',[-18,24,31],[16,10,6])];
export function meshXml(part){return '<mesh><vertices>'+part.mesh.verts.reduce((s,v,i,a)=>i%3?s:s+`<vertex x="${v}" y="${a[i+1]}" z="${a[i+2]}"/>`,'')+'</vertices><triangles>'+part.mesh.triangles.reduce((s,v,i,a)=>i%3?s:s+`<triangle v1="${v}" v2="${a[i+1]}" v3="${a[i+2]}"/>`,'')+'</triangles></mesh>';}
export const modelXml=(resources,build='<item objectid="2"/>',attrs='')=>`<?xml version="1.0"?><model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" ${attrs}><resources>${resources}</resources><build>${build}</build></model>`;
export function package3mf(model,{path='3D/main.model',others={}}={}){return zipSync({'_rels/.rels':strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" Target="/${path}"/></Relationships>`),[path]:strToU8(model),...others});}
export function sample3mf(){return package3mf(modelXml('<basematerials id="1"><base name="cyan" displaycolor="#079CA9FF"/><base name="blue" displaycolor="#304D96FF"/></basematerials>'+sampleParts().map((p,i)=>`<object id="${i+2}" name="${i?'Deckel blau':'Gehäuse &amp; &lt;A&gt;'}" pid="1" pindex="${i}">${meshXml(p)}</object>`).join(''),'<item objectid="2"/><item objectid="3"/>'));}
export function sampleGltf(){
 const buffers=[],bufferViews=[],accessors=[],meshes=[],materials=[],nodes=[];
 for(const [i,p]of sampleParts().entries()){
  const positions=new Float32Array(p.mesh.verts.map(v=>v/1000)),indices=new Uint32Array(p.mesh.triangles),bytes=new Uint8Array(positions.byteLength+indices.byteLength);bytes.set(new Uint8Array(positions.buffer));bytes.set(new Uint8Array(indices.buffer),positions.byteLength);
  buffers.push({byteLength:bytes.length,uri:'data:application/octet-stream;base64,'+Buffer.from(bytes).toString('base64')});bufferViews.push({buffer:i,byteLength:positions.byteLength},{buffer:i,byteOffset:positions.byteLength,byteLength:indices.byteLength});accessors.push({bufferView:i*2,componentType:5126,type:'VEC3',count:positions.length/3},{bufferView:i*2+1,componentType:5125,type:'SCALAR',count:indices.length});meshes.push({primitives:[{attributes:{POSITION:i*2},indices:i*2+1,material:i}]});
  // Linear red/blue for an independently specified standard glTF fixture.
  materials.push({pbrMetallicRoughness:{baseColorFactor:i?[0,0,1,1]:[1,0,0,1]}});nodes.push({name:p.name,mesh:i,rotation:[-Math.SQRT1_2,0,0,Math.SQRT1_2]});
 }
 return {asset:{version:'2.0'},scene:0,scenes:[{nodes:[0,1]}],nodes,meshes,materials,buffers,bufferViews,accessors};
}
export function bounds(part){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];part.mesh.verts.forEach((v,i)=>{min[i%3]=Math.min(min[i%3],v);max[i%3]=Math.max(max[i%3],v);});return {min,max,size:max.map((v,i)=>v-min[i]),center:min.map((v,i)=>(v+max[i])/2)};}
