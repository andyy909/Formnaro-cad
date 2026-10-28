const fail=(message,code='MESH_REMESH')=>{throw Object.assign(Error(message),{code});};
const abort=signal=>{if(signal?.aborted)throw Object.assign(Error('Neuvernetzen abgebrochen.'),{name:'AbortError'});};
const tick=(i,signal)=>{if(!(i%512))abort(signal);};
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(...a);
const ekey=(a,b)=>a<b?a+':'+b:b+':'+a;
const fkey=ids=>[...ids].sort((a,b)=>a-b).join(':');
const mean=points=>[0,1,2].map(k=>points.reduce((s,p)=>s+p[k],0)/points.length);
export function placement(m){
 if(!Array.isArray(m)||m.length!==16||m.some(v=>typeof v!=='number'||!Number.isFinite(v))||m[3]!==0||m[7]!==0||m[11]!==0||m[15]!==1)fail('Eine gültige affine Objektlage wird benötigt.');
 const a=m[0],b=m[4],c=m[8],d=m[1],e=m[5],f=m[9],g=m[2],h=m[6],i=m[10],det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);
 if(!det||!Number.isFinite(det))fail('Die Objektlage ist nicht sicher invertierbar.');
 const inverse=[(e*i-f*h)/det,(c*h-b*i)/det,(b*f-c*e)/det,(f*g-d*i)/det,(a*i-c*g)/det,(c*d-a*f)/det,(d*h-e*g)/det,(b*g-a*h)/det,(a*e-b*d)/det];
 if(inverse.some(v=>!Number.isFinite(v)))fail('Die Objektlage ist nicht sicher invertierbar.');
 return {world:p=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]),local:p=>{const q=p.map((v,k)=>v-m[k+12]);return [0,1,2].map(k=>dot(inverse.slice(k*3,k*3+3),q));}};
}
export function bounds(points){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const p of points)if(p)for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}return {min,max};}
export function triangleQuality(ids,positions){const [a,b,c]=ids.map(v=>positions[v]),u=sub(b,a),v=sub(c,a),area2=norm(cross(u,v)),sides=[norm(u),norm(v),norm(sub(c,b))],sum=sides.reduce((n,x)=>n+x*x,0),longest=Math.max(...sides);return {quality:sum?2*Math.sqrt(3)*area2/sum:0,aspect:area2?longest*longest/area2:Infinity};}
export function quality(faces,positions){
 let minQuality=1,total=0,maxAspectRatio=0,triangleCount=0;const lengths=new Map();
 for(const f of faces)if(f.alive){const q=triangleQuality(f.ids,positions);minQuality=Math.min(minQuality,q.quality);total+=q.quality;maxAspectRatio=Math.max(maxAspectRatio,q.aspect);triangleCount++;for(let k=0;k<3;k++){const a=f.ids[k],b=f.ids[(k+1)%3],key=ekey(a,b);if(!lengths.has(key))lengths.set(key,norm(sub(positions[a],positions[b])));}}
 let sum=0,sum2=0,minEdgeLength=Infinity,maxEdgeLength=0;for(const l of lengths.values()){sum+=l;sum2+=l*l;minEdgeLength=Math.min(minEdgeLength,l);maxEdgeLength=Math.max(maxEdgeLength,l);}const meanEdgeLength=sum/lengths.size;
 return {triangleCount,minQuality,meanQuality:total/triangleCount,maxAspectRatio,meanEdgeLength,minEdgeLength,maxEdgeLength,edgeLengthCV:Math.sqrt(Math.max(0,sum2/lengths.size-meanEdgeLength**2))/meanEdgeLength};
}

// Closest distance by oriented half planes and segment projections. Avoid
// subtracting nearly equal barycentric determinants on very thin triangles.
export function distance2(p,a,b,c){
 const ab=sub(b,a),ac=sub(c,a),ap=sub(p,a),scale=Math.max(...ab.map(Math.abs),...ac.map(Math.abs));if(!scale)return dot(ap,ap);
 const n=cross(ab.map(v=>v/scale),ac.map(v=>v/scale)),length=norm(n);if(!length)return Math.min(dot(ap,ap),dot(sub(p,b),sub(p,b)),dot(sub(p,c),sub(p,c)));const unit=n.map(v=>v/length),pairs=[[a,b],[b,c],[c,a]];
 if(pairs.every(([x,y])=>dot(cross(sub(y,x),sub(p,x)),unit)>=0)){const d=dot(ap,unit);return d*d;}
 let best=Infinity;for(const [x,y]of pairs){const d=sub(y,x),q=sub(p,x),t=Math.min(1,Math.max(0,dot(q,d)/dot(d,d))),r=q.map((v,k)=>v-t*d[k]);best=Math.min(best,dot(r,r));}return best;
}
export function surfaceIndex(faces,points,signal,budget=2000000){
 const triangles=[];for(let i=0;i<faces.length;i++){tick(i,signal);const f=faces[i];if(f.alive){const p=f.ids.map(v=>points[v]);triangles.push({p,bounds:bounds(p),center:mean(p)});}}
 let visits=0;
 function tree(items){tick(visits++,signal);const box={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};for(const t of items)for(let k=0;k<3;k++){box.min[k]=Math.min(box.min[k],t.bounds.min[k]);box.max[k]=Math.max(box.max[k],t.bounds.max[k]);}if(items.length<=12)return {box,items};const ranges=box.max.map((v,k)=>v-box.min[k]),axis=ranges.indexOf(Math.max(...ranges));items.sort((a,b)=>a.center[axis]-b.center[axis]);const middle=Math.floor(items.length/2);return {box,left:tree(items.slice(0,middle)),right:tree(items.slice(middle))};}
 const root=tree([...triangles]);const boxDistance=(p,b)=>p.reduce((s,v,k)=>s+Math.max(0,b.min[k]-v,v-b.max[k])**2,0);
 function closest(p){let best=Infinity,triangle=null;const pending=[root];while(pending.length){tick(visits++,signal);if(visits>budget)fail('Die unabhängige Oberflächenprüfung überschreitet ihr begrenztes Arbeitsbudget. Ein kleineres Netz oder weniger Durchläufe wählen.','MESH_REMESH_LIMIT');const n=pending.pop();if(boxDistance(p,n.box)>best)continue;if(n.items){for(const t of n.items){const d=distance2(p,...t.p);if(d<best){best=d;triangle=t.p;}}}else{const l=boxDistance(p,n.left.box),r=boxDistance(p,n.right.box);if(l<r)pending.push(n.right,n.left);else pending.push(n.left,n.right);}}return {distance:Math.sqrt(Math.max(0,best)),triangle};}
 const nearest=p=>closest(p).distance;
 function samples(){const result=[],count=Math.min(triangles.length,Math.floor(4096/7));for(let i=0;i<count;i++){tick(i,signal);const p=triangles[Math.floor(i*triangles.length/count)].p;result.push(...p,mean(p),mean([p[0],p[1]]),mean([p[1],p[2]]),mean([p[2],p[0]]));}return result;}
 return {nearest,closest,samples};
}
export function sampledDeviation(beforeFaces,beforePoints,afterFaces,afterPoints,signal){const before=surfaceIndex(beforeFaces,beforePoints,signal),after=surfaceIndex(afterFaces,afterPoints,signal),a=before.samples(),b=after.samples();let forwardMax=0,reverseMax=0,squares=0;for(let i=0;i<a.length;i++){tick(i,signal);const d=after.nearest(a[i]);forwardMax=Math.max(forwardMax,d);squares+=d*d;}for(let i=0;i<b.length;i++){tick(i,signal);const d=before.nearest(b[i]);reverseMax=Math.max(reverseMax,d);squares+=d*d;}return {method:'deterministic-vertices-edges-centroids',sampleCountBefore:a.length,sampleCountAfter:b.length,forwardMax,reverseMax,maximum:Math.max(forwardMax,reverseMax),rms:Math.sqrt(squares/(a.length+b.length)),approximate:true};}
