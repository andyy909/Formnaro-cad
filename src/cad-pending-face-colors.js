/** Unresolved colors retain their original native identity and authored value.
 * They must never be attached to a new face merely by its ordinal. */
export function validateCadPendingFaceColors(value){
 const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 if(!Array.isArray(value)||value.length>40000)throw Error('Ungültige offene native Flächenfarben.');
 return value.map(item=>{
  if(!item||Object.getPrototypeOf(item)!==Object.prototype||Object.keys(item).some(k=>!['faceIndex','color','opacity','sourceDigest','faceDigest'].includes(k))||!Number.isSafeInteger(item.faceIndex)||item.faceIndex<1||item.faceIndex>40000||!/^#[a-f0-9]{6}$/i.test(item.color??'')||!Number.isFinite(item.opacity)||item.opacity<.05||item.opacity>1||!hash(item.sourceDigest)||item.faceDigest!==undefined&&!hash(item.faceDigest))throw Error('Ungültiger offener Flächenfarbbezug.');
  return structuredClone(item);
 });
}
