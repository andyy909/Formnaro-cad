// A library gesture stays inside the application. The same pointer path is
// used by people and by the window-scoped practice input broker.
export function installCadLibraryDrag(tile,{document=tile.ownerDocument,drop,click}){
 let active=null,suppressClick=false;
 tile.draggable=false;
 const finish=(event,cancel=false)=>{
  if(!active)return;const a=active;active=null;
  document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerup',up,true);document.removeEventListener('pointercancel',cancelled,true);document.removeEventListener('keydown',key,true);document.defaultView.removeEventListener('blur',cancelled);
  a.ghost?.remove();if(!a.moved)return;suppressClick=true;setTimeout(()=>{suppressClick=false;},0);
  if(cancel)return;event.preventDefault();const viewport=document.getElementById('viewport'),r=viewport?.getBoundingClientRect();
  if(document.elementFromPoint(event.clientX,event.clientY)?.closest('#canvas-host')&&r&&event.clientX>=r.left&&event.clientX<r.right&&event.clientY>=r.top&&event.clientY<r.bottom)drop(event);
 };
 const move=event=>{if(!active||event.pointerId!==active.id)return;if(!active.moved&&Math.hypot(event.clientX-active.x,event.clientY-active.y)<7)return;
  event.preventDefault();active.moved=true;
  if(!active.ghost){const ghost=document.createElement('div');ghost.textContent=tile.textContent;Object.assign(ghost.style,{position:'fixed',zIndex:'10000',pointerEvents:'none',padding:'10px 16px',border:'2px solid #07869a',borderRadius:'10px',background:'#e6f7fa',color:'#173b47',fontWeight:'700'});document.body.append(ghost);active.ghost=ghost;}
  active.ghost.style.left=(event.clientX+12)+'px';active.ghost.style.top=(event.clientY+12)+'px';
 };
 const up=event=>{if(event.pointerId===active?.id)finish(event);},cancelled=event=>finish(event,true),key=event=>{if(event.key==='Escape')cancelled(event);};
 tile.addEventListener('pointerdown',event=>{if(event.button!==0||active)return;suppressClick=false;active={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};document.addEventListener('pointermove',move,true);document.addEventListener('pointerup',up,true);document.addEventListener('pointercancel',cancelled,true);document.addEventListener('keydown',key,true);document.defaultView.addEventListener('blur',cancelled);});
 tile.onclick=event=>{if(suppressClick){suppressClick=false;event.preventDefault();return;}click(event);};
}
