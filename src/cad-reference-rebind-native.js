import {cadProjectSnapshot} from './cad-project.js';
import {planCadReferenceRebind} from './cad-reference-rebind-data.js';
import {createCadAIReferencesNative} from './cad-ai-feature-references-native.js';
import {cadAIReferenceState,validateCadAIReference} from './cad-ai-feature-references.js';
import {rebindCadJointReferences} from './cad-joints-data.js';
const key=t=>JSON.stringify([t.rootId,t.path]);
const fail=(message,code='REFERENCE_REBIND_INVALID')=>{throw Object.assign(Error('Bezugsneuzuordnung: '+message),{code});};

export function rebindCadReferencesNative(input,request,{oc,service,signal}={}){
 const check=()=>{if(signal?.aborted)fail('Abgebrochen.','ABORTED');};check();const project=cadProjectSnapshot(input),plan=planCadReferenceRebind(project,request),query=createCadAIReferencesNative({oc,service}),updates=[];
 for(const binding of plan.features){
  check();const old=binding.reference,base={id:old.id,name:old.name},result=old.kind==='edge'?query(project,{action:'edge',target:binding.target,signature:binding.edgeSignature,...base}):old.selector?query(project,{action:'pick',kind:old.kind,ids:[binding.target.rootId],ray:binding.ray,...base}):query(project,{action:'source',target:binding.target,kind:old.kind,...base});
  let reference=result.reference;
  if(binding.originTarget===null)delete reference.origin;
  else if(binding.originTarget!==undefined||old.origin){const target=binding.originTarget??old.origin.target,candidate=result.candidates?.find(c=>!c.ambiguous&&key(c.target)===key(target));if(!candidate)fail('Die bisherige Merkmalsquelle fehlt oder ist mehrdeutig. Eine aktuelle Quelle ausdrücklich bestätigen oder den Quellenbezug ausdrücklich lösen.','REFERENCE_ORIGIN_REASSIGN_REQUIRED');reference.origin={target:candidate.target,sourceDigest:candidate.sourceDigest};}
  reference=validateCadAIReference(reference);query(project,{action:'resolve',reference});updates.push(reference);
 }
 if(plan.joints.length)project.joints=rebindCadJointReferences(project,plan.joints);
 if(updates.length)project.featureReferences={...project.featureReferences,items:project.featureReferences.items.map(r=>updates.find(next=>next.id===r.id)??r)};
 check();const result=cadProjectSnapshot(project);return {project:result,report:{metadataOnly:true,affectedIds:[],constructedIds:[],counts:{},reboundFeatureIds:updates.map(r=>r.id),reboundJointIds:plan.joints.map(j=>j.jointId),references:updates.map(r=>({id:r.id,name:r.name,kind:r.kind,target:r.target,status:cadAIReferenceState(result,r).status})),jointPosesPreserved:true},warnings:[]};
}
