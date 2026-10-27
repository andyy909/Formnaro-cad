import * as THREE from 'three';
import {makeNode,fitParameters,validNode} from './geometry.js';
import {referenceFrame} from './mesh-reference.js';

export function validateHoleOptions(value){
 const o={style:'simple',termination:'through',diameter:4,depth:5,recessDiameter:8,recessDepth:2,angle:90,gap:0,offsetU:0,offsetV:0,segments:64,...value};
 if(!['simple','countersink','counterbore'].includes(o.style)||!['through','blind'].includes(o.termination))throw Error('Unbekannte Bohrungsart.');
 for(const [key,min,max]of [['diameter',.1,200],['depth',.01,300],['recessDiameter',.1,300],['recessDepth',.01,300],['angle',30,150],['gap',0,5],['offsetU',-10000,10000],['offsetV',-10000,10000]])if(!Number.isFinite(o[key])||o[key]<min||o[key]>max)throw Error('Bohrungsmaße prüfen: Durchmesser 0,1–200 mm, Tiefe bis 300 mm, Spiel 0–5 mm je Seite.');
 if(!Number.isInteger(o.segments)||o.segments<12||o.segments>512)throw Error('Bohrungsqualität: 12 bis 512 Seiten.');
 const bore=o.diameter+o.gap*2,recess=o.recessDiameter+o.gap*2;
 if(o.style!=='simple'&&recess<bore)throw Error('Die Aufnahme muss mindestens so groß wie die Bohrung sein.');
 return {...o,bore,recess};
}
export function buildHoleCutters(geometry,matrix,reference,options){
 if(![reference.point,reference.normal].every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite))||Math.hypot(...reference.normal)<1e-8)throw Error('Ungültiger Flächenbezug. Fläche erneut wählen.');
 const o=validateHoleOptions(options),f=referenceFrame(new THREE.Vector3(...reference.point),new THREE.Vector3(...reference.normal));
 const point=f.origin.addScaledVector(f.u,o.offsetU).addScaledVector(f.v,o.offsetV),position=geometry.getAttribute('position');let far=0;
 const p=new THREE.Vector3();for(let i=0;i<position.count;i++)far=Math.max(far,-p.fromBufferAttribute(position,i).applyMatrix4(matrix).sub(point).dot(f.normal));
 if(o.termination==='through'&&far<=1e-6)throw Error('Die gewählte Bohrungsrichtung trifft das Teil nicht. Fläche erneut wählen.');
 const margin=.01,depth=o.termination==='through'?far+margin:o.depth;
 if(depth<.01||depth>10000)throw Error('Die Bohrungsrichtung trifft kein geeignetes Teil oder überschreitet den Arbeitsbereich.');
 const recessDepth=o.style==='countersink'?(o.recess-o.bore)/2/Math.tan(o.angle*Math.PI/360):o.recessDepth;
 if(o.style!=='simple'&&recessDepth>depth+1e-8)throw Error('Die Senkung ist tiefer als die Bohrung.');
 const q=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.u,f.v,f.normal)),rot=new THREE.Euler().setFromQuaternion(q,'ZYX').toArray().slice(0,3).map(v=>v*180/Math.PI);
 const common={solid:false,segments:o.segments,color:'#94a6b2',rot};let cutters;
 if(o.style==='countersink'){
  // Native countersink ends at its top. Keep that top exactly on the chosen
  // plane; a same-diameter rim above it avoids a coplanar boolean ambiguity.
  const sink=makeNode('countersink',[0,0,0],{...common,rot:[0,0,0],name:'Senkbohrung',params:{bore:o.bore,sinkDiameter:o.recess,angle:o.angle,length:depth}});fitParameters(sink);sink.rot=rot;sink.pos=point.clone().addScaledVector(f.normal,-depth/2).toArray();
  const rim=makeNode('cylinder',point.clone().addScaledVector(f.normal,margin/2).toArray(),{...common,name:'Senkungsrand',size:[o.recess,o.recess,margin]});cutters=[sink,rim];
 }else{
  cutters=[makeNode('cylinder',point.clone().addScaledVector(f.normal,(margin-depth)/2).toArray(),{...common,name:'Bohrung',size:[o.bore,o.bore,depth+margin]})];
  if(o.style==='counterbore')cutters.push(makeNode('cylinder',point.clone().addScaledVector(f.normal,(margin-recessDepth)/2).toArray(),{...common,name:'Schraubenkopfaufnahme',size:[o.recess,o.recess,recessDepth+margin]}));
 }
 if(!cutters.every(validNode))throw Error('Die Bohrung liegt außerhalb des zulässigen Arbeitsbereichs.');
 return {cutters,depth,diameter:o.bore,recessDiameter:o.recess,point:point.toArray(),normal:f.normal.toArray()};
}
