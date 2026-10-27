import * as THREE from 'three';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {setKernel,localManifold,worldManifold,booleanManifold,meshData,groupNodes,matrixArray,normalizeMesh,makeNode,stlBinary} from './engine/geometry.js';
import {SCHEMAS,scaledParameters} from './engine/parameters.js';
import {validateProject,geometryKey} from './model.js';
import {normalizeRawMesh,rawBounds,rawStl} from './raw-mesh.js';
export function createOperations(kernel){
  setKernel(kernel);const cache=new Map();let cacheBytes=0,aiTools;
  function render(node){
    const key=geometryKey(node),cached=cache.get(key);if(cached){cache.delete(key);cache.set(key,cached);return cached;}
    let m,data;try{m=localManifold(node);if(m.status()!=='NoError'||m.isEmpty()||m.volume()<=0)throw Error('Die Form ergibt keinen geschlossenen Körper.');data={...meshData(m),volume:m.volume()};}
    catch(error){if(!node.mesh)throw error;data={...node.mesh,volume:null,raw:true};}finally{m?.delete();}
    if(data.triangles.length/3>500000)throw Error('Ein Teil darf in Mini höchstens 500.000 Dreiecke enthalten.');
    const bytes=key.length*2+data.verts.length*8+data.triangles.length*8;
    if(bytes<=16*1024*1024){while(cache.size&&(cacheBytes+bytes>16*1024*1024||cache.size>=64)){const k=cache.keys().next().value;cacheBytes-=cache.get(k)._bytes;cache.delete(k);}data._bytes=bytes;cache.set(key,data);cacheBytes+=bytes;}
    return data;
  }
  function bounds(node){if(node.mesh)return rawBounds(node);const m=worldManifold(node);try{return m.boundingBox();}finally{m.delete();}}
  function ungroup(node){
    if(!node.children?.length)throw Error('Bitte genau eine verbundene Gruppe auswählen.');
    const parent=new THREE.Matrix4().fromArray(matrixArray({...node,size:node.size.map((v,i)=>v/node.baseSize[i])}));
    return node.children.map(source=>{
      const child=structuredClone(source),matrix=parent.clone().multiply(new THREE.Matrix4().fromArray(matrixArray(child))),pos=new THREE.Vector3(),q=new THREE.Quaternion(),scale=new THREE.Vector3();
      matrix.decompose(pos,q,scale);const restored=new THREE.Matrix4().compose(pos,q,scale);
      const factors=scale.toArray().map((v,i)=>Math.abs(v)/source.size[i]);
      const uniform=factors.every(v=>Math.abs(v-factors[0])<1e-7);
      // Physical radii/walls must scale with the source as well. A nonuniform
      // stretch of a detailed primitive cannot always be expressed by its recipe.
      const physicalParameters=(SCHEMAS[child.type]||[]).some(f=>f.unit==='mm'&&child.params?.[f.key]>0);
      if(restored.elements.every((v,i)=>Math.abs(v-matrix.elements[i])<1e-7)&&(!physicalParameters||uniform)){
        const e=new THREE.Euler().setFromQuaternion(q,'ZYX');child.pos=pos.toArray();child.rot=[e.x,e.y,e.z].map(v=>v*180/Math.PI);child.size=scale.toArray().map(Math.abs);child.mirror=scale.toArray().map(v=>v<0?-1:1);if(child.params&&uniform)child.params=scaledParameters(child,factors[0]);return child;
      }
      // A rotated source inside a stretched group can be sheared. Bake that
      // exact affine result rather than approximate it with rotation/scale.
      const local=localManifold(child);let transformed;
      try{transformed=local.transform(matrix.elements);const b=transformed.boundingBox(),normal=normalizeMesh(meshData(transformed));return makeNode('import',b.min.map((v,i)=>(v+b.max[i])/2),{name:child.name,color:child.color,solid:child.solid,mesh:normal.mesh,size:normal.size,hidden:child.hidden,locked:child.locked,...(child.repairSource?{repairSource:child.repairSource,repairReport:child.repairReport}:{}),...(child.notes!==undefined?{notes:child.notes}:{}),...(child.folder!==undefined?{folder:child.folder}:{})});}finally{local.delete();transformed?.delete();}
    });
  }
  return async function run(job,payload){
    if(job.startsWith('ai-')){aiTools??=(await import('./ai-tools.js')).createMiniAITools(run);return aiTools(job,payload);}
    if(job==='repair'){
      if(payload.locked||payload.hidden)throw Error('Gesperrte oder ausgeblendete Teile bleiben erhalten.');
      if(!payload.mesh)return {node:payload,status:'healthy',report:{changed:false}};
      let tolerant=false;try{tolerant=JSON.parse(payload.notes??'null')?.format==='FormnaroMeshImport';}catch{}
      if(tolerant){
        const {inspectMiniMesh}=await import('./repair.js'),before=inspectMiniMesh(payload.mesh);
        if(!Object.values(before.counts).some(Boolean)&&render(payload).volume>0)return {node:payload,status:'healthy',report:{changed:false}};
        const {repairSimpleTopology}=await import('./import-core/mesh-simple-repair.js');
        try{const fixed=repairSimpleTopology(before.topology,{method:'simple-v1',geometryDigest:before.topology.geometryDigest,removeDegenerate:true,removeDuplicates:true,orient:true,smallTriangleLimit:0,removeComponents:[]});return {node:{...payload,mesh:fixed.mesh,repairSource:payload.repairSource??structuredClone(payload.mesh),repairReport:fixed.report},status:'repaired',report:fixed.report};}
        catch(error){if(error.code==='MESH_REPAIR_NO_CHANGE')return {node:payload,status:'unresolved',report:{changed:false,counts:before.counts}};throw error;}
      }
      const {autoRepairMiniMesh}=await import('./repair.js'),fixed=autoRepairMiniMesh(payload.mesh);
      return {node:fixed.status==='healthy'?payload:{...payload,mesh:fixed.mesh,repairSource:payload.repairSource??structuredClone(payload.mesh),repairReport:fixed.report},status:fixed.status,report:fixed.report};
    }
    if(job==='render')return payload.map(node=>({id:node.id,data:render(node)}));
    if(job==='bounds')return payload.map(node=>({id:node.id,...bounds(node)}));
    if(job==='validate'){validateProject(payload);for(const n of payload.nodes)render(n);return true;}
    if(job==='group'){
      const n=groupNodes(payload.nodes,payload.operation||'union');render(n);return n;
    }
    if(job==='ungroup')return ungroup(payload);
    if(job==='export'){
      const nodes=payload.filter(n=>!n.hidden);if(!nodes.some(n=>n.solid))throw Error('Es gibt keinen sichtbaren Körper zum Exportieren.');
      if(nodes.length===1&&nodes[0].type==='import'&&nodes[0].mesh&&nodes[0].solid)return rawStl(nodes[0]);
      const m=booleanManifold(nodes);
      try{if(m.status()!=='NoError'||m.volume()<=0)throw Error('Das Ergebnis ist kein gültiger Körper.');return stlBinary(m);}finally{m.delete();}
    }
    if(job==='import'){
      if(payload.prepared){const {mesh,report}=payload.prepared,normal=normalizeRawMesh(mesh),node=makeNode('import',[0,0,normal.extent[2]/2],{name:payload.name.replace(/\.stl$/i,'').slice(0,200)||'STL-Teil',mesh:normal.mesh,size:normal.size,color:'#79a9ad',notes:JSON.stringify(report)});render(node);return node;}
      if(payload.buffer.byteLength>25*1024*1024)throw Error('STL ist größer als 25 MB.');
      const geometry=new STLLoader().parse(payload.buffer);
      try{
        const positions=geometry.getAttribute('position');if(!positions||positions.count>750000)throw Error('STL: maximal 250.000 Dreiecke.');
        const verts=Array.from(positions.array),triangles=Array.from({length:positions.count},(_,i)=>i);
        if(verts.some(v=>!Number.isFinite(v)))throw Error('STL enthält ungültige Koordinaten.');
        const original={verts,triangles};let input=original,fixed;
        // Healthy STL keeps the existing fast path. A damaged import is repaired
        // only if the exact-coordinate stages prove a closed material body.
        let normal;try{normal=normalizeMesh(input);}catch{
          const {autoRepairMiniMesh}=await import('./repair.js');fixed=autoRepairMiniMesh(input);input=fixed.mesh;normal=normalizeMesh(input);
        }
        const node=makeNode('import',undefined,{name:payload.name.replace(/\.stl$/i,'').slice(0,200)||'STL-Teil',mesh:normal.mesh,size:normal.size,color:'#79a9ad',...(fixed?{repairSource:original,repairReport:fixed.report}:{})});node.pos=[0,0,node.size[2]/2];render(node);return node;
      }finally{geometry.dispose();}
    }
    if(job==='info')return {cacheEntries:cache.size,cacheBytes,heapBytes:kernel.HEAPU8?.length||0};
    throw Error('Unbekannter Mini-Auftrag.');
  };
}
