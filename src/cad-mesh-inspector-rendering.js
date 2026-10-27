import * as THREE from 'three';
import {MESH_INSPECTION_CATEGORIES} from './mesh-inspector.js';

export function meshInspectionFindingPoints(result,node,kind,index=0){
 const c=result?.categories?.[kind];if(!c||node?.id!==result.objectId||!node.mesh)return [];
 const vertices=c.edges.length?c.edges[index]?.vertices:c.vertexIds.length?[c.vertexIds[index]]:node.mesh.triangles.slice(c.triangleIds[index]*3,c.triangleIds[index]*3+3);
 if(!vertices?.length||vertices.some(id=>!Number.isSafeInteger(id)||id<0||id>=node.mesh.verts.length/3))return [];
 return vertices.map(id=>new THREE.Vector3().fromArray(node.mesh.verts,id*3).applyMatrix4(new THREE.Matrix4().fromArray(node.transform)).toArray());
}
export function createMeshInspectionOverlay(result,node,{enabled=Object.keys(MESH_INSPECTION_CATEGORIES),through=false}={}){
 const group=new THREE.Group();if(!result)return group;
 if(node?.kind!=='mesh'||node.id!==result.objectId||result.format!=='FormnaroMeshInspection'||result.version!==1)throw Error('Ungültige Netzdiagnose für die Anzeige.');
 group.matrixAutoUpdate=false;group.matrix.fromArray(node.transform);group.userData.rootId=node.id;
 const {verts,triangles}=node.mesh,point=id=>{if(!Number.isSafeInteger(id)||id<0||id>=verts.length/3)throw Error('Veraltete Punktmarkierung.');return verts.slice(id*3,id*3+3);};
 let count=0;for(const kind of enabled){const c=result.categories[kind];if(!c||!MESH_INSPECTION_CATEGORIES[kind])throw Error('Unbekannte Diagnosekategorie.');count+=c.count;}if(count>2500000)throw Error('Zu viele Markierungen gleichzeitig. Diagnosekategorien einzeln anzeigen.');
 try{for(const kind of enabled){
  const c=result.categories[kind],positions=[],lines=[],dots=[],color=MESH_INSPECTION_CATEGORIES[kind].color;
  for(const id of c.triangleIds){if(!Number.isSafeInteger(id)||id<0||id>=triangles.length/3)throw Error('Veraltete Flächenmarkierung.');const ids=triangles.slice(id*3,id*3+3);if(kind==='degenerate'){for(let k=0;k<3;k++)lines.push(...point(ids[k]),...point(ids[(k+1)%3]));for(const i of ids)dots.push(...point(i));}else for(const i of ids)positions.push(...point(i));}
  for(const edge of c.edges)lines.push(...point(edge.vertices[0]),...point(edge.vertices[1]));for(const id of c.vertexIds)dots.push(...point(id));
  const geometry=values=>{if(values.some(v=>!Number.isFinite(Math.fround(v))))throw Error('Diagnosekoordinaten können nicht dargestellt werden.');const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(values,3));g.computeBoundingSphere();return g;};
  const add=object=>{object.userData.meshInspection=kind;object.renderOrder=48;group.add(object);};
  if(positions.length)add(new THREE.Mesh(geometry(positions),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.78,depthTest:!through,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-5,polygonOffsetUnits:-5})));
  if(lines.length)add(new THREE.LineSegments(geometry(lines),new THREE.LineBasicMaterial({color,depthTest:!through,depthWrite:false})));
  if(dots.length)add(new THREE.Points(geometry(dots),new THREE.PointsMaterial({color,size:8,sizeAttenuation:false,depthTest:!through,depthWrite:false})));
 }}catch(error){group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});throw error;}return group;
}
