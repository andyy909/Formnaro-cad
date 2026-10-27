import {Vector3,Quaternion,Euler} from 'three';
import {combinedBounds} from './transform-tools.js';
import {renewIds} from './model.js';

export function alignNodes(nodes,bounds,axis,edge='center',reference=''){
  if(![0,1,2].includes(axis)||!['min','center','max'].includes(edge)||nodes.length<2)throw Error('Bitte mindestens zwei Teile und eine gültige Ausrichtung wählen.');
  const all=combinedBounds(bounds),ref=reference?bounds.find(b=>b.id===reference):all;
  if(!ref)throw Error('Das Bezugsteil ist nicht mehr ausgewählt.');
  const coordinate=b=>edge==='center'?(b.min[axis]+b.max[axis])/2:b[edge][axis],target=coordinate(ref);
  return structuredClone(nodes).map(n=>{const b=bounds.find(b=>b.id===n.id);if(!b)throw Error('Teilgrenzen fehlen.');if(n.id!==reference)n.pos[axis]+=target-coordinate(b);return n;});
}

export function patternNodes(nodes,config,existingCount){
  const {kind='line',count=2,rows=2,step=[30,0,0],rowStep=30,center=[0,0,0],axis=2,sweep=360,rotate=true}=config;
  if(!['line','grid','circle'].includes(kind)||!Number.isInteger(count)||count<2||count>100||!Number.isInteger(rows)||rows<2||rows>100||![...step,...center,rowStep,sweep].every(Number.isFinite)||step.length!==3||center.length!==3||!nodes.length||![0,1,2].includes(axis)||Math.abs(sweep)>360||Math.abs(sweep)<.01)throw Error('Anzahl, Abstände und Winkel prüfen.');
  const total=kind==='grid'?count*rows:count;
  if(existingCount+nodes.length*(total-1)>200)throw Error('Die Anordnung würde mehr als 200 Teile ergeben.');
  const result=[],direction=new Vector3(...[0,1,2].map(i=>i===axis?1:0)),origin=new Vector3(...center);
  for(let i=1;i<total;i++){
    const angle=kind==='circle'?sweep*Math.PI/180*i/(Math.abs(sweep)===360?count:count-1):0,q=new Quaternion().setFromAxisAngle(direction,angle);
    for(const source of nodes){
      const n=renewIds(structuredClone(source));n.name=(source.name+' Kopie').slice(0,200);
      if(kind==='circle'){
        n.pos=new Vector3(...n.pos).sub(origin).applyQuaternion(q).add(origin).toArray();
        if(rotate){const e=new Euler(...n.rot.map(v=>v*Math.PI/180),'ZYX'),rotation=q.clone().multiply(new Quaternion().setFromEuler(e)),out=new Euler().setFromQuaternion(rotation,'ZYX');n.rot=[out.x,out.y,out.z].map(v=>v*180/Math.PI);}
      }else{const col=kind==='grid'?i%count:i,row=kind==='grid'?Math.floor(i/count):0;n.pos=n.pos.map((v,j)=>v+step[j]*col+(j===1?row*rowStep:0));}
      result.push(n);
    }
  }
  return result;
}

export function distanceMove(points,distance,nodes){
  if(points.length!==2||!Number.isFinite(distance)||distance<0||distance>100000)throw Error('Bitte zwei Punkte und einen Abstand von 0 bis 100.000 mm wählen.');
  const [a,b]=points,node=nodes.find(n=>n.id===b.id);
  if(!node||node.locked||node.hidden||a.id===b.id)throw Error('Der zweite Punkt muss auf einem anderen, entsperrten Teil liegen.');
  const direction=new Vector3(...b.point).sub(new Vector3(...a.point)),length=direction.length();
  if(length<1e-8)throw Error('Die Punkte liegen zusammen. Bitte eine Richtung durch getrennte Punkte festlegen.');
  const delta=direction.multiplyScalar((distance-length)/length).toArray();
  return nodes.map(n=>n.id===node.id?{...structuredClone(n),pos:n.pos.map((v,i)=>v+delta[i])}:structuredClone(n));
}
