import * as THREE from 'three';
import {zipSync,strToU8} from 'fflate';
import {worldManifold,localManifold,matrixArray,meshData} from './geometry.js';
import {featureMatrix} from './feature-transforms.js';
import {gltfToGlb} from './exchange-formats.js';
const xml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
// Each source owns only material that exists in the final CSG result. Earlier
// sources own overlaps, so colored parts have disjoint interiors and keep holes.
export function coloredParts(root){
  const final=worldManifold(root),parts=[];let remaining=final;
  try{
    function visit(node,chain){
      if(!node.solid||node.suppressed)return;
      if(node.children&&root.multicolor){for(const child of node.children)visit(child,[...chain,child]);return;}
      const local=localManifold(node);let world,part;
      try{world=local.transform(chain.length===1?matrixArray(node):featureMatrix({chain,node}).elements);part=world.intersect(remaining);
        if(!part.isEmpty()&&part.volume()>1e-7){parts.push({name:node.name,color:node.color,opacity:node.opacity??root.opacity??1,data:meshData(part)});const next=remaining.subtract(part);if(remaining!==final)remaining.delete();remaining=next;}
      }finally{local.delete();world?.delete();part?.delete();}
    }
    // Float32 CSG boundaries can leave microscopic residual material after all
    // sources have been assigned. It must not become a separate slicer object.
    visit(root,[root]);if(!remaining.isEmpty()&&remaining.volume()>Math.max(1e-5,final.volume()*1e-7))parts.push({name:root.name,color:root.color,opacity:root.opacity??1,data:meshData(remaining)});return parts;
  }finally{if(remaining!==final)remaining.delete();final.delete();}
}
export function threeMF(parts){
  const bases=parts.map(p=>`<base name="${xml(p.name)}" displaycolor="${p.color.toUpperCase()}${Math.round((p.opacity??1)*255).toString(16).padStart(2,'0').toUpperCase()}"/>`).join('');
  const objects=parts.map((p,i)=>{const d=p.data;return `<object id="${i+2}" type="model" name="${xml(p.name)}" pid="1" pindex="${i}"><mesh><vertices>${Array.from({length:d.verts.length/3},(_,j)=>`<vertex x="${d.verts[j*3]}" y="${d.verts[j*3+1]}" z="${d.verts[j*3+2]}"/>`).join('')}</vertices><triangles>${Array.from({length:d.triangles.length/3},(_,j)=>`<triangle v1="${d.triangles[j*3]}" v2="${d.triangles[j*3+1]}" v3="${d.triangles[j*3+2]}"/>`).join('')}</triangles></mesh></object>`;}).join('');
  const model=`<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="de-DE" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><basematerials id="1">${bases}</basematerials>${objects}</resources><build>${parts.map((_,i)=>`<item objectid="${i+2}"/>`).join('')}</build></model>`;
  return zipSync({'[Content_Types].xml':strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'),'_rels/.rels':strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),'3D/3dmodel.model':strToU8(model)});
}
export function gltf(parts){
  const out={asset:{version:'2.0',generator:'Formnaro'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],buffers:[],bufferViews:[],accessors:[]};
  parts.forEach((p,i)=>{const positions=new Float32Array(p.data.verts.map(v=>v/1000)),indices=new Uint32Array(p.data.triangles),bytes=new Uint8Array(positions.byteLength+indices.byteLength);bytes.set(new Uint8Array(positions.buffer));bytes.set(new Uint8Array(indices.buffer),positions.byteLength);let binary='';for(let j=0;j<bytes.length;j+=8192)binary+=String.fromCharCode(...bytes.subarray(j,j+8192));out.buffers.push({byteLength:bytes.length,uri:'data:application/octet-stream;base64,'+btoa(binary)});
    const v=out.bufferViews.length,a=out.accessors.length;out.bufferViews.push({buffer:i,byteOffset:0,byteLength:positions.byteLength,target:34962},{buffer:i,byteOffset:positions.byteLength,byteLength:indices.byteLength,target:34963});
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let j=0;j<positions.length;j++){min[j%3]=Math.min(min[j%3],positions[j]);max[j%3]=Math.max(max[j%3],positions[j]);}
    out.accessors.push({bufferView:v,componentType:5126,count:positions.length/3,type:'VEC3',min,max},{bufferView:v+1,componentType:5125,count:indices.length,type:'SCALAR'});
    const c=new THREE.Color(p.color);out.materials.push({name:p.name,pbrMetallicRoughness:{baseColorFactor:[c.r,c.g,c.b,p.opacity],metallicFactor:0,roughnessFactor:.6},doubleSided:true,...(p.opacity<1?{alphaMode:'BLEND'}:{})});out.meshes.push({primitives:[{attributes:{POSITION:a},indices:a+1,material:i}]});out.nodes.push({name:p.name,mesh:i,rotation:[-Math.SQRT1_2,0,0,Math.SQRT1_2]});out.scenes[0].nodes.push(i);
  });return JSON.stringify(out);
}
export function glb(parts){return gltfToGlb(gltf(parts));}
export function svgProjection(manifold){const section=manifold.project();try{const polygons=section.toPolygons(),points=polygons.flat(),xs=points.map(p=>p[0]),ys=points.map(p=>-p[1]),min=[Math.min(...xs),Math.min(...ys)],size=[Math.max(...xs)-min[0],Math.max(...ys)-min[1]],d=polygons.map(poly=>poly.map((p,i)=>`${i?'L':'M'}${p[0]},${-p[1]}`).join(' ')+' Z').join(' ');return `<svg xmlns="http://www.w3.org/2000/svg" width="${size[0]}mm" height="${size[1]}mm" viewBox="${min.join(' ')} ${size.join(' ')}"><path d="${d}" fill-rule="evenodd"/></svg>`;}finally{section.delete();}}
