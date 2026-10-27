import {profilePointFields,isCadCurve} from './cad-curves.js';
import {resolveSketchProfile,profileId,appendProfileLoop} from './sketch-profile.js';
import {sketchExpression} from './sketch-expression.js';
import {sketchLiteral} from './sketch-constraints-data.js';
const distance=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k])),TAU=Math.PI*2,mod=a=>(a%TAU+TAU)%TAU;
const number=v=>String(Number(v.toPrecision(13))),pair=p=>p.map(number);
const fields=profilePointFields;
const geometry=s=>resolveSketchProfile(s,sketchExpression,{geometryOnly:true});
const value=(s,input)=>{const r=geometry(s);return sketchExpression(input,n=>{if(!Object.hasOwn(r.values,n))throw Error('Unbekanntes Maß: '+n);return r.values[n];});};
function element(s,id){const e=geometry(s).elements.find(e=>e.id===id);if(!e)throw Error('Konturelement fehlt.');return e;}
function replacePoint(s,original,point,{shared=true,id,field}={}){
 const r=geometry(s),out=structuredClone(s);
 for(const e of out.elements){const numeric=r.elements.find(n=>n.id===e.id);for(const key of fields(e))if(shared?distance(numeric[key],original)<1e-7:e.id===id&&key===field)e[key]=[...point];}
 return out;
}
// Read only the expressions emitted by this editor. The dimensions themselves
// remain normal coordinate formulas, with no second constraint system.
function brackets(text,at=0){if(text[at]!=='(')return null;let depth=1,end=at+1;for(;end<text.length;end++){if(text[end]==='(')depth++;if(text[end]===')'&&!--depth)break;}return depth?null:{value:text.slice(at+1,end),end:end+1};}
export function lineDimensionTerms(e){
 if(e.type!=='line')return null;const terms=[];
 for(const [axis,func]of [[0,'cosd'],[1,'sind']]){const text=String(e.end[axis]),anchor=brackets(text);if(!anchor||anchor.value!==String(e.start[axis])||text[anchor.end]!=='+')return null;const length=brackets(text,anchor.end+1);if(!length||text.slice(length.end,length.end+func.length+1)!=='*'+func)return null;const angle=brackets(text,length.end+func.length+1);if(!angle||angle.end!==text.length)return null;terms.push({length:length.value,angle:angle.value});}
 return terms[0].length===terms[1].length&&terms[0].angle===terms[1].angle?terms[0]:null;
}
export function sketchElementDimensions(s,id){
 const e=element(s,id),stored=s.elements.find(e=>e.id===id);if(isCadCurve(e))return {};const result=e.type==='line'?{length:number(distance(e.start,e.end)),angle:number(Math.atan2(e.end[1]-e.start[1],e.end[0]-e.start[0])*180/Math.PI),...lineDimensionTerms(stored)}:e.type==='circle'?{diameter:stored.diameter,radius:'('+stored.diameter+')/2'}:{radius:number(e.radius)};
 if(s.version>=3)for(const c of s.constraints)if(c.refs.length===1&&c.refs[0].element===id&&['length','angle','radius'].includes(c.type)){result[c.type]=c.value;if(e.type==='circle'&&c.type==='radius')result.diameter='2*('+c.value+')';}
 return result;
}
export function dimensionSketchElement(s,id,dimension,input){
 const e=element(s,id),stored=s.elements.find(e=>e.id===id),n=value(s,input);if(!Number.isFinite(n)||dimension!=='angle'&&(n<.005||n>10000))throw Error('Maß außerhalb des gültigen Bereichs.');let out=structuredClone(s);
 if(s.version>=3){const type=dimension==='diameter'?'radius':dimension;if(!['length','angle','radius'].includes(type)||e.type==='line'&&!['length','angle'].includes(type)||e.type!=='line'&&type!=='radius')throw Error('Unpassende Maßart.');const old=out.constraints.find(c=>c.type===type&&c.refs.length===1&&c.refs[0].element===id);const c={id:old?.id??profileId('dimension'),type,refs:[{element:id}],value:dimension==='diameter'?'('+input+')/2':String(input)};if(old)out.constraints[out.constraints.indexOf(old)]=c;else out.constraints.push(c);return out;}
 if(e.type==='line'){
  if(!['length','angle'].includes(dimension))throw Error('Linie: Länge oder Winkel wählen.');const terms=sketchElementDimensions(s,id);terms[dimension]=String(input);let newEnd=stored.start.map((v,k)=>'('+v+')+('+terms.length+')*'+(k===0?'cosd':'sind')+'('+terms.angle+')');if([...stored.start,terms.length,terms.angle].every(v=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(String(v).trim())))newEnd=newEnd.map(v=>number(sketchExpression(v)));out=replacePoint(s,e.end,newEnd);
 }else if(e.type==='circle'){
  if(!['diameter','radius'].includes(dimension))throw Error('Kreis: Radius oder Durchmesser wählen.');out.elements.find(e=>e.id===id).diameter=dimension==='radius'?'2*('+input+')':String(input);
 }else{
  if(dimension!=='radius')throw Error('Bogen: Radius wählen.');for(const key of ['start','through','end']){const unit=e[key].map((v,k)=>(v-e.center[k])/e.radius),p=e.center.map((v,k)=>'('+number(v)+')+('+input+')*('+number(unit[k])+')');out=replacePoint(out,e[key],p);}
 }
 geometry(out);return out;
}
export function editSketchCoordinate(s,id,field,axis,input){const e=element(s,id);if(!fields(e).includes(field)||![0,1].includes(axis))throw Error('Ungültige Punktkoordinate.');value(s,input);const stored=s.elements.find(e=>e.id===id),p=[...stored[field]];p[axis]=String(input);return replacePoint(s,e[field],p);}
export function mirrorSketch(s,{loopId=null,axis='x',offset=0}={}){
 if(!['x','y'].includes(axis)||!Number.isFinite(offset))throw Error('Spiegelachse und Abstand wählen.');const out=structuredClone(s),loop=loopId?s.loops.find(l=>l.id===loopId):null;if(loopId&&!loop)throw Error('Kontur fehlt.');
 const ids=new Set(loop?.elements??s.elements.map(e=>e.id)),map=new Map(),coordinate=axis==='x'?1:0,reflect=x=>s.version>=3&&sketchLiteral(x)?number(2*offset-Number(x)):'2*('+number(offset)+')-('+x+')',copies=s.elements.filter(e=>ids.has(e.id)).map(e=>{const c=structuredClone(e);map.set(e.id,c.id=profileId(e.type));for(const key of fields(c))c[key][coordinate]=reflect(c[key][coordinate]);return c;});
 if(s.version>=3){if(s.constraints.some(c=>c.refs.some(r=>ids.has(r.element))&&!c.refs.every(r=>ids.has(r.element))))throw Error('Die Spiegelkopie benötigt die ganze verbundene Bedingungsgruppe.');const copied=s.constraints.filter(c=>c.refs.every(r=>ids.has(r.element))).map(c=>{const next=structuredClone(c);next.id=profileId('condition');next.refs=next.refs.map(r=>({...r,element:map.get(r.element)}));if(c.type==='angle')next.value=axis==='x'?'-('+c.value+')':'180-('+c.value+')';if(c.type==='fixed'){if(c.refs[0].point)next.value[coordinate]=2*offset-next.value[coordinate];else for(const key of fields(s.elements.find(e=>e.id===c.refs[0].element)))next.value[key][coordinate]=2*offset-next.value[key][coordinate];}return next;});out.constraints=loop?[...out.constraints,...copied]:copied;}
 if(loop){if(loop.role!=='hole')throw Error('Außenkontur als ganze Skizze spiegeln und als neues Teil übernehmen.');out.elements.push(...copies);out.loops.push({id:profileId('loop'),role:'hole',elements:loop.elements.map(id=>map.get(id))});}
 else{out.elements=copies;out.loops=s.loops.map(l=>({id:profileId('loop'),role:l.role,elements:l.elements.map(id=>map.get(id))}));}
 geometry(out);return out;
}
export function profileFromNativeSegments(segments){return segments.map(s=>{const base={id:profileId(s.kind),construction:false};if(s.kind==='line')return {...base,type:'line',start:pair(s.start),end:pair(s.end)};if(s.kind!=='ellipse'||Math.abs(s.rx-s.ry)>1e-7)throw Error('Versatz erzeugte eine nicht unterstützte Kurve.');const radius=s.rx,sweep=s.endAngle-s.startAngle;if(Math.abs(sweep-TAU)<1e-7)return {...base,type:'circle',center:pair(s.center),diameter:number(2*radius)};const angles=s.reversed?[s.endAngle,(s.startAngle+s.endAngle)/2,s.startAngle]:[s.startAngle,(s.startAngle+s.endAngle)/2,s.endAngle],points=angles.map(a=>s.center.map((v,k)=>v+radius*(k===0?Math.cos:Math.sin)(a+(s.rotation??0))));return {...base,type:'arc',start:pair(points[0]),through:pair(points[1]),end:pair(points[2])};});}
export function installOffsetContour(s,segments,{sourceLoopId,role='hole',sourceConstruction=false}={}){let out=structuredClone(s);const loop=out.loops.find(l=>l.id===sourceLoopId);if(!loop)throw Error('Ausgangskontur fehlt.');if(sourceConstruction){for(const id of loop.elements)out.elements.find(e=>e.id===id).construction=true;out.loops=out.loops.filter(l=>l.id!==loop.id);}out=appendProfileLoop(out,profileFromNativeSegments(segments),role);resolveSketchProfile(out,sketchExpression);return out;}
// Bounded line/circular support intersections. Trimming changes only the chosen
// endpoint; open results remain visible drafts and cannot be extruded.
function intersections(a,b){
 if(a.type!=='line'&&b.type==='line')return intersections(b,a);
 if(a.type==='line'&&b.type==='line'){const u=a.end.map((v,k)=>v-a.start[k]),v=b.end.map((v,k)=>v-b.start[k]),d=u[0]*v[1]-u[1]*v[0];if(Math.abs(d)<1e-12)return [];const w=b.start.map((v,k)=>v-a.start[k]),t=(w[0]*v[1]-w[1]*v[0])/d;return [a.start.map((v,k)=>v+u[k]*t)];}
 if(a.type==='line'){const u=a.end.map((v,k)=>v-a.start[k]),w=a.start.map((v,k)=>v-b.center[k]),A=u[0]**2+u[1]**2,B=2*(u[0]*w[0]+u[1]*w[1]),C=w[0]**2+w[1]**2-b.radius**2,D=B*B-4*A*C;if(D< -1e-8)return [];return [...new Set([(-B-Math.sqrt(Math.max(0,D)))/(2*A),(-B+Math.sqrt(Math.max(0,D)))/(2*A)])].map(t=>a.start.map((v,k)=>v+u[k]*t));}
 const d=distance(a.center,b.center);if(d<1e-10||d>a.radius+b.radius+1e-8||d<Math.abs(a.radius-b.radius)-1e-8)return [];const x=(a.radius**2-b.radius**2+d*d)/(2*d),h=Math.sqrt(Math.max(0,a.radius**2-x*x)),u=b.center.map((v,k)=>(v-a.center[k])/d),c=a.center.map((v,k)=>v+x*u[k]);return [[c[0]-h*u[1],c[1]+h*u[0]],[c[0]+h*u[1],c[1]-h*u[0]]];
}
function parameter(e,p){if(e.type==='line'){const u=e.end.map((v,k)=>v-e.start[k]),axis=Math.abs(u[0])>Math.abs(u[1])?0:1;return (p[axis]-e.start[axis])/u[axis];}return (e.sweep>0?mod(Math.atan2(p[1]-e.center[1],p[0]-e.center[0])-e.startAngle):mod(e.startAngle-Math.atan2(p[1]-e.center[1],p[0]-e.center[0])))/Math.abs(e.sweep);}
function curveAt(e,t){return e.type==='line'?e.start.map((v,k)=>v+t*(e.end[k]-v)):e.center.map((v,k)=>v+e.radius*(k===0?Math.cos:Math.sin)(e.startAngle+t*e.sweep));}
export function trimExtendSketch(s,{id,cutterId,mode='trim',end='end'}={}){
 if(id===cutterId||!['trim','extend'].includes(mode)||!['start','end'].includes(end))throw Error('Element, Schnittgrenze und Ende wählen.');const a=element(s,id),b=element(s,cutterId),out=structuredClone(s),stored=out.elements.find(e=>e.id===id),eps=1e-7;
 const candidates=intersections(a,b).filter(p=>{const t=parameter(b,p);return b.type==='circle'||t>=-eps&&t<=1+eps;}).map(p=>({p,t:parameter(a,p)}));
 if(a.type==='circle'){
  if(mode!=='trim'||candidates.length!==2)throw Error('Vollkreis benötigt zwei Schnittpunkte zum Trimmen.');const ts=candidates.map(c=>c.t).sort((a,b)=>a-b),start=end==='end'?ts[0]:ts[1],finish=end==='end'?ts[1]:ts[0]+1;delete stored.center;delete stored.diameter;Object.assign(stored,{type:'arc',start:pair(curveAt(a,start)),through:pair(curveAt(a,(start+finish)/2)),end:pair(curveAt(a,finish))});
 }else{
  let options=candidates.map(c=>({...c,t:mode==='extend'&&a.type==='arc'&&end==='start'?c.t-TAU/Math.abs(a.sweep):c.t})).filter(c=>mode==='trim'?c.t>eps&&c.t<1-eps:end==='end'?c.t>1+eps:c.t< -eps);options.sort((x,y)=>Math.abs(x.t-(end==='end'?1:0))-Math.abs(y.t-(end==='end'?1:0)));const hit=options[0];if(!hit)throw Error('Keine passende Schnittstelle in dieser Richtung.');stored[end]=pair(hit.p);if(a.type==='arc'){const start=end==='start'?hit.t:0,finish=end==='end'?hit.t:1;if((finish-start)*Math.abs(a.sweep)>=TAU-eps)throw Error('Verlängerung würde einen Vollkreis überlaufen.');stored.through=pair(curveAt(a,(start+finish)/2));}
 }
 geometry(out);return out;
}
