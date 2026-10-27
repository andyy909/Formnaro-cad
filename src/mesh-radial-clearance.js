import {Matrix4,Quaternion,Vector3} from 'three';
import {meshTopologyClass} from './project-objects.js';
import {meshContourGeometry as g} from './mesh-lid.js';
import {projectObjectGeometryDigest} from './project-objects.js';

const fail=(message,code='AI_CHECK_UNAVAILABLE')=>{throw Object.assign(Error(message),{code});};
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<=100000);
export function validateRadialClearanceOptions(o={}){
 if(!o||Object.getPrototypeOf(o)!==Object.prototype||Object.keys(o).some(k=>!['other','from','to','samples','expected','tolerance'].includes(k))||!vector(o.from)||!vector(o.to)||Math.hypot(...o.to.map((x,k)=>x-o.from[k]))<.01)fail('Radialspiel benötigt other sowie zwei endliche Weltpunkte einer Achsstrecke.','AI_CHECK_INVALID');
 if(!Number.isInteger(o.samples??9)||(o.samples??9)<3||(o.samples??9)>33)fail('3 bis 33 Schnitte wählen.','AI_CHECK_INVALID');
 if(o.expected!==undefined&&(!Number.isFinite(o.expected)||o.expected<0||o.expected>5))fail('Radialspiel muss zwischen 0 und 5 mm liegen.','AI_CHECK_INVALID');
 if(!Number.isFinite(o.tolerance??.01)||(o.tolerance??.01)<1e-6||(o.tolerance??.01)>.1)fail('Toleranz muss zwischen 0,000001 und 0,1 mm liegen.','AI_CHECK_INVALID');
 return {...o,samples:o.samples??9,tolerance:o.tolerance??.01};
}
function edgeDistance(a,b){const dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,-(a[0]*dx+a[1]*dy)/d)):0;return Math.hypot(a[0]+t*dx,a[1]+t*dy);}
function triangles(body){const m=body.getMesh(),p=[];for(let i=0;i<m.vertProperties.length;i+=m.numProp)p.push(Array.from(m.vertProperties.slice(i,i+3)));const out=[];for(let i=0;i<m.triVerts.length;i+=3){const v=Array.from(m.triVerts.slice(i,i+3),id=>p[id]);out.push({v,lo:Math.min(...v.map(q=>q[2])),hi:Math.max(...v.map(q=>q[2]))});}return out;}
function clip(poly,z,above){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],inside=above?a[2]>=z:a[2]<=z,next=above?b[2]>=z:b[2]<=z;if(inside)out.push(a);if(inside!==next){const t=(z-a[2])/(b[2]-a[2]);out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1]),z]);}}return out;}
// Project every clipped source triangle in a slab. Its minimum radius bounds
// all material surfaces at every height; every clipped insert vertex bounds its
// maximum radius. Adaptive slabs avoid assuming a taper is linear or smooth.
function slabBound(source,insert,lo,hi,numericalAllowance,budget){
 let cavityRadius=Infinity,insertRadius=0;
 for(const [list,isSource]of [[source,true],[insert,false]])for(const t of list){
  if(++budget.count>12000000)fail('Die durchgehende Radialspielprüfung überschreitet das Rechenlimit. Kürzere Achsstrecke oder einfachere Netze wählen.');
  if(t.hi<lo||t.lo>hi)continue;
  const poly=clip(clip(t.v,lo,true),hi,false);if(!poly.length)continue;
  if(isSource){
   const flat=poly.map(p=>p.slice(0,2));
   if(g.contains(flat,[0,0]))cavityRadius=0;
   for(let i=0;i<flat.length;i++)cavityRadius=Math.min(cavityRadius,edgeDistance(flat[i],flat[(i+1)%flat.length]));
  }else for(const p of poly)insertRadius=Math.max(insertRadius,Math.hypot(p[0],p[1]));
 }
 if(!Number.isFinite(cavityRadius)||!insertRadius)fail('Ein Höhenabschnitt enthält keine eindeutig auswertbaren Materialgrenzen.');
 return cavityRadius-insertRadius-numericalAllowance;
}

// Conservative centered disk bounds in sections and throughout clipped slabs.
// No circular fit, angular sampling, or extrapolation is used.
export function measureMeshRadialClearance({kernel,target,other,options}){
 const o=validateRadialClearanceOptions(options),owned=[],own=v=>(owned.push(v),v);
 if(!target||!other||target.id===other.id)fail('Zwei verschiedene fertige Material-Netzteile wählen.','AI_CHECK_INVALID');
 const delta=o.to.map((x,k)=>x-o.from[k]),length=Math.hypot(...delta),direction=delta.map(x=>x/length),align=new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromUnitVectors(new Vector3(...direction),new Vector3(0,0,1))).multiply(new Matrix4().makeTranslation(...o.from.map(x=>-x)));
 try{
  function body(n){
   if(n.kind!=='mesh'||n.meshRole==='hole'||meshTopologyClass(n.mesh).type!=='closedMesh')fail('Radialspiel benötigt zwei geschlossene Material-Netzteile.','AI_CHECK_UNSUPPORTED');
   if(n.mesh.triangles.length/3>100000)fail('Radialspiel unterstützt bis zu 100.000 Dreiecke je Teil.');
   if(!Array.isArray(n.transform)||n.transform.length!==16||!n.transform.every(Number.isFinite))fail('Ungültige Objekttransformation.');
   const raw=new kernel.Mesh({numProp:3,vertProperties:new Float32Array(n.mesh.verts),triVerts:new Uint32Array(n.mesh.triangles)});raw.merge();const local=own(new kernel.Manifold(raw)),m=own(local.transform(align.clone().multiply(new Matrix4().fromArray(n.transform)).toArray()));
   if(m.status()!=='NoError'||m.isEmpty()||m.volume()<=0)fail('Radialspiel benötigt geprüfte Materialkörper.','AI_CHECK_UNSUPPORTED');return m;
  }
  const insert=body(target),source=body(other),boxes=[insert.boundingBox(),source.boundingBox()];
  let inputScale=1;for(const n of [target,other]){let max=0;for(const v of n.mesh.verts)max=Math.max(max,Math.abs(v));const m=n.transform;inputScale=Math.max(inputScale,max*Math.max(...[0,1,2].map(k=>Math.abs(m[k])+Math.abs(m[k+4])+Math.abs(m[k+8]))));}
  const scale=Math.max(inputScale,length,...o.from.map(Math.abs),...o.to.map(Math.abs),...boxes.flatMap(b=>[...b.min.map(Math.abs),...b.max.map(Math.abs)])),numericalAllowance=scale*2**-19;
  if(o.tolerance<=numericalAllowance*4)fail('Die Radialspieltoleranz ist für die Netzkoordinaten zu klein.');
  const sections=[];
  for(let i=0;i<o.samples;i++){
   const height=length*i/(o.samples-1),a=insert.slice(height),b=source.slice(height);
   let inner,outer;try{inner=a.toPolygons();outer=b.toPolygons();}finally{a.delete();b.delete();}
   if(!inner.length||!outer.length||!g.simpleContours(inner, numericalAllowance)||!g.simpleContours(outer,numericalAllowance))fail('Ein Prüfschnitt fehlt oder ist mehrdeutig; Achspunkte innerhalb beider Teile wählen.');
   const sourceNesting=outer.filter(p=>g.contains(p,[0,0])).length,insertNesting=inner.filter(p=>g.contains(p,[0,0])).length;
   if(!sourceNesting||sourceNesting%2||insertNesting%2!==1)fail('Die Achse muss innerhalb des Einsatzmaterials und einer umschlossenen leeren Quellöffnung liegen.');
   let cavityRadius=Infinity,insertRadius=0;
   for(const p of outer)for(let j=0;j<p.length;j++)cavityRadius=Math.min(cavityRadius,edgeDistance(p[j],p[(j+1)%p.length]));
   for(const p of inner)for(const v of p)insertRadius=Math.max(insertRadius,Math.hypot(...v));
   sections.push({point:o.from.map((v,k)=>v+direction[k]*height),height,cavityInscribedRadius:cavityRadius,insertEnclosingRadius:insertRadius,gapLowerBound:cavityRadius-insertRadius-numericalAllowance});
  }
  const sampledMinimumGapLowerBound=Math.min(...sections.map(s=>s.gapLowerBound)),sourceTriangles=triangles(source),insertTriangles=triangles(insert),budget={count:0},slabs=[];
  const threshold=o.expected===undefined?sampledMinimumGapLowerBound-o.tolerance:o.expected-o.tolerance;
  function verifySlab(lo,hi,depth=0){
   const gapLowerBound=slabBound(sourceTriangles,insertTriangles,lo,hi,numericalAllowance,budget);
   if(gapLowerBound<threshold&&sampledMinimumGapLowerBound>=threshold&&depth<6){const mid=(lo+hi)/2;verifySlab(lo,mid,depth+1);verifySlab(mid,hi,depth+1);}
   else slabs.push({fromHeight:lo,toHeight:hi,gapLowerBound});
  }
  for(let i=1;i<sections.length;i++)verifySlab(sections[i-1].height,sections[i].height);
  const minimumGapLowerBound=Math.min(sampledMinimumGapLowerBound,...slabs.map(s=>s.gapLowerBound));
  return {version:1,units:'mm',method:'slab-inscribed-void-minus-enclosing-insert',targetDigest:projectObjectGeometryDigest(target),sourceDigest:projectObjectGeometryDigest(other),from:o.from,to:o.to,samples:o.samples,sections,sampledMinimumGapLowerBound,minimumGapLowerBound,slabsChecked:slabs.length,numericalAllowance,...(o.expected===undefined?{}:{expected:o.expected,tolerance:o.tolerance,passed:minimumGapLowerBound>=threshold}),coverage:'Continuous axial interval, all source/insert triangles clipped into bounded slabs; conservative radial lower bound over every angle and height. Eccentric/noncircular sections may be conservatively rejected. Physical print fit is not verified.'};
 }finally{for(const v of owned.reverse())v.delete();}
}
