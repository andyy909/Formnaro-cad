import {rectifyPhotoPixels} from './cad-photo-rectify.js';
import {projectPhotoPoint} from './cad-photo-perspective.js';
import {PHOTO_VIEWS,photoBounds,comparePhotoMasks} from './cad-photo-data.js';
export async function loadPhotoImage(dataUrl){if(!/^data:image\/(png|jpeg|webp);base64,/.test(dataUrl))throw Error('Ungültiges lokales Bild.');return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('Foto konnte nicht gelesen werden.'));i.src=dataUrl;});}
export function photoGrid(image,{crop=[0,0,image.naturalWidth,image.naturalHeight],step}={}){
 const [x0,y0,x1,y1]=crop;if(crop.length!==4||!crop.every(Number.isFinite)||x0<0||y0<0||x1>image.naturalWidth||y1>image.naturalHeight||x1-x0<2||y1-y0<2)throw Error('Fotoausschnitt außerhalb des Originals.');
 const zoom=Math.min(8,1400/Math.max(x1-x0,y1-y0)),c=document.createElement('canvas');c.width=Math.max(2,Math.round((x1-x0)*zoom));c.height=Math.max(2,Math.round((y1-y0)*zoom));const ctx=c.getContext('2d');ctx.drawImage(image,x0,y0,x1-x0,y1-y0,0,0,c.width,c.height);
 step??=[1,2,5,10,20,50,100,200,500,1000,2000].find(n=>n>=Math.max(x1-x0,y1-y0)/12)??2000;if(!Number.isFinite(step)||step<1||step>10000||(x1-x0+y1-y0)/step>200)throw Error('Rasterabstand ungültig oder zu fein.');
 ctx.font='bold 13px sans-serif';ctx.lineWidth=1;for(let x=Math.ceil(x0/step)*step;x<x1;x+=step){const px=(x-x0)*zoom;ctx.strokeStyle='#e600c6';ctx.beginPath();ctx.moveTo(px,0);ctx.lineTo(px,c.height);ctx.stroke();ctx.fillStyle='#000';ctx.fillRect(px+2,0,ctx.measureText(String(x)).width+4,17);ctx.fillStyle='#fff';ctx.fillText(String(x),px+4,13);}for(let y=Math.ceil(y0/step)*step;y<y1;y+=step){const py=(y-y0)*zoom;ctx.strokeStyle='#e600c6';ctx.beginPath();ctx.moveTo(0,py);ctx.lineTo(c.width,py);ctx.stroke();ctx.fillStyle='#000';ctx.fillRect(0,py+2,ctx.measureText(String(y)).width+4,17);ctx.fillStyle='#fff';ctx.fillText(String(y),2,py+15);}
 return {image:{name:'Foto-Pixelraster.png',mimeType:'image/png',dataUrl:c.toDataURL('image/png')},crop,zoom,step,originalSize:[image.naturalWidth,image.naturalHeight]};
}
const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
function mask(c){const rgba=c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,c.width,c.height).data;return Uint8Array.from({length:c.width*c.height},(_,i)=>rgba[i*4+3]>=128?1:0);}
function drawPolygon(ctx,points,map){ctx.beginPath();points.forEach((p,i)=>{const [x,y]=map(p);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.fill();}
// Display triangles are used solely for a disclosed raster comparison.
export function comparePhotoProjection(reference,image,geometry,{registration}={}){
 const axes=PHOTO_VIEWS[reference.view],dot=(p,a)=>p[0]*a[0]+p[1]*a[1]+p[2]*a[2],flat=geometry.triangles.map(tri=>tri.map(p=>[dot(p,axes.right),-dot(p,axes.up)]));
 if(!flat.length||flat.length>250000)throw Error('Fotoprojektion benötigt 1 bis 250.000 Dreiecke.');
 const pb=photoBounds(reference.outline),mb=photoBounds(flat.flat()),ppm=1/reference.mmPerPx,pw=pb.max[0]-pb.min[0],ph=pb.max[1]-pb.min[1],mw=(mb.max[0]-mb.min[0])*ppm,mh=(mb.max[1]-mb.min[1])*ppm;
 // Vector contours in rectified views use millimetres, not original pixels.
 // A fixed bounded comparison grid avoids unit-dependent raster aliasing.
 // Upsampling this diagnostic grid does not add photographic resolution.
 const centre=b=>b.min.map((n,i)=>(n+b.max[i])/2);let pcentre=centre(pb),mcentre=centre(mb),span=Math.max(pw,ph,mw,mh)*1.06,registrationOffsetMm;
 if(registration){
  if(!Array.isArray(registration.photoOrigin)||registration.photoOrigin.length!==2||!Array.isArray(registration.modelOrigin)||registration.modelOrigin.length!==2||[...registration.photoOrigin,...registration.modelOrigin].some(n=>!Number.isFinite(n)))throw Error('Gemeinsame Foto-/Modell-Nullpunkte fehlen.');
  const po=registration.photoOrigin,mo=registration.modelOrigin,min=[0,1].map(k=>Math.min(pb.min[k]-po[k],(mb.min[k]-mo[k])*ppm)),max=[0,1].map(k=>Math.max(pb.max[k]-po[k],(mb.max[k]-mo[k])*ppm)),joint=min.map((n,k)=>(n+max[k])/2);
  registrationOffsetMm=centre(mb).map((n,k)=>n-mo[k]-(centre(pb)[k]-po[k])*reference.mmPerPx);
  pcentre=po.map((n,k)=>n+joint[k]);mcentre=mo.map((n,k)=>n+joint[k]*reference.mmPerPx);span=Math.max(...max.map((n,k)=>n-min[k]))*1.06;
 }
 const size=768,shrink=size/span,cell=reference.mmPerPx/shrink,photo=canvas(size,size),model=canvas(size,size),pc=photo.getContext('2d'),mc=model.getContext('2d'),pm=p=>p.map((n,i)=>(n-pcentre[i])*shrink+size/2),mm=p=>p.map((n,i)=>(n-mcentre[i])/cell+size/2);
 pc.fillStyle='#fff';drawPolygon(pc,reference.outline,pm);pc.globalCompositeOperation='destination-out';for(const hole of reference.holes)drawPolygon(pc,hole,pm);mc.fillStyle='#fff';for(const tri of flat)drawPolygon(mc,tri,mm);
 const a=mask(photo),b=mask(model),report=comparePhotoMasks(a,b,size,size,cell),normal=canvas(size,size),nc=normal.getContext('2d'),photoMiddle=pm(centre(pb)),modelMiddle=centre(mb);nc.fillStyle='#fff';for(const tri of flat)drawPolygon(nc,tri,p=>[(p[0]-modelMiddle[0])/Math.max(1e-12,mb.max[0]-mb.min[0])*pw*shrink+photoMiddle[0],(p[1]-modelMiddle[1])/Math.max(1e-12,mb.max[1]-mb.min[1])*ph*shrink+photoMiddle[1]]);const shapeIou=comparePhotoMasks(a,mask(normal),size,size,cell).iou,overlay=canvas(size,size),ctx=overlay.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);ctx.globalAlpha=.38;ctx.drawImage(image,0,0,image.naturalWidth,image.naturalHeight,size/2-pcentre[0]*shrink,size/2-pcentre[1]*shrink,(reference.backgroundSize?.[0]??image.naturalWidth)*shrink,(reference.backgroundSize?.[1]??image.naturalHeight)*shrink);ctx.globalAlpha=1;
 const color=ctx.getImageData(0,0,size,size);for(let i=0;i<a.length;i++){const k=i*4;if(a[i]&&!b[i]){color.data[k]=220;color.data[k+1]=45;color.data[k+2]=55;}else if(b[i]&&!a[i]){color.data[k]=30;color.data[k+1]=110;color.data[k+2]=230;}else if(a[i]&&b[i]){color.data[k]=80;color.data[k+1]=170;color.data[k+2]=110;}}ctx.putImageData(color,0,0);
 const openings=reference.holes.map((hole,index)=>{const c=canvas(size,size),x=c.getContext('2d');x.fillStyle='#fff';drawPolygon(x,hole,pm);const h=mask(c);let total=0,blocked=0;for(let i=0;i<h.length;i++)if(h[i]){total++;if(b[i])blocked++;}return {index,visiblePixels:total,blockedFraction:total?blocked/total:null,scope:'Visible projected opening only; depth and diameter require separate native checks.'};});
 const exactPhoto=[pw*reference.mmPerPx,ph*reference.mmPerPx],exactModel=[mw*reference.mmPerPx,mh*reference.mmPerPx],pick=Math.SQRT2*reference.scale.pickErrorPx,tolerance=exactPhoto.map(d=>2*pick*reference.mmPerPx+d*(pick/Math.hypot(reference.scale.points[1][0]-reference.scale.points[0][0],reference.scale.points[1][1]-reference.scale.points[0][1])+reference.scale.referenceErrorMm/reference.scale.mm));
 const sizeErrors=exactModel.map((n,i)=>n-exactPhoto[i]),matches=report.iou>=.9&&sizeErrors.every((v,i)=>Math.abs(v)<=tolerance[i])&&(!registrationOffsetMm||registrationOffsetMm.every((n,k)=>Math.abs(n)<=tolerance[k]))&&openings.every(o=>o.blockedFraction!==null&&o.blockedFraction<=.05);
 return {...report,...(registration?{registration:'common-origin',registrationOffsetMm,scope:'Projected raster comparison registered to the explicitly shared original-photo and world-model origin; no independent recentering, scaling or mirroring.'}:{}),shapeIou,shapeScope:'Shape normalized independently to photo width/height for diagnosis only; calibrated iou and mm errors remain authoritative.',evidence:reference.originalEvidence??reference,imageId:reference.imageId,view:reference.view,targets:geometry.targets,photoSizeMm:exactPhoto,modelSizeMm:exactModel,sizeErrorsMm:sizeErrors,estimatedUncertaintyMm:tolerance,openings,matches,advisory:true,fix:matches?'Kontur innerhalb der Bildprüfung ähnlich; native Maße, Tiefe und Bohrungen separat prüfen.':'Rot: im Foto vorhanden, im Modell fehlend. Blau: überschüssiges Modellmaterial. Außenmaße und sichtbare Öffnungen prüfen; Referenz nicht verändern.',overlay:{name:'Foto-Modell-Vergleich.png',mimeType:'image/png',dataUrl:overlay.toDataURL('image/png')}};
}

export function rectifiedPhotoImage(image,reference){
 const source=canvas(image.naturalWidth,image.naturalHeight),ctx=source.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
 const result=rectifyPhotoPixels(ctx.getImageData(0,0,source.width,source.height),reference.perspective),out=canvas(result.width,result.height);out.getContext('2d').putImageData(new ImageData(result.data,result.width,result.height),0,0);
 return {dataUrl:out.toDataURL('image/png'),...result};
}
export async function preparePerspectiveComparison(reference,image){
 if(reference.version!==2)return {reference,image};
 const rectified=rectifiedPhotoImage(image,reference),plane=rectified.plane,map=p=>projectPhotoPoint(plane.toPlane,p),c=reference.perspective;
 // Compare in physical millimetres. This private view is never persisted or
 // sent as replacement reference; the original evidence remains authoritative.
 const comparison={...reference,mmPerPx:1,outline:reference.outline.map(map),holes:reference.holes.map(h=>h.map(map)),backgroundSize:[...c.sizeMm],scale:{...reference.scale,points:[[0,0],[c.sizeMm[0],0]],mm:c.sizeMm[0],pickErrorPx:plane.worstMmPerPixel*c.pickErrorPx},originalEvidence:reference};
 return {reference:comparison,image:await loadPhotoImage(rectified.dataUrl),rectified:{name:reference.imageId+'-Ebene-'+c.sizeMm.join('x')+'mm.png',mimeType:'image/png',dataUrl:rectified.dataUrl}};
}
