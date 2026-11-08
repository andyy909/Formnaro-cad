import { renderReasoningSelect } from './ai-reasoning-ui.js';
import { providerCredentialLabel } from './ai-provider-status.js';
import { modelPracticeSample } from './cad-ai-model-samples.js';
import { benchmarkComparisonOptions, comparableBenchmarks, modelBenchmarks, renderBenchmarkChart, renderBenchmarkDetail } from './cad-ai-model-benchmarks.js';

export function createCadAIModelPicker({host,desktop,language,onBusy,onChange,onProviderChange,onStatus,onSettings}){
 const text=(de,en)=>language()==='en'?en:de;
 const trigger=document.createElement('button');
 trigger.id='ai-chat-model-picker';trigger.type='button';trigger.className='ai-model-trigger';
 trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls','ai-model-dialog');
 trigger.innerHTML='<svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><rect x="2" y="11" width="3" height="7" rx="1"/><rect x="8" y="6" width="3" height="12" rx="1"/><rect x="14" y="2" width="3" height="16" rx="1"/></svg><span></span><span aria-hidden="true">⌄</span>';
 host.append(trigger);
 const dialog=document.createElement('dialog');
 dialog.id='ai-model-dialog';dialog.className='ai-model-dialog';dialog.dataset.noTranslate='';
 dialog.setAttribute('aria-labelledby','ai-model-title');
 dialog.innerHTML=`
  <header class="ai-model-header">
   <div><p class="ai-model-kicker">FORMNARO / KI</p><h2 id="ai-model-title"></h2><p data-intro></p></div>
   <button type="button" data-close aria-label="${text('Schließen','Close')}">×</button>
  </header>
  <div class="ai-model-toolbar">
   <div class="ai-model-scopes" role="group" aria-label="${text('Vergleichsbereich','Comparison category')}">
    <button type="button" data-scope="all">${text('Alle Modelle','All models')}</button><button type="button" data-scope="text">Text</button><button type="button" data-scope="cad">CAD</button>
    <button type="button" data-scope="photo">Foto-CAD</button>
   </div>
   <input type="search" data-search aria-label="${text('Modell suchen','Search models')}" placeholder="${text('Modell oder Anbieter suchen','Search model or provider')}">
   <button id="ai-chat-model-refresh" type="button" data-refresh>${text('Aktualisieren','Refresh')}</button>
  </div>
  <section class="ai-model-comparison" aria-labelledby="ai-model-chart-title">
   <div class="ai-model-chart-heading"><h3 id="ai-model-chart-title"></h3><p data-method></p></div>
   <label class="ai-benchmark-comparison-label"><span data-comparison-label></span><select data-comparison></select></label><p data-comparison-note class="small-note" hidden></p><div data-chart class="ai-model-chart"></div>
   <p data-benchmark-status class="ai-model-benchmark-status" role="status"></p>
   <p data-benchmark-suite class="ai-model-benchmark-status"></p>
  </section>
  <section class="ai-model-results" aria-label="${text('Verbundene Modelle','Connected models')}"><p id="ai-chat-model-info" role="status"></p><div data-model-list></div></section>
  <footer class="ai-model-footer">
   <label class="ai-model-effort"><span>${text('Denkaufwand','Reasoning effort')}</span><select id="ai-chat-effort"></select></label>
   <button type="button" data-usage hidden>${text('Abo-Nutzung','Plan usage')}</button>
   <button type="button" data-settings>${text('Zugänge verwalten','Manage connections')}</button>
  </footer>`;
 document.body.append(dialog);
 const el=selector=>dialog.querySelector(selector);
 const close=el('[data-close]'),search=el('[data-search]'),refresh=el('[data-refresh]'),info=el('#ai-chat-model-info');
 const chart=el('[data-chart]'),list=el('[data-model-list]'),effort=el('#ai-chat-effort'),usage=el('[data-usage]');
 let settings,catalog,allCatalogs=[],scope='all',benchmarks={entries:[]},benchmarkError='',benchmarkTicket=0,externalBusy=false,loading=false,discovering=false,disposed=false,ticket=0,discoveryTicket=0,adjustable=false,overviewError='';
 const selected=()=>catalog?.models.find(model=>model.id===settings?.model);
 const label=trigger.querySelector('span');
 const money=value=>new Intl.NumberFormat(language()==='en'?'en-US':'de-DE',{maximumFractionDigits:4}).format(value);
 const element=(tag,className,value)=>{const node=document.createElement(tag);if(className)node.className=className;if(value!==undefined)node.textContent=value;return node;};

 function controls(){
  trigger.disabled=!desktop||externalBusy||loading;
  refresh.disabled=!desktop||externalBusy||loading||discovering;
  effort.disabled=externalBusy||loading||!desktop?.selectAIEffort||!adjustable;
  list.querySelectorAll('[data-select-model]').forEach(button=>{button.disabled=externalBusy||loading||button.dataset.selectable!=='true';});
 }
 function summary(){
  label.textContent=selected()?.name||settings?.model||text('KI-Modell','AI model');
  trigger.title=text('Modell, Leistung und Preis vergleichen','Compare models, performance and price');
  trigger.setAttribute('aria-label',trigger.title+' · '+label.textContent);
  if(!desktop)info.textContent=text('Modellwahl in der Desktop-Anwendung verfügbar.','Model selection is available in the desktop app.');
  else if(loading||discovering)info.textContent=text('Modellkataloge werden geladen …','Loading model catalogs …');
  else if(overviewError||catalog?.error)info.textContent=overviewError||catalog.error;
  else if(!catalog?.hasKey)info.textContent=text('Richte einen Zugang ein, um ein Modell zu verwenden.','Set up a connection to use a model.');
  else info.textContent='';
  if(settings){
   const reasoning=renderReasoningSelect(effort,settings,selected(),language());
   adjustable=reasoning.adjustable;
   effort.parentElement.title=reasoning.note;
   usage.hidden=settings.authMode!=='chatgpt';
  }
  controls();
 }
 function render(){
  el('#ai-model-title').textContent=text('Modellwahl','Model selection');
  el('[data-intro]').textContent=text('Vergleiche deine KI-Zugänge und wähle ein Modell für den Chat.','Compare your AI connections and choose a model for chat.');
  dialog.querySelectorAll('[data-scope]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.scope===scope)));
  const catalogs=allCatalogs.length?allCatalogs:catalog&&settings?[{...catalog,provider:settings.providers.find(provider=>provider.id===catalog.providerId)}]:[];
  const query=search.value.trim().toLocaleLowerCase();
  const models=catalogs.flatMap(entry=>entry.models.map(model=>({model,entry,sample:modelPracticeSample(entry.providerId,model.id,scope)})))
   .filter(({model,entry})=>(scope!=='photo'||model.vision!==false)&&[model.name,model.id,entry.provider?.label].join(' ').toLocaleLowerCase().includes(query));
  models.sort((a,b)=>Number(b.entry.hasKey)-Number(a.entry.hasKey)||a.model.name.localeCompare(b.model.name));
  el('#ai-model-chart-title').textContent=text('KI-Benchmarks · 16 feste Versuche','AI benchmarks · 16 fixed trials');
  el('[data-method]').textContent=text('Je Modell der neueste vollständige Lauf mit gleichen Aufgaben, Denkstufe, Überwachung und Programmstand. Jede Säule zeigt einen einzelnen Lauf: bestätigt / 16, Skala 0–100 %.','Latest complete run per model with the same tasks, effort, monitoring and app build. Each column shows one run: confirmed / 16, scale 0–100%.');
  const groups=benchmarkComparisonOptions(benchmarks.entries),select=el('[data-comparison]'),previous=select.value;
  select.replaceChildren(...(groups.length?groups.map(g=>new Option((language()==='en'?(g.sample.labelEn||g.sample.label):g.sample.label)+' '+g.sample.suiteVersion+' · '+g.sample.effort+' · '+g.sample.monitor+' · '+(g.differentSources?text('Unterschiedliche Programmstände','Different app builds'):'Formnaro '+g.sample.sourceVersion+' · '+(g.sample.sourceHash||g.sample.suiteHash).slice(0,8)),g.id)):[new Option(text('Noch kein vollständiger Benchmark','No complete benchmark yet'),'')]));
  if(groups.some(g=>g.id===previous))select.value=previous;select.disabled=!groups.length;
  el('[data-comparison-label]').textContent=text('Benchmark-Vergleich','Benchmark comparison');
  const mixed=groups.find(g=>g.id===select.value)?.differentSources===true,note=el('[data-comparison-note]');note.hidden=!mixed;
  note.textContent=mixed?text('Gleiche Suite, Denkstufe und Überwachung; unterschiedliche Programmstände. Die Originalmessungen bleiben unverändert. Unterschiede können auch vom Programmstand abhängen.','Same suite, effort and monitoring; different app builds. Original measurements remain unchanged. Differences can also depend on the app build.'):'';
  if(mixed)el('[data-method]').textContent=text('Je Modell ein vollständiger Einzellauf: bestätigt / 16, Skala 0–100 %. Der gemessene Programmstand steht unter jeder Säule.','One complete run per model: confirmed / 16, scale 0–100%. The measured app build is shown below each column.');
  renderBenchmarkChart(chart,comparableBenchmarks(benchmarks.entries,select.value,query),language());
  el('[data-benchmark-status]').textContent=benchmarkError;
  const shown=groups.find(g=>g.id===select.value)?.sample;
  el('[data-benchmark-suite]').textContent=shown?(language()==='en'?(shown.labelEn||shown.label):shown.label)+' '+shown.suiteVersion+' · '+text('nur vollständige Einzelläufe dieser Suite im Diagramm','only complete individual runs of this suite in the chart'):text('Noch kein vollständiger 16er-Lauf. Übungs-, Reparatur- und Teilstände bleiben außerhalb des Diagramms.','No complete 16-trial run yet. Practice, repair and partial results stay outside the chart.');
  list.replaceChildren();
  for(const {model,entry,sample} of models){
   const active=entry.providerId===settings?.providerId&&model.id===settings.model;
   const row=element('article','ai-model-card');
   if(active)row.dataset.active='';
   const identity=element('div','ai-model-identity');
   identity.append(element('strong','',model.name),element('small','',entry.provider?.label||entry.providerId));
   const badges=element('div','ai-model-badges');
   badges.append(element('span',model.vision===true?'vision':'',model.vision===true?text('Bildfähig','Image input'):model.vision===false?text('Nur Text','Text only'):text('Bildfähigkeit offen','Image support unknown')));
   if(sample)badges.append(element('span','',Math.round(sample[0]/sample[1]*100)+' % · '+sample.join('/')));
   identity.append(badges);
   const measured=modelBenchmarks(benchmarks.entries,entry.providerId,model.id);
   if(measured.length){
    const details=element('details','ai-model-benchmark-results');
    details.append(element('summary','',text('Gespeicherte Teststände anzeigen','Show saved test results')+' ('+measured.length+')'));
    for(const result of measured)details.append(renderBenchmarkDetail(result,language()));
    identity.append(details);
   }else identity.append(element('small','',text('Noch keine Benchmark-Ergebnisse','No benchmark results yet')));
   if(!entry.hasKey||entry.error)identity.append(element('small','ai-model-connection',entry.error?text('Katalogabfrage fehlgeschlagen','Catalog request failed'):providerCredentialLabel(entry.provider||{},language())));
   const price=element('div','ai-model-price');
   const rate=model.price,subscription=['chatgpt','mistral-vibe'].includes(entry.provider?.authMode);
   price.append(element('small','',subscription?text('Abo-Zugang','Plan access'):text('USD je Mio. Tokens','USD per million tokens')));
   if(rate){
    const detail=text('Ein ','In ')+money(rate.input)+'  ·  '+text('Aus ','Out ')+money(rate.output);
    price.append(element('strong','',detail));
    price.append(element('small','',(rate.cached!==undefined?'Cache '+money(rate.cached)+' · ':'')+
     (rate.peakMultiplier?text('Nebentarif · Spitze ×2','Off-peak · peak ×2'):subscription?text('API-Vergleichswert','API equivalent'):text('Standard','Standard'))));
    if(rate.rateDate&&!rate.manual){const asOf=element('small','',text('Tarifstand ','Rate as of ')+rate.rateDate);asOf.title=rate.source||'';price.append(asOf);}
   }else if(!subscription)price.append(element('strong','',text('Kein Tarif hinterlegt','Rate unavailable')));
   const pick=element('button',active?'ai-model-active':'',active?text('Ausgewählt','Selected'):text('Wählen','Select'));
   pick.type='button';pick.dataset.selectModel=model.id;pick.dataset.provider=entry.providerId;pick.dataset.selectable=String(entry.hasKey&&!active);
   pick.onclick=()=>void update({action:()=>desktop.selectAIModel({providerId:entry.providerId,model:model.id})});
   row.append(identity,price,pick);list.append(row);
  }
  if(!models.length)list.append(element('p','ai-model-empty',text('Keine Modelle für diese Auswahl.','No models match this selection.')));
  summary();
 }
 async function loadBenchmarks(){
  if(!desktop?.diagnostics)return;
  const id=++benchmarkTicket;benchmarkError='';
  try{const result=await desktop.diagnostics({action:'modelBenchmarks'});if(!disposed&&id===benchmarkTicket)benchmarks=result;}
  catch(error){if(!disposed&&id===benchmarkTicket)benchmarkError=text('Benchmark-Ergebnisse konnten nicht geladen werden: ','Could not load benchmark results: ')+error.message;}
  finally{if(!disposed&&id===benchmarkTicket)render();}
 }
 async function discover(refreshCatalogs=false){
  const id=++discoveryTicket;discovering=true;overviewError='';summary();
  try{
   const result=await desktop.getAIModels({all:true,refresh:refreshCatalogs});
   if(!disposed&&id===discoveryTicket)allCatalogs=result.catalogs??[];
  }catch(error){if(!disposed&&id===discoveryTicket)overviewError=error.message;}
  finally{if(!disposed&&id===discoveryTicket){discovering=false;render();}}
 }
 async function update({refresh:force=false,action}={}){
  if(disposed||!desktop)return;
  const id=++ticket;loading=true;overviewError='';onBusy(true);summary();
  try{
   const next=action?await action():await desktop.getAISettings();
   if(disposed||id!==ticket)return;
   const changed=settings?.providerId!==next.providerId;settings=next;
   // Switch provider history only when the actual model selection is saved.
   if(changed){catalog=null;onProviderChange?.(next.providerId);}
   if(action||changed)onChange();
   const models=await desktop.getAIModels({refresh:force});
   if(disposed||id!==ticket)return;
   const latest=await desktop.getAISettings();
   if(disposed||id!==ticket)return;
   if(next.providerId!==models.providerId||latest.providerId!==models.providerId)
    throw Error(text('Anbieter wurde geändert. Auswahl bitte aktualisieren.','Provider changed. Please refresh the selection.'));
   settings=latest;catalog=models;
   if(action)onStatus(text('Modellauswahl gespeichert.','Model selection saved.'));
  }catch(error){if(!disposed&&id===ticket){overviewError=error.message;onStatus(error.message,true);}}
  finally{if(!disposed&&id===ticket){loading=false;onBusy(false);render();}}
 }
 trigger.onclick=()=>{render();dialog.showModal();search.focus();void discover();void loadBenchmarks();};
 close.onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>trigger.focus());
 search.oninput=render;el('[data-comparison]').onchange=render;
 refresh.onclick=()=>{void discover(true);void loadBenchmarks();};
 dialog.querySelectorAll('[data-scope]').forEach(button=>{button.onclick=()=>{scope=button.dataset.scope;render();};});
 effort.onchange=()=>{const reasoningEffort=effort.value;void update({action:()=>desktop.selectAIEffort({reasoningEffort})});};
 usage.onclick=()=>desktop.openChatGPTUsage().catch(error=>onStatus(error.message,true));
 el('[data-settings]').onclick=()=>{dialog.close();onSettings?.();};
 if(desktop?.getAIModels)void update();else summary();
 return {refresh:()=>update({refresh:true}),setBusy(value){externalBusy=value;controls();},hasImagesSupport:()=>selected()?.vision,
  dispose(){disposed=true;ticket++;discoveryTicket++;benchmarkTicket++;trigger.remove();dialog.remove();}};
}
