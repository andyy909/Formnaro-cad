import {Matrix4,Vector3} from 'three';
import {validateAffineMatrix} from './cad-project.js';
import {cadIdentity,multiplyCadMatrices,inverseCadMatrix,cadPoint} from './cad-affine.js';
import {flags} from './organization.js';
import {validateGearCouplings,createGearCoupling,expandGearMotion,gearAxes} from './cad-gear-couplings.js';

export const CAD_JOINT_LIMITS=Object.freeze({joints:256,bases:500,linear:100000,angular:36000});
const fail=(message,code='JOINT_INVALID',details={})=>{throw Object.assign(Error('Gelenke: '+message.replace(/^Gelenke: /,'')),{code,...details});};
const object=(value,keys)=>{if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.keys(value).some(k=>!keys.includes(k)))fail('Ungültige Felder.');};
const id=value=>{if(typeof value!=='string'||!value.trim()||value.length>200)fail('Ungültige Kennung.');return value;};
const finite=(value,limit)=>{if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>limit)fail('Maß außerhalb des erlaubten Bereichs.');return value;};
const sameMatrix=(a,b)=>a.every((x,i)=>Math.abs(x-b[i])<=(i>=12&&i<=14?1e-7:1e-10)+Number.EPSILON*128*Math.max(1,Math.abs(x),Math.abs(b[i])));
export const createCadJoints=()=>({version:1,bases:[],joints:[]});
export function validateCadJoints(value){
 object(value,['version','bases','joints',...(value.version===2?['gears']:[])]);if(![1,2].includes(value.version)||!Array.isArray(value.bases)||value.bases.length>500||!Array.isArray(value.joints)||value.joints.length>256)fail('Höchstens 500 feste Basen und 256 Gelenke.');
 const bases=value.bases.map(id);if(new Set(bases).size!==bases.length)fail('Doppelte feste Basis.');const ids=new Set(),children=new Map(),referenced=new Set();
 const joints=value.joints.map(j=>{object(j,['id','name','kind','parentId','childId','parentFrame','childFrame','value','limits']);id(j.id);if(ids.has(j.id))fail('Doppelte Gelenkkennung.');ids.add(j.id);id(j.parentId);id(j.childId);if(j.parentId===j.childId||children.has(j.childId))fail('Ein Teil benötigt genau einen eindeutigen Elternbezug.','JOINT_TREE');children.set(j.childId,j.parentId);referenced.add(j.parentId);referenced.add(j.childId);
  if(typeof j.name!=='string'||!j.name.trim()||j.name.length>200||!['fixed','revolute','prismatic'].includes(j.kind))fail('Feste Verbindung, Dreh- oder Schiebegelenk wählen.');validateAffineMatrix(j.parentFrame);validateAffineMatrix(j.childFrame);
  const limit=j.kind==='prismatic'?100000:36000,v=finite(j.value,limit);let limits;
  if(j.kind==='fixed'){if(v!==0||j.limits!==undefined)fail('Feste Verbindungen besitzen keinen Bewegungswert.');}
  else{object(j.limits,['min','max']);const min=finite(j.limits.min,limit),max=finite(j.limits.max,limit);if(min>max||v<min||v>max)fail('Bewegung außerhalb ihrer gespeicherten Grenzen.','JOINT_LIMIT',{jointId:j.id,min,max,value:v});limits={min,max};}
  return {id:j.id,name:j.name,kind:j.kind,parentId:j.parentId,childId:j.childId,parentFrame:[...j.parentFrame],childFrame:[...j.childFrame],value:v,...(limits?{limits}:{})};
 });
 for(const root of referenced){const visited=new Set();let current=root;while(children.has(current)){if(visited.has(current))fail('Geschlossene Gelenkketten werden nicht unterstützt.','JOINT_CYCLE');visited.add(current);current=children.get(current);}if(!bases.includes(current))fail('Jede verbundene Gruppe benötigt eine feste Basis.','JOINT_BASE',{rootId:current});}
 if(bases.some(base=>children.has(base)))fail('Eine feste Basis darf nicht bewegtes Kind sein.','JOINT_BASE');
 return {version:value.version,bases,joints,...(value.version===2?{gears:validateGearCouplings(value.gears,joints)}:{})};
}
function materialNode(project,rootId){const node=project.nodes.find(n=>n.id===rootId);if(!node)fail('Ein verbundenes Teil fehlt. Bezug erneuern oder Verbindung entfernen.','JOINT_REFERENCE_LOST',{rootId});if(!['cad','mesh'].includes(node.kind)||node.kind==='cad'&&!node.solid||node.kind==='mesh'&&node.meshRole==='hole')fail('Gelenke benötigen starre CAD- oder Netzmaterialteile.','JOINT_TARGET',{rootId});return node;}
function editable(project,rootId){const node=materialNode(project,rootId);if(flags(node,project).locked)fail('Ein betroffenes Teil oder sein Container ist gesperrt.','LOCKED_JOINT_TARGET',{rootId});return node;}
export function cadJointMotionMatrix(kind,value){
 if(kind==='fixed')return cadIdentity();if(kind==='revolute')return new Matrix4().makeRotationZ(value*Math.PI/180).toArray();if(kind==='prismatic')return new Matrix4().makeTranslation(0,0,value).toArray();fail('Unbekannte Gelenkart.');
}
function rigidWorldFrame(frame){
 validateAffineMatrix(frame);const axes=[0,1,2].map(k=>frame.slice(k*4,k*4+3));return axes.every(a=>Math.abs(Math.hypot(...a)-1)<1e-7)&&axes.every((a,i)=>axes.slice(i+1).every(b=>Math.abs(a.reduce((n,x,k)=>n+x*b[k],0))<1e-7));
}
export function cadJointWorldFrame(origin,axis){
 for(const p of [origin,axis])if(!Array.isArray(p)||p.length!==3||p.some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>100000))fail('Bezugspunkt und Achse benötigen drei endliche Werte.');
 const z=new Vector3(...axis);if(z.length()<1e-10)fail('Die Gelenkachse besitzt keine Richtung.');z.normalize();const helper=Math.abs(z.z)<.9?new Vector3(0,0,1):new Vector3(1,0,0),x=helper.cross(z).normalize(),y=z.clone().cross(x).normalize();return new Matrix4().makeBasis(x,y,z).setPosition(...origin).toArray();
}
/** Parent/child datum frames are full affine maps in their body coordinates.
 * Their shared world frame is rigid, so mirrored/sheared body matrices survive
 * rigid motion intact instead of being decomposed and reconstructed. */
export function createCadJoint(project,{id:jointId=crypto.randomUUID(),name,kind,parentId,childId,origin,axis=[0,0,1],limits}={}){
 if(kind==='fixed'&&limits!==undefined)fail('Feste Verbindungen besitzen keine Bewegungsgrenzen.');
 const parent=materialNode(project,parentId),child=editable(project,childId),world=cadJointWorldFrame(origin,axis);
 const joint={id:jointId,name:name??({fixed:'Feste Verbindung',revolute:'Drehgelenk',prismatic:'Schiebegelenk'})[kind],kind,parentId,childId,parentFrame:multiplyCadMatrices(inverseCadMatrix(parent.transform),world),childFrame:multiplyCadMatrices(inverseCadMatrix(child.transform),world),value:0,...(kind==='fixed'?{}:{limits:limits??(kind==='revolute'?{min:-180,max:180}:{min:-100,max:100})})};
 const data=validateCadJoints(project.joints??createCadJoints()),incoming=new Map(data.joints.map(j=>[j.childId,j.parentId]));let base=parentId;const seen=new Set();while(incoming.has(base)){if(seen.has(base))fail('Geschlossene Kette.','JOINT_CYCLE');seen.add(base);base=incoming.get(base);}
 data.bases=data.bases.filter(id=>id!==childId);if(!data.bases.includes(base))data.bases.push(base);data.joints.push(joint);return validateCadJoints(data);
}
function ordered(data){const outgoing=new Map(),list=[],queue=[...data.bases];for(const j of data.joints){const group=outgoing.get(j.parentId)??[];group.push(j);outgoing.set(j.parentId,group);}for(let i=0;i<queue.length;i++)for(const j of outgoing.get(queue[i])??[]){list.push(j);queue.push(j.childId);}if(list.length!==data.joints.length)fail('Unvollständiger Gelenkbaum.','JOINT_TREE');return list;}
export function cadJointProblems(project,data=project.joints){
 if(data===undefined)return [];const valid=validateCadJoints(data),problems=[];
 for(const rootId of new Set([...valid.bases,...valid.joints.flatMap(j=>[j.parentId,j.childId])]))try{materialNode(project,rootId);}catch(error){problems.push({code:error.code,message:error.message,rootId});}
 for(const j of valid.joints){const parent=project.nodes.find(n=>n.id===j.parentId),child=project.nodes.find(n=>n.id===j.childId);if(!parent||!child)continue;try{const frame=multiplyCadMatrices(parent.transform,j.parentFrame),expected=multiplyCadMatrices(multiplyCadMatrices(frame,cadJointMotionMatrix(j.kind,j.value)),inverseCadMatrix(j.childFrame));if(!rigidWorldFrame(frame)||!sameMatrix(expected,child.transform))problems.push({code:'JOINT_FRAME_STALE',jointId:j.id,message:'Gelenke: Bezugssystem oder Teilposition wurde verändert. Bezug vor Bewegung ausdrücklich erneuern.'});}catch(error){problems.push({code:'JOINT_FRAME_STALE',jointId:j.id,message:error.message});}}
 for(const g of valid.gears??[])try{if(gearAxes(project,valid,valid.joints.find(j=>j.id===g.jointA),valid.joints.find(j=>j.id===g.jointB))!==g.axisSign)throw Object.assign(Error('Zahnräder: Achsenrichtung geändert. Kopplung neu anlegen.'),{code:'GEAR_AXIS'});}catch(error){problems.push({code:error.code,message:error.message,jointId:g.id});}
 return problems;
}
/** Keeps references to confirmed nodes, not copies of BReps/mesh arrays. Every
 * preview produces only bounded joint values and affected display matrices. */
export function compileCadJointMotion(project,data=project.joints){
 const valid=validateCadJoints(data??createCadJoints()),problems=cadJointProblems(project,valid);if(problems.length)fail(problems[0].message,problems[0].code,{problems});
 const tree=ordered(valid),nodes=new Map(project.nodes.map(n=>[n.id,n])),initial=new Map(valid.joints.map(j=>[j.id,j.value])),locked=new Set(),localBounds=new Map();let staged=new Map(initial);
 for(const rootId of new Set([...valid.bases,...valid.joints.map(j=>j.childId)])){const node=nodes.get(rootId);if(flags(node,project).locked)locked.add(rootId);let bounds=node.stats?.bounds;if(!bounds&&node.mesh?.verts){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],verts=node.mesh.verts;for(let i=0;i<verts.length;i++){const k=i%3;min[k]=Math.min(min[k],verts[i]);max[k]=Math.max(max[k],verts[i]);}bounds={min,max};}if(bounds)localBounds.set(rootId,bounds);}
 function preview(changes){
  if(valid.gears?.length){if(!Array.isArray(changes)||changes.length>256)fail('Höchstens 256 Bewegungswerte.');for(const change of changes){object(change,['jointId','value']);if(!valid.joints.some(j=>j.id===change.jointId&&j.kind!=='fixed'))fail('Ein eindeutiges bewegliches Gelenk wählen.');finite(change.value,valid.joints.find(j=>j.id===change.jointId).kind==='prismatic'?100000:36000);}changes=expandGearMotion(valid.gears,changes,staged);}
  if(!Array.isArray(changes)||changes.length>256)fail('Höchstens 256 Bewegungswerte.');const next=new Map(staged),seen=new Set();for(const change of changes){object(change,['jointId','value']);const j=valid.joints.find(j=>j.id===change.jointId);if(!j||j.kind==='fixed'||seen.has(j.id))fail('Ein eindeutiges bewegliches Gelenk wählen.');seen.add(j.id);const value=finite(change.value,j.kind==='prismatic'?100000:36000);if(value<j.limits.min||value>j.limits.max)fail('Bewegung überschreitet die gespeicherten Grenzen.','JOINT_LIMIT',{jointId:j.id,...j.limits,value});next.set(j.id,value);}
  const transforms=new Map(valid.bases.map(id=>[id,nodes.get(id).transform])),affected=new Set(),placements=[];
  for(const j of tree){const moved=affected.has(j.parentId)||next.get(j.id)!==initial.get(j.id);if(!moved){transforms.set(j.childId,nodes.get(j.childId).transform);continue;}if(locked.has(j.childId))fail('Ein betroffenes Teil oder sein Container ist gesperrt.','LOCKED_JOINT_TARGET',{rootId:j.childId});const world=multiplyCadMatrices(transforms.get(j.parentId),j.parentFrame);if(!rigidWorldFrame(world))fail('Das gespeicherte Bezugssystem ist nicht mehr starr. Bezug erneuern.','JOINT_FRAME_STALE',{jointId:j.id});const transform=multiplyCadMatrices(multiplyCadMatrices(world,cadJointMotionMatrix(j.kind,next.get(j.id))),inverseCadMatrix(j.childFrame));
   // Bound the actual placed part, not just its origin. This is a conservative
   // catalog envelope; it never substitutes for an explicitly requested measure.
   const node=nodes.get(j.childId),bounds=localBounds.get(j.childId);if(bounds)for(let i=0;i<8;i++){const p=cadPoint(transform,[0,1,2].map(k=>i&(1<<k)?bounds.max[k]:bounds.min[k]));if(p.some(x=>Math.abs(x)>100000))fail('Bewegung verlässt den Modellbereich.','JOINT_RANGE',{rootId:j.childId});}
   transforms.set(j.childId,transform);affected.add(j.childId);placements.push({rootId:j.childId,transform,delta:multiplyCadMatrices(transform,inverseCadMatrix(node.transform))});
  }
  // Returning a value to its initial position must explicitly restore that
  // body's matrix in a view which still owns the previous preview placements.
  staged=next;return {placements,affectedIds:[...affected],values:valid.joints.filter(j=>j.kind!=='fixed').map(j=>({jointId:j.id,value:next.get(j.id)}))};
 }
 return {preview,reset:()=>{staged=new Map(initial);return preview([]);},data:()=>({...structuredClone(valid),joints:valid.joints.map(j=>({...structuredClone(j),value:staged.get(j.id)}))})};
}
export function remapCadJoints(data,mapping){
 const checked=validateCadJoints(data),has=id=>mapping.has(id),jointIds=new Map(),joints=checked.joints.filter(j=>has(j.parentId)&&has(j.childId)).map(j=>{const fresh=crypto.randomUUID();jointIds.set(j.id,fresh);return {...j,id:fresh,parentId:mapping.get(j.parentId),childId:mapping.get(j.childId)};}),children=new Set(joints.map(j=>j.childId)),bases=[...new Set([...checked.bases.filter(has).map(id=>mapping.get(id)),...joints.filter(j=>!children.has(j.parentId)).map(j=>j.parentId)])],gears=(checked.gears??[]).filter(g=>jointIds.has(g.jointA)&&jointIds.has(g.jointB)).map(g=>({...g,id:crypto.randomUUID(),jointA:jointIds.get(g.jointA),jointB:jointIds.get(g.jointB)}));return validateCadJoints({version:gears.length?2:1,bases,joints,...(gears.length?{gears}:{})});
}
export function mergeCadJoints(left,right){const gears=[...(left?.gears??[]),...(right.gears??[])];return validateCadJoints({version:gears.length?2:1,bases:[...new Set([...(left?.bases??[]),...right.bases])],joints:[...(left?.joints??[]),...right.joints],...(gears.length?{gears}:{})});}
/** Mutates only an explicit transaction draft, never a preview motion session. */
export function applyCadJointRequest(project,request){
 object(request,['action','joint','jointId','values','origin','axis','limits','name','gear','gearId']);const allowed={create:['action','joint'],'gear-create':['action','gear'],'gear-remove':['action','gearId'],move:['action','values'],remove:['action','jointId'],rebind:['action','jointId','origin','axis'],limits:['action','jointId','limits','name'],clear:['action']};if(!Object.hasOwn(allowed,request.action)||Object.keys(request).some(k=>!allowed[request.action].includes(k)))fail('Unbekannter Gelenkauftrag.');
 let data=validateCadJoints(project.joints??createCadJoints()),placements=[],affectedIds=[];const previousProblems=cadJointProblems(project,data),problemKey=p=>[p.code,p.jointId??'',p.rootId??''].join('/');
 if(request.action==='create'){object(request.joint,['id','name','kind','parentId','childId','origin','axis','limits']);data=createCadJoint(project,request.joint);affectedIds=[request.joint.childId];}
 else if(request.action==='gear-create'){for(const j of [request.gear?.jointA,request.gear?.jointB]){const joint=data.joints.find(x=>x.id===j);if(joint)editable(project,joint.childId);}data.gears=createGearCoupling(project,data,request.gear);data.version=2;affectedIds=data.joints.filter(j=>[request.gear.jointA,request.gear.jointB].includes(j.id)).map(j=>j.childId);}
 else if(request.action==='gear-remove'){const gear=data.gears?.find(g=>g.id===request.gearId);if(!gear)fail('Kopplung fehlt.');for(const id of [gear.jointA,gear.jointB]){const joint=data.joints.find(j=>j.id===id);if(project.nodes.some(n=>n.id===joint.childId))editable(project,joint.childId);}data.gears=data.gears.filter(g=>g.id!==gear.id);}
 else if(request.action==='move'){const motion=compileCadJointMotion(project,data),result=motion.preview(request.values);placements=result.placements;affectedIds=result.affectedIds;data=motion.data();for(const placement of placements)project.nodes.find(n=>n.id===placement.rootId).transform=[...placement.transform];}
 else if(request.action==='clear'){for(const j of data.joints)if(project.nodes.some(n=>n.id===j.childId))editable(project,j.childId);affectedIds=data.joints.map(j=>j.childId);delete project.joints;return {affectedIds,placements:[],metadataOnly:true,constructedIds:[],counts:{}};}
 else{
  const joint=data.joints.find(j=>j.id===request.jointId);if(!joint)fail('Gelenk fehlt.');if(request.action!=='remove'||project.nodes.some(n=>n.id===joint.childId))editable(project,joint.childId);affectedIds=[joint.childId];
  if(request.action==='remove'){data.joints=data.joints.filter(j=>j.id!==joint.id);if(data.gears)data.gears=data.gears.filter(g=>g.jointA!==joint.id&&g.jointB!==joint.id);if((project.nodes.some(n=>n.id===joint.childId)||data.joints.some(j=>j.parentId===joint.childId))&&!data.bases.includes(joint.childId))data.bases.push(joint.childId);}
  if(request.action==='limits'){if(joint.kind==='fixed')fail('Eine feste Verbindung besitzt keine Bewegungsgrenzen.');joint.limits=structuredClone(request.limits);if(request.name!==undefined)joint.name=request.name;}
  if(request.action==='rebind'){const parent=materialNode(project,joint.parentId),child=materialNode(project,joint.childId),world=cadJointWorldFrame(request.origin,request.axis);joint.parentFrame=multiplyCadMatrices(inverseCadMatrix(parent.transform),world);joint.childFrame=multiplyCadMatrices(multiplyCadMatrices(inverseCadMatrix(child.transform),world),cadJointMotionMatrix(joint.kind,joint.value));}
 }
 data.bases=data.bases.filter(base=>project.nodes.some(n=>n.id===base)||data.joints.some(j=>j.parentId===base));
 project.joints=validateCadJoints(data);const problems=cadJointProblems(project),blocking=request.action==='move'?problems:problems.filter(p=>!previousProblems.some(old=>problemKey(old)===problemKey(p))||request.action==='rebind'&&p.jointId===request.jointId);if(blocking.length)fail(blocking[0].message,blocking[0].code,{problems:blocking});return {affectedIds,placements,metadataOnly:placements.length===0,constructedIds:[],counts:{}};
}
