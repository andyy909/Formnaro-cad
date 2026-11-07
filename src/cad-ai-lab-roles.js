const roleLabels={modeler:'Modellieragent',supervisor:'Überwacher',reviewer:'Abschlussauswerter'};
const labelEffort=value=>({profile:'Aus Zugangsprofil',series:'Denkstufen des Testplans',monitor:'Aus Testplan',auto:'Automatisch',enabled:'Aktiviert',disabled:'Deaktiviert',none:'Ohne'}[value]??value);
export function mountLabRolePicker({host,role,api,onChange=()=>{},onError=()=>{},onBusy=()=>{}}){
 const root=document.createElement('div');root.className='lab-controls';root.dataset.labRole=role;
 const fields={};for(const [key,title]of [['provider','Zugangsprofil'],['model','Modell'],['effort','Denkstufe']]){const label=document.createElement('label'),select=document.createElement('select'),span=document.createElement('span');label.className='lab-field'+(key!=='effort'?' lab-wide':'');span.textContent=title;select.dataset.roleField=key;select.setAttribute('aria-label',roleLabels[role]+' · '+title);label.append(span,select);root.append(label);fields[key]=select;}
 const note=document.createElement('p');note.className='lab-subtle';note.dataset.roleNote=role;host.append(root,note);
 let value={providerId:'current',model:'',effort:role==='modeler'?'series':role==='supervisor'?'monitor':'high'},catalog=null,busy=false,externalBusy=false,ticket=0,ready=false;
 const options=(select,rows,chosen)=>{select.replaceChildren(...rows.map(([v,text])=>new Option(text,v)));if(rows.some(([v])=>v===chosen))select.value=chosen;};
 function controls(){for(const select of Object.values(fields))select.disabled=busy||externalBusy;}
 function selected(){return catalog?.models.find(m=>m.id===fields.model.value);}
 function efforts(chosen){const supported=selected()?.reasoningEfforts??[];const rows=[...(role==='modeler'?[['series',labelEffort('series')]]:[]),['profile',labelEffort('profile')],...supported.map(e=>[e,labelEffort(e)])];if(role==='supervisor'&&chosen==='monitor')rows.unshift(['monitor',labelEffort('monitor')]);if(!supported.length)note.textContent='Dieses Modell bietet keine bestätigte einstellbare Denkstufe. Die automatische Einstellung des Zugangs wird verwendet.';else note.textContent='Eigene Sitzung · '+roleLabels[role]+'.';options(fields.effort,rows,chosen);if(!rows.some(([v])=>v===chosen))fields.effort.value='profile';}
 const read=()=>({providerId:fields.provider.value||value.providerId,model:fields.model.value||value.model,effort:fields.effort.value||value.effort});
 async function fetchCatalog({save=false}={}){
  const mine=++ticket;busy=true;ready=false;controls();onBusy(1);
  try{const result=await api({action:'labRoleCatalog',providerId:fields.provider.value||value.providerId});if(mine!==ticket)return;
   catalog={...result,models:result.models.filter(m=>!result.availableModelIds||result.availableModelIds.includes(m.id))};
   if(!catalog.models.length)throw Error('Für dieses Zugangsprofil sind keine verwendbaren Modelle verfügbar.');
   const model=catalog.models.some(m=>m.id===value.model)?value.model:catalog.models.some(m=>m.id===catalog.defaultModel)?catalog.defaultModel:catalog.models[0].id;
   options(fields.model,catalog.models.map(m=>[m.id,m.name||m.id]),model);efforts(value.effort);value=read();ready=true;
   if(save)await api({action:'labRoleSave',role,selection:value});onChange(read(),selected());
  }catch(error){if(mine===ticket){note.textContent=error.message;onError(error.message);}}
  finally{if(mine===ticket){busy=false;controls();}onBusy(-1);}
 }
 fields.provider.onchange=()=>{value={...read(),providerId:fields.provider.value,model:'',effort:role==='modeler'?'series':'profile'};void fetchCatalog({save:true});};
 async function changed(){try{if(!ready)return;value=read();await api({action:'labRoleSave',role,selection:value});onChange(value,selected());}catch(error){onError(error.message);}}
 fields.model.onchange=()=>{efforts('profile');void changed();};fields.effort.onchange=()=>void changed();
 return {read,selected,ready:()=>ready&&!busy,setBusy(v){externalBusy=v;controls();},
  async load(selection,providers=[]){value={...value,...selection};const rows=[['current','Aktuell gewähltes Zugangsprofil'],...providers.map(p=>[p.id,p.label||p.id])];if(!rows.some(([id])=>id===value.providerId))rows.push([value.providerId,value.providerId]);options(fields.provider,rows,value.providerId);await fetchCatalog();},dispose(){ticket++;root.remove();note.remove();}};
}
