import * as THREE from 'three';
import {createScaleDimensions} from './scale-dimensions.js';
import rotateIcon from './icons/rotate.svg';
import {selectionFrame,resizeSelection,rotateSelection,rotationSnap} from './manipulation.js';
export function createPartHandles({host,camera,scene,getNodes,available,options,onStart,onPreview,onEnd,onCancel,navigate,draw}){
  const layer=document.createElement('div');layer.className='part-handles';layer.setAttribute('aria-label','Auswahl bearbeiten');host.append(layer);
  const label=document.createElement('output');label.className='handle-readout';label.hidden=true;layer.append(label);
  const widgets=[];let active=null,preview=null,ring=null;
  layer.addEventListener('pointerdown',event=>{if(event.button!==0)navigate(event);});
  layer.addEventListener('wheel',event=>navigate(event),{passive:false});layer.addEventListener('contextmenu',event=>event.preventDefault());
  function add(key,title,className,descriptor){const button=document.createElement('button');button.type='button';button.className='part-handle '+className;button.dataset.handle=key;button.title=title;button.setAttribute('aria-label',title);if(descriptor.kind==='rotate'){const img=document.createElement('img');img.src=rotateIcon;img.alt='';button.append(img);const axis=document.createElement('span');axis.textContent='XYZ'[descriptor.axis];button.append(axis);}button.addEventListener('pointerdown',e=>begin(e,button,descriptor));button.addEventListener('pointermove',move);button.addEventListener('pointerup',end);button.addEventListener('pointercancel',cancel);button.addEventListener('lostpointercapture',()=>{if(active?.button===button)cancel();});button.addEventListener('keydown',e=>{if(e.key==='Escape'&&active){e.preventDefault();e.stopPropagation();cancel();}});layer.append(button);widgets.push({key,button,...descriptor});}
  for(const x of [-1,1])for(const y of [-1,1])add(`corner-${x}-${y}`,'Ecke ziehen: Breite und Tiefe · Shift: proportional','corner-handle',{kind:'xy',sign:[x,y]});
  add('height','Höhe ziehen · Shift: proportional','height-handle',{kind:'z'});
  for(let axis=0;axis<3;axis++)add(`rotate-${axis}`,`Um ${'XYZ'[axis]} drehen · Im Kreis: 15° · Außerhalb: 1° · Shift: immer 15°`,'rotate-handle',{kind:'rotate',axis});
  function rect(){return host.getBoundingClientRect();}
  function projected(vector){const r=rect(),p=vector.clone().project(camera);return {x:(p.x+1)*r.width/2,y:(1-p.y)*r.height/2,z:p.z};}
  const dimensions=createScaleDimensions({viewport:layer,projectPoint:p=>{const q=projected(new THREE.Vector3(...p)),r=rect();return {x:q.x+r.left,y:q.y+r.top,z:q.z};},getPreferences:()=>({language:'de'})});
  function world(local,frame){return new THREE.Vector3(...local).applyMatrix4(frame.matrix);}
  function ray(event){const r=rect(),p=new THREE.Vector2((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1),caster=new THREE.Raycaster();caster.setFromCamera(p,camera);return caster.ray;}
  function pointOnPlane(event,plane){return ray(event).intersectPlane(plane,new THREE.Vector3());}
  function update(){
    const nodes=preview||getNodes(),show=!!active||(available()&&nodes.length&&!nodes.some(n=>n.hidden||n.locked));layer.hidden=!show;if(!show){dimensions.hide();return;}
    const frame=selectionFrame(nodes),size=frame.size.toArray(),corners=[];for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5])corners.push(projected(world([x*size[0],y*size[1],z*size[2]],frame)));
    const left=Math.min(...corners.map(p=>p.x)),right=Math.max(...corners.map(p=>p.x)),top=Math.min(...corners.map(p=>p.y)),bottom=Math.max(...corners.map(p=>p.y)),center=projected(frame.center),r=rect();if(center.z>1||center.z< -1){layer.hidden=true;return;}
    for(const widget of widgets){let p;
      if(widget.kind==='xy')p=projected(world([widget.sign[0]*size[0]/2,widget.sign[1]*size[1]/2,-size[2]/2],frame));
      else if(widget.kind==='z'){p=projected(world([0,0,size[2]/2],frame));p.y-=17;}
      else p=[{x:center.x,y:top-39},{x:left-32,y:(top+bottom)/2},{x:right+32,y:(top+bottom)/2}][widget.axis];
      widget.button.style.left=p.x+'px';widget.button.style.top=p.y+'px';widget.button.hidden=(!active||active.button!==widget.button)&&(p.x<8||p.x>r.width-8||p.y<8||p.y>r.height-8||p.z>1||p.z< -1);widget.button.disabled=!available()&&!active;
    }
    dimensions.draw();
  }
  function makeRing(a){
    const radius=Math.max(8,a.frame.size.length()*.68),group=new THREE.Group(),color=0x4bacc4;
    group.add(new THREE.Mesh(new THREE.RingGeometry(radius*.87,radius,96),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.19,side:THREE.DoubleSide,depthTest:false,depthWrite:false})));
    const vertices=[],stops=[];for(let i=0;i<72;i++){const angle=i*Math.PI/36,r0=radius*(i%3===0?.83:.95);vertices.push(r0*Math.cos(angle),r0*Math.sin(angle),0,radius*Math.cos(angle),radius*Math.sin(angle),0);if(i%3===0)stops.push(radius*.94*Math.cos(angle),radius*.94*Math.sin(angle),0);}group.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)),new THREE.LineBasicMaterial({color,transparent:true,opacity:.8,depthTest:false,depthWrite:false})));
    group.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(stops,3)),new THREE.PointsMaterial({color:0x267f9a,size:4,sizeAttenuation:false,depthTest:false,depthWrite:false})));
    group.position.copy(a.frame.center);group.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),a.normal);
    if(a.startVector?.lengthSq()>1e-10){const tangent=a.startVector.clone().addScaledVector(a.normal,-a.startVector.dot(a.normal)).normalize(),bitangent=new THREE.Vector3().crossVectors(a.normal,tangent).normalize();group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(tangent,bitangent,a.normal));}
    const indicator=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(radius*.7,0,0),new THREE.Vector3(radius,0,0)]),new THREE.LineBasicMaterial({color:0x267f9a,depthTest:false,depthWrite:false}));group.add(indicator);group.userData.indicator=indicator;
    a.outline=Array.from({length:96},(_,i)=>projected(new THREE.Vector3(radius*Math.cos(i*Math.PI/48),radius*Math.sin(i*Math.PI/48),0).applyQuaternion(group.quaternion).add(a.frame.center)));group.traverse(o=>o.renderOrder=30);scene.add(group);ring=group;
  }
  function insideRing(event,a){const r=rect(),x=event.clientX-r.left,y=event.clientY-r.top;let inside=false;for(let i=0,j=a.outline.length-1;i<a.outline.length;j=i++){const p=a.outline[i],q=a.outline[j];if((p.y>y)!==(q.y>y)&&x<(q.x-p.x)*(y-p.y)/(q.y-p.y)+p.x)inside=!inside;}return inside;}
  function clearRing(){if(!ring)return;scene.remove(ring);ring.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});ring=null;}
  function begin(event,button,descriptor){
    if(event.button!==0||active||!available())return;event.preventDefault();event.stopPropagation();
    const nodes=getNodes();if(!nodes.length||nodes.some(n=>n.locked||n.hidden))return;
    const frame=selectionFrame(nodes),a={...descriptor,button,pointerId:event.pointerId,nodes:structuredClone(nodes),frame,start:{x:event.clientX,y:event.clientY},moved:false,angle:0,rawAngle:0};
    if(a.kind==='xy'){a.normal=new THREE.Vector3(0,0,1).applyQuaternion(frame.quaternion);a.plane=new THREE.Plane().setFromNormalAndCoplanarPoint(a.normal,world([0,0,-frame.size.z/2],frame));const hit=pointOnPlane(event,a.plane);if(!hit)return;a.offset=hit.applyMatrix4(frame.inverse).sub(new THREE.Vector3(a.sign[0]*frame.size.x/2,a.sign[1]*frame.size.y/2,-frame.size.z/2));}
    else if(a.kind==='z'){const bottom=projected(world([0,0,-frame.size.z/2],frame)),top=projected(world([0,0,frame.size.z/2],frame));let dx=top.x-bottom.x,dy=top.y-bottom.y,len=Math.hypot(dx,dy);if(len<12){dx=0;dy=-1;len=Math.max(35,(frame.size.z/Math.max(frame.size.x,frame.size.y))*Math.max(70,Math.hypot(rect().width,rect().height)*.2));}else{dx/=len;dy/=len;}a.screenAxis={x:dx,y:dy,length:len};}
    else{a.normal=new THREE.Vector3().setComponent(a.axis,1).applyQuaternion(frame.quaternion);a.plane=new THREE.Plane().setFromNormalAndCoplanarPoint(a.normal,frame.center);a.startVector=pointOnPlane(event,a.plane)?.sub(frame.center);a.screenCenter=projected(frame.center);a.fallback=!a.startVector||a.startVector.length()<1e-5||Math.abs(ray(event).direction.dot(a.normal))<.08;makeRing(a);}
    active=a;preview=structuredClone(nodes);button.setPointerCapture(event.pointerId);button.classList.add('dragging');onStart();update();draw();
  }
  function move(event){
    const a=active;if(!a||event.pointerId!==a.pointerId)return;event.preventDefault();event.stopPropagation();if(!a.moved&&Math.hypot(event.clientX-a.start.x,event.clientY-a.start.y)<3)return;a.moved=true;
    if(a.kind==='rotate'){
      let angle;
      if(a.fallback){angle=(event.clientX-a.start.x-(event.clientY-a.start.y))*.65;}
      else{const v=pointOnPlane(event,a.plane)?.sub(a.frame.center);if(!v||v.lengthSq()<1e-10)return;angle=Math.atan2(new THREE.Vector3().crossVectors(a.startVector,v).dot(a.normal),a.startVector.dot(v))*180/Math.PI;}
      if(!a.fallback){let difference=angle-a.angle;if(difference>180)difference-=360;if(difference< -180)difference+=360;a.rawAngle+=difference;a.angle=angle;}else a.rawAngle=angle;
      const {degrees,step}=rotationSnap(a.rawAngle,insideRing(event,a),event.shiftKey);ring.userData.indicator.rotation.z=degrees*Math.PI/180;preview=rotateSelection(a.nodes,a.frame,a.axis,degrees);label.textContent=`${degrees}° · ${'XYZ'[a.axis]} · ${step===15?'15°-Raster':'1° fein'}`;
    }else{
      let local;
      if(a.kind==='xy'){const hit=pointOnPlane(event,a.plane);if(!hit)return;local=hit.applyMatrix4(a.frame.inverse).sub(a.offset).toArray();}
      else{const delta=(event.clientX-a.start.x)*a.screenAxis.x+(event.clientY-a.start.y)*a.screenAxis.y;local=[0,0,a.frame.size.z/2+delta/a.screenAxis.length*a.frame.size.z];}
      preview=resizeSelection(a.nodes,a.frame,{kind:a.kind,sign:a.sign,point:local,uniform:event.shiftKey,snap:options().snap});const frame=selectionFrame(preview),size=frame.size.toArray();dimensions.update({bounds:{min:size.map(v=>-v/2),max:size.map(v=>v/2)},worldMatrix:frame.matrix.toArray(),sizes:size});
    }
    const r=rect();label.hidden=a.kind!=='rotate';label.style.left=Math.max(10,Math.min(r.width-180,event.clientX-r.left+18))+'px';label.style.top=Math.max(10,Math.min(r.height-40,event.clientY-r.top+16))+'px';onPreview(preview);draw();
  }
  function finish(){const a=active;active=null;preview=null;if(a){a.button.classList.remove('dragging');if(a.button.hasPointerCapture(a.pointerId))a.button.releasePointerCapture(a.pointerId);}label.hidden=true;dimensions.hide();clearRing();return a;}
  function end(event){if(!active||event.pointerId!==active.pointerId)return;event.preventDefault();event.stopPropagation();const result=preview,a=finish();if(a.moved)onEnd(result);else onCancel();update();draw();}
  function cancel(){if(!active)return false;finish();onCancel();update();draw();return true;}
  return {update,cancel,active:()=>!!active};
}
