import {MESH_DISPLAY_STYLES} from './mesh-display-style.js';
import {DEFAULTS,validatePreferences} from './preferences.js';
import {CAD_PLUGIN,parsePlugin,label} from './cad-plugin-manifest.js';
import {CAD_QUALITY_DEFAULTS,validateCadQuality} from './cad-quality.js';
import {FORMNARO_VERSION} from './version.js';
import {parseFunctionPlugin} from './cad-function-plugins.js';
import {createCadLegalUI} from './cad-legal-ui.js';
import {translateText} from './i18n.js';
import {WORKFLOW_SETTINGS_DEFAULTS,createCadSettingsBundle,validateCadSettingsBundle,applyCadSettingsBundle} from './cad-workflow-settings.js';

// This factory uses the original preference and format-1 plugin data contracts.
// CAD validity is supplied by the caller's worker validation before persistence.
export function createCadInterfaceSettings({storage,getPreferences,setPreferences,getPlugins,setPlugins,functionPlugins,controller,modal,safe,toast=()=>{},download,mountAI=()=>{},mountLayout=()=>{},mountSolid,mountFusion,mountContext,getQuality,setQuality,validatePlugin,workflowSettings,getLayout,setLayout}){
  const legal=createCadLegalUI({modal,safe,download,t:text=>translateText(text,getPreferences().language)});
  const file=document.createElement('input');file.type='file';file.accept='.json,.ocplugin';file.hidden=true;document.body.append(file);
  const functionFile=document.createElement('input');functionFile.id='function-plugin-file';functionFile.type='file';functionFile.accept='.json,.ocfunction,.ocplugin';functionFile.hidden=true;document.body.append(functionFile);
  const settingsFile=document.createElement('input');settingsFile.id='settings-bundle-file';settingsFile.type='file';settingsFile.accept='.json,.formnaro-settings';settingsFile.hidden=true;document.body.append(settingsFile);
  let disposed=false,loadSequence=0,loading=false,bundleSequence=0,pendingBundle=null,bundleApplying=false;
  const byId=id=>document.getElementById(id),run=fn=>()=>safe(async()=>{if(!disposed&&!bundleApplying)return await fn();});
  const quality=()=>validateCadQuality(getQuality()),language=()=>getPreferences().language;
  function renderPlugins(){
    const root=byId('settings-plugins');if(!root||disposed)return;root.replaceChildren();
    for(const plugin of getPlugins()){
      const row=document.createElement('div');row.className='plugin-row';row.dataset.pluginId=plugin.manifest.id;
      const enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=plugin.enabled;enabled.setAttribute('aria-label','Formenpaket aktivieren');
      enabled.onchange=run(async()=>{const id=plugin.manifest.id,value=enabled.checked;try{await setPlugins(getPlugins().map(p=>p.manifest.id===id?{...p,enabled:value}:p));}finally{renderPlugins();}});
      const text=document.createElement('div'),name=document.createElement('strong'),description=document.createElement('p');name.textContent=label(plugin.manifest.name,language());description.textContent=label(plugin.manifest.description,language());name.dataset.noTranslate='';description.dataset.noTranslate='';text.append(name,description);
      const remove=document.createElement('button');remove.textContent='Entfernen';remove.onclick=run(async()=>{await setPlugins(getPlugins().filter(p=>p.manifest.id!==plugin.manifest.id));renderPlugins();});row.append(enabled,text,remove);root.append(row);
    }
    if(!getPlugins().length){const note=document.createElement('p');note.className='small-note';note.textContent='Noch keine Formenpakete geladen.';root.append(note);}
    const load=byId('plugin-load');if(load)load.disabled=loading;
    const functions=byId('settings-function-plugins');if(functions){functions.replaceChildren();for(const plugin of functionPlugins?.list()??[]){const row=document.createElement('div');row.className='plugin-row';row.dataset.functionPluginId=plugin.manifest.id;const enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=plugin.enabled;enabled.setAttribute('aria-label','Funktions-Plugin aktivieren');enabled.onchange=run(()=>{functionPlugins.enable(plugin.manifest.id,enabled.checked);renderPlugins();});const text=document.createElement('div'),name=document.createElement('strong'),note=document.createElement('p');name.textContent=label(plugin.manifest.name,language());note.textContent=plugin.builtin?'Mitgeliefert · unter Funktionen verfügbar':label(plugin.manifest.description,language());name.dataset.noTranslate='';text.append(name,note);const remove=document.createElement('button');remove.textContent=plugin.builtin?'Mitgeliefert':'Entfernen';remove.disabled=plugin.builtin;remove.onclick=run(()=>{functionPlugins.remove(plugin.manifest.id);renderPlugins();});row.append(enabled,text,remove);functions.append(row);}}
  }
  file.onchange=run(async()=>{
    const selected=file.files?.[0];if(!selected)return;const request=++loadSequence;loading=true;renderPlugins();
    try{
      if(selected.size>5*1024*1024)throw Error('Formenpakete dürfen höchstens 5 MB groß sein.');
      const manifest=parsePlugin(JSON.parse(await selected.text()));
      const check=validatePlugin||controller?.validatePlugin?.bind(controller);if(typeof check!=='function')throw Error('Die native CAD-Prüfung für Formenpakete fehlt.');
      await check(manifest);if(disposed||request!==loadSequence)return;
      const next=getPlugins().filter(p=>p.manifest.id!==manifest.id);if(next.length>=CAD_PLUGIN.maxPackages)throw Error('Maximal 20 Formenpakete können geladen werden.');
      next.push({manifest,enabled:true});await setPlugins(next);renderPlugins();toast('Formenpaket geladen.');
    }finally{if(request===loadSequence){loading=false;file.value='';renderPlugins();}}
  });
  functionFile.onchange=run(()=>{const selected=functionFile.files?.[0];functionFile.value='';if(!selected)return;return (async()=>{if(selected.size>5*1024*1024)throw Error('Funktions-Plugins dürfen höchstens 5 MB groß sein.');const manifest=parseFunctionPlugin(JSON.parse(await selected.text()));if(!functionPlugins)throw Error('Funktions-Plugins sind hier nicht verfügbar.');functionPlugins.import(manifest);renderPlugins();toast('Funktions-Plugin geladen.');})();});
  function fillPreferences(){
    const values=validatePreferences(getPreferences());
    for(const key of Object.keys(DEFAULTS)){
      const input=byId('settings-'+key);if(!input)continue;if(input.type==='checkbox')input.checked=values[key];else input.value=String(values[key]);
      input.onchange=run(async()=>{const value=input.type==='checkbox'?input.checked:typeof DEFAULTS[key]==='number'?Number(input.value):input.value;try{await setPreferences(validatePreferences({...getPreferences(),[key]:value}));}finally{fillPreferences();if(key==='language')renderPlugins();}});
      if(input.type==='range')input.oninput=input.onchange;
    }
    const output=byId('settings-handle-output');if(output)output.value=values.handleSize+' px';
  }
  function fillQuality(){
    const values=quality();
    for(const purpose of ['display','export'])for(const key of ['deflection','angleDegrees']){
      const input=byId(`settings-${purpose}-${key}`);if(!input)continue;input.value=String(values[purpose][key]);
      input.onchange=run(async()=>{const next=quality();next[purpose][key]=Number(input.value);try{await setQuality(validateCadQuality(next));}finally{fillQuality();}});
    }
  }
  function fillWorkflow(){
    if(!workflowSettings)return;const value=workflowSettings.get();
    for(const [section,key]of [['import','unit'],['import','meshUse'],['import','svgHeight'],['export','format'],['export','scope'],['conversion','tolerance'],['conversion','mode'],['conversion','fallback'],['conversion','repair'],['conversion','meshRepair']]){
      const input=byId(`settings-workflow-${section}-${key}`);if(!input)continue;const field=value[section][key];if(input.type==='checkbox')input.checked=field;else input.value=String(field);
      input.onchange=run(()=>{const changed=input.type==='checkbox'?input.checked:typeof field==='number'?Number(input.value):input.value;try{workflowSettings.update({[section]:{[key]:changed}});}finally{fillWorkflow();}});
    }
  }
  function bundleState(){const status=byId('settings-bundle-status'),apply=byId('settings-bundle-apply'),discard=byId('settings-bundle-discard');if(!status)return;status.textContent=pendingBundle?'Datei geprüft. Programm-, Qualitäts- und Dateieinstellungen'+(pendingBundle.layout?' sowie die aktuelle Oberflächenanordnung':'')+' werden erst mit „Einstellungen übernehmen“ geändert. Das aktuelle Modell bleibt erhalten.':'';apply.hidden=discard.hidden=!pendingBundle;}
  settingsFile.onchange=run(async()=>{const selected=settingsFile.files?.[0],ticket=++bundleSequence;settingsFile.value='';if(!selected)return;pendingBundle=null;bundleState();try{if(selected.size>256*1024)throw Error('Einstellungsdateien dürfen höchstens 256 KB groß sein.');const checked=validateCadSettingsBundle(JSON.parse(await selected.text()));if(disposed||ticket!==bundleSequence||!byId('settings-bundle-status'))return;pendingBundle=checked;bundleState();}catch(error){if(!disposed&&ticket===bundleSequence&&byId('settings-bundle-status'))byId('settings-bundle-status').textContent='Einstellungen nicht geladen: '+error.message;}});
  function refresh(){if(disposed||!byId('settings-language'))return;fillPreferences();fillQuality();fillWorkflow();renderPlugins();}

  function open(){
    if(disposed)return;pendingBundle=null;++bundleSequence;
    document.title='Formnaro '+FORMNARO_VERSION+' · Lokale 3D-Werkstatt';
    modal('Einstellungen',`<div class="settings-tabs"><button data-settings-tab="general" class="active">Allgemein</button><button data-settings-tab="modeling">Modellieren</button>${workflowSettings?'<button data-settings-tab="files">Dateien</button>':''}<button data-settings-tab="layout">Oberfläche</button><button data-settings-tab="plugins">Plugins</button><button data-settings-tab="ai">KI / API</button></div>
      <section data-settings-page="general"><label class="dialog-label">Sprache<select id="settings-language"><option value="de">Deutsch</option><option value="en">English</option></select></label><label class="dialog-label">Darstellung<select id="settings-theme"><option value="light">Hell</option><option value="dark">Dunkel</option><option value="system">Wie Windows</option></select></label><label class="dialog-label">STL-Ansicht<select id="settings-meshDisplayStyle">${Object.entries(MESH_DISPLAY_STYLES).map(([id,s])=>`<option value="${id}">${s.label}</option>`).join('')}</select></label><p class="small-note">Nur die Ansicht ändert sich. Gespeicherte Modellfarben und Export bleiben erhalten.</p><label class="check-line"><input id="settings-autosave" type="checkbox"> Automatisch lokal sichern</label><label class="dialog-label">Zoom-Geschwindigkeit<input id="settings-zoomSpeed" type="range" min="0.3" max="3" step="0.1"></label><p class="small-note" id="settings-storage-note">Einstellungen gelten für dieses Programm und bleiben nach einem Neustart erhalten.</p></section>
      <section data-settings-page="modeling" hidden><label class="dialog-label">Rasterfang<select id="settings-snap"><option value="0">Aus</option><option value="0.1">0,1 mm</option><option value="0.25">0,25 mm</option><option value="0.5">0,5 mm</option><option value="1">1 mm</option><option value="2">2 mm</option><option value="5">5 mm</option></select></label><p class="small-note" id="settings-rotation-ring">Drehkreis: im Kreis 15°, außerhalb 1°. Umschalttaste: immer 15°.</p><label class="dialog-label">Griffgröße<input id="settings-handleSize" type="range" min="10" max="24" step="1"><output id="settings-handle-output"></output></label><label class="check-line"><input id="settings-gridVisible" type="checkbox"> Raster und Arbeitsebene anzeigen</label>
      <h3>Anzeigequalität</h3><label class="dialog-label">Flächenabweichung (mm)<input id="settings-display-deflection" type="number" min="0.0000001" max="10" step="any"></label><label class="dialog-label">Winkel (Grad)<input id="settings-display-angleDegrees" type="number" min="0.000001" max="90" step="any"></label>
      <h3>Exportqualität</h3><label class="dialog-label">Flächenabweichung (mm)<input id="settings-export-deflection" type="number" min="0.0000001" max="10" step="any"></label><label class="dialog-label">Winkel (Grad)<input id="settings-export-angleDegrees" type="number" min="0.000001" max="90" step="any"></label><p class="small-note">Kleinere Werte erzeugen feinere Netze. Anzeige und Export haben getrennte Einstellungen. Maße und CAD-Geometrie bleiben bei einer Qualitätsänderung erhalten.</p></section>
      ${workflowSettings?`<section data-settings-page="files" hidden><p>Diese Vorgaben gelten gemeinsam für den Dateiimport, den Export und STL → STEP. Jeder Dialog lässt sich vor dem Start anpassen.</p>
      <h3>Import</h3><label class="dialog-label">STL-/Netzeinheit<select id="settings-workflow-import-unit"><option value="1">Millimeter</option><option value="10">Zentimeter</option><option value="25.4">Zoll</option></select></label><label class="dialog-label">Netzdateien verwenden als<select id="settings-workflow-import-meshUse"><option value="reference">Ansichtsvorlage</option><option value="mesh">Bearbeitbares Netzteil</option><option value="cad">STL als CAD-Körper rekonstruieren</option></select></label><label class="dialog-label">SVG-Höhe (mm)<input id="settings-workflow-import-svgHeight" type="number" min="0.0001" max="10000" step="any"></label>
      <h3>Export</h3><label class="dialog-label">Format<select id="settings-workflow-export-format"><option value="stl">STL</option><option value="step">STEP</option><option value="obj">OBJ + MTL</option><option value="3mf">3MF</option><option value="glb">GLB</option><option value="gltf">glTF</option><option value="svg">SVG</option></select></label><label class="dialog-label">Umfang<select id="settings-workflow-export-scope"><option value="all">Sichtbare Teile</option><option value="selection">Ausgewählte Teile</option></select></label>
      <h3>Netz → CAD / STL → STEP</h3><label class="dialog-label">Abweichungsbudget (mm)<input id="settings-workflow-conversion-tolerance" type="number" min="0.0001" max="100" step="any"></label><label class="dialog-label">Verfahren<select id="settings-workflow-conversion-mode"><option value="auto">Automatisch · Flächen, Profile und Freiformen</option><option value="smooth">Gekrümmte Flächen</option><option value="planar">Planare Näherung</option><option value="exact">Originalfacetten</option></select></label><label class="check-line"><input id="settings-workflow-conversion-fallback" type="checkbox"> Facetten als Rückfall erlauben</label><label class="check-line"><input id="settings-workflow-conversion-repair" type="checkbox"> STL-Datei vor der CAD-Konvertierung reparieren</label><label class="check-line"><input id="settings-workflow-conversion-meshRepair" type="checkbox"> Ausgewähltes Szenennetz vor der CAD-Konvertierung reparieren</label><p class="small-note">Reparatur betrifft die neue CAD-Kopie. Die normale Konvertierung arbeitet lokal ohne KI. „Mit KI“ wird für jeden Auftrag ausdrücklich ausgewählt; diese Zustimmung wird nicht gespeichert. Abweichungen werden in Stichproben geprüft und sind keine garantierten Maximalfehler.</p>
      <h3>Einstellungen übertragen</h3><p class="small-note">Die Datei enthält Programmeinstellungen, Anzeige-/Exportqualität, Dateivorgaben und die aktuelle Oberflächenanordnung. API-Zugangsdaten, KI-Anbieterprofile, Modelle, Bibliotheken und Autosicherungen sind nicht enthalten. Benannte Layouts bleiben im Ordner „Layouts“ erhalten.</p><div class="two-buttons"><button id="settings-bundle-save">Einstellungen speichern …</button><button id="settings-bundle-load">Einstellungen laden …</button></div><p id="settings-bundle-status" role="status"></p><div class="two-buttons"><button id="settings-bundle-discard" hidden>Verwerfen</button><button id="settings-bundle-apply" class="primary" hidden>Einstellungen übernehmen</button></div></section>`:''}
      <section data-settings-page="plugins" hidden><p>Lokale Formen- und Vorlagenpakete hinzufügen. Geladene Formen erscheinen in der Bibliothek; ihre gespeicherten Modelle behalten die CAD-Geometrie.</p><div id="settings-plugins"></div><div class="two-buttons"><button id="plugin-load">Formenpaket laden …</button><button id="plugin-example">Beispielpaket speichern</button></div><p class="small-note">OfflineCAD-Plugin, Format 1 · JSON/.ocplugin · bis zu 20 Pakete. Alle Vorlagen werden vor dem Laden als CAD-Körper geprüft.</p></section>
      <section data-settings-page="layout" hidden id="layout-settings-page"></section><section data-settings-page="ai" hidden id="ai-settings-page"></section><div class="modal-actions"><button id="settings-reset">Standardwerte</button><button id="settings-done" class="primary">Fertig</button></div>`);
    refresh();
    if(storage?.info){const note=byId('settings-storage-note');note.textContent='Einstellungen, Bibliothek und Autosicherung liegen im Ordner „Daten“ neben Formnaro.exe. Zum PC-Wechsel die Ordner „Daten“ und „Layouts“ mitkopieren.';if(typeof globalThis.offlinecadDesktop?.openProgramDataFolder==='function'){const button=document.createElement('button');button.id='settings-data-folder';button.textContent='Datenordner öffnen';button.onclick=run(()=>globalThis.offlinecadDesktop.openProgramDataFolder());note.after(button);}}
    byId('settings-done').onclick=()=>byId('modal')?.close();
    const legalButton=document.createElement('button');legalButton.id='settings-legal';legalButton.textContent='Impressum und Lizenz';legalButton.onclick=()=>safe(legal.open);document.querySelector('[data-settings-page="general"]').append(legalButton);
    if(typeof globalThis.offlinecadDesktop?.openErrorLogFolder==='function'){
      const section=document.querySelector('[data-settings-page="general"]'),note=document.createElement('p'),button=document.createElement('button');
      note.className='small-note';note.textContent='Fehler werden automatisch lokal protokolliert. Die letzten fünf Protokolldateien bleiben erhalten.';
      button.id='settings-error-log-folder';button.textContent='Fehlerprotokolle öffnen';button.onclick=run(()=>globalThis.offlinecadDesktop.openErrorLogFolder());section.append(note,button);
    }
    byId('settings-reset').onclick=run(async()=>{await setPreferences({...DEFAULTS});await setQuality(structuredClone(CAD_QUALITY_DEFAULTS));workflowSettings?.set(WORKFLOW_SETTINGS_DEFAULTS);pendingBundle=null;bundleState();refresh();});
    if(mountSolid){const tab=document.createElement('button');tab.id='settings-tab-solid';tab.dataset.settingsTab='solid';tab.textContent='Solid';document.querySelector('.settings-tabs').append(tab);const page=document.createElement('section');page.dataset.settingsPage='solid';page.hidden=true;byId('layout-settings-page').closest('[data-settings-page]').after(page);mountSolid(page);}
    if(mountFusion){const tab=document.createElement('button');tab.id='settings-tab-fusion';tab.dataset.settingsTab='fusion';tab.textContent='Fusion 360';document.querySelector('.settings-tabs').append(tab);const page=document.createElement('section');page.dataset.settingsPage='fusion';page.hidden=true;byId('layout-settings-page').closest('[data-settings-page]').after(page);mountFusion(page);}
    if(mountContext){const tab=document.createElement('button');tab.id='settings-tab-context';tab.dataset.settingsTab='context';tab.textContent=language()==='en'?'Right click':'Rechtsklick';document.querySelector('.settings-tabs').append(tab);const page=document.createElement('section');page.dataset.settingsPage='context';page.hidden=true;byId('layout-settings-page').closest('[data-settings-page]').after(page);mountContext(page);}
    const root=byId('modal-body')||document;
    for(const button of root.querySelectorAll('[data-settings-tab]'))button.onclick=()=>{for(const tab of root.querySelectorAll('[data-settings-tab]'))tab.classList.toggle('active',tab===button);for(const page of root.querySelectorAll('[data-settings-page]'))page.hidden=page.dataset.settingsPage!==button.dataset.settingsTab;};
    const pluginRoot=byId('settings-plugins');const shapesHeading=document.createElement('h3');shapesHeading.textContent='Formenpakete';pluginRoot.before(shapesHeading);
    if(functionPlugins){const heading=document.createElement('h3');heading.textContent='Funktions-Plugins';const note=document.createElement('p');note.textContent='Diese Erweiterungen erscheinen unter „Funktionen“, getrennt von der Formenbibliothek.';const root=document.createElement('div');root.id='settings-function-plugins';const load=document.createElement('button');load.id='function-plugin-load';load.textContent='Funktions-Plugin laden …';load.onclick=()=>functionFile.click();byId('plugin-example').closest('[data-settings-page]').append(heading,note,root,load);renderPlugins();}
    byId('plugin-load').onclick=()=>{if(!loading)file.click();};byId('plugin-example').onclick=run(()=>download(JSON.stringify(CAD_EXAMPLE_PLUGIN,null,2),'Formnaro-Werkstatt.ocplugin','application/json'));
    if(workflowSettings){
      byId('settings-bundle-save').onclick=run(()=>download(JSON.stringify(createCadSettingsBundle({preferences:getPreferences(),quality:quality(),workflow:workflowSettings.get(),...(getLayout?{layout:getLayout()}:{})}),null,2),'Formnaro-Einstellungen.formnaro-settings','application/json'));
      byId('settings-bundle-load').onclick=()=>settingsFile.click();byId('settings-bundle-discard').onclick=()=>{pendingBundle=null;++bundleSequence;bundleState();};
      byId('settings-bundle-apply').onclick=run(async()=>{if(!pendingBundle)return;const requested=pendingBundle,root=byId('modal-body');bundleApplying=true;if(root)root.inert=true;try{await applyCadSettingsBundle({getPreferences,setPreferences,getQuality,setQuality,workflowSettings,getLayout,setLayout},requested);pendingBundle=null;bundleState();refresh();toast('Einstellungen übernommen. Das aktuelle Modell bleibt erhalten.');}finally{bundleApplying=false;if(root)root.inert=false;}});
    }
    mountAI(byId('ai-settings-page'));mountLayout(byId('layout-settings-page'));
  }
  function dispose(){disposed=true;++loadSequence;++bundleSequence;pendingBundle=null;file.onchange=null;functionFile.onchange=null;settingsFile.onchange=null;file.remove();functionFile.remove();settingsFile.remove();}
  return {open,file,functionFile,settingsFile,refresh,dispose,openLegal:legal.open};
}

// Independent original format-1 sample data; no legacy model builder import.
export const CAD_EXAMPLE_PLUGIN={format:'OfflineCAD-Plugin',version:1,id:'workshop',name:{de:'Werkstattvorlagen',en:'Workshop templates'},description:{de:'Abstandshalter, Flansch und Gewindehülse',en:'Spacer, flange and threaded insert'},shapes:[
  {id:'spacer',name:{de:'Abstandshalter',en:'Spacer'},nodes:[{type:'tube',size:[16,16,12],params:{wall:3}}]},
  {id:'flange',name:{de:'Flansch mit Bohrungen',en:'Drilled flange'},nodes:[{type:'cylinder',size:[40,40,6],pos:[0,0,3]},...[[12,0],[-12,0],[0,12],[0,-12]].map(([x,y])=>({type:'cylinder',size:[4,4,10],pos:[x,y,3],solid:false})),{type:'cylinder',size:[10,10,10],pos:[0,0,3],solid:false}]},
  {id:'insert',name:{de:'Gewindehülse M8',en:'M8 threaded insert'},nodes:[{type:'cylinder',size:[20,20,16],pos:[0,0,8]},{type:'thread',pos:[0,0,8],solid:false,params:{kind:'cutter',diameter:8,pitch:1.25,length:20,clearance:.15}}]}
]};
