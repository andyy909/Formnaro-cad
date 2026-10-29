import {cadProjectSnapshot} from './cad-project.js';
import {flags} from './organization.js';
import {cadDependencyAffected,cadDependencyNodeId} from './cad-dependency-graph.js';
import {materializeCadLinkedPattern,stampCadLinkedPattern,cadLinkedPatternProblems} from './cad-linked-pattern-data.js';
import {planCadParameterPatterns} from './cad-linked-pattern-update-data.js';
import {updateCadAssociative} from './cad-linked-contours-native.js';

// A single worker operation owns parameter, contour and pattern changes.
// Unsupported downstream consumers must not see an intermediate result.
export async function updateCadParameterPatterns(project,operation,options){
 const {service,signal}=options,check=()=>{if(signal?.aborted)throw Object.assign(Error('Musteraktualisierung abgebrochen.'),{name:'AbortError',code:'ABORTED'});};check();
 const planned=planCadParameterPatterns(project,operation.data,{variantId:operation.variantId});
 for(const pattern of planned.patterns){
  const affected=cadDependencyAffected(planned.graph,[cadDependencyNodeId('pattern',pattern.id)]);
  if(affected.some(n=>['contour','freecadRun','drawingView'].includes(n.kind)))throw Object.assign(Error('Eine Musterkopie besitzt nachgelagerte Kontur-, FreeCAD- oder Zeichnungsbezüge. Diese gemeinsame Aktualisierung wird noch nicht unterstützt.'),{code:'PATTERN_DEPENDENCIES_UNSUPPORTED',patternId:pattern.id});
  for(const id of [pattern.sourceId,...pattern.instances.filter(i=>!pattern.excluded.includes(i.index)).map(i=>i.id)]){const node=project.nodes.find(n=>n.id===id);if(!node)throw Object.assign(Error('Musterquelle oder Musterkopie fehlt.'),{code:'PATTERN_INSTANCE_CONFLICT',patternId:pattern.id});const f=flags(node,project);function blocked(n){return n.locked||n.hidden||(n.children??[]).some(blocked);}if(f.locked||f.hidden||blocked(node))throw Object.assign(Error('Musterquelle oder Musterkopie ist gesperrt oder ausgeblendet.'),{code:'LOCKED_CAD_OBJECT',patternId:pattern.id});}
 }
 const result=await updateCadAssociative(project,{...operation,kind:'associativeUpdate'},options);check();let draft=result.project;
 for(const previous of planned.patterns){
  const active=draft.linkedPatterns?.patterns.find(p=>p.id===previous.id);if(!active)throw Object.assign(Error('Muster während der Aktualisierung verloren.'),{code:'PATTERN_SOURCE_LOST'});
  const built=materializeCadLinkedPattern(draft,active,{previous});draft=built.project;draft.linkedPatterns={version:1,patterns:draft.linkedPatterns.patterns.map(p=>p.id===previous.id?built.pattern:p)};check();
 }
 if(planned.patterns.length){draft=await service.rebuild(draft,{baseline:project});check();draft.linkedPatterns={version:1,patterns:draft.linkedPatterns.patterns.map(p=>planned.patterns.some(old=>old.id===p.id)?stampCadLinkedPattern(draft,p):p)};for(const p of draft.linkedPatterns.patterns.filter(p=>planned.patterns.some(old=>old.id===p.id))){const problems=cadLinkedPatternProblems(draft,p);if(problems.length)throw Object.assign(Error(problems[0].message),{code:problems[0].code,problems});}}
 const affectedIds=[...new Set([...(result.report.affectedIds??[]),...planned.patterns.flatMap(p=>[p.sourceId,...(draft.linkedPatterns.patterns.find(v=>v.id===p.id)?.instances??[]).map(i=>i.id)])])];
 result.project=cadProjectSnapshot(draft);result.report={...result.report,affectedIds,metadataOnly:planned.patterns.length?false:result.report.metadataOnly,updatedPatternIds:planned.patterns.map(p=>p.id)};result.parameterReport=result.report;return result;
}
