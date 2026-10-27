import * as THREE from 'three';
import {referenceFrame} from './mesh-engine/mesh-reference.js';
import {worldManifold,meshData,normalizeMesh,makeNode,validNode,fromMesh} from './mesh-engine/geometry.js';

export const CONNECTOR_DEFAULTS={diameter:4,length:4,anchor:2,gap:.2,endGap:.3,minWall:1,count:1,spacing:12,offsetU:0,offsetV:0,segments:64};
export function validateConnectorOptions(value){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).some(k=>!Object.hasOwn(CONNECTOR_DEFAULTS,k)))throw Error('Unbekannte Steckverbinderparameter.');
 const o={...CONNECTOR_DEFAULTS,...value};
 for(const [key,min,max] of [['diameter',.5,100],['length',.5,100],['anchor',.5,100],['gap',0,3],['endGap',0,5],['minWall',.2,20],['spacing',.5,500],['offsetU',-10000,10000],['offsetV',-10000,10000]])if(!Number.isFinite(o[key])||o[key]<min||o[key]>max)throw Error('Steckverbindermaße außerhalb des erlaubten Bereichs: '+key+'.');
 if(!Number.isInteger(o.count)||o.count<1||o.count>8||!Number.isInteger(o.segments)||o.segments<24||o.segments>256)throw Error('1–8 Stifte und 24–256 Kreisabschnitte wählen.');
 if(o.count>1&&o.spacing<o.diameter+2*o.gap+2*o.minWall)throw Error('Die Verbinder liegen zu dicht: Spiel und Mindestmaterial zwischen den Aufnahmen berücksichtigen.');
 return o;
}
export function validateConnectorReference(r){
 if(!r||Object.getPrototypeOf(r)!==Object.prototype||Object.keys(r).some(k=>!['point','normal'].includes(k))||![r.point,r.normal].every(v=>Array.isArray(v)&&v.length===3&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<=10000))||Math.hypot(...r.normal)<1e-10)throw Error('Gültigen Verbindungspunkt und eine Richtung vom Stiftteil zur Aufnahme wählen.');
 return {point:[...r.point],normal:new THREE.Vector3(...r.normal).normalize().toArray()};
}
export function connectorWorldBounds(n){
 const box=new THREE.Box3(),m=new THREE.Matrix4().fromArray(n.transform),p=new THREE.Vector3();
 if(n.mesh)for(let i=0;i<n.mesh.verts.length;i+=3)box.expandByPoint(p.fromArray(n.mesh.verts,i).applyMatrix4(m));
 else if(n.stats?.bounds)for(let i=0;i<8;i++)box.expandByPoint(p.set(...[0,1,2].map(k=>(i&(1<<k)?n.stats.bounds.max:n.stats.bounds.min)[k])).applyMatrix4(m));
 return box;
}
export function connectorDefaultReference(nodes){
 if(nodes.length!==2)return {point:[0,0,0],normal:[0,0,1]};
 const a=connectorWorldBounds(nodes[0]),b=connectorWorldBounds(nodes[1]),c=a.getCenter(new THREE.Vector3()),d=b.getCenter(new THREE.Vector3()).sub(c),axis=[0,1,2].sort((i,j)=>Math.abs(d.getComponent(j))-Math.abs(d.getComponent(i)))[0],sign=d.getComponent(axis)>=0?1:-1;
 const point=[0,1,2].map(k=>k===axis?(sign>0?a.max:a.min).getComponent(k):(Math.max(a.min.getComponent(k),b.min.getComponent(k))+Math.min(a.max.getComponent(k),b.max.getComponent(k)))/2),normal=[0,0,0];normal[axis]=sign;return {point,normal};
}
/** Boolean volume tests bound a complete conservative material envelope, rather
 * than relying on a handful of wall-thickness samples. No input is mutated. */
export function deriveMeshConnectors(kernel,legacy,reference,options){
 const o=validateConnectorOptions(options),r=validateConnectorReference(reference);
 if(legacy.length!==2||legacy.some(n=>!n.solid))throw Error('Genau zwei Material-Netzteile für Stift und Aufnahme auswählen.');
 const handles=[],own=m=>{handles.push(m);return m;},M=kernel.Manifold;
 const volume=m=>{if(m.status()!=='NoError'||!Number.isFinite(m.volume()))throw Error('Die Verbinderberechnung konnte nicht sicher geprüft werden.');return Math.max(0,m.volume());};
 const empty=(m,tolerance,message)=>{if(volume(m)>tolerance)throw Error(message);};
 const frame=referenceFrame(new THREE.Vector3(...r.point),new THREE.Vector3(...r.normal)),basis=new THREE.Matrix4().makeBasis(frame.u,frame.v,frame.normal),pins=[],cutters=[],locations=[];
 const cylinder=(p,radius,z0,z1)=>{const raw=own(M.cylinder(z1-z0,radius,radius,o.segments,false)),matrix=basis.clone().setPosition(p.clone().addScaledVector(frame.normal,z0));return own(raw.transform(matrix.elements));};
 try{
  const a=own(worldManifold(legacy[0])),b=own(worldManifold(legacy[1]));
  const sourceVolumes=[volume(a),volume(b)],pairTolerance=Math.max(1e-6,Math.min(...sourceVolumes)*1e-7);
  empty(own(a.intersect(b)),pairTolerance,'Die beiden Ausgangsteile überschneiden sich bereits. Zuerst ihre Lage korrigieren.');
  const eps=1e-4,pocketRadius=o.diameter/2+o.gap,pocketDepth=o.length+o.endGap;
  for(let i=0;i<o.count;i++){
   const point=frame.origin.clone().addScaledVector(frame.u,o.offsetU+(i-(o.count-1)/2)*o.spacing).addScaledVector(frame.v,o.offsetV);
   if(point.toArray().some(v=>Math.abs(v)>10000))throw Error('Verbindungsstelle außerhalb des Arbeitsbereichs.');
   const guardA=cylinder(point,(o.diameter/2+o.minWall)/Math.cos(Math.PI/o.segments),-o.anchor-o.minWall,-eps),guardB=cylinder(point,(pocketRadius+o.minWall)/Math.cos(Math.PI/o.segments),eps,pocketDepth+o.minWall);
   for(const [guard,body,label] of [[guardA,a,'Stiftteil'],[guardB,b,'Aufnahmeteil']])empty(own(guard.subtract(body)),Math.max(1e-6,volume(guard)*2e-6),`Verbinder ${i+1}: ${label} hat zu wenig Material, eine Öffnung oder keinen passenden Flächenkontakt. Position, Richtung, Länge oder Mindestmaterial ändern.`);
   pins.push(cylinder(point,o.diameter/2,-o.anchor,o.length));cutters.push(cylinder(point,pocketRadius,-eps,pocketDepth));locations.push(point.toArray());
  }
  const pin=own(M.union(pins)),cut=own(M.union(cutters)),added=own(a.add(pin)),pocket=own(b.subtract(cut));
  if(added.isEmpty()||pocket.isEmpty()||volume(added)<=sourceVolumes[0]||volume(pocket)>=sourceVolumes[1]||volume(pocket)<=0)throw Error('Die Verbindung erzeugt keinen passenden Stift mit Aufnahme.');
  empty(own(added.intersect(pocket)),pairTolerance,'Stift und Aufnahme kollidieren nach der Berechnung. Spiel oder Verbindungsstelle ändern.');
  const nodes=[added,pocket].map((m,i)=>{const bounds=m.boundingBox(),position=bounds.min.map((v,k)=>(v+bounds.max[k])/2),normalized=normalizeMesh(meshData(m)),n=makeNode('import',position,{id:legacy[i].id,name:(legacy[i].name+(i?' · Aufnahme':' · Passstift')).slice(0,200),size:normalized.size,mesh:normalized.mesh,color:legacy[i].color,opacity:legacy[i].opacity??1,solid:true});if(!validNode(n))throw Error('Die Verbindung überschreitet die erlaubten Netzabmessungen.');return n;});
  return {nodes,pinMesh:meshData(pin),report:{connectors:true,count:o.count,point:r.point,normal:r.normal,locations,diameter:o.diameter,socketDiameter:o.diameter+2*o.gap,length:o.length,socketDepth:pocketDepth,gapPerSide:o.gap,endGap:o.endGap,minWall:o.minWall,segments:o.segments,chordError:pocketRadius*(1-Math.cos(Math.PI/o.segments)),addedVolume:volume(added)-sourceVolumes[0],removedVolume:sourceVolumes[1]-volume(pocket),sourceVolumes,resultVolumes:[volume(added),volume(pocket)],collisionTolerance:pairTolerance,materialEnvelopeVerified:true}};
 }finally{handles.reverse().forEach(m=>m.delete());}
}
/** Other mesh bodies use exact intersections. CAD and invalid meshes use a
 * conservative world bounding box, so uncertain overlap is refused explicitly. */
export function assertConnectorNeighbors(kernel,pinMesh,neighbors){
 const pin=fromMesh(pinMesh),box=pin.boundingBox(),pinBounds=new THREE.Box3(new THREE.Vector3(...box.min),new THREE.Vector3(...box.max));
 try{for(const n of neighbors){if(n.kind==='referenceMesh'||n.kind==='mesh'&&n.meshRole==='hole'||n.kind==='cad'&&(!n.solid||n.suppressed))continue;
  if(!connectorWorldBounds(n).intersectsBox(pinBounds))continue;
  if(n.kind==='cad')throw Error(`Der Verbinder berührt den Begrenzungsraum des CAD-Nachbarn „${n.name}“. Konservativ gesperrt; Verbindungsstelle prüfen.`);
  let local,world,intersection;try{local=fromMesh(n.mesh);world=local.transform(n.transform);if(world.status()!=='NoError'||world.volume()<=0)throw Error('Nachbarnetz nicht prüfbar.');intersection=pin.intersect(world);if(intersection.status()!=='NoError')throw Error('Nachbarkollision nicht prüfbar.');if(intersection.volume()>Math.max(1e-6,pin.volume()*1e-7))throw Error(`Der Verbinder kollidiert mit „${n.name}“.`);}catch(error){throw Error(`Netz-Nachbar „${n.name}“: ${error.message}`);}finally{intersection?.delete();world?.delete();local?.delete();}
 }}finally{pin.delete();}
}
