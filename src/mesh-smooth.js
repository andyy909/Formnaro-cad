import {buildMeshSelectionTopology} from './mesh-selection-data.js';
import {inspectMeshTopology} from './mesh-inspector.js';
import {sharedSimplexSeparates} from './mesh-contact-predicates.js';

export const MESH_SMOOTH_LIMIT=30000;
export const MESH_SMOOTH_VERTEX_LIMIT=120000;
const PAIR_LIMIT=1000000;
const fail=(message,code='MESH_SMOOTH')=>{throw Object.assign(Error(message),{code});};
const abort=signal=>{if(signal?.aborted)throw Object.assign(Error('Glätten abgebrochen.'),{name:'AbortError'});};
const tick=(i,signal)=>{if(!(i%256))abort(signal);};
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=v=>Math.hypot(...v);
const mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);
const mean=ps=>[0,1,2].map(k=>ps.reduce((s,p)=>s+p[k],0)/ps.length);
const bounds=ps=>{const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const p of ps)if(p)for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}return {min,max};};
const expand=(b,d)=>({min:b.min.map(v=>v-d),max:b.max.map(v=>v+d)});
const overlap=(a,b)=>a.min.every((v,k)=>v<=b.max[k]&&a.max[k]>=b.min[k]);
function placement(m){
 if(!Array.isArray(m)||m.length!==16||m.some(v=>typeof v!=='number'||!Number.isFinite(v))||m[3]!==0||m[7]!==0||m[11]!==0||m[15]!==1)fail('Eine gültige affine Objektlage wird benötigt.');
 const a=m[0],b=m[4],c=m[8],d=m[1],e=m[5],f=m[9],g=m[2],h=m[6],i=m[10],det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);
 if(!det||!Number.isFinite(det))fail('Die Objektlage ist nicht sicher invertierbar.');
 const inverse=[(e*i-f*h)/det,(c*h-b*i)/det,(b*f-c*e)/det,(f*g-d*i)/det,(a*i-c*g)/det,(c*d-a*f)/det,(d*h-e*g)/det,(b*g-a*h)/det,(a*e-b*d)/det];if(inverse.some(v=>!Number.isFinite(v)))fail('Die Objektlage ist nicht sicher invertierbar.');
 return {world:p=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]),local:p=>{const q=p.map((v,k)=>v-m[k+12]);return [0,1,2].map(k=>dot(inverse.slice(k*3,k*3+3),q));}};
}
export function validateMeshSmoothOptions(o){
 const allowed=['method','geometryDigest','triangleIds','strength','iterations','maxDeviation','featureAngle'];
 if(!o||Object.getPrototypeOf(o)!==Object.prototype||Object.keys(o).some(k=>!allowed.includes(k))||o.method!=='bounded-laplacian-v1'||!(/^[a-f0-9]{64}$/).test(o.geometryDigest??'')||!Array.isArray(o.triangleIds)||!o.triangleIds.length||o.triangleIds.length>MESH_SMOOTH_LIMIT||new Set(o.triangleIds).size!==o.triangleIds.length||o.triangleIds.some(v=>!Number.isSafeInteger(v)||v<0||v>=MESH_SMOOTH_LIMIT)||typeof o.strength!=='number'||!Number.isFinite(o.strength)||o.strength<0||o.strength>1||!Number.isSafeInteger(o.iterations)||o.iterations<1||o.iterations>30||typeof o.maxDeviation!=='number'||!Number.isFinite(o.maxDeviation)||o.maxDeviation<=0||o.maxDeviation>1e6||typeof o.featureAngle!=='number'||!Number.isFinite(o.featureAngle)||o.featureAngle<0||o.featureAngle>180)fail('Ungültige Glättungsoptionen. Flächen auswählen, Stärke 0 bis 1, 1 bis 30 Durchläufe, positive Formgrenze bis 1.000.000 mm und Kantenwinkel 0 bis 180 Grad wählen.');
 return {...o,triangleIds:[...o.triangleIds].sort((a,b)=>a-b)};
}

function segmentDistance2(p,a,b){const d=sub(b,a),q=sub(p,a),s=dot(d,d),t=s?Math.max(0,Math.min(1,dot(q,d)/s)):0,r=q.map((v,k)=>v-t*d[k]);return dot(r,r);}
function pointTriangleDistance2(p,a,b,c){const ab=sub(b,a),ac=sub(c,a),n=cross(ab,ac),l=norm(n);if(!l)return Math.min(segmentDistance2(p,a,b),segmentDistance2(p,b,c),segmentDistance2(p,c,a));const unit=n.map(v=>v/l);if([[a,b],[b,c],[c,a]].every(([x,y])=>dot(cross(sub(y,x),sub(p,x)),unit)>=0)){const d=dot(sub(p,a),unit);return d*d;}return Math.min(segmentDistance2(p,a,b),segmentDistance2(p,b,c),segmentDistance2(p,c,a));}
function segmentSegmentDistance2(p1,q1,p2,q2){
 const d1=sub(q1,p1),d2=sub(q2,p2),r=sub(p1,p2),a=dot(d1,d1),e=dot(d2,d2),f=dot(d2,r);let s=0,t=0;
 if(!a&&!e)return dot(r,r);if(!a)t=Math.max(0,Math.min(1,f/e));else{const c=dot(d1,r);if(!e)s=Math.max(0,Math.min(1,-c/a));else{const b=dot(d1,d2),den=a*e-b*b;s=den>0?Math.max(0,Math.min(1,(b*f-c*e)/den)):0;t=(b*s+f)/e;if(t<0){t=0;s=Math.max(0,Math.min(1,-c/a));}else if(t>1){t=1;s=Math.max(0,Math.min(1,(b-c)/a));}}}const d=r.map((v,k)=>v+s*d1[k]-t*d2[k]);return dot(d,d);
}
function segmentTriangleHits(a,b,t,epsilon){
 const n=cross(sub(t[1],t[0]),sub(t[2],t[0])),len=norm(n),unit=n.map(v=>v/len),da=dot(sub(a,t[0]),unit),db=dot(sub(b,t[0]),unit),hits=[];
 if(da>epsilon&&db>epsilon||da< -epsilon&&db< -epsilon)return hits;
 const inside=p=>t.every((v,k)=>dot(cross(sub(t[(k+1)%3],v),sub(p,v)),unit)>=-epsilon*norm(sub(t[(k+1)%3],v)));
 if(Math.abs(da)<=epsilon&&Math.abs(db)<=epsilon){
  if(inside(a))hits.push(a);if(inside(b))hits.push(b);const axis=unit.map(Math.abs).indexOf(Math.max(...unit.map(Math.abs))),axes=[0,1,2].filter(k=>k!==axis),p=axes.map(k=>a[k]),q=axes.map(k=>b[k]),d=sub(q,p);
  for(let k=0;k<3;k++){const c=axes.map(j=>t[k][j]),f=axes.map(j=>t[(k+1)%3][j]),e=sub(f,c),den=d[0]*e[1]-d[1]*e[0];if(Math.abs(den)>Number.EPSILON*norm(d)*norm(e)*32){const cp=sub(c,p),s=(cp[0]*e[1]-cp[1]*e[0])/den,u=(cp[0]*d[1]-cp[1]*d[0])/den;if(s>=0&&s<=1&&u>=0&&u<=1)hits.push(mix(a,b,s));}}
 }else if(da*db<=0){const s=da/(da-db),p=mix(a,b,s);if(inside(p))hits.push(p);}else{if(Math.abs(da)<=epsilon&&inside(a))hits.push(a);if(Math.abs(db)<=epsilon&&inside(b))hits.push(b);}
 return hits;
}
function pairGeometry(a,b,shared,epsilon){
 // A shared edge whose opposite vertices lie strictly on opposite sides in
 // any coordinate projection cannot have overlapping triangle interiors.
 // The determinant error bound accepts only proven signs; ambiguous cases
 // continue through the full intersection audit below. This avoids inventing
 // intersection points through rounded line/plane arithmetic on affine grids.
 if(sharedSimplexSeparates(a,b,shared))return {distance:0,forbidden:false};
 // Contact at an actual shared point/edge needs only arithmetic tolerance.
 // A broad world-position tolerance must never exempt a positive overlap of
 // a thin adjacent face. Ambiguous thin faces are separately refused below.
 const magnitude=Math.max(1,...a.flat().map(Math.abs),...b.flat().map(Math.abs)),scale=Math.max(...a.map(p=>norm(sub(p,a[0]))),...b.map(p=>norm(sub(p,a[0])))),contactTolerance=Math.min(epsilon,Number.EPSILON*Math.max(magnitude*4,scale*256));
 let minimum=Infinity;const hits=[];for(let k=0;k<3;k++){hits.push(...segmentTriangleHits(a[k],a[(k+1)%3],b,contactTolerance),...segmentTriangleHits(b[k],b[(k+1)%3],a,contactTolerance));minimum=Math.min(minimum,pointTriangleDistance2(a[k],...b),pointTriangleDistance2(b[k],...a));for(let j=0;j<3;j++)minimum=Math.min(minimum,segmentSegmentDistance2(a[k],a[(k+1)%3],b[j],b[(j+1)%3]));}
 const forbidden=hits.some(p=>shared.length===0||shared.length===1?shared.length===0||norm(sub(p,shared[0]))>contactTolerance:segmentDistance2(p,shared[0],shared[1])>contactTolerance**2);
 return {distance:Math.sqrt(Math.max(0,hits.length&&!shared.length?0:minimum)),forbidden};
}
function indexTriangles(ids,positions,signal){
 let steps=0;const items=ids.map((vertices,id)=>{tick(id,signal);const p=vertices.map(v=>positions[v]);return {id,vertices,p,box:bounds(p),center:mean(p)};});
 function tree(list){tick(steps++,signal);const box={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};for(const item of list)for(let k=0;k<3;k++){box.min[k]=Math.min(box.min[k],item.box.min[k]);box.max[k]=Math.max(box.max[k],item.box.max[k]);}if(list.length<=12)return {box,list};const ranges=box.max.map((v,k)=>v-box.min[k]),axis=ranges.indexOf(Math.max(...ranges));list.sort((a,b)=>a.center[axis]-b.center[axis]||a.id-b.id);const middle=Math.floor(list.length/2);return {box,a:tree(list.slice(0,middle)),b:tree(list.slice(middle))};}
 const root=tree([...items]);return {items,query(box,visit){const stack=[root];while(stack.length){tick(steps++,signal);const n=stack.pop();if(!overlap(box,n.box))continue;if(n.list){for(const item of n.list)if(overlap(box,item.box))visit(item);}else stack.push(n.a,n.b);}}};
}
function signedVolume(ids,positions,origin){let v=0;for(const f of ids){const [a,b,c]=f.map(i=>sub(positions[i],origin));v+=dot(a,cross(b,c))/6;}return v;}
function triangleNormal(ids,positions){const p=ids.map(v=>positions[v]);return cross(sub(p[1],p[0]),sub(p[2],p[0]));}
function minimumQuadratic(a,b,c){let value=Math.min(a,a+b+c);if(c>0){const t=-b/(2*c);if(t>0&&t<1)value=Math.min(value,a+b*t+c*t*t);}return value;}

// Static audit for topology-changing tools. Actual shared simplices, rather
// than merely adjacent face IDs, determine which contact is legitimate.
export function auditMeshIntersections(ids,positions,{signal,pairLimit=PAIR_LIMIT,collect=false}={}){
 const box=bounds(positions),extent=norm(sub(box.max,box.min)),epsilon=Math.max(1,extent,...box.min.map(Math.abs),...box.max.map(Math.abs))*Number.EPSILON*512;
 const index=indexTriangles(ids,positions,signal);let checks=0;const pairs=[];
 for(const a of index.items){
  tick(a.id,signal);const longest=Math.max(...a.p.map((p,k)=>norm(sub(p,a.p[(k+1)%3])))),altitude=norm(cross(sub(a.p[1],a.p[0]),sub(a.p[2],a.p[0])))/longest;
  if(!Number.isFinite(altitude)||altitude<=epsilon*32)fail('Sehr dünne Flächen sind numerisch nicht eindeutig prüfbar.','MESH_REMESH_NUMERIC');
  index.query(expand(a.box,epsilon),b=>{if(b.id<=a.id)return;if(++checks>pairLimit)fail('Die Schnittprüfung überschreitet das Arbeitsbudget. Ein kleineres Netz verwenden.','MESH_REMESH_LIMIT');tick(checks,signal);const shared=a.vertices.filter(v=>b.vertices.includes(v)).map(v=>positions[v]),r=pairGeometry(a.p,b.p,shared,epsilon);if(r.forbidden||!shared.length&&r.distance<=epsilon){if(!collect)fail('Das Netz enthält überlappende oder sich schneidende Flächen. Zuerst gezielt reparieren.','MESH_REMESH_INTERSECTION');if(pairs.length>=1000)fail('Mehr als 1.000 Schnittpaare. Für eine vollständige Diagnose einen kleineren Bestandteil verwenden.','MESH_REMESH_LIMIT');pairs.push([a.id,b.id]);}});
 }
 return {checks,pairLimit,method:'shared-simplex-triangle-intersections',...(collect?{pairs,triangleIds:[...new Set(pairs.flat())].sort((a,b)=>a-b),complete:true}:{})};
}

/** Same-connectivity local smoothing with immutable selection/mask borders.
 * Each nonincident triangle pair has a conservative swept-clearance guard:
 * total step displacement stays strictly below their current exact separation.
 * Shared-simplex pairs additionally undergo explicit triangle intersection
 * checks; swept face orientation is checked over the entire linear step.
 */
export function smoothSelectedMesh(node,options,{signal}={}){
 return deformSelectedMesh(node,options,{signal});
}

// The same bounded deformation guard also protects brush strokes. Callbacks
// are local implementation functions, never serialized project/API data.
export function deformSelectedMesh(node,options,{signal,deformation=null}={}){
 const o=validateMeshSmoothOptions(options),mesh=node?.mesh;abort(signal);if(mesh?.triangles?.length/3>MESH_SMOOTH_LIMIT||mesh?.verts?.length/3>MESH_SMOOTH_VERTEX_LIMIT)fail('Glätten unterstützt bis zu 30.000 Dreiecke und 120.000 Punkte je Netz. Einen kleineren Netzbereich als eigenes Teil verwenden.','MESH_SMOOTH_LIMIT');
 const topology=buildMeshSelectionTopology(mesh,{signal}),inspection=inspectMeshTopology(topology,{smallTriangleLimit:0,signal});if(['duplicate','degenerate','orientation','nonmanifoldEdge','nonmanifoldVertex'].some(k=>inspection.categories[k].count))fail('Das Netz enthält mehrdeutige, entartete oder falsch verbundene Flächen. Vor dem Glätten gezielt reparieren.');
 if(o.geometryDigest!==topology.geometryDigest)fail('Die Netzgeometrie wurde geändert. Flächen zum Glätten erneut auswählen.','MESH_SMOOTH_STALE');if(o.triangleIds.some(v=>v>=topology.triangles))fail('Die Flächenauswahl ist veraltet.');
 const transform=placement(node.transform),ids=Array.from({length:topology.triangles},(_,i)=>mesh.triangles.slice(i*3,i*3+3).map(v=>topology.representatives[v])),selected=new Set(o.triangleIds),regions=node.metadata?.meshProtection?.regions??[],protectedFaces=new Set();
 for(const r of regions){if(r.geometryDigest!==topology.geometryDigest||!Array.isArray(r.triangleIds)||r.triangleIds.some(v=>!Number.isSafeInteger(v)||v<0||v>=topology.triangles))fail('Ein Schutzbereich gehört nicht mehr zur aktuellen Geometrie.');r.triangleIds.forEach(v=>protectedFaces.add(v));}
 const positions=new Array(topology.vertices),at=Array.from({length:topology.vertices},()=>new Set()),neighbors=Array.from({length:topology.vertices},()=>new Set()),pinned=new Set(),feature=new Set(),boundary=new Set();
 for(let v=0;v<topology.vertices;v++){tick(v,signal);if(topology.representatives[v]===v){positions[v]=transform.world(mesh.verts.slice(v*3,v*3+3));if(positions[v].some(x=>!Number.isFinite(x)))fail('Die Objektlage überschreitet den auswertbaren Zahlenbereich.');}}
 for(let f=0;f<ids.length;f++){tick(f,signal);for(const v of ids[f]){at[v].add(f);ids[f].forEach(w=>{if(v!==w)neighbors[v].add(w);});if(!selected.has(f)||protectedFaces.has(f))pinned.add(v);}}
 const original=structuredClone(positions),beforeBounds=bounds(positions),extent=norm(sub(beforeBounds.max,beforeBounds.min)),numeric=Math.max(1,extent,...beforeBounds.min.map(Math.abs),...beforeBounds.max.map(Math.abs))*Number.EPSILON*512,epsilon=Math.max(numeric,extent*1e-12),originalNormals=ids.map(f=>triangleNormal(f,positions));
 if(originalNormals.some(n=>!norm(n)||n.some(v=>!Number.isFinite(v))))fail('Eine Fläche ist in dieser Objektlage nicht eindeutig auswertbar.');
 const cosine=Math.cos(o.featureAngle*Math.PI/180);for(const e of topology.edges.values()){if(e.incidents.length===1)e.vertices.forEach(v=>{pinned.add(v);boundary.add(v);});else if(e.incidents.length===2){const [a,b]=e.incidents.map(i=>originalNormals[i.face]);if(dot(a,b)/(norm(a)*norm(b))<cosine-1e-12)e.vertices.forEach(v=>{pinned.add(v);feature.add(v);});}}
 const movable=[];for(let v=0;v<positions.length;v++)if(positions[v]&&at[v].size&&!pinned.has(v))movable.push(v);if(!movable.length||o.strength===0)fail('Keine beweglichen ausgewählten Punkte. Schutzflächen, nicht gewählte Flächen, Öffnungsränder und gewählte Formkanten bleiben fest.','MESH_SMOOTH_NO_CHANGE');
 const roughness=ps=>Math.sqrt(movable.reduce((sum,v)=>sum+norm(sub(ps[v],mean([...neighbors[v]].map(w=>ps[w]))))**2,0)/movable.length),roughnessBefore=roughness(positions);let pairChecks=0,clearanceChecks=0,intersectionChecks=0,collisionLimited=false,orientationLimited=false,iterationsCompleted=0;
 function checkedPair(a,b,ps){if(++pairChecks>PAIR_LIMIT)fail('Die geometrische Sicherheitsprüfung überschreitet ihr begrenztes Arbeitsbudget. Weniger Flächen oder Durchläufe wählen.','MESH_SMOOTH_LIMIT');tick(pairChecks,signal);const common=a.vertices.filter(v=>b.vertices.includes(v));return {shared:common.length,...pairGeometry(a.vertices.map(v=>ps[v]),b.vertices.map(v=>ps[v]),common.map(v=>ps[v]),epsilon)};}
 function intersectionAudit(ps){const index=indexTriangles(ids,ps,signal);for(const a of index.items){tick(a.id,signal);const longest=Math.max(...a.p.map((p,k)=>norm(sub(p,a.p[(k+1)%3])))),altitude=norm(cross(sub(a.p[1],a.p[0]),sub(a.p[2],a.p[0])))/longest;if(!Number.isFinite(altitude)||altitude<=epsilon*32)fail('Sehr dünne Flächen sind in dieser Objektlage numerisch nicht eindeutig prüfbar. Ein kleineres Netz nahe dem Ursprung verwenden.','MESH_SMOOTH_NUMERIC');index.query(expand(a.box,epsilon),b=>{if(b.id<=a.id)return;intersectionChecks++;const pair=checkedPair(a,b,ps);if(pair.forbidden||!pair.shared&&pair.distance<=epsilon)fail('Das Netz enthält überlappende oder sich schneidende Flächen. Diese Geometrie zuerst gezielt prüfen.','MESH_SMOOTH_INTERSECTION');});}return index;}
 let currentIndex=intersectionAudit(positions);
 for(let iteration=0;iteration<o.iterations;iteration++){
  abort(signal);const proposed=positions.slice(),stepLength=new Float64Array(positions.length);let maxStep=0;
  const brush=deformation?.prepare({positions,neighbors,ids,movable,iteration,signal});
  for(const v of movable){const center=mean([...neighbors[v]].map(w=>positions[w])),target=deformation?brush(v,center):mix(positions[v],center,o.strength*.5);if(!Array.isArray(target)||target.length!==3||target.some(x=>!Number.isFinite(x)))fail('Die Netzverformung lieferte ungültige Punkte.');const fromOriginal=sub(target,original[v]),distance=norm(fromOriginal);if(distance>o.maxDeviation)for(let k=0;k<3;k++)target[k]=original[v][k]+fromOriginal[k]*o.maxDeviation/distance;proposed[v]=target;stepLength[v]=norm(sub(target,positions[v]));maxStep=Math.max(maxStep,stepLength[v]);}
  if(maxStep<=numeric){if(deformation)continue;break;}
  const faceSteps=ids.map(f=>Math.max(...f.map(v=>stepLength[v])));let factor=1;
  for(const a of currentIndex.items){tick(a.id,signal);currentIndex.query(expand(a.box,faceSteps[a.id]+maxStep+epsilon),b=>{if(b.id<=a.id||!faceSteps[a.id]&&!faceSteps[b.id]||a.vertices.some(v=>b.vertices.includes(v)))return;clearanceChecks++;const pair=checkedPair(a,b,positions),total=faceSteps[a.id]+faceSteps[b.id];if(pair.distance<=epsilon)fail('Nicht benachbarte Flächen berühren sich numerisch. Glätten wäre nicht eindeutig sicher.','MESH_SMOOTH_INTERSECTION');factor=Math.min(factor,.35*Math.max(0,pair.distance-epsilon)/total);});}
  if(factor<1)collisionLimited=true;if(factor<1e-8)break;
  let accepted=null;
  for(let attempt=0;attempt<14;attempt++,factor*=.5){
   const candidate=positions.slice();for(const v of movable)candidate[v]=mix(positions[v],proposed[v],factor);let orientationOkay=true;
   for(let f=0;f<ids.length;f++){const [a,b,c]=ids[f],u=sub(positions[b],positions[a]),v=sub(positions[c],positions[a]),du=sub(sub(candidate[b],candidate[a]),u),dv=sub(sub(candidate[c],candidate[a]),v),n0=cross(u,v),n1=cross(du,v).map((x,k)=>x+cross(u,dv)[k]),n2=cross(du,dv),start=norm(n0);if(!start||minimumQuadratic(dot(n0,n0),dot(n1,n0),dot(n2,n0))<=start**2*1e-8||dot(triangleNormal(ids[f],candidate),originalNormals[f])<=norm(originalNormals[f])**2*1e-8){orientationOkay=false;break;}}
   if(!orientationOkay){orientationLimited=true;continue;}
   if(!deformation&&roughness(candidate)>roughness(positions)+numeric){orientationLimited=true;continue;}
   try{accepted={candidate,index:intersectionAudit(candidate)};break;}catch(error){if(error.code!=='MESH_SMOOTH_INTERSECTION')throw error;collisionLimited=true;}
  }
  if(!accepted)break;for(const v of movable)positions[v]=accepted.candidate[v];currentIndex=accepted.index;iterationsCompleted++;
 }
 let maxDisplacement=0,squared=0,movedVertices=0;for(const v of movable){const d=norm(sub(positions[v],original[v]));if(d>numeric){movedVertices++;squared+=d*d;maxDisplacement=Math.max(maxDisplacement,d);}}
 if(!movedVertices)fail('Die gewählten Punkte konnten innerhalb der Form- und Kollisionsgrenzen nicht sicher geglättet werden.','MESH_SMOOTH_NO_CHANGE');
 const verts=[...mesh.verts];for(let v=0;v<topology.vertices;v++){tick(v,signal);const representative=topology.representatives[v];if(pinned.has(representative)||!positions[representative]||norm(sub(positions[representative],original[representative]))<=numeric)continue;const p=transform.local(positions[representative]);if(p.some(x=>!Number.isFinite(x)))fail('Die geglätteten Punkte sind lokal nicht sicher darstellbar.');for(let k=0;k<3;k++)verts[v*3+k]=p[k];}
 const result={verts,triangles:[...mesh.triangles]},finalPositions=positions.slice();for(let v=0;v<topology.vertices;v++)if(topology.representatives[v]===v)finalPositions[v]=transform.world(verts.slice(v*3,v*3+3));
 // Independently recheck actual stored coordinates, not just ideal candidates.
 intersectionAudit(finalPositions);maxDisplacement=0;squared=0;movedVertices=0;for(const v of movable){const d=norm(sub(finalPositions[v],original[v]));if(d>numeric){movedVertices++;squared+=d*d;}maxDisplacement=Math.max(maxDisplacement,d);}if(!movedVertices)fail('Die berechnete Glättung ist in den gespeicherten Punkten nicht sicher darstellbar.','MESH_SMOOTH_NO_CHANGE');if(maxDisplacement>o.maxDeviation+numeric)fail('Die tatsächliche Formänderung überschreitet die gewählte Grenze.');
 for(let f=0;f<ids.length;f++){tick(f,signal);if(dot(triangleNormal(ids[f],finalPositions),originalNormals[f])<=norm(originalNormals[f])**2*1e-8)fail('Die tatsächlich gespeicherte Glättung würde eine Fläche umkehren oder numerisch entarten.');}
 if(!deformation&&roughness(finalPositions)>roughnessBefore+numeric)fail('Die tatsächlich gespeicherte Glättung würde die gewählte Oberflächenrauheit erhöhen.');
 const afterTopology=buildMeshSelectionTopology(result,{signal}),after=inspectMeshTopology(afterTopology,{smallTriangleLimit:0,signal});if(after.componentCount!==inspection.componentCount||['duplicate','degenerate','orientation','nonmanifoldEdge','nonmanifoldVertex'].some(k=>after.categories[k].count))fail('Die geglättete Geometrie verletzt den ursprünglichen Topologievertrag.');
 for(let f=0;f<ids.length;f++)if(!selected.has(f)||protectedFaces.has(f))for(const v of mesh.triangles.slice(f*3,f*3+3))for(let k=0;k<3;k++)if(verts[v*3+k]!==mesh.verts[v*3+k])fail('Eine Schutzfläche oder nicht ausgewählte Fläche würde verändert.');
 const afterBounds=bounds(finalPositions),boundsDifference=Math.max(...beforeBounds.min.map((v,k)=>Math.abs(v-afterBounds.min[k])),...beforeBounds.max.map((v,k)=>Math.abs(v-afterBounds.max[k]))),closed=topology.diagnostics.boundaryCount===0,origin=beforeBounds.min,volumeBefore=closed?Math.abs(signedVolume(ids,original,origin)):null,volumeAfter=closed?Math.abs(signedVolume(ids,finalPositions,origin)):null,protection=regions.length?{format:'FormnaroMeshProtection',version:1,regions:regions.map(r=>({...structuredClone(r),geometryDigest:afterTopology.geometryDigest}))}:null;
 abort(signal);return {mesh:result,protection,report:{method:o.method,beforeTriangles:topology.triangles,afterTriangles:topology.triangles,selectedTriangles:selected.size,protectedTriangles:protectedFaces.size,pinnedVertices:pinned.size,movableVertices:movable.length,movedVertices,maxDisplacement,rmsDisplacement:Math.sqrt(squared/Math.max(1,movedVertices)),maximumSurfaceDeviationBound:maxDisplacement,numericalAllowance:numeric,roughnessBefore,roughnessAfter:roughness(finalPositions),boundsBefore:beforeBounds,boundsAfter:afterBounds,boundsDifference,volumeBefore,volumeAfter,volumeDifference:closed?volumeAfter-volumeBefore:null,volumePercentChange:closed&&volumeBefore?(volumeAfter-volumeBefore)/volumeBefore*100:null,iterationsRequested:o.iterations,iterationsCompleted,collisionLimited,orientationLimited,featureVertices:feature.size,boundaryVertices:boundary.size,protectedGeometryExact:true,unselectedGeometryExact:true,connectivityUnchanged:true,componentCount:after.componentCount,boundaryEdges:afterTopology.diagnostics.boundaryCount,coordinatesMoved:true,safety:{method:'swept-clearance-and-triangle-intersections',pairChecks,clearanceChecks,intersectionChecks,pairLimit:PAIR_LIMIT,nonincidentSweptClearance:true,linearStepOrientation:true,adjacentIntersectionsChecked:true,globalRepairProven:false}}};
}
