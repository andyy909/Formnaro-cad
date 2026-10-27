import * as THREE from 'three';
import {localManifold,worldManifold,meshData,matrixArray,normalizeMesh,makeNode,groupNodes,fromMesh,validNode} from './geometry.js';

import {analyzeLocalFinishEdges,sweepRim} from './mesh-edge-topology.js';
export const analyzeFinishEdges=analyzeLocalFinishEdges;

function prism(edge,points){
 const origin=new THREE.Vector3(...edge.start),u=new THREE.Vector3(...edge.normals[0]).negate(),v=new THREE.Vector3(...edge.normals[1]).negate(),z=new THREE.Vector3().crossVectors(u,v).normalize(),end=new THREE.Vector3(...edge.end),length=end.clone().sub(origin).dot(z);
 if(length<0){origin.copy(end);}const h=Math.abs(length),n=points.length,verts=[];
 for(const depth of [0,h])for(const [x,y]of points)verts.push(...origin.clone().addScaledVector(u,x).addScaledVector(v,y).addScaledVector(z,depth).toArray());
 const triangles=[];for(const tri of THREE.ShapeUtils.triangulateShape(points.map(p=>new THREE.Vector2(...p)),[])){triangles.push(tri[2],tri[1],tri[0],...tri.map(i=>i+n));}
 for(let i=0;i<n;i++){const j=(i+1)%n;triangles.push(i,j,j+n,i,j+n,i+n);}return {verts,triangles};
}
function tool(edge,points,name){const data=edge.kind==='rim'?sweepRim(edge,points):prism(edge,points),normalized=normalizeMesh(data),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<data.verts.length;i++) {const k=i%3;min[k]=Math.min(min[k],data.verts[i]);max[k]=Math.max(max[k],data.verts[i]);}return makeNode('import',min.map((x,i)=>(x+max[i])/2),{name,solid:false,size:normalized.size,mesh:normalized.mesh,color:'#90a8b5'});}
export function finishOptions(value){const o={mode:'fillet',width:1,segments:32,...value};if(!['fillet','chamfer'].includes(o.mode)||!Number.isFinite(o.width)||o.width<.01||o.width>100||!Number.isInteger(o.segments)||o.segments<8||o.segments>128)throw Error('Radius/Fasenbreite: 0,01–100 mm; Rundung: 8–128 Segmente.');return o;}
export async function finishSelectedEdges(original,ids,options){
 const o=finishOptions(options),analysis=await analyzeFinishEdges(original);if(!Array.isArray(ids)||!ids.length||ids.length>16||new Set(ids).size!==ids.length)throw Error('Eine bis 16 unterschiedliche Kanten auswählen.');
 const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(...original.rot.map(v=>v*Math.PI/180),'ZYX')),inverse=rotation.clone().invert();
 const edges=ids.map(id=>{const e=analysis.edges.find(e=>e.id===id);if(!e)throw Error('Kantenbezug passt nicht mehr. Kanten erneut wählen.');if(e.kind==='rim')return {...e,points:e.points.map(p=>new THREE.Vector3(...p).sub(new THREE.Vector3(...original.pos)).applyQuaternion(inverse).toArray()),normal:new THREE.Vector3(...e.normal).applyQuaternion(inverse).toArray(),miters:e.miters.map(p=>new THREE.Vector3(...p).applyQuaternion(inverse).toArray()),slopes:e.slopes.map(p=>new THREE.Vector3(...p).applyQuaternion(inverse).toArray())};return {...e,start:new THREE.Vector3(...e.start).sub(new THREE.Vector3(...original.pos)).applyQuaternion(inverse).toArray(),end:new THREE.Vector3(...e.end).sub(new THREE.Vector3(...original.pos)).applyQuaternion(inverse).toArray(),normals:e.normals.map(n=>new THREE.Vector3(...n).applyQuaternion(inverse).toArray())};});
 // Perform and store the CSG in the original rigid frame. Reboxing a rotated
 // world mesh would unnecessarily quantize large planar faces to Float32.
 const frameOriginal={...structuredClone(original),pos:[0,0,0],rot:[0,0,0]},source=worldManifold(frameOriginal),cutters=[],cutSolids=[];let expected,result,a,b,union;
 try{
  const volume=source.volume(),tol=Math.max(volume*2e-6,1e-8),precision=analysis.tolerance;if(o.width<precision*16)throw Error('Das Maß ist für die Größe des Teils zu klein. Maß erhöhen.');
  for(const edge of edges){
   if(o.width>edge.length/3)throw Error('Radius/Fasenbreite darf höchstens ein Drittel der Kantenlänge betragen.');
   for(const previous of edges.slice(0,edges.indexOf(edge)))if(edge.kind!=='rim'&&previous.kind!=='rim'&&[edge.start,edge.end].some(p=>[previous.start,previous.end].some(q=>Math.hypot(...p.map((v,i)=>v-q[i]))<analysis.tolerance*2)))throw Error('Zusammenlaufende Kanten werden noch nicht gemeinsam bearbeitet. Kanten ohne gemeinsamen Endpunkt wählen.');
   const profile=[[0,0],[o.width,0],[o.width,o.width],[0,o.width]],block=fromMesh(edge.kind==='rim'?sweepRim(edge,profile):prism(edge,profile));let outside;
   try{outside=block.subtract(source);if(outside.status()!=='NoError'||outside.volume()>Math.max(block.volume()*2e-5,1e-8))throw Error('Das Maß erreicht eine Öffnung, eine andere Fläche oder ein schräges Kantenende. Kleineres Maß oder andere Kante wählen.');}finally{outside?.delete();block.delete();}
   const points=o.mode==='chamfer'?[[0,0],[o.width,0],[0,o.width]]:[[0,0],...Array.from({length:o.segments+1},(_,i)=>{const angle=-Math.PI/2-i*Math.PI/2/o.segments;return [o.width+o.width*Math.cos(angle),o.width+o.width*Math.sin(angle)];})];
   const cutter=tool(edge,points,(o.mode==='fillet'?'Kantenradius ':'Kantenfase ')+o.width+' mm'),solid=worldManifold(cutter);if(!validNode(cutter)||solid.status()!=='NoError'||solid.volume()<=0){solid.delete();throw Error('Das Kantenmaß erzeugt kein gültiges Werkzeug.');}
   for(const previous of cutSolids){const overlap=solid.intersect(previous);try{if(overlap.volume()>Math.max(solid.volume()*1e-5,1e-8))throw Error('Die gewählten Kantenbearbeitungen überlappen. Kleineres Maß oder einzelne Kante wählen.');}finally{overlap.delete();}}
   cutters.push(cutter);cutSolids.push(solid);
  }
  const node=groupNodes([frameOriginal,...cutters]);node.name=(original.name+' · '+(o.mode==='fillet'?'Kantenrundung':'Kantenfase')).slice(0,200);node.multicolor=!!original.multicolor;node.layerId=original.layerId;node.folderId=original.folderId;if(original.notes)node.notes=original.notes;if(original.opacity!==undefined)node.opacity=original.opacity;
  result=worldManifold(node);union=cutSolids.reduce((current,next)=>{if(!current)return next.add(next);const joined=current.add(next);current.delete();return joined;},null);expected=source.subtract(union);a=result.subtract(expected);b=expected.subtract(result);
  const removed=volume-result.volume();if(result.status()!=='NoError'||result.isEmpty()||result.volume()<=0||removed<=Math.max(1e-8,volume*1e-9)||a.status()!=='NoError'||b.status()!=='NoError'||Math.abs(a.volume())>tol||Math.abs(b.volume())>tol)throw Error('Die Kantenbearbeitung konnte nicht sicher geprüft werden. Original bleibt erhalten.');
  node.pos=new THREE.Vector3(...node.pos).applyQuaternion(rotation).add(new THREE.Vector3(...original.pos)).toArray();node.rot=[...original.rot];if(!validNode(node))throw Error('Kantenergebnis liegt außerhalb des Arbeitsbereichs.');
  return {node,removedVolume:removed,edgeCount:edges.length,mode:o.mode,width:o.width,contourError:Math.max(0,...edges.filter(e=>e.kind==='rim').flatMap(e=>e.miters.map((m,i)=>o.width*(Math.max(0,new THREE.Vector3(...m).length()-1)+new THREE.Vector3(...e.slopes[i]).length())))),chordError:o.mode==='fillet'?o.width*(1-Math.cos(Math.PI/(4*o.segments))):0};
 }finally{source.delete();cutSolids.forEach(m=>m.delete());expected?.delete();result?.delete();a?.delete();b?.delete();union?.delete();}
}
