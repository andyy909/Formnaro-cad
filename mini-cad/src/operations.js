import * as THREE from 'three';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {makeNode,matrixArray} from './engine/geometry.js';
import {SCHEMAS,scaledParameters} from './engine/parameters.js';
import {validateProject,geometryKey} from './model.js';
import {buildCadRecipe,constructionTolerance} from './native/cad-recipes.js';
import {cadBounds,validateCadSolid,writeCadBrep,readCadBrep,transformCad,cadDisplayMesh,cadExportMesh,cadBoolean} from './native/cad-native-kernel.js';
import {importCadStep,exportCadStep} from './native/cad-step-io.js';
import {inspectStlMesh} from './native/cad-stl-surfaces.js';
import {buildStlFacetedCad} from './native/cad-stl-faceted.js';
import {normalizeRawMesh,rawBounds,rawStl} from './raw-mesh.js';

// CAD is the modelling authority. Display triangles are transient, never
// Boolean operands, STEP sources, or persisted project geometry.
export function createOperations(oc){
  const cache=new Map();let cacheBytes=0,ai;
  const aiModule=async()=>ai??=await import('./ai-native.js').then(m=>m.createMiniAINative({oc,localShape,worldShape,stored}));
  function localShape(n){
    if(n.mesh)throw Error('Dieses Teil ist ein Rohnetz. Native CAD-Werkzeuge benötigen einen gültigen CAD-Körper; das Rohnetz bleibt erhalten.');
    if(n.brep){const base=readCadBrep(oc,n.brep);try{return transformCad(oc,base,matrixArray({...n,pos:[0,0,0],rot:[0,0,0],mirror:[1,1,1],size:n.size.map((v,i)=>v/n.baseSize[i])}));}finally{base.delete();}}
    return buildCadRecipe(oc,{type:n.type,size:n.size,params:n.params},{affineTransform:(s,m)=>transformCad(oc,s,m),constructionBudget:constructionTolerance(Math.min(...n.size))});
  }
  function worldShape(n){const local=localShape(n);try{return transformCad(oc,local,matrixArray({...n,size:[1,1,1]}));}finally{local.delete();}}
  function render(n){
    if(n.mesh)return {...n.mesh,volume:null,solids:null,raw:true};
    const key=geometryKey(n),cached=cache.get(key);if(cached){cache.delete(key);cache.set(key,cached);return cached;}
    const shape=localShape(n);let data;
    try{const proof=validateCadSolid(oc,shape),quality=n.segments===32?{deflection:.08,angleDegrees:16}:n.segments===128?{deflection:.008,angleDegrees:5}:{deflection:.02,angleDegrees:8},mesh=cadDisplayMesh(oc,shape,quality);
      if(mesh.triangles.length/3>250000)throw Error('CAD-Anzeige: höchstens 250.000 Dreiecke je Teil. Anzeigequalität verringern.');
      data={verts:mesh.vertices.map((v,i)=>v/n.size[i%3]),normals:mesh.normals.map((v,i)=>v*n.size[i%3]),triangles:mesh.triangles,volume:proof.volume/n.size.reduce((a,b)=>a*b,1),solids:proof.solids};
    }finally{shape.delete();}
    const bytes=key.length*2+data.verts.length*8+data.normals.length*8+data.triangles.length*8;
    if(bytes<=16*1024*1024){while(cache.size&&(cacheBytes+bytes>16*1024*1024||cache.size>=64)){const k=cache.keys().next().value;cacheBytes-=cache.get(k)._bytes;cache.delete(k);}data._bytes=bytes;cache.set(key,data);cacheBytes+=bytes;}
    return data;
  }
  function combined(nodes,operation='union',allowHoleGroup=false){
    let result;const shapes=[];
    try{for(const n of nodes)shapes.push({n,shape:worldShape(n)});const holeGroup=allowHoleGroup&&shapes.every(x=>!x.n.solid),solids=holeGroup?shapes:shapes.filter(x=>x.n.solid),holes=holeGroup?[]:shapes.filter(x=>!x.n.solid);if(!solids.length)throw Error('Mindestens einen Körper auswählen.');
      result=readCadBrep(oc,writeCadBrep(oc,solids[0].shape));
      for(const item of solids.slice(1)){const next=cadBoolean(oc,operation,result,item.shape);result.delete();result=next;}
      for(const item of holes){const next=cadBoolean(oc,'difference',result,item.shape);result.delete();result=next;}
      validateCadSolid(oc,result);return result;
    }catch(e){result?.delete();throw e;}finally{shapes.forEach(x=>x.shape.delete());}
  }
  function stored(shape,extra={}){
    const b=cadBounds(oc,shape),centered=transformCad(oc,shape,matrixArray({pos:b.center.map(v=>-v),rot:[0,0,0],size:[1,1,1]}));
    try{return makeNode('import',b.center,{name:'CAD-Teil',size:b.size,baseSize:[...b.size],brep:writeCadBrep(oc,centered),color:'#79a9ad',...extra});}finally{centered.delete();}
  }
  function ungroup(n){
    if(!n.children?.length)throw Error('Bitte genau eine Gruppe auswählen.');
    const parent=new THREE.Matrix4().fromArray(matrixArray({...n,size:n.size.map((v,i)=>v/n.baseSize[i])}));
    return n.children.map(source=>{
      const child=structuredClone(source),matrix=parent.clone().multiply(new THREE.Matrix4().fromArray(matrixArray(child))),p=new THREE.Vector3(),q=new THREE.Quaternion(),scale=new THREE.Vector3();matrix.decompose(p,q,scale);
      const restored=new THREE.Matrix4().compose(p,q,scale),factors=scale.toArray().map((v,i)=>Math.abs(v)/source.size[i]),uniform=factors.every(v=>Math.abs(v-factors[0])<1e-7),physical=(SCHEMAS[child.type]||[]).some(f=>f.unit==='mm'&&child.params?.[f.key]>0);
      if(restored.elements.every((v,i)=>Math.abs(v-matrix.elements[i])<1e-7)&&(child.brep||!physical||uniform)){
        const e=new THREE.Euler().setFromQuaternion(q,'ZYX');child.pos=p.toArray();child.rot=[e.x,e.y,e.z].map(v=>v*180/Math.PI);child.size=scale.toArray().map(Math.abs);child.mirror=scale.toArray().map(v=>v<0?-1:1);if(child.params&&uniform)child.params=scaledParameters(child,factors[0]);return child;
      }
      // Bake the full affine native body, preserving source metadata. This
      // is exact CAD, not the former mesh approximation or a TRS projection.
      const local=localShape(child),affine=matrix.clone().multiply(new THREE.Matrix4().makeScale(...source.size.map(v=>1/v)));let placed;
      try{placed=transformCad(oc,local,affine.elements);return stored(placed,{id:child.id,name:child.name,color:child.color,solid:child.solid,hidden:child.hidden,locked:child.locked,...(child.notes?{notes:child.notes}:{}),...(child.folder?{folder:child.folder}:{}),originalSource:{node:{...child,id:crypto.randomUUID()},transform:affine.elements}});}
      finally{placed?.delete();local.delete();}
    });
  }
  function binaryStl(mesh){
    const {vertices:v,triangles:t}=mesh,count=t.length/3,buffer=new ArrayBuffer(84+50*count),view=new DataView(buffer);new Uint8Array(buffer,0,80).set(new TextEncoder().encode('Formnaro Mini CAD | mm | native tessellation'));view.setUint32(80,count,true);
    for(let i=0;i<count;i++){const points=t.slice(i*3,i*3+3).map(j=>new THREE.Vector3(...v.slice(j*3,j*3+3))),normal=new THREE.Vector3().subVectors(points[1],points[0]).cross(new THREE.Vector3().subVectors(points[2],points[0])).normalize(),offset=84+i*50;[...normal.toArray(),...points.flatMap(p=>p.toArray())].forEach((value,k)=>view.setFloat32(offset+k*4,value,true));}return buffer;
  }
  return async(job,payload)=>{
    if(job.startsWith('ai-'))return (await aiModule()).run(job.slice(3),payload);
    if(job==='render')return payload.map(n=>({id:n.id,data:render(n)}));
    if(job==='bounds')return payload.map(n=>{if(n.mesh)return {id:n.id,...rawBounds(n)};const shape=worldShape(n);try{return {id:n.id,...cadBounds(oc,shape)};}finally{shape.delete();}});
    if(job==='validate'){validateProject(payload);for(const n of payload.nodes)render(n);return true;}
    if(job==='group'){const shape=combined(payload.nodes,payload.operation||'union',true);try{const n=stored(shape,{type:'group',name:payload.operation==='intersection'?'Schnittmenge':'Gruppe',solid:payload.nodes.some(n=>n.solid),color:(payload.nodes.find(n=>n.solid)??payload.nodes[0])?.color,operation:payload.operation||'union'});n.children=structuredClone(payload.nodes).map(c=>({...c,pos:c.pos.map((v,i)=>v-n.pos[i])}));render(n);return n;}finally{shape.delete();}}
    if(job==='ungroup')return ungroup(payload);
    if(job==='place'){
      const nodes=structuredClone(payload.nodes),normal=new THREE.Vector3(...payload.normal).normalize(),anchor=new THREE.Vector3(...payload.anchor);
      if(!normal.toArray().every(Number.isFinite)||normal.lengthSq()<.9||!anchor.toArray().every(Number.isFinite))throw Error('Ungültige CAD-Auflageebene.');
      const rotation=new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(normal,new THREE.Vector3(0,0,1))),visible=nodes.filter(n=>!n.hidden),support=visible.some(n=>n.solid)?visible.filter(n=>n.solid):visible;let minimum=Infinity;
      for(const n of support){if(n.mesh){minimum=Math.min(minimum,rawBounds(n,rotation).min[2]);continue;}const shape=worldShape(n);let oriented;try{oriented=transformCad(oc,shape,rotation.elements);minimum=Math.min(minimum,cadBounds(oc,oriented).min[2]);}finally{oriented?.delete();shape.delete();}}
      if(!Number.isFinite(minimum))throw Error('Keine CAD-Auflagegeometrie.');
      const delta=normal.multiplyScalar(anchor.dot(normal)-minimum);for(const n of nodes)n.pos=n.pos.map((v,i)=>v+delta.getComponent(i));return nodes;
    }
    if(job==='export-step'&&!payload.some(n=>!n.hidden&&!n.solid)){
      const parts=[];try{for(const n of payload.filter(n=>!n.hidden&&n.solid))parts.push({shape:worldShape(n),name:n.name,color:n.color});return exportCadStep(oc,parts).buffer;}finally{parts.forEach(p=>p.shape.delete());}
    }
    if(job==='export'||job==='export-step'){
      const nodes=payload.filter(n=>!n.hidden);if(!nodes.some(n=>n.solid))throw Error('Mindestens einen sichtbaren Körper markieren.');
      if(job==='export'&&nodes.length===1&&nodes[0].mesh&&nodes[0].solid)return rawStl(nodes[0]);
      const shape=combined(nodes);try{return job==='export'?binaryStl(cadExportMesh(oc,shape)):exportCadStep(oc,[{shape,name:nodes.length===1?nodes[0].name:'Mini CAD Auswahl',color:nodes.find(n=>n.solid).color}]).buffer;}finally{shape.delete();}
    }
    if(job==='import'){
      if(payload.prepared){
        const {mesh,report,asRaw}=payload.prepared;
        if(!asRaw&&mesh.triangles.length/3<=10000&&!report.topology.boundary&&!report.topology.nonmanifold&&!report.topology.orientation&&!report.topology.degenerate){
          try{const imported=buildStlFacetedCad(oc,inspectStlMesh(mesh)),shape=readCadBrep(oc,imported.brep.data);try{const n=stored(shape,{name:payload.name.replace(/\.stl$/i,'').slice(0,200)||'STL-Teil',notes:JSON.stringify(report)});render(n);return n;}finally{shape.delete();}}catch(error){if(error instanceof WebAssembly.RuntimeError)throw error;/* Keep readable original mesh when CAD construction cannot prove a solid. */}
        }
        const normal=normalizeRawMesh(mesh),n=makeNode('import',[0,0,normal.extent[2]/2],{name:payload.name.replace(/\.stl$/i,'').slice(0,200)||'STL-Rohnetz',mesh:normal.mesh,size:normal.size,color:'#79a9ad',notes:JSON.stringify(report)});render(n);return n;
      }
      if(!(payload.buffer instanceof ArrayBuffer)||payload.buffer.byteLength>30*1024*1024)throw Error('CAD-Import: maximal 30 MB.');let imported;
      if(/\.stl$/i.test(payload.name)){
        const g=new STLLoader().parse(payload.buffer);try{const p=g.getAttribute('position');if(!p||p.count>30000)throw Error('STL als facettiertes CAD: höchstens 10.000 Dreiecke. Für größere Modelle die Netz-Mini verwenden.');imported=buildStlFacetedCad(oc,inspectStlMesh({verts:Array.from(p.array),triangles:Array.from({length:p.count},(_,i)=>i)}));}finally{g.dispose();}
      }else imported=importCadStep(oc,new Uint8Array(payload.buffer));
      const shape=readCadBrep(oc,imported.brep.data);try{const n=stored(shape,{name:payload.name.replace(/\.(step|stp|stl)$/i,'').slice(0,200)||'CAD-Teil'});render(n);return n;}finally{shape.delete();}
    }
    if(job==='inspect'){const shape=worldShape(payload);try{return {...validateCadSolid(oc,shape),brep:writeCadBrep(oc,shape)};}finally{shape.delete();}}
    if(job==='info')return {kernel:'OCCT 8.0.1',cacheEntries:cache.size,cacheBytes,heapBytes:oc.wasmMemory?.buffer.byteLength||0};
    throw Error('Unbekannter Mini-CAD-Auftrag.');
  };
}
