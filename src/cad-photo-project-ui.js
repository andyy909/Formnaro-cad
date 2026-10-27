import {validateProjectPhotos,photoAttachment,upsertProjectPhoto,removeProjectPhoto} from './cad-photo-project.js';
import {editPhotoReference} from './cad-photo-ui.js';
import {loadPhotoImage} from './cad-photo-images.js';
import {readCadAIImage} from './cad-ai-attachments.js';
import {showPhotoMultiView} from './cad-photo-multiview-ui.js';
export async function showProjectPhotos(store,{onAttach}={}){
 const dialog=document.createElement('dialog');dialog.id='photo-project-dialog';dialog.dataset.noTranslate='';
 const title=document.createElement('h2'),intro=document.createElement('p'),list=document.createElement('div'),status=document.createElement('p'),close=document.createElement('button');
 title.textContent='Fotoreferenzen im Projekt';intro.textContent='Originalbilder, Markierungen, Maße und Herkunft bleiben beim Speichern im Projekt. Beim Anhängen an den Chat werden sie erst nach Senden übertragen.';
 const add=document.createElement('button'),file=document.createElement('input');add.type='button';add.textContent='Foto hinzufügen';file.type='file';file.accept='image/png,image/jpeg,image/webp';file.hidden=true;add.onclick=()=>file.click();
 const multi=document.createElement('button');multi.type='button';multi.id='photo-project-multiview';multi.textContent='Technische Ansichten verbinden';multi.onclick=()=>action(async()=>{dialog.dataset.childActive='';try{await showPhotoMultiView(store);}finally{delete dialog.dataset.childActive;}});
 status.setAttribute('role','status');close.type='button';close.textContent='Schließen';close.onclick=()=>dialog.close();dialog.append(title,intro,add,multi,file,list,status,close);
 let closed=false,blocked=false;
 const busy=value=>{blocked=value;dialog.querySelectorAll('button').forEach(b=>b.disabled=value);};
 async function action(fn){if(blocked)return;busy(true);try{await fn();if(!closed){render();status.textContent='Projekt aktualisiert. Rückgängig stellt den vorherigen Stand wieder her.';}}catch(e){if(!closed)status.textContent=e.message;}finally{if(!closed)busy(false);}}
 file.onchange=()=>{const selected=file.files[0];file.value='';if(!selected)return;void action(async()=>{const state=store.read(),attachment=await readCadAIImage(selected),existing=state.photos?.items.find(p=>p.reference.imageId===attachment.imageId);if(existing)attachment.photo=existing.reference;const reference=await editPhotoReference(attachment);if(reference){attachment.photo=reference;await store.save(upsertProjectPhoto(state.photos,attachment),{revision:state.revision});}});};
 function render(){
  const state=store.read(),photos=validateProjectPhotos(state.photos??{version:1,items:[]});list.replaceChildren();
  if(!photos.items.length){const empty=document.createElement('p');empty.textContent='Noch keine Referenzen gespeichert. „Foto hinzufügen“ wählen oder im KI-Chat ein Foto vermessen und „Im Projekt speichern“ wählen.';list.append(empty);}
  for(const item of photos.items){
   const row=document.createElement('div'),img=document.createElement('img'),text=document.createElement('p');row.className='photo-project-row';row.dataset.photoId=item.reference.imageId;img.src=item.image.dataUrl;img.alt=item.reference.name;
   text.textContent=item.reference.name+' · '+({front:'Vorn',right:'Rechts',top:'Oben'}[item.reference.view])+' · '+(item.reference.version===2?'perspektivisch kalibriert':'frontal kalibriert')+' · '+item.reference.dimensions.length+' Maße';row.append(img,text);
   for(const [label,fn]of [
    ['An Chat anhängen',async()=>{const attachment=photoAttachment(item),decoded=await loadPhotoImage(attachment.dataUrl);if(decoded.naturalWidth!==attachment.width||decoded.naturalHeight!==attachment.height)throw Error('Originalbild und gespeicherte Abmessungen widersprechen sich.');if(store.read().revision!==state.revision)throw Error('Das Projekt wurde geändert. Referenzen erneut öffnen.');await onAttach(attachment);dialog.close();}],
    ['Bearbeiten',async()=>{const attachment=photoAttachment(item),value=await editPhotoReference(attachment);if(!value)return;attachment.photo=value;await store.save(upsertProjectPhoto(photos,attachment),{revision:state.revision});}],
    ['Aus Projekt entfernen',async()=>{await store.save(removeProjectPhoto(photos,item.reference.imageId),{revision:state.revision});}]
   ]){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>action(fn);row.append(button);}list.append(row);
  }
 }
 dialog.addEventListener('keydown',e=>e.stopPropagation());dialog.addEventListener('pointerdown',e=>e.stopPropagation());dialog.addEventListener('cancel',e=>{if(blocked)e.preventDefault();});
 return new Promise(resolve=>{dialog.addEventListener('close',()=>{closed=true;dialog.remove();resolve();},{once:true});document.body.append(dialog);render();dialog.showModal();});
}
