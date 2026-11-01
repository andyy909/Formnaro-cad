import {Matrix4,Vector3} from 'three';
import {defaults,validParameters,gearDimensions} from './parameters.js';
import {flags} from './organization.js';
import {applyCadJointRequest,cadJointProblems} from './cad-joints-data.js';
import {multiplyCadMatrices,cadPoint} from './cad-affine.js';

const TAU=2*Math.PI,eps=1e-6,vec=a=>new Vector3(...a),close=(a,b)=>Math.abs(a-b)<eps;
// Only original, round constructive gears carry enough information. A name or
// a faceted import is never treated as evidence of a compatible tooth profile.
export function cadSnapGear(node,project){
 if(!node||node.kind!=='cad'||node.source!=='native'||node.recipe?.type!=='gear'||!node.solid||node.suppressed||node.finish?.steps?.length||flags(node,project).hidden||flags(node,project).locked)return null;
 const p={...defaults('gear'),...node.recipe.params};if(!validParameters({type:'gear',params:p}))return null;
 const m=node.transform,x=vec(m.slice(0,3)),y=vec(m.slice(4,7)),z=vec(m.slice(8,11)),scale=x.length();
 if(!scale||!close(y.length(),scale)||!close(z.length(),scale))return null;x.normalize();y.normalize();z.normalize();
 if(Math.abs(x.dot(y))+Math.abs(x.dot(z))+Math.abs(y.dot(z))>eps||x.clone().cross(y).dot(z)<1-eps)return null;
 return {id:node.id,p,scale,module:p.module*scale,radius:gearDimensions(p).pitch*scale/2,center:vec(m.slice(12,15)),x,y,z,twist:p.thickness*Math.tan(p.helixAngle*Math.PI/180)/(gearDimensions(p).pitch/2)};
}
export function cadGearCentreDistance(a,b){
 const alpha=gearDimensions(a.p).alpha,inv=x=>Math.tan(x)-x;
 const wanted=inv(alpha)+2*(a.p.profileShift+b.p.profileShift)*Math.tan(a.p.pressureAngle*Math.PI/180)/(a.p.teeth+b.p.teeth);if(wanted<0)return null;
 let lo=0,hi=Math.PI/2-1e-7;for(let i=0;i<70;i++){const mid=(lo+hi)/2;if(inv(mid)<wanted)lo=mid;else hi=mid;}
 return (a.radius+b.radius)*Math.cos(alpha)/Math.cos((lo+hi)/2);
}
function supportedJoint(project,gear){
 const joint=project.joints?.joints.find(j=>j.childId===gear.id);if(!joint)return null;if(joint.kind!=='revolute')return false;
 const parent=project.nodes.find(n=>n.id===joint.parentId);if(!parent||flags(parent,project).locked)return false;
 const frame=multiplyCadMatrices(parent.transform,joint.parentFrame),origin=vec(cadPoint(frame,[0,0,0])),axis=vec(frame.slice(8,11)).normalize();
 return origin.distanceTo(gear.center)<eps&&Math.abs(axis.dot(gear.z))>1-eps?joint:false;
}
export function findCadGearSnap(project,movingId,{enabled=true,tolerance=1,angleStep=15}={}){
 if(!enabled)return null;const moving=project.nodes.find(n=>n.id===movingId),b=cadSnapGear(moving,project);if(!b)return null;
 // An existing assembly must be moved through its own joints. Snapping a
// loose part must never detach or silently rebind an existing mechanism.
 if(project.joints?.joints.some(j=>j.childId===movingId||j.parentId===movingId)||project.joints?.bases.includes(movingId))return null;
 if(cadJointProblems(project).length)return null;
 const candidates=[];
 for(const node of project.nodes){
  if(node.id===movingId)continue;const a=cadSnapGear(node,project);if(!a||!close(a.module,b.module)||!close(a.p.pressureAngle,b.p.pressureAngle)||!close(a.p.helixAngle,-b.p.helixAngle)||a.z.dot(b.z)<1-eps)continue;
  const joint=supportedJoint(project,a);if(joint===false||!joint&&project.joints?.joints.some(j=>j.parentId===a.id))continue;
  const distance=cadGearCentreDistance(a,b);if(!distance||!Number.isFinite(distance))continue;
  const delta=b.center.clone().sub(a.center),axial=delta.dot(a.z),radial=delta.clone().addScaledVector(a.z,-axial),length=radial.length(),capture=tolerance;
  if(length<eps||Math.abs(length-distance)>capture+eps||Math.abs(axial)>capture+eps)continue;
  const reference=(Math.abs(a.z.x)<.9?new Vector3(1,0,0):new Vector3(0,1,0)).addScaledVector(a.z,Math.abs(a.z.x)<.9?-a.z.x:-a.z.y).normalize(),across=a.z.clone().cross(reference),bearing=Math.atan2(radial.dot(across),radial.dot(reference)),step=angleStep*Math.PI/180;
  const snappedBearing=angleStep>0?Math.round(bearing/step)*step:bearing,direction=reference.multiplyScalar(Math.cos(snappedBearing)).addScaledVector(across,Math.sin(snappedBearing));
  const center=a.center.clone().addScaledVector(direction,distance),phi=Math.atan2(direction.dot(a.y),direction.dot(a.x)),current=Math.atan2(b.x.dot(a.y),b.x.dot(a.x))+b.twist/2;
  const fraction=a.p.teeth*(phi-a.twist/2)/TAU,desired=phi+Math.PI+(fraction-.5)*TAU/b.p.teeth,period=TAU/b.p.teeth;
  const turn=desired-current-Math.round((desired-current)/period)*period;
  const rotation=new Matrix4().makeTranslation(...center.toArray()).multiply(new Matrix4().makeRotationAxis(a.z,turn)).multiply(new Matrix4().makeTranslation(...b.center.clone().negate().toArray()));
  const transform=multiplyCadMatrices(rotation.toArray(),moving.transform);
  candidates.push({movingId,anchorId:a.id,transform,center:center.toArray(),anchorCenter:a.center.toArray(),axis:a.z.toArray(),teethA:a.p.teeth,teethB:b.p.teeth,parentId:joint?.parentId,jointA:joint?.id,score:Math.hypot(length-distance,axial),distance,bearing:snappedBearing*180/Math.PI});
 }
 return candidates.sort((a,b)=>a.score-b.score||a.anchorId.localeCompare(b.anchorId))[0]??null;
}
// Called on a transaction draft. The native caller supplies a real, hidden
// reference body only if neither gear already has a carrier. No intermediate
// Apply: position, datum, joints and coupling form one undoable operation.
export async function applyCadGearSnap(project,snap,{createCarrier}={}){
 if(!snap)return null;const moving=project.nodes.find(n=>n.id===snap.movingId),anchor=project.nodes.find(n=>n.id===snap.anchorId);if(!moving||!anchor)throw Error('Zahnradbezug fehlt.');
 moving.transform=[...snap.transform];let parentId=snap.parentId,createdCarrier=false;
 if(!parentId){if(typeof createCarrier!=='function')throw Error('Zahnrad-Bezugsträger fehlt.');const carrier=await createCarrier(snap.anchorCenter);carrier.hidden=true;project.nodes.push(carrier);parentId=carrier.id;createdCarrier=true;}
 let jointA=snap.jointA;
 if(!jointA){jointA=crypto.randomUUID();applyCadJointRequest(project,{action:'create',joint:{id:jointA,name:'Drehung · '+anchor.name,kind:'revolute',parentId,childId:anchor.id,origin:snap.anchorCenter,axis:snap.axis,limits:{min:-36000,max:36000}}});}
 const jointB=crypto.randomUUID();applyCadJointRequest(project,{action:'create',joint:{id:jointB,name:'Drehung · '+moving.name,kind:'revolute',parentId,childId:moving.id,origin:snap.center,axis:snap.axis,limits:{min:-36000,max:36000}}});
 applyCadJointRequest(project,{action:'gear-create',gear:{name:anchor.name+' ↔ '+moving.name,jointA,jointB,teethA:snap.teethA,teethB:snap.teethB,kind:'external'}});
 return {anchorId:anchor.id,movingId:moving.id,teethA:snap.teethA,teethB:snap.teethB,distance:snap.distance,createdCarrier};
}
