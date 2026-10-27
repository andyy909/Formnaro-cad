import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {matrixArray} from './engine/geometry.js';
import {placementOnSurface,rectangleHits} from './placement.js';
import {createPartHandles} from './part-handles.js';
import {installTouchNavigation} from './touch-navigation.js';
export function createViewport(host,{select,selectMany,transformStart,transformEnd,transformCancel,placed,placementChanged,measured,options=()=>({snap:1,align:true})}){
  const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor('#edf0f1');renderer.outputColorSpace=THREE.SRGBColorSpace;
  host.prepend(renderer.domElement);const canvas=renderer.domElement;canvas.setAttribute('aria-label','3D-Modell');
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.1,20000);camera.up.set(0,0,1);camera.position.set(175,-220,190);
  const orbit=new OrbitControls(camera,canvas);orbit.target.set(0,0,10);orbit.mouseButtons={LEFT:null,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.ROTATE};orbit.screenSpacePanning=true;orbit.minDistance=5;orbit.maxDistance=15000;
  scene.add(new THREE.HemisphereLight('#ffffff','#9eacbb',2.8));const key=new THREE.DirectionalLight('#ffffff',3);key.position.set(80,-60,160);scene.add(key);
  const grid=new THREE.GridHelper(200,40,'#bac6cd','#d1d9dd');grid.rotation.x=Math.PI/2;grid.position.z=-.04;scene.add(grid);
  const border=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-100,-100,0],[100,-100,0],[100,100,0],[-100,100,0]].map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color:'#aebfc7'}));scene.add(border);
  const axes=new THREE.AxesHelper(18);axes.position.set(-100,-100,0);scene.add(axes);
  const objects=new Map(),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),proxy=new THREE.Object3D();scene.add(proxy);
  const gizmo=new TransformControls(camera,canvas);gizmo.setTranslationSnap(1);gizmo.setRotationSnap(Math.PI/36);gizmo.setSize(.85);scene.add(gizmo.getHelper());
  const marquee=document.createElement('div');marquee.className='selection-rectangle';marquee.hidden=true;host.append(marquee);
  let selected=new Set(),nodes=[],enabled=true,dragging=false,originals=[],startMatrix=new THREE.Matrix4(),gesture=null,placement=null,frames=0,suppressClick=false,partHandles,measurement=null;
  function draw(){frames++;partHandles?.update();renderer.render(scene,camera);}
  function ray(event){const r=canvas.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);return raycaster;}
  function hit(event,exclude=new Set(),bodiesOnly=false){return ray(event).intersectObjects([...objects].filter(([id,item])=>!exclude.has(id)&&item.mesh.visible&&(!bodiesOnly||nodes.find(n=>n.id===id)?.solid)).map(([,item])=>item.mesh),false)[0];}
  function restore(){for(const n of nodes){const item=objects.get(n.id);if(item){item.mesh.visible=!n.hidden;item.mesh.matrix.fromArray(matrixArray(n));item.mesh.matrix.decompose(item.mesh.position,item.mesh.quaternion,item.mesh.scale);item.mesh.updateMatrixWorld(true);item.box?.update();}}}
  orbit.addEventListener('change',draw);gizmo.addEventListener('change',draw);
  gizmo.addEventListener('dragging-changed',event=>{dragging=event.value;orbit.enabled=!dragging;});
  gizmo.addEventListener('mouseDown',()=>{originals=[...selected].map(id=>({id,matrix:objects.get(id).mesh.matrix.clone()}));proxy.updateMatrixWorld();startMatrix.copy(proxy.matrixWorld).invert();transformStart();});
  gizmo.addEventListener('objectChange',()=>{
    if(!dragging)return;proxy.updateMatrixWorld();const delta=proxy.matrixWorld.clone().multiply(startMatrix);
    for(const {id,matrix}of originals){const item=objects.get(id);if(item){item.mesh.matrix.copy(delta).multiply(matrix);item.mesh.matrix.decompose(item.mesh.position,item.mesh.quaternion,item.mesh.scale);item.mesh.updateMatrixWorld();item.box?.update();}}draw();
  });
  function changes(ids){return ids.map(id=>{const mesh=objects.get(id).mesh,e=new THREE.Euler().setFromQuaternion(mesh.quaternion,'ZYX');return {id,pos:mesh.position.toArray(),rot:[e.x,e.y,e.z].map(v=>v*180/Math.PI)};});}
  gizmo.addEventListener('mouseUp',()=>{if(!originals.length)return;const result=changes(originals.map(o=>o.id));originals=[];transformEnd(result);});
  function dispose(item){scene.remove(item.mesh);item.mesh.geometry.dispose();item.mesh.material.dispose();item.edges.geometry.dispose();item.edges.material.dispose();if(item.box){scene.remove(item.box);item.box.dispose();}}
  function bufferGeometry(data){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data.verts,3));g.setIndex(data.triangles);if(data.normals){g.setAttribute('normal',new THREE.Float32BufferAttribute(data.normals,3));g.normalizeNormals();}else g.computeVertexNormals();g.computeBoundingBox();return g;}
  function sync(nextNodes,geometryData){
    nodes=nextNodes;const ids=new Set(nodes.map(n=>n.id));for(const[id,item]of objects)if(!ids.has(id)){dispose(item);objects.delete(id);}
    for(const node of nodes){
      let item=objects.get(node.id),data=geometryData.get(node.id);if(!data)continue;
      if(!item||item.data!==data){
        if(item)dispose(item);const geometry=bufferGeometry(data),material=new THREE.MeshStandardMaterial({color:node.color,roughness:.75,metalness:0,flatShading:!!node.mesh,side:THREE.DoubleSide});
        const mesh=new THREE.Mesh(geometry,material);mesh.userData.id=node.id;mesh.rotation.order='ZYX';mesh.matrixAutoUpdate=false;
        const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,28),new THREE.LineBasicMaterial({color:'#344c60',transparent:true,opacity:.28}));mesh.add(edges);scene.add(mesh);item={mesh,edges,data};objects.set(node.id,item);
      }
      item.mesh.material.color.set(node.solid?node.color:'#7293a8');item.mesh.material.transparent=!node.solid;item.mesh.material.opacity=node.solid?1:.33;item.mesh.material.depthWrite=node.solid;
    }restore();updateSelection(selected,nodes);draw();
  }
  function updateSelection(ids,nextNodes=nodes){
    selected=new Set(ids);nodes=nextNodes;gizmo.detach();
    for(const[id,item]of objects){if(item.box){scene.remove(item.box);item.box.dispose();item.box=null;}if(selected.has(id)&&item.mesh.visible){item.box=new THREE.BoxHelper(item.mesh,'#e4754c');scene.add(item.box);}}
    const eligible=nodes.filter(n=>selected.has(n.id)&&!n.locked&&!n.hidden);
    if(!options().touchUI&&options().touchMode!=='view'&&!options().multiSelect&&!measurement&&!placement&&!gesture&&eligible.length&&eligible.length===selected.size){
      const b=new THREE.Box3();for(const n of eligible)b.union(new THREE.Box3().setFromObject(objects.get(n.id).mesh));
      b.getCenter(proxy.position);proxy.rotation.set(0,0,0);proxy.scale.set(1,1,1);proxy.updateMatrixWorld();gizmo.attach(proxy);
    }draw();
  }
  function surfaceAt(event,exclude=new Set()){
    const target=hit(event,exclude,true);
    if(target){
      const mesh=target.object,normal=target.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)).normalize(),origin=new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
      origin.addScaledVector(normal,target.point.clone().sub(origin).dot(normal));
      let tangent=new THREE.Vector3(1,0,0).transformDirection(mesh.matrixWorld);tangent.addScaledVector(normal,-tangent.dot(normal));if(tangent.lengthSq()<1e-8)tangent=new THREE.Vector3(0,1,0).transformDirection(mesh.matrixWorld);
      return {point:target.point.toArray(),normal:normal.toArray(),origin:origin.toArray(),tangent:tangent.normalize().toArray(),targetId:mesh.userData.id};
    }
    const point=ray(event).ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),0),new THREE.Vector3());
    return point?{point:point.toArray(),normal:[0,0,1],origin:[0,0,0],tangent:[1,0,0],targetId:null}:null;
  }
  function cancelPlacement(){
    if(!placement)return false;const {ghost,marker}=placement;scene.remove(ghost,marker);ghost.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});marker.geometry.dispose();marker.material.dispose();placement=null;canvas.style.cursor='';restore();updateSelection(selected);placementChanged?.(false);return true;
  }
  function beginPlacement(node,data,{existing=false,click=false,members=null}={}){
    cancelInteraction();const material=n=>new THREE.MeshStandardMaterial({color:n.solid?n.color:'#7293a8',transparent:true,opacity:n.solid ? .58 : .25,depthWrite:false,flatShading:!!node.mesh,side:THREE.DoubleSide});
    const ghost=members?new THREE.Group():new THREE.Mesh(bufferGeometry(data),material(node));
    if(members){const inverse=new THREE.Matrix4().fromArray(matrixArray(node)).invert();for(const part of members){const mesh=new THREE.Mesh(bufferGeometry(part.data),material(part.node));mesh.matrixAutoUpdate=false;mesh.matrix.multiplyMatrices(inverse,new THREE.Matrix4().fromArray(matrixArray(part.node)));ghost.add(mesh);}}
    ghost.matrixAutoUpdate=false;ghost.visible=false;
    const marker=new THREE.Mesh(new THREE.RingGeometry(2.3,2.8,24),new THREE.MeshBasicMaterial({color:'#277d86',side:THREE.DoubleSide,depthTest:false}));marker.visible=false;marker.renderOrder=20;scene.add(ghost,marker);
    placement={node:structuredClone(node),data,existing,click,ghost,marker,result:null,exclude:new Set(existing?[node.id]:[])};
    if(existing){objects.get(node.id).mesh.visible=false;objects.get(node.id).box&&(objects.get(node.id).box.visible=false);}gizmo.detach();canvas.style.cursor='crosshair';placementChanged?.(true);draw();
  }
  function updatePlacement(event){
    if(!placement)return null;const p=placement,surface=surfaceAt(event,p.exclude);p.result=null;
    if(surface){
      let result=placementOnSurface(p.node,p.data,surface,options());
      // A snapped anchor must still land on the actual finite mesh surface.
      if(surface.targetId&&options().snap>0){
        const n=new THREE.Vector3(...surface.normal),anchor=new THREE.Vector3(...result.anchor);raycaster.set(anchor.clone().addScaledVector(n,.002),n.clone().negate());const hits=raycaster.intersectObject(objects.get(surface.targetId).mesh,false);
        if(!hits.some(h=>h.distance<.004))result=placementOnSurface(p.node,p.data,surface,{...options(),snap:0});
      }
      p.result={...result,id:p.node.id};p.ghost.matrix.fromArray(matrixArray({...p.node,pos:result.pos,rot:result.rot}));p.ghost.updateMatrixWorld(true);p.marker.position.fromArray(result.anchor).addScaledVector(new THREE.Vector3(...result.normal),.04);p.marker.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(...result.normal));
    }p.ghost.visible=!!p.result;p.marker.visible=!!p.result;draw();return p.result;
  }
  function finishPlacement(){const p=placement,result=p?.result?{node:{...p.node,pos:[...p.result.pos],rot:[...p.result.rot]},existing:p.existing,targetId:p.result.targetId,anchor:p.result.anchor,normal:p.result.normal}:null;cancelPlacement();return result;}
  function cancelInteraction(){
    let changed=stopMeasurement();changed=!!partHandles?.cancel()||changed;changed=cancelPlacement()||changed;if(gesture){const id=gesture.pointerId;gesture=null;marquee.hidden=true;restore();if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);changed=true;}
    if(originals.length){originals=[];gizmo.reset();gizmo.dragging=false;dragging=false;restore();changed=true;}
    orbit.enabled=true;gizmo.enabled=enabled;updateSelection(selected);return changed;
  }
  function projectedRect(item){
    const box=item.mesh.geometry.boundingBox,points=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(new THREE.Vector3(x,y,z).applyMatrix4(item.mesh.matrixWorld).project(camera));
    if(points.every(p=>p.z>1||p.z< -1))return null;const r=canvas.getBoundingClientRect(),xs=points.map(p=>r.left+(p.x+1)*r.width/2),ys=points.map(p=>r.top+(1-p.y)*r.height/2);return {left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys)};
  }
  installTouchNavigation({canvas,camera,orbit,mode:()=>options().touchMode,enabled:()=>enabled,cancel:()=>{cancelInteraction();transformCancel?.();},draw});
  canvas.addEventListener('pointerdown',event=>{
    if(event.button===1&&enabled)event.preventDefault();
    if(event.button!==0||!enabled)return;
    if(measurement){event.preventDefault();event.stopImmediatePropagation();pickMeasure(event);suppressClick=true;return;}
    if(placement?.click){event.preventDefault();event.stopImmediatePropagation();updatePlacement(event);const result=finishPlacement();if(result)placed?.(result);suppressClick=true;return;}
    const object=hit(event),id=object?.object.userData.id,add=event.shiftKey||event.ctrlKey||event.metaKey||options().multiSelect;
    // Shift-click must select the part even if a handle covers that pixel.
    if(add&&id){event.preventDefault();event.stopImmediatePropagation();select(id,true);suppressClick=true;return;}
    if(gizmo.object&&gizmo.enabled){ray(event);gizmo.pointerHover({x:pointer.x,y:pointer.y,button:event.button});if(gizmo.axis)return;}
    if(id&&!selected.has(id))select(id,false);
    const ids=[...selected],movable=id&&ids.length&&ids.every(i=>nodes.some(n=>n.id===i&&!n.locked&&!n.hidden));
    gesture={pointerId:event.pointerId,start:{x:event.clientX,y:event.clientY},id,kind:id?'move':'marquee',movable,active:false,ids,plane:object?new THREE.Plane(new THREE.Vector3(0,0,1),-object.point.z):null,anchor:object?.point.clone(),matrices:ids.filter(i=>objects.has(i)).map(i=>({id:i,matrix:objects.get(i).mesh.matrix.clone()}))};
    event.preventDefault();event.stopImmediatePropagation();canvas.setPointerCapture(event.pointerId);suppressClick=false;
  },true);
  canvas.addEventListener('pointermove',event=>{
    if(placement?.click){updatePlacement(event);return;}
    const g=gesture;if(!g)return;event.preventDefault();event.stopImmediatePropagation();
    if(!g.active&&Math.hypot(event.clientX-g.start.x,event.clientY-g.start.y)<4)return;
    if(!g.active){g.active=true;gizmo.detach();gizmo.enabled=false;orbit.enabled=false;if(g.kind==='move'&&g.movable)transformStart();}
    if(g.kind==='marquee'){
      const r=canvas.getBoundingClientRect();marquee.hidden=false;Object.assign(marquee.style,{left:Math.min(event.clientX,g.start.x)-r.left+'px',top:Math.min(event.clientY,g.start.y)-r.top+'px',width:Math.abs(event.clientX-g.start.x)+'px',height:Math.abs(event.clientY-g.start.y)+'px'});
    }else if(g.movable){
      const point=ray(event).ray.intersectPlane(g.plane,new THREE.Vector3());if(!point)return;const delta=point.sub(g.anchor),snap=options().snap;
      if(snap>0){delta.x=Math.round(delta.x/snap)*snap;delta.y=Math.round(delta.y/snap)*snap;}delta.z=0;
      for(const {id,matrix}of g.matrices){const item=objects.get(id);item.mesh.matrix.copy(matrix);item.mesh.matrix.elements[12]+=delta.x;item.mesh.matrix.elements[13]+=delta.y;item.mesh.matrix.decompose(item.mesh.position,item.mesh.quaternion,item.mesh.scale);item.mesh.updateMatrixWorld(true);item.box?.update();}draw();
    }
  },true);
  canvas.addEventListener('pointerup',event=>{
    if(suppressClick){suppressClick=false;event.stopImmediatePropagation();return;}
    const g=gesture;if(!g)return;gesture=null;event.preventDefault();event.stopImmediatePropagation();marquee.hidden=true;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);orbit.enabled=true;gizmo.enabled=enabled;
    if(g.active&&g.kind==='marquee'){
      const rect={left:Math.min(g.start.x,event.clientX),right:Math.max(g.start.x,event.clientX),top:Math.min(g.start.y,event.clientY),bottom:Math.max(g.start.y,event.clientY)};
      const ids=[...objects].filter(([,item])=>item.mesh.visible).filter(([,item])=>{const b=projectedRect(item);return b&&rectangleHits(rect,b);}).map(([id])=>id);selectMany(ids,event.shiftKey||event.ctrlKey||event.metaKey||options().multiSelect);
    }else if(g.active&&g.movable)transformEnd(changes(g.ids));else if(!g.active)select(g.id,false);
    updateSelection(selected);draw();
  },true);
  canvas.addEventListener('pointercancel',()=>cancelInteraction());canvas.addEventListener('lostpointercapture',()=>{if(gesture)cancelInteraction();});canvas.addEventListener('contextmenu',event=>event.preventDefault());
  window.addEventListener('blur',()=>cancelInteraction());
  partHandles=createPartHandles({host,camera,scene,getNodes:()=>nodes.filter(n=>selected.has(n.id)),available:()=>enabled&&options().touchMode!=='view'&&!options().multiSelect&&!measurement&&!placement&&!gesture&&!dragging,options,draw,
    navigate(event){if(!enabled||partHandles.active())return;event.preventDefault();event.stopPropagation();const init={bubbles:true,cancelable:true,clientX:event.clientX,clientY:event.clientY,button:event.button,buttons:event.buttons,shiftKey:event.shiftKey,ctrlKey:event.ctrlKey,altKey:event.altKey,metaKey:event.metaKey};if(event.type==='wheel')canvas.dispatchEvent(new WheelEvent('wheel',{...init,deltaX:event.deltaX,deltaY:event.deltaY,deltaMode:event.deltaMode}));else canvas.dispatchEvent(new PointerEvent('pointerdown',{...init,pointerId:event.pointerId,pointerType:event.pointerType,isPrimary:event.isPrimary}));},
    onStart(){gizmo.detach();gizmo.enabled=false;orbit.enabled=false;transformStart();},
    onPreview(preview){for(const n of preview){const item=objects.get(n.id);item.mesh.matrix.fromArray(matrixArray(n));item.mesh.matrix.decompose(item.mesh.position,item.mesh.quaternion,item.mesh.scale);item.mesh.updateMatrixWorld(true);item.box?.update();}},
    onEnd(result){orbit.enabled=true;gizmo.enabled=enabled;transformEnd(result.map(n=>({id:n.id,pos:n.pos,rot:n.rot,size:n.size})));},
    onCancel(){restore();orbit.enabled=true;gizmo.enabled=enabled;transformCancel?.();updateSelection(selected);},
  });
  const resize=new ResizeObserver(()=>{const {width,height}=host.getBoundingClientRect();camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height);draw();});resize.observe(host);
  function fit(view){
    const b=new THREE.Box3();for(const item of objects.values())if(item.mesh.visible)b.union(new THREE.Box3().setFromObject(item.mesh));if(b.isEmpty())b.setFromCenterAndSize(new THREE.Vector3(0,0,10),new THREE.Vector3(90,90,30));
    const center=b.getCenter(new THREE.Vector3()),size=b.getSize(new THREE.Vector3()),distance=Math.max(70,size.length()*1.65),direction=view==='top'?new THREE.Vector3(0,-.001,1):new THREE.Vector3(1,-1.4,1.15).normalize();orbit.target.copy(center);camera.position.copy(center).addScaledVector(direction,distance);camera.far=Math.max(20000,distance*10);camera.updateProjectionMatrix();orbit.update();draw();
  }
  function bounds(ids){
    return ids.map(id=>{const item=objects.get(id);if(!item)throw Error('Teilgrenzen fehlen.');const box=new THREE.Box3(),v=new THREE.Vector3();for(let i=0;i<item.data.verts.length;i+=3)box.expandByPoint(v.fromArray(item.data.verts,i).applyMatrix4(item.mesh.matrixWorld));return {id,min:box.min.toArray(),max:box.max.toArray()};});
  }
  function stopMeasurement(){
    if(!measurement)return false;for(const object of measurement.visuals){scene.remove(object);object.geometry.dispose();object.material.dispose();}measurement=null;canvas.style.cursor='';measured?.(null);return true;
  }
  function beginMeasurement(){cancelInteraction();measurement={points:[],visuals:[]};gizmo.detach();canvas.style.cursor='crosshair';measured?.([]);partHandles.update();draw();}
  function pickMeasure(event){
    if(measurement.points.length===2){stopMeasurement();measurement={points:[],visuals:[]};}
    const target=hit(event),v=new THREE.Vector3();let point,id=null,snapped=false;
    if(target){point=target.point.clone();id=target.object.userData.id;const positions=target.object.geometry.getAttribute('position');let best=9;
      // Snap to the picked triangle's real vertices in screen space, independent of zoom.
      for(const index of [target.face.a,target.face.b,target.face.c]){v.fromBufferAttribute(positions,index).applyMatrix4(target.object.matrixWorld);const screen=screenPoint(v.toArray()),distance=Math.hypot(screen.x-event.clientX,screen.y-event.clientY);if(distance<best){best=distance;point=v.clone();snapped=true;}}
    }else{point=ray(event).ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),0),new THREE.Vector3());if(point&&options().snap>0){point.x=Math.round(point.x/options().snap)*options().snap;point.y=Math.round(point.y/options().snap)*options().snap;}}
    if(!point)return;measurement.points.push({id,point:point.toArray(),snapped});
    const marker=new THREE.Mesh(new THREE.SphereGeometry(Math.max(.25,camera.position.distanceTo(point)*.003),12,8),new THREE.MeshBasicMaterial({color:'#167a91',depthTest:false}));marker.position.copy(point);marker.renderOrder=50;scene.add(marker);measurement.visuals.push(marker);
    if(measurement.points.length===2){const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(measurement.points.map(p=>new THREE.Vector3(...p.point))),new THREE.LineBasicMaterial({color:'#167a91',depthTest:false}));line.renderOrder=49;scene.add(line);measurement.visuals.push(line);}
    measured?.(structuredClone(measurement.points));draw();
  }
  function thumbnail(ids){
    const preview=new THREE.Scene(),view=new THREE.PerspectiveCamera(38,256/192,.01,20000),materials=[],box=new THREE.Box3();view.up.set(0,0,1);
    preview.add(new THREE.HemisphereLight('#ffffff','#9eacbb',2.8));const light=new THREE.DirectionalLight('#ffffff',3);light.position.set(80,-60,160);preview.add(light);
    for(const id of ids){const item=objects.get(id);if(!item||!item.mesh.visible)continue;const material=item.mesh.material.clone(),mesh=new THREE.Mesh(item.mesh.geometry,material);materials.push(material);mesh.matrixAutoUpdate=false;mesh.matrix.copy(item.mesh.matrixWorld);mesh.updateMatrixWorld(true);preview.add(mesh);box.union(new THREE.Box3().setFromObject(mesh));}
    if(box.isEmpty())throw Error('Bitte mindestens ein sichtbares Teil speichern.');
    const center=box.getCenter(new THREE.Vector3()),radius=box.getSize(new THREE.Vector3()).length()/2,distance=Math.max(1,radius/Math.sin(19*Math.PI/180)*1.18);view.position.copy(center).addScaledVector(new THREE.Vector3(1,-1.4,1.15).normalize(),distance);view.lookAt(center);view.far=Math.max(20000,distance*10);view.updateProjectionMatrix();
    const target=new THREE.WebGLRenderTarget(256,192),previous=renderer.getRenderTarget(),viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4()),scissorTest=renderer.getScissorTest(),color=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();
    target.texture.colorSpace=THREE.SRGBColorSpace;
    try{renderer.setRenderTarget(target);renderer.setScissorTest(false);renderer.setClearColor('#edf0f1',1);renderer.render(preview,view);const pixels=new Uint8Array(256*192*4);renderer.readRenderTargetPixels(target,0,0,256,192,pixels);const output=document.createElement('canvas');output.width=256;output.height=192;const ctx=output.getContext('2d'),image=ctx.createImageData(256,192);for(let y=0;y<192;y++)image.data.set(pixels.subarray((191-y)*256*4,(192-y)*256*4),y*256*4);ctx.putImageData(image,0,0);return output.toDataURL('image/png');}
    finally{renderer.setRenderTarget(previous);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);renderer.setClearColor(color,alpha);target.dispose();materials.forEach(m=>m.dispose());draw();}
  }
  function screenPoint(pos){const p=new THREE.Vector3(...pos).project(camera),r=canvas.getBoundingClientRect();return {x:Math.round(r.left+(p.x+1)*r.width/2),y:Math.round(r.top+(1-p.y)*r.height/2)};}
  return {sync,selection:updateSelection,fit,bounds,thumbnail,beginMeasurement,beginPlacement,updatePlacement,finishPlacement,cancelInteraction,interacting:()=>!!measurement||!!gesture||!!placement||!!originals.length||partHandles.active(),
    mode:mode=>{cancelInteraction();gizmo.setMode(mode);},enabled:value=>{enabled=value;gizmo.enabled=value;canvas.style.pointerEvents=value?'':'none';partHandles.update();},snap:value=>gizmo.setTranslationSnap(value||null),draw,point:screenPoint,
    handlePoint(){const g=gizmo.getHelper().children.find(x=>x.isTransformControlsGizmo),handle=g?.gizmo.translate.children.find(x=>x.name==='X');return handle?screenPoint(new THREE.Box3().setFromObject(handle).getCenter(new THREE.Vector3()).toArray()):null;},
    placement:()=>placement?{node:structuredClone(placement.node),result:placement.result?structuredClone(placement.result):null,existing:placement.existing}:null,
    previewImage:()=>{draw();return canvas.toDataURL('image/png');},
    rect:id=>objects.has(id)?projectedRect(objects.get(id)):null,
    stats:()=>({frames,objects:objects.size,geometries:renderer.info.memory.geometries,drawCalls:renderer.info.render.calls,view:{position:camera.position.toArray(),target:orbit.target.toArray(),quaternion:camera.quaternion.toArray(),distance:camera.position.distanceTo(orbit.target)}}),
  };
}
