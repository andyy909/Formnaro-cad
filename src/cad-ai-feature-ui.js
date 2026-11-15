import * as THREE from 'three';
import {cadAIReferenceState,cadAISourceReferenceCatalog} from './cad-ai-feature-references.js';
import {upsertCadAIReference,removeCadAIReference,validateCadAIReference} from './cad-ai-feature-reference-data.js';
import {pickCadFeatureEdge} from './cad-ai-feature-picking.js';
import './cad-ai-feature.css';

const labels={face:'Fläche',edge:'Kante',bore:'Bohrung',sketch:'Skizze',feature:'Konstruktionsmerkmal'},sameTarget=(a,b)=>a?.rootId===b?.rootId&&JSON.stringify(a?.path)===JSON.stringify(b?.path);
export function createCadAIFeatureUI({controller,view,getSelection,select,prepare,onAttach,language=()=> 'de',onHighlight=()=>{},toast=()=>{},openReferenceRebind}={}){
 const panel=document.createElement('section');panel.id='ai-feature-panel';panel.className='ai-feature-panel';panel.hidden=true;panel.setAttribute('aria-label','Merkmalsbezüge für den KI-Chat');panel.dataset.noTranslate='';
 panel.innerHTML='<header><strong>Merkmalsbezüge für den KI-Chat</strong><button type="button" data-ref-close>Schließen</button></header><p>Einzelne native CAD-Stellen auswählen, im Projekt speichern und an den Chat anhängen. Geänderte oder mehrdeutige Bezüge müssen bewusst neu zugeordnet werden.</p><div class="ai-feature-actions"><button type="button" data-ref-source>Auswahl als Merkmal</button><button type="button" data-ref-sketch>Auswahl als Skizze</button></div><label>Fertiges CAD-Teil<select data-ref-root></select></label><div class="ai-feature-actions"><button type="button" data-ref-pick="face">Fläche wählen</button><button type="button" data-ref-pick="bore">Bohrung wählen</button><button type="button" data-ref-pick="edge">Kante wählen</button><button type="button" data-ref-stop hidden>Auswahl beenden</button></div><details><summary>Erhaltene Konstruktionsquellen</summary><select data-ref-tree aria-label="Konstruktionsquelle"></select><button type="button" data-ref-tree-use>Quelle übernehmen</button></details><div data-ref-candidate hidden><h3>Gewählter Bezug</h3><label>Name<input data-ref-name maxlength="160"></label><p data-ref-measure></p><div data-ref-origins></div><button type="button" data-ref-save>Im Projekt speichern</button><button type="button" data-ref-save-attach>Speichern und an Chat anhängen</button><button type="button" data-ref-candidate-cancel>Auswahl verwerfen</button></div><p data-ref-status role="status" aria-live="polite"></p><h3>Gespeicherte Bezüge</h3><div data-ref-list></div>';
 document.getElementById('viewport').append(panel);const q=s=>panel.querySelector(s),overlay=new THREE.Group();overlay.name='ai-feature-reference';let active=null,generation=0,focused=null,sourceCatalog=[];
 const text=(de,en)=>language()==='en'?en:de;
 if(openReferenceRebind){const button=document.createElement('button');button.type='button';button.dataset.refRebindTogether='';button.textContent='KI- und Gelenkbezüge gemeinsam neu zuordnen …';button.onclick=()=>run(()=>{close();return openReferenceRebind({kind:'feature',id:focused});});q('[data-ref-list]').before(button);}
 function status(text,error=false){q('[data-ref-status]').textContent=text;q('[data-ref-status]').classList.toggle('ai-error',error);}
 function clearOverlay(){for(const child of [...overlay.children]){child.geometry?.dispose();child.material?.dispose();overlay.remove(child);}overlay.removeFromParent();view.invalidate?.('feature-reference');}
 function paint(display){clearOverlay();if(!display?.curves?.length)return;view.groups.measurements.add(overlay);for(const points of display.curves){if(points.length<2)continue;const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color:'#0c87ff',depthTest:false}));line.renderOrder=45;overlay.add(line);}view.invalidate?.('feature-reference');}
 const project=()=>controller.readSnapshot(),refs=()=>project().featureReferences?.items??[];
 function rootOptions(){const selected=q('[data-ref-root]').value,targets=getSelection(),selectedRoot=targets.length===1?targets[0].rootId:null,root=q('[data-ref-root]');root.replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent='Ein sichtbares CAD-Teil auswählen';root.append(empty);for(const node of project().nodes.filter(n=>n.kind==='cad'&&n.solid&&!n.hidden&&view.allows(n.id))){const option=document.createElement('option');option.value=node.id;option.textContent=node.name;root.append(option);}root.value=[selectedRoot,selected].find(id=>[...root.options].some(o=>o.value===id))??'';renderTree();}
 function renderTree(){const id=q('[data-ref-root]').value,tree=q('[data-ref-tree]');tree.replaceChildren();sourceCatalog=id?cadAISourceReferenceCatalog(project(),{rootIds:[id]}).items:[];for(const [i,item]of sourceCatalog.entries()){const option=document.createElement('option');option.value=String(i);option.textContent='· '.repeat(item.target.path.length)+item.name+' · '+(item.recipeType??item.source)+(item.locked?' · gesperrt':'');tree.append(option);}for(const button of panel.querySelectorAll('[data-ref-pick]'))button.disabled=!id;q('[data-ref-tree-use]').disabled=!sourceCatalog.length;}
 function mark(id){focused=id;for(const row of panel.querySelectorAll('[data-reference-id]'))row.classList.toggle('highlighted',row.dataset.referenceId===id);onHighlight(id);}
 function render(){const list=q('[data-ref-list]');list.replaceChildren();if(!refs().length){const p=document.createElement('p');p.textContent='Noch keine Merkmalsbezüge gespeichert.';list.append(p);}for(const reference of refs()){
   const state=cadAIReferenceState(project(),reference),row=document.createElement('article'),title=document.createElement('strong'),message=document.createElement('p'),actions=document.createElement('div');row.dataset.referenceId=reference.id;row.classList.toggle('highlighted',focused===reference.id);title.textContent=labels[reference.kind]+' · '+reference.name;message.textContent=state.status==='current'?(state.editable?'Geometriebezug aktuell':state.reason):state.message;message.className=state.status==='current'?'':'ai-error';actions.className='ai-feature-actions';
   for(const [label,fn,disabled]of [['Im Modell zeigen',()=>highlight(reference),state.status!=='current'],['An Chat anhängen',()=>attach(reference),state.status!=='current'],['Neu zuordnen',()=>rebind(reference),false],['Entfernen',()=>save(removeCadAIReference(project().featureReferences,reference.id)),false]]){const button=document.createElement('button');button.type='button';button.textContent=label;button.disabled=disabled||!!active?.running;button.onclick=()=>run(fn);actions.append(button);}row.append(title,message,actions);list.append(row);
  }
 }
 async function run(fn){try{return await fn();}catch(error){if(error.name!=='AbortError'&&error.code!=='ABORTED'){status(error.message,true);toast(error.message);}return null;}}
 function updateChatAttach(s){
  if(!s.pickForChat||!s.candidate)return;
  const {reference}=s.candidate;
  q('[data-ref-save-attach]').disabled=s.running||(reference.kind==='bore'&&!reference.origin);
 }
 function setWorking(s,value){if(active!==s)return;s.running=value;for(const e of panel.querySelectorAll('button,input,select'))e.disabled=value;q('[data-ref-close]').disabled=false;q('[data-ref-stop]').disabled=false;if(!value){renderTree();render();updateChatAttach(s);}}
 function stopPicking(){if(!active)return;active.picking=null;active.edgeList=null;generation++;view.setInteraction(null);view.setEdges([]);q('[data-ref-stop]').hidden=true;panel.classList.remove('picking');}
 function close(){if(!active)return false;active.abort?.abort();stopPicking();active=null;panel.hidden=true;panel.classList.remove('chat-pick');clearOverlay();return true;}
 async function open({pickForChat=false}={}){
  prepare();
  active={revision:controller.revision(),picking:null,candidate:null,running:false,saving:false,rebind:null,pickForChat};
  panel.classList.toggle('chat-pick',pickForChat);
  q('[data-ref-save-attach]').textContent=pickForChat?text('Speichern und anhängen','Save and attach'):'Speichern und an Chat anhängen';
  q('[data-ref-candidate-cancel]').textContent=pickForChat?text('Andere Stelle wählen','Choose another feature'):'Auswahl verwerfen';
  panel.hidden=false;q('[data-ref-candidate]').hidden=true;rootOptions();render();
  if(pickForChat){await beginPick('auto');q('[data-ref-close]').focus();}
  else status('Eine Quelle wählen oder eine native CAD-Fläche beziehungsweise Kante anklicken.');
  return true;
 }
 function current(s,revision=s.revision){if(active!==s||controller.revision()!==revision)throw Object.assign(Error('Modell geändert. Bezug erneut auswählen.'),{code:'STALE_REVISION'});}
 async function save(value){const s=active;if(!s||s.running)return;const revision=s.revision;s.saving=true;setWorking(s,true);try{current(s,revision);const proposal=await controller.previewFeatureReferences(value,{revision});try{current(s,revision);}catch(error){controller.discard(proposal.previewId);throw error;}controller.apply(proposal);s.revision=controller.revision();render();status('Merkmalsbezüge gespeichert. Rückgängig setzt diese Änderung zurück.');}finally{s.saving=false;setWorking(s,false);}}
 async function highlight(value){const reference=validateCadAIReference(value),state=cadAIReferenceState(project(),reference,{stored:true});if(state.status!=='current')throw Object.assign(Error(state.message),{code:state.code});const revision=controller.revision(),resolved=await controller.query('featureReference',{action:'resolve',reference});if(controller.revision()!==revision)throw Object.assign(Error('Modell geändert. Bezug erneut wählen.'),{code:'STALE_REVISION'});if(reference.selector)select([{rootId:reference.target.rootId,path:[]}]);else select([reference.target]);paint(resolved.display);mark(reference.id);if(active)status(reference.name+' im Modell hervorgehoben.');return resolved;}
 async function attach(reference){await onAttach?.(validateCadAIReference(reference));mark(reference.id);close();}
 function candidate(result){const s=active;if(!s)return;stopPicking();let ref=result.reference;if(!s.rebind){const existing=refs().find(r=>r.kind===ref.kind&&sameTarget(r.target,ref.target)&&(r.selector?ref.selector?.signature===r.selector.signature:!ref.selector)&&cadAIReferenceState(project(),r).status==='current');if(existing)ref=existing;}s.candidate={...result,reference:ref};q('[data-ref-candidate]').hidden=false;q('[data-ref-name]').value=ref.name;q('[data-ref-measure]').textContent=ref.kind==='bore'?'Nativer Zylinderdurchmesser: '+ref.selector.surface.diameter.toFixed(4)+' mm':labels[ref.kind]+' · '+ref.target.rootId.slice(0,8);const origins=q('[data-ref-origins]');origins.replaceChildren();
  if(s.pickForChat&&ref.kind==='bore'){
   const [x,y,z]=ref.selector.surface.center;
   const p=document.createElement('p');p.dataset.refBorePosition='';
   p.textContent=text('Bohrungsachse durch','Bore axis through')+' X '+Number(x.toFixed(2))+' · Y '+Number(y.toFixed(2))+' · Z '+Number(z.toFixed(2))+' mm';
   origins.append(p);
  }
  if(ref.kind==='bore'&&!ref.origin){const p=document.createElement('p');p.textContent=result.candidates?.length?'Mehrere oder unklare Quellen. Die zu bearbeitende Bohrungsquelle ausdrücklich auswählen.':'Keine eindeutig editierbare Zylinderquelle. Der Bezug bleibt zum Prüfen nutzbar.';origins.append(p);const choices=document.createElement('select'),empty=document.createElement('option');empty.value='';empty.textContent='Merkmalsquelle bestätigen';choices.append(empty);for(const [i,item]of (result.candidates??[]).entries()){const option=document.createElement('option');option.value=String(i);option.textContent=item.name+' · '+item.target.path.join('/').slice(-12);option.disabled=item.ambiguous;choices.append(option);}choices.onchange=()=>{delete s.candidate.reference.origin;if(choices.value){const item=result.candidates[Number(choices.value)];s.candidate.reference.origin={target:item.target,sourceDigest:item.sourceDigest};}updateChatAttach(s);};origins.append(choices);}
  if(s.pickForChat){
   status(text('Markierte Stelle prüfen und an den Chat anhängen.','Check the highlighted feature and attach it to the chat.'));
  }else status('Bezug prüfen und speichern. Eine Vorschau verändert das Modell noch nicht.');
  paint(result.display);mark(ref.id);
 }
 async function captureSource(target,kind){const s=active;if(!s||s.running)return;const revision=s.revision;setWorking(s,true);try{const result=await controller.query('featureReference',{action:'source',target,kind,...(s.rebind?{id:s.rebind.id,name:s.rebind.name}:{})});current(s,revision);candidate(result);}finally{setWorking(s,false);}}
 function sourceSelection(kind){const selection=getSelection();if(selection.length!==1)throw Error('Genau eine native CAD-Quelle auswählen.');return captureSource(selection[0],kind);}
 async function commitCandidate(andAttach){const s=active;if(!s?.candidate||s.running)return;if(s.pickForChat&&s.candidate.reference.kind==='bore'&&!s.candidate.reference.origin)return;current(s);const reference=validateCadAIReference({...s.candidate.reference,name:q('[data-ref-name]').value.trim()});setWorking(s,true);try{await controller.query('featureReference',{action:'resolve',reference});current(s);}finally{setWorking(s,false);}await save(upsertCadAIReference(project().featureReferences,reference));s.candidate=null;s.rebind=null;q('[data-ref-candidate]').hidden=true;render();if(active!==s)return;if(andAttach)await attach(reference);else mark(reference.id);}
 async function beginPick(kind){
  const s=active;if(!s||s.running)return;
  const fixedRoot=q('[data-ref-root]').value;
  if(kind!=='auto'&&!fixedRoot)throw Error('Ein sichtbares fertiges CAD-Teil wählen.');
  stopPicking();
  if(kind!=='auto')select([{rootId:fixedRoot,path:[]}]);
  s.revision=controller.revision();s.picking=kind;s.candidate=null;
  q('[data-ref-candidate]').hidden=true;q('[data-ref-stop]').hidden=s.pickForChat;panel.classList.add('picking');
  const revision=s.revision,ticket=++generation;
  if(kind==='edge'){
   setWorking(s,true);
   try{
    const catalog=await controller.query('featureReference',{action:'edges',target:{rootId:fixedRoot,path:[]}});
    current(s,revision);if(ticket!==generation)return;
    s.edgeList=catalog.edges;view.setEdges(catalog.edges.flatMap(e=>e.display.curves.map(points=>({points,selected:false,edgeToken:e.selector.signature}))));
   }finally{setWorking(s,false);}
  }
  status(kind==='auto'?text('Eine CAD-Fläche oder die Innenwand einer Bohrung anklicken.','Click a CAD face or the inside wall of a bore.'):kind==='edge'?'Die gewünschte CAD-Kante anklicken.':kind==='bore'?'Eine innere native Zylinderwand anklicken.':'Die gewünschte native CAD-Fläche anklicken.');
  view.setInteraction((ray,event,hit)=>run(async()=>{
   if(active!==s||s.running||ticket!==generation)return;
   const visible=hit?.object?.userData,rootId=kind==='auto'?visible?.rootId:fixedRoot;
   if(kind==='auto'&&(!rootId||visible.simplified||visible.sourceTarget||!view.allows(rootId)))
    throw Error(text('Eine sichtbare Fläche an einem fertigen CAD-Teil anklicken.','Click a visible face of a finished CAD part.'));
   if(visible?.rootId&&visible.rootId!==rootId)throw Error('Eine Stelle am gewählten CAD-Teil anklicken.');
   setWorking(s,true);const abort=new AbortController();s.abort=abort;
   try{
    const base=s.rebind?{id:s.rebind.id,name:s.rebind.name}:{};
    const query=kind==='edge'?{action:'edge',target:{rootId,path:[]},signature:pickCadFeatureEdge(view,event,s.edgeList).selector.signature,...base}:{action:'pick',kind,ids:[rootId],ray,...base};
    const result=await controller.query('featureReference',query,{signal:abort.signal});
    if(active!==s||ticket!==generation)return;
    current(s,revision);candidate(result);
   }finally{
    if(active===s){
     setWorking(s,false);if(s.abort===abort)s.abort=null;
     if(s.pickForChat&&s.candidate){
      const confirm=q('[data-ref-save-attach]');
      (confirm.disabled?q('[data-ref-origins] select')??q('[data-ref-candidate-cancel]'):confirm).focus();
     }
    }
   }
  }));
 }

 function rebind(reference){const s=active;s.rebind=reference;s.candidate=null;q('[data-ref-candidate]').hidden=true;status('„'+reference.name+'“ neu zuordnen: aktuelle Quelle oder Stelle bewusst auswählen.');if(reference.selector){q('[data-ref-root]').value=project().nodes.some(n=>n.id===reference.target.rootId)?reference.target.rootId:'';renderTree();}else{const selection=getSelection();if(selection.length===1)return captureSource(selection[0],reference.kind);}}
 q('[data-ref-close]').onclick=close;q('[data-ref-stop]').onclick=()=>{stopPicking();status('Punktwahl beendet.');};q('[data-ref-source]').onclick=()=>run(()=>sourceSelection('feature'));q('[data-ref-sketch]').onclick=()=>run(()=>sourceSelection('sketch'));q('[data-ref-root]').onchange=()=>{stopPicking();renderTree();};q('[data-ref-tree-use]').onclick=()=>run(()=>{const item=sourceCatalog[Number(q('[data-ref-tree]').value)];if(!item)throw Error('Eine Konstruktionsquelle wählen.');return captureSource(item.target,item.kind);});
 for(const button of panel.querySelectorAll('[data-ref-pick]'))button.onclick=()=>run(()=>beginPick(button.dataset.refPick));q('[data-ref-save]').onclick=()=>run(()=>commitCandidate(false));q('[data-ref-save-attach]').onclick=()=>run(()=>commitCandidate(true));q('[data-ref-candidate-cancel]').onclick=()=>run(()=>{if(active?.pickForChat){clearOverlay();return beginPick('auto');}if(!active)return;active.candidate=null;active.rebind=null;q('[data-ref-candidate]').hidden=true;clearOverlay();});
 panel.addEventListener('pointerdown',e=>e.stopPropagation());panel.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close();}});
 return {open,close,clearHighlight:()=>{clearOverlay();mark(null);},highlight:value=>run(()=>highlight(value)),state:()=>active?{picking:active.picking,running:active.running,revision:active.revision}:null,revisionChanged(){if(active?.saving)return;clearOverlay();if(active){active.abort?.abort();stopPicking();active.revision=controller.revision();active.candidate=null;if(active.pickForChat){close();toast(text('Modell geändert. Stelle erneut anhängen.','Model changed. Reattach the feature.'));return;}q('[data-ref-candidate]').hidden=true;rootOptions();render();status('Modell geändert. Bezüge mit geänderter Geometrie oder Lage müssen neu zugeordnet werden.');}},selectionChanged(){if(active&&!active.picking&&!active.candidate)rootOptions();const selection=getSelection();if(selection.length===1){const ref=refs().find(r=>!r.selector&&sameTarget(r.target,selection[0])&&cadAIReferenceState(project(),r).status==='current');if(ref)mark(ref.id);}},dispose(){close();clearOverlay();panel.remove();}};
}
