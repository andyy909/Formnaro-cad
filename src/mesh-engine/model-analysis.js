import {worldManifold,meshData} from './geometry.js';
export function inspectModel(nodes,{threshold=1,quality=1500,progress=()=>{}}={}){
  if(![1500,6000].includes(quality)||!Number.isFinite(threshold)||threshold<=0||threshold>100)throw Error('Ungültige Prüfqualität oder Mindestwand.');
  const results={collisions:[],thin:[],parts:[],samples:0,triangles:0,threshold,quality},solids=[];
  try{
    for(const node of nodes)solids.push(worldManifold(node));
    for(let i=0;i<solids.length;i++){
      const m=solids[i],mesh=meshData(m),box=m.boundingBox();results.triangles+=m.numTri();
      for(let j=i+1;j<solids.length;j++){
        const other=solids[j].boundingBox();if(box.max.some((v,k)=>v<=other.min[k]||box.min[k]>=other.max[k]))continue;
        const intersection=m.intersect(solids[j]);try{const volume=intersection.volume();if(volume>1e-5)results.collisions.push({a:nodes[i].name,b:nodes[j].name,aId:nodes[i].id,bId:nodes[j].id,volume});}finally{intersection.delete();}
      }
      const count=mesh.triangles.length/3,limit=Math.min(count,quality),reach=Math.hypot(...box.max.map((v,k)=>v-box.min[k]))+1;
      let minimum=Infinity,samples=0,minimumPoint=null;const measurements=[];
      for(let sample=0;sample<limit;sample++){
        const t=Math.floor(sample*count/limit),v=[0,1,2].map(k=>mesh.verts.slice(mesh.triangles[t*3+k]*3,mesh.triangles[t*3+k]*3+3)),ab=v[1].map((n,k)=>n-v[0][k]),ac=v[2].map((n,k)=>n-v[0][k]),normal=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],len=Math.hypot(...normal);
        if(len<1e-10)continue;
        const center=[0,1,2].map(k=>(v[0][k]+v[1][k]+v[2][k])/3),origin=center.map((n,k)=>n-normal[k]/len*1e-5),end=center.map((n,k)=>n-normal[k]/len*reach),hits=m.rayCast(origin,end);samples++;
        let nearest=null,distance=Infinity;for(const hit of hits){const d=Math.hypot(...hit.position.map((n,k)=>n-center[k]));if(d>1e-4&&d<distance){distance=d;nearest=hit.position;}}
        if(nearest){const point={from:center,to:Array.from(nearest),distance,triangle:t};if(distance<minimum){minimum=distance;minimumPoint=point;}if(distance<threshold){measurements.push(point);measurements.sort((a,b)=>a.distance-b.distance);if(measurements.length>20)measurements.pop();}}
      }
      const part={id:nodes[i].id,name:nodes[i].name,samples,triangles:count,minimum:Number.isFinite(minimum)?minimum:null,minimumPoint,measurements};results.parts.push(part);results.samples+=samples;
      if(minimum<threshold)results.thin.push(part);progress((i+1)/solids.length);
    }
    return results;
  }finally{solids.forEach(m=>m.delete());}
}
