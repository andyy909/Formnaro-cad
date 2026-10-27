import {Matrix3,Vector3} from 'three';
import {meshContourGeometry as g} from './mesh-lid.js';
import {cadGeometryDigest} from './cad-geometry-digest.js';

const fail=message=>{throw Object.assign(Error(message),{code:'MESH_FEATURES'});};
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<=1e6);
const identity=(prefix,value)=>prefix+'-'+cadGeometryDigest(JSON.stringify(value)).slice(0,24);
export function validateFeatureQuery(o={}){
 if(!o||Object.getPrototypeOf(o)!==Object.prototype||Object.keys(o).some(k=>!['normal','planePoint'].includes(k))||o.normal!==undefined&&(!vector(o.normal)||Math.hypot(...o.normal)<1e-12)||o.planePoint!==undefined&&(!vector(o.planePoint)||!o.normal))fail('Eine endliche Schnittebene mit Punkt und Richtung wählen.');
 return o;
}
function planes(s){
 const groups=new Map(),tol=Math.max(1e-6,s.extent*1e-7);
 for(let i=0;i<s.indices.length;i+=3){
  const [a,b,c]=s.indices.slice(i,i+3).map(id=>s.points[id]),cross=g.cross(g.sub(b,a),g.sub(c,a)),length=Math.hypot(...cross);if(length<tol*tol)continue;
  let n=cross.map(v=>v/length);const first=n.find(v=>Math.abs(v)>1e-7);if(first<0)n=n.map(v=>-v);
  const d=g.dot(g.sub(a,s.anchor),n),key=n.map(v=>Math.round(v/1e-5)).join(',')+':'+Math.round(d/tol);
  const item=groups.get(key)??{normal:n,d,area:0,sum:[0,0,0],triangleCount:0,maxPlaneError:0};
  item.area+=length/2;item.triangleCount++;item.sum=item.sum.map((v,k)=>v+(a[k]+b[k]+c[k])/3*length/2);
  item.maxPlaneError=Math.max(item.maxPlaneError,...[a,b,c].map(p=>Math.abs(g.dot(g.sub(p,s.anchor),item.normal)-item.d)));groups.set(key,item);
 }
 return [...groups.values()].filter(p=>p.triangleCount>=2&&p.area>=s.extent*s.extent*.0001).sort((a,b)=>b.area-a.area).slice(0,32).map(p=>({featureId:identity('plane',[s.geometryDigest,p.normal,p.d]),kind:'planarPatch',normal:p.normal,point:p.sum.map(v=>v/p.area),area:p.area,triangleCount:p.triangleCount,maxPlaneError:p.maxPlaneError,orientationVerified:false}));
}
export function measuredProfiles(s,normal,planePoint){
 const f=g.frame(s,normal),plane=planePoint?g.dot(g.sub(planePoint,s.anchor),f.n):f.hi;
 if(plane>f.hi+f.epsilon*8||plane<=f.lo+f.epsilon*16)fail('Die Schnittebene liegt außerhalb des auswertbaren Teils.');
 // Imported STL rims can contain small gaps at one particular slice. Search a
 // bounded, disclosed reference depth; never repair or bridge an open contour.
 let inset,loops,lastError;
 for(const value of [...new Set([Math.min(.02,(plane-f.lo)*.001),f.epsilon*20,.01,.025,.05,.1,.125,.2,.35,.5,.75,1])]){
  if(value>=Math.min((plane-f.lo)*.1,1.01))continue;
  try{const found=g.section(f,plane-value);if(!found.length||!g.simpleContours(found,f.epsilon*8))continue;
   // A tiny protruding boss must not hide the surrounding housing opening.
   // Keep the widest measurable section in this bounded end band, exposing
   // its actual reference inset rather than pretending it lies on the rim.
   if(!loops||g.area(found[0])>g.area(loops[0])*(1+1e-6)){loops=found;inset=value;}
  }catch(error){if(error.code!=='MESH_LID_SECTION')throw error;lastError=error;}
 }
 if(!loops)throw lastError??Object.assign(Error('Keine eindeutige geschlossene Referenzkontur gefunden.'),{code:'MESH_LID_SECTION'});
 if(!g.simpleContours(loops,f.epsilon*8))fail('Die Schnittkonturen berühren oder überschneiden sich.');
 const result=[];
 for(let i=0;i<loops.length;i++){
  const contour=loops[i];let parent=-1;
  for(let j=0;j<i;j++)if(contour.every(p=>g.contains(loops[j],p))&&(parent<0||g.area(loops[j])<g.area(loops[parent])))parent=j;
  const depth=parent<0?0:result[parent].depth+1,round=g.circle(contour,{maxRadius:5000}),min=[0,1].map(k=>Math.min(...contour.map(p=>p[k]))),max=[0,1].map(k=>Math.max(...contour.map(p=>p[k])));
  const profileId=identity('profile',[s.geometryDigest,f.n.map(v=>+v.toFixed(8)),+plane.toFixed(6),+inset.toFixed(6),i]);
  // section() shifts off coincident vertex planes by the disclosed epsilon.
  // Keep the old construction anchors/IDs, expose actual measurement coordinates.
  const sectionShift=f.epsilon*2.231,measurementPlane=plane-inset+sectionShift;
  result.push({profileId,parentId:parent<0?null:result[parent].profileId,depth,role:depth%2?'cavity':'outline',normal:f.n,planePoint:f.world([0,0,plane]),nominalPlanePoint:f.world([0,0,plane]),measurementPlanePoint:f.world([0,0,measurementPlane]),sectionShift,referenceInset:inset,area:g.area(contour),size:max.map((v,k)=>v-min[k]),center:f.world([...(min.map((v,k)=>(v+max[k])/2)),plane]),measurementCenter:f.world([...(min.map((v,k)=>(v+max[k])/2)),measurementPlane]),segmentCount:contour.length,...(round?{circle:{center:f.world([...round.center,plane]),measurementCenter:f.world([...round.center,measurementPlane]),diameter:round.diameter,fitError:round.fitError},kind:depth%2?'circularOpening':'roundOutline'}:{kind:depth%2?'openingContour':'outerContour'}),counterparts:depth%2?['plug','cap']:['sleeve'],contour,f,plane});
 }
 return result;
}
export function analyzeMeshFeatures(node,options={}){
 validateFeatureQuery(options);const s=g.source(node),flat=planes(s),directions=[];
 function add(n,point){n=g.unit(n);if(!directions.some(d=>g.dot(d.normal,n)>1-1e-8&&(!point&&!d.point||point&&d.point&&Math.hypot(...g.sub(point,d.point))<s.extent*1e-7)))directions.push({normal:n,point});}
 if(options.normal)add(options.normal,options.planePoint);
 else{
  for(let axis=0;axis<3;axis++)for(const sign of [-1,1])add(new Vector3(...[0,1,2].map(k=>k===axis?sign:0)).applyMatrix3(new Matrix3().getNormalMatrix(s.matrix)).normalize().toArray());
  for(const p of flat.slice(0,6))for(const sign of [-1,1])add(p.normal.map(v=>v*sign));
 }
 const profiles=[],unavailable=[];
 for(const d of directions){try{for(const p of measuredProfiles(s,d.normal,d.point)){const {contour,f,plane,...summary}=p;profiles.push(summary);}}catch(error){if(!['MESH_LID_SECTION','MESH_FEATURES','MESH_LID_LIMIT'].includes(error.code))throw error;unavailable.push({normal:d.normal,reason:error.message});}}
 return {version:1,geometryDigest:s.geometryDigest,units:'mm',planes:flat,profiles,unavailable,sourcePreserved:true,limitations:'Measured tessellated planar patches and closed section contours; circular fits are opening candidates, not verified threads or complete cylinders. Automatic sections use transformed source axes and major plane normals; query normal/planePoint for another section. No reconstruction of freeform CAD surfaces. Counterparts are prismatic contour offsets over a checked depth, not arbitrary 3D surface offsets.'};
}
