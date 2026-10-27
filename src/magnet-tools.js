export function createMagnetTools({canvas,button,status,getNode,pickObject,findTarget,getRevision,makeCandidate,showPreview,clearPreview,commit,setActive,safe,toast}){
  let armed=null,gesture=null;
  const defaultStatus=status.textContent;
  function refresh(){button.classList.toggle('active',!!armed);button.setAttribute('aria-pressed',String(!!armed));status.textContent=armed?'Magnet: markiertes Teil auf eine Körperfläche ziehen · Escape bricht ab':defaultStatus;canvas.style.cursor=armed?'grab':'';}
  function endGesture(){const g=gesture;gesture=null;clearPreview();if(g&&canvas.hasPointerCapture(g.pointerId))canvas.releasePointerCapture(g.pointerId);return g;}
  function close(){if(!armed)return false;armed=null;endGesture();refresh();setActive(false);return true;}
  function toggle(){if(armed)return close();const n=getNode();armed=n.id;setActive(true);refresh();}
  function valid(checkRevision){const n=getNode();if(n.id!==armed||(checkRevision&&getRevision()!==gesture.revision))throw Error('Modell geändert. Magnet erneut aktivieren.');return n;}
  function update(e,checkRevision=false){
    valid(checkRevision);gesture.candidate=null;const target=findTarget(e,armed);
    if(target){gesture.candidate=makeCandidate(gesture.original,target);showPreview(gesture.candidate);canvas.style.cursor='grabbing';status.textContent='Magnet: loslassen zum Aufsetzen · Escape bricht ab';}
    else{clearPreview();canvas.style.cursor='not-allowed';status.textContent='Magnet: keine Körperfläche getroffen · auf eine Fläche ziehen';}
  }
  button.onclick=()=>safe(toggle);
  canvas.addEventListener('pointerdown',e=>{
    if(!armed||gesture||e.button!==0||e.shiftKey)return;
    if(pickObject(e)!==armed)return;
    e.preventDefault();e.stopImmediatePropagation();safe(()=>{const original=structuredClone(getNode());gesture={pointerId:e.pointerId,original,revision:getRevision(),x:e.clientX,y:e.clientY,moved:false,candidate:null};canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';});
  },true);
  canvas.addEventListener('pointermove',e=>{
    if(!gesture||e.pointerId!==gesture.pointerId)return;e.preventDefault();e.stopImmediatePropagation();
    gesture.moved ||= Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>4;
    if(gesture.moved)safe(()=>{try{update(e);}catch(error){close();throw error;}});
  },true);
  canvas.addEventListener('pointerup',e=>{
    if(!gesture||e.pointerId!==gesture.pointerId||e.button!==0)return;e.preventDefault();e.stopImmediatePropagation();
    safe(async()=>{
      try{
        if(!gesture.moved){endGesture();refresh();return;}
        update(e,true);const g=endGesture();close();
        if(!g.candidate){toast('Keine Körperfläche getroffen. Platzierung verworfen.');return;}
        await commit(g.candidate,g.original.id,g.revision);toast('Teil mit Magnet aufgesetzt.');
      }catch(error){close();throw error;}
    });
  },true);
  canvas.addEventListener('pointercancel',e=>{if(gesture?.pointerId===e.pointerId){e.stopImmediatePropagation();close();}},true);
  canvas.addEventListener('lostpointercapture',e=>{if(gesture?.pointerId===e.pointerId)close();},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&armed){e.preventDefault();e.stopImmediatePropagation();close();}},true);
  return {toggle,close,isActive:()=>!!armed,isDragging:()=>!!gesture,selectionChanged:()=>{if(armed){try{if(getNode().id!==armed)close();}catch{close();}}},revisionChanged:()=>{if(gesture&&getRevision()!==gesture.revision)close();},state:()=>({armed,dragging:!!gesture,preview:!!gesture?.candidate})};
}
