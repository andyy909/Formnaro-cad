import {validateCadJoints,remapCadJoints,mergeCadJoints} from './cad-joints-data.js';
import {cadLinkedPatternProblems,stampCadLinkedPattern,validateCadLinkedPatterns} from './cad-linked-pattern-data.js';
import {materializedFnpackProject} from './cad-fnpack-data.js';
import {captureCadProjectParameterClipboard} from './cad-project-parameters-clipboard.js';
import {captureCadContourSourceClosure,remapCadContourLinks,validateCadContourLinks} from './cad-linked-contours-data.js';
import {selectCadDrawings,remapCadDrawings,cadDrawingId} from './cad-drawing-data.js';
import {selectCadProjectParameters,mergeCadProjectParameters,stampCadProjectParameters,refreshCadProjectParameterCorrespondence} from './cad-project-parameters-data.js';
import {cadProjectSnapshot,parseCadProject,serializeCadProject,cadProjectRevision} from './cad-project.js';
import {validateCadTemplateData,cadTemplateVariables} from './cad-template-data.js';
import {createCadRecovery,CAD_AUTOSAVE_KEY} from './cad-recovery.js';

export {CAD_AUTOSAVE_KEY,CAD_LEGACY_AUTOSAVE_KEY} from './cad-recovery.js';
export const MIXED_LIBRARY_KEY='offlinecad-library-common-v8';
export const CAD_LIBRARY_KEY='offlinecad-library-cad-v7';
export const CAD_LEGACY_LIBRARY_KEY='offlinecad-library-cad-v5';
const LIBRARY_FORMAT='FormnaroCADLibrary',MAX_LIBRARY_BYTES=50*1024*1024;
const failure=(code,message)=>{const e=Error(message);e.code=code;return e;};
function text(value,max,name){if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(`Ungültiger ${name}.`);return value;}
function library(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['format','version','items'].includes(k))||value.format!==LIBRARY_FORMAT||![5,7,8,9,10,11,12,13,14,15,16,18,19,20,21,22,23,24,25,26,27,28,29,30].includes(value.version)||!Array.isArray(value.items)||value.items.length>500)throw Error('Nur Teilebibliotheken Version 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29 und 30 sind kompatibel.');
  const ids=new Set();return {format:LIBRARY_FORMAT,version:value.version>=8?value.version:7,items:value.items.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(k=>!['id','name','project','controls','bindings','favorite'].includes(k)))throw Error('Ungültige CAD-Vorlage.');const id=text(item.id,200,'Vorlagenkennung'),name=text(item.name,200,'Vorlagenname');if(ids.has(id))throw Error('Doppelte CAD-Vorlagenkennung.');ids.add(id);
    let project=parseCadProject(item.project);if(project.version>=30&&value.version<30)throw Error('Reparierbare Konstruktionsquellen benötigen Bibliotheksversion 30.');if(project.version>=29&&value.version<29)throw Error('STEP-Bohrungen benötigen Bibliotheksversion 29.');if(project.version>=28&&value.version<28)throw Error('Zylinderbohrungen benötigen Bibliotheksversion 28.');if(project.version>=27&&value.version<27)throw Error('Verknüpfte Merkmale benötigen Bibliotheksversion 27.');if(project.version>=26&&value.version<26)throw Error("Zahnradkopplungen benötigen Bibliotheksversion 26.");if(project.version>=25&&value.version<25)throw Error('Teileigenschaften benötigen Bibliotheksversion 25.');if(project.version>=24&&value.version<24)throw Error('Bézier-/B-Spline-Kurven und erweiterte Pfade benötigen Bibliotheksversion 24.');if(project.version>=23&&value.version<23)throw Error('FreeCAD-Parameterbindungen benötigen Bibliotheksversion 23.');if(project.version>=17)project=materializedFnpackProject(project);if(project.version>=22&&value.version<22)throw Error('Bearbeitete FreeCAD-Dokumente benötigen Bibliotheksversion 22.');if(project.version>=21&&value.version<21)throw Error('Merkmalsbezüge benötigen Bibliotheksversion 21.');if(project.version>=20&&value.version<20)throw Error('Technische Fotoansichtssätze benötigen Bibliotheksversion 20.');if(project.version>=19&&value.version<19)throw Error('Projektfotos benötigen Bibliotheksversion 19.');if(project.version>=18&&value.version<18)throw Error('Abstandsmaße benötigen Bibliotheksversion 18.');if(project.version>=16&&value.version<16)throw Error('Gelenke benötigen Bibliotheksversion 16.');if(project.version>=15&&value.version<15)throw Error('Dauerhafte Skizzenbedingungen benötigen Bibliotheksversion 15.');if(project.version>=14&&value.version<14)throw Error('Verknüpfte Konturen und stabile Zeichnungsbezüge benötigen Bibliotheksversion 14.');if(project.version>=12&&value.version<12)throw Error('Zeichnungsblätter benötigen Bibliotheksversion 12.');if(project.version>=11&&value.version<11)throw Error('Neue CAD-Bearbeitungen benötigen Bibliotheksversion 11.');if(project.version>=10&&value.version<10)throw Error('Erweiterte Skizzen und Netzrezepte benötigen Bibliotheksversion 10.');if(project.version>=9&&value.version<9)throw Error('Parametrische Vorlagen benötigen Bibliotheksversion 9.');if(value.version<8&&(project.version>=8||project.nodes.some(n=>n.kind!=='cad')))throw Error('Gemischte Vorlagen benötigen Bibliotheksversion 8.');if(value.version===5&&project.version!==5)throw Error('Alte CAD-Bibliothek muss Format-5-Projekte enthalten.');if(!project.nodes.length)throw Error('Vorlagen benötigen mindestens ein Teil.');
    if(project.version>=13&&value.version<13)throw Error('Projektparameter und Konstruktionsgenauigkeit benötigen Bibliotheksversion 13.');
    const data=validateCadTemplateData(project,item);if(data.bindings.some(b=>project.projectParameters?.bindings.some(p=>p.target.rootId===project.nodes[b.index].id&&JSON.stringify(p.target.path)===JSON.stringify(b.path)&&p.field===b.field)))throw Error('Ein Maß darf nicht zugleich an einen Vorlagenregler und einen Projektparameter gebunden sein. Den freien Projektparameter verwenden.');if(item.favorite!==undefined&&typeof item.favorite!=='boolean')throw Error('Ungültiger Vorlagenfavorit.');return {id,name,project,...(item.controls!==undefined?{controls:data.controls}:{}),...(item.bindings!==undefined?{bindings:data.bindings}:{}),...(item.favorite!==undefined?{favorite:item.favorite}:{})};
  })};
}
function renumber(nodes,makeId,layerId,folderId,onIds=()=>{}){
  const copies=structuredClone(nodes),ids=new Map();
  function visit(node){const id=makeId();text(id,200,'Objektkennung');if([...ids.values()].includes(id))throw Error('Neue CAD-Objektkennungen müssen eindeutig sein.');ids.set(node.id,id);for(const child of node.children||[])visit(child);}copies.forEach(visit);const annotationIds=new Set(ids.values());
  function reference(ref){ref.origin.rootId=ids.get(ref.origin.rootId)??ref.origin.rootId;ref.origin.path=ref.origin.path.map(id=>ids.get(id)??id);}
  function replace(node){node.id=ids.get(node.id);if(node.drill){if(!ids.has(node.drill.sourceId)||!ids.has(node.drill.boxId))throw Error('Die vollständige Bohrungsquelle muss in der Vorlage enthalten sein.');node.drill.sourceId=ids.get(node.drill.sourceId);node.drill.boxId=ids.get(node.drill.boxId);}for(const annotation of node.annotations??[]){const id=makeId();text(id,200,'Markierungskennung');if(annotationIds.has(id))throw Error('Neue CAD-Markierungskennungen müssen eindeutig sein.');annotationIds.add(id);annotation.id=id;}node.layerId=layerId;node.folderId=folderId;for(const step of node.finish?.steps||[])for(const ref of step.edges)reference(ref);for(const child of node.children||[])replace(child);}copies.forEach(replace);onIds(ids);return copies;
}

export function cadTemplateSelection(confirmed,ids){
  if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!confirmed.nodes.some(node=>node.id===id)))throw Error('Eindeutige CAD-Teilauswahl für die Vorlage erforderlich.');
  const {migrationSource,workspace,drawings,projectParameters,contourLinks,joints,photos,featureReferences,linkedPatterns,...selectedProject}=confirmed,captured=contourLinks?.links.length?captureCadContourSourceClosure(confirmed,ids):undefined,nodes=captured?.nodes??confirmed.nodes.filter(node=>ids.includes(node.id)),selectedDrawings=drawings?selectCadDrawings(drawings,nodes.map(node=>node.id)):undefined;
  const selectedIds=new Set(nodes.map(n=>n.id)),patterns=(linkedPatterns?.patterns??[]).filter(p=>selectedIds.has(p.sourceId)||p.instances.some(i=>selectedIds.has(i.id)));
  for(const pattern of patterns){
    const problems=cadLinkedPatternProblems(confirmed,pattern);if(problems.length)throw failure('PATTERN_UPDATE_REQUIRED','Muster vor dem Speichern aktualisieren oder lösen. '+problems[0].message);
    if(!selectedIds.has(pattern.sourceId)||pattern.instances.some(i=>!pattern.excluded.includes(i.index)&&!selectedIds.has(i.id)))throw failure('PATTERN_SELECTION_INCOMPLETE','Für eine Bibliotheksvorlage die Musterquelle und alle aktiven Musterkopien auswählen.');
  }
  // Feature references contain geometry/frame evidence and cannot be copied by
  // merely changing their IDs. Never silently discard one belonging to a
  // pattern that is meant to remain editable in a library template.
  const patternRoots=new Set(patterns.flatMap(p=>[p.sourceId,...p.instances.filter(i=>!p.excluded.includes(i.index)).map(i=>i.id)]));
  if((featureReferences?.items??[]).some(ref=>[ref.target,ref.origin?.target].some(target=>target&&(patternRoots.has(target.rootId)||target.path.some(id=>patternRoots.has(id))))))throw failure('PATTERN_FEATURE_REFERENCE_UNSUPPORTED','Das Muster besitzt gespeicherte Merkmalsbezüge. Die Bibliothek kann diese noch nicht übernehmen; Bezüge zuerst ausdrücklich entfernen oder das Muster ohne Bibliotheksvorlage verwenden.');
  const parameterIds=patterns.flatMap(p=>(p.bindings??[]).map(b=>b.parameterId));
  let selectedParameters=projectParameters?(captured?captureCadProjectParameterClipboard(confirmed,captured.targets,{parameterIds}):selectCadProjectParameters(projectParameters,nodes.map(n=>n.id),{parameterIds})):undefined;
  const candidate={...selectedProject,...(selectedDrawings?.sheets.length?{drawings:selectedDrawings}:{}),...(captured?.contourLinks.links.length?{contourLinks:captured.contourLinks}:{}),...(patterns.length?{linkedPatterns:{version:1,patterns}}:{}),version:5,nodes,workplane:{...confirmed.workplane,reference:null}};
  if(joints){const selected=remapCadJoints(joints,new Map(nodes.map(n=>[n.id,n.id])));if(selected.joints.length)candidate.joints=selected;}
  if(selectedParameters&&(selectedParameters.parameters.length||selectedParameters.bindings.length||selectedParameters.variants.some(variant=>variant.states.length))){if(captured)selectedParameters=refreshCadProjectParameterCorrespondence(candidate,selectedParameters,{bindingIds:selectedParameters.bindings.map(binding=>binding.id)});candidate.projectParameters=selectedParameters;}
  for(const pattern of patterns){const problems=cadLinkedPatternProblems(candidate,pattern);if(problems.length)throw failure('PATTERN_SELECTION_INVALID','Muster kann mit dieser Quellauswahl nicht sicher gespeichert werden. '+problems[0].message);}
  return cadProjectSnapshot(candidate);
}

// Version-specific keys are deliberate: these methods never read old projects,
// old autosaves or the mesh template library, and never delete those files.
export function createCadPersistence({storage,transactions,verify,instantiate,makeId=()=>crypto.randomUUID()}={}){
  if(typeof storage?.getItem!=='function'||typeof storage?.setItem!=='function'||typeof transactions?.snapshot!=='function'||typeof transactions?.preview!=='function'||typeof verify!=='function')throw TypeError('CAD-Speicher, Transaktionen und nativer Prüfer erforderlich.');
  const recovery=createCadRecovery(storage);
  function readLibrary(){const mixed=storage.getItem(MIXED_LIBRARY_KEY),current=storage.getItem(CAD_LIBRARY_KEY),legacy=mixed===null&&current===null,encoded=mixed!==null?mixed:legacy?storage.getItem(CAD_LEGACY_LIBRARY_KEY):current;if(encoded===null)return {format:LIBRARY_FORMAT,version:7,items:[]};if(new TextEncoder().encode(encoded).length>MAX_LIBRARY_BYTES)throw Error('CAD-Teilebibliothek ist zu groß.');const value=JSON.parse(encoded);if(legacy&&value.version!==5)throw Error('Alte CAD-Bibliothek muss Version 5 verwenden.');return library(value);}
  const libraryStamp=()=>JSON.stringify([storage.getItem(MIXED_LIBRARY_KEY),storage.getItem(CAD_LIBRARY_KEY)]);
  function writeLibrary(value){const newest=Math.max(value.version,...value.items.map(v=>v.project.version));const common=storage.getItem(MIXED_LIBRARY_KEY)!==null||value.version>=8||value.items.some(v=>v.project.version>=8||v.project.nodes.some(n=>n.kind!=='cad'));const checked=library({...value,version:common?Math.max(8,newest):newest}),encoded=JSON.stringify(checked);if(new TextEncoder().encode(encoded).length>MAX_LIBRARY_BYTES)throw Error('CAD-Teilebibliothek ist zu groß.');storage.setItem(common?MIXED_LIBRARY_KEY:CAD_LIBRARY_KEY,encoded);return structuredClone(checked);}
  async function prepareLegacyLibrary(){
    if(storage.getItem(MIXED_LIBRARY_KEY)!==null||storage.getItem(CAD_LIBRARY_KEY)!==null||storage.getItem(CAD_LEGACY_LIBRARY_KEY)===null)return;
    const before=storage.getItem(CAD_LEGACY_LIBRARY_KEY),current=readLibrary();
    for(const entry of current.items){entry.project=cadProjectSnapshot(await verify(entry.project));if(entry.bindings?.length)await generate(entry,{});}
    if(storage.getItem(CAD_LIBRARY_KEY)!==null||storage.getItem(CAD_LEGACY_LIBRARY_KEY)!==before)throw failure('STALE_LIBRARY','Die CAD-Teilebibliothek wurde während der Prüfung geändert.');
    writeLibrary(current);
  }
  function autosave(){
    let revision,encoded;
    if(typeof transactions.serialize==='function'&&typeof transactions.revision==='function'){revision=transactions.revision();encoded=transactions.serialize();}
    else{const project=transactions.snapshot();revision=cadProjectRevision(project);encoded=serializeCadProject(project);}
    recovery.write(encoded,{version:transactions.projectVersion?.()});return {revision};
  }
  async function readAutosave(){return recovery.load(verify);}
  function saveTemplate({id=makeId(),name,ids}={}){
    if(storage.getItem(MIXED_LIBRARY_KEY)===null&&storage.getItem(CAD_LIBRARY_KEY)===null&&storage.getItem(CAD_LEGACY_LIBRARY_KEY)!==null)return prepareLegacyLibrary().then(()=>saveTemplate({id,name,ids}));
    text(id,200,'Vorlagenkennung');text(name,200,'Vorlagenname');const confirmed=transactions.snapshot();
    // A selected CAD template owns only selected native sources. Never attach
    // the complete archived legacy mesh project to an unrelated template.
    const project=cadTemplateSelection(confirmed,ids),current=readLibrary(),entry={id,name,project},index=current.items.findIndex(item=>item.id===id);if(index<0)current.items.push(entry);else current.items[index]=entry;
    return writeLibrary(current).items.find(item=>item.id===id);
  }
  function removeTemplate(id){if(storage.getItem(MIXED_LIBRARY_KEY)===null&&storage.getItem(CAD_LIBRARY_KEY)===null&&storage.getItem(CAD_LEGACY_LIBRARY_KEY)!==null)return prepareLegacyLibrary().then(()=>removeTemplate(id));const current=readLibrary();if(!current.items.some(item=>item.id===id))throw Error('CAD-Vorlage fehlt.');current.items=current.items.filter(item=>item.id!==id);return writeLibrary(current);}
  async function generate(entry,values){
    cadTemplateVariables(entry.controls||[],values||{});
    if(!entry.bindings?.length)return cadProjectSnapshot(await verify(entry.project));
    if(typeof instantiate!=='function')throw Error('CAD-Vorlagenformeln benötigen die native Parameterprüfung.');
    return cadProjectSnapshot(await instantiate(entry.project,{controls:entry.controls||[],bindings:entry.bindings,values:values||{}}));
  }
  async function updateTemplate(value){
    await prepareLegacyLibrary();
    const project=parseCadProject(value.project),entry=library({format:LIBRARY_FORMAT,version:project.version>=9?project.version:project.version>=8||project.nodes.some(n=>n.kind!=='cad')?8:7,items:[{...value,project}]}).items[0],before=libraryStamp();await generate(entry,{});
    if(libraryStamp()!==before)throw failure('STALE_LIBRARY','Die CAD-Teilebibliothek wurde während der Prüfung geändert.');const current=readLibrary(),index=current.items.findIndex(item=>item.id===entry.id);if(index<0)current.items.push(entry);else current.items[index]=entry;return writeLibrary(current).items.find(item=>item.id===entry.id);
  }
  async function previewTemplate({id,revision,values}={}){
    if(revision!==transactions.revision())throw failure('STALE_REVISION','Das CAD-Modell wurde geändert.');const entry=readLibrary().items.find(item=>item.id===id);if(!entry)throw Error('CAD-Vorlage fehlt.');
    const verified=await generate(entry,values);for(const pattern of verified.linkedPatterns?.patterns??[]){const problems=cadLinkedPatternProblems(verified,pattern);if(problems.length)throw failure('PATTERN_UPDATE_REQUIRED','Bibliotheksmuster zuerst aktualisieren oder lösen. '+problems[0].message);}if(revision!==transactions.revision())throw failure('STALE_REVISION','Das CAD-Modell wurde während des Vorlagenlesens geändert.');
    const draft=transactions.snapshot();let nodeIds;const nodes=renumber(verified.nodes,makeId,draft.activeLayerId,draft.activeFolderId,ids=>nodeIds=ids);draft.nodes.push(...nodes);
    if(verified.joints){const mapped=remapCadJoints(verified.joints,nodeIds);draft.joints=mergeCadJoints(draft.joints,mapped);}
    if(verified.drawings){const idMap=new Map(nodeIds);for(const sheet of verified.drawings.sheets){idMap.set(sheet.id,cadDrawingId('sheet'));for(const view of sheet.views)idMap.set(view.id,cadDrawingId('view'));for(const annotation of sheet.annotations)idMap.set(annotation.id,cadDrawingId('annotation'));}const mapped=remapCadDrawings(verified.drawings,idMap);draft.drawings={version:1,sheets:[...(draft.drawings?.sheets??[]),...mapped.sheets]};}
    let parameterMap=new Map();if(verified.projectParameters){const prior=draft.projectParameters,merge=mergeCadProjectParameters(prior,verified.projectParameters,{nodeIds}),merged=merge.data;parameterMap=merge.mapping.parameterIds;draft.projectParameters=merged;try{draft.projectParameters=stampCadProjectParameters(draft,merged);}catch(error){if(!['PARAMETER_RESULT_MISMATCH','LOST_PARAMETER_TARGET','LOST_PARAMETER_FIELD','PARAMETER_TARGET_NOT_LITERAL','FREECAD_PARAMETER_REBUILD_REQUIRED','FREECAD_PARAMETER_INPUT_LOST','FREECAD_PARAMETER_INPUTS_REQUIRED'].includes(error.code))throw error;if(prior?.applied)draft.projectParameters.applied=structuredClone(prior.applied);}}
    if(verified.contourLinks){const mapped=remapCadContourLinks(verified.contourLinks,nodeIds,{previousProject:verified,project:draft}).data;draft.contourLinks=validateCadContourLinks({version:1,links:[...(draft.contourLinks?.links??[]),...mapped.links]});}
    const added=[];
    if(verified.linkedPatterns?.patterns.length){
      const reserved=new Set();const collect=n=>{reserved.add(n.id);for(const child of n.children??[])collect(child);};draft.nodes.forEach(collect);for(const p of draft.linkedPatterns?.patterns??[])for(const i of p.instances)reserved.add(i.id);
      const patternIds=new Set((draft.linkedPatterns?.patterns??[]).map(p=>p.id));
      for(const original of verified.linkedPatterns.patterns){
        if(!nodeIds.has(original.sourceId))throw failure('PATTERN_SELECTION_INCOMPLETE','Musterquelle fehlt in der Vorlage.');
        let patternId;do{patternId=crypto.randomUUID();}while(patternIds.has(patternId));patternIds.add(patternId);
        const instances=original.instances.map(i=>{let mapped=nodeIds.get(i.id);if(!mapped){if(!original.excluded.includes(i.index))throw failure('PATTERN_SELECTION_INCOMPLETE','Musterkopie fehlt in der Vorlage.');mapped=makeId();text(mapped,200,'Instanzkennung');if(reserved.has(mapped))throw Error('Neue Musterkennung ist bereits vergeben.');reserved.add(mapped);}return {...i,id:mapped};});
        const bindings=original.bindings?.map(b=>{const parameterId=parameterMap.get(b.parameterId);if(!parameterId)throw failure('PATTERN_PARAMETER_LOST','Musterparameter fehlt in der Vorlage.');return {...b,parameterId};});
        const pattern={...original,id:patternId,sourceId:nodeIds.get(original.sourceId),instances,...(bindings?{bindings}:{})};delete pattern.snapshot;
        const stamped=stampCadLinkedPattern(draft,pattern),problems=cadLinkedPatternProblems(draft,stamped);if(problems.length)throw failure('PATTERN_UPDATE_REQUIRED','Musterparameter oder Vorlage müssen zuerst aktualisiert werden. '+problems[0].message);added.push(stamped);
      }
      draft.linkedPatterns=validateCadLinkedPatterns({version:1,patterns:[...(draft.linkedPatterns?.patterns??[]),...added]});
    }
    const proposal=await transactions.preview({revision,project:draft,label:'CAD-Vorlage einsetzen'});
    for(const pattern of added){const built=proposal.project.linkedPatterns.patterns.find(p=>p.id===pattern.id),problems=cadLinkedPatternProblems(proposal.project,built);if(problems.length){transactions.discard?.(proposal.previewId);throw failure('PATTERN_UPDATE_REQUIRED','Das eingesetzte Muster hat sich bei der Berechnung verändert. '+problems[0].message);}}
    return proposal;
  }
  async function importLibrary(encoded){
    if(typeof encoded!=='string'||new TextEncoder().encode(encoded).length>MAX_LIBRARY_BYTES)throw Error('CAD-Teilebibliothek ist zu groß.');const candidate=library(JSON.parse(encoded)),before=libraryStamp();
    for(const entry of candidate.items){entry.project=cadProjectSnapshot(await verify(entry.project));if(entry.bindings?.length)await generate(entry,{});}
    if(libraryStamp()!==before)throw failure('STALE_LIBRARY','Die CAD-Teilebibliothek wurde während der Prüfung geändert.');return writeLibrary(candidate);
  }
  return {autosave,readAutosave,listTemplates:()=>structuredClone(readLibrary().items),saveTemplate,updateTemplate,removeTemplate,previewTemplate,importLibrary,exportLibrary:()=>JSON.stringify(readLibrary())};
}
