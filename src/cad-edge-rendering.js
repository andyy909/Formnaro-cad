// Render buffers only; authoritative native curve domains stay in the tool.
// Two batches replace thousands of individual geometries/materials/draw calls.
export function cadEdgeRenderBuffers(values){
  const counts=[0,0];for(const entry of values){const n=Math.max(0,entry.points.length-1)*6;counts[entry.selected?1:0]+=n;}
  if(counts[0]+counts[1]>1200000)throw Error('CAD-Kantenanzeige überschreitet die gesamte Punktgrenze.');
  const buffers=counts.map(n=>new Float32Array(n)),offsets=[0,0];
  for(const entry of values){const group=entry.selected?1:0,buffer=buffers[group];for(let i=1;i<entry.points.length;i++)for(const p of [entry.points[i-1],entry.points[i]]){for(let k=0;k<3;k++){const value=p[k];if(!Number.isFinite(value))throw Error('CAD-Kantenanzeige enthält ungültige Koordinaten.');buffer[offsets[group]++]=value;}}}
  return {regular:buffers[0],selected:buffers[1]};
}
