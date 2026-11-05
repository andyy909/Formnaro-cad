import license from '../LICENSE.txt?raw';
import notices from '../THIRD-PARTY-LICENSES.txt?raw';
import links from '../backend/about-links.json';
import {FORMNARO_VERSION,FORMNARO_BUILD_LABEL} from './version.js';

export function showCadAbout({modal,safe,language}){
 const en=language==='en',word=(de,enText)=>en?enText:de;
 modal(word('Über Formnaro','About Formnaro'),`
  <p><strong>Formnaro ${FORMNARO_VERSION} · ${FORMNARO_BUILD_LABEL}</strong></p>
  <p>${word('Entwicklung','Development')}: Andreas Klisch<br>${word('Lizenz','License')}: MIT</p>
  <p>${word('Bei einer Fehlermeldung helfen die Programmversion, die Schritte zum Nachstellen und die angezeigte Meldung.',
            'For a bug report, include the program version, the steps to reproduce it and any displayed error.')}</p>
  <ul class="formnaro-about-links">
   <li><a data-about-link="contact" href="${links.contact}">kontakt@formnaro.de</a></li>
   <li><a data-about-link="issues" href="${links.issues}">${word('Fehler auf GitHub melden','Report a bug on GitHub')}</a></li>
   <li><a data-about-link="repository" href="${links.repository}">${word('Öffentliches GitHub-Repository','Public GitHub repository')}</a></li>
  </ul>
  <details><summary>MIT</summary><pre id="formnaro-about-license"></pre></details>
  <details><summary>${word('Drittanbieter-Lizenzen','Third-party licenses')}</summary><pre id="formnaro-about-notices"></pre></details>
 `);
 for(const [id,content] of [['license',license],['notices',notices]]){
  const pre=document.getElementById('formnaro-about-'+id);
  pre.textContent=content;pre.style.whiteSpace='pre-wrap';
 }
 for(const anchor of document.querySelectorAll('[data-about-link]')){
  anchor.target='_blank';anchor.rel='noopener noreferrer';
  const desktop=window.offlinecadDesktop;
  if(desktop?.openAboutLink)anchor.onclick=event=>{
   event.preventDefault();safe(()=>desktop.openAboutLink(anchor.dataset.aboutLink));
  };
 }
}
