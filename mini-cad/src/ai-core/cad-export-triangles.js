// Export-only cleanup. No tolerance, welding, coordinate movement or CAD edit.
// Exact binary arithmetic resolves zero/overflow in the fast cross product so
// even positive triangles smaller than floating-point area range survive.
function exactCross(points){
  const view=new DataView(new ArrayBuffer(8)),values=points.flat().map(value=>{
    view.setFloat64(0,value);const bits=view.getBigUint64(0),power=Number((bits>>52n)&2047n),fraction=bits&((1n<<52n)-1n);
    return {value:(bits>>63n?-1n:1n)*(power?(1n<<52n)|fraction:fraction),exponent:power?power-1075:-1074};
  }),base=Math.min(...values.filter(v=>v.value!==0n).map(v=>v.exponent));
  const integers=values.map(v=>v.value===0n?0n:v.value<<BigInt(v.exponent-base)),u=[0,1,2].map(k=>integers[k+3]-integers[k]),v=[0,1,2].map(k=>integers[k+6]-integers[k]);
  return [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
}
export function cadExportTriangleNormal(a,b,c){
  if([a,b,c].some(p=>!Array.isArray(p)||p.length!==3||p.some(v=>!Number.isFinite(v))))throw Error('Ungültige CAD-Exportkoordinaten.');
  const u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]),cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...cross);
  const coordinate=Math.max(...a.map(Math.abs),...b.map(Math.abs),...c.map(Math.abs)),errorBound=64*Number.EPSILON*coordinate*coordinate;
  if(length>errorBound&&Number.isFinite(length))return cross.map(v=>v/length);
  if([a,b,c].some((p,i)=>[a,b,c].slice(i+1).some(q=>p.every((v,k)=>v===q[k]))))return null;
  const exact=exactCross([a,b,c]);if(exact.every(v=>v===0n))return null;
  const magnitude=exact.map(v=>v<0n?-v:v),bits=magnitude.map(v=>v.toString(2).length),largest=Math.max(...bits),scaled=exact.map((v,k)=>{
    const shift=Math.max(0,bits[k]-53);return (v<0n?-1:1)*Number(magnitude[k]>>BigInt(shift))*2**(shift-largest);
  }),norm=Math.hypot(...scaled);return scaled.map(v=>v/norm);
}

// Input buffers and face mapping have already passed the native adapter's
// validation. Preserve vertex doubles, face IDs and every positive triangle.
export function cadCleanExportTriangles(mesh){
  const {vertices,triangles,faceGroups}=mesh,kept=[],groups=[];let removed=0;
  for(let group=0;group<faceGroups.length;group+=3){
    const start=kept.length,end=faceGroups[group]+faceGroups[group+1];
    for(let i=faceGroups[group];i<end;i+=3){const ids=triangles.slice(i,i+3),points=ids.map(index=>vertices.slice(index*3,index*3+3));
      if(cadExportTriangleNormal(...points))kept.push(...ids);else removed++;
    }
    if(kept.length===start)throw Error('Eine CAD-Exportfläche besitzt keine Dreiecke mit positiver Fläche.');
    groups.push(start,kept.length-start,faceGroups[group+2]);
  }
  return removed?{...mesh,triangles:kept,faceGroups:groups}:mesh;
}
