import {zipSync,strToU8} from 'fflate';
import {Color} from 'three';
import {cadExportTriangleNormal} from './cad-export-triangles.js';
import {gltfToGlb} from './exchange-formats.js';

const xml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function valid(parts){
  if(!Array.isArray(parts)||!parts.length||parts.length>5000)throw Error('Keine CAD-Exportteile.');
  let vertices=0,indices=0;
  for(const part of parts){
    const v=part.mesh?.vertices,t=part.mesh?.triangles;
    if(!Array.isArray(v)||v.length<9||v.length%3||v.some(x=>!Number.isFinite(x))||!Array.isArray(t)||t.length<3||t.length%3||t.some(i=>!Number.isSafeInteger(i)||i<0||i>=v.length/3))throw Error('Ungültiges CAD-Exportmesh.');
    vertices+=v.length;indices+=t.length;if(vertices>3000000||indices>6000000)throw Error('CAD-Export überschreitet die Puffergrenze.');
    if(typeof part.name!=='string'||part.name.length>1000||part.color!==undefined&&!/^#[\da-f]{6}$/i.test(part.color)||part.opacity!==undefined&&(!Number.isFinite(part.opacity)||part.opacity<0||part.opacity>1))throw Error('Ungültige CAD-Exportmetadaten.');
  }
}
function normal(a,b,c){const result=cadExportTriangleNormal(a,b,c);if(!result)throw Error('CAD-Export besitzt ein degeneriertes Dreieck.');return result;}
const point=(vertices,index)=>vertices.slice(index*3,index*3+3);
const asciiName=name=>name.replace(/[\r\n\x00-\x1f]/g,' ').trim()||'CAD';

// ASCII STL carries round-trip double coordinates, avoiding the binary STL
// float32 loss at large world offsets. Separate solids are retained as blocks.
export function cadStlAscii(parts){
  valid(parts);const rows=[];
  for(const part of parts){const {vertices,triangles}=part.mesh,name=asciiName(part.name);rows.push(`solid ${name}`);
    for(let i=0;i<triangles.length;i+=3){const points=triangles.slice(i,i+3).map(index=>point(vertices,index)),n=normal(...points);rows.push(`facet normal ${n.join(' ')}`,'outer loop',...points.map(p=>`vertex ${p.join(' ')}`),'endloop','endfacet');}
    rows.push(`endsolid ${name}`);
  }
  return rows.join('\n')+'\n';
}

// The MTL is delivered with OBJ in one archive so color/opacity references
// remain portable. Coordinates stay in millimetres as double decimal text.
export function cadObjBundle(parts){
  valid(parts);const obj=['# Formnaro CAD export, millimetres','mtllib model.mtl'],mtl=[];let offset=1;
  parts.forEach((part,i)=>{const {vertices,triangles}=part.mesh,c=new Color(part.color??'#bbbbbb');obj.push(`o ${asciiName(part.name)}`,`usemtl material_${i}`);
    for(let v=0;v<vertices.length;v+=3)obj.push(`v ${vertices.slice(v,v+3).join(' ')}`);
    for(let t=0;t<triangles.length;t+=3)obj.push(`f ${triangles.slice(t,t+3).map(index=>index+offset).join(' ')}`);
    mtl.push(`newmtl material_${i}`,`Kd ${c.r} ${c.g} ${c.b}`,`d ${part.opacity??1}`,'');offset+=vertices.length/3;
  });
  return zipSync({'model.obj':strToU8(obj.join('\n')+'\n'),'model.mtl':strToU8(mtl.join('\n'))});
}

export function cadThreeMf(parts){
  valid(parts);const bases=parts.map(part=>`<base name="${xml(part.name)}" displaycolor="${(part.color??'#bbbbbb').toUpperCase()}${Math.round((part.opacity??1)*255).toString(16).padStart(2,'0').toUpperCase()}"/>`).join('');
  const objects=parts.map((part,i)=>{const {vertices,triangles}=part.mesh,v=[],t=[];for(let k=0;k<vertices.length;k+=3)v.push(`<vertex x="${vertices[k]}" y="${vertices[k+1]}" z="${vertices[k+2]}"/>`);for(let k=0;k<triangles.length;k+=3)t.push(`<triangle v1="${triangles[k]}" v2="${triangles[k+1]}" v3="${triangles[k+2]}"/>`);return `<object id="${i+2}" type="model" name="${xml(part.name)}" pid="1" pindex="${i}"><mesh><vertices>${v.join('')}</vertices><triangles>${t.join('')}</triangles></mesh></object>`;}).join('');
  const model=`<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="de-DE" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><basematerials id="1">${bases}</basematerials>${objects}</resources><build>${parts.map((_,i)=>`<item objectid="${i+2}"/>`).join('')}</build></model>`;
  return zipSync({'[Content_Types].xml':strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'),'_rels/.rels':strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),'3D/3dmodel.model':strToU8(model)});
}

export function cadGltf(parts,{roundingBudget=.005}={}){
  valid(parts);if(!Number.isFinite(roundingBudget)||roundingBudget<=0)throw Error('Ungültiges GLTF-Genauigkeitsbudget.');
  const out={asset:{version:'2.0',generator:'Formnaro CAD'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],buffers:[],bufferViews:[],accessors:[]};
  parts.forEach((part,i)=>{
    const vertices=part.mesh.vertices,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let k=0;k<vertices.length;k++){min[k%3]=Math.min(min[k%3],vertices[k]);max[k%3]=Math.max(max[k%3],vertices[k]);}
    const center=min.map((v,k)=>(v+max[k])/2),positions=new Float32Array(vertices.map((v,k)=>(v-center[k%3])/1000)),indices=new Uint32Array(part.mesh.triangles);
    for(let k=0;k<vertices.length;k+=3){const error=Math.hypot(...[0,1,2].map(axis=>positions[k+axis]*1000+center[axis]-vertices[k+axis]));if(error>roundingBudget)throw Error('GLTF-Koordinaten können die gewählte Exportgenauigkeit nicht darstellen.');}
    const bytes=new Uint8Array(positions.byteLength+indices.byteLength);bytes.set(new Uint8Array(positions.buffer));bytes.set(new Uint8Array(indices.buffer),positions.byteLength);let binary='';for(let k=0;k<bytes.length;k+=8192)binary+=String.fromCharCode(...bytes.subarray(k,k+8192));out.buffers.push({byteLength:bytes.length,uri:'data:application/octet-stream;base64,'+btoa(binary)});
    const view=out.bufferViews.length,accessor=out.accessors.length;out.bufferViews.push({buffer:i,byteOffset:0,byteLength:positions.byteLength,target:34962},{buffer:i,byteOffset:positions.byteLength,byteLength:indices.byteLength,target:34963});
    const localMin=[Infinity,Infinity,Infinity],localMax=[-Infinity,-Infinity,-Infinity];for(let k=0;k<positions.length;k++){localMin[k%3]=Math.min(localMin[k%3],positions[k]);localMax[k%3]=Math.max(localMax[k%3],positions[k]);}
    out.accessors.push({bufferView:view,componentType:5126,count:positions.length/3,type:'VEC3',min:localMin,max:localMax},{bufferView:view+1,componentType:5125,count:indices.length,type:'SCALAR'});
    const color=new Color(part.color??'#bbbbbb'),opacity=part.opacity??1;out.materials.push({name:part.name,pbrMetallicRoughness:{baseColorFactor:[color.r,color.g,color.b,opacity],metallicFactor:0,roughnessFactor:.6},doubleSided:true,...(opacity<1?{alphaMode:'BLEND'}:{})});out.meshes.push({primitives:[{attributes:{POSITION:accessor},indices:accessor+1,material:i}]});out.nodes.push({name:part.name,mesh:i,rotation:[-Math.SQRT1_2,0,0,Math.SQRT1_2],translation:[center[0]/1000,center[2]/1000,-center[1]/1000]});out.scenes[0].nodes.push(i);
  });return JSON.stringify(out);
}

export function encodeCadMeshes(parts,format,options){
  if(format==='stl')return new TextEncoder().encode(cadStlAscii(parts));
  if(format==='obj')return cadObjBundle(parts);
  if(format==='3mf')return cadThreeMf(parts);
  if(format==='gltf')return new TextEncoder().encode(cadGltf(parts,options));
  if(format==='glb')return gltfToGlb(cadGltf(parts,options));
  throw Error('Unbekanntes CAD-Netzexportformat.');
}
