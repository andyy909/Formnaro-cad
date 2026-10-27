import {Matrix4,Frustum} from 'three';
import {cadPoint} from './cad-affine.js';

/** Fit measurements along original CAD axes using the full world matrix. */
export function cadFitDimensions(info,{gap,axes=[0,1],kind='opening'}={}){
  if(info?.kind!=='cad'||!info.localBounds||!Array.isArray(info.worldMatrix)||!Array.isArray(info.transform)||!Number.isFinite(gap)||gap<0||gap>5||!['opening','insert'].includes(kind)||!Array.isArray(axes)||!axes.length||axes.some(k=>![0,1,2].includes(k)))throw Error('Passung: CAD-Form, 0–5 mm Spiel je Seite und mindestens eine Achse wählen.');
  const dimensions=info.localBounds.min.map((v,k)=>info.localBounds.max[k]-v),localScale=[0,1,2].map(k=>Math.hypot(...info.transform.slice(4*k,4*k+3))),worldScale=[0,1,2].map(k=>Math.hypot(...info.worldMatrix.slice(4*k,4*k+3))),before=dimensions.map((v,k)=>v*worldScale[k]),after=[...before];
  for(const axis of new Set(axes))after[axis]+=(kind==='opening'?1:-1)*2*gap;
  if([...before,...after,...localScale,...worldScale].some(v=>!Number.isFinite(v)||v<=0)||after.some(v=>v<.01||v>10000))throw Error('Die Passung würde das Teil zu klein oder zu groß machen.');
  const size=after.map((v,k)=>v*localScale[k]/worldScale[k]),center=info.localBounds.min.map((v,k)=>(v+info.localBounds.max[k])/2),position=cadPoint(info.transform,center);return {before,after,size,position};
}

/** Six inward world-space planes enclosing a complete screen rectangle. */
export function cadSelectionFrustumPlanes(camera,canvasRect,screenRect){
  const {left,top,width,height}=canvasRect;if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||!Array.isArray(screenRect)||screenRect.length!==4||screenRect.some(v=>!Number.isFinite(v)))throw Error('Ungültiger Kantenrahmen.');
  const [x0,y0,x1,y1]=screenRect,minX=2*(Math.min(x0,x1)-left)/width-1,maxX=2*(Math.max(x0,x1)-left)/width-1,minY=1-2*(Math.max(y0,y1)-top)/height,maxY=1-2*(Math.min(y0,y1)-top)/height;if(maxX<=minX||maxY<=minY)throw Error('Kantenrahmen hat keine Fläche.');
  camera.updateMatrixWorld(true);const crop=new Matrix4().set(2/(maxX-minX),0,0,-(maxX+minX)/(maxX-minX),0,2/(maxY-minY),0,-(maxY+minY)/(maxY-minY),0,0,1,0,0,0,0,1),frustum=new Frustum().setFromProjectionMatrix(crop.multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse));return frustum.planes.map(plane=>[...plane.normal.toArray(),plane.constant]);
}
