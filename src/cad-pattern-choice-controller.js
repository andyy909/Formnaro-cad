import {cadProjectSnapshot,cadProjectRevision} from './cad-project.js';
import {hasGeometryRefs} from './cad-geometry-ref.js';
import {planCadParameterPatterns} from './cad-linked-pattern-update-data.js';
import {planCadPatternConsumers} from './cad-pattern-consumers-data.js';
import {planCadDrillRebind} from './cad-drill-rebind-plan.js';
import {createFreeCADParameterHost} from './cad-freecad-parameter-host.js';

const fail=(message,code='PATTERN_CHOICE_INVALID')=>{throw Object.assign(Error(message),{code});};
/** Choice drafts never enter the transaction/preview registry. Native final
 * validation must run again before any chosen references become applyable. */
export function createCadPatternChoiceController({worker,read,revision,quality,onBusy=()=>{}}){
 let draft=null,abort=null,sequence=0;
 const current=expected=>{if(revision()!==expected)fail('Modell wurde geändert. Kopienbezüge erneut vorbereiten.','STALE_REVISION');};
 function cancel(){sequence++;abort?.abort();abort=null;draft=null;}
 function get(id){if(!draft||draft.id!==id)fail('Die vorbereitete Bezugswahl ist nicht mehr vorhanden.');current(draft.revision);return draft;}
 async function prepare(operation,{revision:expected=revision(),signal}={}){
  current(expected);if(abort)fail('Eine Bezugswahl wird bereits vorbereitet.','BUSY');draft=null;
  if(!operation||!['linkedPattern','projectParameters'].includes(operation.kind)&&!(operation.kind==='tool'&&operation.name==='previewRebindDrills'))fail('Eine Muster-, Parameter- oder gemeinsame Bohrungsänderung wählen.');
  const project=read(),op=structuredClone(operation);let plan,targets,data,variantId;
  if(op.kind==='tool'){const planned=planCadDrillRebind(project,op.options);plan=planned.consumerPlan;targets=planned.freecadTargets;data=plan.parameterData;variantId=op.options.variantId;}
  else if(op.kind==='linkedPattern'){const previous=project.linkedPatterns?.patterns.find(pattern=>pattern.id===op.pattern?.id);plan=planCadPatternConsumers(project,previous?[previous]:[],{consumerBindings:op.consumerBindings});targets=plan.freecadTargets;data=plan.parameterData;}
  else{const planned=planCadParameterPatterns(project,op.data,{variantId:op.variantId});if(!planned.requiresPatternUpdate)fail('Die Parameteränderung betrifft keine Musterkopien.');plan=planCadPatternConsumers(project,[...new Map([...planned.patterns,...planned.statePatterns].map(pattern=>[pattern.id,pattern])).values()],{data:planned.plan.data,consumerBindings:op.consumerBindings});data=plan.parameterData;variantId=op.variantId;}
  const controller=new AbortController(),ticket=++sequence;abort=controller;const stopped=()=>controller.abort();signal?.addEventListener('abort',stopped,{once:true});if(signal?.aborted)controller.abort();onBusy(true);
  try{
   const result=await worker.run({job:'patternConsumerChoices',project,operation:op},{revision:cadProjectRevision(project),signal:controller.signal,...(data?.version===2?{host:createFreeCADParameterHost(project,data,{variantId,...(targets?{targets}:{})})}:{})});
   current(expected);controller.signal.throwIfAborted();if(ticket!==sequence)fail('Bezugswahl wurde verworfen.','ABORTED');
   const value=cadProjectSnapshot(result.project),blocked=new Set(result.consumerChoices?.blockedRootIds??[]),available=value.nodes.filter(node=>!blocked.has(node.id)&&!hasGeometryRefs(node)).map(node=>node.id),id=crypto.randomUUID();
   const meshes=available.length?await worker.run({job:'display',project:value,ids:available,quality:quality(),colored:true},{revision:cadProjectRevision(value),signal:controller.signal}):[];
   current(expected);controller.signal.throwIfAborted();if(ticket!==sequence)fail('Bezugswahl wurde verworfen.','ABORTED');
   draft={id,revision:expected,project:value,available:new Set(available),consumerChoices:{...result.consumerChoices,availableRootIds:available}};
   return {draftId:id,revision:expected,project:cadProjectSnapshot(value),consumerChoices:structuredClone(draft.consumerChoices),display:{meshes},report:structuredClone(result.report??{}),warnings:structuredClone(result.warnings??[])};
  }finally{signal?.removeEventListener('abort',stopped);if(abort===controller)abort=null;onBusy(false);}
 }
 async function query(id,kind,options={}, {signal}={}){
  const saved=get(id);if(!['featureReference','linkedFaceCandidate'].includes(kind))fail('Diese Abfrage ist für die vorbereitete Bezugswahl nicht freigegeben.');
  let roots;if(kind==='linkedFaceCandidate')roots=[options.source?.rootId];
  else if(options.action==='pick'){if(!Array.isArray(options.ids)||!options.ids.length)fail('Ein fertiges Zielteil ausdrücklich für die Flächenwahl angeben.','PATTERN_CHOICE_BLOCKED');roots=options.ids;}
  else if(['source','edge','edges'].includes(options.action))roots=[options.target?.rootId];
  else if(options.action==='resolve')roots=[options.reference?.target?.rootId,...(options.reference?.origin?[options.reference.origin.target?.rootId]:[])];
  else fail('Unbekannte Abfrage der vorbereiteten Bezugswahl.');
  if(roots.some(root=>typeof root!=='string'||!saved.available.has(root)))fail('Nur bereits fertig aufgebaute, eingeblendete Bezugsquellen wählen.','PATTERN_CHOICE_BLOCKED');
  const result=await worker.run({job:'query',project:saved.project,query:{kind,options}},{revision:cadProjectRevision(saved.project),signal});get(id);return result;
 }
 return {prepare,query,discard:id=>{if(!id||draft?.id===id){cancel();return true;}return false;},cancel,busy:()=>!!abort,dispose:cancel};
}
