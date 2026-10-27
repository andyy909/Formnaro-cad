import * as THREE from 'three';
import {cadInterfaceLocalBounds} from './cad-interface-state.js';
import {validateAffineMatrix} from './cad-project.js';
import {cloneCadSources} from './cad-source-clone.js';
import {flags} from './organization.js';

export const commonFrame=project=>new THREE.Matrix4().compose(new THREE.Vector3(...project.workplane.origin),new THREE.Quaternion(...project.workplane.orientation),new THREE.Vector3(1,1,1)).toArray();
const matrix=a=>new THREE.Matrix4().fromArray(a);
const vector=value=>{if(!Array.isArray(value)||value.length!==3||value.some(v=>!Number.isFinite(v)||Math.abs(v)>200000))throw Error('Drei endliche Koordinaten im Arbeitsbereich eingeben.');return value;};
export function commonBounds(node,frame=new THREE.Matrix4().toArray()){
 const transform=matrix(frame).invert().multiply(matrix(node.transform)),box=new THREE.Box3();
 if(node.kind==='cad'){const b=cadInterfaceLocalBounds(node);for(let i=0;i<8;i++)box.expandByPoint(new THREE.Vector3(...[0,1,2].map(k=>(i>>k)&1?b.max[k]:b.min[k])).applyMatrix4(transform));}
 else for(let i=0;i<node.mesh.verts.length;i+=3)box.expandByPoint(new THREE.Vector3(...node.mesh.verts.slice(i,i+3)).applyMatrix4(transform));
 return {min:box.min.toArray(),max:box.max.toArray(),center:box.getCenter(new THREE.Vector3()).toArray(),size:box.getSize(new THREE.Vector3()).toArray()};
}
export function commonEditable(project,id){const node=project.nodes.find(n=>n.id===id);if(!node||flags(node,project).locked||flags(node,project).hidden)throw Error('Ein sichtbares entsperrtes fertiges Teil auswählen.');return node;}
export function commonFit(node,{gap,axes=[0,1],kind='insert'}={}){
 if(!Number.isFinite(gap)||gap<0||gap>5||!['insert','opening'].includes(kind)||!Array.isArray(axes)||!axes.length||axes.some(k=>![0,1,2].includes(k)))throw Error('Passung: 0–5 mm je Seite und mindestens eine Achse wählen.');
 const b=cadInterfaceLocalBounds(node),m=node.transform,before=b.min.map((v,k)=>(b.max[k]-v)*Math.hypot(...m.slice(k*4,k*4+3))),after=[...before];
 for(const k of new Set(axes))after[k]+=(kind==='opening'?1:-1)*2*gap;
 if(after.some((v,k)=>!Number.isFinite(v)||v<.01||v>10000||before[k]<=0))throw Error('Diese Form ist für die gewählten Passungsmaße nicht geeignet.');
 const center=b.min.map((v,k)=>(v+b.max[k])/2),scale=new THREE.Matrix4().makeTranslation(...center).multiply(new THREE.Matrix4().makeScale(...after.map((v,k)=>v/before[k]))).multiply(new THREE.Matrix4().makeTranslation(...center.map(v=>-v)));
 return {before,after,transform:matrix(m).multiply(scale).toArray()};
}
export function commonPattern(project,id,{kind,count,step=[20,0,0],columns=3,rowStep=[0,20,0],radius=30,angle=360,rotateCopies=false,space='plane'}={}){
 if(!Number.isSafeInteger(count)||count<2||count>200||!['line','grid','circle'].includes(kind)||!['plane','world'].includes(space))throw Error('Muster: 2–200 Teile und ein gültiges Koordinatensystem wählen.');
 const original=commonEditable(project,id),base=structuredClone(original),frame=space==='plane'?commonFrame(project):new THREE.Matrix4().toArray(),f=matrix(frame),inv=f.clone().invert(),center=commonBounds(original,frame).center,copies=[];
 vector(step);vector(rowStep);if(kind==='grid'&&(!Number.isSafeInteger(columns)||columns<1||columns>200))throw Error('Raster: 1–200 Spalten.');
 if(kind==='circle'&&(!Number.isFinite(radius)||radius<=0||radius>10000||!Number.isFinite(angle)||Math.abs(angle)>3600||typeof rotateCopies!=='boolean'))throw Error('Kreismuster: gültigen Radius und Winkel wählen.');
 for(let i=kind==='circle'?0:1;i<count;i++){
  const node=i===0?original:cloneCadSources(base);let d;
  if(kind==='circle'){const theta=angle*Math.PI/180*i/(Math.abs(angle)===360?count:count-1),delta=[radius*Math.cos(theta),radius*Math.sin(theta),0];d=new THREE.Matrix4().makeTranslation(...delta);if(rotateCopies)d.multiply(new THREE.Matrix4().makeTranslation(...center)).multiply(new THREE.Matrix4().makeRotationZ(theta)).multiply(new THREE.Matrix4().makeTranslation(...center.map(v=>-v)));}
  else d=new THREE.Matrix4().makeTranslation(...step.map((v,k)=>kind==='grid'?v*(i%columns)+rowStep[k]*Math.floor(i/columns):v*i));
  node.transform=f.clone().multiply(d).multiply(inv).multiply(matrix(base.transform)).toArray();if(i)copies.push(node);
 }
 project.nodes.push(...copies);return [original.id,...copies.map(n=>n.id)];
}
export function meshFloorTransform(node,triangleIndex,point,plane){
 if(node.kind!=='mesh'||node.meshRole==='hole')throw Error('Ein bearbeitbares Materialnetz auswählen.');
 const ids=node.mesh.triangles.slice(triangleIndex*3,triangleIndex*3+3);if(!Number.isSafeInteger(triangleIndex)||triangleIndex<0||ids.length!==3)throw Error('Eine echte Netzfläche wählen.');
 const m=matrix(node.transform),tri=new THREE.Triangle(...ids.map(i=>new THREE.Vector3(...node.mesh.verts.slice(i*3,i*3+3)))),normal=tri.getNormal(new THREE.Vector3()).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(m));
 if(normal.lengthSq()<.9)throw Error('Die Netzfläche ist entartet.');const p=new THREE.Vector3(...vector(point));tri.a.applyMatrix4(m);tri.b.applyMatrix4(m);tri.c.applyMatrix4(m);
 const bounds=commonBounds(node),tolerance=Math.max(1e-6,Math.hypot(...bounds.size)*2e-6);if(tri.closestPointToPoint(p,new THREE.Vector3()).distanceTo(p)>tolerance)throw Error('Der Punkt liegt nicht auf der gewählten Fläche.');
 for(let i=0;i<node.mesh.verts.length;i+=3)if(new THREE.Vector3(...node.mesh.verts.slice(i,i+3)).applyMatrix4(m).sub(p).dot(normal)>tolerance)throw Error('Diese Fläche ist keine äußere Auflagefläche. Eine andere Fläche wählen.');
 const n=new THREE.Vector3(0,0,1).applyQuaternion(new THREE.Quaternion(...plane.orientation)),origin=new THREE.Vector3(...plane.origin),q=new THREE.Quaternion().setFromUnitVectors(normal,n.clone().negate()),height=p.clone().sub(origin).dot(n),destination=p.clone().addScaledVector(n,-height),delta=new THREE.Matrix4().makeTranslation(...destination.toArray()).multiply(new THREE.Matrix4().makeRotationFromQuaternion(q)).multiply(new THREE.Matrix4().makeTranslation(...p.clone().negate().toArray()));
 const transform=delta.multiply(m).toArray();validateAffineMatrix(transform);return transform;
}
export function commonReferenceTransform(node,source,target,offset=[0,0,0]){
 const normal=new THREE.Vector3(...vector(target.normal)).normalize();if(normal.lengthSq()<.9)throw Error('Zielnormale fehlt.');
 const u=new THREE.Vector3(1,0,0).addScaledVector(normal,-normal.x);if(u.lengthSq()<1e-8)u.set(0,1,0).addScaledVector(normal,-normal.y);u.normalize();const v=normal.clone().cross(u),desired=new THREE.Vector3(...vector(target.point)).addScaledVector(u,vector(offset)[0]).addScaledVector(v,offset[1]).addScaledVector(normal,offset[2]),delta=desired.sub(new THREE.Vector3(...vector(source)));
 return new THREE.Matrix4().makeTranslation(...delta.toArray()).multiply(matrix(node.transform)).toArray();
}
export function meshMagnetTransform(node,target){
 const m=new THREE.Matrix4().fromArray(node.transform),normal=new THREE.Vector3(...vector(target.normal)).normalize(),up=new THREE.Vector3(0,0,1).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(m));if(normal.lengthSq()<.9)throw Error('Keine eindeutige Zielfläche.');
 const rotation=new THREE.Quaternion().setFromUnitVectors(up,normal),rotated=new THREE.Matrix4().makeRotationFromQuaternion(rotation).multiply(m),bounds=commonBounds({...node,transform:rotated.toArray()}),center=new THREE.Vector3(...bounds.center),point=new THREE.Vector3(...vector(target.point));rotated.premultiply(new THREE.Matrix4().makeTranslation(...point.clone().sub(center).toArray()));
 let minimum=Infinity;for(let i=0;i<node.mesh.verts.length;i+=3)minimum=Math.min(minimum,new THREE.Vector3(...node.mesh.verts.slice(i,i+3)).applyMatrix4(rotated).sub(point).dot(normal));return new THREE.Matrix4().makeTranslation(...normal.multiplyScalar(-minimum).toArray()).multiply(rotated).toArray();
}
