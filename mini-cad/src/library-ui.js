export function createLibraryUI({bridge,actions,snapshot,selected,busy,stop,onChange=()=>{}}){
  const $=id=>document.getElementById(id);let entries=[],page=0,revision=0,working=false,editing=null;
  const checked=result=>{if(!result?.ok)throw Error(result?.error||'Bibliothek konnte nicht geladen werden.');return result;};
  async function guard(fn){if(working)return;working=true;try{await fn();}catch(e){const target=$('library-save-dialog').open?$('library-save-status'):$('library-status');target.textContent=e.message;}finally{working=false;}}
  async function refresh(){const result=checked(await bridge.libraryList());entries=result.entries;onChange();$('library-status').textContent=[result.skipped?`${result.skipped} beschädigte Einträge wurden übersprungen.`:'',result.location?.warning||''].filter(Boolean).join(' ');render();await showLocation();}
  async function showLocation(){
    if(typeof bridge.libraryLocation!=='function')return;$('library-location-controls').hidden=false;const location=checked(await bridge.libraryLocation());$('library-location-path').textContent=location.directory;$('library-location-path').title=location.directory;$('library-location-default').disabled=location.isDefault;if(location.error)$('library-status').textContent=location.error;
  }
  if(typeof bridge.libraryLocation==='function'){
    $('library-location-choose').onclick=()=>guard(async()=>{const result=await bridge.chooseLibraryFolder();if(result.canceled)return;checked(result);await refresh();});
    $('library-location-default').onclick=()=>guard(async()=>{checked(await bridge.resetLibraryFolder());await refresh();});
  }
  function render(){
    const token=++revision,term=$('library-search').value.trim().toLocaleLowerCase(),filtered=entries.filter(e=>(!$('library-favorites').checked||e.favorite)&&(e.name+' '+e.folder).toLocaleLowerCase().includes(term)).sort((a,b)=>Number(b.favorite)-Number(a.favorite)||a.folder.localeCompare(b.folder,'de')||a.name.localeCompare(b.name,'de'));
    page=Math.max(0,Math.min(page,Math.ceil(filtered.length/12)-1));const grid=$('library-grid');grid.replaceChildren();
    if(!filtered.length){const p=document.createElement('p');p.textContent=entries.length?'Keine passenden Teile gefunden.':'Noch keine Teile gespeichert. Markiere ein Teil und wähle „Neu speichern“.';grid.append(p);}
    for(const entry of filtered.slice(page*12,page*12+12)){
      const card=document.createElement('article'),image=document.createElement('img'),title=document.createElement('h3'),folder=document.createElement('small'),buttons=document.createElement('div');card.className='library-card';card.dataset.libraryId=entry.id;image.alt='Vorschau: '+entry.name;image.width=256;image.height=192;image.loading='lazy';title.textContent=entry.name;folder.textContent=entry.folder||'Ohne Ordner';
      for(const [label,fn]of [['Einfügen',async()=>{if(await actions.libraryLoad(entry.id,false))$('library-dialog').close();}],['Öffnen',async()=>{if(await actions.libraryLoad(entry.id,true))$('library-dialog').close();}],[entry.favorite?'★':'☆',async()=>{checked(await bridge.libraryUpdate({...entry,favorite:!entry.favorite}));await refresh();}],['Bearbeiten',()=>edit(entry)]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.title=label==='★'||label==='☆'?'Favorit umschalten':label;b.onclick=()=>guard(fn);buttons.append(b);}
      card.append(image,title,folder,buttons);grid.append(card);
      bridge.libraryThumbnail(entry.id).then(result=>{if(token!==revision)return;if(result.ok)image.src=result.image;else image.alt='Vorschaubild nicht verfügbar';}).catch(()=>{image.alt='Vorschaubild nicht verfügbar';});
    }
    $('library-page').textContent=filtered.length?`${page+1} / ${Math.ceil(filtered.length/12)} · ${filtered.length} Einträge`:'0 Einträge';$('library-prev').disabled=page===0;$('library-next').disabled=(page+1)*12>=filtered.length;
  }
  function edit(entry=null){
    editing=entry;const p=snapshot(),nodes=selected();$('library-save-dialog').querySelector('h2').textContent=entry?'Bibliothekseintrag bearbeiten':'In der Bibliothek speichern';$('library-save-status').textContent='';$('library-name').value=entry?.name||(nodes.length===1?nodes[0].name:p.name);$('library-folder').value=entry?.folder||(nodes[0]?.folder||'');$('library-favorite').checked=entry?.favorite||false;$('library-scope').closest('label').hidden=!!entry;$('library-scope').value=nodes.length?'selection':'project';$('library-save-dialog').showModal();$('library-name').focus();
  }
  $('library-open').onclick=()=>guard(async()=>{if(busy())return;stop();$('library-dialog').showModal();await showLocation();await refresh();});
  $('library-save-open').onclick=()=>edit();
  $('library-search').oninput=()=>{page=0;render();};$('library-favorites').onchange=()=>{page=0;render();};
  $('library-prev').onclick=()=>{page--;render();};$('library-next').onclick=()=>{page++;render();};
  $('library-dialog').addEventListener('close',()=>revision++);
  $('library-save-form').onsubmit=event=>{event.preventDefault();guard(async()=>{
    const meta={name:$('library-name').value.trim(),folder:$('library-folder').value.trim(),favorite:$('library-favorite').checked};
    if(editing)checked(await bridge.libraryUpdate({...meta,id:editing.id}));else if(!await actions.librarySave({...meta,scope:$('library-scope').value})){$('library-save-status').textContent='Speichern nicht möglich. Bitte Auswahl und sichtbare Teile prüfen.';return;}
    $('library-save-dialog').close();await refresh();
  });};
  return {refresh};
}
