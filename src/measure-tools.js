import * as THREE from 'three';
import {matrixArray} from './geometry.js';
export function createMeasureTools({scene,viewport,getCamera,getNodes,getMeshes,getPlane,isLocked,mutate,safe,toast,fmt}){
  const root=document.createElement('div');root.className='measure-banner';root.hidden=true;root.innerHTML='<span id="measure-instruction">Zwei Punkte anklicken · Fang an Punkt, Netzkante oder Fläche</span><label>Abstand (mm)<input id="point-distance" inputmode="decimal" aria-label="Zweipunktabstand"></label><span id="measure-components"></span><button id="measure-reset">Neue Punkte</button><button id="measure-close">Schließen</button>';viewport.append(root);
  const line=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xe6a136,depthTest:false}));line.renderOrder=30;line.visible=false;scene.add(line);
  let active=false,points=[];
  function resolve(p){const n=p.id&&getNodes().find(n=>n.id===p.id);return n?new THREE.Vector3(...p.local).applyMatrix4(new THREE.Matrix4().fromArray(matrixArray(n))):new THREE.Vector3(...p.world);}
  function refresh(){if(root.hidden)return;if(points.some(p=>p.id&&!getNodes().some(n=>n.id===p.id))){points=[];toast('Bezugsteil entfernt: Messpunkte erneut wählen.');}line.visible=points.length===2;const input=root.querySelector('input');input.disabled=points.length!==2;root.querySelector('#measure-instruction').textContent=points.length===0?'Ersten Punkt anklicken · Fang an Punkt, Netzkante oder Fläche':points.length===1?'Zweiten Punkt anklicken':points.map(p=>p.kind).join(' → ');
    if(points.length===2){const a=resolve(points[0]),b=resolve(points[1]),d=b.clone().sub(a);line.geometry.dispose();line.geometry=new THREE.BufferGeometry().setFromPoints([a,b]);if(document.activeElement!==input)input.value=fmt(a.distanceTo(b));root.querySelector('#measure-components').textContent=`ΔX ${fmt(d.x)} · ΔY ${fmt(d.y)} · ΔZ ${fmt(d.z)} mm`;}
  }
  function pick(hit,fallback){if(!hit)return fallback?{world:fallback.toArray(),kind:'Arbeitsebene'}:null;let point=hit.point.clone(),kind='Fläche';const geo=hit.object.geometry,position=geo.getAttribute('position'),indices=geo.index?[0,1,2].map(i=>geo.index.getX(hit.faceIndex*3+i)):[0,1,2].map(i=>hit.faceIndex*3+i),verts=indices.map(i=>new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(hit.object.matrixWorld));
    const camera=getCamera(),rect=viewport.getBoundingClientRect(),screen=p=>{const v=p.clone().project(camera);return new THREE.Vector2((v.x+1)*rect.width/2,(1-v.y)*rect.height/2);},cursor=screen(point);let best=10;
    for(const v of verts){const distance=cursor.distanceTo(screen(v));if(distance<best){best=distance;point=v;kind='Punkt';}}
    if(kind!=='Punkt')for(let i=0;i<3;i++){const edge=new THREE.Line3(verts[i],verts[(i+1)%3]),closest=edge.closestPointToPoint(hit.point,true,new THREE.Vector3()),distance=cursor.distanceTo(screen(closest));if(distance<best){best=distance;point=closest;kind='Netzkante';}}
    const n=getNodes().find(n=>n.id===hit.object.userData.id);if(!n)return null;return {id:n.id,local:point.clone().applyMatrix4(new THREE.Matrix4().fromArray(matrixArray(n)).invert()).toArray(),world:point.toArray(),kind};
  }
  function accept(hit,fallback){const p=pick(hit,fallback);if(!p)return;if(points.length===2)points=[];points.push(p);refresh();}
  function setDistance(value){if(points.length!==2||!Number.isFinite(value)||value<.01||value>100000)throw Error('Abstand: 0,01 bis 100000 mm.');const a=resolve(points[0]),b=resolve(points[1]),distance=a.distanceTo(b),n=getNodes().find(n=>n.id===points[1].id);if(!n||points[0].id===n.id)throw Error('Zum Korrigieren zwei unterschiedliche Teile wählen; der zweite Punkt muss an einem Teil liegen.');if(isLocked(n))throw Error('Das zweite Teil ist gesperrt.');if(distance<1e-6)throw Error('Für die Korrektur zuerst zwei unterschiedliche Punkte wählen.');const delta=b.sub(a).multiplyScalar((value-distance)/distance);mutate(()=>n.pos=n.pos.map((v,i)=>v+delta.getComponent(i)));refresh();}
  root.querySelector('input').onchange=()=>safe(()=>{setDistance(Number(root.querySelector('input').value.replace(',','.')));});
  root.querySelector('#measure-reset').onclick=()=>{points=[];refresh();};root.querySelector('#measure-close').onclick=()=>escape();
  function begin(){active=true;points=[];root.hidden=false;refresh();}
  function escape(){if(!active)return false;active=false;root.hidden=true;line.visible=false;return true;}
  return {begin,escape,refresh,accept,isPlacing:()=>active,state:()=>({active,points:structuredClone(points),distance:points.length===2?resolve(points[0]).distanceTo(resolve(points[1])):null}),setDistance};
}
