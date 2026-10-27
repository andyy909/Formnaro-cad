import {validateCompositePath} from './cad-composite-path.js';
// Small, kernel-free recipe validator. No computation or background observers.
const fail=message=>{const error=Error(message);error.code='INVALID_CAD_MODELING';throw error;};
function fields(value,keys){if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.keys(value).some(key=>!keys.includes(key)))fail('Ungültige CAD-Modellierdaten.');}
function number(value,min,max,label){if(!Number.isFinite(value)||value<min||value>max)fail(label+' außerhalb des zulässigen Bereichs.');return value;}
const face=value=>{if(!Number.isSafeInteger(value)||value<1||value>20000)fail('Eine aktuelle native CAD-Fläche wählen.');return value;};
export function validateCadModelingOperation(value){
  const kind=value?.kind,keys={
    'face-offset':['kind','version','faceIndex','offset'],shell:['kind','version','faceIndices','thickness'],
    loft:['kind','version','orientation','profileOrder'],sweep:['kind','version','path']
  }[kind];
  if(!keys)fail('Unbekanntes CAD-Modellierwerkzeug.');fields(value,keys);if(value.version!==undefined&&value.version!==1)fail('Unbekannte CAD-Modellierversion.');
  if(kind==='face-offset'){const offset=number(value.offset,-1000,1000,'Flächenversatz');if(Math.abs(offset)<.01)fail('Flächenversatz benötigt mindestens 0,01 mm.');return {kind,faceIndex:face(value.faceIndex),offset};}
  if(kind==='shell'){if(!Array.isArray(value.faceIndices)||!value.faceIndices.length||value.faceIndices.length>8||new Set(value.faceIndices).size!==value.faceIndices.length)fail('Eine bis acht verschiedene Öffnungsflächen wählen.');return {kind,faceIndices:value.faceIndices.map(face),thickness:number(value.thickness,.01,1000,'Wandstärke')};}
  if(kind==='loft'){const out={kind};if(value.orientation!==undefined){if(!['automatic','preserve'].includes(value.orientation))fail('Ungültige Loft-Profilorientierung.');out.orientation=value.orientation;}if(value.profileOrder!==undefined){const order=value.profileOrder;if(!Array.isArray(order)||order.length<2||order.length>8||new Set(order).size!==order.length||order.some(i=>!Number.isInteger(i)||i<0||i>=order.length))fail('Loftreihenfolge muss jedes Profil genau einmal enthalten.');out.profileOrder=[...order];}return out;}
  const path=value.path;if(path?.kind==='segments')return {kind,path:validateCompositePath(path)};if(path?.kind==='line'){fields(path,['kind','length']);return {kind,path:{kind:'line',length:number(path.length,.01,10000,'Pfadlänge')}};}
  if(path?.kind==='arc'){fields(path,['kind','radius','angle']);return {kind,path:{kind:'arc',radius:number(path.radius,.01,10000,'Biegeradius'),angle:number(path.angle,1,180,'Biegewinkel')}};}
  fail('Sweep benötigt einen geraden Pfad oder einen Kreisbogen.');
}
