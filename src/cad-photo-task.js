import {validateAIAnalysis} from './cad-ai-analysis.js';
import limits from '../backend/ai-input-limits.json' with {type:'json'};
import {photoEvidence,measurePhoto,PHOTO_CONTRACT} from './cad-photo-data.js';
import {loadPhotoImage,photoGrid,comparePhotoProjection,preparePerspectiveComparison} from './cad-photo-images.js';
const fail=m=>{throw Object.assign(Error('Foto-Assistent: '+m),{code:'PHOTO_INVALID'});};
export function addPhotoImages(input,extra){
 const base=input.images??[],all=[...base,...(input.history??[]).flatMap(t=>t.images??[])],size=i=>(i.dataUrl.length-i.dataUrl.indexOf(',')-1)*.75;
 const accepted=[],omitted=[];let bytes=all.reduce((n,i)=>n+size(i),0);for(const i of extra){const n=size(i);if(n>limits.maxImageBytes||all.length+accepted.length>=limits.maxImages||bytes+n>limits.maxTotalImageBytes){omitted.push(i.name);continue;}accepted.push(i);bytes+=n;}
 return {images:[...base,...accepted],omitted};
}
export async function createPhotoTask(input,checkpoint){
 if(!input.photoReferences?.length){if(checkpoint)fail('Gespeicherte Fotodaten gehören nicht zu diesem Auftrag.');return null;}
 if(checkpoint){if(checkpoint.version!==1||Object.keys(checkpoint).sort().join(',')!=='grids,version'||!Array.isArray(checkpoint.grids)||checkpoint.grids.length>8)fail('Gespeicherte Fotoausschnitte sind ungültig.');if(checkpoint.grids.length){validateAIAnalysis(checkpoint.grids);if(checkpoint.grids.some(q=>q.engine!=='photo'||q.kind!=='grid'))fail('Nur lokale Fotoausschnitte wiederherstellen.');}}if(!Array.isArray(input.photoReferences)||input.photoReferences.length>4)fail('Höchstens vier Fotoreferenzen.');
 const photos=new Map(),references=[],initial=[];
 for(const raw of input.photoReferences){const r=photoEvidence(raw);if(photos.has(r.imageId))fail('Fotoreferenz doppelt.');
  // Bind evidence to actual current attachment bytes, not a supplied filename.
  let attached;for(const i of input.images??[]){const bytes=Uint8Array.from(atob(i.dataUrl.split(',')[1]??''),c=>c.charCodeAt(0)),digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');if(digest===r.digest){attached=i;break;}}
  if(!attached)fail('Fotoreferenz gehört nicht zu einem aktuellen Bildanhang.');const image=await loadPhotoImage(attached.dataUrl);if(image.naturalWidth!==r.width||image.naturalHeight!==r.height)fail('Bildabmessungen haben sich geändert.');const comparison=await preparePerspectiveComparison(r,image);photos.set(r.imageId,{reference:r,image,comparison});if(comparison.rectified)initial.push(comparison.rectified);references.push(r);const grid=photoGrid(image);initial.push({...grid.image,name:r.imageId+'-Raster.png'});
 }
 const extra=[],gridQueries=[];let lastGrids=[];const context=()=>({photoReferences:structuredClone(references),photoTools:PHOTO_CONTRACT});
 const api={context,initialImages:initial,takeImages(){if(gridQueries.length)lastGrids=gridQueries.splice(0);return extra.splice(0);},checkpoint:()=>({version:1,grids:structuredClone(lastGrids)}),
  analyze(q){const o=q.options??{},p=photos.get(o.imageId);if(!p)fail('Unbekannte Fotokennung.');if(q.kind==='measure'){if(Object.keys(o).some(k=>!['imageId','points'].includes(k))||!Array.isArray(o.points)||o.points.length!==2)fail('Messung benötigt genau zwei Originalpunkte.');return {id:q.id,value:measurePhoto(p.reference,o.points)};}
   if(q.kind==='grid'){if(Object.keys(o).some(k=>!['imageId','crop','step'].includes(k)))fail('Nur Ausschnitt und Rasterabstand übergeben.');const g=photoGrid(p.image,o);extra.push({...g.image,name:o.imageId+'-Ausschnitt.png'});gridQueries.push(structuredClone(q));const {image,...value}=g;return {id:q.id,value:{...value,imageName:extra.at(-1).name}};}fail('Unbekanntes Fotowerkzeug.');},
  async compare(previewId,inspect){const reports=[];for(const p of photos.values()){if(!p.reference.outline.length){reports.push({evidence:p.reference,imageId:p.reference.imageId,unavailable:true,reason:'Keine bestätigte Fotokontur. Nur Bildmaße verfügbar.'});continue;}if(typeof inspect!=='function'){reports.push({evidence:p.reference,imageId:p.reference.imageId,unavailable:true,reason:'Keine lokale Vorschauprojektion verfügbar.'});continue;}try{const geometry=await inspect(previewId);reports.push(comparePhotoProjection(p.comparison.reference,p.comparison.image,geometry));}catch(e){if(/STALE|ABORT|CANCEL/.test(e.code??''))throw e;reports.push({evidence:p.reference,imageId:p.reference.imageId,unavailable:true,reason:e.message});}}return reports;}
 };
 for(const query of checkpoint?.grids??[])api.analyze(query);return api;
}
