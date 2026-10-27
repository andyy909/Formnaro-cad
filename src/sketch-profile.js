import {isCadCurve,curveControlKeys,profilePointFields,curveBeziers,curveSamples,bezierArea,bezierBounds,curveRayCrossings,reverseCurve,curveContact,assertSimpleCurve,bezierPoint} from './cad-curves.js';
import {validateSketchConstraints} from './sketch-constraints-data.js';
import {assertSketchConstraints} from './sketch-constraints-solver.js';
// Shared version-2/3 planar sketch geometry. No kernel or UI dependency.
const TAU=Math.PI*2,NAME=/^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
const fail=message=>{throw Error('Skizze: '+message);};
const record=(v,keys)=>{if(!v||![Object.prototype,null].includes(Object.getPrototypeOf(v))||Object.keys(v).some(k=>!keys.includes(k)))fail('Unbekannte oder ungültige Felder.');};
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]),cross=(a,b)=>a[0]*b[1]-a[1]*b[0],sub=(a,b)=>a.map((v,k)=>v-b[k]),add=(a,b)=>a.map((v,k)=>v+b[k]);
const mod=a=>(a%TAU+TAU)%TAU;
export const profileId=prefix=>prefix+'-'+crypto.randomUUID();
export function circleThrough(a,b,c){
 const u=sub(b,a),v=sub(c,a),d=2*cross(u,v),scale=Math.max(dist(a,b),dist(b,c),dist(c,a));
 if(!scale||Math.abs(d)<scale*scale*1e-10)fail('Kreisbogen benötigt drei verschiedene, nicht geradlinige Punkte.');
 const uu=u[0]**2+u[1]**2,vv=v[0]**2+v[1]**2,center=add(a,[(v[1]*uu-u[1]*vv)/d,(u[0]*vv-v[0]*uu)/d]),radius=dist(center,a),start=Math.atan2(a[1]-center[1],a[0]-center[0]),end=Math.atan2(c[1]-center[1],c[0]-center[0]),mid=Math.atan2(b[1]-center[1],b[0]-center[0]),ccw=mod(end-start),sweep=mod(mid-start)<ccw?ccw:ccw-TAU;
 return {center,radius,startAngle:start,sweep};
}
const inArc=(p,a,tol=1e-8)=>a.type==='circle'||(a.sweep>=0?mod(Math.atan2(p[1]-a.center[1],p[0]-a.center[0])-a.startAngle):mod(a.startAngle-Math.atan2(p[1]-a.center[1],p[0]-a.center[0])))<=Math.abs(a.sweep)+tol;
const at=(a,t)=>isCadCurve(a)?(()=>{const spans=curveBeziers(a),i=Math.min(spans.length-1,Math.floor(t*spans.length));return bezierPoint(spans[i],t*spans.length-i);})():a.type==='line'?a.start.map((v,k)=>v+(a.end[k]-v)*t):[a.center[0]+a.radius*Math.cos(a.startAngle+a.sweep*t),a.center[1]+a.radius*Math.sin(a.startAngle+a.sweep*t)];
function intersections(a,b,eps){
 if(isCadCurve(a)||isCadCurve(b)){const adjacent=a.loop===b.loop&&a.loop!==undefined&&(Math.abs(a.index-b.index)===1||Math.abs(a.index-b.index)===a.count-1),allowed=adjacent?[a.start,a.end].filter(p=>[b.start,b.end].some(q=>dist(p,q)<eps)):[];return curveContact(a,b,{allowed,tolerance:eps})?null:[];}
 if(a.type!=='line'&&b.type==='line')return intersections(b,a,eps);
 if(a.type==='line'&&b.type==='line'){
  const u=sub(a.end,a.start),v=sub(b.end,b.start),w=sub(b.start,a.start),d=cross(u,v);
  if(Math.abs(d)<eps*Math.max(1,dist(a.start,a.end),dist(b.start,b.end))){if(Math.abs(cross(w,u))>eps*Math.max(1,dist(a.start,a.end)))return [];const axis=Math.abs(u[0])>=Math.abs(u[1])?0:1,lo=Math.max(Math.min(a.start[axis],a.end[axis]),Math.min(b.start[axis],b.end[axis])),hi=Math.min(Math.max(a.start[axis],a.end[axis]),Math.max(b.start[axis],b.end[axis]));if(hi-lo>eps)return null;return hi>=lo-eps?[...new Map([a.start,a.end,b.start,b.end].filter(p=>dist(p,a.start)+dist(p,a.end)<=dist(a.start,a.end)+eps&&dist(p,b.start)+dist(p,b.end)<=dist(b.start,b.end)+eps).map(p=>[p.join(','),p])).values()]:[];}
  const t=cross(w,v)/d,q=cross(w,u)/d;return t>=-eps&&t<=1+eps&&q>=-eps&&q<=1+eps?[at(a,Math.max(0,Math.min(1,t)))]:[];
 }
 if(a.type==='line'){
  // Anchor the quadratic at the endpoint nearest the circle, avoiding large
  // cancellation for a long line ending on an arc. A native circle reconstructed
  // from three floating-point points can put that endpoint a few ulps inside
  // its radius. Remove only this squared-distance roundoff; keep the second
  // root so a genuinely crossing, almost tangent line is still rejected.
  const backwards=dist(a.end,b.center)<dist(a.start,b.center),start=backwards?a.end:a.start,end=backwards?a.start:a.end,u=sub(end,start),w=sub(start,b.center),aa=u[0]**2+u[1]**2,bb=2*(w[0]*u[0]+w[1]*u[1]),ww=w[0]**2+w[1]**2,rr=b.radius**2,raw=ww-rr,cc=Math.abs(raw)<=Number.EPSILON*8*(ww+rr)?0:raw,d=bb*bb-4*aa*cc;if(d< -eps*aa)return [];
  const root=Math.sqrt(Math.max(0,d));return [...new Set([(-bb-root)/(2*aa),(-bb+root)/(2*aa)])].filter(t=>t>=-eps&&t<=1+eps).map(t=>at(a,backwards?1-t:t)).filter(p=>inArc(p,b));
 }
 const d=dist(a.center,b.center);
 if(d<eps&&Math.abs(a.radius-b.radius)<eps){if(a.type==='circle'||b.type==='circle')return null;if([.25,.5,.75].some(t=>inArc(at(a,t),b))||[.25,.5,.75].some(t=>inArc(at(b,t),a)))return null;return [a.start,a.end,b.start,b.end].filter(p=>inArc(p,a)&&inArc(p,b));}
 if(d>a.radius+b.radius+eps||d<Math.abs(a.radius-b.radius)-eps||d<eps)return [];
 const x=(a.radius**2-b.radius**2+d*d)/(2*d),h=Math.sqrt(Math.max(0,a.radius**2-x*x)),u=sub(b.center,a.center).map(v=>v/d),p=add(a.center,u.map(v=>v*x));return [add(p,[-u[1]*h,u[0]*h]),add(p,[u[1]*h,-u[0]*h])].filter(q=>inArc(q,a)&&inArc(q,b));
}
function inside(point,segments){
 // Exact horizontal ray crossings of lines and circular arcs. Shared endpoints
 // are handled by a deterministic infinitesimal ray-height shift.
 const y=point[1]+Math.max(1,Math.abs(point[1]))*1.731e-12;let count=0;
 for(const s of segments){if(isCadCurve(s)){count+=curveRayCrossings(s,[point[0],y]);continue;}if(s.type==='line'){if((s.start[1]>y)!==(s.end[1]>y)){const x=s.start[0]+(y-s.start[1])*(s.end[0]-s.start[0])/(s.end[1]-s.start[1]);if(x>point[0])count++;}}else{const dy=y-s.center[1];if(Math.abs(dy)>=s.radius)continue;const dx=Math.sqrt(s.radius*s.radius-dy*dy);for(const x of [s.center[0]-dx,s.center[0]+dx])if(x>point[0]&&inArc([x,y],s,1e-12))count++;}}
 return !!(count%2);
}
export function profileElementSamples(e,segments=64){if(isCadCurve(e))return curveSamples(e,segments);if(e.type==='line')return [e.start,e.end];const n=Math.max(2,Math.ceil(Math.abs(e.sweep)/TAU*segments));return Array.from({length:n+1},(_,i)=>at(e,i/n));}
function signedArea(entities){return entities.reduce((area,e)=>{if(isCadCurve(e))return area+curveBeziers(e).reduce((sum,p)=>sum+bezierArea(p),0);if(e.type==='line')return area+cross(e.start,e.end)/2;const a=e.startAngle,b=a+e.sweep,c=e.center,r=e.radius;return area+(r*c[0]*(Math.sin(b)-Math.sin(a))+r*c[1]*(Math.cos(a)-Math.cos(b))+r*r*e.sweep)/2;},0);}
const reversed=s=>s.toReversed().map(e=>isCadCurve(e)?reverseCurve(e):e.type==='line'?{...e,start:e.end,end:e.start}:e.type==='circle'?{...e,sweep:-e.sweep}:{...e,start:e.end,end:e.start,startAngle:e.startAngle+e.sweep,sweep:-e.sweep});
export function profileNativeSegments(entities){return entities.flatMap(e=>isCadCurve(e)?curveBeziers(e).map(points=>({kind:'bezier',points})):e.type==='line'?{kind:'line',start:e.start,end:e.end}:e.type==='arc'?{kind:'arc',start:e.start,through:e.through,end:e.end}:{kind:'ellipse',center:e.center,rx:e.radius,ry:e.radius,startAngle:0,endAngle:TAU,reversed:e.sweep<0});}
export function resolveSketchProfile(input,expression,{segments=64,geometryOnly=false}={}){
 record(input,['version','kind','variables','dimensions','elements','loops',...(input.version>=3?['constraints']:[])]);if(![2,3,4].includes(input.version)||input.kind!=='profile'||!Array.isArray(input.variables)||input.variables.length>40||!Array.isArray(input.elements)||input.elements.length>128||!Array.isArray(input.loops)||input.loops.length>64)fail('Profil benötigt höchstens 128 Elemente und 40 benannte Maße.');
 const constraints=input.version>=3?(geometryOnly?validateSketchConstraints(input):assertSketchConstraints(input)):null;
 record(input.dimensions,['height']);const formula=v=>{if(typeof v==='number')v=String(v);if(typeof v!=='string'||!v.trim()||v.length>200)fail('Maßformel benötigt 1–200 Zeichen.');return v;};
 const defs=new Map(),values=Object.create(null),visiting=new Set(),variables=input.variables.map(v=>{record(v,['name','value']);if(typeof v.name!=='string'||!NAME.test(v.name)||['__proto__','prototype','constructor'].includes(v.name)||defs.has(v.name))fail('Maßnamen müssen eindeutig sein.');const value=formula(v.value);defs.set(v.name,value);return {name:v.name,value};});
 const read=name=>{if(Object.hasOwn(values,name))return values[name];if(!defs.has(name))fail('Unbekanntes Maß: '+name);if(visiting.has(name))fail('Zyklische Maßbeziehung: '+name);visiting.add(name);const v=expression(defs.get(name),read);visiting.delete(name);values[name]=v;return v;};for(const name of defs.keys())read(name);
 const scalar=v=>expression(formula(v),read),pair=p=>{if(!Array.isArray(p)||p.length!==2)fail('Punkt benötigt X und Y.');return p.map(scalar);},storedPair=p=>p.map(formula),ids=new Set(),stored=[],resolved=[];
 let pointCount=0;
 for(const e of input.elements){record(e,isCadCurve(e)?['id','type','construction',...profilePointFields(e)]:e.type==='line'?['id','type','start','end','construction']:e.type==='arc'?['id','type','start','through','end','construction']:['id','type','center','diameter','construction']);if(typeof e.id!=='string'||!e.id||e.id.length>100||ids.has(e.id)||!['line','arc','circle',...(input.version===4?['bezier','bspline']:[])].includes(e.type)||e.construction!==undefined&&typeof e.construction!=='boolean')fail('Ungültige oder doppelte Elementkennung.');ids.add(e.id);const base={id:e.id,type:e.type,construction:!!e.construction};
  if(isCadCurve(e)){const keys=curveControlKeys(e);if(keys.length<2||keys.length>14||keys.some((k,i)=>k!=='control'+(i+1))||e.type==='bezier'&&keys.length!==2)fail('Bézier benötigt zwei, B-Spline zwei bis vierzehn geordnete Kontrollpunkte.');const text={...base},numeric={...base};for(const key of profilePointFields(e)){numeric[key]=pair(e[key]);text[key]=storedPair(e[key]);if(numeric[key].some(v=>!Number.isFinite(v)||Math.abs(v)>100000))fail('Kontrollpunkt außerhalb der Modellgrenzen.');}stored.push(text);resolved.push(numeric);}
  else if(e.type==='circle'){const center=pair(e.center),diameter=scalar(e.diameter);if(diameter<.01||diameter>10000)fail('Kreisdurchmesser außerhalb 0,01–10000 mm.');stored.push({...base,center:storedPair(e.center),diameter:formula(e.diameter)});resolved.push({...base,center,radius:diameter/2,startAngle:0,sweep:TAU,start:[center[0]+diameter/2,center[1]],end:[center[0]+diameter/2,center[1]]});}
  else{const start=pair(e.start),end=pair(e.end);if(dist(start,end)<1e-8)fail('Element besitzt keine Länge.');if(e.type==='line'){stored.push({...base,start:storedPair(e.start),end:storedPair(e.end)});resolved.push({...base,start,end});}else{const through=pair(e.through);stored.push({...base,start:storedPair(e.start),through:storedPair(e.through),end:storedPair(e.end)});resolved.push({...base,start,through,end,...circleThrough(start,through,end)});}}
 pointCount+=profilePointFields(e).length;if(pointCount>384)fail('Höchstens 384 Skizzenpunkte einschließlich Kontrollpunkten.');
 }
 if(geometryOnly)return {elements:resolved,values};
 for(const e of resolved.filter(isCadCurve))assertSimpleCurve(e);
 const byId=new Map(resolved.map(e=>[e.id,e])),used=new Set(),loopIds=new Set();let outer;
 const loops=input.loops.map(loop=>{record(loop,['id','role','elements']);if(typeof loop.id!=='string'||!loop.id||loop.id.length>100||loopIds.has(loop.id)||!['outer','hole'].includes(loop.role)||!Array.isArray(loop.elements)||!loop.elements.length)fail('Eine geschlossene Kontur mit eindeutiger Kennung wählen.');loopIds.add(loop.id);if(loop.role==='outer'){if(outer)fail('Nur eine Außenkontur pro Skizze.');outer=loop.id;}const entities=loop.elements.map(id=>{const e=byId.get(id);if(!e||e.construction||used.has(id))fail('Konturelement fehlt, ist doppelt oder eine Konstruktionslinie.');used.add(id);return e;});if(entities.some(e=>e.type==='circle')&&entities.length!==1)fail('Ein Vollkreis bildet eine eigene Kontur.');for(let i=0;i<entities.length;i++)if(dist(entities[i].end,entities[(i+1)%entities.length].start)>1e-7)fail('Kontur ist offen: Endpunkte verbinden.');const area=signedArea(entities);if(Math.abs(area)<1e-8)fail('Kontur besitzt keine Fläche.');return {id:loop.id,role:loop.role,entities:area<0?reversed(entities):entities,area:Math.abs(area)};});
 if(!outer)fail('Eine Außenkontur fehlt.');if(resolved.some(e=>!e.construction&&!used.has(e.id)))fail('Nicht zugeordnete Elemente einer Kontur hinzufügen.');
 const material=loops.flatMap(loop=>loop.entities.map((e,i)=>({...e,loop:loop.id,index:i,count:loop.entities.length}))),eps=1e-7;
 for(let i=0;i<material.length;i++)for(let j=i+1;j<material.length;j++){const a=material[i],b=material[j],hits=intersections(a,b,eps),adjacent=a.loop===b.loop&&(Math.abs(a.index-b.index)===1||Math.abs(a.index-b.index)===a.count-1);if(hits===null||hits.some(p=>!adjacent||![a.start,a.end].some(q=>dist(p,q)<eps)||![b.start,b.end].some(q=>dist(p,q)<eps)))fail('Konturen überschneiden oder berühren sich.');}
 const outside=loops.find(l=>l.role==='outer'),holes=loops.filter(l=>l.role==='hole');for(const hole of holes){if(!inside(hole.entities[0].start,outside.entities))fail('Innenöffnung liegt nicht vollständig innerhalb der Außenkontur.');for(const other of holes)if(other!==hole&&inside(hole.entities[0].start,other.entities))fail('Innenöffnungen dürfen sich nicht ineinander verschachteln.');}
 const boundsPoints=outside.entities.flatMap(e=>{if(isCadCurve(e))return curveBeziers(e).flatMap(p=>{const b=bezierBounds(p);return [b.min,b.max];});if(e.type==='line')return [e.start,e.end];return [e.start,e.end,...[0,Math.PI/2,Math.PI,Math.PI*1.5].map(a=>[e.center[0]+e.radius*Math.cos(a),e.center[1]+e.radius*Math.sin(a)]).filter(p=>inArc(p,e))];}),min=[0,1].map(k=>Math.min(...boundsPoints.map(p=>p[k]))),max=[0,1].map(k=>Math.max(...boundsPoints.map(p=>p[k]))),height=scalar(input.dimensions.height),size=[max[0]-min[0],max[1]-min[1],height];if(size.some(v=>!Number.isFinite(v)||v<.01||v>10000))fail('Skizzenabmessungen außerhalb 0,01–10000 mm.');
 const polygon=l=>l.entities.flatMap(e=>profileElementSamples(e,segments).slice(0,-1)),points=polygon(outside),holePoints=holes.map(polygon).map(p=>p.toReversed()),area=outside.area-holes.reduce((n,h)=>n+h.area,0);if(area<=1e-8)fail('Keine Materialfläche übrig.');
 const sketch={version:input.version,kind:'profile',variables,dimensions:{height:formula(input.dimensions.height)},elements:stored,loops:input.loops.map(l=>({id:l.id,role:l.role,elements:[...l.elements]})),...(constraints?{constraints}:{})};
 return {sketch,kind:'profile',elements:resolved,loops,points,holes:holePoints,polygons:[points,...holePoints],native:{outer:profileNativeSegments(outside.entities),holes:holes.map(h=>profileNativeSegments(h.entities))},height,size,center:[(min[0]+max[0])/2,(min[1]+max[1])/2,height/2],bottom:[min[0],min[1],0],area,values};
}
export function appendProfileLoop(sketch,entities,role='hole'){
 const next=structuredClone(sketch);if(role==='outer'){const prior=next.loops.find(l=>l.role==='outer'),remove=new Set(prior?.elements??[]);next.elements=next.elements.filter(e=>!remove.has(e.id));next.loops=next.loops.filter(l=>l.role!=='outer');}next.elements.push(...entities);next.loops.push({id:profileId('loop'),role,elements:entities.map(e=>e.id)});return next;
}
export function profileLines(points,{construction=false}={}){return points.map((start,i)=>({id:profileId('line'),type:'line',start:[...start],end:[...points[(i+1)%points.length]],construction}));}
export function profileFromLegacy(sketch,resolved){const next={version:2,kind:'profile',variables:structuredClone(sketch.variables),dimensions:{height:sketch.dimensions.height},elements:[],loops:[]};let entities;if(sketch.kind==='circle')entities=[{id:profileId('circle'),type:'circle',center:['0','0'],diameter:sketch.dimensions.diameter,construction:false}];else if(sketch.kind==='rectangle'){const w=sketch.dimensions.width,d=sketch.dimensions.depth;entities=profileLines([[`-(${w})/2`,`-(${d})/2`],[`(${w})/2`,`-(${d})/2`],[`(${w})/2`,`(${d})/2`],[`-(${w})/2`,`(${d})/2`]]);}else entities=profileLines(sketch.points);return appendProfileLoop(next,entities,'outer');}
export function profilePrimitive(type,start,end,{radius=2,construction=false}={}){
 if(!['line','arc','circle','rectangle','roundrect','slot'].includes(type))fail('Unbekannte Zeichenform.');
 const min=[0,1].map(k=>Math.min(start[k],end[k])),max=[0,1].map(k=>Math.max(start[k],end[k])),w=max[0]-min[0],h=max[1]-min[1],base={construction};
 const line=(a,b)=>({id:profileId('line'),type:'line',start:a,end:b,...base}),arc=(a,b,c)=>({id:profileId('arc'),type:'arc',start:a,through:b,end:c,...base});
 if(type==='line')return [line(start,end)];if(type==='arc')return [arc(start,radius,end)];if(type==='circle')return [{id:profileId('circle'),type:'circle',center:start,diameter:2*dist(start,end),...base}];if(type==='rectangle')return profileLines([min,[max[0],min[1]],max,[min[0],max[1]]],{construction});
 const r=type==='slot'?Math.min(w,h)/2:Number(radius);if(!(r>0)||r>Math.min(w,h)/2)fail('Rundungsradius ist zu groß oder ungültig.');
 const centers=[[max[0]-r,min[1]+r],[max[0]-r,max[1]-r],[min[0]+r,max[1]-r],[min[0]+r,min[1]+r]],angles=[-Math.PI/2,0,Math.PI/2,Math.PI],at=(c,a)=>[c[0]+r*Math.cos(a),c[1]+r*Math.sin(a)],result=[];
 for(let i=0;i<4;i++){const c=centers[i],a=angles[i],p=at(c,a),q=at(c,a+Math.PI/2);result.push(arc(p,at(c,a+Math.PI/4),q));const next=at(centers[(i+1)%4],angles[(i+1)%4]);if(dist(q,next)>1e-8)result.push(line(q,next));}return result;
}
/** Derive interaction data from already resolved geometry without evaluating
 * expressions again. These helpers do not validate a modelling operation. */
export function profileGeometryHandles(elements){const result=[];for(const e of elements)for(const field of profilePointFields(e)){const point=e[field],found=result.find(p=>dist(p.point,point)<1e-8),ref={id:e.id,field};if(found)found.references.push(ref);else result.push({point:[...point],references:[ref]});}return result;}
export function profileGeometryMidpoints(elements,handles=profileGeometryHandles(elements)){return elements.filter(e=>e.type!=='circle').map(e=>({point:at(e,.5),indices:handles.flatMap((h,i)=>h.references.some(ref=>ref.id===e.id)?[i]:[])}));}
export function profileHandles(sketch,expression){return profileGeometryHandles(resolveSketchProfile(sketch,expression,{geometryOnly:true}).elements);}
export function profileMidpoints(sketch,expression){return profileGeometryMidpoints(resolveSketchProfile(sketch,expression,{geometryOnly:true}).elements);}
export function moveProfilePoints(sketch,indices,delta,expression){const out=structuredClone(sketch),handles=profileHandles(sketch,expression),literal=v=>typeof v==='number'||typeof v==='string'&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(v.trim());for(const i of indices){const h=handles[i];if(!h)fail('Punkt wurde geändert.');for(const ref of h.references){const e=out.elements.find(e=>e.id===ref.id),pair=e[ref.field];if(!pair.every(literal))fail('Formelgesteuerter Punkt: die Maßformel im Eingabefeld ändern.');e[ref.field]=h.point.map((v,k)=>String(Number((v+delta[k]).toPrecision(14))));}}return out;}
