import {validatePhotoReference} from './cad-photo-data.js';
import {cadBytesDigest} from './cad-geometry-digest.js';
import {validatePhotoSet} from './cad-photo-multiview-data.js';
export const PHOTO_PROJECT_LIMITS=Object.freeze({items:4,imageBytes:5*1024*1024,encodedBytes:8*1024*1024});
const fail=m=>{throw Object.assign(Error('Projektfotos: '+m),{code:'PHOTO_PROJECT_INVALID'});};
const checkedImages=new Map();
export function photoImageBytes(image){
 if(!image||Object.getPrototypeOf(image)!==Object.prototype||Object.keys(image).some(k=>!['mimeType','dataUrl'].includes(k))||!['image/png','image/jpeg','image/webp'].includes(image.mimeType)||typeof image.dataUrl!=='string'||!image.dataUrl.startsWith('data:'+image.mimeType+';base64,'))fail('Nur eingebettete PNG-, JPEG- oder WebP-Bilddaten sind erlaubt.');
 const encoded=image.dataUrl.slice(image.dataUrl.indexOf(',')+1);
 if(encoded.length>Math.ceil(PHOTO_PROJECT_LIMITS.imageBytes/3)*4||!encoded.length||encoded.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))fail('Bild ist leer, zu groß oder ungültig kodiert.');
 const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));if(!bytes.length||bytes.length>PHOTO_PROJECT_LIMITS.imageBytes)fail('Ein Originalbild darf höchstens 5 MiB groß sein.');
 const valid=image.mimeType==='image/png'?bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10':image.mimeType==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 if(!valid)fail('Bildinhalt und Bildformat widersprechen sich.');
 return bytes;
}
function checkImage(image){
 // Only a prior full byte check populates this private, bounded cache.
 const key=image?.dataUrl,hit=checkedImages.get(key);if(hit&&Object.getPrototypeOf(image)===Object.prototype&&hit.mimeType===image.mimeType&&Object.keys(image).sort().join(',')==='dataUrl,mimeType')return hit;
 const bytes=photoImageBytes(image),result={digest:cadBytesDigest(bytes),mimeType:image.mimeType,bytes:bytes.length};
 checkedImages.set(key,result);while(checkedImages.size>4)checkedImages.delete(checkedImages.keys().next().value);return result;
}
export function validateProjectPhotos(value){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).some(k=>!['version','items',...(value.version===2?['reconstructions']:[])].includes(k))||![1,2].includes(value.version)||!Array.isArray(value.items)||value.items.length>PHOTO_PROJECT_LIMITS.items)fail('Unbekannte Version oder mehr als vier Referenzen.');
 const ids=new Set();let total=0;
 const items=value.items.map(item=>{
  if(!item||Object.getPrototypeOf(item)!==Object.prototype||Object.keys(item).sort().join(',')!=='image,reference')fail('Bild und Referenz erforderlich.');
  const reference=validatePhotoReference(item.reference),proof=checkImage(item.image);
  if(proof.digest!==reference.digest||reference.imageId!=='photo-'+proof.digest.slice(0,16)||ids.has(reference.imageId))fail('Originalprüfsumme, Fotokennung oder Eindeutigkeit stimmt nicht.');
  ids.add(reference.imageId);total+=item.image.dataUrl.length;
  if(total>PHOTO_PROJECT_LIMITS.encodedBytes)fail('Die Originalbilder dürfen zusammen höchstens 8 MiB kodierte Bilddaten belegen. Kleinere Originale verwenden; es wird nichts heimlich verkleinert.');
  return {reference,image:{mimeType:item.image.mimeType,dataUrl:item.image.dataUrl}};
 });
 if(value.version===1)return {version:1,items};
 if(!Array.isArray(value.reconstructions)||value.reconstructions.length>8)fail('Höchstens acht technische Ansichtssätze.');
 const reconstructions=value.reconstructions.map(validatePhotoSet);if(new Set(reconstructions.map(p=>p.id)).size!==reconstructions.length)fail('Doppelte Ansichtssatzkennung.');
 return {version:2,items,reconstructions};
}
export function photoAttachment(item){
 const {reference:r,image}=validateProjectPhotos({version:1,items:[item]}).items[0],bytes=checkImage(image).bytes;
 return {...image,name:r.name,imageId:r.imageId,digest:r.digest,width:r.width,height:r.height,bytes,thumbnail:image.dataUrl,photo:r};
}
export function upsertProjectPhoto(photos,attachment){
 const next=validateProjectPhotos(photos??{version:1,items:[]}),item={reference:validatePhotoReference(attachment.photo),image:{mimeType:attachment.mimeType,dataUrl:attachment.dataUrl}},i=next.items.findIndex(p=>p.reference.imageId===item.reference.imageId);
 if(i<0)next.items.push(item);else next.items[i]=item;return validateProjectPhotos(next);
}
export function upsertPhotoSet(photos,value){const next=validateProjectPhotos(photos??{version:1,items:[]}),plan=validatePhotoSet(value);next.version=2;next.reconstructions??=[];const i=next.reconstructions.findIndex(p=>p.id===plan.id);if(i<0)next.reconstructions.push(plan);else next.reconstructions[i]=plan;return validateProjectPhotos(next);}
export function removeProjectPhoto(photos,imageId){const next=validateProjectPhotos(photos);next.items=next.items.filter(p=>p.reference.imageId!==imageId);return next.items.length||next.reconstructions?.length?next:null;}
export function removePhotoSet(photos,id){const next=validateProjectPhotos(photos);if(next.reconstructions){next.reconstructions=next.reconstructions.filter(p=>p.id!==id);if(!next.reconstructions.length){delete next.reconstructions;next.version=1;}}return next.items.length||next.reconstructions?.length?next:null;}
