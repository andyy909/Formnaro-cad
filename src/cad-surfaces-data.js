export const surfaceLabels={'surface-fill':'Randkurvenfläche','surface-transition':'Flächenübergang','surface-sew':'Flächen vernähen','surface-relief':'Prägung / Vertiefung'};
const fail=message=>{throw Error(message);};
export function defaultSurfaceBoundary(){const p=[[0,0,0],[20,0,0],[20,20,0],[0,20,0]];return p.map((a,i)=>{const b=p[(i+1)%4];return [a,a.map((v,k)=>v+(b[k]-v)/3),a.map((v,k)=>v+2*(b[k]-v)/3),b].map(v=>[...v]);});}
export function validateSurfaceParameters(value){
 if(!value||typeof value!=='object'||Array.isArray(value))fail('Flächenparameter erforderlich.');const p=structuredClone(value);
 if(!Object.hasOwn(surfaceLabels,p.kind))fail('Unbekanntes Flächenwerkzeug.');
 const allowed={ 'surface-fill':['kind','boundary','thickness','direction'],'surface-transition':['kind','faces','ruled'],'surface-sew':['kind','faces'],'surface-relief':['kind','faces','loops','depth','mode','rotation']}[p.kind];
 if(Object.keys(p).some(k=>!allowed.includes(k)))fail('Unbekannte Flächenparameter.');
 const number=(v,min,max)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail('Zahl außerhalb des zulässigen Bereichs.');};
 const vector=(v,n)=>{if(!Array.isArray(v)||v.length!==n)fail(n+' Koordinaten erforderlich.');v.forEach(x=>number(x,-100000,100000));};
 if(p.kind==='surface-fill'){
  if(!Array.isArray(p.boundary)||p.boundary.length!==4)fail('Vier kubische Randkurven erforderlich.');
  p.boundary.forEach(curve=>{if(!Array.isArray(curve)||curve.length!==4)fail('Vier Kontrollpunkte je Randkurve erforderlich.');curve.forEach(v=>vector(v,3));});
  p.boundary.forEach((curve,i)=>{if(Math.hypot(...curve[3].map((v,k)=>v-p.boundary[(i+1)%4][0][k]))>1e-6)fail('Randkurven müssen einen geschlossenen Rand bilden.');});
  number(p.thickness,.001,1000);vector(p.direction,3);if(Math.hypot(...p.direction)<1e-8)fail('Materialrichtung darf nicht null sein.');
 }else{
  const count=p.kind==='surface-transition'?2:p.kind==='surface-relief'?1:null;
  if(!Array.isArray(p.faces)||!p.faces.length||p.faces.length>32||count&&p.faces.length!==count)fail(count?count+' Flächen auswählen.':'Eine bis 32 Flächen auswählen.');
  p.faces.forEach(f=>{if(!f||Object.keys(f).sort().join(',')!=='normal,point,source'||typeof f.source!=='string'||!/^source[0-7]$/.test(f.source))fail('Ungültiger Flächenbezug.');vector(f.point,3);vector(f.normal,3);if(Math.abs(Math.hypot(...f.normal)-1)>.01)fail('Einheitsnormale erforderlich.');});
 }
 if(p.kind==='surface-transition'&&typeof p.ruled!=='boolean')fail('Übergangsart auswählen.');
 if(p.kind==='surface-relief'){
  number(p.depth,.001,1000);number(p.rotation,-360,360);if(!['add','cut'].includes(p.mode))fail('Prägung oder Vertiefung auswählen.');
  if(!Array.isArray(p.loops)||!p.loops.length||p.loops.length>16||p.loops.reduce((n,l)=>n+(Array.isArray(l)?l.length:129),0)>128)fail('Eine Außenkontur, höchstens 15 Öffnungen und 128 Punkte.');
  p.loops.forEach(loop=>{if(!Array.isArray(loop)||loop.length<3)fail('Mindestens drei Punkte je Kontur.');loop.forEach(v=>vector(v,2));});
 }
 return p;
}
export function surfaceScript(parameters,moduleSource){const p=validateSurfaceParameters(parameters);return {version:1,name:surfaceLabels[p.kind],code:'from formnaro_surfaces_v1 import build\nresult,measurements=build(doc,inputs,parameters)',modules:{'formnaro_surfaces_v1.py':moduleSource},parameters:p};}
export function parseSurfaceLoops(text){if(typeof text!=='string'||text.length>16000)fail('Profilkoordinaten sind zu groß.');return text.trim().split(/\n\s*\n/).map(block=>block.split(/\r?\n/).map(row=>{const parts=row.trim().split(/[;\s]+/);if(parts.length!==2||parts.some(s=>!s))fail('Je Zeile zwei Profilkoordinaten X Y eingeben.');return parts.map(s=>{const n=Number(s.replace(',','.'));if(!Number.isFinite(n))fail('Ungültige Profilkoordinate.');return n;});}));}
