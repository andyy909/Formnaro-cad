import {CAD_AI_INPUT_LIMITS,readCadAIImage} from './cad-ai-attachments.js';
import {upsertProjectPhoto} from './cad-photo-project.js';
import {editPhotoReference} from './cad-photo-ui.js';
import {compactPhotoContour} from './cad-photo-contours.js';

const maxStlBytes=32*1024*1024;

export async function readPracticeFiles(files){
 const selected=Array.from(files);
 if(selected.length>4)throw Error('Höchstens vier Übungsdateien wählen.');
 let photoBytes=0,meshes=0;
 const result=[];
 for(const file of selected){
  const name=file.name;
  if(!name.trim()||name.length>120||/[<>:"/\\|?*\x00-\x1f]/.test(name))throw Error('Ungültiger Name für Übungsdatei.');
  if(/\.stl$/i.test(name)){
   if(++meshes>1||!file.size||file.size>maxStlBytes)throw Error('Eine STL-Datei bis 32 MiB auswählen.');
   const dataUrl=await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=reader.onabort=()=>reject(Error('Die STL-Datei konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
   });
   result.push({name,kind:'stl',mimeType:'model/stl',base64:dataUrl.split(',')[1]});
  }else{
   photoBytes+=file.size;
   if(photoBytes>CAD_AI_INPUT_LIMITS.maxAttachmentBytes)throw Error('Übungsfotos dürfen zusammen höchstens 12 MiB groß sein.');
   const {mimeType,dataUrl,width,height,contour}=await readCadAIImage(file,{suggestContour:true});
   const photoEvidence={originalPixels:[width,height]};
   if(contour?.silhouette)photoEvidence.silhouetteCandidate=contour.silhouette;
   const points=contour?.points?.length>16?compactPhotoContour(contour.points,2*Math.max(1,width/640,height/640)):contour?.points;
   if(points?.length<=16)photoEvidence.outerEdgeCandidate=points.map(point=>point.map(value=>Math.round(value*100)/100));
   result.push({name,kind:'photo',mimeType,base64:dataUrl.split(',')[1],photoEvidence});
  }
 }
 return result;
}

export function practicePhotoImages(files){
 return files.filter(file=>file.kind==='photo').map(({name,mimeType,base64})=>({name,mimeType,dataUrl:`data:${mimeType};base64,${base64}`}));
}

export function practiceFileObject({name,mimeType,base64}){
 const data=atob(base64),bytes=new Uint8Array(data.length);
 for(let i=0;i<data.length;i++)bytes[i]=data.charCodeAt(i);
 return new File([bytes],name,{type:mimeType});
}

export async function measurePracticePhoto(file,controller){
 const attachment=await readCadAIImage(file);
 const revision=controller.revision(),photos=controller.readSnapshot().photos;
 const saved=photos?.items.find(item=>item.reference.imageId===attachment.imageId);
 if(saved)attachment.photo=saved.reference;
 const reference=await editPhotoReference(attachment,{explicitScale:true});
 if(!reference)return null;
 const next=upsertProjectPhoto(photos,{...attachment,photo:reference});
 const proposal=await controller.previewPhotos(next,{revision});
 controller.apply(proposal);
 return reference;
}
