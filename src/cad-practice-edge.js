import {PRACTICE_FACE_SIDES} from './cad-practice-face.js';
import {pickCadEdge} from './cad-edge-picking.js';

export function practiceEdgeTarget({edges,sides,projectPoint,rect}){
 const directions=sides?.map(side=>PRACTICE_FACE_SIDES[side]);
 if(directions?.length!==2||directions.some(d=>!d)||directions[0].some((v,k)=>v&&directions[1][k]))throw Error('Zwei benachbarte Weltseiten für die Kante angeben.');
 if(!Array.isArray(edges)||!edges.length||edges.length>10000||edges.some(e=>!Array.isArray(e.points)||e.points.length<2||e.points.some(p=>p.length!==3||!p.every(Number.isFinite))))throw Error('Native Kanten sind noch nicht verfügbar.');
 const dot=(p,d)=>p.reduce((sum,v,k)=>sum+v*d[k],0);
 const levels=directions.map(d=>edges.reduce((level,e)=>e.points.reduce((value,p)=>Math.max(value,dot(p,d)),level),-Infinity));
 const candidates=edges.filter(e=>directions.every((d,k)=>e.points.every(p=>Math.abs(dot(p,d)-levels[k])<1e-5)));
 if(candidates.length!==1)throw Error('Keine eindeutige native Außenkante an diesen beiden Weltseiten.');
 const chosen=candidates[0];
 for(let i=1;i<chosen.points.length;i++){
  const a=projectPoint(chosen.points[i-1]),b=projectPoint(chosen.points[i]);
  if(a.z< -1||a.z>1||b.z< -1||b.z>1||Math.hypot(a.x-b.x,a.y-b.y)<10)continue;
  for(const t of [.5,.35,.65]){
   const x=Math.round(a.x+(b.x-a.x)*t),y=Math.round(a.y+(b.y-a.y)*t);
   if(x<rect.left||x>=rect.right||y<rect.top||y>=rect.bottom)continue;
   if(pickCadEdge(edges,projectPoint,{clientX:x,clientY:y})===chosen.edgeToken)return {x,y,width:24,height:24,edgeToken:chosen.edgeToken};
  }
 }
 throw Error('Die gewünschte Kante ist nicht eindeutig sichtbar. Ansicht ändern und einpassen.');
}

export function installPracticeEdge({controller,view,getEdgeState,host=window}){
 host.__formnaroPracticeEdge=spec=>{
  const s=getEdgeState?.(),revision=controller.revision();
  if(s?.kind!=='edges'||s.revision!==revision||s.nodeId!==spec.rootId)throw Error('Zuerst Runden oder Fasen für diesen Körper öffnen.');
  const hit=practiceEdgeTarget({edges:s.edges,sides:spec.sides,projectPoint:p=>view.projectPoint(p),rect:view.canvas.getBoundingClientRect()});
  if(s.selected.includes(hit.edgeToken))throw Error('Diese Kante ist bereits ausgewählt.');
  return {...hit,revision};
 };
}
