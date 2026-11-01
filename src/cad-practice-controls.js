import {PROGRAM_NAV} from './cad-program-help.js';
// Semantic controls inside the current Formnaro document. No caller selectors,
// coordinates, arbitrary keys, window handles or external navigation.
export function practiceControl(document,target){
 if(typeof target!=='string'||target.length>240||!/^ui:(id|label|tool|menu):[^\r\n\x00]+$/.test(target))throw Error('Ein benanntes Formnaro-Bedienelement wählen.');
 const [,kind,...rest]=target.split(':'),name=kind==='menu'?(PROGRAM_NAV.find(t=>t.id==='menu:'+rest.join(':'))?.label??rest.join(':')):rest.join(':'),normal=s=>String(s??'').replace(/[\s▾⌄]+/g,' ').trim();
 if(!['label','menu'].includes(kind)&&!/^[A-Za-z][A-Za-z0-9_-]{0,199}$/.test(name))throw Error('Ungültige Bedienelementkennung.');
 const visible=n=>n&&n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden'&&!n.closest('#practice-overlay');
 let candidates=[];
 if(kind==='id')candidates=[document.getElementById(name)];
 else if(kind==='tool')candidates=[...document.querySelectorAll('button')].filter(n=>[n.dataset.action,n.dataset.solidCommand,n.dataset.fusionCommand].includes(name));
 else {
  const labels=[...document.querySelectorAll('label')].filter(n=>normal(n.childNodes.length?[...n.childNodes].filter(c=>c.nodeType===3).map(c=>c.textContent).join(' '):n.textContent)===normal(name));
  candidates=labels.map(n=>n.control??(n.htmlFor?document.getElementById(n.htmlFor):n.querySelector('input,select,textarea'))).filter(Boolean);
  if(!candidates.length)candidates=[...document.querySelectorAll('button,summary,input,select,textarea,[role=button]')].filter(n=>[n.getAttribute('aria-label'),n.tagName==='INPUT'?n.getAttribute('title'):n.textContent].some(v=>v!=null&&normal(v)===normal(name)));
 }
 candidates=[...new Set(candidates.filter(visible))];if(candidates.length!==1)throw Error('Formnaro-Bedienelement fehlt oder ist mehrdeutig: '+name);
 const node=candidates[0];if(node.disabled)throw Error('Formnaro-Bedienelement ist deaktiviert: '+name);
 // These controls leave this document or address credentials rather than the
 // exercise. Ordinary menus, dialogs, modelling fields and mode controls have
 // no hand-written allowlist.
 if(['file','password','color'].includes(node.type)||node.tagName==='A'||/(?:login|sign.?in|open.?folder|open.?browser|subscription-open|provider-docs|context-folder|log-folder|layout-folder|project-folder|data-folder)/i.test(node.id)||node.hasAttribute('data-external')||['open','save','save-as','import'].includes(node.dataset.action))throw Error('Dieses Ziel führt aus dem Formnaro-Übungsfenster heraus.');
 return node;
}
export function installPracticeControlBridge(document,host=window){
 document.addEventListener?.('click',event=>{if(event.target?.tagName==='INPUT'&&['file','color'].includes(event.target.type)){event.preventDefault();event.stopImmediatePropagation();}},true);
 host.__formnaroPracticeControl=(operation,spec,point)=>{
  const node=practiceControl(document,spec.target);
  if(operation==='focused')return document.activeElement===node;
  if(operation==='hit'){const hit=document.elementFromPoint(point.x,point.y);return {ok:!!hit&&(node===hit||node.contains(hit)),hit:hit?hit.tagName+'#'+hit.id:'none'};}
  if(operation!=='locate')throw Error('Unbekannte Bedienelementabfrage.');
  node.scrollIntoView({block:'center',inline:'nearest'});const r=node.getBoundingClientRect(),result={x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),width:r.width,height:r.height};
  if(spec.action==='drag'){if(node.tagName!=='INPUT'||node.type!=='range')throw Error('Einen Schieberegler wählen.');result.range={min:Number(node.min||0),max:Number(node.max||100),value:Number(node.value)};}
  if(spec.action==='choose'){
   if(node.tagName!=='SELECT')throw Error('Eine echte Auswahlliste wählen.');const options=[...node.options],matches=options.filter(o=>!o.disabled&&(o.value===spec.value||o.textContent.trim()===spec.value));if(matches.length!==1||options.length>512)throw Error('Die gewünschte Auswahl fehlt oder ist mehrdeutig.');result.optionIndex=options.indexOf(matches[0]);
  }
  if(spec.action==='set'&&!['INPUT','TEXTAREA'].includes(node.tagName))throw Error('Ein echtes Eingabefeld wählen.');
  return result;
 };
}
