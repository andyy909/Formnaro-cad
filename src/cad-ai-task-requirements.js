import {validateAIResultChecks} from './cad-ai-result-checks.js';
import {cadSelectionContext} from './cad-interface-state.js';
import {cadGeometryDigest} from './cad-geometry-digest.js';
import {normalizeGeometryPayloads} from './cad-geometry-ref.js';
const error=(message,code='AI_TASK_REQUIREMENTS_INVALID',retryable=false)=>Object.assign(Error(message),{code,feedback:{retryable}});
export function validateAITaskRequirements(value){
 if(!value||Object.keys(value).sort().join(',')!=='assumptions,checks,objective,protectedTargets,purpose'||!['technical','generative'].includes(value.purpose)||typeof value.objective!=='string'||!value.objective.trim()||value.objective.length>10000||!Array.isArray(value.checks)||!Array.isArray(value.assumptions)||value.assumptions.length>64||value.assumptions.some(s=>typeof s!=='string'||s.length>2000)||!Array.isArray(value.protectedTargets)||value.protectedTargets.length>500)throw error('Ziel, Qualitätsart, Annahmen oder Schutzbereiche des KI-Auftrags sind ungültig.');
 const checks=validateAIResultChecks(value.checks);
 for(const target of value.protectedTargets){if(!target||typeof target!=='object'||Object.keys(target).sort().join(',')!=='path,rootId')throw error('Geschützte Teile mit vollständigem Quellpfad angeben.');validateAIResultChecks([{kind:'solids',target,expected:1}]);}
 return structuredClone({...value,checks});
}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
function signature(project,target){const c=cadSelectionContext(project,target);return cadGeometryDigest(JSON.stringify(canonical(normalizeGeometryPayloads({node:c.node,world:c.world,hidden:c.hidden,locked:c.locked},cadGeometryDigest))));}
export function captureAITaskProtection(project,targets=[]){
 if(targets.length&&!project)throw error('Der vollständige aktuelle Modellstand für den Auftragsschutz fehlt.','AI_TASK_PROTECTION_UNAVAILABLE');
 return targets.map(target=>({target:structuredClone(target),signature:signature(project,target)}));
}
export function verifyAITaskProtection(project,protectedSources){
 for(const saved of protectedSources){let current;try{current=signature(project,saved.target);}catch{}
  if(current!==saved.signature)throw error('Der Entwurf würde ein geschütztes Teil, seine Quelle oder seine Lage ändern: '+saved.target.rootId,'AI_TASK_PROTECTION_VIOLATION',true);
 }
}
