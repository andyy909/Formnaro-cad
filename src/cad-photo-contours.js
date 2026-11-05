// Local evidence only; proposals never overwrite confirmed user contours.
export function compactPhotoContour(points,tolerance){
 // Split the closed convex hull into two open paths with distinct endpoints.
 const first=points[0];
 const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 let opposite=1;
 for(let i=2;i<points.length;i++)if(distance(first,points[i])>distance(first,points[opposite]))opposite=i;
 function simplify(path){
  const start=path[0],end=path.at(-1),dx=end[0]-start[0],dy=end[1]-start[1],lengthSquared=dx*dx+dy*dy;
  let furthest=0,error=tolerance;
  for(let i=1;i<path.length-1;i++){
   const x=path[i][0]-start[0],y=path[i][1]-start[1];
   const fraction=Math.max(0,Math.min(1,(x*dx+y*dy)/lengthSquared));
   const deviation=Math.hypot(x-fraction*dx,y-fraction*dy);
   if(deviation>error){furthest=i;error=deviation;}
  }
  if(!furthest)return [start,end];
  return [...simplify(path.slice(0,furthest+1)).slice(0,-1),...simplify(path.slice(furthest))];
 }
 const result=[...simplify(points.slice(0,opposite+1)).slice(0,-1),
  ...simplify([...points.slice(opposite),first]).slice(0,-1)];
 return result.length>=3?result:points;
}

// A two-colour orthographic image can provide the actual pixel boundaries,
// including recesses and inner contours. Ambiguous masks use the usual hull.
export function suggestPhotoSilhouette({data,width,height}){
 if(!(data instanceof Uint8ClampedArray)||width<4||height<4||width*height>600000||data.length!==width*height*4)return null;
 const color=i=>data[i]*65536+data[i+1]*256+data[i+2];
 const background=color(0),mask=new Uint8Array(width*height);
 let foreground=null;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const index=y*width+x,offset=index*4;
  if(data[offset+3]!==255)return null;
  const pixel=color(offset);
  if(pixel===background)continue;
  if(x===0||y===0||x===width-1||y===height-1)return null;
  foreground??=pixel;
  if(pixel!==foreground)return null;
  mask[index]=1;
 }
 if(foreground===null||Math.hypot(...[16,8,0].map(shift=>((background>>shift)&255)-((foreground>>shift)&255)))<64)return null;
 const stride=width+1,edges=new Map();
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
  const index=y*width+x;
  if(!mask[index])continue;
  const top=y*stride+x,right=top+1,bottom=top+stride,bottomRight=bottom+1;
  // Keep foreground on the right of every directed edge.
  const boundary=[
   [index-width,top,right],[index+1,right,bottomRight],[index+width,bottomRight,bottom],[index-1,bottom,top]
  ];
  for(const [neighbour,from,to] of boundary){
   if(mask[neighbour])continue;
   if(edges.has(from)||edges.size>=8192)return null;
   edges.set(from,to);
  }
 }
 let outline;
 const openings=[];
 while(edges.size){
  const start=edges.keys().next().value,loop=[];
  let current=start;
  do{
   const next=edges.get(current);
   if(next===undefined)return null;
   loop.push(current);
   edges.delete(current);
   current=next;
  }while(current!==start);
  const corners=loop.filter((point,i)=>point-loop.at(i-1)!==loop[(i+1)%loop.length]-point)
   .map(point=>[point%stride,Math.floor(point/stride)]);
  if(corners.length<4||corners.length>16)return null;
  const area=corners.reduce((sum,[x,y],i)=>{
   const [nextX,nextY]=corners[(i+1)%corners.length];
   return sum+x*nextY-y*nextX;
  },0)/2;
  if(Math.abs(area)<9)return null;
  if(area>0){
   if(outline)return null;
   outline=corners;
  }else{
   if(openings.length>=4)return null;
   openings.push(corners);
  }
 }
 return outline?{outline,openings}:null;
}

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
