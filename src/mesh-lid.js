import {Matrix4,Matrix3,Vector3} from 'three';
import {projectObjectGeometryDigest,meshTopologyClass} from './project-objects.js';
import {cadGeometryDigest} from './cad-geometry-digest.js';

// This bounded construction reads surfaces, including open STL shells. It never
// repairs them or interprets their unverified volume as a material solid.
export const MESH_LID_LIMIT=100000;
const fail=(message,code='MESH_LID_INVALID')=>{throw Object.assign(Error(message),{code});};
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),sub=(a,b)=>a.map((v,k)=>v-b[k]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>{const l=Math.hypot(...a);if(l<1e-12)fail('Eine eindeutige Öffnungsrichtung wählen.');return a.map(v=>v/l);};
const area=p=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0)/2;
const positive=p=>area(p)<0?[...p].reverse():p;
const distance=(a,b)=>Math.hypot(...sub(a,b));
function contains(p,q){let inside=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>q[1])!==(b[1]>q[1])&&q[0]<(b[0]-a[0])*(q[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function finiteVector(p){return Array.isArray(p)&&p.length===3&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=1e6)&&Math.hypot(...p)>1e-12;}
export function validateMeshLidOptions(o){
 const allowed=['geometryDigest','candidateId','normal','thickness','lipHeight','lipWall','clearance','holeDiameter'];
 if(!o||Object.getPrototypeOf(o)!==Object.prototype||Object.keys(o).some(k=>!allowed.includes(k))||!/^([a-f0-9]{64})$/.test(o.geometryDigest??'')||!/^lid-[a-f0-9]{24}$/.test(o.candidateId??'')||!finiteVector(o.normal))fail('Deckel benötigt die aktuelle Analysekennung und eine gemessene Öffnungsrichtung.');
 const out={...o,normal:unit(o.normal),thickness:o.thickness??2.5,lipHeight:o.lipHeight??1.6,lipWall:o.lipWall??1.2,clearance:o.clearance??.25,holeDiameter:o.holeDiameter??4.5};
 for(const [key,min,max]of [['thickness',.6,20],['lipHeight',.3,20],['lipWall',.6,10],['clearance',.05,2],['holeDiameter',.5,30]])if(typeof out[key]!=='number'||!Number.isFinite(out[key])||out[key]<min||out[key]>max)fail('Deckel: '+key+' liegt außerhalb des zulässigen Bereichs.');
 return out;
}
function source(node){
 const mesh=node?.mesh;if(node?.kind!=='mesh'||node.meshRole==='hole'||!mesh?.triangles?.length||mesh.triangles.length/3>MESH_LID_LIMIT||mesh.verts.length/3>400000)fail('Ein Material-Netz mit höchstens 100.000 Dreiecken auswählen.','MESH_LID_LIMIT');
 const matrix=new Matrix4().fromArray(node.transform);
 if(!matrix.elements.every(Number.isFinite)||Math.abs(matrix.determinant())<1e-12)fail('Die Objektlage ist nicht sicher auswertbar.');
 const points=[];let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<mesh.verts.length;i+=3){const p=new Vector3(...mesh.verts.slice(i,i+3)).applyMatrix4(matrix).toArray();if(p.some(v=>!Number.isFinite(v)||Math.abs(v)>1e6))fail('Die Quelle liegt außerhalb des unterstützten Arbeitsbereichs.');points.push(p);}
 for(const index of mesh.triangles){if(!Number.isInteger(index)||!points[index])fail('Ungültiges Quelldreieck.');points[index].forEach((v,k)=>{min[k]=Math.min(min[k],v);max[k]=Math.max(max[k],v);});}
 const extent=Math.max(...sub(max,min));if(extent<1||extent>10000)fail('Die Quelle muss zwischen 1 und 10.000 mm groß sein.');
 return {points,indices:mesh.triangles,matrix,anchor:min.map((v,k)=>(v+max[k])/2),extent,geometryDigest:projectObjectGeometryDigest(node)};
}
function frame(s,normal){
 const n=unit(normal),u=unit(cross(Math.abs(n[2])<.9?[0,0,1]:[0,1,0],n)),v=cross(n,u);
 const points=s.points.map(p=>{const q=sub(p,s.anchor);return [dot(q,u),dot(q,v),dot(q,n)];});
 let hi=-Infinity,lo=Infinity;for(const id of s.indices){hi=Math.max(hi,points[id][2]);lo=Math.min(lo,points[id][2]);}
 const world=p=>s.anchor.map((a,k)=>a+u[k]*p[0]+v[k]*p[1]+n[k]*p[2]);
 return {...s,points,n,u,v,hi,lo,world,epsilon:Math.max(1e-7,s.extent*1e-8)};
}
function simplify(p,eps){
 let out=p;for(let pass=0;pass<3;pass++){const next=out.filter((b,i)=>{const a=out[(i+out.length-1)%out.length],c=out[(i+1)%out.length],ab=sub(b,a),ac=sub(c,a);return Math.abs(ab[0]*ac[1]-ab[1]*ac[0])>eps*Math.hypot(...ac)||dot(ab,sub(b,c))>0;});if(next.length<3||next.length===out.length)break;out=next;}return out;
}
// Slice the original triangles, weld only numerically coincident endpoints and
// require unambiguous closed cycles. A branching or interrupted cut is rejected.
function section(f,plane){
 const points=[],neighbors=[],grid=new Map(),edges=new Set(),e=f.epsilon*4;
 function vertex(p){const cell=p.map(v=>Math.floor(v/e));for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(const id of grid.get((cell[0]+x)+','+(cell[1]+y))??[])if(distance(points[id],p)<=e)return id;
  const id=points.length,key=cell.join(',');points.push(p);neighbors.push([]);const a=grid.get(key)??[];a.push(id);grid.set(key,a);return id;}
 // Shift away from common Float32 vertex planes without changing the bounded
 // search interval in any physically meaningful way.
 plane+=f.epsilon*2.231;
 for(let i=0;i<f.indices.length;i+=3){const p=f.indices.slice(i,i+3).map(id=>f.points[id]),d=p.map(q=>q[2]-plane),hits=[];
  for(let k=0;k<3;k++){const j=(k+1)%3;if((d[k]<0)!==(d[j]<0)){const t=d[k]/(d[k]-d[j]);hits.push([p[k][0]+(p[j][0]-p[k][0])*t,p[k][1]+(p[j][1]-p[k][1])*t]);}}
  if(hits.length!==2||distance(...hits)<=e)continue;
  const a=vertex(hits[0]),b=vertex(hits[1]);if(a===b)continue;const key=a<b?a+','+b:b+','+a;if(edges.has(key))continue;edges.add(key);neighbors[a].push(b);neighbors[b].push(a);
 }
 if(points.length>6000)fail('Der Öffnungsrand ist für diese Analyse zu komplex.','MESH_LID_LIMIT');
 if(!points.length||neighbors.some(n=>n.length!==2))fail('Dieser Querschnitt hat keinen eindeutigen geschlossenen Rand.','MESH_LID_SECTION');
 const seen=new Set(),loops=[];
 for(let start=0;start<points.length;start++){if(seen.has(start))continue;let prev=-1,id=start,p=[];do{if(seen.has(id))fail('Der Rand verzweigt sich.','MESH_LID_SECTION');seen.add(id);p.push(points[id]);const next=neighbors[id].find(v=>v!==prev);prev=id;id=next;}while(id!==start);
  p=simplify(p,e);if(p.length>=3&&Math.abs(area(p))>e*e*16)loops.push(positive(p));}
 if(loops.length>32)fail('Zu viele getrennte Konturen in der Öffnung.','MESH_LID_LIMIT');
 return loops.sort((a,b)=>area(b)-area(a));
}
function solve3(a,b){
 a=a.map((r,i)=>[...r,b[i]]);for(let i=0;i<3;i++){let pivot=i;for(let j=i+1;j<3;j++)if(Math.abs(a[j][i])>Math.abs(a[pivot][i]))pivot=j;[a[i],a[pivot]]=[a[pivot],a[i]];const d=a[i][i];if(Math.abs(d)<1e-10)return null;for(let k=i;k<4;k++)a[i][k]/=d;for(let j=0;j<3;j++)if(j!==i){const m=a[j][i];for(let k=i;k<4;k++)a[j][k]-=m*a[i][k];}}
 return a.map(r=>r[3]);
}
function circle(p,{maxRadius=15}={}){
 if(p.length<12)return null;const mean=p.reduce((s,q)=>s.map((v,k)=>v+q[k]/p.length),[0,0]),a=[[0,0,0],[0,0,0],[0,0,0]],b=[0,0,0];
 for(const q of p){const [x,y]=sub(q,mean),r=[2*x,2*y,1],z=x*x+y*y;for(let i=0;i<3;i++){b[i]+=r[i]*z;for(let j=0;j<3;j++)a[i][j]+=r[i]*r[j];}}
 const fit=solve3(a,b);if(!fit)return null;const center=[fit[0]+mean[0],fit[1]+mean[1]],radius=Math.sqrt(fit[2]+fit[0]**2+fit[1]**2),error=Math.max(...p.map(q=>Math.abs(distance(q,center)-radius)));
 if(!Number.isFinite(radius)||radius<.25||radius>maxRadius||error>Math.max(.01,radius*.02)||area(p)/(Math.PI*radius*radius)<.96)return null;
 return {center,diameter:radius*2,fitError:error};
}
function simpleContours(loops,eps){
 const edges=loops.flatMap((p,loop)=>p.map((a,i)=>({a,b:p[(i+1)%p.length],loop,index:i,count:p.length})));
 if(edges.length>2000)fail('Zu viele Randsegmente für eine eindeutige Öffnungsprüfung.','MESH_LID_LIMIT');
 const turn=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){
  const a=edges[i],b=edges[j];if(a.loop===b.loop&&(Math.abs(a.index-b.index)===1||Math.abs(a.index-b.index)===a.count-1))continue;
  if([0,1].some(k=>Math.max(a.a[k],a.b[k])+eps<Math.min(b.a[k],b.b[k])||Math.max(b.a[k],b.b[k])+eps<Math.min(a.a[k],a.b[k])))continue;
  const t=[turn(a.a,a.b,b.a),turn(a.a,a.b,b.b),turn(b.a,b.b,a.a),turn(b.a,b.b,a.b)],tol=eps*Math.max(distance(a.a,a.b),distance(b.a,b.b));
  if(t[0]*t[1]<=tol*tol&&t[2]*t[3]<=tol*tol)return false;
 }
 return true;
}
function findCandidate(f){
 const offsets=[f.epsilon*20,.01,.025,.05,.1,.125,.2,.35,.5,.75,1].filter(v=>v<Math.min(1.01,(f.hi-f.lo)*.1));
 for(const inset of offsets){let loops;try{loops=section(f,f.hi-inset);}catch(error){if(error.code==='MESH_LID_SECTION')continue;throw error;}
  if(loops.length<2)continue;const [outer,inner]=loops,ratio=area(inner)/area(outer);
  if(ratio<.35||ratio>.98||!inner.every(p=>contains(outer,p))||loops.slice(2).some(p=>area(p)>area(inner)*.12)||!simpleContours(loops,f.epsilon*8))continue;
  const holes=loops.slice(2).map(circle).filter(h=>h&&contains(outer,h.center)&&!contains(inner,h.center));
  if(holes.length>8)continue;
  const id='lid-'+cadGeometryDigest(JSON.stringify({geometry:f.geometryDigest,normal:f.n.map(v=>+v.toFixed(10)),inset})).slice(0,24);
  return {id,normal:f.n,plane:f.hi,inset,outer,inner,holes,area:area(inner),f};
 }
 return null;
}
function summary(c){
 const min=[0,1].map(k=>Math.min(...c.outer.map(p=>p[k]))),max=[0,1].map(k=>Math.max(...c.outer.map(p=>p[k])));
 return {candidateId:c.id,normal:c.normal,planePoint:c.f.world([0,0,c.plane]),nominalPlanePoint:c.f.world([0,0,c.plane]),measurementPlanePoint:c.f.world([0,0,c.plane-c.inset+c.f.epsilon*2.231]),sectionShift:c.f.epsilon*2.231,size:max.map((v,k)=>v-min[k]),apertureArea:c.area,referenceInset:c.inset,fasteners:c.holes.map(h=>({center:c.f.world([...h.center,c.plane]),measurementCenter:c.f.world([...h.center,c.plane-c.inset+c.f.epsilon*2.231]),sourceBoreDiameter:h.diameter,fitError:h.fitError})),scope:'Planar cap candidate from closed source sections. Screw threads and physical print fit are not verified.'};
}
export function analyzeMeshLids(node,{normal}={}){
 const s=source(node),normals=normal?[unit(normal)]:[0,1,2].flatMap(axis=>[-1,1].map(sign=>new Vector3(...[0,1,2].map(k=>k===axis?sign:0)).applyMatrix3(new Matrix3().getNormalMatrix(s.matrix)).normalize().toArray()));
 const candidates=[];for(const n of normals){const c=findCandidate(frame(s,n));if(c)candidates.push(summary(c));}
 return {version:1,geometryDigest:s.geometryDigest,candidates,units:'mm',sourcePreserved:true,limitations:'Bounded planar openings near the six transformed source axes. No automatic repair, thread detection, seal or physical fit guarantee.'};
}
function clip(poly,z,keepAbove){
 const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=a[2]-z,db=b[2]-z,inside=keepAbove?da>=0:da<=0,next=keepAbove?db>=0:db<=0;if(inside)out.push(a);if(inside!==next){const t=da/(da-db);out.push(a.map((v,k)=>v+(b[k]-v)*t));}}return out;
}
// The union of projected clipped SOURCE TRIANGLES covers every source surface
// throughout the insertion slab, including surfaces between sampled sections.
// Near-degenerate projected segments get an explicit conservative thin strip.
function obstructionPolygons(f,low,high){
 const out=[],e=f.epsilon*8;
 for(let i=0;i<f.indices.length;i+=3){let p=f.indices.slice(i,i+3).map(id=>f.points[id]);if(Math.max(...p.map(q=>q[2]))<low||Math.min(...p.map(q=>q[2]))>high)continue;p=clip(clip(p,low,true),high,false);if(p.length<2)continue;
  const q=p.map(v=>v.slice(0,2));if(Math.abs(area(q))>e*e)out.push(positive(q));else{let a=q[0],b=q[0];for(const x of q)for(const y of q)if(distance(x,y)>distance(a,b)){a=x;b=y;}const len=distance(a,b);if(len<=e)out.push([[a[0]-e,a[1]-e],[a[0]+e,a[1]-e],[a[0]+e,a[1]+e],[a[0]-e,a[1]+e]]);else{const d=sub(b,a),n=[-d[1]/len*e,d[0]/len*e];out.push(positive([a.map((v,k)=>v+n[k]),b.map((v,k)=>v+n[k]),b.map((v,k)=>v-n[k]),a.map((v,k)=>v-n[k])]));}}
 }
 if(out.length>30000)fail('Zu viele Flächen im Einsteckbereich.','MESH_LID_LIMIT');return out;
}
export function createMeshLid(node,options,{kernel}={}){
 const o=validateMeshLidOptions(options),s=source(node);if(s.geometryDigest!==o.geometryDigest)fail('Das Gehäuse oder seine Lage wurde geändert. Öffnung erneut analysieren.','MESH_LID_STALE');
 const f=frame(s,o.normal),c=findCandidate(f);if(!c||c.id!==o.candidateId)fail('Die gemessene Öffnung ist nicht mehr eindeutig vorhanden.','MESH_LID_STALE');
 if(o.lipHeight>Math.min(20,(f.hi-f.lo)*.5))fail('Der Führungsrand ist für dieses Gehäuse zu tief.');
 if(!kernel?.CrossSection)fail('Der lokale Geometriekern fehlt.');
 const owned=[],own=v=>(owned.push(v),v),CS=p=>own(new kernel.CrossSection(p,'NonZero'));
 try{
  const numericMargin=Math.max(.0001,f.extent*1e-7);
  const outer=CS([positive(c.outer)]),cavity=CS([positive(c.inner)]),shadow=CS(obstructionPolygons(f,c.plane-o.lipHeight-numericMargin*2,c.plane+numericMargin*2));
  const innerInset=own(cavity.offset(-o.clearance-numericMargin*4,'Round',2,48)),blocked=own(own(shadow.offset(o.clearance+numericMargin*4,'Round',2,48)).simplify(numericMargin)),safe=own(own(innerInset.subtract(blocked)).simplify(numericMargin));
  if(safe.area()<c.area*.3||safe.decompose().map(own).length!==1)fail('Die Einstecktiefe trifft Innenaufbauten oder keine zusammenhängende Öffnung. Einen kürzeren Führungsrand wählen.','MESH_LID_BLOCKED');
  const rimInside=own(own(safe.offset(-o.lipWall,'Round',2,48)).simplify(numericMargin));if(rimInside.area()<safe.area()*.25)fail('Der Führungsrand ist für die Öffnung zu breit.');
  const rim=own(safe.subtract(rimInside)),overlap=own(rim.intersect(shadow));if(overlap.area()>f.epsilon*f.epsilon*64)fail('Der Führungsrand ist nicht kollisionsfrei.','MESH_LID_BLOCKED');
  let plate=outer;
  const land=own(outer.offset(-.5,'Round',2,48));
  for(const h of c.holes){const disk=own(kernel.CrossSection.circle(o.holeDiameter/2,128).translate(h.center));if(own(disk.subtract(land)).area()>f.epsilon*f.epsilon*64)fail('Das Schraubenloch ist für den vorhandenen Rand zu groß.');plate=own(plate.subtract(disk));}
  const base=own(plate.extrude(o.thickness)),insert=own(rim.extrude(o.lipHeight+.02).translate([0,0,-o.lipHeight]));
  const combined=own(own(kernel.Manifold.union([base,insert])).simplify(numericMargin));if(combined.status()!=='NoError'||combined.volume()<=0||combined.decompose().map(own).length!==1)fail('Der Deckel ist kein einzelner geprüfter geschlossener Körper.');
  const raw=combined.getMesh(),verts=[],inverse=s.matrix.clone().invert();
  for(let i=0;i<raw.vertProperties.length;i+=raw.numProp){const p=f.world([raw.vertProperties[i],raw.vertProperties[i+1],raw.vertProperties[i+2]+c.plane]),local=new Vector3(...p).applyMatrix4(inverse);verts.push(...local.toArray());}
  let triangles=Array.from(raw.triVerts);if(s.matrix.determinant()<0)for(let i=0;i<triangles.length;i+=3)[triangles[i+1],triangles[i+2]]=[triangles[i+2],triangles[i+1]];
  // Converting to the persisted local Float32 representation gets its own
  // manifold check. The generated body never relies on source solid validity.
  const storedVerts=new Float32Array(verts);let quantization=0;for(let i=0;i<verts.length;i+=3){const a=new Vector3(...verts.slice(i,i+3)).applyMatrix4(s.matrix),b=new Vector3(...storedVerts.slice(i,i+3)).applyMatrix4(s.matrix);quantization=Math.max(quantization,a.distanceTo(b));}
  if(quantization>numericMargin)fail('Die STL-Koordinaten sind für diese Passung zu weit vom Modellursprung entfernt.','MESH_LID_NUMERIC');
  const checkMesh=new kernel.Mesh({numProp:3,vertProperties:storedVerts,triVerts:new Uint32Array(triangles)}),check=own(new kernel.Manifold(checkMesh));
  if(check.status()!=='NoError'||check.volume()<=0||check.decompose().map(own).length!==1)fail('Die gespeicherten Deckelkoordinaten sind numerisch nicht eindeutig.','MESH_LID_NUMERIC');
  const canonical=check.getMesh(),saved={verts:[],triangles:Array.from(canonical.triVerts)};for(let i=0;i<canonical.vertProperties.length;i+=canonical.numProp)saved.verts.push(...canonical.vertProperties.slice(i,i+3));
  if(meshTopologyClass(saved).type!=='closedMesh')fail('Der gespeicherte Deckel enthält numerisch zusammengefallene Flächen.','MESH_LID_NUMERIC');
  const savedPoints=[];for(let i=0;i<saved.verts.length;i+=3){const w=new Vector3(...saved.verts.slice(i,i+3)).applyMatrix4(s.matrix).toArray(),q=sub(w,f.anchor);savedPoints.push([dot(q,f.u),dot(q,f.v),dot(q,f.n)]);}
  const emitted=CS(obstructionPolygons({...f,points:savedPoints,indices:saved.triangles},c.plane-o.lipHeight-numericMargin*2,c.plane-numericMargin*2)),checkBlocked=own(shadow.offset(o.clearance-numericMargin*2,'Round',2,48));
  if(own(emitted.intersect(checkBlocked)).area()>f.epsilon*f.epsilon*64)fail('Der gespeicherte Führungsrand hält den geprüften Abstand nicht ein.','MESH_LID_BLOCKED');
  return {mesh:saved,report:{...summary(c),thickness:o.thickness,lipHeight:o.lipHeight,lipWall:o.lipWall,clearance:o.clearance,holeDiameter:o.holeDiameter,numericalMargin:numericMargin,storedQuantizationError:quantization,storedLipClearanceVerified:true,solidProven:true,originalRetained:true,sourceSolidProven:false,collisionCheck:'Stored lip surfaces against all source-triangle projections over the complete insertion slab; requested clearance minus numerical allowance.',physicalFitTested:false,volume:combined.volume()}};
 }finally{for(const v of owned.reverse())v.delete();}
}

// Shared local geometry algorithms. No filesystem, network or desktop API.
export const meshContourGeometry={source,frame,section,circle,simpleContours,obstructionPolygons,area,positive,contains,dot,sub,cross,unit};
