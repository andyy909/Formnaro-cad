export function createOwnShapes({bridge,busy,stop,drag,place,endDrag,android}){
  const $=id=>document.getElementById(id);let entries=[],page=0,token=0,request=0,dirty=true;
  const active=()=>$('basic-shapes-panel').hidden;
  function invalidate(){dirty=true;if(active())void load();}
  async function load(){
    const current=++request;$('own-shapes-status').textContent='Eigene Formen werden geladen …';
    try{const result=await bridge.libraryList();if(current!==request)return;if(!result.ok)throw Error(result.error);entries=result.entries;dirty=false;$('own-shapes-status').textContent=result.skipped?`${result.skipped} beschädigte Einträge übersprungen.`:'';render();}
    catch(e){if(current===request)$('own-shapes-status').textContent=e.message;}
  }
  function render(){
    const revision=++token,term=$('own-shapes-search').value.trim().toLocaleLowerCase(),filtered=entries.filter(e=>(!$('own-shapes-favorites').checked||e.favorite)&&(e.name+' '+e.folder).toLocaleLowerCase().includes(term)).sort((a,b)=>Number(b.favorite)-Number(a.favorite)||a.folder.localeCompare(b.folder,'de')||a.name.localeCompare(b.name,'de'));
    page=Math.max(0,Math.min(page,Math.ceil(filtered.length/12)-1));const grid=$('own-shapes-grid');grid.replaceChildren();
    if(!filtered.length){const p=document.createElement('p');p.className='subtle';p.textContent=entries.length?'Keine passenden eigenen Formen.':'Noch keine eigenen Formen. Teile markieren und oben in der Bibliothek mit „Neu speichern“ ablegen.';grid.append(p);}
    for(const entry of filtered.slice(page*12,page*12+12)){
      const button=document.createElement('button'),image=document.createElement('img'),label=document.createElement('span');button.className='shape own-shape';button.dataset.libraryShape=entry.id;button.draggable=true;button.title=entry.name+(entry.folder?' · '+entry.folder:'')+' · Auf Arbeitsfläche oder Teil ziehen';button.setAttribute('aria-label',entry.name+' auf Arbeitsfläche oder Teil ablegen');image.alt='';image.width=256;image.height=192;image.draggable=false;label.textContent=(entry.favorite?'★ ':'')+entry.name;button.append(image,label);button.ondragstart=event=>drag(event,entry.id);button.ondragend=endDrag;button.onclick=()=>{if(!busy())place(entry.id);};grid.append(button);
      bridge.libraryThumbnail(entry.id).then(result=>{if(revision===token&&result.ok)image.src=result.image;}).catch(()=>{});
    }
    $('own-shapes-page').textContent=filtered.length?`${page+1} / ${Math.ceil(filtered.length/12)}`:'0';$('own-shapes-prev').disabled=!page;$('own-shapes-next').disabled=(page+1)*12>=filtered.length;
  }
  function choose(own){
    if(busy())return;stop();$('basic-shapes-panel').hidden=own;$('own-shapes-panel').hidden=!own;
    for(const [id,selected]of [['basic-shapes-tab',!own],['own-shapes-tab',own]]){$(id).setAttribute('aria-selected',String(selected));$(id).tabIndex=selected?0:-1;}
    if(own&&dirty)void load();else if(own)render();
    document.querySelector('.left>.subtle').textContent=android?'Form antippen, dann auf der Arbeitsfläche platzieren.':own?'Eigene Form herausziehen und ablegen.':'Form herausziehen und ablegen.';
  }
  $('basic-shapes-tab').onclick=()=>choose(false);$('own-shapes-tab').onclick=()=>choose(true);
  for(const id of ['basic-shapes-tab','own-shapes-tab'])$(id).onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();event.stopPropagation();const own=event.key==='Home'?false:event.key==='End'?true:!active();choose(own);$(own?'own-shapes-tab':'basic-shapes-tab').focus();}};
  $('own-shapes-search').oninput=()=>{page=0;render();};$('own-shapes-favorites').onchange=()=>{page=0;render();};
  $('own-shapes-prev').onclick=()=>{page--;render();};$('own-shapes-next').onclick=()=>{page++;render();};$('own-shapes-refresh').onclick=()=>{if(!busy())void load();};$('own-shapes-manage').onclick=()=>$('library-open').click();
  return {invalidate};
}
