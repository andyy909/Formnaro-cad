// Reference tokens and face indices are ephemeral identifiers of a queried CAD
// topology. In a multi-command proposal an earlier operation can invalidate
// them even when a later native segment starts with a fresh rebuild baseline.
const referenceKeys=new Set(['reference','sourceReference','targetReference','positionReference','stopReference']);
export function hasTransientCadReference(value){
 if(!value||typeof value!=='object')return false;
 if(Array.isArray(value))return value.some(hasTransientCadReference);
 if(value.op==='modeling'&&value.operation&&('faceIndex' in value.operation||'faceIndices' in value.operation))return true;
 for(const [key,child] of Object.entries(value)){
  if(referenceKeys.has(key)&&child&&typeof child==='object'&&('token' in child||'faceIndex' in child))return true;
  if(hasTransientCadReference(child))return true;
 }
 return false;
}
export function rejectStaleCadReferences(command,previousMutation){
 if(previousMutation&&hasTransientCadReference(command))throw Object.assign(Error('CAD-Flächentoken oder Flächenindex kann nach einem vorherigen Befehl veraltet sein. Bitte neue Vorschau mit frischem Bezug oder einem eindeutigen Strahl erstellen.'),{code:'STALE_CAD_REFERENCE'});
}
