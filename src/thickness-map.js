import {cadPoint,inverseCadMatrix} from './cad-affine.js';
// Bounded, transient normal-ray measurements on an explicitly tessellated
// surface. No smoothing/interpolation asserts values for unsampled triangles.
export const THICKNESS_LIMITS=Object.freeze({triangles:200000,vertices:600000,samples:12000,milliseconds:20000});

export function thicknessWorldInput(mesh,transform){
  const raw=mesh.vertices??mesh.verts;if(raw.length/3>THICKNESS_LIMITS.vertices||mesh.triangles.length/3>THICKNESS_LIMITS.triangles)throw Error('Wanddickenkarte: maximal 200.000 Dreiecke. Anzeigequalität reduzieren.');
  const vertices=[];for(let i=0;i<raw.length;i+=3)vertices.push(...cadPoint(transform,raw.slice(i,i+3)));
  const triangles=[...mesh.triangles],m=transform,det=m[0]*(m[5]*m[10]-m[9]*m[6])-m[4]*(m[1]*m[10]-m[9]*m[2])+m[8]*(m[1]*m[6]-m[5]*m[2]);
  if(det<0)for(let i=0;i<triangles.length;i+=3)[triangles[i+1],triangles[i+2]]=[triangles[i+2],triangles[i+1]];
  let normals;
  if(mesh.normals){const inverse=inverseCadMatrix(transform);normals=[];for(let i=0;i<mesh.normals.length;i+=3){const n=mesh.normals.slice(i,i+3),v=[0,1,2].map(k=>inverse[k*4]*n[0]+inverse[k*4+1]*n[1]+inverse[k*4+2]*n[2]),length=Math.hypot(...v);normals.push(...v.map(x=>length?x/length:0));}}
  return {vertices,triangles,...(normals?{normals}:{})};
}

const sub=(a,b)=>a.map((v,k)=>v-b[k]),dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function thicknessMap({vertices,triangles,normals:surfaceNormals,maxSamples=6000},progress=()=>{}){
  const started=performance.now(),n=triangles?.length/3;
  if(surfaceNormals&&(!Array.isArray(surfaceNormals)||surfaceNormals.length!==vertices?.length||surfaceNormals.some(v=>!Number.isFinite(v))))throw Error('Ungültige CAD-Flächennormalen.');
  if(!Array.isArray(vertices)||!Array.isArray(triangles)||!n||!Number.isInteger(n)||n>THICKNESS_LIMITS.triangles||vertices.length%3||vertices.length/3>THICKNESS_LIMITS.vertices||vertices.some(v=>!Number.isFinite(v))||triangles.some(i=>!Number.isSafeInteger(i)||i<0||i>=vertices.length/3)||!Number.isSafeInteger(maxSamples)||maxSamples<1||maxSamples>THICKNESS_LIMITS.samples)throw Error('Wanddickenkarte: maximal 200.000 Dreiecke und 12.000 Stichproben.');
  const point=i=>vertices.slice(i*3,i*3+3),min=[Infinity,Infinity,Infinity],max=min.map(v=>-v);
  for(let i=0;i<vertices.length;i++) {const k=i%3;min[k]=Math.min(min[k],vertices[i]);max[k]=Math.max(max[k],vertices[i]);}
  const diagonal=Math.hypot(...sub(max,min)),epsilon=Math.max(1e-7,diagonal*1e-9),centers=new Float64Array(n*3),lo=new Float64Array(n*3),hi=new Float64Array(n*3),normals=new Float64Array(n*3);
  function budget(){if(performance.now()-started>THICKNESS_LIMITS.milliseconds)throw Error('Zeitgrenze der Wanddickenkarte erreicht. Weniger Stichproben oder eine gröbere Auflösung wählen.');}
  for(let i=0;i<n;i++){
    const a=point(triangles[i*3]),b=point(triangles[i*3+1]),c=point(triangles[i*3+2]),normal=cross(sub(b,a),sub(c,a)),length=Math.hypot(...normal);
    for(let k=0;k<3;k++){centers[i*3+k]=(a[k]+b[k]+c[k])/3;lo[i*3+k]=Math.min(a[k],b[k],c[k]);hi[i*3+k]=Math.max(a[k],b[k],c[k]);normals[i*3+k]=length?normal[k]/length:0;}
  }
  function build(ids){
    budget();const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(const i of ids)for(let k=0;k<3;k++){min[k]=Math.min(min[k],lo[i*3+k]);max[k]=Math.max(max[k],hi[i*3+k]);}
    if(ids.length<=12)return {min,max,ids};
    const size=sub(max,min),axis=size.indexOf(Math.max(...size));ids.sort((a,b)=>centers[a*3+axis]-centers[b*3+axis]);const mid=ids.length>>1;
    return {min,max,left:build(ids.slice(0,mid)),right:build(ids.slice(mid))};
  }
  const tree=build(Array.from({length:n},(_,i)=>i));
  function box(node,o,d){let low=epsilon*4,high=diagonal*2;for(let k=0;k<3;k++){if(Math.abs(d[k])<1e-15){if(o[k]<node.min[k]-epsilon||o[k]>node.max[k]+epsilon)return false;}else{const a=(node.min[k]-epsilon-o[k])/d[k],b=(node.max[k]+epsilon-o[k])/d[k];low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));if(low>high)return false;}}return true;}
  function hits(o,d,source){
    const result=[],stack=[tree];
    while(stack.length){const node=stack.pop();if(!box(node,o,d))continue;if(node.left){stack.push(node.left,node.right);continue;}
      for(const i of node.ids){if(i===source)continue;const a=point(triangles[i*3]),b=point(triangles[i*3+1]),c=point(triangles[i*3+2]),e1=sub(b,a),e2=sub(c,a),p=cross(d,e2),det=dot(e1,p);
        if(Math.abs(det)<1e-12*Math.hypot(...e1)*Math.hypot(...e2))continue;
        const tvec=sub(o,a),u=dot(tvec,p)/det,q=cross(tvec,e1),v=dot(d,q)/det,t=dot(e2,q)/det;
        if(t<=epsilon*4||u< -1e-9||v< -1e-9||u+v>1+1e-9)continue;
        const normal=Array.from(normals.subarray(i*3,i*3+3));
        result.push({t,normal,boundary:u<1e-9||v<1e-9||u+v>1-1e-9,orientation:dot(d,normal)});
        if(result.length>512)return null;
      }
    }
    result.sort((a,b)=>a.t-b.t);
    // Edge/vertex intersections, coincident sheets and tangent exits cannot
    // establish a unique continuous material interval.
    const unique=[];
    for(let i=0;i<result.length;){const first=result[i],cluster=[first];let j=i+1;while(j<result.length&&result[j].t-first.t<epsilon*4)cluster.push(result[j++]);
      if(Math.abs(first.orientation)<1e-8)return null;
      if(cluster.length===1&&first.boundary)return null;
      // Shared planar triangulation edges are one crossing. Interior duplicate
      // sheets, folds and non-coplanar vertex hits remain unresolved.
      if(cluster.length>1&&(!cluster.every(h=>h.boundary)||cluster.some(h=>Math.hypot(...sub(h.normal,first.normal))>1e-8)))return null;
      unique.push(first);i=j;
    }
    return unique;
  }
  const values=new Float32Array(n);values.fill(NaN);let sampled=0,measured=0,minimum=Infinity,maximum=0;
  const count=Math.min(n,maxSamples);
  for(let j=0;j<count;j++){
    if(j%64===0){budget();progress(j/count);}
    const i=Math.floor((j+.5)*n/count),o=Array.from(centers.subarray(i*3,i*3+3)),normal=surfaceNormals?[0,1,2].map(k=>(surfaceNormals[triangles[i*3]*3+k]+surfaceNormals[triangles[i*3+1]*3+k]+surfaceNormals[triangles[i*3+2]*3+k])/3):Array.from(normals.subarray(i*3,i*3+3));sampled++;
    const length=Math.hypot(...normal);if(length>0)for(let k=0;k<3;k++)normal[k]/=length;
    if(Math.hypot(...normal)<.99||dot(normal,Array.from(normals.subarray(i*3,i*3+3)))<=1e-6)continue;
    const inward=hits(o,normal.map(v=>-v),i),outward=hits(o,normal,i);
    if(!inward?.length||!outward||inward.length%2!==1||outward.length%2!==0)continue;
    if(inward.some((h,k)=>k%2===0?h.orientation<=1e-8:h.orientation>=-1e-8)||outward.some((h,k)=>k%2===0?h.orientation>=-1e-8:h.orientation<=1e-8))continue;
    const value=inward[0].t;if(!Number.isFinite(value)||value<=epsilon*8)continue;
    values[i]=value;measured++;minimum=Math.min(minimum,value);maximum=Math.max(maximum,value);
  }
  progress(1);return {values,sampled,measured,triangles:n,minimum:measured?minimum:null,maximum:measured?maximum:null,milliseconds:performance.now()-started,method:'triangle-centroid-inward-normal',complete:false};
}

export function thicknessColor(value,low,high){
  if(!Number.isFinite(low)||!Number.isFinite(high)||low<0||high<=low)throw Error('Obere Farbgrenze muss größer als die untere sein.');
  if(!Number.isFinite(value))return [.46,.49,.53];
  const t=Math.max(0,Math.min(1,(value-low)/(high-low))),stops=[[.9,.08,.03],[1,.65,.03],[.08,.7,.25],[.03,.25,.95]],x=t*3,k=Math.min(2,Math.floor(x)),f=x-k;
  return stops[k].map((v,i)=>v*(1-f)+stops[k+1][i]*f);
}
