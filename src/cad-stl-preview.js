import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {STLLoader} from 'three/examples/jsm/loaders/STLLoader.js';

const LIMIT=20000;
const indices=count=>{const n=Math.min(LIMIT,count);return Array.from({length:n},(_,i)=>n<2?0:Math.floor(i*(count-1)/(n-1)));};
export function createStlPreview(container,{onPick=()=>{},onRectangle=()=>{}}={}){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,.01,10000);
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));container.append(renderer.domElement);
 scene.add(new THREE.HemisphereLight('#ffffff','#53616b',1.2));const light=new THREE.DirectionalLight('#ffffff',1.5);light.position.set(1,-2,4);scene.add(light);
 const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;
 const material=()=>new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
 let original=null,result=null,boundaries=null,analysis=null,sourceIds=[],resultIds=[],mode='Flächenarten',pickMode='Drehen',selected=new Set(),marked=new Set(),measurements=null,budget=.15,drag=null,overlay=null,disposed=false;
 const render=()=>{if(!disposed)renderer.render(scene,camera);};
 controls.addEventListener('change',render);
 const resize=()=>{const w=Math.max(1,container.clientWidth),h=Math.max(1,container.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();render();};
 const observer=new ResizeObserver(resize);observer.observe(container);
 function remove(mesh){if(mesh){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}}
 function geometry(positions){const value=new THREE.BufferGeometry();value.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));value.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(positions.length),3));value.computeVertexNormals();return value;}
 function colours(){
  if(original){const values=original.geometry.getAttribute('color');for(let i=0;i<sourceIds.length;i++){
   const face=sourceIds[i],region=analysis?.regions[analysis.face_regions[face]],label=analysis?.state.labels[face];
   let colour=mode==='Flächenarten'&&region?analysis.colours[region.type]:'#58b9e7';
   if(mode==='Flächenarten'&&selected.has(label))colour='#ffe633';if(mode==='Flächenarten'&&marked.has(face))colour='#ff4099';
   const c=new THREE.Color(colour);for(let j=0;j<3;j++)values.setXYZ(i*3+j,c.r,c.g,c.b);
  }values.needsUpdate=true;}
  if(result){const values=result.geometry.getAttribute('color'),distances=new Map(measurements?.face_indices.map((id,i)=>[id,measurements.distances_mm[i]])??[]);
   for(let i=0;i<resultIds.length;i++){const distance=distances.get(resultIds[i]),c=mode==='Abweichung'&&distance!==undefined?new THREE.Color().setHSL((1-Math.min(1,distance/budget))*.66,.85,.5):new THREE.Color('#77ce8d');for(let j=0;j<3;j++)values.setXYZ(i*3+j,c.r,c.g,c.b);}values.needsUpdate=true;
  }
  if(original){original.visible=['Flächenarten','Original','Überlagerung'].includes(mode)||!result;original.material.transparent=mode==='Überlagerung';original.material.opacity=mode==='Überlagerung'?.35:1;original.material.depthWrite=mode!=='Überlagerung';}
  if(result)result.visible=['Ergebnis','Überlagerung','Abweichung'].includes(mode);
  if(boundaries)boundaries.visible=mode==='Flächenarten';render();
 }
 function fit(){const box=new THREE.Box3();if(original)box.expandByObject(original);if(result)box.expandByObject(result);if(box.isEmpty())return;const centre=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()).length()||1;camera.near=Math.max(.0001,size/10000);camera.far=size*100;camera.position.copy(centre).add(new THREE.Vector3(1,-1,.8).normalize().multiplyScalar(size*1.6));camera.up.set(0,0,1);controls.target.copy(centre);camera.updateProjectionMatrix();controls.update();resize();}
 function setAnalysis(value){const same=analysis?.state.mesh_sha256===value.state.mesh_sha256;analysis=value;remove(original);remove(boundaries);const positions=[];sourceIds=indices(value.faces.length);for(const face of sourceIds)for(const vertex of value.faces[face])positions.push(...value.vertices[vertex]);original=new THREE.Mesh(geometry(positions),material());scene.add(original);
  const edges=new Map(),lines=[];value.faces.forEach((face,id)=>{for(let j=0;j<3;j++){const a=face[j],b=face[(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join('/');if(edges.has(key)){if(edges.get(key)!==value.face_regions[id])lines.push(...value.vertices[a],...value.vertices[b]);}else edges.set(key,value.face_regions[id]);}});
  boundaries=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(lines,3)),new THREE.LineBasicMaterial({color:'#273846',transparent:true,opacity:.8}));scene.add(boundaries);colours();if(!same)fit();
 }
 function setResult(bytes,deviation,tolerance){remove(result);const loaded=new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),attribute=loaded.getAttribute('position'),positions=[];resultIds=indices(Math.floor(attribute.count/3));for(const id of resultIds)for(let j=0;j<3;j++)positions.push(attribute.getX(id*3+j),attribute.getY(id*3+j),attribute.getZ(id*3+j));loaded.dispose();result=new THREE.Mesh(geometry(positions),material());scene.add(result);measurements=deviation;budget=tolerance;colours();fit();}
 const point=event=>{const bounds=renderer.domElement.getBoundingClientRect();return {x:event.clientX-bounds.left,y:event.clientY-bounds.top,w:bounds.width,h:bounds.height};};
 function pointerDown(event){if(pickMode==='Drehen'||event.button!==0||!analysis||!original?.visible)return;drag={...point(event),shift:event.ctrlKey||event.shiftKey||event.metaKey};renderer.domElement.setPointerCapture(event.pointerId);}
 function pointerMove(event){if(!drag)return;const p=point(event);if(Math.hypot(p.x-drag.x,p.y-drag.y)<4)return;if(!overlay){overlay=document.createElement('div');overlay.className='stl-selection-box';container.append(overlay);}Object.assign(overlay.style,{left:Math.min(p.x,drag.x)+'px',top:Math.min(p.y,drag.y)+'px',width:Math.abs(p.x-drag.x)+'px',height:Math.abs(p.y-drag.y)+'px'});}
 function pointerUp(event){if(!drag)return;const start=drag,p=point(event);drag=null;overlay?.remove();overlay=null;
  if(Math.hypot(p.x-start.x,p.y-start.y)>4&&pickMode==='Dreiecke'){
   const ids=[],centre=new THREE.Vector3();analysis.faces.forEach((face,id)=>{centre.set(0,0,0);for(const v of face)centre.add(new THREE.Vector3(...analysis.vertices[v]));centre.multiplyScalar(1/3).project(camera);const x=(centre.x+1)*p.w/2,y=(1-centre.y)*p.h/2;if(centre.z>=-1&&centre.z<=1&&x>=Math.min(p.x,start.x)&&x<=Math.max(p.x,start.x)&&y>=Math.min(p.y,start.y)&&y<=Math.max(p.y,start.y))ids.push(id);});onRectangle(ids,start.shift);
  }else{const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(p.x/p.w*2-1,1-p.y/p.h*2),camera);const hit=ray.intersectObject(original)[0];if(hit)onPick(sourceIds[hit.faceIndex],start.shift,pickMode);}
 }
 renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointermove',pointerMove);renderer.domElement.addEventListener('pointerup',pointerUp);
 const pointerCancel=()=>{drag=null;overlay?.remove();overlay=null;};renderer.domElement.addEventListener('pointercancel',pointerCancel);
 resize();
 return {setAnalysis,setResult,setMode:value=>{mode=value;colours();},setSelection:(regions,faces)=>{selected=new Set(regions);marked=new Set(faces);colours();},setPickMode:value=>{pickMode=value;controls.enableRotate=value==='Drehen';controls.enablePan=value==='Drehen';},fit,
  clearResult:()=>{remove(result);result=null;measurements=null;mode='Flächenarten';colours();},
  clearSource:()=>{remove(original);remove(boundaries);original=null;boundaries=null;analysis=null;sourceIds=[];render();},
  dispose:()=>{disposed=true;observer.disconnect();controls.dispose();remove(original);remove(result);remove(boundaries);pointerCancel();renderer.dispose();renderer.domElement.remove();}};
}
