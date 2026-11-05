import atlas from '../packaging/examples/atlas-5.ocad?url';
import vise from '../packaging/examples/solid-schraubstock.ocad?url';
import gears from '../packaging/examples/schraeggetriebe-6zu1.ocad?url';
import atlasImage from './assets/welcome/atlas.png';
import viseImage from './assets/welcome/vise.png';
import gearsImage from './assets/welcome/gears.png';
import './cad-welcome.css';

export const welcomeExamples=[
  {id:'atlas',name:'ATLAS-5-Fräse',detail:'Mit Schwenkrundtisch',url:atlas,image:atlasImage},
  {id:'vise',name:'Schraubstock',detail:'Präzisionsschraubstock',url:vise,image:viseImage},
  {id:'gears',name:'Schräggetriebe',detail:'Zwei Stufen · 6:1',url:gears,image:gearsImage},
];

// Deliberately scoped to this window lifetime, never to project contents or disk.
export function mountCadWelcome({root,open,safe,t=v=>v}){
  let dismissed=false,loading=false,ready=false;
  const thumbnails=new AbortController();
  const dismiss=()=>{dismissed=true;thumbnails.abort();root.hidden=true;};
  const close=document.createElement('button');close.type='button';close.className='welcome-close';close.textContent='×';close.setAttribute('aria-label',t('Begrüßung schließen'));close.title=t('Für diesen Programmstart schließen');close.onclick=dismiss;root.prepend(close);
  const list=document.createElement('div');list.className='welcome-examples';list.setAttribute('aria-label',t('Beispielprojekte'));
  for(const example of welcomeExamples){
    const button=document.createElement('button');button.type='button';button.className='welcome-example';button.dataset.example=example.id;button.disabled=true;
    const image=document.createElement('img');image.src=example.image;image.alt='';image.width=240;image.height=160;
    const name=document.createElement('strong');name.textContent=t(example.name);
    const detail=document.createElement('span');detail.textContent=t(example.detail);button.append(image,name,detail);
    button.onclick=()=>safe(async()=>{if(loading||!ready)return;loading=true;list.setAttribute('aria-busy','true');for(const b of list.children)b.disabled=true;try{if(await open(example))dismiss();}finally{loading=false;list.removeAttribute('aria-busy');for(const b of list.children)b.disabled=!ready;}});
    list.append(button);
  }
  const recent=document.createElement('section');recent.className='welcome-history';recent.hidden=true;
  const heading=document.createElement('h2');heading.textContent=t('Zuletzt verwendete Modelle');
  const history=document.createElement('div');history.className='welcome-examples';recent.append(heading,history);
  function showRecent(entries){
    history.replaceChildren();
    let queue=Promise.resolve();
    for(const entry of entries.slice(0,3)){
      const button=document.createElement('button');button.type='button';button.className='welcome-example';button.dataset.recentProject=entry.id;
      const preview=document.createElement('div');preview.className='welcome-recent-preview';preview.textContent='◇';preview.setAttribute('aria-hidden','true');
      const name=document.createElement('strong');name.textContent=entry.name;name.dataset.noTranslate='';
      button.append(preview,name);history.append(button);
      button.onclick=()=>safe(async()=>{
        if(loading||!ready)return;
        loading=true;for(const b of history.children)b.disabled=true;
        try{if(await entry.open())dismiss();}finally{loading=false;for(const b of history.children)b.disabled=false;}
      });
      if(entry.thumbnail)queue=queue.then(()=>dismissed?null:entry.thumbnail(thumbnails.signal)).then(src=>{
        if(!src||!button.isConnected||dismissed)return;
        const image=document.createElement('img');image.src=src;image.alt='';image.width=240;image.height=160;
        preview.replaceChildren(image);
      }).catch(()=>{});
    }
    recent.hidden=!history.children.length;
  }
  root.querySelector('[data-action="demo"]')?.remove();root.append(recent,list);
  return {dismiss,showRecent,setReady(){ready=true;for(const b of list.children)b.disabled=loading;},update({hasContent=false,hasPreview=false}={}){if(hasContent||hasPreview)dismiss();root.hidden=dismissed;},dismissed:()=>dismissed};
}
