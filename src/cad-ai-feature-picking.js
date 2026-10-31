/** Screen-space choice among explicitly displayed exact native edge domains.
 * Ambiguous overlapping domains require another human pick, never a guess. */
export function pickCadFeatureEdge(view,event,edges){
 const hits=[];for(const edge of edges)for(const curve of edge.display.curves)for(let i=1;i<curve.length;i++){
  const a=view.projectPoint(curve[i-1]),b=view.projectPoint(curve[i]);if([a.z,b.z].some(z=>z< -1||z>1))continue;const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((event.clientX-a.x)*dx+(event.clientY-a.y)*dy)/(dx*dx+dy*dy||1))),distance=Math.hypot(event.clientX-a.x-t*dx,event.clientY-a.y-t*dy);if(distance<=11)hits.push({edge,distance,depth:a.z+t*(b.z-a.z)});
 }hits.sort((a,b)=>a.distance-b.distance||a.depth-b.depth);const best=hits[0];if(!best)throw Error('Eine angezeigte native Kante anklicken.');if(hits.some(h=>h.edge.selector.signature!==best.edge.selector.signature&&Math.abs(h.distance-best.distance)<.5))throw Error('Mehrere Kanten am Klickpunkt. Ansicht drehen oder eine freiliegende Kante wählen.');return best.edge;
}
