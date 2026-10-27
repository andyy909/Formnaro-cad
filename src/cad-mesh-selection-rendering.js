import * as THREE from 'three';
import {meshSurfaceHit} from './mesh-surface.js';

// A colored/source display can be retessellated. Its faceIndex is never a
// persistent source ID: only use that display to establish the first occluder.
export function meshSelectionSurfaceHit(ray,hit,node){
  if(node?.kind!=='mesh'||!hit?.object?.visible||hit.object.userData.rootId!==node.id||hit.object.userData.sourceTarget?.path?.length||hit.object.userData.record?.kind!=='mesh')return null;
  return meshSurfaceHit(node,ray);
}

/** View-only buffers, addressed by original triangle/vertex IDs. No source
 * geometry, pose, per-face colors or kernel data is ever modified. */
export function createMeshSelectionOverlay(binding,node,{color='#ffc247'}={}){
  const group=new THREE.Group();
  if(!binding)return group;
  if(node?.kind!=='mesh'||binding.objectId!==node.id||!Array.isArray(binding.triangleIds)||!Array.isArray(binding.boundaryEdges))throw Error('Ungültige Netz-Auswahlanzeige.');
  const {verts,triangles}=node.mesh,positions=[],lines=[];
  const vertex=id=>{if(!Number.isSafeInteger(id)||id<0||id>=verts.length/3)throw Error('Veralteter Netzpunkt in der Auswahl.');const p=verts.slice(id*3,id*3+3);if(p.some(v=>!Number.isFinite(Math.fround(v))))throw Error('Netzauswahl kann nicht dargestellt werden.');return p;};
  if(binding.triangleIds.length>500000||binding.boundaryEdges.length>1500000)throw Error('Die Netzauswahl ist für die Darstellung zu groß.');
  for(const id of binding.triangleIds){
    if(!Number.isSafeInteger(id)||id<0||id>=triangles.length/3)throw Error('Veraltetes Netzdreieck in der Auswahl.');
    for(let k=0;k<3;k++)positions.push(...vertex(triangles[id*3+k]));
  }
  for(const edge of binding.boundaryEdges){if(!Array.isArray(edge.vertices)||edge.vertices.length!==2)throw Error('Ungültiger ausgewählter Öffnungsrand.');lines.push(...vertex(edge.vertices[0]),...vertex(edge.vertices[1]));}
  group.userData.rootId=node.id;group.matrixAutoUpdate=false;group.matrix.fromArray(node.transform);
  if(positions.length){
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeBoundingSphere();
    const material=new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.62,depthTest:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
    const mesh=new THREE.Mesh(geometry,material);mesh.renderOrder=35;mesh.userData.meshSelection='triangles';group.add(mesh);
  }
  if(lines.length){
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));geometry.computeBoundingSphere();
    const edge=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#ff8a18',depthTest:true,depthWrite:false}));edge.renderOrder=36;edge.userData.meshSelection='boundary';group.add(edge);
  }
  return group;
}

// Only real visible model surfaces occlude a screen selection; helpers and
// selection/protection overlays are excluded, as in the normal ray picker.
export function meshSelectionScreenContext(camera,canvas,bodies,sources,node){
 if(!bodies.children.some(m=>m.visible&&m.userData.rootId===node.id))throw Error('Die unveränderte Netzoberfläche ist gerade nicht sichtbar. Schnittansicht oder Quellenvorschau zuerst beenden.');
 const visible=[...sources.children,...bodies.children].filter(m=>m.visible&&m.userData.rootId!==node.id);
 if(visible.reduce((sum,m)=>sum+(m.geometry.index?.count??m.geometry.attributes.position.count)/3,node.mesh.triangles.length/3)>1500000)throw Error('Zu viele sichtbare Dreiecke für Pinsel und Lasso. Andere Teile ausblenden oder isolieren.');
 camera.updateMatrixWorld(true);const rect=canvas.getBoundingClientRect();
 const occluders=visible.map(m=>{m.updateMatrixWorld(true);const g=m.geometry,verts=Array.from(g.attributes.position.array),triangles=g.index?Array.from(g.index.array):Array.from({length:verts.length/3},(_,i)=>i);return {mesh:{verts,triangles},transform:m.matrixWorld.toArray()};});
 return {width:rect.width,height:rect.height,viewProjection:new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).toArray(),occluders};
}
