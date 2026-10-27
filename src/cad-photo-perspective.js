// Points are always upright original pixels; matrices are derived, never trusted from files.
const fail=m=>{throw Object.assign(Error('Fotoentzerrung: '+m),{code:'PHOTO_CALIBRATION'});};
const finite=(x,lo,hi)=>typeof x==='number'&&Number.isFinite(x)&&x>=lo&&x<=hi;
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function projectPhotoPoint(matrix,point){
 const [x,y]=point,d=matrix[6]*x+matrix[7]*y+matrix[8];
 if(!Number.isFinite(d)||Math.abs(d)<1e-10)fail('Punkt liegt am perspektivischen Horizont.');
 const out=[(matrix[0]*x+matrix[1]*y+matrix[2])/d,(matrix[3]*x+matrix[4]*y+matrix[5])/d];
 if(out.some(x=>!Number.isFinite(x)||Math.abs(x)>1e8))fail('Entzerrung an dieser Stelle ist instabil.');return out;
}
function solve(rows){
 for(let k=0;k<8;k++){
  let best=k;for(let i=k+1;i<8;i++)if(Math.abs(rows[i][k])>Math.abs(rows[best][k]))best=i;
  [rows[k],rows[best]]=[rows[best],rows[k]];const pivot=rows[k][k];
  if(Math.abs(pivot)<1e-10)fail('Vier gut verteilte Rechteckecken erforderlich.');
  for(let j=k;j<=8;j++)rows[k][j]/=pivot;
  for(let i=0;i<8;i++)if(i!==k){const v=rows[i][k];for(let j=k;j<=8;j++)rows[i][j]-=v*rows[k][j];}
 }
 return [...rows.map(r=>r[8]),1];
}
function homography(from,to){
 // Normalization keeps conditioning independent of original image size and units.
 const norm=points=>{const c=[0,1].map(k=>points.reduce((s,p)=>s+p[k],0)/4),s=Math.sqrt(2)/Math.sqrt(points.reduce((n,p)=>n+(p[0]-c[0])**2+(p[1]-c[1])**2,0)/4);return {c,s,p:points.map(p=>p.map((v,k)=>(v-c[k])*s))};};
 const a=norm(from),b=norm(to),rows=[];
 a.p.forEach(([x,y],i)=>{const [u,v]=b.p[i];rows.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);});
 const h=solve(rows),mul=(a,b)=>Array.from({length:9},(_,i)=>[0,1,2].reduce((n,k)=>n+a[Math.floor(i/3)*3+k]*b[k*3+i%3],0));
 const result=mul([1/b.s,0,b.c[0],0,1/b.s,b.c[1],0,0,1],mul(h,[a.s,0,-a.c[0]*a.s,0,a.s,-a.c[1]*a.s,0,0,1]));
 const scale=Math.max(...result.map(Math.abs));return result.map(n=>n/scale);
}
export function photoPlaneContains(points,p){const signs=points.map((a,i)=>cross(a,points[(i+1)%4],p));return signs.every(n=>n>=-1e-7)||signs.every(n=>n<=1e-7);}
export function validatePhotoCalibration(value,width,height){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).some(k=>!['kind','points','sizeMm','referenceErrorMm','pickErrorPx','source','note'].includes(k))||value.kind!=='rectangle')fail('Bekanntes ebenes Rechteck erforderlich.');
 const c=structuredClone(value);
 if(!Array.isArray(c.points)||c.points.length!==4||c.points.some(p=>!Array.isArray(p)||p.length!==2||!finite(p[0],0,width)||!finite(p[1],0,height)))fail('Vier Punkte im Originalbild wählen: oben links, oben rechts, unten rechts, unten links.');
 if(!Array.isArray(c.sizeMm)||c.sizeMm.length!==2||c.sizeMm.some(n=>!finite(n,.001,100000))||!finite(c.referenceErrorMm,0,Math.min(...c.sizeMm)/2)||!finite(c.pickErrorPx,.25,100)||!['user','listing'].includes(c.source)||typeof c.note!=='string'||!c.note.trim()||c.note.length>120)fail('Breite, Höhe, Herkunft und Unsicherheiten des Rechtecks angeben.');
 const turns=c.points.map((p,i)=>cross(p,c.points[(i+1)%4],c.points[(i+2)%4]));
 if(!turns.every(x=>x>0))fail('Rechteckecken müssen ohne Kreuzung im Uhrzeigersinn angeordnet sein.');
 const edges=c.points.map((p,i)=>dist(p,c.points[(i+1)%4])),area=Math.abs(c.points.reduce((s,p,i)=>{const q=c.points[(i+1)%4];return s+p[0]*q[1]-q[0]*p[1];},0))/2;
 if(Math.min(...edges)<Math.max(12,8*c.pickErrorPx)||area<256||2*area/Math.max(...edges)<Math.max(12,8*c.pickErrorPx))fail('Referenz zu klein oder zu flach abgebildet. Näher und weniger schräg fotografieren.');
 return c;
}
export function photoPlane(value,width,height){
 const c=validatePhotoCalibration(value,width,height),[w,h]=c.sizeMm,plane=[[0,0],[w,0],[w,h],[0,h]],toPlane=homography(c.points,plane),toOriginal=homography(plane,c.points);
 const d=c.points.map(([x,y])=>toPlane[6]*x+toPlane[7]*y+toPlane[8]);
 if(!d.every(n=>n*d[0]>0)||Math.max(...d.map(Math.abs))/Math.min(...d.map(Math.abs))>30)fail('Zu starke Perspektive für verlässliche Messungen.');
 const pixelScale=p=>{const a=projectPhotoPoint(toPlane,p);return Math.max(...[[p[0]+.1,p[1]],[p[0],p[1]+.1]].map(q=>dist(a,projectPhotoPoint(toPlane,q))/.1));};
 const scales=c.points.map(pixelScale),worstMmPerPixel=Math.max(...scales);
 return {toPlane,toOriginal,sizeMm:[w,h],worstMmPerPixel,estimatedCornerUncertaintyMm:Math.SQRT2*c.pickErrorPx*worstMmPerPixel+c.referenceErrorMm,warnings:['Gilt nur in der Referenzebene und innerhalb des markierten Rechtecks. Objektivverzeichnung und Höhenversatz sind nicht korrigiert.',...(Math.max(...scales)/Math.min(...scales)>3?['Starker Auflösungsunterschied zwischen naher und ferner Seite.']:[])]};
}
export function measurePerspectivePhoto(reference,points){
 const c=reference.perspective,plane=photoPlane(c,reference.width,reference.height);
 if(points.length!==2||points.some(p=>!photoPlaneContains(c.points,p)))fail('Messpunkte müssen innerhalb des kalibrierten Rechtecks liegen.');
 const mapped=points.map(p=>projectPhotoPoint(plane.toPlane,p)),mm=dist(...mapped);
 // Disclosed first-order estimate includes all calibration and measurement picks.
 let sensitivity=0;const epsilon=.05;
 for(let i=0;i<4;i++)for(let k=0;k<2;k++){
  const moved=c.points.map(p=>[...p]);moved[i][k]+=epsilon;
  const h=homography(moved,[[0,0],[c.sizeMm[0],0],c.sizeMm,[0,c.sizeMm[1]]]);
  sensitivity+=Math.abs(dist(...points.map(p=>projectPhotoPoint(h,p)))-mm)/epsilon*c.pickErrorPx;
 }
 for(let i=0;i<2;i++)for(let k=0;k<2;k++){
  const moved=points.map(p=>[...p]);moved[i][k]+=epsilon;
  sensitivity+=Math.abs(dist(...moved.map(p=>projectPhotoPoint(plane.toPlane,p)))-mm)/epsilon*c.pickErrorPx;
 }
 return {mm,uncertaintyMm:sensitivity+mm*c.referenceErrorMm/Math.min(...c.sizeMm),points:structuredClone(points),planePointsMm:mapped,source:'measured',estimate:true,scope:'First-order image estimate in calibrated plane; no lens or depth correction.'};
}
