import * as THREE from 'three';
import {cadDisplayGeometry} from './cad-renderer-geometry.js';
import {cadPermanentlyVisible} from './cad-isolation.js';
import {projectObjectIsHole} from './project-objects.js';

// Isolated offscreen scene: no selection, camera, history or live renderer changes.
export function renderAIPreviewImages(project,display){
 const bytes=display.meshes.reduce((n,r)=>n+((r.mesh.vertices??r.mesh.verts)?.length??0)*4+(r.mesh.triangles?.length??0)*4,0);
 if(bytes>64*1024*1024)throw Error('Die KI-Bildvorschau überschreitet das Grafikbudget.');
 const resources=[],renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true}),scene=new THREE.Scene(),bounds=new THREE.Box3();
 try{
  renderer.setPixelRatio(1);renderer.setSize(480,480);scene.background=new THREE.Color('#edf2f6');
  scene.add(new THREE.HemisphereLight(0xffffff,0x63758c,2.5));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(100,-150,250);scene.add(light);
  for(const record of display.meshes){
   const node=project.nodes.find(n=>n.id===(record.rootId??record.id));if(!node||!cadPermanentlyVisible(node,project)||projectObjectIsHole(node))continue;
   const geometry=cadDisplayGeometry(record.mesh,record.kind!=='cad'),material=new THREE.MeshStandardMaterial({color:record.color??node.color??'#8294aa',roughness:.72,metalness:0,side:THREE.DoubleSide}),mesh=new THREE.Mesh(geometry,material);
   resources.push(geometry,material);mesh.matrixAutoUpdate=false;mesh.matrix.fromArray(record.transform);scene.add(mesh);mesh.updateMatrixWorld(true);bounds.union(geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
   const edges=new THREE.EdgesGeometry(geometry,35),ink=new THREE.LineBasicMaterial({color:'#25364a'}),lines=new THREE.LineSegments(edges,ink);resources.push(edges,ink);lines.matrixAutoUpdate=false;lines.matrix.copy(mesh.matrix);scene.add(lines);
  }
  if(bounds.isEmpty())throw Error('Keine sichtbaren Materialteile für die KI-Bildvorschau.');
  const canvas=document.createElement('canvas');canvas.width=960;canvas.height=1008;const ctx=canvas.getContext('2d');ctx.fillStyle='#edf2f6';ctx.fillRect(0,0,960,1008);
  const center=bounds.getCenter(new THREE.Vector3()),radius=Math.max(.1,bounds.getSize(new THREE.Vector3()).length()/2),span=radius*1.12;
  const views=[['Isometrisch · Weltachsen',[1,-1.3,1],[0,0,1]],['Vorn · Blick entlang +Y',[0,-1,0],[0,0,1]],['Rechts · Blick entlang -X',[1,0,0],[0,0,1]],['Oben · Blick entlang -Z',[0,0,1],[0,1,0]]];
  for(const [i,[label,direction,up]]of views.entries()){
   const camera=new THREE.OrthographicCamera(-span,span,span,-span,.01,radius*10+10);camera.up.set(...up);camera.position.copy(center).addScaledVector(new THREE.Vector3(...direction).normalize(),radius*4+1);camera.lookAt(center);renderer.render(scene,camera);
   const x=i%2*480,y=Math.floor(i/2)*504;ctx.drawImage(renderer.domElement,x,y+24);ctx.fillStyle='#24374a';ctx.font='16px sans-serif';ctx.fillText(label,x+12,y+19);
  }
  return {images:[{name:'Formnaro-Entwurf-vier-Ansichten.png',mimeType:'image/png',dataUrl:canvas.toDataURL('image/png')}],views:views.map(v=>v[0]),scope:'Four orthographic views of visible finished material in the uncommitted candidate. Hidden objects and subtractive sources omitted. Images do not prove dimensions or hidden topology.'};
 }finally{resources.forEach(r=>r.dispose());renderer.dispose();renderer.forceContextLoss();}
}
