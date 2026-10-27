import {assertMeshProtectionChange} from './mesh-protection.js';
import {cadProjectSnapshot,cadProjectReadView,cadProjectRevision,validateCadProject,serializeCadProject,createCadWorkspaceSerializer} from './cad-project.js';

function failure(code,message){const error=new Error(message);error.code=code;if(code==='ABORTED')error.name='AbortError';return error;}

// Independent format-5 model store. Only the injected CAD builder can validate
// new geometry. Render buffers never enter the store, its revision or history.
export function createCadTransactions({initial,build,abort=()=>{},now=()=>Date.now(),
  historyLimit=60,previewLimit=10,previewLifetime=15*60*1000}={}){
  if(typeof build!=='function')throw new TypeError('Ein CAD-Körperprüfer ist erforderlich.');
  for(const [key,value] of Object.entries({historyLimit,previewLimit,previewLifetime}))
    if(!Number.isSafeInteger(value)||value<1)throw new TypeError('Ungültige Grenze: '+key);
  let confirmed=cadProjectReadView(validateCadProject(initial)),revision=cadProjectRevision(confirmed),generation=0,sequence=0,active=null;
  const undo=[],redo=[],previews=new Map(),applied=new Map(),instanceId=globalThis.crypto.randomUUID();
  const snapshot=()=>cadProjectSnapshot(confirmed);
  // Only private confirmed object identity owns these caches. Public snapshots
  // remain independent mutable copies; previews never replace the read view.
  let cachedOwner,cachedRead,cachedText,cachedWorkspaceSerializer;
  function confirmedCache(){if(cachedOwner!==confirmed){cachedOwner=confirmed;cachedRead=undefined;cachedText=undefined;cachedWorkspaceSerializer=undefined;}}
  function readSnapshot(){confirmedCache();return cachedRead??=confirmed;}
  function serialize(){confirmedCache();return cachedText??=serializeCadProject(confirmed);}
  function serializeWorkspace(workspace){confirmedCache();cachedWorkspaceSerializer??=createCadWorkspaceSerializer(confirmed);return cachedWorkspaceSerializer(workspace);}
  const checkRevision=expected=>{if(expected!==revision)throw failure('STALE_REVISION','Das CAD-Modell wurde geändert. Vorschau neu berechnen.');};
  function prune(){const cutoff=now()-previewLifetime;for(const [id,p] of previews)if(p.created<cutoff)previews.delete(id);}
  function cancel(){if(!active)return false;const pending=active;active=null;generation++;pending.controller.abort();abort();return true;}
  function state(){prune();return {revision,busy:!!active,undo:undo.length,redo:redo.length,previews:previews.size};}
  async function preview({revision:expected,project,label='',operation,replaceProject=false}={}){
    checkRevision(expected);if(active)throw failure('BUSY','Eine CAD-Berechnung läuft bereits.');
    if(typeof label!=='string'||label.length>200)throw failure('INVALID_LABEL','Ungültige Vorschau-Beschriftung.');
    const draft=validateCadProject(cadProjectSnapshot(project)),baseline=snapshot(),token=++generation,controller=new AbortController();
    assertMeshProtectionChange(baseline,draft,{replaceProject});
    // The injected builder may mutate its draft/context copies in place. Keep
    // the protection contract private, independently of those mutable inputs.
    const protectionBaseline={nodes:baseline.nodes.filter(n=>n.kind==='mesh'&&n.metadata?.meshProtection?.regions.length).map(n=>({id:n.id,kind:n.kind,name:n.name,mesh:structuredClone(n.mesh),metadata:{meshProtection:structuredClone(n.metadata.meshProtection)}}))};
    const protectionDraft={nodes:draft.nodes.filter(n=>n.kind==='mesh').map(n=>({id:n.id,kind:n.kind,metadata:{meshProtection:n.metadata?.meshProtection?structuredClone(n.metadata.meshProtection):undefined}}))};
    // Capture only the explicit reduction/remeshing/smoothing/patch replacement target before handing a mutable plan
    // to a builder. The guard independently checks every protected coordinate.
    const reduceTarget=['mesh-reduce','mesh-remesh','mesh-smooth','mesh-sculpt','mesh-erase-fill'].includes(operation?.type)&&typeof operation.id==='string'?operation.id:operation?.kind==='batch'&&operation.commands?.some(c=>['tool','script'].includes(c?.op))?protectionBaseline.nodes.map(n=>n.id):null;
    // Make Solid and Hollow add one independent copy. Preserve the whole prior
    // project, including layers/folders that indirectly control existing roots.
    // JSON evidence is private even if the builder mutates its context copies.
    const projectGlobals=value=>JSON.stringify(Object.fromEntries(Object.entries(value).filter(([key])=>key!=='nodes')));
    const solidCopy=['mesh-make-solid','mesh-hollow','mesh-lid','mesh-counterpart'].includes(operation?.type)?{sourceId:operation.id,resultId:operation.resultId,nodes:JSON.stringify(baseline.nodes),globals:projectGlobals(baseline),code:operation.type==='mesh-counterpart'?'COUNTERPART_ORIGINAL':operation.type==='mesh-lid'?'LID_ORIGINAL':operation.type==='mesh-hollow'?'HOLLOW_ORIGINAL':'MAKE_SOLID_ORIGINAL'}:null;
    if(solidCopy&&(JSON.stringify(draft.nodes)!==solidCopy.nodes||projectGlobals(draft)!==solidCopy.globals||typeof solidCopy.sourceId!=='string'||typeof solidCopy.resultId!=='string'||!solidCopy.resultId||solidCopy.resultId===solidCopy.sourceId||!baseline.nodes.some(n=>n.id===solidCopy.sourceId&&n.kind==='mesh')||baseline.nodes.some(n=>n.id===solidCopy.resultId)))throw failure(solidCopy.code,'Das Werkzeug benötigt ein unverändertes Originalprojekt und eine neue eindeutige Ergebniskopie.');
    active={token,controller};
    let onAbort;
    try{
      // A command plan is transient input to the same native builder. It never
      // enters the project, revision, preview result or Undo history.
      const plan=operation===undefined?undefined:structuredClone(operation);
      const computation=Promise.resolve().then(()=>build(draft,{baseline,revision:expected,signal:controller.signal,operation:plan,replaceProject}));
      const interruption=new Promise((_,reject)=>{onAbort=()=>reject(failure('ABORTED','CAD-Vorschau abgebrochen.'));controller.signal.addEventListener('abort',onAbort,{once:true});});
      const built=await Promise.race([computation,interruption]);
      if(controller.signal.aborted||active?.token!==token)throw failure('ABORTED','CAD-Vorschau abgebrochen.');
      checkRevision(expected);
      const result=cadProjectReadView(built);
      assertMeshProtectionChange(protectionBaseline,result,{replaceProject,protectionDraft,reduceTarget});
      if(solidCopy&&(projectGlobals(result)!==solidCopy.globals||result.nodes.length!==JSON.parse(solidCopy.nodes).length+1||result.nodes.filter(n=>n.id===solidCopy.resultId&&n.kind==='mesh').length!==1||JSON.stringify(result.nodes.filter(n=>n.id!==solidCopy.resultId))!==solidCopy.nodes))throw failure(solidCopy.code,'Die Berechnung würde das Originalprojekt, seine Organisation oder vorhandene Teile verändern. Nur eine neue Ergebniskopie darf ergänzt werden.');
      // Make copies before publishing anything: a worker or caller must not be
      // able to change a later Apply by retaining a mutable result reference.
      const id='cad-preview-'+instanceId+'-'+(++sequence),record={project:result,revision:expected,created:now(),label};
      prune();while(previews.size>=previewLimit)previews.delete(previews.keys().next().value);
      previews.set(id,record);
      return {previewId:id,revision:expected,resultRevision:cadProjectRevision(result),project:cadProjectSnapshot(result),label};
    }finally{controller.signal.removeEventListener('abort',onAbort);if(active?.token===token)active=null;}
  }
  function publish(next,{recordHistory=true}={}){
    const checked=cadProjectReadView(next),nextRevision=cadProjectRevision(checked);
    if(nextRevision===revision)return false;
    if(recordHistory){undo.push(confirmed);if(undo.length>historyLimit)undo.shift();redo.length=0;}
    confirmed=checked;revision=nextRevision;previews.clear();return true;
  }
  function apply({previewId,revision:expected}={}){
    const previous=applied.get(previewId);
    if(previous){if(previous.requestRevision!==expected||previous.result.revision!==revision)throw failure('STALE_REVISION','Die Übernahme gehört zu einer anderen Revision.');return {...structuredClone(previous.result),changed:false,alreadyApplied:true};}
    checkRevision(expected);if(active)throw failure('BUSY','Die CAD-Berechnung ist noch nicht abgeschlossen.');
    prune();const record=previews.get(previewId);
    if(!record)throw failure('UNKNOWN_PREVIEW','Die CAD-Vorschau fehlt oder ist abgelaufen.');
    if(record.revision!==expected)throw failure('STALE_REVISION','Die CAD-Vorschau gehört zu einem früheren Modellstand.');
    const changed=publish(record.project),result={revision,changed,alreadyApplied:false,project:snapshot()};
    // An unchanged accepted snapshot has still consumed its proposal. Other
    // proposals at this unchanged revision remain available; history stays fixed.
    previews.delete(previewId);
    while(applied.size>=previewLimit)applied.delete(applied.keys().next().value);
    applied.set(previewId,{requestRevision:expected,result:structuredClone(result)});
    return result;
  }
  function restore(from,to){
    if(active)throw failure('BUSY','Vor Undo/Redo die CAD-Berechnung abbrechen.');
    if(!from.length)return {revision,changed:false,project:snapshot()};
    const next=from.at(-1),checked=cadProjectReadView(next),nextRevision=cadProjectRevision(checked);
    // Validate before changing either stack; failures preserve the whole history.
    to.push(confirmed);from.pop();confirmed=checked;revision=nextRevision;previews.clear();
    return {revision,changed:true,project:snapshot()};
  }
  async function load(project,{revision:expected=revision}={}){
    const p=await preview({revision:expected,project,label:'CAD-Projekt öffnen',replaceProject:true});
    return apply({previewId:p.previewId,revision:p.revision});
  }
  return {snapshot,readSnapshot,serialize,serializeWorkspace,projectVersion:()=>confirmed.version,revision:()=>revision,state,preview,apply,load,cancel,
    undo:()=>restore(undo,redo),redo:()=>restore(redo,undo),
    discard:id=>previews.delete(id)};
}
