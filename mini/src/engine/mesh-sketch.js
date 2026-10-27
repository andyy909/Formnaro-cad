// Stored expressions are data. No eval, functions, properties or scripts.
const IDENT=/^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
export function expression(text,resolve=()=>{throw Error('Unbekanntes Maß.');}){
 if(typeof text==='number')text=String(text);
 if(typeof text!=='string'||text.length>200)throw Error('Maßformel: höchstens 200 Zeichen.');
 const tokens=text.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z0-9_]*|[()+\-*/]/g)||[];
 if(tokens.join('')!==text.replace(/\s/g,'')||!tokens.length)throw Error('Nur Zahlen, Maßnamen, + − * / und Klammern verwenden.');
 let at=0,depth=0;
 function atom(){if(++depth>32)throw Error('Maßformel zu tief verschachtelt.');let v,t=tokens[at++];if(t==='+'||t==='-')v=(t==='-'?-1:1)*atom();else if(t==='('){v=sum();if(tokens[at++]!==')')throw Error('Klammer fehlt.');}else if(IDENT.test(t||''))v=resolve(t);else if(t!==undefined&&/^\d|^\./.test(t))v=Number(t);else throw Error('Unvollständige Maßformel.');depth--;return v;}
 function product(){let v=atom();while(tokens[at]==='*'||tokens[at]==='/'){const t=tokens[at++],b=atom();if(t==='/'&&b===0)throw Error('Division durch null.');v=t==='*'?v*b:v/b;}return v;}
 function sum(){let v=product();while(tokens[at]==='+'||tokens[at]==='-'){const t=tokens[at++],b=product();v=t==='+'?v+b:v-b;}return v;}
 const result=sum();if(at!==tokens.length||!Number.isFinite(result)||Math.abs(result)>100000)throw Error('Ungültiges oder zu großes Maßergebnis.');return result;
}
export function defaultSketch(kind='rectangle'){return {version:1,kind,variables:[{name:'breite',value:'40'},{name:'tiefe',value:'30'},{name:'wand',value:'2'},{name:'innen',value:'breite - 2 * wand'},{name:'hoehe',value:'6'}],dimensions:{width:'breite',depth:'tiefe',diameter:'tiefe',height:'hoehe'},points:[['-20','-15'],['20','-15'],['20','15'],['-20','15']]};}
export function resolveSketch(s,segments=64){
 if(!s||Object.keys(s).some(k=>!['version','kind','variables','dimensions','points'].includes(k))||s.version!==1||!['rectangle','circle','polygon'].includes(s.kind)||!Array.isArray(s.variables)||s.variables.length>40||!s.dimensions||typeof s.dimensions!=='object'||Object.keys(s.dimensions).some(k=>!['width','depth','diameter','height'].includes(k)))throw Error('Ungültige Skizze.');
 const defs=new Map(),values=Object.create(null),visiting=new Set();for(const v of s.variables){if(!v||Object.keys(v).some(k=>!['name','value'].includes(k))||!IDENT.test(v.name)||defs.has(v.name)||['__proto__','constructor','prototype'].includes(v.name))throw Error('Maßnamen: eindeutig, Buchstaben/Ziffern/Unterstrich; mit Buchstaben beginnen.');defs.set(v.name,v.value);}
 function read(name){if(Object.hasOwn(values,name))return values[name];if(!defs.has(name))throw Error('Unbekanntes Maß: '+name);if(visiting.has(name))throw Error('Zyklische Maßbeziehung: '+name);visiting.add(name);const value=expression(defs.get(name),read);visiting.delete(name);values[name]=value;return value;}
 for(const name of defs.keys())read(name);
 const dim=k=>{const v=expression(s.dimensions[k],read);if(v<.01||v>10000)throw Error(k+': Maß muss zwischen 0,01 und 10000 mm liegen.');return v;},height=dim('height');let points;
 if(s.kind==='rectangle'){const w=dim('width'),d=dim('depth');points=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];}
 else if(s.kind==='circle'){const r=dim('diameter')/2;if(!Number.isInteger(segments)||segments<12||segments>512)throw Error('Kreis: 12–512 Segmente.');points=Array.from({length:segments},(_,i)=>[r*Math.cos(i*2*Math.PI/segments),r*Math.sin(i*2*Math.PI/segments)]);}
 else{if(!Array.isArray(s.points)||s.points.length<3||s.points.length>128)throw Error('Geschlossene Kontur: 3–128 Punkte.');points=s.points.map(p=>{if(!Array.isArray(p)||p.length!==2)throw Error('Konturpunkt braucht X und Y.');return p.map(v=>expression(v,read));});}
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),on=(a,b,p)=>Math.abs(cross(a,b,p))<1e-8&&p[0]>=Math.min(a[0],b[0])-1e-8&&p[0]<=Math.max(a[0],b[0])+1e-8&&p[1]>=Math.min(a[1],b[1])-1e-8&&p[1]<=Math.max(a[1],b[1])+1e-8;
 for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-5)throw Error('Doppelte oder zu nahe Konturpunkte.');for(let j=i+2;j<points.length;j++){if(i===0&&j===points.length-1)continue;const c=points[j],d=points[(j+1)%points.length];if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))throw Error('Kontur überschneidet oder berührt sich selbst.');}}
 let area=0;points.forEach((p,i)=>{const q=points[(i+1)%points.length];area+=p[0]*q[1]-q[0]*p[1];});if(Math.abs(area)<1e-6)throw Error('Die Kontur hat keine Fläche.');if(area<0)points.reverse();
 const min=[0,1].map(i=>Math.min(...points.map(p=>p[i]))),max=[0,1].map(i=>Math.max(...points.map(p=>p[i]))),size=[max[0]-min[0],max[1]-min[1],height];if(size.some(v=>v<.01||v>10000))throw Error('Skizze außerhalb der zulässigen Abmessungen.');
 return {points,height,size,center:[(max[0]+min[0])/2,(max[1]+min[1])/2,height/2],values,area:Math.abs(area)/2};
}
export function validSketch(s){try{resolveSketch(s);return true;}catch{return false;}}
