// Clip display triangles in homogeneous camera space. This also works when a
// triangle crosses the near plane, and leaves holes/empty bounding-box corners
// unselected. CAD geometry and model state are never involved.
export function marqueeIntersectsMesh(vertices, indices, matrix, rect) {
  const planes = [[1,0,0,-rect.left],[-1,0,0,rect.right],
    [0,1,0,-rect.bottom],[0,-1,0,rect.top],[0,0,1,1],[0,0,-1,1]];
  const projected = new Map();
  function vertex(index) {
    if(projected.has(index))return projected.get(index);
    const x=vertices[index*3],y=vertices[index*3+1],z=vertices[index*3+2];
    const value=[0,1,2,3].map(k=>matrix[k]*x+matrix[4+k]*y+matrix[8+k]*z+matrix[12+k]);
    projected.set(index,value);return value;
  }
  const distance=(p,plane)=>p.reduce((sum,v,k)=>sum+v*plane[k],0);
  const count=indices?.length??vertices.length/3;
  for(let i=0;i<count;i+=3){
    let polygon=[vertex(indices?indices[i]:i),vertex(indices?indices[i+1]:i+1),vertex(indices?indices[i+2]:i+2)];
    for(const plane of planes){
      const distances=polygon.map(p=>distance(p,plane));
      if(distances.every(d=>d>=-1e-10))continue;
      if(distances.every(d=>d< -1e-10)){polygon=[];break;}
      const next=[];
      for(let j=0;j<polygon.length;j++){
        const a=polygon[j],b=polygon[(j+1)%polygon.length],da=distances[j],db=distances[(j+1)%polygon.length];
        if(da>=-1e-10)next.push(a);
        if((da>=0)!==(db>=0)){const t=da/(da-db);next.push(a.map((v,k)=>v+(b[k]-v)*t));}
      }
      polygon=next;if(!polygon.length)break;
    }
    if(polygon.some(p=>p[3]>1e-10))return true;
  }
  return false;
}
