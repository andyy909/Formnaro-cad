import * as THREE from 'three';
import {matrixArray} from './geometry.js';
import {frame} from './coordinates.js';

// Scene-local controls: DOM inputs stay mounted while their anchors follow the camera.
export function createSceneTools({scene,viewport,getCamera,getNodes,getSelection,bounds,getFrame,isLocked=n=>n.locked,getMatrix=n=>new THREE.Matrix4().fromArray(matrixArray(n)),getAvoidPoints=()=>[],mutate,safe,updateSelection}) {
  const guides=new THREE.Group(),preview=new THREE.Group();scene.add(guides,preview);
  let dimension=null,alignActive=false,referenceId=null,labels=[];
  const boundsCache=new Map();
  function selectionBounds(list){const box=new THREE.Box3();for(const n of list){if(!boundsCache.has(n.id))boundsCache.set(n.id,bounds([n]));box.union(boundsCache.get(n.id));}return box;}
  const overlay=document.createElement('div');overlay.className='scene-tools';viewport.append(overlay);
  const dimensionRoot=document.createElement('div');dimensionRoot.className='dimension-fields';dimensionRoot.hidden=true;
  const alignRoot=document.createElement('div');alignRoot.className='align-markers';alignRoot.hidden=true;
  const banner=document.createElement('div');banner.className='align-banner';banner.hidden=true;
  const text=document.createElement('span'),reset=document.createElement('button'),done=document.createElement('button');
  reset.textContent='Gesamte Auswahl';reset.onclick=()=>{referenceId=null;refresh();updateSelection();};
  done.textContent='Fertig';done.onclick=()=>{alignActive=false;referenceId=null;refresh();updateSelection();};banner.append(text,reset,done);
  overlay.append(dimensionRoot,alignRoot,banner);
  overlay.addEventListener('pointerdown',e=>e.stopPropagation());
  function clear(group){for(const item of [...group.children]){group.remove(item);item.geometry?.dispose();item.material?.dispose();}}
  function line(points,color='#536e7d',dashed=false){const geometry=new THREE.BufferGeometry().setFromPoints(points);const material=dashed?new THREE.LineDashedMaterial({color,dashSize:2,gapSize:1,depthTest:false}):new THREE.LineBasicMaterial({color,depthTest:false});const object=new THREE.Line(geometry,material);object.renderOrder=25;if(dashed)object.computeLineDistances();guides.add(object);}
  function projected(point){const v=point.clone().project(getCamera());return {x:(v.x+1)*viewport.clientWidth/2,y:(1-v.y)*viewport.clientHeight/2,visible:v.z>=-1&&v.z<=1};}
  function position(element,point){const p=projected(point);element.hidden=!p.visible;element.style.left=Math.max(45,Math.min(viewport.clientWidth-45,p.x))+'px';element.style.top=Math.max(65,Math.min(viewport.clientHeight-70,p.y))+'px';}
  const fields=[];
  for(let axis=0;axis<3;axis++){
    const wrapper=document.createElement('label');wrapper.className='dimension-field';wrapper.dataset.axis=axis;
    const name=document.createElement('span');name.textContent=['Breite X','Tiefe Y','Höhe Z'][axis];
    const input=document.createElement('input');input.type='text';input.inputMode='decimal';input.setAttribute('aria-label',`${['Breite','Tiefe','Höhe'][axis]} direkt am Modell`);
    const unit=document.createElement('span');unit.className='unit';unit.textContent='mm';wrapper.append(name,input,unit);dimensionRoot.append(wrapper);fields.push({wrapper,input});
    input.onfocus=()=>input.select();input.onclick=()=>input.select();
    const commit=()=>safe(()=>{
      const node=getNodes().find(n=>n.id===dimension?.id);if(!node||isLocked(node))return;
      const raw=input.value.trim(),value=Number(raw.replace(',','.'));
      if(!raw||!Number.isFinite(value)||value<.01||value>10000){input.value=format(node.size[axis]);throw new Error('Bitte ein Maß von 0,01 bis 10000 mm eingeben.');}
      if(Math.abs(value-node.size[axis])<.000001||value===Number(format(node.size[axis]).replace(',','.')))return;
      const sizes=[...node.size];sizes[axis]=value;
      if(document.getElementById('proportions').checked){const factor=value/node.size[axis];for(let i=0;i<3;i++)sizes[i]=node.size[i]*factor;}
      if(sizes.some(v=>v<.01||v>10000)){input.value=format(node.size[axis]);throw new Error('Die proportionalen Maße liegen außerhalb von 0,01 bis 10000 mm.');}
      mutate(()=>resizeAnchored(node,sizes,dimension.corner));input.value=format(node.size[axis]);refresh();
    });
    input.onchange=commit;input.onblur=commit;
    input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();commit();input.blur();}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();const n=getNodes().find(n=>n.id===dimension?.id);if(n)input.value=format(n.size[axis]);input.blur();}};
  }
  const markers=[];
  for(let axis=0;axis<3;axis++)for(let edge=0;edge<3;edge++){
    const b=document.createElement('button');b.className='align-marker';b.dataset.axis=axis;b.dataset.edge=edge;
    const label=`${'XYZ'[axis]}: ${['Minimum','Mitte','Maximum'][edge]} ausrichten`;
    b.title=label;b.setAttribute('aria-label',label);b.innerHTML='<span class="marker-tick"></span><span class="marker-dot"></span>';
    b.onpointerenter=()=>showPreview(axis,edge);b.onpointerleave=()=>clear(preview);b.onfocus=()=>showPreview(axis,edge);b.onblur=()=>clear(preview);
    b.onclick=()=>safe(()=>applyAlign(axis,edge));alignRoot.append(b);markers.push({element:b,axis,edge,point:new THREE.Vector3()});
  }
  function format(value){return Number(value.toFixed(3)).toLocaleString(document.documentElement.lang==='en'?'en-US':'de-DE',{maximumFractionDigits:3,useGrouping:false});}
  function showDimensions(node,corner=[1,1],focusAxis=null){alignActive=false;referenceId=null;dimension={id:node.id,corner:[...corner]};refresh();updateSelection();if(focusAxis!==null){fields[focusAxis].input.focus();fields[focusAxis].input.select();}}
  function hideDimensions(){dimension=null;dimensionRoot.hidden=true;refresh();}
  function beginAlign(){const list=getSelection();if(list.length<2||list.every(n=>isLocked(n)))throw new Error('Mindestens zwei Formen auswählen; mindestens eine muss entsperrt sein.');dimension=null;alignActive=!alignActive;referenceId=null;refresh();updateSelection();}
  function chooseReference(id){if(!alignActive||!getSelection().some(n=>n.id===id))return false;referenceId=id;clear(preview);refresh();updateSelection();return true;}
  function plan(axis,edge){
    const list=getSelection();if(list.length<2)throw new Error('Zum Ausrichten mindestens zwei Formen auswählen.');
    const reference=list.find(n=>n.id===referenceId),locked=list.filter(n=>isLocked(n)),targetBounds=selectionBounds(reference?[reference]:locked.length?locked:list);
    const value=box=>edge===0?box.min.getComponent(axis):edge===1?box.getCenter(new THREE.Vector3()).getComponent(axis):box.max.getComponent(axis);
    const target=value(targetBounds);
    return list.filter(n=>!isLocked(n)&&n.id!==referenceId).map(node=>({node,delta:target-value(selectionBounds([node]))}));
  }
  function applyAlign(axis,edge){const items=plan(axis,edge);clear(preview);if(items.every(i=>Math.abs(i.delta)<.000001))return;const direction=frame(getFrame()).axes[axis];mutate(()=>items.forEach(({node,delta})=>node.pos=new THREE.Vector3(...node.pos).addScaledVector(direction,delta).toArray()));refresh();}
  function showPreview(axis,edge){clear(preview);const f=frame(getFrame());preview.position.copy(f.origin);preview.quaternion.copy(f.q);for(const {node,delta}of plan(axis,edge)){if(Math.abs(delta)<.000001)continue;const b=selectionBounds([node]),offset=new THREE.Vector3().setComponent(axis,delta);b.translate(offset);const helper=new THREE.Box3Helper(b,0xe69e36);helper.material.transparent=true;helper.material.opacity=.8;helper.material.depthTest=false;helper.renderOrder=26;preview.add(helper);}}
  function refresh(){
    clear(guides);clear(preview);boundsCache.clear();labels=[];
    const list=getSelection();if(referenceId&&!list.some(n=>n.id===referenceId))referenceId=null;
    if(alignActive&&list.length<2){alignActive=false;referenceId=null;}
    const node=list.length===1&&list[0].id===dimension?.id?list[0]:null;if(!node)dimension=null;
    dimensionRoot.hidden=!dimension;alignRoot.hidden=!alignActive;banner.hidden=!alignActive;
    document.getElementById('align-panel').hidden=!alignActive;
    const action=document.querySelector('[data-action="align"]');action.classList.toggle('active',alignActive);action.setAttribute('aria-pressed',String(alignActive));
    const ref=list.find(n=>n.id===referenceId);
    const info=document.getElementById('align-reference');if(info)info.textContent=ref?`Feste Referenz: ${ref.name}`:'Gesamte Auswahl · Objekt anklicken, um es als Referenz festzulegen.';
    if(dimension){
      const matrix=getMatrix(node),axes=[0,1,2].map(i=>new THREE.Vector3().setFromMatrixColumn(matrix,i).normalize()),center=new THREE.Vector3(...node.pos),corner=dimension.corner;
      const localToWorld=p=>new THREE.Vector3(...p).applyMatrix4(matrix),bottom=-.5;
      const specifications=[
        {a:[-.5,corner[1]*.5,bottom],b:[.5,corner[1]*.5,bottom],offset:axes[1].clone().multiplyScalar(corner[1]*7)},
        {a:[corner[0]*.5,-.5,bottom],b:[corner[0]*.5,.5,bottom],offset:axes[0].clone().multiplyScalar(corner[0]*7)},
        {a:[corner[0]*.5,corner[1]*.5,-.5],b:[corner[0]*.5,corner[1]*.5,.5],offset:axes[0].clone().multiplyScalar(corner[0]*7).addScaledVector(axes[1],corner[1]*7)}
      ];
      specifications.forEach((s,axis)=>{const a=localToWorld(s.a),b=localToWorld(s.b),start=a.clone().add(s.offset),end=b.clone().add(s.offset);line([a,start,end,b]);
        const cap=axis===2?axes[0]:axes[2];for(const p of [start,end])line([p.clone().addScaledVector(cap,-1.1),p.clone().addScaledVector(cap,1.1)]);
        const midpoint=start.clone().add(end).multiplyScalar(.5);labels.push({element:fields[axis].wrapper,point:midpoint});if(document.activeElement!==fields[axis].input)fields[axis].input.value=format(node.size[axis]);fields[axis].input.disabled=isLocked(node);
      });
    }
    if(alignActive){
      const f=frame(getFrame()),axisNames=getFrame().reference||getFrame().origin.some(v=>v!==0)||document.getElementById("coordinate-mode").value==='plane'?'UVN':'XYZ';const locked=list.filter(n=>isLocked(n)),b=selectionBounds(ref?[ref]:locked.length?locked:list),pad=Math.max(7,getCamera().position.distanceTo(b.getCenter(new THREE.Vector3()))*.035);
      text.textContent=ref?`Referenz: ${ref.name}`:'Gesamte Auswahl · ein Objekt als Referenz anklicken';reset.hidden=!referenceId;
      for(let axis=0;axis<3;axis++){
        const a=axis===0?new THREE.Vector3(b.min.x,b.min.y-pad,b.min.z):axis===1?new THREE.Vector3(b.min.x-pad,b.min.y,b.min.z):new THREE.Vector3(b.max.x+pad,b.max.y+pad,b.min.z);
        const end=a.clone().setComponent(axis,b.max.getComponent(axis));line([f.toWorld(a),f.toWorld(end)],'#273b4a');
        for(let edge=0;edge<3;edge++){const value=edge===0?b.min.getComponent(axis):edge===1?(b.min.getComponent(axis)+b.max.getComponent(axis))/2:b.max.getComponent(axis);const marker=markers[axis*3+edge];marker.point.copy(a).setComponent(axis,value);labels.push({element:marker.element,point:f.toWorld(marker.point)});marker.element.title=axisNames[axis]+': '+['Minimum','Mitte','Maximum'][edge]+' ausrichten';marker.element.setAttribute('aria-label',marker.element.title);
          const tickAxis=axis===0?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0);line([f.toWorld(marker.point.clone().addScaledVector(tickAxis,-1.7)),f.toWorld(marker.point.clone().addScaledVector(tickAxis,1.7))],'#273b4a');
          marker.element.classList.toggle('already-aligned',plan(axis,edge).every(i=>Math.abs(i.delta)<.0001));
        }
      }
    }
    reposition();
  }
  function reposition(){for(const label of labels)position(label.element,label.point);
    // Separate thin-axis handles and nearby measure labels in screen space.
    if(alignActive)for(let axis=0;axis<3;axis++){
      const f=frame(getFrame()),group=markers.slice(axis*3,axis*3+3),a=projected(f.toWorld(group[0].point)),b=projected(f.toWorld(group[2].point)),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
      if(len<62){const middle=projected(f.toWorld(group[1].point)),ux=len>1?dx/len:0,uy=len>1?dy/len:-1;group.forEach((m,i)=>{m.element.style.left=middle.x+(i-1)*32*ux+'px';m.element.style.top=middle.y+(i-1)*32*uy+'px';});}
    }
    if(dimension){const avoid=getAvoidPoints().map(projected);for(let i=0;i<labels.length;i++){const element=labels[i].element,x=parseFloat(element.style.left),y=parseFloat(element.style.top);if(avoid.some(p=>Math.abs(x-p.x)<70&&Math.abs(y-p.y)<45)){element.style.left=Math.max(65,Math.min(viewport.clientWidth-65,i===1?Math.max(...avoid.map(p=>p.x))+75:Math.min(...avoid.map(p=>p.x))-75))+'px';}}for(let i=0;i<labels.length;i++)for(let j=0;j<i;j++){const a=labels[i].element,b=labels[j].element;if(Math.abs(parseFloat(a.style.left)-parseFloat(b.style.left))<95&&Math.abs(parseFloat(a.style.top)-parseFloat(b.style.top))<65)a.style.top=Math.min(viewport.clientHeight-90,parseFloat(b.style.top)+66)+'px';}}
  }
  function escape(){if(alignActive){alignActive=false;referenceId=null;refresh();updateSelection();return true;}if(dimension){dimension=null;refresh();return true;}return false;}
  return {refresh,reposition,showDimensions,hideDimensions,beginAlign,chooseReference,applyAlign,escape,isAligning:()=>alignActive,reference:()=>referenceId,dimension:()=>dimension};
}

// Keep the opposite local corner and bottom fixed, including rotated/mirrored parts.
export function resizeAnchored(node,sizes,corner=[1,1]) {
  const matrix=new THREE.Matrix4().fromArray(matrixArray(node)),position=new THREE.Vector3(...node.pos);
  for(let axis=0;axis<3;axis++){const direction=new THREE.Vector3().setFromMatrixColumn(matrix,axis).normalize();position.addScaledVector(direction,(sizes[axis]-node.size[axis])*(axis===2?1:corner[axis])/2);}
  node.pos=position.toArray();node.size=[...sizes];
}
