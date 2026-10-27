import {sketchExpression} from './sketch-expression.js';
import {resolveSketchProfile} from './sketch-profile.js';
// Expressions are persisted data, never JavaScript or tessellated geometry.
const NAME=/^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
const forbidden=new Set(['__proto__','constructor','prototype']);
function fields(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.keys(value).some(k=>forbidden.has(k)||!allowed.includes(k)))throw Error('Ungültige native Skizzendaten.');}
function formula(value){if(typeof value==='number')value=String(value);if(typeof value==='string'&&/\b(?:sind|cosd)\s*\(/.test(value))throw Error('Winkelformeln benötigen erweiterte Konturen (Version 2).');if(typeof value!=='string'||!value.trim()||value.length>200)throw Error('Maßformel: 1–200 Zeichen erforderlich.');return value;}
export const cadSketchExpression=sketchExpression;
export function defaultCadSketch(kind='rectangle'){return {version:1,kind,variables:[{name:'breite',value:'40'},{name:'tiefe',value:'30'},{name:'wand',value:'2'},{name:'innen',value:'breite - 2 * wand'},{name:'hoehe',value:'6'}],dimensions:{width:'breite',depth:'tiefe',diameter:'tiefe',height:'hoehe'},points:[['-20','-15'],['20','-15'],['20','15'],['-20','15']]};}
export function resolveCadSketch(input){
  if([2,3,4].includes(input?.version))return resolveSketchProfile(input,cadSketchExpression);
  fields(input,['version','kind','variables','dimensions','points']);if(input.version!==1||!['rectangle','circle','polygon'].includes(input.kind)||!Array.isArray(input.variables)||input.variables.length>40)throw Error('Eine Skizze mit höchstens 40 benannten Maßen erforderlich.');
  fields(input.dimensions,['width','depth','diameter','height']);
  const sketch={version:1,kind:input.kind,variables:[],dimensions:{},points:[]},defs=new Map(),values=Object.create(null),visiting=new Set();
  for(const v of input.variables){fields(v,['name','value']);if(typeof v.name!=='string'||!NAME.test(v.name)||forbidden.has(v.name)||defs.has(v.name))throw Error('Maßnamen müssen eindeutig sein und Buchstaben, Ziffern oder Unterstrich enthalten.');const value=formula(v.value);defs.set(v.name,value);sketch.variables.push({name:v.name,value});}
  function read(name){if(Object.hasOwn(values,name))return values[name];if(!defs.has(name))throw Error('Unbekanntes Maß: '+name);if(visiting.has(name))throw Error('Zyklische Maßbeziehung: '+name);visiting.add(name);const result=cadSketchExpression(defs.get(name),read);visiting.delete(name);values[name]=result;return result;}
  for(const name of defs.keys())read(name);
  for(const [key,value] of Object.entries(input.dimensions)){sketch.dimensions[key]=formula(value);cadSketchExpression(value,read);}
  if(input.points!==undefined){if(!Array.isArray(input.points)||input.points.length>128)throw Error('Geschlossene Kontur: höchstens 128 Punkte.');sketch.points=input.points.map(p=>{if(!Array.isArray(p)||p.length!==2)throw Error('Konturpunkt braucht X und Y.');return p.map(v=>{const text=formula(v);cadSketchExpression(text,read);return text;});});}
  const dim=k=>{const v=cadSketchExpression(sketch.dimensions[k],read);if(v<.01||v>10000)throw Error(k+': Maß muss zwischen 0,01 und 10000 mm liegen.');return v;},height=dim('height');let points,diameter,area;
  if(sketch.kind==='circle'){diameter=dim('diameter');area=Math.PI*(diameter/2)**2;return {sketch,kind:sketch.kind,diameter,height,size:[diameter,diameter,height],values,area,bottom:[0,0,0]};}
  if(sketch.kind==='rectangle'){const w=dim('width'),d=dim('depth');points=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];}
  else{if(sketch.points.length<3)throw Error('Geschlossene Kontur: 3–128 Punkte.');points=sketch.points.map(p=>p.map(v=>cadSketchExpression(v,read)));}
  // Numerical screening precedes authoritative native wire/face/solid checks.
  // Reject crossings, touches and zero-length edges, including adjacent reversals.
  const extent=Math.max(1,...points.flat().map(Math.abs)),eps=Math.max(1e-7,extent*Number.EPSILON*64),cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),on=(a,b,p)=>Math.abs(cross(a,b,p))<=eps*Math.hypot(b[0]-a[0],b[1]-a[1])&&p[0]>=Math.min(a[0],b[0])-eps&&p[0]<=Math.max(a[0],b[0])+eps&&p[1]>=Math.min(a[1],b[1])-eps&&p[1]<=Math.max(a[1],b[1])+eps;
  for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],c=points[(i+2)%points.length];if(Math.hypot(a[0]-b[0],a[1]-b[1])<=eps||on(a,b,c)||on(b,c,a))throw Error('Doppelte, zu nahe oder zurücklaufende Konturpunkte.');for(let j=i+2;j<points.length;j++){if(i===0&&j===points.length-1)continue;const c=points[j],d=points[(j+1)%points.length];if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))throw Error('Kontur überschneidet oder berührt sich selbst.');}}
  // Translate before summing to avoid cancellation far from the local origin.
  const origin=points[0];area=points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+(p[0]-origin[0])*(q[1]-origin[1])-(q[0]-origin[0])*(p[1]-origin[1]);},0)/2;
  if(Math.abs(area)<=eps*eps)throw Error('Die Kontur hat keine Fläche.');if(area<0)points.reverse();
  const min=[0,1].map(k=>Math.min(...points.map(p=>p[k]))),max=[0,1].map(k=>Math.max(...points.map(p=>p[k]))),size=[max[0]-min[0],max[1]-min[1],height];if(size.some(v=>v<.01||v>10000))throw Error('Skizze außerhalb der zulässigen Abmessungen.');
  return {sketch,kind:sketch.kind,points,height,size,values,area:Math.abs(area),bottom:[0,0,0]};
}
export function cadSketchRecipe(sketch){const resolved=resolveCadSketch(sketch);return {type:'sketch',size:resolved.size,sketch:resolved.sketch};}
