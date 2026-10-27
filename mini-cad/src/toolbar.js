const icons=import.meta.glob('./icons/*.svg',{eager:true,import:'default'});
for(const element of document.querySelectorAll('[data-icon]')){
  const img=document.createElement('img');img.src=icons[`./icons/${element.dataset.icon}.svg`];img.alt='';img.draggable=false;element.replaceChildren(img);
}
let active=null,trigger=null;
export function closeToolMenu({focus=false}={}){
  if(!active)return false;active.hidden=true;trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus();active=null;trigger=null;return true;
}
export function openToolMenu(id,button){
  if(active?.id===id){closeToolMenu();return;}closeToolMenu();active=document.getElementById(id);trigger=button;active.hidden=false;button.setAttribute('aria-expanded','true');
  const rect=button.getBoundingClientRect();active.style.top=`${rect.bottom+5}px`;active.style.left=`${Math.max(8,Math.min(rect.left,innerWidth-active.offsetWidth-8))}px`;
  active.querySelector('button:not(:disabled)')?.focus();
}
document.addEventListener('pointerdown',event=>{if(active&&!active.contains(event.target)&&!trigger.contains(event.target))closeToolMenu();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&closeToolMenu({focus:true})){event.preventDefault();event.stopImmediatePropagation();}},true);
window.addEventListener('resize',()=>closeToolMenu());
