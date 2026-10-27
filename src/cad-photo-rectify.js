import {photoPlane,projectPhotoPoint} from './cad-photo-perspective.js';
// Bounded bilinear inverse mapping; original pixels are never overwritten.
export function rectifyPhotoPixels({data,width,height},calibration,{maxSide=1024}={}){
 if(!(data instanceof Uint8ClampedArray)||data.length!==width*height*4||width*height>16000000||!Number.isInteger(maxSide)||maxSide<32||maxSide>1400)throw Error('Ungültiges Entzerrungsbild.');
 const plane=photoPlane(calibration,width,height),ppm=Math.min(maxSide/calibration.sizeMm[0],maxSide/calibration.sizeMm[1]),w=Math.max(2,Math.round(calibration.sizeMm[0]*ppm)),h=Math.max(2,Math.round(calibration.sizeMm[1]*ppm)),out=new Uint8ClampedArray(w*h*4);
 // Pixel centres and the exact two axis scales are explicit for tracing.
 const scale=[calibration.sizeMm[0]/w,calibration.sizeMm[1]/h];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const p=projectPhotoPoint(plane.toOriginal,[(x+.5)*scale[0],(y+.5)*scale[1]]),sx=Math.max(0,Math.min(width-1,p[0]-.5)),sy=Math.max(0,Math.min(height-1,p[1]-.5)),x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0,i=(y*w+x)*4;
  for(let k=0;k<4;k++)out[i+k]=data[(y0*width+x0)*4+k]*(1-fx)*(1-fy)+data[(y0*width+Math.min(width-1,x0+1))*4+k]*fx*(1-fy)+data[(Math.min(height-1,y0+1)*width+x0)*4+k]*(1-fx)*fy+data[(Math.min(height-1,y0+1)*width+Math.min(width-1,x0+1))*4+k]*fx*fy;
 }
 return {data:out,width:w,height:h,plane,mmPerPixel:scale,scope:'Bilinear resampling of original pixels inside the calibrated plane; does not add image resolution.'};
}
