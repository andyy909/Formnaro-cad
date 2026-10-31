import {Matrix4,Vector3} from 'three';
import {cadGeometryDigest} from './cad-geometry-digest.js';
import {normalizeGeometryPayloads} from './cad-geometry-ref.js';
import {cloneCadSources} from './cad-source-clone.js';
import {evaluateCadProjectParameters,cadProjectParameterProblems} from './cad-project-parameters-data.js';
import {patternDrawingReferenceScope} from './cad-linked-pattern-drawing-data.js';
import {patternContourReferenceScope} from './cad-linked-pattern-contour-data.js';
import {cadPatternConsumerReferenceScope} from './cad-pattern-consumers-data.js';

// Data and placement planning only: callers must integrate this with the
// project transaction, validation, persistence and stale-export guards.
export const CAD_LINKED_PATTERN_LIMIT=200;
const fail=message=>{throw Object.assign(Error(message),{code:'INVALID_LINKED_PATTERN'});};
const vector=(v,name)=>{if(!Array.isArray(v)||v.length!==3||v.some(n=>!Number.isFinite(n)||Math.abs(n)>100000))fail(`Ungültiger ${name}.`);return [...v];};
const id=(v,name)=>{if(typeof v!=='string'||!v||v.length>200)fail(`Ungültige ${name}.`);return v;};
const finite=(v,name,lo,hi)=>{if(!Number.isFinite(v)||v<lo||v>hi)fail(`Ungültiger ${name}.`);return v;};

/** Validate the stable identity and parameter portion of a pattern. */
export function validateCadLinkedPattern(value){
 if(!value||typeof value!=='object'||Array.isArray(value))fail('Ungültiges Muster.');
 const fields=['version','id','sourceId','kind','count','step','columns','rowStep','center','radius','startAngle','angle','rotateCopies','mirrorAxis','mirrorOffset','excluded','instances','snapshot','bindings'];
 if(Object.keys(value).some(k=>!fields.includes(k))||value.version!==1)fail('Unbekannte Musterangabe.');
 const result={version:1,id:id(value.id,'Musterkennung'),sourceId:id(value.sourceId,'Quellkennung'),kind:value.kind,count:value.count};
 if(!['line','grid','circle','mirror'].includes(result.kind))fail('Unbekannte Musterart.');
 if(!Number.isSafeInteger(result.count)||result.count<2||result.count>CAD_LINKED_PATTERN_LIMIT||result.kind==='mirror'&&result.count!==2)fail('Muster benötigt 2 bis 200 Positionen.');
 if(result.kind==='line'||result.kind==='grid')result.step=vector(value.step,'Reihenabstand');
 if(result.kind==='grid'){if(!Number.isSafeInteger(value.columns)||value.columns<1||value.columns>result.count)fail('Ungültige Spaltenzahl.');result.columns=value.columns;result.rowStep=vector(value.rowStep,'Zeilenabstand');}
 if(result.kind==='circle'){result.center=vector(value.center,'Kreismittelpunkt');result.radius=finite(value.radius,'Radius',.01,10000);result.startAngle=finite(value.startAngle??0,'Startwinkel',-36000,36000);result.angle=finite(value.angle??360,'Winkelbereich',-360,360);if(Math.abs(result.angle)<.01)fail('Winkelbereich zu klein.');if(typeof value.rotateCopies!=='boolean')fail('Drehoption fehlt.');result.rotateCopies=value.rotateCopies;}
 if(result.kind==='mirror'){if(!['x','y','z'].includes(value.mirrorAxis))fail('Spiegelachse fehlt.');result.mirrorAxis=value.mirrorAxis;result.mirrorOffset=finite(value.mirrorOffset??0,'Spiegelposition',-100000,100000);}
 if(!Array.isArray(value.excluded)||value.excluded.some(i=>!Number.isSafeInteger(i)||i<1||i>=result.count)||new Set(value.excluded).size!==value.excluded.length)fail('Ungültige ausgelassene Positionen.');result.excluded=[...value.excluded].sort((a,b)=>a-b);
 if(!Array.isArray(value.instances))fail('Musterkennungen fehlen.');const seenIndices=new Set(),seenIds=new Set([result.sourceId]);result.instances=value.instances.map(item=>{if(!item||Object.keys(item).some(k=>!['index','id'].includes(k))||!Number.isSafeInteger(item.index)||item.index<1||item.index>=result.count||seenIndices.has(item.index)||seenIds.has(item.id))fail('Doppelte oder ungültige Musterposition.');id(item.id,'Instanzkennung');seenIndices.add(item.index);seenIds.add(item.id);return {index:item.index,id:item.id};}).sort((a,b)=>a.index-b.index);
 if(value.bindings!==undefined){if(!Array.isArray(value.bindings)||value.bindings.length>12)fail('Ungültige Musterparameterbindungen.');const allowed=result.kind==='mirror'?[]:['count',...(result.kind==='line'||result.kind==='grid'?['step.0','step.1','step.2']:[]),...(result.kind==='grid'?['columns','rowStep.0','rowStep.1','rowStep.2']:[]),...(result.kind==='circle'?['radius','startAngle','angle','center.0','center.1','center.2']:[])];const seen=new Set();result.bindings=value.bindings.map(b=>{if(!b||Object.keys(b).some(k=>!['field','parameterId'].includes(k))||!allowed.includes(b.field)||seen.has(b.field))fail('Ungültige oder doppelte Musterparameterbindung.');seen.add(b.field);return {field:b.field,parameterId:id(b.parameterId,'Parameterkennung')};}).sort((a,b)=>a.field.localeCompare(b.field));}
 if(value.snapshot!==undefined){const s=value.snapshot;if(!s||Object.keys(s).some(k=>!['source','definition','instances'].includes(k))||typeof s.source!=='string'||!/^[a-f0-9]{64}$/.test(s.source)||typeof s.definition!=='string'||!/^[a-f0-9]{64}$/.test(s.definition)||!Array.isArray(s.instances)||s.instances.some(v=>!v||Object.keys(v).some(k=>!['id','digest'].includes(k))||typeof v.id!=='string'||typeof v.digest!=='string'||!/^[a-f0-9]{64}$/.test(v.digest))||new Set(s.instances.map(v=>v.id)).size!==s.instances.length)fail('Ungültiger Musterzustand.');result.snapshot=structuredClone(s);}
 return result;
}

export function validateCadLinkedPatterns(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['version','patterns'].includes(k))||value.version!==1||!Array.isArray(value.patterns)||value.patterns.length>500)fail('Ungültige Musterliste.');
 const patterns=value.patterns.map(validateCadLinkedPattern),ids=new Set(),targets=new Set();
 for(const p of patterns){if(p.snapshot){const active=p.instances.filter(v=>!p.excluded.includes(v.index));if(active.length!==p.count-1-p.excluded.length||p.snapshot.instances.length!==active.length||p.snapshot.instances.some(v=>!active.some(i=>i.id===v.id)))fail('Musterzustand besitzt unvollständige Kopien.');}if(ids.has(p.id))fail('Doppelte Musterkennung.');ids.add(p.id);for(const instance of p.instances){if(targets.has(instance.id))fail('Musterkopie mehrfach zugeordnet.');targets.add(instance.id);}}
 for(const p of patterns)if(targets.has(p.sourceId))fail('Musterkopien können nicht als Musterquelle verwendet werden.');
 return {version:1,patterns};
}

function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).filter(key=>key!=='geometryIdentity').sort().map(key=>[key,canonical(value[key])]));return value===0?0:value;}
const digest=value=>cadGeometryDigest(JSON.stringify(canonical(normalizeGeometryPayloads(value,cadGeometryDigest))));
const definitionDigest=pattern=>{const {snapshot,...definition}=pattern;return digest(definition);};
export function resolveCadLinkedPatternParameters(project,value){
 const pattern=validateCadLinkedPattern(value);if(!pattern.bindings?.length)return pattern;
 if(!project.projectParameters)throw Object.assign(Error('Gebundene Projektparameter fehlen.'),{code:'PATTERN_PARAMETER_LOST'});
 const evaluation=evaluateCadProjectParameters(project.projectParameters),sourceProblems=cadProjectParameterProblems(project,project.projectParameters,{ids:[pattern.sourceId]});
 if(sourceProblems.length)throw Object.assign(Error('Projektparameter der Musterquelle zuerst aktualisieren. '+sourceProblems[0].message),{code:'PATTERN_SOURCE_PARAMETERS_PENDING'});
 for(const b of pattern.bindings){if(!Object.hasOwn(evaluation.values,b.parameterId))throw Object.assign(Error('Gebundener Musterparameter fehlt.'),{code:'PATTERN_PARAMETER_LOST'});const [field,axis]=b.field.split('.');if(axis===undefined)pattern[field]=evaluation.values[b.parameterId];else pattern[field][Number(axis)]=evaluation.values[b.parameterId];}
 return validateCadLinkedPattern(pattern);
}
/** Detect a changed source or changed, missing, or independently edited copy. */
export function cadLinkedPatternProblems(project,pattern){
 const p=validateCadLinkedPattern(pattern),source=project.nodes.find(n=>n.id===p.sourceId),problems=[];
 if(!source||source.kind!=='cad')return [{code:'PATTERN_SOURCE_LOST',message:'Die Musterquelle fehlt.',patternId:p.id}];
 try{if(definitionDigest(resolveCadLinkedPatternParameters(project,p))!==definitionDigest(p))problems.push({code:'PATTERN_UPDATE_REQUIRED',message:'Gebundene Projektparameter oder Variante wurden geändert.',patternId:p.id});}catch(error){problems.push({code:error.code??'PATTERN_PARAMETER_LOST',message:error.message,patternId:p.id});}
 if(!p.snapshot||p.snapshot.source!==digest(source)||p.snapshot.definition!==definitionDigest(p))problems.push({code:'PATTERN_UPDATE_REQUIRED',message:'Musterquelle oder Musterangaben wurden geändert.',patternId:p.id});
 for(const position of p.instances){const node=project.nodes.find(n=>n.id===position.id),old=p.snapshot?.instances.find(v=>v.id===position.id);if(p.excluded.includes(position.index)){if(node)problems.push({code:'PATTERN_INSTANCE_CONFLICT',message:'Eine ausgelassene Position ist noch vorhanden.',patternId:p.id,instanceId:position.id});continue;}if(!node||!old||old.digest!==digest(node))problems.push({code:'PATTERN_INSTANCE_CONFLICT',message:'Eine Musterkopie fehlt oder wurde verändert.',patternId:p.id,instanceId:position.id});}
 return problems;
}

export function assertCadLinkedPatternCopyReady(project,rootIds){
 for(const pattern of project.linkedPatterns?.patterns??[]){if(!rootIds.includes(pattern.sourceId)&&!pattern.instances.some(i=>rootIds.includes(i.id)))continue;const problems=cadLinkedPatternProblems(project,pattern);if(problems.length)throw Object.assign(Error('Muster vor dem Kopieren zuerst aktualisieren oder lösen. '+problems[0].message),{code:'PATTERN_UPDATE_REQUIRED',problems});}
}

export function assertCadLinkedPatternExportReady(project,{ids}={}){
 for(const pattern of project.linkedPatterns?.patterns??[]){const relevant=!ids||ids.includes(pattern.sourceId)||pattern.instances.some(item=>ids.includes(item.id));if(!relevant)continue;const problems=cadLinkedPatternProblems(project,pattern);if(problems.length)throw Object.assign(Error('Betroffenes Muster zuerst aktualisieren oder den Bezug lösen. '+problems[0].message),{code:'PATTERN_UPDATE_REQUIRED',problems});}
}

export function stampCadLinkedPattern(project,pattern){
 const p=validateCadLinkedPattern(pattern),source=project.nodes.find(n=>n.id===p.sourceId);if(!source)fail('Musterquelle fehlt.');
 const instances=[];for(const item of p.instances){const node=project.nodes.find(n=>n.id===item.id);if(p.excluded.includes(item.index)){if(node)fail('Ausgelassene Musterposition darf keinen Körper besitzen.');continue;}if(!node)fail('Musterkopie fehlt.');instances.push({id:node.id,digest:digest(node)});}
 return {...p,snapshot:{source:digest(source),definition:definitionDigest(p),instances}};
}

/** Prepare a complete, atomic update on an independent project copy.
 * Externally referenced instances must be detached explicitly before update. */
export function materializeCadLinkedPattern(project,value,{previous,newId=()=>globalThis.crypto.randomUUID(),drawingViews=[],contourIds=[],consumerPlan}={}){
 let p=resolveCadLinkedPatternParameters(project,value),draft=structuredClone(project),source=draft.nodes.find(n=>n.id===p.sourceId);
 if(!source||source.kind!=='cad'||source.locked||source.hidden)fail('Sichtbare, entsperrte CAD-Musterquelle erforderlich.');
 const prior=previous?validateCadLinkedPattern(previous):p;if(prior.id!==p.id||prior.sourceId!==p.sourceId)fail('Musterquelle kann nicht still ersetzt werden.');
 const current=new Map(prior.instances.filter(v=>v.index<p.count).map(v=>[v.index,v.id]));for(const entry of p.instances){if(current.has(entry.index)&&current.get(entry.index)!==entry.id)fail('Musterkennungen dürfen nicht still ersetzt werden.');current.set(entry.index,entry.id);}
 for(let i=1;i<p.count;i++)if(!current.has(i)){const fresh=newId();id(fresh,'Instanzkennung');if(draft.nodes.some(n=>n.id===fresh)||[...current.values()].includes(fresh)||fresh===p.sourceId)fail('Instanzkennung bereits vergeben.');current.set(i,fresh);}
 p=validateCadLinkedPattern({...p,instances:[...current].map(([index,instanceId])=>({index,id:instanceId}))});
 const affected=new Set([...p.instances,...prior.instances].map(v=>v.id));
 const referencedIds=new Set(affected);function collect(n){for(const child of n.children??[]){referencedIds.add(child.id);collect(child);}}for(const node of draft.nodes)if(affected.has(node.id))collect(node);
 function containsRef(v){if(typeof v==='string')return referencedIds.has(v);if(Array.isArray(v))return v.some(containsRef);return v&&typeof v==='object'&&Object.values(v).some(containsRef);}
 const drawingScope=patternDrawingReferenceScope(draft.drawings,drawingViews,affected,new Set(p.instances.filter(item=>!p.excluded.includes(item.index)).map(item=>item.id)));
 const contourScope=patternContourReferenceScope(draft.contourLinks,contourIds,affected,new Set(p.instances.filter(item=>!p.excluded.includes(item.index)).map(item=>item.id)),consumerPlan);
 const consumerScope=cadPatternConsumerReferenceScope(draft,consumerPlan);
 for(const name of ['projectParameters','contourLinks','joints','drawings','featureReferences','workplane'])if(containsRef(name==='drawings'?drawingScope:name==='contourLinks'?contourScope:consumerScope[name]))fail('Musterkopie besitzt einen externen Bezug. Diesen zuerst lösen.');
 for(const node of consumerScope.nodes)if(!affected.has(node.id)&&containsRef(node))fail('Musterkopie besitzt einen Bezug aus einem anderen Teil. Diesen zuerst lösen.');
 function blocked(node){return !!node.locked||!!node.hidden||(node.children??[]).some(blocked);}
 for(const instanceId of affected){const existing=draft.nodes.find(n=>n.id===instanceId),old=prior.snapshot?.instances.find(v=>v.id===instanceId);if(!existing){if(old)fail('Eine bestätigte Musterkopie fehlt. Bezug zuerst ausdrücklich lösen.');continue;}if(blocked(existing))fail('Gesperrte oder verborgene Musterkopie oder Quelle kann nicht aktualisiert werden.');if(!old||old.digest!==digest(existing))fail('Musterkopie wurde verändert. Zuerst Verknüpfung lösen oder erneut auswählen.');}
 const bounds=source.stats?.bounds;if(!bounds?.min||!bounds?.max)fail('Musterquelle benötigt gültige Grenzen.');let center=new Vector3(...bounds.min.map((v,k)=>(v+bounds.max[k])/2)).applyMatrix4(new Matrix4().fromArray(source.transform)).toArray();
 if(p.kind==='circle'){
  const a=p.startAngle*Math.PI/180,target=[p.center[0]+p.radius*Math.cos(a),p.center[1]+p.radius*Math.sin(a),p.center[2]],delta=target.map((v,k)=>v-center[k]);
  if(Math.hypot(...delta)>1e-6){
   if(blocked(source))fail('Gesperrte oder verborgene Musterquelle kann nicht verschoben werden.');
   const sourceIds=new Set([source.id]);function collectSource(n){for(const child of n.children??[]){sourceIds.add(child.id);collectSource(child);}}collectSource(source);
   function mentionsSource(v){if(typeof v==='string')return sourceIds.has(v);if(Array.isArray(v))return v.some(mentionsSource);return v&&typeof v==='object'&&Object.values(v).some(mentionsSource);}
   for(const name of ['projectParameters','contourLinks','joints','drawings','featureReferences','workplane'])if(mentionsSource(draft[name]))fail('Musterquelle besitzt einen externen Bezug und kann nicht automatisch verschoben werden.');
   for(const node of draft.nodes)if(node.id!==source.id&&!affected.has(node.id)&&mentionsSource(node))fail('Musterquelle besitzt einen Bezug aus einem anderen Teil und kann nicht automatisch verschoben werden.');
   if(draft.linkedPatterns?.patterns.some(other=>other.id!==p.id&&other.sourceId===source.id))fail('Musterquelle wird von einem anderen Muster verwendet und kann nicht automatisch verschoben werden.');
   source.transform=new Matrix4().makeTranslation(...delta).multiply(new Matrix4().fromArray(source.transform)).toArray();center=target;
  }
 }
 const placements=cadLinkedPatternPlacements(p,source.transform,center);draft.nodes=draft.nodes.filter(n=>!affected.has(n.id));
 const inserted=[],sourceMappings=[];for(const place of placements){const mapping=new Map(),copy=cloneCadSources(source,{mapping}),originalId=copy.id;copy.id=place.id;mapping.set(source.id,place.id);sourceMappings.push({rootId:place.id,sourceId:source.id,patternId:p.id,index:place.index,retained:prior.instances.some(item=>item.id===place.id),ids:mapping});function fix(n){for(const step of n.finish?.steps??[])for(const ref of step.edges)if(ref.origin.rootId===originalId)ref.origin.rootId=copy.id;for(const child of n.children??[])fix(child);}fix(copy);copy.transform=place.transform;draft.nodes.push(copy);inserted.push(copy);}
 p.snapshot={source:digest(source),definition:definitionDigest(p),instances:inserted.map(node=>({id:node.id,digest:digest(node)}))};
 return {project:draft,pattern:p,sourceMappings};
}

/** Return world-space transforms. Position zero is always the original source. */
export function cadLinkedPatternPlacements(value,sourceTransform,sourceCenter){
 const p=validateCadLinkedPattern(value);if(!Array.isArray(sourceTransform)||sourceTransform.length!==16||sourceTransform.some(n=>!Number.isFinite(n)))fail('Ungültige Quelltransformation.');
 const center=vector(sourceCenter,'Quellmittelpunkt'),source=new Matrix4().fromArray(sourceTransform),results=[];
 for(let i=1;i<p.count;i++){
  if(p.excluded.includes(i))continue;
  let delta;
  if(p.kind==='line'||p.kind==='grid'){
   const col=p.kind==='grid'?i%p.columns:i,row=p.kind==='grid'?Math.floor(i/p.columns):0;
   delta=new Matrix4().makeTranslation(...p.step.map((v,k)=>v*col+(p.rowStep?.[k]??0)*row));
  }else if(p.kind==='circle'){
   // The source is position zero and remains untouched; the stored centre and
   // radius describe the expected first point, checked before constructing.
   const a0=p.startAngle*Math.PI/180,expected=[p.center[0]+p.radius*Math.cos(a0),p.center[1]+p.radius*Math.sin(a0),p.center[2]];
   if(Math.hypot(...expected.map((v,k)=>v-center[k]))>1e-6)fail('Quelle liegt nicht auf der ersten Kreisposition.');
   const a=(p.startAngle+p.angle*i/(Math.abs(p.angle)===360?p.count:p.count-1))*Math.PI/180,target=[p.center[0]+p.radius*Math.cos(a),p.center[1]+p.radius*Math.sin(a),p.center[2]];
   delta=new Matrix4().makeTranslation(...target.map((v,k)=>v-center[k]));
   if(p.rotateCopies)delta.multiply(new Matrix4().makeTranslation(...center)).multiply(new Matrix4().makeRotationZ(a-a0)).multiply(new Matrix4().makeTranslation(...center.map(v=>-v)));
  }else{
   const axis=['x','y','z'].indexOf(p.mirrorAxis),scale=[1,1,1];scale[axis]=-1;const offset=[0,0,0];offset[axis]=2*p.mirrorOffset;delta=new Matrix4().makeTranslation(...offset).multiply(new Matrix4().makeScale(...scale));
  }
  results.push({index:i,id:p.instances.find(item=>item.index===i)?.id??null,transform:delta.multiply(source).toArray()});
 }
 return results;
}
