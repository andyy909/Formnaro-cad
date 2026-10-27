// Plane cuts and disconnected material bodies use the same Manifold kernel as
// ordinary modelling. All returned nodes are independent normalized world meshes.
import {fromMesh,makeNode,meshData,validNode,worldManifold,composeManifoldShells} from './geometry.js';

export function validatePartitionPlane(value){
 if(!value||!Array.isArray(value.normal)||value.normal.length!==3||!value.normal.every(v=>typeof v==='number'&&Number.isFinite(v))||typeof value.offset!=='number'||!Number.isFinite(value.offset))throw Error('Teilungsebene prüfen: Normale und Abstand müssen endliche Zahlen sein.');
 const length=Math.hypot(...value.normal);
 if(!Number.isFinite(length)||length<1e-12)throw Error('Die Teilungsebene braucht eine gültige Richtung.');
 const normal=value.normal.map(v=>v/length),offset=value.offset/length;
 if(!Number.isFinite(offset)||Math.abs(offset)>200000)throw Error('Die Teilungsebene liegt außerhalb des Arbeitsbereichs.');
 return {normal,offset};
}

function scope(){
 const objects=new Set();
 return {take(m){objects.add(m);return m;},drop(m){if(objects.delete(m))m.delete();},close(){for(const m of objects)m.delete();objects.clear();}};
}
function positive(m,message='Das Netz ergibt keinen geschlossenen Körper.'){
 if(m.status()!=='NoError'||m.isEmpty()||!Number.isFinite(m.volume())||m.volume()<=0)throw Error(message);
 return m;
}
function source(node,s){
 if(!validNode(node))throw Error('Das gewählte Teil ist ungültig.');
 return positive(s.take(worldManifold(node)));
}
function union(parts,s){
 if(!parts.length)throw Error('Die Operation ergibt keinen Körper.');
 let result=parts[0];
 for(let i=1;i<parts.length;i++)result=s.take(result.add(parts[i]));
 return positive(result);
}
function differenceVolume(a,b,s){
 const difference=s.take(a.subtract(b));
 try{
  if(difference.status()!=='NoError')throw Error('Die Netzgeometrie konnte nicht sicher geprüft werden.');
  const volume=Math.abs(difference.volume());
  if(!Number.isFinite(volume))throw Error('Die Netzgeometrie enthält ungültige Volumina.');
  return volume;
 }finally{s.drop(difference);}
}
function tolerance(m){return Math.max(m.volume()*2e-5,1e-12);}
function verifyParts(original,parts,s,allowed=tolerance(original)){
 const volume=parts.reduce((sum,p)=>sum+positive(p).volume(),0),combined=union(parts,s),missing=differenceVolume(original,combined,s),added=differenceVolume(combined,original,s);
 if(Math.abs(volume-original.volume())>allowed||missing>allowed||added>allowed)throw Error('Die Teilung würde die Geometrie verändern. Das Original bleibt erhalten.');
 // Comparing the sum to the union also detects overlapping material bodies.
 if(Math.abs(volume-combined.volume())>allowed)throw Error('Die einzelnen Körper überschneiden sich. Das Netz kann nicht sicher herausgelöst werden.');
 return {volume,missing,added};
}
function encloses(outer,inner,epsilon){
 return inner.min.every((v,i)=>v>=outer.min[i]-epsilon&&inner.max[i]<=outer.max[i]+epsilon);
}
function reverseShell(shell,s){
 // A cavity boundary is a negative-volume closed surface. It must be a cutter,
 // never a standalone positive solid produced by normalizeMesh's winding repair.
 const bounds=shell.boundingBox(),center=bounds.min.map((v,i)=>(v+bounds.max[i])/2),size=bounds.min.map((v,i)=>bounds.max[i]-v);
 if(size.some(v=>!Number.isFinite(v)||v<=0))throw Error('Eine innere Hohlraumfläche hat keine räumliche Ausdehnung.');
 const centred=s.take(shell.translate(center.map(v=>-v))),normal=s.take(centred.scale(size.map(v=>1/v))),data=meshData(normal);
 for(let i=0;i<data.triangles.length;i+=3)[data.triangles[i+1],data.triangles[i+2]]=[data.triangles[i+2],data.triangles[i+1]];
 const reversed=s.take(fromMesh(data)),scaled=s.take(reversed.scale(size));
 return positive(s.take(scaled.translate(center)),'Eine innere Hohlraumfläche konnte nicht sicher rekonstruiert werden.');
}
function materialBodies(m,s){
 const shells=m.decompose().map(shell=>s.take(shell));
 if(!shells.length)throw Error('Das Netz enthält keine Körper.');
 const solids=[],voids=[],residues=[];
 // Float32 STL imports can contain very thin, tiny signed surface fragments.
 // Preserve them verbatim with their one nearby material owner. Never reverse,
 // remove or fill them, and never infer ownership from bounding boxes alone.
 const residueVolume=Math.max(m.volume()*1e-10,1e-12),attachmentDistance=.01;
 for(const shell of shells){
  if(shell.status()!=='NoError'||shell.isEmpty()||!Number.isFinite(shell.volume()))throw Error('Das Netz enthält eine leere oder ungültige Schale.');
  const bounds=shell.boundingBox(),extent=bounds.min.map((v,i)=>bounds.max[i]-v);
  const boxVolume=extent.reduce((a,b)=>a*b,1),thin=Math.min(...extent)<.01||boxVolume>0&&Math.abs(shell.volume())/boxVolume<1e-3;
  if(Math.abs(shell.volume())<=residueVolume&&thin){residues.push({shell,bounds});continue;}
  if(shell.volume()===0)throw Error('Das Netz enthält eine leere oder ungültige Schale.');
  if(shell.volume()>0)solids.push({shell,volume:shell.volume(),bounds,voids:[],residues:[]});
  else voids.push({shell,volume:-shell.volume(),bounds:shell.boundingBox()});
 }
 if(!solids.length)throw Error('Das Netz enthält keinen positiven Materialkörper.');
 if(solids.length>500||shells.length>2000)throw Error('Zu viele einzelne Körper oder Hohlraumschalen. Das Netz zuerst in kleinere Teile aufteilen.');
 // Decompose separates surfaces, not material. Assign every negative shell to
 // its smallest containing positive shell. Thus solid islands inside a cavity,
 // and cavities inside such islands, retain their original nesting correctly.
 for(const cavity of voids){
  const cutter=reverseShell(cavity.shell,s),epsilon=Math.max(m.tolerance()*8,1e-10),allowed=Math.max(cavity.volume*1e-7,1e-12);
  let owner=null;
  for(const solid of solids){
   if(solid.volume<cavity.volume-allowed||!encloses(solid.bounds,cavity.bounds,epsilon))continue;
   if(differenceVolume(cutter,solid.shell,s)>allowed)continue;
   if(!owner||solid.volume<owner.volume)owner=solid;
  }
  if(!owner)throw Error('Eine innere Hohlraumfläche lässt sich keinem Körper sicher zuordnen. Das Original bleibt erhalten.');
  owner.voids.push(cutter);
 }
 for(const residue of residues){
  const owners=solids.filter(solid=>{
   // Cheap bounds rejection before the exact mesh distance query.
   if(residue.bounds.min.some((v,i)=>v>solid.bounds.max[i]+attachmentDistance||residue.bounds.max[i]<solid.bounds.min[i]-attachmentDistance))return false;
   return residue.shell.minGap(solid.shell,attachmentDistance)<attachmentDistance;
  });
  if(owners.length!==1)throw Error('Ein winziger Netzrest lässt sich keinem einzelnen benachbarten Körper sicher zuordnen. Das Original bleibt erhalten.');
  owners[0].residues.push(residue.shell);
 }
 const bodies=solids.map(solid=>{
  let body=solid.shell;
  for(const cavity of solid.voids)body=s.take(body.subtract(cavity));
  // Manifold's inverse of decompose preserves signed disconnected boundaries.
  // A Boolean union would lose/reorient numerical residue shells.
  if(solid.residues.length)body=s.take(composeManifoldShells([body,...solid.residues]));
  return positive(body,'Ein herausgelöster Körper wäre leer oder ungültig.');
 });
 // Reorienting a void requires the same Float32 mesh boundary as storage.
 // Apply the conservative storage bound here as well as to the final nodes.
 verifyParts(m,bodies,s,tolerance(m));
 // Geometry order is independent of source triangle ordering and is stable
 // across previews, exports and reloads (world bounding box, then volume).
 bodies.sort((a,b)=>{
  const aa=a.boundingBox(),bb=b.boundingBox();
  for(const key of ['min','max'])for(let i=0;i<3;i++){const delta=aa[key][i]-bb[key][i];if(delta)return delta;}
  return b.volume()-a.volume();
 });
 bodies.residueCount=residues.length;
 return bodies;
}
function outputNode(body,node,index,side,s){
 const bounds=body.boundingBox(),pos=bounds.min.map((v,i)=>(v+bounds.max[i])/2),size=bounds.min.map((v,i)=>bounds.max[i]-v);
 if(size.some(v=>!Number.isFinite(v)||v<.01||v>10000))throw Error('Ein Ergebniskörper ist zu klein oder zu groß (0,01 bis 10.000 mm je Achse).');
 // Normalize before getMesh's Float32 conversion. Quantizing large absolute
 // world coordinates first would damage small details far from the origin.
 const centred=s.take(body.translate(pos.map(v=>-v))),normal=s.take(centred.scale(size.map(v=>1/v)));
 const metadata={};
 for(const key of ['opacity','notes'])if(node[key]!==undefined)metadata[key]=node[key];
 const label=side==='positive'?`+ ${index+1}`:side==='negative'?`− ${index+1}`:`Teil ${index+1}`;
 const result=makeNode('import',pos,{name:`${node.name.slice(0,170)} · ${label}`,color:node.color,size,mesh:meshData(normal),solid:node.solid,segments:node.segments||64,...metadata});
 if(!validNode(result))throw Error('Ein Ergebniskörper liegt außerhalb des zulässigen Arbeitsbereichs.');
 return result;
}
function result(node,original,bodies,s,sides,plane){
 const nodes=bodies.map((body,i)=>outputNode(body,node,i,sides?.[i],s)),stored=nodes.map(n=>positive(s.take(worldManifold(n))));
 const volumeTolerance=tolerance(original),checked=verifyParts(original,stored,s,volumeTolerance);
 return {nodes,count:nodes.length,volumes:stored.map(m=>m.volume()),sourceVolume:original.volume(),resultVolume:checked.volume,volumeTolerance,missingVolume:checked.missing,addedVolume:checked.added,residueCount:bodies.residueCount??0,...(sides?{sides}:{}),...(plane?{plane}: {})};
}

export function extractMeshBodies(node){
 const s=scope();
 try{const original=source(node,s),bodies=materialBodies(original,s);return result(node,original,bodies,s);}
 finally{s.close();}
}

export function splitMeshParts(node,value){
 const plane=validatePartitionPlane(value),s=scope();
 try{
  const original=source(node,s),halves=original.splitByPlane(plane.normal,plane.offset).map(m=>s.take(m));
  const minimumVolume=Math.max(original.volume()*1e-10,1e-12);
  if(halves.some(m=>m.status()!=='NoError'||m.isEmpty()||m.volume()<=minimumVolume))throw Error('Die Ebene teilt das Material nicht in zwei Körper. Abstand oder Richtung ändern.');
  const cutArea=(halves[0].surfaceArea()+halves[1].surfaceArea()-original.surfaceArea())/2;
  if(!Number.isFinite(cutArea)||cutArea<=Math.max(original.surfaceArea()*1e-10,1e-12))throw Error('Die Ebene trifft kein Material. Abstand oder Richtung ändern.');
  verifyParts(original,halves,s,Math.max(original.volume()*1e-7,1e-12));
  // Preserve exactly two plane halves. Each may itself contain several bodies;
  // extraction is a separate user operation. Validate their cavity nesting now.
  materialBodies(halves[0],s);materialBodies(halves[1],s);
  return {...result(node,original,halves,s,['positive','negative'],plane),cutArea};
 }finally{s.close();}
}
