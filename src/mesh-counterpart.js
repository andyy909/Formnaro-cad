import {Vector3} from 'three';
import {meshContourGeometry as g} from './mesh-lid.js';
import {measuredProfiles,validateFeatureQuery} from './mesh-features.js';
import {meshTopologyClass} from './project-objects.js';

const fail=(message,code='MESH_COUNTERPART')=>{throw Object.assign(Error(message),{code});};
export function validateCounterpartOptions(o){
 const allowed=['geometryDigest','profileId','normal','planePoint','mode','depth','clearance','wall','thickness'];
 if(!o||Object.getPrototypeOf(o)!==Object.prototype||Object.keys(o).some(k=>!allowed.includes(k))||!/^([a-f0-9]{64})$/.test(o.geometryDigest??'')||!/^profile-[a-f0-9]{24}$/.test(o.profileId??'')||!['plug','sleeve','cap'].includes(o.mode)||!o.planePoint||!o.normal)fail('Ein Gegenstück benötigt eine gemessene aktuelle Kontur und eine Bauart.');
 validateFeatureQuery({normal:o.normal,planePoint:o.planePoint});
 const out={...o,normal:g.unit(o.normal),depth:o.depth??3,clearance:o.clearance??.25,wall:o.wall??1.2,thickness:o.thickness??2.5};
 for(const [key,min,max]of [['depth',.3,100],['clearance',.05,5],['wall',.6,20],['thickness',.6,20]])if(typeof out[key]!=='number'||!Number.isFinite(out[key])||out[key]<min||out[key]>max)fail('Gegenstück: '+key+' liegt außerhalb des zulässigen Bereichs.');
 return out;
}
export function createMeshCounterpart(node,options,{kernel}={}){
 const o=validateCounterpartOptions(options),s=g.source(node);if(s.geometryDigest!==o.geometryDigest)fail('Das Original wurde geändert. Formerkennung erneut ausführen.','MESH_COUNTERPART_STALE');
 const profiles=measuredProfiles(s,o.normal,o.planePoint),p=profiles.find(p=>p.profileId===o.profileId);if(!p)fail('Die ausgewählte Kontur ist nicht mehr vorhanden.','MESH_COUNTERPART_STALE');
 if(!p.counterparts.includes(o.mode))fail('Diese Bauart passt nicht zur ausgewählten Innen- oder Außenkontur.');
 const {f,plane}=p,low=plane-o.depth,margin=Math.max(.0001,s.extent*1e-7),gap=o.clearance+margin*8;
 if(o.depth<p.referenceInset+margin*4)fail('Die Tiefe muss bis zur gemessenen Referenzkontur reichen.');
 if(low<f.lo-margin)fail('Die Einstecktiefe reicht über das Original hinaus.');
 if(!kernel?.CrossSection)fail('Der lokale Geometriekern fehlt.');
 const owned=[],own=v=>(owned.push(v),v),CS=polygons=>own(polygons.length?new kernel.CrossSection(polygons,'NonZero'):kernel.CrossSection.square([0,0])),offset=(cs,d)=>own(own(cs.offset(d,'Round',2,96)).simplify(margin));
 const one=(cs,label)=>{const parts=cs.decompose().map(own);if(parts.length!==1||cs.area()<margin*margin*100)fail(label+' ergibt keine einzelne nutzbare Kontur.');return cs;};
 try{
  const base=CS([g.positive(p.contour)]),shadow=CS(g.obstructionPolygons(f,low-o.clearance-margin*4,plane+o.clearance+margin*4)),blocked=offset(shadow,gap);
  let section;
  if(o.mode==='sleeve'){
   // Conservative envelope includes every source triangle throughout the slab.
   // Disjoint components are rejected rather than guessed as one outer body.
   const envelope=one(own(base.add(shadow)),'Die Außenform'),inside=offset(envelope,gap),outside=offset(inside,o.wall);
   section=one(own(outside.subtract(inside)),'Die Hülse');
  }else{
   const safe=one(own(offset(base,-gap).subtract(blocked)),'Der Einsatz');
   if(safe.area()<p.area*.25)fail('Die Tiefe oder das Spiel lässt zu wenig Platz in der Öffnung.');
   if(o.mode==='plug')section=safe;
   else{const inner=one(offset(safe,-o.wall),'Der Führungsrand');section=one(own(safe.subtract(inner)),'Der Führungsrand');}
  }
  let solid=own(section.extrude(o.depth).translate([0,0,low]));
  if(o.mode==='cap'){
   const parent=profiles.find(q=>q.profileId===p.parentId);if(!parent)fail('Für eine Abdeckung fehlt eine eindeutige umgebende Außenkontur.');
   const plate=CS([g.positive(parent.contour)]),upperShadow=CS(g.obstructionPolygons(f,plane+o.clearance-margin,plane+o.clearance+o.thickness+margin));
   if(own(plate.intersect(upperShadow)).area()>margin*margin)fail('Oberhalb der Öffnung liegen Quellflächen im Bereich der Abdeckung.');
   const lid=own(plate.extrude(o.thickness).translate([0,0,plane+o.clearance])),rim=own(section.extrude(o.depth+o.clearance+.02).translate([0,0,low]));
   solid=own(kernel.Manifold.union([lid,rim]));
  }
  solid=own(solid.simplify(margin));if(solid.status()!=='NoError'||solid.volume()<=0||solid.decompose().map(own).length!==1)fail('Das Gegenstück ist kein einzelner geschlossener Körper.');
  const raw=solid.getMesh(),inverse=s.matrix.clone().invert(),verts=[];let quantization=0;
  for(let i=0;i<raw.vertProperties.length;i+=raw.numProp){const world=f.world(Array.from(raw.vertProperties.slice(i,i+3))),local=new Vector3(...world).applyMatrix4(inverse).toArray(),stored=local.map(Math.fround);quantization=Math.max(quantization,new Vector3(...stored).applyMatrix4(s.matrix).distanceTo(new Vector3(...world)));verts.push(...stored);}
  if(quantization>margin)fail('Die Koordinaten sind für diese Passung zu weit vom Ursprung entfernt.');
  const triangles=Array.from(raw.triVerts);if(s.matrix.determinant()<0)for(let i=0;i<triangles.length;i+=3)[triangles[i+1],triangles[i+2]]=[triangles[i+2],triangles[i+1]];
  const check=own(new kernel.Manifold(new kernel.Mesh({numProp:3,vertProperties:new Float32Array(verts),triVerts:new Uint32Array(triangles)})));
  if(check.status()!=='NoError'||check.volume()<=0||check.decompose().map(own).length!==1)fail('Die gespeicherte Geometrie ist numerisch nicht geschlossen.');
  const mesh={verts,triangles};if(meshTopologyClass(mesh).type!=='closedMesh')fail('Die gespeicherte Geometrie enthält zusammengefallene Flächen.');
  const points=[];for(let i=0;i<verts.length;i+=3){const q=g.sub(new Vector3(...verts.slice(i,i+3)).applyMatrix4(s.matrix).toArray(),s.anchor);points.push([g.dot(q,f.u),g.dot(q,f.v),g.dot(q,f.n)]);}
  const emitted=CS(g.obstructionPolygons({...f,points,indices:triangles},low-margin*2,plane-margin*2)),guard=offset(shadow,o.clearance-margin*2);
  if(own(emitted.intersect(guard)).area()>f.epsilon*f.epsilon*64)fail('Der gespeicherte Einsteckbereich hält den Abstand zu den Quellflächen nicht ein.');
  return {mesh,report:{mode:o.mode,profileId:p.profileId,normal:f.n,planePoint:o.planePoint,depth:o.depth,clearance:o.clearance,wall:o.wall,thickness:o.thickness,solidProven:true,storedClearanceVerified:true,sourcePreserved:true,sourceSolidProven:false,numericalMargin:margin,storedQuantizationError:quantization,physicalFitTested:false,volume:solid.volume(),scope:'Prismatic contour fit. Stored insertion surfaces checked against all source-triangle projections across the complete depth, expanded axially and radially by requested clearance. No threads, physical print fit or arbitrary 3D surface offset.'}};
 }finally{for(const v of owned.reverse())v.delete();}
}
