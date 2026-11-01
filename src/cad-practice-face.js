import {Vector3} from 'three';
import {cadSelectionContext} from './cad-interface-state.js';

export const PRACTICE_FACE_SIDES=Object.freeze({top:[0,0,1],bottom:[0,0,-1],left:[-1,0,0],right:[1,0,0],front:[0,-1,0],back:[0,1,0]});

// Only the local host computes screen points from the current display. Native
// rayPick then verifies the actual face before normal mouse input can use it.
export function installPracticeFace({controller,view,getFacePickState,host=window}){
 host.__formnaroPracticeFace=async spec=>{
  const direction=PRACTICE_FACE_SIDES[spec.side],state=getFacePickState?.(),revision=controller.revision(),project=controller.readSnapshot();
  if(!direction||!state?.picking||!['shell','face-offset'].includes(state.kind)||state.ids?.length!==1||state.ids[0]!==spec.rootId)throw Error('Zuerst Aushöhlen oder CAD-Fläche versetzen für dieses Teil öffnen.');
  const context=cadSelectionContext(project,{rootId:spec.rootId,path:[]});
  if(context.node.kind!=='cad'||!context.node.solid||context.locked||context.hidden||!view.allows(spec.rootId))throw Error('Eine sichtbare, entsperrte CAD-Körperfläche wählen.');
  view.scene.updateMatrixWorld(true);const axis=new Vector3(...direction),candidates=[];let triangles=0;
  view.scene.traverse(mesh=>{
   if(!mesh.isMesh||mesh.userData.rootId!==spec.rootId||mesh.userData.record?.kind!=='cad')return;
   for(let p=mesh;p;p=p.parent)if(!p.visible)return;
   const geometry=mesh.geometry,position=geometry.getAttribute('position'),index=geometry.index,groups=geometry.userData.cadFaceGroups;if(!index||!position||!groups?.length)return;
   const a=new Vector3(),b=new Vector3(),c=new Vector3(),normal=new Vector3(),edge=new Vector3(),sign=mesh.matrixWorld.determinant()<0?-1:1;
   for(let g=0;g<groups.length;g+=3)for(let i=groups[g];i<groups[g]+groups[g+1];i+=3){
    if(++triangles>200000)throw Error('Die Fläche überschreitet das Auswahlbudget.');
    a.fromBufferAttribute(position,index.getX(i)).applyMatrix4(mesh.matrixWorld);b.fromBufferAttribute(position,index.getX(i+1)).applyMatrix4(mesh.matrixWorld);c.fromBufferAttribute(position,index.getX(i+2)).applyMatrix4(mesh.matrixWorld);
    normal.subVectors(b,a).cross(edge.subVectors(c,a));const area=normal.length()/2;if(area<1e-10||normal.normalize().multiplyScalar(sign).dot(axis)<.99999)continue;
    const point=a.clone().add(b).add(c).multiplyScalar(1/3);candidates.push({point,area,level:point.dot(axis),faceIndex:groups[g+2]});
   }
  });
  if(!candidates.length)throw Error('Keine ebene Körperfläche in dieser Welt-Richtung gefunden.');
  const extreme=Math.max(...candidates.map(c=>c.level)),outer=candidates.filter(c=>Math.abs(c.level-extreme)<1e-4);
  if(new Set(outer.map(c=>c.faceIndex)).size!==1)throw Error('Mehrere äußerste Flächen sind möglich. Einen eindeutigen Körper oder eine andere Seite wählen.');
  const rect=view.canvas.getBoundingClientRect();let chosen;
  for(const candidate of outer.sort((a,b)=>b.area-a.area).slice(0,40)){
   const point=view.projectPoint(candidate.point.toArray()),x=Math.round(point.x),y=Math.round(point.y);
   if(point.z< -1||point.z>1||x<rect.left||x>=rect.right||y<rect.top||y>=rect.bottom)continue;
   const hit=view.visualHit({clientX:x,clientY:y});if(hit?.object?.userData.rootId===spec.rootId&&Math.abs(hit.point.dot(axis)-candidate.level)<.02){chosen={...candidate,x,y};break;}
  }
  if(!chosen)throw Error('Die gewünschte Fläche ist verdeckt. Ansicht zuerst passend ausrichten.');
  const hit=await controller.query('rayPick',{ids:[spec.rootId],ray:view.cadRay({clientX:chosen.x,clientY:chosen.y})});
  if(controller.revision()!==revision||getFacePickState()?.revision!==state.revision)throw Error('Modell während der Flächenauswahl geändert.');
  if(!hit||hit.objectId!==spec.rootId||hit.faceIndex!==chosen.faceIndex||!Array.isArray(hit.normal)||new Vector3(...hit.normal).dot(axis)<.99999)throw Error('Der native Flächentreffer stimmt nicht mit der gewünschten Seite überein.');
  return {x:chosen.x,y:chosen.y,width:24,height:24,revision,faceIndex:hit.faceIndex,point:hit.point,normal:hit.normal};
 };
}
