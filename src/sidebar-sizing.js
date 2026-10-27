// Resize only UI data; model gestures and CAD history never receive these events.
export function createSidebarSizing({panels,contents,t=v=>v,canResize,getLayout,onCommit}){
  const main=document.querySelector('main'),shapes=document.getElementById('shape-library');
  let layout=getLayout(),gesture=null;
  const handles=new Map();
  const section=document.createElement('section');section.className='shape-library-section';
  shapes.before(section);for(const node of [contents.library.querySelector('.panel-heading'),document.getElementById('shape-search'),shapes])section.append(node);
  const objects=document.createElement('section');objects.className='sidebar-object-section';
  section.after(objects);while(objects.nextSibling)objects.append(objects.nextSibling);
  function limits(key){
    if(key==='shapeLibraryHeight')return [100,Math.max(100,Math.min(1600,contents.library.clientHeight-250))];
    if(key==='chatHeight')return [240,Math.max(240,Math.min(1200,main.clientHeight-(window.innerHeight<=650?0:24)))];
    const other=key==='libraryWidth'?'inspector':'library',otherWidth=panels[other].getBoundingClientRect().width;
    const min=key==='libraryWidth'?180:240;
    return [min,Math.max(min,Math.min(640,main.clientWidth-otherWidth-360))];
  }
  const clamp=(key,value)=>{const [min,max]=limits(key);return Math.round(Math.max(min,Math.min(max,value)));};
  function actual(key){
    if(key==='shapeLibraryHeight')return shapes.getBoundingClientRect().height;
    if(key==='chatHeight')return document.getElementById('ai-chat')?.getBoundingClientRect().height||440;
    return panels[key==='libraryWidth'?'library':'inspector'].getBoundingClientRect().width;
  }
  function apply(value){
    layout=value;
    // Preserve a useful canvas even when a wide saved layout opens on a smaller screen.
    const narrow=main.clientWidth<=1150;let left=value.librarySide==='left'?(value.libraryWidth??(narrow?225:230)):(value.inspectorWidth??(narrow?300:340));
    let right=value.librarySide==='left'?(value.inspectorWidth??(narrow?300:340)):(value.libraryWidth??(narrow?225:230));
    const leftCollapsed=value[value.librarySide==='left'?'libraryCollapsed':'inspectorCollapsed'],rightCollapsed=value[value.librarySide==='left'?'inspectorCollapsed':'libraryCollapsed'];
    if(leftCollapsed)left=28;if(rightCollapsed)right=28;
    const budget=Math.max(420,main.clientWidth-360),excess=Math.max(0,left+right-budget);
    if(excess){const lmin=leftCollapsed?28:(value.librarySide==='left'?180:240),rmin=rightCollapsed?28:(value.librarySide==='left'?240:180),room=left-lmin+right-rmin;if(room>0){left-=excess*(left-lmin)/room;right-=excess*(right-rmin)/room;}}
    main.style.setProperty('--sidebar-left',Math.round(left)+'px');main.style.setProperty('--sidebar-right',Math.round(right)+'px');
    const chat=document.getElementById('ai-chat');if(chat){chat.style.setProperty('--chat-height',clamp('chatHeight',value.chatHeight??620)+'px');const handle=handles.get('chatHeight');if(handle&&handle.parentElement!==chat)chat.prepend(handle);}
    // The chat and palette share the right column after swapping sides. Apply
    // its new height before measuring the space available to the palette.
    shapes.style.height=clamp('shapeLibraryHeight',value.shapeLibraryHeight??Math.min(innerHeight*.47,contents.library.clientHeight-300))+'px';
    for(const [key,handle]of handles){const [min,max]=limits(key);handle.setAttribute('aria-valuemin',min);handle.setAttribute('aria-valuemax',max);handle.setAttribute('aria-valuenow',Math.round(actual(key)));}
    window.dispatchEvent(new Event('resize'));
  }
  function finish(commit){if(!gesture)return;const g=gesture;gesture=null;document.body.classList.remove('sidebar-resizing');if(g.handle.hasPointerCapture(g.pointerId))g.handle.releasePointerCapture(g.pointerId);if(commit&&JSON.stringify(layout)!==JSON.stringify(g.original))void onCommit(layout);else apply(getLayout());}
  function add(key,name,orientation,parent){
    const handle=document.createElement('div');handle.id='resize-'+key;handle.className='sidebar-resize sidebar-resize-'+orientation;handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-orientation',orientation);handle.setAttribute('aria-label',t(name));handle.title=t(name)+' · '+t('Ziehen oder Pfeiltasten; Doppelklick setzt zurück');parent.append(handle);handles.set(key,handle);
    handle.addEventListener('pointerdown',event=>{event.stopPropagation();if(event.button!==0||!canResize())return;event.preventDefault();handle.focus({preventScroll:true});gesture={handle,key,pointerId:event.pointerId,start:orientation==='vertical'?event.clientX:event.clientY,size:actual(key),original:structuredClone(getLayout())};handle.setPointerCapture(event.pointerId);document.body.classList.add('sidebar-resizing');});
    handle.addEventListener('pointermove',event=>{if(gesture?.handle!==handle||gesture.pointerId!==event.pointerId)return;event.preventDefault();event.stopPropagation();let delta=(orientation==='vertical'?event.clientX:event.clientY)-gesture.start;if(key==='chatHeight'||key==='shapeLibraryHeight'&&layout.objectsFirst||orientation==='vertical'&&((key==='libraryWidth')!==(layout.librarySide==='left')))delta=-delta;apply({...layout,[key]:clamp(key,gesture.size+delta)});});
    handle.addEventListener('pointerup',event=>{event.stopPropagation();if(gesture?.handle===handle)finish(true);});
    for(const type of ['pointercancel','lostpointercapture'])handle.addEventListener(type,()=>{if(gesture?.handle===handle)finish(false);});
    handle.addEventListener('dblclick',()=>{if(canResize())void onCommit({...getLayout(),[key]:null});});
    handle.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();finish(false);return;}if(!canResize())return;const vertical=orientation==='vertical',negative=vertical?'ArrowLeft':'ArrowUp',positive=vertical?'ArrowRight':'ArrowDown';if(![negative,positive,'Home'].includes(event.key))return;event.preventDefault();let delta=(event.key===negative?-1:1)*(event.shiftKey?40:10);if(key==='chatHeight'||key==='shapeLibraryHeight'&&layout.objectsFirst||vertical&&((key==='libraryWidth')!==(layout.librarySide==='left')))delta=-delta;void onCommit({...getLayout(),[key]:event.key==='Home'?null:clamp(key,actual(key)+delta)});});
    return handle;
  }
  section.after(add('shapeLibraryHeight','Höhe der Grundformen anpassen','horizontal',contents.library));
  for(const key of ['library','inspector'])add(key+'Width',key==='library'?'Breite der Formenleiste anpassen':'Breite der Eigenschaftenleiste anpassen','vertical',panels[key]);
  // The chat exists by the time layoutUI is mounted; syncPanels also covers late mounting.
  const chatHandle=add('chatHeight','Höhe des KI-Chats anpassen','horizontal',document.createDocumentFragment());
  document.getElementById('ai-chat')?.prepend(chatHandle);
  new ResizeObserver(()=>{if(!gesture)apply(layout);}).observe(main);
  return {apply};
}
