import {multiplyCadMatrices} from './cad-affine.js';

const fail=(message,code='GEAR_INVALID')=>{throw Object.assign(Error('Zahnräder: '+message),{code});};
const near=(a,b)=>Math.abs(a-b)<=1e-8+Number.EPSILON*128*Math.max(1,Math.abs(a),Math.abs(b));
const ratio=g=>(g.kind==='internal'?1:-1)*g.axisSign*g.teethA/g.teethB;

export function validateGearCouplings(value,joints){
 if(!Array.isArray(value)||value.length>256)fail('Höchstens 256 Kopplungen.');
 const ids=new Set(),pairs=new Set(),byId=new Map(joints.map(j=>[j.id,j]));
 const gears=value.map(g=>{
  if(!g||Object.getPrototypeOf(g)!==Object.prototype||Object.keys(g).some(k=>!['id','name','jointA','jointB','teethA','teethB','kind','axisSign','phase'].includes(k)))fail('Ungültige Kopplungsfelder.');
  if(typeof g.id!=='string'||!g.id.trim()||g.id.length>200||ids.has(g.id)||typeof g.name!=='string'||!g.name.trim()||g.name.length>200)fail('Eindeutige Kennung und Name erforderlich.');
  ids.add(g.id);const a=byId.get(g.jointA),b=byId.get(g.jointB),pair=[g.jointA,g.jointB].sort().join('\0');
  if(!a||!b||a===b||a.kind!=='revolute'||b.kind!=='revolute'||pairs.has(pair))fail('Zwei unterschiedliche Drehgelenke einmalig koppeln.');
  pairs.add(pair);
  if(![g.teethA,g.teethB].every(n=>Number.isSafeInteger(n)&&n>=1&&n<=10000)||!['external','internal'].includes(g.kind)||![1,-1].includes(g.axisSign)||!Number.isFinite(g.phase)||Math.abs(g.phase)>1e10)fail('Zähnezahlen 1–10.000 und eine gültige Verzahnung wählen.');
  if(!near(b.value,ratio(g)*a.value+g.phase))fail('Gespeicherte Winkel passen nicht zur Kopplung.','GEAR_PHASE');
  return {...g};
 });
 // Affine relations are checked once for the complete graph. A loop that
 // would lock the mechanism is rejected before a preview can partially move.
 const graph=gearGraph(gears),known=new Map();
 for(const root of graph.keys()){
  if(known.has(root))continue;known.set(root,{scale:1,offset:0});const queue=[root];
  for(let i=0;i<queue.length;i++)for(const e of graph.get(queue[i])){
   const from=known.get(queue[i]),next={scale:from.scale*e.factor,offset:from.offset*e.factor+e.offset};
   if(!Number.isFinite(next.scale)||!Number.isFinite(next.offset)||Math.abs(next.scale)>1e12||Math.abs(next.scale)<1e-12)fail('Übersetzungskette ist numerisch zu groß.');
   const old=known.get(e.to);if(old){if(!near(old.scale,next.scale)||!near(old.offset,next.offset))fail('Die Kopplungsschleife würde das Getriebe blockieren.','GEAR_CONFLICT');}
   else{known.set(e.to,next);queue.push(e.to);}
  }
 }
 return gears;
}

function gearGraph(gears){
 const graph=new Map();
 for(const g of gears){const r=ratio(g);for(const [from,to,factor,offset]of [[g.jointA,g.jointB,r,g.phase],[g.jointB,g.jointA,1/r,-g.phase/r]]){const list=graph.get(from)??[];list.push({to,factor,offset});graph.set(from,list);}}
 return graph;
}

export function gearAxes(project,data,a,b){
 if(a.parentId!==b.parentId||!data.bases.includes(a.parentId))fail('Die beiden Drehgelenke benötigen dieselbe feste Basis. Bewegte Achsen werden noch nicht unterstützt.','GEAR_SUPPORT');
 const parent=project.nodes.find(n=>n.id===a.parentId);if(!parent)fail('Die feste Basis fehlt.','JOINT_REFERENCE_LOST');
 const frames=[a,b].map(j=>multiplyCadMatrices(parent.transform,j.parentFrame));
 const dot=frames[0].slice(8,11).reduce((s,v,k)=>s+v*frames[1][8+k],0);
 if(Math.abs(Math.abs(dot)-1)>1e-7)fail('Die Drehachsen müssen parallel sein.','GEAR_AXIS');
 return dot<0?-1:1;
}

export function createGearCoupling(project,data,input){
 if(!input||Object.keys(input).some(k=>!['id','name','jointA','jointB','teethA','teethB','kind'].includes(k)))fail('Ungültiger Kopplungsauftrag.');
 const a=data.joints.find(j=>j.id===input.jointA),b=data.joints.find(j=>j.id===input.jointB);
 if(!a||!b)fail('Zwei bestehende Drehgelenke wählen.');
 const g={id:input.id??crypto.randomUUID(),name:input.name??'Zahnradkopplung',jointA:input.jointA,jointB:input.jointB,teethA:input.teethA,teethB:input.teethB,kind:input.kind??'external',axisSign:gearAxes(project,data,a,b),phase:0};
 g.phase=b.value-ratio(g)*a.value;
 return validateGearCouplings([...(data.gears??[]),g],data.joints);
}

export function expandGearMotion(gears,changes,current){
 const graph=gearGraph(gears),values=new Map(),queue=[];
 for(const c of changes){if(values.has(c.jointId))fail('Jeden Antrieb nur einmal angeben.');values.set(c.jointId,c.value);queue.push(c.jointId);}
 for(let i=0;i<queue.length;i++)for(const e of graph.get(queue[i])??[]){
  const value=values.get(queue[i])*e.factor+e.offset,old=values.get(e.to);
  if(values.has(e.to)){if(!near(old,value))fail('Die angegebenen Antriebswinkel widersprechen sich.','GEAR_CONFLICT');}
  else{values.set(e.to,value);queue.push(e.to);}
 }
 return [...values].filter(([id,value])=>!current.has(id)||current.get(id)!==value).map(([jointId,value])=>({jointId,value}));
}
