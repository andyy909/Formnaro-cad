import {cadProjectSnapshot} from './cad-project.js';
import {hasGeometryRefs} from './cad-geometry-ref.js';
import {cadGeometryDigest} from './cad-geometry-digest.js';
const invalid=message=>{throw Object.assign(Error(message),{code:'AI_TASK_CANDIDATE_INVALID',feedback:{retryable:false}});};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
// A fresh native rebuild may refresh cached statistics. Every BRep byte,
// source recipe, triangle, placement and persisted non-statistical field must
// still match the archived candidate. This never authorizes a public report.
export function taskCandidateModelKey(value){
 const project=cadProjectSnapshot(value),node=n=>Object.fromEntries(Object.entries(n).filter(([key])=>!(n.kind==='cad'&&key==='stats')).map(([key,v])=>[key,key==='children'?v.map(node):v]));
 return cadGeometryDigest(JSON.stringify(canonical({...project,nodes:project.nodes.map(node)})));
}
export function validateTaskCandidate(value,aliases={}){
 const project=cadProjectSnapshot(value);
 if(hasGeometryRefs(project))invalid('Gespeicherte Vorschau benötigt vollständige Geometriedaten aus dem Projektpaket.');
 if(!aliases||Object.getPrototypeOf(aliases)!==Object.prototype||Object.keys(aliases).length>500)invalid('Gespeicherte Ergebnisbezüge sind ungültig.');
 const ids=new Set();function visit(node){ids.add(node.id);for(const child of node.children??[])visit(child);}project.nodes.forEach(visit);
 for(const [name,id]of Object.entries(aliases))if(!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name)||typeof id!=='string'||!ids.has(id))invalid('Ein gespeicherter Ergebnisbezug hat keine vorhandene Quelle.');
 return {project,aliases:structuredClone(aliases)};
}
