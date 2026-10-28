import {deformSelectedMesh,MESH_SMOOTH_LIMIT} from './mesh-smooth.js';
import {remeshPlanarMesh} from './mesh-remesh.js';
import {buildMeshSelectionTopology} from './mesh-selection-data.js';
import {placement,distance2} from './mesh-remesh-geometry.js';

export const MESH_SCULPT_LIMIT=MESH_SMOOTH_LIMIT;
export const SCULPT_STROKE_LIMIT=16;
export const SCULPT_POINT_LIMIT=128;
const fail=(message,code='MESH_SCULPT')=>{throw Object.assign(Error(message),{code});};
const sub=(a,b)=>a.map((x,k)=>x-b[k]),dot=(a,b)=>a.reduce((s,x,k)=>s+x*b[k],0),length=v=>Math.hypot(...v);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=1e6);
const exact=(o,keys)=>o&&Object.getPrototypeOf(o)===Object.prototype&&Object.keys(o).every(k=>keys.includes(k));
export function validateMeshSculptOptions(o){
 if(!exact(o,['method','geometryDigest','triangleIds','maxDeviation','symmetry','strokes','refinement'])||o.method!=='bounded-brush-v1'||!(/^[a-f0-9]{64}$/).test(o.geometryDigest??'')||typeof o.maxDeviation!=='number'||!Number.isFinite(o.maxDeviation)||o.maxDeviation<=0||o.maxDeviation>1000)fail('Pinsel: gültigen Geometriebezug und eine Verschiebungsgrenze bis 1.000 mm wählen.');
 if(o.refinement!==undefined&&o.refinement!==null&&(!exact(o.refinement,['targetEdgeLength','iterations'])||!Number.isFinite(o.refinement.targetEdgeLength)||o.refinement.targetEdgeLength<=0||o.refinement.targetEdgeLength>10000||!Number.isSafeInteger(o.refinement.iterations)||o.refinement.iterations<1||o.refinement.iterations>3))fail('Lokale Pinselverfeinerung: positive Kantenlänge bis 10.000 mm und 1 bis 3 Durchgänge wählen.');
 if(o.triangleIds!==null&&(!Array.isArray(o.triangleIds)||!o.triangleIds.length||o.triangleIds.length>MESH_SCULPT_LIMIT||new Set(o.triangleIds).size!==o.triangleIds.length||o.triangleIds.some(n=>!Number.isSafeInteger(n)||n<0||n>=MESH_SCULPT_LIMIT)))fail('Pinsel: eine aktuelle Flächenauswahl oder das ganze Netz wählen.');
 if(o.symmetry!==null&&(!exact(o.symmetry,['axis','offset'])||![0,1,2].includes(o.symmetry.axis)||typeof o.symmetry.offset!=='number'||!Number.isFinite(o.symmetry.offset)||Math.abs(o.symmetry.offset)>100000))fail('Pinsel: eine Welt-Spiegelebene X, Y oder Z mit gültiger Position wählen.');
 if(!Array.isArray(o.strokes)||!o.strokes.length||o.strokes.length>SCULPT_STROKE_LIMIT)fail('Pinsel: 1 bis 16 Striche je Vorschau möglich.');
 let points=0;
 for(const s of o.strokes){
  if(!exact(s,['tool','radius','strength','points','normal','delta'])||!['inflate','deflate','move','flatten','smooth'].includes(s.tool)||typeof s.radius!=='number'||!Number.isFinite(s.radius)||s.radius<=0||s.radius>10000||typeof s.strength!=='number'||!Number.isFinite(s.strength)||s.strength<=0||s.strength>1||!Array.isArray(s.points)||!s.points.length||s.points.some(p=>!vector(p))||!vector(s.normal)||Math.abs(length(s.normal)-1)>1e-6||!vector(s.delta)||length(s.delta)>1000)fail('Pinsel: gültige Striche, Radius, Stärke und Einheitsnormale benötigt.');
  if(s.tool!=='move'&&s.delta.some(v=>v!==0)||s.tool==='move'&&s.points.length!==1)fail('Nur der Verschiebepinsel verwendet einen Verschiebevektor und genau einen Ansatzpunkt.');
  points+=s.points.length;
 }
 if(points>SCULPT_POINT_LIMIT)fail('Pinsel: höchstens 128 Ansatzpunkte je Vorschau.','MESH_SCULPT_LIMIT');
 return structuredClone(o);
}

// Mirror the brush operation in a world plane. This deliberately does not
// symmetrize an asymmetric model or double the strength at the seam.
export function sculptMesh(node,options,{signal}={}){
 const o=validateMeshSculptOptions(options),count=node?.mesh?.triangles?.length/3;
 if(!Number.isSafeInteger(count)||count>MESH_SCULPT_LIMIT)fail('Modellierpinsel unterstützen bis zu 30.000 Dreiecke je Netz.','MESH_SCULPT_LIMIT');
 if(o.triangleIds?.some(v=>v>=count))fail('Die Flächenauswahl ist veraltet. Pinsel erneut öffnen.','MESH_SCULPT_STALE');
 let refinement=null,working=node,selected=o.triangleIds,digest=o.geometryDigest;
 if(o.refinement){
  const t=buildMeshSelectionTopology(node.mesh,{signal});if(t.geometryDigest!==o.geometryDigest)fail('Die Netzgeometrie wurde geändert. Pinsel erneut öffnen.','MESH_SCULPT_STALE');
  const m=node.transform,transform=placement(m),det=m[0]*(m[5]*m[10]-m[9]*m[6])-m[4]*(m[1]*m[10]-m[9]*m[2])+m[8]*(m[1]*m[6]-m[5]*m[2]),orientation=det<0?-1:1,scope=selected?new Set(selected):null,footprints=[];
  for(const s of o.strokes)for(const p of s.points){footprints.push({p,r:s.radius,normal:s.normal});if(o.symmetry){const q=[...p],normal=[...s.normal];q[o.symmetry.axis]=2*o.symmetry.offset-q[o.symmetry.axis];normal[o.symmetry.axis]*=-1;footprints.push({p:q,r:s.radius,normal});}}
  const triangles=Array.from({length:count},(_,f)=>node.mesh.triangles.slice(f*3,f*3+3).map(v=>transform.world(node.mesh.verts.slice(v*3,v*3+3)))),normals=triangles.map(ps=>{const n=cross(sub(ps[1],ps[0]),sub(ps[2],ps[0])),l=length(n);return n.map(v=>orientation*v/l);}),chosen=new Set();
  for(const {p,r,normal}of footprints){
   const candidates=new Set();let seed=-1,nearest=r*r;
   for(let f=0;f<count;f++){if((f&255)===0&&signal?.aborted)throw Object.assign(Error('Pinsel abgebrochen.'),{name:'AbortError'});if(scope&&!scope.has(f)||dot(normals[f],normal)<=.15)continue;const d=distance2(p,...triangles[f]);if(d<r*r)candidates.add(f);if(d<nearest){nearest=d;seed=f;}}
   if(seed<0)continue;const pending=[seed],seen=new Set();while(pending.length){const f=pending.pop();if(seen.has(f)||!candidates.has(f))continue;seen.add(f);chosen.add(f);for(let k=0;k<3;k++){const next=t.neighbors[f*3+k];if(next>=0&&!seen.has(next))pending.push(next);}}
  }
  const ids=[...chosen].sort((a,b)=>a-b);
  if(ids.length)try{
   const r=remeshPlanarMesh(node,{method:'planar-isotropic-v1',mode:'subdivide',geometryDigest:digest,scope:'selection',triangleIds:ids,targetEdgeLength:o.refinement.targetEdgeLength,iterations:o.refinement.iterations,maxDeviation:0},{signal});
   if(r.mesh.triangles.length/3>MESH_SCULPT_LIMIT)fail('Die lokale Verfeinerung überschreitet 30.000 Dreiecke. Größere Kantenlänge oder weniger Durchgänge wählen.','MESH_SCULPT_LIMIT');
   working={...node,mesh:r.mesh,metadata:{...node.metadata,...(r.protection?{meshProtection:r.protection}:{})}};digest=buildMeshSelectionTopology(r.mesh,{signal}).geometryDigest;selected=scope?r.originalFaceIds.flatMap((id,i)=>scope.has(id)?[i]:[]):null;refinement=r.report;
  }catch(error){if(error.code!=='MESH_REMESH_NO_CHANGE')throw error;}
 }
 const m=node.transform,det=m?.[0]*(m?.[5]*m?.[10]-m?.[9]*m?.[6])-m?.[4]*(m?.[1]*m?.[10]-m?.[9]*m?.[2])+m?.[8]*(m?.[1]*m?.[6]-m?.[5]*m?.[2]),orientation=det<0?-1:1;
 let influenced=new Set();
 const deformation={prepare({positions,neighbors,ids,iteration}){
  const stroke=o.strokes[iteration],normals=positions.map(p=>p?[0,0,0]:null);
  for(const f of ids){const n=cross(sub(positions[f[1]],positions[f[0]]),sub(positions[f[2]],positions[f[0]]));for(const v of f)for(let k=0;k<3;k++)normals[v][k]+=orientation*n[k];}
  for(const n of normals)if(n){const l=length(n);if(l)for(let k=0;k<3;k++)n[k]/=l;}
  const reflect=(p,direction=false)=>{const r=[...p],axis=o.symmetry.axis;r[axis]=direction?-r[axis]:2*o.symmetry.offset-r[axis];return r;};
  const copies=[stroke];if(o.symmetry)copies.push({...stroke,points:stroke.points.map(p=>reflect(p)),normal:reflect(stroke.normal,true),delta:reflect(stroke.delta,true)});
  const fields=copies.map(s=>{
   const weights=new Float64Array(positions.length),radius2=s.radius*s.radius;
   for(const point of s.points){
    let seed=-1,nearest=radius2;
    for(let v=0;v<positions.length;v++){if((v&511)===0&&signal?.aborted)throw Object.assign(Error('Pinsel abgebrochen.'),{name:'AbortError'});if(!positions[v]||!neighbors[v].size||dot(normals[v],s.normal)<=.15)continue;const d=dot(sub(positions[v],point),sub(positions[v],point));if(d<nearest){nearest=d;seed=v;}}
    if(seed<0)continue;
    const pending=[seed],seen=new Set();
    while(pending.length){const v=pending.pop();if(seen.has(v))continue;seen.add(v);const d=length(sub(positions[v],point));if(d>=s.radius||dot(normals[v],s.normal)<=.15)continue;const t=1-d/s.radius,w=t*t*(3-2*t);weights[v]=Math.max(weights[v],w);for(const n of neighbors[v])if(!seen.has(n))pending.push(n);}
   }
   return {s,weights};
  });
  return (v,neighborMean)=>{
   const p=positions[v],delta=[0,0,0];let sum=0,maximum=0;
   for(const {s,weights} of fields){const w=weights[v];if(!w)continue;sum+=w;maximum=Math.max(maximum,w);let d;
    if(s.tool==='smooth')d=sub(neighborMean,p).map(x=>x*s.strength*.5);
    else if(s.tool==='move')d=s.delta.map(x=>x*s.strength);
    else if(s.tool==='flatten'){const distance=dot(sub(p,s.points[0]),s.normal);d=s.normal.map(x=>-x*distance*s.strength);}
    else d=normals[v].map(x=>x*s.radius*.1*s.strength*(s.tool==='inflate'?1:-1));
    for(let k=0;k<3;k++)delta[k]+=w*d[k];
   }
   if(!sum)return [...p];influenced.add(v);
   return p.map((x,k)=>x+delta[k]/sum*maximum);
  };
 }};
 try{
  const result=deformSelectedMesh(working,{method:'bounded-laplacian-v1',geometryDigest:digest,triangleIds:selected??Array.from({length:working.mesh.triangles.length/3},(_,i)=>i),strength:1,iterations:o.strokes.length,maxDeviation:o.maxDeviation,featureAngle:o.refinement?45:180},{signal,deformation});
  result.report={...result.report,method:o.method,beforeTriangles:count,refinement,connectivityUnchanged:!refinement,strokeCount:o.strokes.length,pointCount:o.strokes.reduce((n,s)=>n+s.points.length,0),tools:[...new Set(o.strokes.map(s=>s.tool))],symmetry:o.symmetry,influencedVertices:influenced.size,scope:o.refinement?'world-space connected front-facing brush footprint with local conforming subdivision':'world-space connected front-facing brush footprint; fixed connectivity; no automatic remeshing',symmetryMode:'mirrored-stroke-no-double-strength'};
  return result;
 }catch(error){if(error.code?.startsWith('MESH_SMOOTH'))error.code=error.code.replace('MESH_SMOOTH','MESH_SCULPT');error.message=error.message.replaceAll('Glätten','Modellieren').replaceAll('Glättung','Pinselverformung').replaceAll('geglättet','verformt');throw error;}
}
