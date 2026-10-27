import {FORMNARO_LEGAL} from './formnaro-legal.js';
import {FORMNARO_VERSION} from './version.js';
import './cad-legal.css';

// Original notices stay verbatim and are loaded locally only when selected.
const documents={
  ...import.meta.glob('../THIRD-PARTY-LICENSES.txt',{query:'?raw',import:'default'}),
  ...import.meta.glob('../licenses/**/*.{txt,TXT,md}',{query:'?raw',import:'default'}),
  ...import.meta.glob('../converter/runtime-v010/Lizenzen/**/*',{query:'?raw',import:'default'})
};
export function createCadLegalUI({modal,safe,download,t=text=>text,information=FORMNARO_LEGAL}={}){
  function open(){
    modal('Impressum und Lizenz',`<div class="cad-legal-summary"><strong>Formnaro</strong><span id="legal-version"></span></div>
      <section class="cad-legal-section"><h3>Name / Rechteinhaber</h3><p id="legal-copyright" data-no-translate></p><p id="legal-contact" data-no-translate hidden></p></section>
      <section class="cad-legal-section"><h3>Eigene Softwarelizenz</h3><p id="legal-license-name" data-no-translate></p><p id="legal-license-summary" class="small-note" hidden></p><details id="legal-own-details" hidden><summary>Vollständiger Lizenztext</summary><pre id="legal-own-text" class="cad-legal-text" data-no-translate></pre><button id="legal-own-save">Eigenen Lizenztext speichern</button></details></section>
      <details class="cad-legal-section" id="legal-third-party"><summary>Lizenzen der verwendeten Komponenten</summary><p class="small-note">Für verwendete Bibliotheken, den CAD-Kern, Schriften und die Konverter-Laufzeit gelten die jeweiligen Original-Lizenztexte.</p><label class="dialog-label">Lizenzdokument<select id="legal-document"></select></label><p id="legal-document-status" class="small-note" role="status"></p><pre id="legal-document-text" class="cad-legal-text" data-no-translate></pre><button id="legal-document-save" disabled>Ausgewählten Lizenztext speichern</button></details>
      <div class="modal-actions"><button id="legal-close" class="primary">Schließen</button></div>`);
    const byId=id=>document.getElementById(id),copyright=byId('legal-copyright'),name=byId('legal-license-name');
    byId('legal-version').textContent=t('Version')+' '+FORMNARO_VERSION;
    copyright.textContent=information.copyrightHolder?`© ${information.copyrightYear} ${information.copyrightHolder}`:t('Name noch nicht eingetragen.');
    name.textContent=information.licenseName||t('Eigene Lizenz noch nicht festgelegt.');
    if(information.licenseSummary){byId('legal-license-summary').hidden=false;byId('legal-license-summary').textContent=t(information.licenseSummary);}
    if(information.contact){byId('legal-contact').hidden=false;byId('legal-contact').textContent=information.contact;}
    if(information.licenseText){byId('legal-own-details').hidden=false;byId('legal-own-text').textContent=information.licenseText;byId('legal-own-save').onclick=()=>safe(()=>download(information.licenseText,'Formnaro-Lizenz.txt','text/plain;charset=utf-8'));}
    const select=byId('legal-document'),text=byId('legal-document-text'),status=byId('legal-document-status'),save=byId('legal-document-save');let sequence=0,current=null;
    const keys=Object.keys(documents).sort((a,b)=>a.includes('THIRD-PARTY-LICENSES')?-1:b.includes('THIRD-PARTY-LICENSES')?1:a.localeCompare(b));
    for(const key of keys){const option=document.createElement('option');option.value=key;const file=key.split('/').at(-1);option.textContent=key.includes('THIRD-PARTY-LICENSES')?t('Gesammelte Lizenzhinweise'):key.includes('/converter/runtime-v010/Lizenzen/')?t('Konverter')+' · '+key.split('/Lizenzen/')[1].split('/')[0]+' · '+file:key.includes('/fonts/')?t('Schriften')+' · '+file:key.includes('/cad-kernel/')?t('CAD-Kern')+' · '+file:file;option.dataset.noTranslate='';select.append(option);}
    async function load(){const request=++sequence,key=select.value;current=null;save.disabled=true;text.textContent='';status.textContent=t('Lizenztext wird geladen …');try{const value=await documents[key]();if(request!==sequence||!text.isConnected)return;text.textContent=value;current={key,text:value};status.textContent='';save.disabled=false;}catch(error){if(request!==sequence||!text.isConnected)return;status.textContent=t('Lizenztext konnte nicht geladen werden.');throw error;}}
    select.onchange=()=>safe(load);byId('legal-third-party').ontoggle=()=>{if(byId('legal-third-party')?.open&&!current)safe(load);};
    save.onclick=()=>safe(()=>current&&download(current.text,current.key.split('/').at(-1),'text/plain;charset=utf-8'));
    byId('legal-close').onclick=()=>document.getElementById('modal').close();
  }
  return {open};
}
