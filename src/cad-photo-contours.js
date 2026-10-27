// Local evidence only; proposals never overwrite confirmed user contours.
export function suggestPhotoContour({data,width,height},{threshold=40,minPixels=20}={}){
 if(!(data instanceof Uint8ClampedArray)||data.length!==width*height*4||width<4||height<4||width*height>600000||!Number.isFinite(threshold)||threshold<5||threshold>1020)throw Error('Ungültiges oder zu großes Kantenbild.');
 const gray=new Float32Array(width*height),edge=new Uint8Array(width*height);
 for(let i=0;i<gray.length;i++)gray[i]=data[i*4+3]/255*(data[i*4]*.2126+data[i*4+1]*.7152+data[i*4+2]*.0722)+(1-data[i*4+3]/255)*255;
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){const i=y*width+x,gx=-gray[i-width-1]+gray[i-width+1]-2*gray[i-1]+2*gray[i+1]-gray[i+width-1]+gray[i+width+1],gy=-gray[i-width-1]-2*gray[i-width]-gray[i-width+1]+gray[i+width-1]+2*gray[i+width]+gray[i+width+1];edge[i]=Math.hypot(gx,gy)>=threshold?1:0;}
 const groups=[];
 for(let start=0;start<edge.length;start++)if(edge[start]){
  const queue=[start],points=[];edge[start]=0;
  for(let n=0;n<queue.length;n++){const i=queue[n],x=i%width,y=Math.floor(i/width);points.push([x,y]);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const a=x+dx,b=y+dy,j=b*width+a;if(a>=0&&a<width&&b>=0&&b<height&&edge[j]){edge[j]=0;queue.push(j);}}}
  if(points.length>=minPixels)groups.push(points);
 }
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const hull=points=>{points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const run=ps=>{const r=[];for(const p of ps){while(r.length>1&&cross(r.at(-2),r.at(-1),p)<=0)r.pop();r.push(p);}return r.slice(0,-1);};return [...run(points),...run([...points].reverse())];};
 const area=p=>Math.abs(p.reduce((s,v,i)=>{const q=p[(i+1)%p.length];return s+v[0]*q[1]-q[0]*v[1];},0))/2;
 const candidates=groups.map(hull).filter(p=>p.length>=3&&p.length<=256&&area(p)>width*height*.005).sort((a,b)=>area(b)-area(a));
 if(!candidates.length)throw Error('Keine zusammenhängende deutliche Kante gefunden. Kontrast verbessern oder Kontur manuell setzen.');
 return {points:candidates[0],confirmed:false,method:'sobel-convex-hull-v1',warnings:['Konvexer Kantenvorschlag. Einbuchtungen und Öffnungen manuell ergänzen. Vor Verwendung korrigieren und bestätigen.']};
}
