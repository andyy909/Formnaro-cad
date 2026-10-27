import {projectObjectIsHole} from './project-objects.js';
import * as THREE from 'three';
import {cadDisplayGeometry} from './cad-renderer-geometry.js';
import {cadPermanentlyVisible} from './cad-isolation.js';

// A separate camera, scene and graphics context; no live-view state is touched.
export function renderCadProjectThumbnail(project,display){
  const bytes=display.meshes.reduce((total,r)=>total+((r.mesh.vertices??r.mesh.verts)?.length??0)*4+(r.mesh.normals?.length??0)*4+(r.mesh.triangles?.length??0)*4,0);if(bytes>32*1024*1024)throw Error('Projektvorschau ist zu groß.');
  const scene=new THREE.Scene(),renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(1);renderer.setSize(240,160);scene.background=new THREE.Color('#eef2f6');
  const resources=[],bounds=new THREE.Box3();
  try{
    scene.add(new THREE.HemisphereLight(0xffffff,0xaab6c6,2.5));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-80,-160,300);scene.add(light);
    for(const record of display.meshes){const node=project.nodes.find(n=>n.id===(record.rootId??record.id));if(!cadPermanentlyVisible(node,project))continue;
      const geometry=cadDisplayGeometry(record.mesh,record.kind!=='cad'),material=new THREE.MeshStandardMaterial({color:projectObjectIsHole(node)?'#89929e':record.color??node.color,roughness:.62,metalness:.03,side:THREE.DoubleSide,transparent:projectObjectIsHole(node),opacity:projectObjectIsHole(node)?.28:1}),mesh=new THREE.Mesh(geometry,material);
      resources.push(geometry,material);mesh.matrixAutoUpdate=false;mesh.matrix.fromArray(record.transform);scene.add(mesh);mesh.updateMatrixWorld(true);bounds.union(geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
    }
    const camera=new THREE.PerspectiveCamera(42,1.5,.01,1e9),center=bounds.isEmpty()?new THREE.Vector3():bounds.getCenter(new THREE.Vector3()),size=bounds.isEmpty()?20:bounds.getSize(new THREE.Vector3()).length();
    camera.up.set(0,0,1);camera.position.copy(center).addScaledVector(new THREE.Vector3(1,-1.3,1.1).normalize(),Math.max(1,size*1.8));camera.lookAt(center);renderer.render(scene,camera);
    return renderer.domElement.toDataURL('image/png');
  }finally{for(const resource of resources)resource.dispose();renderer.dispose();renderer.forceContextLoss();}
}
