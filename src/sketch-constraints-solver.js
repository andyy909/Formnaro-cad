import {SKETCH_CONSTRAINT_LIMITS,validateSketchConstraints,sketchConstraintValues,sketchLiteral,sketchPointFields} from './sketch-constraints-data.js';

const length=v=>Math.hypot(...v),sub=(a,b)=>a.map((x,k)=>x-b[k]),dot=(a,b)=>a[0]*b[0]+a[1]*b[1],cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const norm=v=>{const n=length(v);if(n<1e-10)throw Error('Entartetes Element.');return v.map(x=>x/n);};
function geometry(sketch,scalar,required){
 return new Map(sketch.elements.filter(e=>!required||required.has(e.id)).map(e=>{const out={id:e.id,type:e.type};for(const field of sketchPointFields(e))out[field]=e[field].map(scalar);
  if(e.type==='circle'){out.radius=scalar(e.diameter)/2;if(out.radius<.005||out.radius>5000)throw Error('Ungültiger Radius.');}
  if(e.type==='arc'){const u=sub(out.through,out.start),v=sub(out.end,out.start),d=2*cross(u,v);if(Math.abs(d)<1e-10)throw Error('Entarteter Bogen.');out.center=[out.start[0]+(v[1]*dot(u,u)-u[1]*dot(v,v))/d,out.start[1]+(u[0]*dot(v,v)-v[0]*dot(u,u))/d];out.radius=length(sub(out.start,out.center));}
  if(e.type==='line'&&length(sub(out.end,out.start))<1e-8)throw Error('Entartete Linie.');return [e.id,out];}));
}
export function sketchConstraintResiduals(sketch,constraints=validateSketchConstraints(sketch)){
 const {scalar}=sketchConstraintValues(sketch),required=new Set(constraints.flatMap(c=>c.refs.map(r=>r.element))),map=geometry(sketch,scalar,required),rows=[];
 const push=(c,...values)=>{for(const value of values){if(!Number.isFinite(value))throw Error('Ungültige Restabweichung.');rows.push({id:c.id,value});}};
 for(const c of constraints){const es=c.refs.map(r=>map.get(r.element)),ps=c.refs.map((r,i)=>r.point?es[i][r.point]:null),a=es[0],b=es[1],u=a.type==='line'?sub(a.end,a.start):null,v=b?.type==='line'?sub(b.end,b.start):null;
  switch(c.type){
   case 'coincident':push(c,...sub(ps[0],ps[1]));break;
   case 'horizontal':push(c,u[1]);break;
   case 'vertical':push(c,u[0]);break;
   case 'parallel':push(c,cross(u,v)/Math.max(length(u),length(v)));break;
   case 'perpendicular':push(c,dot(u,v)/Math.max(length(u),length(v)));break;
   case 'equalLength':push(c,length(u)-length(v));break;
   case 'equalRadius':push(c,a.radius-b.radius);break;
   case 'concentric':push(c,...sub(a.center,b.center));break;
   case 'symmetric':{const axis=es[2],d=norm(sub(axis.end,axis.start)),middle=ps[0].map((p,i)=>(p+ps[1][i])/2);push(c,cross(sub(middle,axis.start),d),dot(sub(ps[0],ps[1]),d));break;}
   case 'tangent':if(u||v){const line=u?a:b,round=u?b:a;push(c,Math.abs(cross(sub(round.center,line.start),norm(sub(line.end,line.start))))-round.radius);}else push(c,length(sub(a.center,b.center))-(c.mode==='internal'?Math.abs(a.radius-b.radius):a.radius+b.radius));break;
   case 'fixed':if(ps[0])push(c,...sub(ps[0],c.value));else{for(const f of sketchPointFields(a))push(c,...sub(a[f],c.value[f]));if(a.type==='circle')push(c,a.radius*2-c.value.diameter);}break;
   case 'length':push(c,length(u)-scalar(c.value));break;
   case 'distance':push(c,length(sub(ps[0],ps[1]))-scalar(c.value));break;
   case 'radius':push(c,a.radius-scalar(c.value));break;
   case 'angle':{const target=scalar(c.value)*Math.PI/180,angle=Math.atan2(u[1],u[0])-target;push(c,Math.atan2(Math.sin(angle),Math.cos(angle))*Math.max(1,length(u)));break;}
  }
 }return {rows,map};
}
// Householder QR with column pivoting. No normal equations; rank is measured
// before damping. The clock guard also covers factorization and finite differences.
export function sketchQR(matrix,rhs,{check=()=>{},rankTolerance=1e-9}={}){
 const a=matrix.map(row=>Float64Array.from(row)),b=Float64Array.from(rhs),m=a.length,n=a[0]?.length??0,p=Array.from({length:n},(_,i)=>i),limit=Math.min(m,n);let rank=0,first=0;
 for(let k=0;k<limit;k++){check();let chosen=k,best=-1;for(let j=k;j<n;j++){let s=0;for(let i=k;i<m;i++)s+=a[i][j]**2;if(s>best){best=s;chosen=j;}}
  const size=Math.sqrt(Math.max(0,best));if(k===0)first=size;if(size<=Math.max(1e-12,first*rankTolerance))break;
  if(chosen!==k){for(let i=0;i<m;i++){const t=a[i][k];a[i][k]=a[i][chosen];a[i][chosen]=t;}[p[k],p[chosen]]=[p[chosen],p[k]];}
  const alpha=a[k][k]>=0?-size:size,vector=Float64Array.from({length:m-k},(_,j)=>a[k+j][k]);vector[0]-=alpha;let square=0;for(const x of vector)square+=x*x;const beta=2/square;
  for(let j=k;j<n;j++){let s=0;for(let i=k;i<m;i++)s+=vector[i-k]*a[i][j];s*=beta;for(let i=k;i<m;i++)a[i][j]-=s*vector[i-k];}
  let s=0;for(let i=k;i<m;i++)s+=vector[i-k]*b[i];s*=beta;for(let i=k;i<m;i++)b[i]-=s*vector[i-k];rank++;
 }
 const x=Array(n).fill(0),z=Array(n).fill(0);for(let i=rank-1;i>=0;i--){let r=b[i];for(let j=i+1;j<rank;j++)r-=a[i][j]*z[j];z[i]=r/a[i][i];}for(let i=0;i<n;i++)x[p[i]]=z[i];return {x,rank};
}
function tangentContactsValid(sketch,constraints){
 const {map}=sketchConstraintResiduals(sketch,constraints),onArc=(e,p)=>{if(e.type!=='arc')return true;const tau=2*Math.PI,mod=x=>(x%tau+tau)%tau,a=Math.atan2(e.start[1]-e.center[1],e.start[0]-e.center[0]),b=Math.atan2(e.end[1]-e.center[1],e.end[0]-e.center[0]),mid=Math.atan2(e.through[1]-e.center[1],e.through[0]-e.center[0]),s=mod(b-a);return mod(mid-a)<=s?mod(Math.atan2(p[1]-e.center[1],p[0]-e.center[0])-a)<=s+1e-7:mod(a-Math.atan2(p[1]-e.center[1],p[0]-e.center[0]))<=tau-s+1e-7;};
 for(const c of constraints.filter(c=>c.type==='tangent')){const [a,b]=c.refs.map(r=>map.get(r.element));if(a.type==='line'||b.type==='line'){const line=a.type==='line'?a:b,round=a.type==='line'?b:a,u=sub(line.end,line.start),t=dot(sub(round.center,line.start),u)/dot(u,u),p=line.start.map((x,i)=>x+t*u[i]);if(t< -1e-7||t>1+1e-7||!onArc(round,p))return false;}else{const d=norm(sub(b.center,a.center));const candidates=[1,-1].map(sign=>a.center.map((x,i)=>x+sign*a.radius*d[i]));if(!candidates.some(p=>Math.abs(length(sub(p,b.center))-b.radius)<1e-6&&onArc(a,p)&&onArc(b,p)))return false;}}return true;
}
/** Atomic result. Failure returns the supplied last valid draft byte-for-byte. */
export function solveSketchConstraints(input,{affected,lastValid=input,maxIterations=80,timeMs=1000,now=()=>performance.now(),signal}={}){
 const began=now(),deadline=Number.isFinite(timeMs)&&timeMs>=0?Math.min(SKETCH_CONSTRAINT_LIMITS.timeMs,timeMs):SKETCH_CONSTRAINT_LIMITS.timeMs,check=()=>{if(signal?.aborted)throw Object.assign(Error('Abgebrochen.'),{code:'ABORTED'});if(now()-began>deadline)throw Object.assign(Error('Zeitgrenze des Skizzenlösers erreicht.'),{code:'SKETCH_SOLVER_TIMEOUT'});};
 let iterations=0,active=[],rank=0,variables=[];
 try{
  check();const all=validateSketchConstraints(input),out=structuredClone(input),component=new Set(affected??out.elements.map(e=>e.id));if(!Array.isArray(affected??[])||(affected??[]).some(id=>!out.elements.some(e=>e.id===id)))throw Error('Betroffene Elemente fehlen.');
  out.constraints=structuredClone(all);
  let grew=true;while(grew){grew=false;for(const c of all)if(c.refs.some(r=>component.has(r.element)))for(const r of c.refs)if(!component.has(r.element)){component.add(r.element);grew=true;}}
  active=all.filter(c=>c.refs.some(r=>component.has(r.element)));
  for(const e of out.elements.filter(e=>component.has(e.id))){for(const field of sketchPointFields(e))for(let axis=0;axis<2;axis++)if(sketchLiteral(e[field][axis]))variables.push({get:()=>Number(e[field][axis]),set:v=>e[field][axis]=String(Number(v.toPrecision(15)))});if(e.type==='circle'&&sketchLiteral(e.diameter))variables.push({get:()=>Number(e.diameter),set:v=>e.diameter=String(Number(v.toPrecision(15)))});}
  const residual=()=>{check();return sketchConstraintResiduals(out,active).rows.map(r=>r.value);},cost=r=>r.reduce((sum,x)=>sum+x*x,0),maximum=r=>Math.max(0,...r.map(Math.abs));
  const jacobian=r=>{const j=r.map(()=>Array(variables.length).fill(0));for(let k=0;k<variables.length;k++){check();const x=variables[k].get(),h=Math.max(1e-6,Math.abs(x)*1e-7);variables[k].set(x+h);let next;try{next=residual();}finally{variables[k].set(x);}for(let i=0;i<r.length;i++)j[i][k]=(next[i]-r[i])/h;}return j;};
  let r=residual(),lambda=1e-5;
  for(;iterations<Math.min(80,maxIterations)&&maximum(r)>1e-8;iterations++){
   check();if(!variables.length)break;const j=jacobian(r),n=variables.length,aug=[...j,...Array.from({length:n},(_,i)=>Array.from({length:n},(_,k)=>i===k?Math.sqrt(lambda):0))],step=sketchQR(aug,[...r.map(x=>-x),...Array(n).fill(0)],{check}).x,original=variables.map(v=>v.get());
   variables.forEach((v,i)=>v.set(original[i]+step[i]));let next;try{next=residual();}catch(error){if(error.code)throw error;next=null;}
   if(next&&cost(next)<cost(r)){r=next;lambda=Math.max(1e-12,lambda/4);}else{variables.forEach((v,i)=>v.set(original[i]));lambda=Math.min(1e12,lambda*10);}
  }
  const bad=sketchConstraintResiduals(out,active).rows.filter(row=>Math.abs(row.value)>1e-7).map(row=>row.id);
  if(bad.length||!tangentContactsValid(out,active))return {ok:false,sketch:structuredClone(lastValid),code:'SKETCH_CONSTRAINT_CONFLICT',message:'Bedingungen widersprechen sich oder die Tangente liegt außerhalb des Elements. Letzter gültiger Zustand bleibt erhalten.',conflicts:[...new Set(bad.length?bad:active.filter(c=>c.type==='tangent').map(c=>c.id))],iterations};
  if(r.length&&variables.length)rank=sketchQR(jacobian(r),r.map(()=>0),{check}).rank;
  // Verify every component before accepting a draft; disconnected invalid input
  // must never be smuggled through a small affected set.
  const allRows=sketchConstraintResiduals(out,all).rows;if(allRows.some(row=>Math.abs(row.value)>1e-7)||!tangentContactsValid(out,all))throw Error('Nicht betroffene Bedingungsgruppe ist ungültig.');check();
  return {ok:true,sketch:out,iterations,rank,degreesOfFreedom:Math.max(0,variables.length-rank),affected:[...component],constraints:active.map(c=>c.id),maxResidual:maximum(r),elapsedMs:now()-began};
 }catch(error){return {ok:false,sketch:structuredClone(lastValid),code:error.code??'SKETCH_CONSTRAINT_INVALID',message:error.message,conflicts:active.map(c=>c.id),iterations};}
}
export function assertSketchConstraints(sketch){
 const constraints=validateSketchConstraints(sketch),{rows}=sketchConstraintResiduals(sketch,constraints),bad=[...new Set(rows.filter(row=>Math.abs(row.value)>1e-7).map(row=>row.id))];
 if(bad.length||!tangentContactsValid(sketch,constraints))throw Object.assign(Error('Skizzenbedingungen zuerst lösen. Widersprüchliche oder nicht erfüllte Beziehungen: '+bad.join(', ')),{code:'SKETCH_CONSTRAINT_CONFLICT',conflicts:bad});return constraints;
}
export function prepareConstrainedSketch(sketch,options){
 if(sketch?.version!==3)return sketch;const result=solveSketchConstraints(sketch,options);if(!result.ok)throw Object.assign(Error(result.message),{code:result.code,conflicts:result.conflicts});return result.sketch;
}
