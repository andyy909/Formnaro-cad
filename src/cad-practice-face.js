import {Vector3} from 'three';
import {cadSelectionContext} from './cad-interface-state.js';

export const PRACTICE_FACE_SIDES=Object.freeze({top:[0,0,1],bottom:[0,0,-1],left:[-1,0,0],right:[1,0,0],front:[0,-1,0],back:[0,1,0]});

export const practiceReferenceMarker=(document,id)=>[...document.querySelectorAll('.cad-reference-marker')].find(node=>node.dataset.pointId===id);

// Only the local host computes screen points from the current display. Native
// rayPick then verifies the actual face before normal mouse input can use it.
export function installPracticeFace({controller,view,getFacePickState,getDrillState,host=window}){
 host.__formnaroPracticeFace=async spec=>{
  const direction=PRACTICE_FACE_SIDES[spec.side],state=getFacePickState?.(),revision=controller.revision(),project=controller.readSnapshot();
  const drill=getDrillState?.();
  const drilling=drill?.stage==='target'&&drill.id===spec.rootId&&drill.revision===revision&&drill.ready&&!drill.target;
  if(!direction||(!drilling&&(!state?.picking||!['shell','face-offset'].includes(state.kind)||state.ids?.length!==1||state.ids[0]!==spec.rootId))){
   throw Error('Zuerst die Flächenauswahl für Aushöhlen, CAD-Flächenversatz oder Bohrung am gewählten Teil öffnen.');
  }
  const context=cadSelectionContext(project,{rootId:spec.rootId,path:[]});
  if(context.node.kind!=='cad'||!context.node.solid||context.locked||context.hidden||!view.allows(spec.rootId))throw Error('Eine sichtbare, entsperrte CAD-Körperfläche wählen.');
  if(drilling){
   const axis=new Vector3(...direction),candidates=drill.centers.filter(point=>new Vector3(...point.normal).dot(axis)>.99999);
   const level=point=>new Vector3(...point.point).dot(axis),outer=Math.max(...candidates.map(level));
   const faces=candidates.filter(point=>Math.abs(level(point)-outer)<1e-4);
   if(faces.length!==1)throw Error('Eine eindeutige äußere ebene Bohrfläche wählen.');
   const face=faces[0],marker=practiceReferenceMarker(host.document,face.id);
   if(!marker?.getClientRects().length)throw Error('Flächenschwerpunkt ist nicht sichtbar. Ansicht und Fangziel „Flächenschwerpunkte“ prüfen.');
   const rect=marker.getBoundingClientRect(),screen=view.projectPoint(face.point);
   const at={clientX:screen.x,clientY:screen.y};
   if(view.visualHit(at)?.object?.userData.rootId!==spec.rootId)throw Error('Der Flächenschwerpunkt ist verdeckt.');
   const hit=await controller.query('rayPick',{ids:[spec.rootId],ray:view.cadRay(at)});
   if(controller.revision()!==revision||!marker.isConnected||getDrillState()?.target)throw Error('Bohrbezug wurde während der Auswahl geändert.');
   if(hit?.faceIndex!==face.faceIndex||!Array.isArray(hit?.normal)||new Vector3(...hit.normal).dot(axis)<.99999||
     new Vector3(...hit.point).distanceTo(new Vector3(...face.point))>.01)throw Error('Der native Flächentreffer bestätigt den Bohrbezug nicht.');
   return {x:Math.round(rect.x+rect.width/2),y:Math.round(rect.y+rect.height/2),width:rect.width,height:rect.height,
    revision,faceIndex:face.faceIndex,point:face.point,normal:face.normal,markerId:face.id};
  }
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
