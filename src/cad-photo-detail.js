export function photoDetailRegion(width,height,points){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!points.length||
  points.some(([x,y])=>!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>width||y>height))throw Error('Ungültige Bildpunkte.');
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
 const pad=Math.max(32,Math.ceil(Math.max(x1-x0,y1-y0)*.18));
 const x=Math.max(0,Math.floor(x0-pad)),y=Math.max(0,Math.floor(y0-pad));
 const w=Math.min(width,Math.ceil(x1+pad))-x,h=Math.min(height,Math.ceil(y1+pad))-y;
 const ratio=Math.min(1,1280/Math.max(w,h)),size=[Math.max(1,Math.round(w*ratio)),Math.max(1,Math.round(h*ratio))];
 return {originalPixels:[width,height],origin:[x,y],extent:[w,h],imagePixels:size,originalPixelsPerImagePixel:[w/size[0],h/size[1]]};
}
export function renderPhotoDetail(document,image,measurements){
 const marks=measurements.flatMap((points,i)=>points.map((point,j)=>({point,label:(i+1)+'.'+(j+1)})));
 const mapping=photoDetailRegion(image.naturalWidth,image.naturalHeight,marks.map(m=>m.point));
 const [x,y]=mapping.origin,[w,h]=mapping.extent,[cw,ch]=mapping.imagePixels,[sx,sy]=mapping.originalPixelsPerImagePixel;
 const canvas=document.createElement('canvas');canvas.width=cw;canvas.height=ch;
 const ctx=canvas.getContext('2d');
 ctx.drawImage(image,x,y,w,h,0,0,cw,ch);
 ctx.font='bold 15px sans-serif';ctx.lineWidth=3;
 for(const {point:[px,py],label} of marks){
  const u=(px-x)/sx,v=(py-y)/sy;
  ctx.strokeStyle='#ff7b00';ctx.beginPath();ctx.arc(u,v,6,0,Math.PI*2);ctx.stroke();
  const tx=Math.max(0,Math.min(cw-ctx.measureText(label).width,u+8)),ty=Math.max(15,Math.min(ch-1,v-8));
  ctx.strokeStyle='#000';ctx.strokeText(label,tx,ty);ctx.fillStyle='#fff';ctx.fillText(label,tx,ty);
 }
 return {mapping,marks,image:canvas.toDataURL('image/jpeg',.9).split(',')[1]};
}

const detailReaders=new WeakMap();
export const registerPhotoDetail=(dialog,read)=>detailReaders.set(dialog,read);
export const readPhotoDetail=dialog=>detailReaders.get(dialog)?.();
