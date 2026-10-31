import {validateCadAIReferenceTarget} from './cad-ai-feature-reference-data.js';
const fail=message=>{throw Object.assign(Error('Bezugsneuzuordnung: '+message),{code:'REFERENCE_REBIND_INVALID'});};
const fields=(v,keys)=>{if(!v||Object.getPrototypeOf(v)!==Object.prototype||Object.keys(v).some(k=>!keys.includes(k)))fail('Unbekannte oder ungültige Felder.');};
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=200000);
function ray(value){fields(value,['origin','direction','near','far','tolerance']);if(!vector(value.origin)||!vector(value.direction)||Math.hypot(...value.direction)<1e-10)fail('Einen endlichen freien Flächenstrahl wählen.');for(const k of ['near','far','tolerance'])if(value[k]!==undefined&&(!Number.isFinite(value[k])||value[k]<0))fail('Ungültiger Strahlbereich.');if(value.far!==undefined&&value.far<=(value.near??0))fail('Ungültiger Strahlbereich.');return structuredClone(value);}

/** Explicit, kernel-free request plan shared with selective FNPACK loading.
 * Saved IDs and kinds are authoritative; callers supply new choices, not proof. */
export function planCadReferenceRebind(project,request){
 fields(request,['features','joints']);const features=request.features??[],joints=request.joints??[];
 if(request.features===null||request.joints===null||!Array.isArray(features)||features.length>32||!Array.isArray(joints)||joints.length>256||!features.length&&!joints.length)fail('Eine bis 32 gespeicherte KI-Stellen und/oder bis 256 Gelenke ausdrücklich auswählen.');
 if(new Set(features.map(b=>b?.id)).size!==features.length||new Set(joints.map(b=>b?.jointId)).size!==joints.length)fail('Jeden Bezug höchstens einmal zuordnen.');
 const planned=features.map(binding=>{
  fields(binding,['id','target','ray','edgeSignature','originTarget']);const reference=project.featureReferences?.items.find(r=>r.id===binding.id);if(!reference)fail('Der gespeicherte KI-Bezug fehlt.');
  const target=validateCadAIReferenceTarget(binding.target),spatial=!!reference.selector;
  if(spatial&&target.path.length)fail('Flächen und Kanten am fertigen Teil wählen.');
  const out={id:reference.id,target,reference};
  if(reference.kind==='edge'){if(binding.ray!==undefined||!/^[a-f0-9]{64}$/.test(binding.edgeSignature??''))fail('Eine aktuelle vollständige native Kante wählen.');out.edgeSignature=binding.edgeSignature;}
  else if(spatial){if(binding.edgeSignature!==undefined)fail('Für Flächen einen freien Strahl verwenden.');out.ray=ray(binding.ray);}
  else if(binding.ray!==undefined||binding.edgeSignature!==undefined)fail('Eine vorhandene Konstruktionsquelle wählen.');
  if(binding.originTarget!==undefined){if(!spatial||reference.kind==='edge')fail('Nur Flächen- und Bohrungsbezüge besitzen eine Merkmalsquelle.');out.originTarget=binding.originTarget===null?null:validateCadAIReferenceTarget(binding.originTarget);if(out.originTarget&&out.originTarget.rootId!==target.rootId)fail('Die Merkmalsquelle muss zum gewählten fertigen Teil gehören.');}
  return out;
 });
 for(const binding of joints){fields(binding,['jointId','parentId','childId','origin','axis']);if(!project.joints?.joints.some(j=>j.id===binding.jointId))fail('Die gespeicherte Gelenkverbindung fehlt.');if(!vector(binding.origin)||!vector(binding.axis)||Math.hypot(...binding.axis)<1e-10)fail('Welt-Bezugspunkt und gerichtete Achse ausdrücklich angeben.');for(const k of ['parentId','childId'])if(binding[k]!==undefined&&(typeof binding[k]!=='string'||!binding[k]||binding[k].length>200))fail('Eindeutige vorhandene Teilkennungen wählen.');}
 return {features:planned,joints:structuredClone(joints),geometryRootIds:[...new Set(planned.filter(b=>b.reference.selector).map(b=>b.target.rootId))]};
}
