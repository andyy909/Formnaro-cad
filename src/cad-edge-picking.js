// The visible edge tool and practice replay must resolve the same screen hit.
export function pickCadEdge(edges,projectPoint,{clientX,clientY}){
 let best=null,distance=12,depth=Infinity;
 for(const edge of edges)for(let i=1;i<edge.points.length;i++){
  const a=projectPoint(edge.points[i-1]),b=projectPoint(edge.points[i]);
  if(a.z< -1||a.z>1||b.z< -1||b.z>1)continue;
  const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((clientX-a.x)*dx+(clientY-a.y)*dy)/(dx*dx+dy*dy||1)));
  const d=Math.hypot(clientX-a.x-t*dx,clientY-a.y-t*dy),z=a.z+t*(b.z-a.z);
  if(d<distance-.15||Math.abs(d-distance)<=.15&&z<depth){best=edge.edgeToken;distance=d;depth=z;}
 }
 return best;
}
