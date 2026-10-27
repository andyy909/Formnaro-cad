import * as THREE from 'three';
import {prepareReferenceGeometry} from './mesh-reference.js';
import {localManifold,meshData,matrixArray,validNode} from './geometry.js';

// Candidate detection is local. Rounded triangles elsewhere on the body do
// not consume a global plane budget. Finishing proves the entire swept profile
// lies in material before any subtraction is accepted.
export async function analyzeLocalFinishEdges(node,{signal}={}){
 if(!validNode(node)||!node.solid)throw Error('Ein gültiges fertiges Volumenteil auswählen.');
 const m=localManifold(node),g=new THREE.BufferGeometry();
 try{
  if(m.status()!=='NoError'||m.isEmpty()||m.volume()<=0)throw Error('Das Kantenwerkzeug benötigt einen geschlossenen positiv orientierten Körper.');
  const data=meshData(m);if(data.triangles.length/3>200000)throw Error('Kantenwerkzeug: höchstens 200.000 Dreiecke pro Teil.');
  g.setAttribute('position',new THREE.Float32BufferAttribute(data.verts,3));g.setIndex(data.triangles);
  const t=await prepareReferenceGeometry(g,{signal}),matrix=new THREE.Matrix4().fromArray(matrixArray(node)),nm=new THREE.Matrix3().getNormalMatrix(matrix),vertices=t.vertices.map(p=>p.clone().applyMatrix4(matrix)),normals=t.faces.map(f=>f?.normal.clone().applyNormalMatrix(nm).normalize());
  const tolerance=Math.max(1e-5,new THREE.Box3().setFromPoints(vertices).getSize(new THREE.Vector3()).length()*2e-6),parents=t.faces.map((_,i)=>i),area=new Map();
  const root=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
  for(const e of t.edges.values())if(e.faces.length===2){const [a,b]=e.faces;if(normals[a].dot(normals[b])>1-1e-8&&t.faces[b].ids.every(i=>Math.abs(normals[a].dot(vertices[i].clone().sub(vertices[e.a])))<=tolerance)){const x=root(a),y=root(b);parents[y]=x;}}
  for(let i=0;i<t.faces.length;i++)if(t.faces[i]){const r=root(i),p=area.get(r)||{normal:normals[i],edges:[]};area.set(r,p);}
  const records=[],pairs=new Map();let rejected=0;
  for(const e of t.edges.values()){
   if(e.faces.length!==2)continue;const [a,b]=e.faces,p=root(a),q=root(b);if(p===q||Math.abs(normals[a].dot(normals[b]))>.01)continue;
   const origin=vertices[e.a],otherA=t.faces[a].ids.find(i=>i!==e.a&&i!==e.b),otherB=t.faces[b].ids.find(i=>i!==e.a&&i!==e.b);
   // Opposite triangle vertices distinguish a convex material edge from a
   // concave valley, including inner openings and reflected transforms.
   if(normals[b].dot(vertices[otherA].clone().sub(origin))>=-tolerance*1e-3||normals[a].dot(vertices[otherB].clone().sub(origin))>=-tolerance*1e-3){rejected++;continue;}
   const r={a:e.a,b:e.b,patches:[p,q],normals:[normals[a],normals[b]],used:false};records.push(r);area.get(p).edges.push(r);area.get(q).edges.push(r);
   const key=[p,q].sort((x,y)=>x-y).join(':');if(!pairs.has(key))pairs.set(key,[]);pairs.get(key).push(r);
  }
  const edges=[];
  // A planar face adjoining a curved side provides a complete planar rim.
  // Smooth tessellation turns form one selectable contour, not tiny facets.
  for(const [patch,info]of area){
   if(info.edges.length<3)continue;const adjacent=new Map();for(const r of info.edges)for(const id of [r.a,r.b]){if(!adjacent.has(id))adjacent.set(id,[]);adjacent.get(id).push(r);}
   const seen=new Set();for(const seed of info.edges){if(seen.has(seed)||seed.used)continue;const ids=[],run=[];let v=seed.a,r=seed,closed=false;
    while(r&&!seen.has(r)){seen.add(r);ids.push(v);run.push(r);v=r.a===v?r.b:r.a;if(v===ids[0]){closed=true;break;}const next=adjacent.get(v);if(next.length!==2)break;r=next.find(x=>x!==r);}
    if(!closed||run.some(x=>x.used)||run.length<8)continue;
    const wall=run.map(r=>r.normals[r.patches[0]===patch?1:0]),lean=wall.map(n=>n.dot(info.normal));
    if(lean.some(c=>Math.abs(c)>.01)||ids.some(i=>Math.abs(info.normal.dot(vertices[i].clone().sub(vertices[ids[0]])))>tolerance))continue;
    const side=wall.map((n,i)=>n.clone().addScaledVector(info.normal,-lean[i]).normalize()),slope=lean.map(c=>c/Math.sqrt(1-c*c));
    // Do not replace the independent straight box edges with face loops.
    // All turns must be gentle; sharp shared corners remain separate edges.
    if(side.some((n,i)=>n.dot(side[(i+1)%side.length])<Math.cos(Math.PI/3)))continue;
    const points=ids.map(i=>vertices[i]),miters=side.map((n,i)=>{const previous=side[(i+side.length-1)%side.length],sum=n.clone().add(previous);return sum.multiplyScalar(1/(1+n.dot(previous)));}),slopes=side.map((n,i)=>{const j=(i+side.length-1)%side.length,previous=side[j],dot=n.dot(previous);return dot>1-1e-8?n.clone().multiplyScalar((slope[i]+slope[j])/2):n.clone().multiplyScalar((slope[i]-dot*slope[j])/(1-dot*dot)).addScaledVector(previous,(slope[j]-dot*slope[i])/(1-dot*dot));});
    const length=points.reduce((sum,p,i)=>sum+p.distanceTo(points[(i+1)%points.length]),0);if(length<.1)continue;
    const id='rim:'+points.map(p=>p.toArray().map(v=>Number(v.toFixed(5))).join(',')).sort().join(';');
    edges.push({id,kind:'rim',closed:true,points:points.map(p=>p.toArray()),normal:info.normal.toArray(),miters:miters.map(n=>n.toArray()),slopes:slopes.map(n=>n.toArray()),start:points[0].toArray(),end:points[0].toArray(),length});run.forEach(r=>r.used=true);
   }
  }
  for(const run of pairs.values()){
   const remaining=run.filter(r=>!r.used);if(!remaining.length)continue;
   const [p,q]=remaining[0].normals,direction=new THREE.Vector3().crossVectors(p,q).normalize(),origin=vertices[remaining[0].a];
   if(remaining.some(r=>[r.a,r.b].some(i=>vertices[i].clone().sub(origin).cross(direction).length()>tolerance))){rejected+=remaining.length;continue;}
   const intervals=remaining.map(r=>[vertices[r.a].clone().sub(origin).dot(direction),vertices[r.b].clone().sub(origin).dot(direction)].sort((a,b)=>a-b)).sort((a,b)=>a[0]-b[0]);
   let lo=intervals[0][0],hi=intervals[0][1];const ranges=[];for(const [a,b]of intervals.slice(1)){if(a>hi+tolerance){ranges.push([lo,hi]);lo=a;}hi=Math.max(hi,b);}ranges.push([lo,hi]);
   for(const [a,b]of ranges){if(b-a<.1){rejected++;continue;}const start=origin.clone().addScaledVector(direction,a),end=origin.clone().addScaledVector(direction,b),id=[...start.toArray(),...end.toArray(),...p.toArray(),...q.toArray()].map(v=>Number(v.toFixed(5))).join(',');edges.push({id,kind:'line',start:start.toArray(),end:end.toArray(),normals:[p.toArray(),q.toArray()],length:b-a});}
  }
  if(edges.length>2048)throw Error('Zu viele bearbeitbare Kanten. Teil zuerst in unabhängige Körper zerlegen.');
  edges.sort((a,b)=>a.id.localeCompare(b.id));return {edges,rejected,tolerance};
 }finally{m.delete();g.dispose();}
}

export function sweepRim(edge,profile){
 const points=edge.points.map(p=>new THREE.Vector3(...p)),normal=new THREE.Vector3(...edge.normal).negate(),miters=edge.miters.map(p=>new THREE.Vector3(...p).negate()),slopes=edge.slopes.map(p=>new THREE.Vector3(...p)),verts=[],triangles=[],n=profile.length;
 if(points.length>2048)throw Error('Randkontur: höchstens 2.048 Konturpunkte.');
 const axis=points[1].clone().sub(points[0]).normalize(),other=normal.clone().cross(axis).normalize(),xy=p=>{const d=p.clone().sub(points[0]);return [d.dot(axis),d.dot(other)];},epsilon=Math.max(1e-8,edge.length*1e-10);
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 function intersects(a,b,c,d){if(Math.max(a[0],b[0])+epsilon<Math.min(c[0],d[0])||Math.max(c[0],d[0])+epsilon<Math.min(a[0],b[0])||Math.max(a[1],b[1])+epsilon<Math.min(c[1],d[1])||Math.max(c[1],d[1])+epsilon<Math.min(a[1],b[1]))return false;const x=cross(a,b,c),y=cross(a,b,d),z=cross(c,d,a),w=cross(c,d,b);return x*y<=epsilon*epsilon&&z*w<=epsilon*epsilon;}
 for(const [x,y]of profile){const ring=points.map((p,i)=>p.clone().addScaledVector(miters[i],y).addScaledVector(slopes[i],x)),flat=ring.map(xy),baseline=y?points.map((p,i)=>xy(p.clone().addScaledVector(slopes[i],x))):null;
  for(let i=0;i<points.length;i++){const next=(i+1)%points.length;if(ring[next].clone().sub(ring[i]).dot(points[next].clone().sub(points[i]))<=epsilon)throw Error('Das Maß lässt die Randkontur kollabieren. Kleineres Maß wählen.');
   for(let j=i+1;j<points.length;j++){if(j===next||(i===0&&j===points.length-1))continue;if(intersects(flat[i],flat[next],flat[j],flat[(j+1)%points.length]))throw Error('Die Randkontur überlappt bei diesem Maß. Kleineres Maß wählen.');}
   if(baseline)for(let j=0;j<points.length;j++)if(intersects(flat[i],flat[next],baseline[j],baseline[(j+1)%points.length]))throw Error('Das Maß kreuzt eine andere Stelle der Randkontur. Kleineres Maß wählen.');
  }
 }
 for(let i=0;i<points.length;i++)for(const [x,y]of profile)verts.push(...points[i].clone().addScaledVector(normal,x).addScaledVector(miters[i],y).addScaledVector(slopes[i],x).toArray());
 for(let i=0;i<points.length;i++){const next=(i+1)%points.length;for(let j=0;j<n;j++){const k=(j+1)%n,a=i*n+j,b=i*n+k,c=next*n+k,d=next*n+j;triangles.push(a,b,c,a,c,d);}}
 let volume=0;for(let i=0;i<triangles.length;i+=3){const [a,b,c]=triangles.slice(i,i+3).map(v=>new THREE.Vector3(...verts.slice(v*3,v*3+3)).sub(points[0]));volume+=a.dot(b.clone().cross(c));}if(volume<0)for(let i=0;i<triangles.length;i+=3)[triangles[i+1],triangles[i+2]]=[triangles[i+2],triangles[i+1]];
 return {verts,triangles};
}
