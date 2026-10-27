import * as THREE from 'three';
import {cadRotationSnap,cadRotationDelta} from './cad-rotation.js';
import rotateIcon from './icons/rotate-part.svg';
import './cad-rotation-handles.css';

/** Mini's rotation ring, using the large editor's world/workplane axes and
 * confirmed gesture transaction. The ring is a transient display helper. */
export function createCadRotationHandles({host,camera,scene,getFrame,onStart,onPreview,onEnd,onCancel,invalidate}){
  const layer=document.createElement('div');layer.className='cad-rotation-handles';layer.setAttribute('aria-label','Auswahl drehen');layer.hidden=true;host.append(layer);
  const label=document.createElement('output');label.className='cad-rotation-readout';label.hidden=true;layer.append(label);
  const group=new THREE.Group();group.name='Drehkreis';scene.add(group);
  const buttons=[];let active=null;
  const rect=()=>host.getBoundingClientRect();
  const hidden=(element,value)=>{if(element.hidden!==value)element.hidden=value;};
  function overlayBoxes(){const r=rect();return [...document.querySelectorAll('main > .right-panel,.view-controls,.mode-switch,.view-bottom,.view-top')].filter(e=>e.checkVisibility()).map(e=>{const b=e.getBoundingClientRect();return {x:b.left-r.left,y:b.top-r.top,width:b.width,height:b.height};}).filter(b=>b.x<r.width&&b.x+b.width>0&&b.y<r.height&&b.y+b.height>0);}
  function placeBox(x,y,width,height,blocked){
    const r=rect(),initial={x:Math.max(8,Math.min(r.width-width-8,x)),y:Math.max(8,Math.min(r.height-height-8,y))},free=p=>blocked.every(b=>p.x+width+5<=b.x||p.x>=b.x+b.width+5||p.y+height+5<=b.y||p.y>=b.y+b.height+5);if(free(initial))return initial;
    const xs=[x,...blocked.flatMap(b=>[b.x-width-8,b.x+b.width+8])],ys=[y,...blocked.flatMap(b=>[b.y-height-8,b.y+b.height+8])],candidates=[];
    for(const px of xs)for(const py of ys){const p={x:Math.max(8,Math.min(r.width-width-8,px)),y:Math.max(8,Math.min(r.height-height-8,py))};if(blocked.every(b=>p.x+width+5<=b.x||p.x>=b.x+b.width+5||p.y+height+5<=b.y||p.y>=b.y+b.height+5))candidates.push(p);}
    return candidates.sort((a,b)=>(a.x-x)**2+(a.y-y)**2-((b.x-x)**2+(b.y-y)**2))[0];
  }
  function projected(p){const r=rect(),v=p.clone().project(camera());return {x:(v.x+1)*r.width/2,y:(1-v.y)*r.height/2,z:v.z};}
  function ray(event){const r=rect(),caster=new THREE.Raycaster();camera().updateMatrixWorld(true);caster.setFromCamera(new THREE.Vector2((event.clientX-r.left)/r.width*2-1,1-(event.clientY-r.top)/r.height*2),camera());return caster.ray;}
  const onPlane=(event,a)=>ray(event).intersectPlane(a.plane,new THREE.Vector3());
  for(let axis=0;axis<3;axis++){
    const button=document.createElement('button');button.type='button';button.className='cad-rotation-handle';button.dataset.rotationAxis=axis;
    button.title=`Um ${'XYZ'[axis]} drehen · Im Kreis: 15° · Außerhalb: 1° · Shift: immer 15°`;button.setAttribute('aria-label',button.title);
    const img=document.createElement('img');img.src=rotateIcon;img.alt='';const letter=document.createElement('span');letter.textContent='XYZ'[axis];button.append(img,letter);layer.append(button);buttons.push(button);
    button.addEventListener('pointerdown',e=>begin(e,button,axis));button.addEventListener('pointermove',move);button.addEventListener('pointerup',end);
    button.addEventListener('pointercancel',()=>cancel());button.addEventListener('lostpointercapture',()=>{if(active?.button===button)cancel();});
    button.addEventListener('keydown',e=>{if(e.key==='Escape'&&active){e.preventDefault();e.stopPropagation();cancel();}});
    button.addEventListener('contextmenu',e=>e.preventDefault());
  }
  function update(){
    const f=active?.frame??getFrame();hidden(layer,!f);if(!f)return;
    const center=projected(f.center);if(center.z< -1||center.z>1){hidden(layer,true);return;}
    const corners=[];for(let n=0;n<8;n++)corners.push(projected(new THREE.Vector3(...f.bounds.min.map((v,k)=>n&(1<<k)?f.bounds.max[k]:v))));
    const left=Math.min(...corners.map(p=>p.x)),right=Math.max(...corners.map(p=>p.x)),top=Math.min(...corners.map(p=>p.y)),bottom=Math.max(...corners.map(p=>p.y)),r=rect();
    const positions=[{x:center.x,y:top-39},{x:left-32,y:(top+bottom)/2},{x:right+32,y:(top+bottom)/2}];
    const blocked=overlayBoxes(),obstacles=(f.obstacles??[]).map(projected).map(p=>({x:p.x-13,y:p.y-13,width:26,height:26}));
    buttons.forEach((button,i)=>{const p=positions[i],placement=placeBox(p.x-16,p.y-15,32,30,[...blocked,...obstacles]);if(placement){button.style.left=placement.x+16+'px';button.style.top=placement.y+15+'px';obstacles.push({x:placement.x,y:placement.y,width:32,height:30});}hidden(button,!placement||(!!active&&active.button!==button));});
    if(active)active.outline=Array.from({length:96},(_,i)=>projected(new THREE.Vector3(active.radius*Math.cos(i*Math.PI/48),active.radius*Math.sin(i*Math.PI/48),0).applyMatrix4(group.matrixWorld)));
  }
  function makeRing(a){
    const radius=a.radius=Math.max(8,a.frame.size.length()*.68),color=0x4bacc4;
    group.add(new THREE.Mesh(new THREE.RingGeometry(radius*.87,radius,96),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.19,side:THREE.DoubleSide,depthTest:false,depthWrite:false})));
    const vertices=[],stops=[];for(let i=0;i<72;i++){const angle=i*Math.PI/36,r0=radius*(i%3===0?.83:.95);vertices.push(r0*Math.cos(angle),r0*Math.sin(angle),0,radius*Math.cos(angle),radius*Math.sin(angle),0);if(i%3===0)stops.push(radius*.94*Math.cos(angle),radius*.94*Math.sin(angle),0);}
    group.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)),new THREE.LineBasicMaterial({color,transparent:true,opacity:.8,depthTest:false,depthWrite:false})));
    group.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(stops,3)),new THREE.PointsMaterial({color:0x267f9a,size:4,sizeAttenuation:false,depthTest:false,depthWrite:false})));
    group.position.copy(a.frame.center);group.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),a.normal);
    if(!a.fallback){const tangent=a.startVector.clone().normalize(),bitangent=new THREE.Vector3().crossVectors(a.normal,tangent).normalize();group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(tangent,bitangent,a.normal));}
    const indicator=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(radius*.7,0,0),new THREE.Vector3(radius,0,0)]),new THREE.LineBasicMaterial({color:0x267f9a,depthTest:false,depthWrite:false}));group.add(indicator);a.indicator=indicator;
    group.traverse(o=>{o.renderOrder=30;});group.updateMatrixWorld(true);
  }
  function insideRing(event,a){const r=rect(),x=event.clientX-r.left,y=event.clientY-r.top;let inside=false;for(let i=0,j=a.outline.length-1;i<a.outline.length;j=i++){const p=a.outline[i],q=a.outline[j];if((p.y>y)!==(q.y>y)&&x<(q.x-p.x)*(y-p.y)/(q.y-p.y)+p.x)inside=!inside;}return inside;}
  function clearRing(){for(const child of [...group.children]){child.geometry?.dispose();child.material?.dispose();group.remove(child);}}
  function begin(event,button,axis){
    if(event.button!==0||active)return;const f=getFrame();if(!f)return;event.preventDefault();event.stopPropagation();
    const normal=new THREE.Vector3().setComponent(axis,1).applyQuaternion(f.quaternion),a={frame:f,normal,axis,button,pointerId:event.pointerId,start:{x:event.clientX,y:event.clientY},moved:false,angle:0,rawAngle:0,degrees:0};
    a.plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,f.center);a.startVector=onPlane(event,a)?.sub(f.center);
    a.fallback=!a.startVector||a.startVector.length()<1e-5||Math.abs(ray(event).direction.dot(normal))<.08;
    if(!onStart())return;active=a;button.setPointerCapture(event.pointerId);button.classList.add('dragging');makeRing(a);update();readout(event,0,15);invalidate('rotation-start');
  }
  function readout(event,degrees,step){const r=rect();label.hidden=false;label.textContent=`${degrees}° · ${'XYZ'[active.axis]} · ${step===15?'15°-Raster':'1° fein'}`;label.dataset.degrees=degrees;label.dataset.step=step;label.dataset.axis=active.axis;const p=placeBox(event.clientX-r.left+18,event.clientY-r.top+16,label.offsetWidth,label.offsetHeight,overlayBoxes());hidden(label,!p);if(p){label.style.left=p.x+'px';label.style.top=p.y+'px';}}
  function move(event){
    const a=active;if(!a||event.pointerId!==a.pointerId)return;event.preventDefault();event.stopPropagation();if(!a.moved&&Math.hypot(event.clientX-a.start.x,event.clientY-a.start.y)<3)return;a.moved=true;
    let angle;if(a.fallback)angle=(event.clientX-a.start.x-(event.clientY-a.start.y))*.65;
    else{const v=onPlane(event,a)?.sub(a.frame.center);if(!v||v.lengthSq()<1e-10)return;angle=Math.atan2(new THREE.Vector3().crossVectors(a.startVector,v).dot(a.normal),a.startVector.dot(v))*180/Math.PI;}
    if(a.fallback)a.rawAngle=angle;else{let difference=angle-a.angle;if(difference>180)difference-=360;if(difference< -180)difference+=360;a.rawAngle+=difference;a.angle=angle;}
    const {degrees,step}=cadRotationSnap(a.rawAngle,insideRing(event,a),event.shiftKey);a.degrees=degrees;a.indicator.rotation.z=degrees*Math.PI/180;
    onPreview(cadRotationDelta(a.frame.center.toArray(),a.normal.toArray(),degrees));readout(event,degrees,step);invalidate('rotation');
  }
  function finish(){const a=active;active=null;if(a){a.button.classList.remove('dragging');if(a.button.hasPointerCapture(a.pointerId))a.button.releasePointerCapture(a.pointerId);}label.hidden=true;clearRing();return a;}
  function end(event){if(!active||event.pointerId!==active.pointerId)return;event.preventDefault();event.stopPropagation();const a=finish();if(a.moved&&a.degrees%360!==0)onEnd();else onCancel();update();invalidate('rotation-end');}
  function cancel({notify=true}={}){if(!active)return false;finish();if(notify)onCancel();update();invalidate('rotation-cancel');return true;}
  return {group,update,cancel,active:()=>!!active,dispose:()=>{cancel({notify:false});clearRing();group.removeFromParent();layer.remove();}};
}
