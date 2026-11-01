import {Vector3} from 'three';
import {cadPoint} from './cad-affine.js';
import {cadSnapGear,cadGearCentreDistance,findCadGearSnap} from './cad-gear-snap.js';

// The provider supplies model references and a bearing, never screen points.
// Re-read confirmed geometry for every native input; calculate points locally.
export function installPracticeGearDrag({controller,view,host=window,document=globalThis.document}){
 host.__formnaroPracticeGearDrag=spec=>{
  const p=controller.readSnapshot(),node=p.nodes.find(n=>n.id===spec.rootId),a=cadSnapGear(p.nodes.find(n=>n.id===spec.anchorId),p),b=cadSnapGear(node,p);if(!a||!b||a.id===b.id)throw Error('Zwei sichtbare, passende native Zahnräder wählen.');
  const distance=cadGearCentreDistance(a,b),normal=a.z,reference=(Math.abs(normal.x)<.9?new Vector3(1,0,0):new Vector3(0,1,0));reference.addScaledVector(normal,-reference.dot(normal)).normalize();const across=normal.clone().cross(reference),angle=Number(spec.value)*Math.PI/180,center=a.center.clone().addScaledVector(reference,Math.cos(angle)*distance).addScaledVector(across,Math.sin(angle)*distance);
  const ghost={...node,transform:[...node.transform]};ghost.transform.splice(12,3,...center.toArray());const candidate={...p,nodes:p.nodes.map(n=>n.id===node.id?ghost:n)},prefs=host.__formnaroPracticeGearPreferences?.()??{gearSnap:true,gearSnapAngle:15},snap=findCadGearSnap(candidate,node.id,{enabled:prefs.gearSnap,angleStep:prefs.gearSnapAngle});
  if(!snap||snap.anchorId!==a.id)throw Error('Einrasten einschalten und Zahnräder mit passendem Modul, Eingriffswinkel und Originalgröße wählen.');
  const gripRadius=Math.max(b.p.bore*b.scale/2+b.module,b.radius*.6),grip=cadPoint(node.transform,[gripRadius/b.scale*Math.cos(Math.PI+.6),gripRadius/b.scale*Math.sin(Math.PI+.6),0]),from=view.projectPoint(grip),to=view.projectPoint(grip.map((v,k)=>v+center.getComponent(k)-b.center.getComponent(k))),canvas=document.querySelector('#canvas-host canvas'),r=canvas.getBoundingClientRect();
  if(view.visualHit({clientX:from.x,clientY:from.y})?.object?.userData.rootId!==node.id)throw Error('Das zu ziehende Zahnrad ist verdeckt. Ansicht zuerst freistellen.');
  for(const point of [from,to])if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<r.left||point.x>=r.right||point.y<r.top||point.y>=r.bottom)throw Error('Zahnräder zuerst in die Ansicht einpassen.');
  return {x:Math.round(from.x),y:Math.round(from.y),width:24,height:24,to:{x:Math.round(to.x),y:Math.round(to.y)},anchorId:a.id,distance};
 };
}
