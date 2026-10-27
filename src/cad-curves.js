// Polynomial curves keep their exact control polygons. Samples are for display.
const mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);
export const isCadCurve=e=>['bezier','bspline'].includes(e.type??e.kind);
export const curveControlKeys=e=>Object.keys(e).filter(k=>/^control\d+$/.test(k)).sort((a,b)=>Number(a.slice(7))-Number(b.slice(7)));
export const profilePointFields=e=>e.type==='circle'?['center']:e.type==='arc'?['start','through','end']:isCadCurve(e)?['start',...curveControlKeys(e),'end']:['start','end'];
export function bezierPoint(points,t){let p=points.map(v=>[...v]);while(p.length>1)p=p.slice(0,-1).map((a,i)=>mix(a,p[i+1],t));return p[0];}
export function splitBezier(points,t=.5){const left=[points[0]],right=[points.at(-1)];let p=points;while(p.length>1){p=p.slice(0,-1).map((a,i)=>mix(a,p[i+1],t));left.push(p[0]);right.unshift(p.at(-1));}return [left,right];}
function deBoor(points,knots,degree,t){if(t>=knots[points.length])return [...points.at(-1)];let span=degree;while(span<points.length-1&&t>=knots[span+1])span++;const d=Array.from({length:degree+1},(_,j)=>[...points[span-degree+j]]);for(let r=1;r<=degree;r++)for(let j=degree;j>=r;j--){const i=span-degree+j,den=knots[i+degree-r+1]-knots[i];d[j]=mix(d[j-1],d[j],den?(t-knots[i])/den:0);}return d[degree];}
/** Clamped, uniform, non-rational cubic B-spline, exactly split into cubics. */
export function bsplineBeziers(points){
 if(!Array.isArray(points)||points.length<4||points.length>16)throw Error('Kubische B-Spline benötigt 4–16 Kontrollpunkte.');
 const spans=points.length-3,knots=[0,0,0,0,...Array.from({length:spans-1},(_,i)=>i+1),spans,spans,spans,spans];
 const derivative=points.slice(0,-1).map((p,i)=>p.map((v,k)=>3*(points[i+1][k]-v)/(knots[i+4]-knots[i+1]))),dk=knots.slice(1,-1),at=t=>deBoor(points,knots,3,t),dt=t=>deBoor(derivative,dk,2,t);
 return Array.from({length:spans},(_,i)=>{const a=at(i),b=at(i+1),u=dt(i),v=dt(i+1);return [a,a.map((x,k)=>x+u[k]/3),b.map((x,k)=>x-v[k]/3),b];});
}
export function curvePoles(e){return e.points??profilePointFields(e).map(key=>e[key]);}
export function curveBeziers(e){const points=curvePoles(e);if((e.type??e.kind)==='bspline')return bsplineBeziers(points);if(points.length!==4)throw Error('Kubische Bézierkurve benötigt vier Kontrollpunkte.');return [points];}
export function reverseCurve(e){const out={...e,start:e.end,end:e.start},keys=curveControlKeys(e),p=keys.map(k=>e[k]).reverse();keys.forEach((k,i)=>out[k]=p[i]);return out;}
function quadratic(a,b,c){if(Math.abs(a)<1e-15)return Math.abs(b)<1e-15?[]:[-c/b];const d=b*b-4*a*c;if(d<0)return [];const q=-.5*(b+(b>=0?1:-1)*Math.sqrt(d));return q===0?[0]:[q/a,c/q];}
const coefficients=p=>p[0].map((_,k)=>[p[0][k],3*(p[1][k]-p[0][k]),3*(p[2][k]-2*p[1][k]+p[0][k]),p[3][k]-3*p[2][k]+3*p[1][k]-p[0][k]]);
export function bezierBounds(p){const coefficientsByAxis=coefficients(p),ts=new Set([0,1]);for(const a of coefficientsByAxis)for(const t of quadratic(3*a[3],2*a[2],a[1]))if(t>0&&t<1)ts.add(t);const points=[...ts].map(t=>bezierPoint(p,t));return {min:p[0].map((_,k)=>Math.min(...points.map(p=>p[k]))),max:p[0].map((_,k)=>Math.max(...points.map(p=>p[k])))};}
export function bezierArea(p){const [x,y]=coefficients(p);let sum=0;for(let i=0;i<4;i++)for(let j=1;j<4;j++)sum+=(x[i]*j*y[j]-y[i]*j*x[j])/(i+j);return sum/2;}
export function curveSamples(e,count=64){const spans=curveBeziers(e),n=Math.max(4,Math.ceil(count/spans.length));return spans.flatMap((p,i)=>Array.from({length:n+(i===spans.length-1?1:0)},(_,k)=>bezierPoint(p,k/n)));}
export function curveRayCrossings(e,point){let count=0;const y=point[1];for(const p of curveBeziers(e)){const a=coefficients(p)[1],ts=[0,...quadratic(3*a[3],2*a[2],a[1]).filter(t=>t>0&&t<1),1].sort((a,b)=>a-b);for(let i=1;i<ts.length;i++){let lo=ts[i-1],hi=ts[i],ya=bezierPoint(p,lo)[1],yb=bezierPoint(p,hi)[1];if((ya>y)===(yb>y))continue;for(let j=0;j<55;j++){const mid=(lo+hi)/2;if((bezierPoint(p,mid)[1]>y)===(ya>y))lo=mid;else hi=mid;}if(bezierPoint(p,(lo+hi)/2)[0]>point[0])count++;}}return count;}
const near=(a,b,eps)=>Math.hypot(...a.map((x,k)=>x-b[k]))<=eps;
function pieceBounds(p){if(p.kind==='bezier')return bezierBounds(p.points);if(p.kind==='line')return {min:p.start.map((v,k)=>Math.min(v,p.end[k])),max:p.start.map((v,k)=>Math.max(v,p.end[k]))};const angles=[p.a,p.b,...[0,Math.PI/2,Math.PI,1.5*Math.PI,2*Math.PI,2.5*Math.PI,3*Math.PI,3.5*Math.PI].filter(a=>a>p.a&&a<p.b)],points=angles.map(a=>[p.center[0]+p.radius*Math.cos(a),p.center[1]+p.radius*Math.sin(a)]);return {min:[0,1].map(k=>Math.min(...points.map(p=>p[k]))),max:[0,1].map(k=>Math.max(...points.map(p=>p[k])))};}
function splitPiece(p){if(p.kind==='bezier')return splitBezier(p.points).map(points=>({kind:p.kind,points}));if(p.kind==='line'){const mid=mix(p.start,p.end,.5);return [{...p,end:mid},{...p,start:mid}];}const mid=(p.a+p.b)/2;return [{...p,b:mid},{...p,a:mid}];}
function pieces(e){if(isCadCurve(e))return curveBeziers(e).map(points=>({kind:'bezier',points}));if(e.type==='line')return [{kind:'line',start:e.start,end:e.end}];const a=e.startAngle,b=a+e.sweep,lo=Math.min(a,b),hi=Math.max(a,b),shift=Math.floor(lo/(2*Math.PI))*2*Math.PI;return [{kind:'arc',center:e.center,radius:e.radius,a:lo-shift,b:hi-shift}];}
/** Conservative interval check; unresolved near contacts are rejected, never accepted. */
export function curveContact(a,b,{allowed=[],tolerance=1e-7}={}){
 const queue=pieces(a).flatMap(x=>pieces(b).map(y=>[x,y,0]));let visits=0;
 while(queue.length){if(++visits>60000)throw Error('Kurvenkontakt ist nicht eindeutig prüfbar. Kontrollpunkte weiter auseinander setzen.');const [x,y,depth]=queue.pop(),u=pieceBounds(x),v=pieceBounds(y);if(u.min.some((n,k)=>u.max[k]<v.min[k]-tolerance||v.max[k]<n-tolerance))continue;
  const width=q=>Math.max(...q.max.map((n,k)=>n-q.min[k]));
  if(allowed.some(p=>[u,v].every(box=>[box.min,box.max].every(q=>near(p,q,tolerance*2)))))continue;
  if(depth>=56||Math.max(width(u),width(v))<=tolerance)return true;
  if(width(u)>=width(v))for(const part of splitPiece(x))queue.push([part,y,depth+1]);else for(const part of splitPiece(y))queue.push([x,part,depth+1]);
 }return false;
}
/** Split into provably injective pieces before checking a curve against itself. */
export function assertSimpleCurve(e){const result=[],queue=curveBeziers(e).map(points=>({points,depth:0}));while(queue.length){const {points,depth}=queue.shift(),d=points.slice(0,-1).map((p,i)=>p.map((v,k)=>points[i+1][k]-v)),chord=points[0].map((v,k)=>points.at(-1)[k]-v),monotone=d.every(p=>p.reduce((s,v,k)=>s+v*chord[k],0)>=0)&&d.some(p=>p.reduce((s,v,k)=>s+v*chord[k],0)>1e-16);if(monotone){result.push(points);continue;}if(depth>=20)throw Error('Kurve besitzt eine Spitze, einen Rücklauf oder einen ungeklärten Selbstkontakt.');const halves=splitBezier(points);queue.unshift(...halves.map(points=>({points,depth:depth+1})));if(queue.length+result.length>4096)throw Error('Kurve ist zu komplex.');}
 for(let i=0;i<result.length;i++)for(let j=i+1;j<result.length;j++){const allowed=j===i+1?[result[i].at(-1)]:[];if(curveContact({kind:'bezier',points:result[i]},{kind:'bezier',points:result[j]},{allowed}))throw Error('Kurve überschneidet oder berührt sich selbst.');}
}
