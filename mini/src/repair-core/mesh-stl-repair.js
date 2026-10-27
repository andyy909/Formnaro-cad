// Offline repair steps evaluated against the optional Trimesh helper.
// This independent JS implementation keeps the portable app free of Python.
const STL_CAD_LIMITS={triangles:40000};
const stlError=(code,message)=>Object.assign(Error(message),{code});
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const edgeKey=(a,b)=>a<b?a+':'+b:b+':'+a;
function edgesOf(faces){const edges=new Map();faces.forEach((face,i)=>{for(let j=0;j<3;j++){const a=face[j],b=face[(j+1)%3],key=edgeKey(a,b);if(!edges.has(key))edges.set(key,[]);edges.get(key).push({face:i,a,b});}});return edges;}
function fail(message){throw stlError('STL_REPAIR_FAILED',message+' Das ursprüngliche Modell bleibt erhalten.');}

export function repairStlMesh(mesh,{fillSmallHoles=false}={}){
 if(typeof fillSmallHoles!=='boolean')throw stlError('STL_INVALID','Ungültige STL-Reparaturoption.');
 const {verts,triangles}=mesh??{};
 if(!Array.isArray(verts)||!Array.isArray(triangles)||!verts.length||verts.length%3||!triangles.length||triangles.length%3||verts.some(v=>!Number.isFinite(v))||triangles.some(i=>!Number.isSafeInteger(i)||i<0||i>=verts.length/3))throw stlError('STL_INVALID','STL enthält ungültige Koordinaten oder Dreiecke.');
 if(triangles.length/3>STL_CAD_LIMITS.triangles||verts.length>360000)throw stlError('STL_LIMIT','Die optionale Netzreparatur unterstützt höchstens 40.000 STL-Dreiecke; größere geschlossene Netze ohne Reparatur importieren.');
 const points=[],lookup=new Map(),ids=[],faces=[],degenerate=[],seen=new Set();
 const report={removedDegenerateFaces:0,removedDuplicateFaces:0,splitNeighborFaces:0,flippedFaces:0,addedFaces:0,coordinatesMoved:false};
 for(let i=0;i<verts.length;i+=3){const point=verts.slice(i,i+3),key=point.join(',');if(!lookup.has(key)){lookup.set(key,points.length);points.push(point);}ids.push(lookup.get(key));}
 for(let i=0;i<triangles.length;i+=3){const face=triangles.slice(i,i+3).map(v=>ids[v]),[a,b,c]=face.map(v=>points[v]);
  if(new Set(face).size<3||Math.hypot(...cross(sub(b,a),sub(c,a)))<1e-12){degenerate.push(face);report.removedDegenerateFaces++;continue;}
  const key=[...face].sort((a,b)=>a-b).join(',');if(seen.has(key)){report.removedDuplicateFaces++;continue;}seen.add(key);faces.push(face);
 }
 if(faces.length<3)fail('Nach der Bereinigung bleiben zu wenige Flächen übrig.');
 let edges=edgesOf(faces);
 // Own exact collinear T-junction correction: split the existing neighbor.
 // Require three boundary edges, an interior point and exactly zero cross product.
 for(const face of degenerate){if(new Set(face).size!==3)continue;
  const lengths=face.map((v,i)=>Math.hypot(...sub(points[face[(i+1)%3]],points[v]))),j=lengths.indexOf(Math.max(...lengths)),a=face[j],c=face[(j+1)%3],b=face[(j+2)%3],direction=sub(points[c],points[a]),offset=sub(points[b],points[a]);
  if(cross(direction,offset).some(v=>v!==0)||dot(offset,direction)<=0||dot(offset,direction)>=dot(direction,direction))continue;
  if([[a,c],[a,b],[b,c]].some(([x,y])=>edges.get(edgeKey(x,y))?.length!==1))continue;
  const neighbor=edges.get(edgeKey(a,c))[0],old=faces[neighbor.face];if(old.includes(b))continue;
  for(let k=0;k<3;k++){const x=old[k],y=old[(k+1)%3],z=old[(k+2)%3];if(edgeKey(x,y)!==edgeKey(a,c))continue;faces[neighbor.face]=[x,b,z];faces.push([b,y,z]);report.splitNeighborFaces++;edges=edgesOf(faces);break;}
 }
 if([...edges.values()].some(v=>v.length>2))fail('Das Netz enthält weiterhin Kanten mit mehr als zwei angrenzenden Flächen.');
 // Establish consistent winding without moving a point or guessing a new shape.
 function orient(){edges=edgesOf(faces);const neighbors=faces.map(()=>[]);for(const pair of edges.values())if(pair.length===2){const [a,b]=pair,same=a.a===b.a;neighbors[a.face].push([b.face,same]);neighbors[b.face].push([a.face,same]);}
  const flip=new Map();for(let start=0;start<faces.length;start++){if(flip.has(start))continue;flip.set(start,false);const queue=[start];for(let i=0;i<queue.length;i++)for(const [next,same]of neighbors[queue[i]]){const value=flip.get(queue[i])!==same;if(flip.has(next)){if(flip.get(next)!==value)fail('Die Flächenorientierung lässt sich nicht eindeutig reparieren.');}else{flip.set(next,value);queue.push(next);}}
   const origin=points[faces[start][0]];let volume=0;for(const index of queue){const [a,b,c]=faces[index].map(v=>sub(points[v],origin));volume+=dot(a,cross(b,c))*(flip.get(index)?-1:1)/6;}
   if(volume<0)for(const index of queue)flip.set(index,!flip.get(index));
  }
  for(const [index,value]of flip)if(value){[faces[index][1],faces[index][2]]=[faces[index][2],faces[index][1]];report.flippedFaces++;}
 }
 orient();edges=edgesOf(faces);
 if(fillSmallHoles){const boundary=[...edges.values()].filter(v=>v.length===1).map(v=>v[0]),links=new Map();for(const e of boundary){for(const [a,b]of [[e.a,e.b],[e.b,e.a]]){if(!links.has(a))links.set(a,[]);links.get(a).push(b);}}
  const visited=new Set();for(const e of boundary){if(visited.has(edgeKey(e.a,e.b)))continue;const loop=[e.a];let previous=e.a,current=e.b,valid=true;
   while(current!==loop[0]){if(loop.includes(current)||links.get(current)?.length!==2){valid=false;break;}loop.push(current);const next=links.get(current).find(v=>v!==previous);visited.add(edgeKey(previous,current));previous=current;current=next;}
   visited.add(edgeKey(previous,current));if(!valid||links.get(loop[0])?.length!==2||![3,4].includes(loop.length))continue;
   if(loop.length===4){const p=loop.map(v=>points[v]),normal=cross(sub(p[1],p[0]),sub(p[2],p[0])),length=Math.hypot(...normal);if(length<1e-12||Math.abs(dot(normal,sub(p[3],p[0])))/length>1e-9)continue;if(p.some((_,i)=>dot(cross(sub(p[(i+1)%4],p[i]),sub(p[(i+2)%4],p[(i+1)%4])),normal)<=0))continue;}
   const added=loop.length===3?[[loop[0],loop[1],loop[2]]]:[[loop[0],loop[1],loop[2]],[loop[0],loop[2],loop[3]]];
   if(added.some(f=>Math.hypot(...cross(sub(points[f[1]],points[f[0]]),sub(points[f[2]],points[f[0]])))<1e-12))continue;
   faces.push(...added);report.addedFaces+=added.length;
  }
  orient();edges=edgesOf(faces);
 }
 if([...edges.values()].some(v=>v.length!==2))fail('Das Netz besitzt nach der Reparatur noch offene Randkanten.');
 if(faces.length>STL_CAD_LIMITS.triangles)throw stlError('STL_LIMIT','Repariertes Netz überschreitet das CAD-Dreieckslimit.');
 report.changed=Object.entries(report).some(([key,v])=>key!=='coordinatesMoved'&&v>0);
 return {mesh:{verts:points.flat(),triangles:faces.flat()},report};
}
