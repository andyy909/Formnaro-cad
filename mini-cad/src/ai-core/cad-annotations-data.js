import {cadPoint,inverseCadMatrix} from './cad-affine.js';
export const CAD_ANNOTATION_LIMITS=Object.freeze({perNode:100,total:1000,note:1000});
const fail=()=>{throw Error('Ungültige CAD-Markierung.');};
export function validateCadAnnotations(value){
 if(!Array.isArray(value)||value.length>CAD_ANNOTATION_LIMITS.perNode)fail();const ids=new Set();
 return value.map(v=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['id','version','point','normal','note','color','radius','status','reason','faceSignature'].includes(k)))fail();
  if(v.version!==1||typeof v.id!=='string'||!v.id.trim()||v.id.length>200||ids.has(v.id))fail();ids.add(v.id);
  if(![v.point,v.normal].every(a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite))||Math.abs(Math.hypot(...v.normal)-1)>1e-8)fail();
  if(typeof v.note!=='string'||v.note.length>1000||!v.note.trim()||typeof v.color!=='string'||!/^#[\da-f]{6}$/i.test(v.color)||!Number.isFinite(v.radius)||v.radius<.1||v.radius>100||!['valid','stale'].includes(v.status)||!/^([\da-f]{64})$/.test(v.faceSignature))fail();
  if(v.reason!==undefined&&!['lost','ambiguous','normal'].includes(v.reason)||v.status==='valid'&&v.reason!==undefined||v.status==='stale'&&v.reason===undefined)fail();
  return {id:v.id,version:1,point:[...v.point],normal:[...v.normal],note:v.note,color:v.color,radius:v.radius,status:v.status,...(v.reason?{reason:v.reason}:{}),faceSignature:v.faceSignature};
 });
}
export function cadAnnotationWorld(annotation,world){
 const inv=inverseCadMatrix(world),v=[0,1,2].map(k=>inv[k*4]*annotation.normal[0]+inv[k*4+1]*annotation.normal[1]+inv[k*4+2]*annotation.normal[2]),largest=Math.max(...v.map(Math.abs)),unit=v.map(x=>x/largest),length=Math.hypot(...unit);
 return {...annotation,localPoint:[...annotation.point],localNormal:[...annotation.normal],point:cadPoint(world,annotation.point),normal:annotation.status==='valid'?unit.map(x=>x/length):null};
}
