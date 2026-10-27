import {cadGeometryDigest} from './cad-geometry-digest.js';

export const CAD_AI_REFERENCE_KINDS=Object.freeze(['face','edge','bore','sketch','feature']);
const fail=(message,code='AI_REFERENCE_INVALID')=>{throw Object.assign(Error('Merkmalsbezug: '+message),{code});};
const fields=(v,allowed)=>{if(!v||Object.getPrototypeOf(v)!==Object.prototype||Object.keys(v).some(k=>!allowed.includes(k)))fail('Unbekannte oder ungültige Felder.');};
const text=(v,max=200)=>{if(typeof v!=='string'||!v.trim()||v.length>max||/[\x00-\x1f]/.test(v))fail('Name oder Kennung fehlt.');return v;};
const signature=v=>{if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))fail('Geometrieprüfsumme fehlt.');return v;};
const point=v=>{if(!Array.isArray(v)||v.length!==3||v.some(n=>!Number.isFinite(n)||Math.abs(n)>200000))fail('Endliche räumliche Koordinaten erforderlich.');return v.map(n=>n===0?0:n);};
const direction=v=>{const p=point(v),length=Math.hypot(...p);if(Math.abs(length-1)>1e-6)fail('Normierte räumliche Richtung erforderlich.');return p;};
export const cadAIReferenceFrameDigest=world=>cadGeometryDigest(JSON.stringify(world.map(n=>n===0?0:n)));
export function validateCadAIReferenceTarget(v){fields(v,['rootId','path']);if(!Array.isArray(v.path)||v.path.length>12)fail('Ungültiger Quellenpfad.');const target={rootId:text(v.rootId),path:v.path.map(id=>text(id))};if(new Set([target.rootId,...target.path]).size!==target.path.length+1)fail('Zyklischer Quellenpfad.');return target;}
export function validateCadAIReference(value){
 fields(value,['version','id','name','kind','target','rootDigest','sourceDigest','frameDigest','selector','origin']);
 if(value.version!==1||!CAD_AI_REFERENCE_KINDS.includes(value.kind))fail('Unbekannte Bezugsversion oder Art.');
 const r={version:1,id:text(value.id,100),name:text(value.name,160),kind:value.kind,target:validateCadAIReferenceTarget(value.target),rootDigest:signature(value.rootDigest),sourceDigest:signature(value.sourceDigest),frameDigest:signature(value.frameDigest)};
 if(['face','edge','bore'].includes(r.kind)){
  if(r.target.path.length)fail('Flächen und Kanten beziehen sich auf das fertige Teil.');
  const s=value.selector;
  fields(s,['kind','signature','point','normal','samples','curveKind','surface']);
  if(s.kind!==(r.kind==='edge'?'edge':'face'))fail('Geometrische Bezugsauswahl widerspricht ihrer Art.');
  r.selector={kind:s.kind,signature:signature(s.signature),point:point(s.point)};
  if(r.kind==='edge'){
   if(s.normal!==undefined||s.surface!==undefined||!['line','circle','ellipse','unsupported'].includes(s.curveKind)||!Array.isArray(s.samples)||s.samples.length!==5)fail('Vollständiger nativer Kantenanker erforderlich.');
   r.selector.curveKind=s.curveKind;r.selector.samples=s.samples.map(point);
  }else{
   if(s.samples!==undefined||s.curveKind!==undefined)fail('Flächenanker enthält Kantendaten.');
   r.selector.normal=direction(s.normal);fields(s.surface,['kind','diameter','axis','center']);
   if(!['plane','cylinder','other'].includes(s.surface.kind)||r.kind==='bore'&&s.surface.kind!=='cylinder')fail('Native Flächenart fehlt.');
   r.selector.surface={kind:s.surface.kind};
   if(s.surface.kind==='cylinder'){
    if(!Number.isFinite(s.surface.diameter)||s.surface.diameter<=0||s.surface.diameter>200000)fail('Nativer Zylinderdurchmesser fehlt.');
    Object.assign(r.selector.surface,{diameter:s.surface.diameter,axis:direction(s.surface.axis),center:point(s.surface.center)});
   }else if(Object.keys(s.surface).length!==1)fail('Diese Flächenart besitzt keine Zylindermaße.');
  }
 }else if(value.selector!==undefined||value.origin!==undefined)fail('Quellenmerkmale benötigen keinen gespeicherten Flächenindex.');
 if(value.origin!==undefined){fields(value.origin,['target','sourceDigest']);const target=validateCadAIReferenceTarget(value.origin.target);if(target.rootId!==r.target.rootId)fail('Merkmalsquelle gehört zu einem anderen Teil.');r.origin={target,sourceDigest:signature(value.origin.sourceDigest)};}
 if(JSON.stringify(r).length>5000)fail('Bezug zu groß.');return r;
}
export function validateCadAIReferences(value){fields(value,['version','items']);if(value.version!==1||!Array.isArray(value.items)||value.items.length>32)fail('Höchstens 32 Merkmalsbezüge.');const items=value.items.map(validateCadAIReference);if(new Set(items.map(r=>r.id)).size!==items.length)fail('Doppelte Bezugskennung.');return {version:1,items};}
export function upsertCadAIReference(value,reference){const next=validateCadAIReferences(value??{version:1,items:[]}),r=validateCadAIReference(reference),index=next.items.findIndex(item=>item.id===r.id);if(index<0)next.items.push(r);else next.items[index]=r;return validateCadAIReferences(next);}
export function removeCadAIReference(value,id){const next=validateCadAIReferences(value);next.items=next.items.filter(r=>r.id!==id);return next.items.length?next:null;}
export function cadAIReferenceBindingKey(value){const reference=validateCadAIReference(value);reference.name='';return JSON.stringify(reference);}
