import './projects.css';
export function createCadProjectsUI({desktop,modal,open,save,safe,thumbnail,t=v=>v}){
  let release=()=>{},generation=0;
  async function show(){
    const ticket=++generation;release();
    const data=desktop?.listProjects?await desktop.listProjects():null;
    if(ticket!==generation)return;
    modal('Projekte','<p>Das Projekt enthält alle Teile, Quellen, Layer, Notizen und die aktuelle Ansicht.</p><div class="project-shortcuts"><button id="projects-save" class="primary">Projekt speichern</button><button id="projects-save-as">Speichern unter …</button><button id="projects-open">Projekt öffnen …</button><button id="projects-folder">Projektordner öffnen</button></div><p id="projects-directory" class="small-note" data-no-translate></p><h3>Zuletzt verwendet</h3><div id="projects-recent" class="project-file-list"></div><h3 id="projects-files-heading">Im Projektordner</h3><div id="projects-files" class="project-file-list"></div>');
    document.getElementById('modal').classList.add('projects-modal');
    const $=id=>document.getElementById(id);
    const dialog=$('modal'),list=$('projects-recent'),abort=new AbortController(),queue=[],requests=new Map(),previewRows=[];let running=false,polling=false;
    const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);const job=entry.target.previewJob;if(job){queue.push(job);void pump();}}},{root:dialog,rootMargin:'80px'});
    const detached=new MutationObserver(()=>{if(!list.isConnected)release();});detached.observe($('modal-body'),{childList:true});
    const pollTimer=data&&desktop?.projectThumbnail?setInterval(async()=>{if(polling||abort.signal.aborted)return;polling=true;try{const fresh=await desktop.listProjects();if(abort.signal.aborted)return;const files=new Map([...fresh.recent,...fresh.files].map(f=>[f.id,f]));for(const row of previewRows){const next=files.get(row.file.id)??{...row.file,exists:false,previewStamp:null};if(next.previewStamp===row.target.previewStamp)continue;requests.delete(next.id);row.file=next;row.button.disabled=!next.exists;row.date.textContent=next.exists?new Date(next.usedAt??next.modifiedAt).toLocaleString():t('Datei nicht mehr vorhanden');row.target.previewStamp=next.previewStamp;row.target.textContent=t('Kein Vorschaubild');row.target.classList.remove('loaded');row.target.previewJob={file:next,target:row.target,stamp:next.previewStamp};if(next.exists)observer.observe(row.target);}}catch{/* File-list failures leave the dialog usable. */}finally{polling=false;}},2000):null;
    release=()=>{abort.abort();clearInterval(pollTimer);observer.disconnect();detached.disconnect();dialog.removeEventListener('close',release);queue.length=0;};dialog.addEventListener('close',release,{once:true});
    async function pump(){if(running||abort.signal.aborted)return;running=true;try{while(queue.length&&!abort.signal.aborted){const {file,target,stamp}=queue.shift();if(target.previewStamp!==stamp)continue;try{
      let image=requests.get(file.id);if(image===undefined){const result=await desktop.projectThumbnail({id:file.id});if(abort.signal.aborted)break;image=result.image;
        if(!image&&result.project&&thumbnail){image=await thumbnail(result.project,abort.signal);if(abort.signal.aborted)break;const cached=await desktop.cacheProjectThumbnail({id:file.id,token:result.token,image});if(!cached.cached)image=null;}
        if(target.previewStamp===stamp)requests.set(file.id,image??null);
      }
      if(image&&target.previewStamp===stamp&&target.isConnected&&!abort.signal.aborted){const img=document.createElement('img');img.alt=t('Projektvorschau');img.width=120;img.height=80;img.onload=()=>{if(target.previewStamp===stamp&&target.isConnected&&!abort.signal.aborted){target.replaceChildren(img);target.classList.add('loaded');}};img.src=image;}
    }catch{/* A failed preview keeps its accessible placeholder; opening stays available. */}}}finally{running=false;}}
    $('projects-save').onclick=()=>safe(async()=>{const result=await save();if(result?.saved)await show();});
    $('projects-save-as').onclick=()=>safe(async()=>{const result=await save({saveAs:true});if(result?.saved)await show();});
    if(desktop?.readGeometryBlock){const pack=document.createElement('button');pack.id='projects-save-pack';pack.textContent=t('Als Geometriepaket (.fnpack) speichern …');pack.onclick=()=>safe(async()=>{const result=await save({saveAs:true,format:'fnpack'});if(result?.saved)await show();});$('projects-save-as').after(pack);}
    $('projects-open').onclick=()=>safe(()=>open());
    $('projects-folder').hidden=!data;$('projects-folder').onclick=()=>safe(()=>desktop.openProjectsFolder());
    $('projects-directory').textContent=data?.directory??t('Im Browser werden Projekte als .ocad-Datei heruntergeladen.');
    function rows(id,files,empty){const root=$(id);if(!files.length){const note=document.createElement('p');note.className='small-note';note.textContent=t(empty);root.append(note);return;}
      for(const file of files){const button=document.createElement('button');button.className='project-file';button.disabled=!file.exists;button.title=file.path;
        const name=document.createElement('strong');name.dataset.noTranslate='';name.textContent=file.name;const detail=document.createElement('span');detail.dataset.noTranslate='';detail.textContent=file.path;
        const date=document.createElement('small');date.textContent=file.exists?new Date(file.usedAt??file.modifiedAt).toLocaleString():t('Datei nicht mehr vorhanden');
        const preview=document.createElement('div');preview.className='project-preview';preview.textContent=t('Kein Vorschaubild');button.append(preview,name,detail,date);button.onclick=()=>safe(()=>open(file.id));root.append(button);
        preview.previewStamp=file.previewStamp;previewRows.push({file,target:preview,button,date});if(file.exists&&desktop?.projectThumbnail){preview.previewJob={file,target:preview,stamp:file.previewStamp};observer.observe(preview);}
      }
    }
    rows('projects-recent',data?.recent??[],'Noch keine Projekte gespeichert oder geöffnet.');rows('projects-files',data?.files??[],'Noch keine Projekte in diesem Ordner.');$('projects-files-heading').hidden=!data;$('projects-files').hidden=!data;
    if(data?.truncated){const note=document.createElement('p');note.textContent=t('Weitere Projekte über „Projekt öffnen …“ auswählen.');$('projects-files').append(note);}
  }
  return {show};
}
