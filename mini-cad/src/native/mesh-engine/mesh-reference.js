import * as THREE from 'three';

// Geometry-local topology is shared only while its BufferGeometry is unchanged.
// Chunked construction keeps the canvas and Escape responsive on dense imports.
const cache=new WeakMap();
const abort=signal=>{if(signal?.aborted)throw Object.assign(Error('Bezugspunkt-Erkennung abgebrochen.'),{name:'AbortError'});};
const pause=async signal=>{abort(signal);await new Promise(r=>setTimeout(r,0));abort(signal);};
const edgeKey=(a,b)=>a<b?a+':'+b:b+':'+a;
export async function prepareReferenceGeometry(geometry,{signal}={}){
 abort(signal);
 const position=geometry.getAttribute('position'),index=geometry.index;
 if(!position||position.itemSize<3)throw Error('Das Teil besitzt keine auswertbaren Netzpunkte.');
 const signature=[position,position.array,position.version,position.count,index,index?.array,index?.version];
 const previous=cache.get(geometry);if(previous?.signature.every((v,i)=>v===signature[i]))return previous.topology;
 const vertices=[],weld=new Map(),vertexIds=new Uint32Array(position.count);
 for(let i=0;i<position.count;i++){
  const p=new THREE.Vector3().fromBufferAttribute(position,i);if(!p.toArray().every(Number.isFinite))throw Error('Ungültiger Netzpunkt.');
  const key=p.toArray().map(v=>Math.round(v*1e7)).join('/');let id=weld.get(key);if(id===undefined){id=vertices.length;weld.set(key,id);vertices.push(p);}vertexIds[i]=id;
  if(i%2048===0)await pause(signal);
 }
 const count=index?index.count:position.count,faces=[],edges=new Map();
 for(let i=0;i<count;i+=3){
  const ids=[0,1,2].map(j=>vertexIds[index?index.getX(i+j):i+j]);
  if(ids.some(v=>v===undefined)||new Set(ids).size!==3){faces.push(null);continue;}
  const [a,b,c]=ids.map(v=>vertices[v]),normal=b.clone().sub(a).cross(c.clone().sub(a)),area=normal.length()/2;normal.normalize();
  const face={ids,normal,area,center:a.clone().add(b).add(c).multiplyScalar(1/3),edges:[]};faces.push(face);
  for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3],key=edgeKey(a,b);let edge=edges.get(key);if(!edge){edge={a,b,faces:[]};edges.set(key,edge);}edge.faces.push(faces.length-1);face.edges.push(edge);}
  if(i%3072===0)await pause(signal);
 }
 const featureVertices=new Set();let processed=0;
 for(const e of edges.values()){e.feature=e.faces.length!==2||faces[e.faces[0]].normal.dot(faces[e.faces[1]].normal)<1-1e-7;if(e.feature){featureVertices.add(e.a);featureVertices.add(e.b);}if(++processed%2048===0)await pause(signal);}
 abort(signal);const topology={vertices,faces,edges,featureVertices,patches:new Map()};cache.set(geometry,{signature,topology});return topology;
}
async function patchAt(t,seed,{signal}={}){
 if(t.patches.has(seed))return t.patches.get(seed);
 const face=t.faces[seed];if(!face||face.area===0)throw Error('Keine ebene Fläche getroffen.');
 const planeOffset=face.normal.dot(t.vertices[face.ids[0]]),seen=new Set([seed]),queue=[seed];
 for(let i=0;i<queue.length;i++){
  for(const edge of t.faces[queue[i]].edges)for(const neighbor of edge.faces){if(seen.has(neighbor))continue;const f=t.faces[neighbor];if(f&&f.normal.dot(face.normal)>1-1e-7&&f.ids.every(v=>Math.abs(face.normal.dot(t.vertices[v])-planeOffset)<1e-6)){seen.add(neighbor);queue.push(neighbor);}}
  if(i%1024===0)await pause(signal);
 }
 const boundary=[],out=new Map(),incoming=new Map();let closed=true,area=0;const center=new THREE.Vector3();
 for(const id of queue){const f=t.faces[id];area+=f.area;center.addScaledVector(f.center,f.area);for(let j=0;j<3;j++){const e=f.edges[j];if(e.faces.length>2)closed=false;if(e.faces.filter(v=>seen.has(v)).length!==1)continue;const a=f.ids[j],b=f.ids[(j+1)%3];boundary.push([a,b]);if(out.has(a)||incoming.has(b))closed=false;out.set(a,b);incoming.set(b,a);}}
 if(area)center.multiplyScalar(1/area);const loops=[],used=new Set();
 if(closed)for(const [start]of boundary){if(used.has(start))continue;const loop=[];let v=start;while(!used.has(v)&&out.has(v)){used.add(v);loop.push(v);v=out.get(v);}if(v!==start){closed=false;break;}loops.push(loop);}
 const patch={normal:face.normal,center,loops:closed?loops:[],closed,frames:[]};for(const id of queue)t.patches.set(id,patch);abort(signal);return patch;
}
export function referenceFrame(point,normal){
 const n=normal.clone().normalize(),u=new THREE.Vector3(1,0,0).addScaledVector(n,-n.x);if(u.lengthSq()<1e-8)u.set(0,1,0).addScaledVector(n,-n.y);u.normalize();
 return {origin:point.clone(),normal:n,u,v:n.clone().cross(u).normalize()};
}
// A full boundary, not an arbitrary set of equally distant samples, is required.
export function fitCircle(points,normal){
 if(points.length<12)return null;const average=points.reduce((s,p)=>s.add(p),new THREE.Vector3()).multiplyScalar(1/points.length),f=referenceFrame(average,normal);
 const xy=points.map(p=>{const d=p.clone().sub(average);return [d.dot(f.u),d.dot(f.v),d.dot(f.normal)];});
 if(xy.some(p=>Math.abs(p[2])>.01))return null;
 let xx=0,yy=0,xySum=0,bx=0,by=0;
 for(const [x,y]of xy){const r=x*x+y*y;xx+=x*x;yy+=y*y;xySum+=x*y;bx+=x*r/2;by+=y*r/2;}
 const det=xx*yy-xySum*xySum;if(Math.abs(det)<1e-16)return null;
 const cx=(bx*yy-by*xySum)/det,cy=(by*xx-bx*xySum)/det,radii=xy.map(([x,y])=>Math.hypot(x-cx,y-cy)),radius=radii.reduce((s,v)=>s+v,0)/radii.length,diameter=radius*2;
 if(!Number.isFinite(diameter)||diameter<.01||diameter>10000)return null;
 const residual=radii.reduce((m,v)=>Math.max(m,Math.abs(v-radius)),0),tolerance=Math.min(.01,diameter*.001);
 if(residual>tolerance)return null;
 const ordered=xy.map(([x,y])=>Math.atan2(y-cy,x-cx)),steps=ordered.map((v,i)=>{const d=ordered[(i+1)%ordered.length]-v;return Math.atan2(Math.sin(d),Math.cos(d));}),turn=steps.reduce((s,v)=>s+v,0);
 if(Math.abs(Math.abs(turn)-2*Math.PI)>1e-4||steps.some(v=>v*turn<=0))return null;
 const angles=[...ordered].sort((a,b)=>a-b),gaps=angles.map((v,i)=>(i===angles.length-1?angles[0]+2*Math.PI:angles[i+1])-v),sorted=[...gaps].sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)];
 // Conservative full-circle test: a long closing chord is not a valid rim.
 // Uneven/ambiguous tessellation falls back to explicit point placement.
 if(gaps.some(v=>v>Math.PI/2||v>median*1.5+1e-6))return null;
 return {point:average.clone().addScaledVector(f.u,cx).addScaledVector(f.v,cy),diameter,residual,loop:points};
}
export async function referencesAtHit(topology,faceIndex,matrix,{signal}={}){
 const face=topology.faces[faceIndex];if(!face)throw Error('Keine auswertbare Netzfläche getroffen.');
 const normal=face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(matrix)).normalize(),patch=await patchAt(topology,faceIndex,{signal}),key=matrix.elements.join(',');
 let circleFrame=patch.frames.find(v=>v.key===key);
 if(!circleFrame){const circles=[];for(const loop of patch.loops){const points=loop.map(v=>topology.vertices[v].clone().applyMatrix4(matrix)),fit=fitCircle(points,normal);if(fit)circles.push({...fit,kind:'circle',label:'Kreismitte',normal});}circleFrame={key,circles};patch.frames.push(circleFrame);if(patch.frames.length>8)patch.frames.shift();}
 const candidates=[];
 for(const id of face.ids)if(topology.featureVertices.has(id))candidates.push({point:topology.vertices[id].clone().applyMatrix4(matrix),kind:'vertex',label:'Eckpunkt',normal});
 for(const edge of face.edges)if(edge.feature)candidates.push({point:topology.vertices[edge.a].clone().add(topology.vertices[edge.b]).multiplyScalar(.5).applyMatrix4(matrix),kind:'midpoint',label:'Kantenmitte',normal});
 candidates.push(...circleFrame.circles,{point:patch.center.clone().applyMatrix4(matrix),kind:'center',label:'Flächenschwerpunkt',normal});
 return {candidates,normal,circles:circleFrame.circles,closed:patch.closed};
}
export function chooseReference(references,hitPoint,screenPoint,project,mode='auto'){
 const raw={point:hitPoint.clone(),normal:references.normal,kind:'surface',label:'Flächenpunkt'};
 if(mode==='surface')return raw;
 let best=null,score=12;
 for(const c of references.candidates){
  if(mode!=='auto'&&c.kind!==mode)continue;
  let distance=project(c.point).distanceTo(screenPoint);
  if(c.kind==='circle')for(const p of c.loop)distance=Math.min(distance,project(p).distanceTo(screenPoint)+1);
  if(distance<score){score=distance;best=c;}
 }
 if(mode!=='auto'&&!best)return null;
 return best||raw;
}
