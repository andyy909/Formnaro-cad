export const DEVIATION_LIMITS=Object.freeze({triangles:200000,vertices:600000,samples:12000,milliseconds:20000});
const sub=(a,b)=>a.map((v,k)=>v-b[k]),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),add=(a,b,t=1)=>a.map((v,k)=>v+t*b[k]),square=(a,b)=>a.reduce((s,v,k)=>s+(v-b[k])**2,0);
function segmentPoint(p,a,b){const d=sub(b,a),length=dot(d,d),t=length?Math.max(0,Math.min(1,dot(sub(p,a),d)/length)):0;return add(a,d,t);}
export function closestTrianglePoint(p,a,b,c){
 const ab=sub(b,a),ac=sub(c,a),cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
 if(dot(cross,cross)===0)return [segmentPoint(p,a,b),segmentPoint(p,b,c),segmentPoint(p,c,a)].sort((a,b)=>square(p,a)-square(p,b))[0];
 const ap=sub(p,a),d1=dot(ab,ap),d2=dot(ac,ap);if(d1<=0&&d2<=0)return a;
 const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);if(d3>=0&&d4<=d3)return b;
 const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0)return add(a,ab,d1/(d1-d3));
 const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);if(d6>=0&&d5<=d6)return c;
 const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0)return add(a,ac,d2/(d2-d6));
 const va=d3*d6-d5*d4;if(va<=0&&d4-d3>=0&&d5-d6>=0)return add(b,sub(c,b),(d4-d3)/(d4-d3+d5-d6));
 const denominator=va+vb+vc;return add(add(a,ab,vb/denominator),ac,vc/denominator);
}
function triangleDistanceSquared(p,v,t,index){
 const ia=t[index*3]*3,ib=t[index*3+1]*3,ic=t[index*3+2]*3,ax=v[ia],ay=v[ia+1],az=v[ia+2],bx=v[ib],by=v[ib+1],bz=v[ib+2],cx=v[ic],cy=v[ic+1],cz=v[ic+2],ux=bx-ax,uy=by-ay,uz=bz-az,wx=cx-ax,wy=cy-ay,wz=cz-az,px=p[0],py=p[1],pz=p[2],nx=uy*wz-uz*wy,ny=uz*wx-ux*wz,nz=ux*wy-uy*wx;
 const sq=(x,y,z)=>(px-x)**2+(py-y)**2+(pz-z)**2;
 if(nx*nx+ny*ny+nz*nz===0){const edge=(x,y,z,X,Y,Z)=>{const dx=X-x,dy=Y-y,dz=Z-z,d=dx*dx+dy*dy+dz*dz,r=d?Math.max(0,Math.min(1,((px-x)*dx+(py-y)*dy+(pz-z)*dz)/d)):0;return sq(x+r*dx,y+r*dy,z+r*dz);};return Math.min(edge(ax,ay,az,bx,by,bz),edge(bx,by,bz,cx,cy,cz),edge(cx,cy,cz,ax,ay,az));}
 const apx=px-ax,apy=py-ay,apz=pz-az,d1=ux*apx+uy*apy+uz*apz,d2=wx*apx+wy*apy+wz*apz;if(d1<=0&&d2<=0)return sq(ax,ay,az);
 const bpx=px-bx,bpy=py-by,bpz=pz-bz,d3=ux*bpx+uy*bpy+uz*bpz,d4=wx*bpx+wy*bpy+wz*bpz;if(d3>=0&&d4<=d3)return sq(bx,by,bz);
 const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0){const r=d1/(d1-d3);return sq(ax+r*ux,ay+r*uy,az+r*uz);}
 const cpx=px-cx,cpy=py-cy,cpz=pz-cz,d5=ux*cpx+uy*cpy+uz*cpz,d6=wx*cpx+wy*cpy+wz*cpz;if(d6>=0&&d5<=d6)return sq(cx,cy,cz);
 const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0){const r=d2/(d2-d6);return sq(ax+r*wx,ay+r*wy,az+r*wz);}
 const va=d3*d6-d5*d4;if(va<=0&&d4-d3>=0&&d5-d6>=0){const r=(d4-d3)/(d4-d3+d5-d6);return sq(bx+r*(cx-bx),by+r*(cy-by),bz+r*(cz-bz));}
 const inverse=1/(va+vb+vc),r=vb*inverse,q=vc*inverse;return sq(ax+r*ux+q*wx,ay+r*uy+q*wy,az+r*uz+q*wz);
}
function input(mesh){const {vertices,triangles}=mesh??{},n=triangles?.length/3;if(!Array.isArray(vertices)||!Array.isArray(triangles)||!Number.isInteger(n)||n<1||n>DEVIATION_LIMITS.triangles||vertices.length%3||vertices.length/3>DEVIATION_LIMITS.vertices||vertices.some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1e7)||triangles.some(i=>!Number.isSafeInteger(i)||i<0||i>=vertices.length/3))throw Error('Modellvergleich: endliche Oberflächen mit je höchstens 200.000 Dreiecken wählen.');return n;}
export function createDistanceTree(mesh,{budget=()=>{}}={}){
 const count=input(mesh),{vertices,triangles}=mesh,lo=new Float64Array(count*3),hi=new Float64Array(count*3),centers=new Float64Array(count*3),point=i=>vertices.slice(i*3,i*3+3),points=i=>triangles.slice(i*3,i*3+3).map(point);
 for(let i=0;i<count;i++){if(!(i%1024))budget();const p=points(i);for(let k=0;k<3;k++){lo[i*3+k]=Math.min(...p.map(p=>p[k]));hi[i*3+k]=Math.max(...p.map(p=>p[k]));centers[i*3+k]=p.reduce((s,p)=>s+p[k],0)/3;}}
 function build(ids){budget();const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const i of ids)for(let k=0;k<3;k++){min[k]=Math.min(min[k],lo[i*3+k]);max[k]=Math.max(max[k],hi[i*3+k]);}if(ids.length<=10)return {min,max,ids};const size=sub(max,min),axis=size.indexOf(Math.max(...size));ids.sort((a,b)=>centers[a*3+axis]-centers[b*3+axis]);const middle=ids.length>>1;return {min,max,left:build(ids.slice(0,middle)),right:build(ids.slice(middle))};}
 const root=build(Array.from({length:count},(_,i)=>i)),boxDistance=(p,b)=>p.reduce((s,v,k)=>s+Math.max(b.min[k]-v,0,v-b.max[k])**2,0);
 function nearest(p){let best=Infinity,triangleId=-1,visits=0;const stack=[root];while(stack.length){if(!(++visits%256))budget();const node=stack.pop();if(boxDistance(p,node)>best)continue;if(node.left){const left=boxDistance(p,node.left),right=boxDistance(p,node.right);if(left<right)stack.push(node.right,node.left);else stack.push(node.left,node.right);continue;}for(const i of node.ids){const d=triangleDistanceSquared(p,vertices,triangles,i);if(d<best){best=d;triangleId=i;}}}return {distance:Math.sqrt(best),point:triangleId>=0?closestTrianglePoint(p,...points(triangleId)):null,triangleId};}
 return {nearest};
}
export function compareModelSurfaces({left,right,maxSamples=6000,bidirectional=true}={},progress=()=>{}){
 const started=performance.now(),budget=()=>{if(performance.now()-started>DEVIATION_LIMITS.milliseconds)throw Error('Zeitgrenze des Modellvergleichs erreicht. Weniger Stichproben oder gröbere CAD-Oberflächen wählen.');};
 input(left);input(right);if(!Number.isSafeInteger(maxSamples)||maxSamples<1||maxSamples>DEVIATION_LIMITS.samples||typeof bidirectional!=='boolean')throw Error('Modellvergleich: 1–12.000 Dreiecksstichproben je Richtung.');
 const directions=[];
 function directed(source,target,label,from,to){const tree=createDistanceTree(target,{budget}),count=source.triangles.length/3,samples=Math.min(count,maxSamples),values=new Float32Array(count).fill(NaN);let sampledMaximum=0,sampledMinimum=Infinity,sum=0,sumSquared=0,samplePoints=0;
  const worst=[];
  for(let j=0;j<samples;j++){if(!(j%32)){budget();progress(from+(to-from)*j/samples);}const id=Math.floor((j+.5)*count/samples),p=source.triangles.slice(id*3,id*3+3).map(i=>source.vertices.slice(i*3,i*3+3)),center=[0,1,2].map(k=>(p[0][k]+p[1][k]+p[2][k])/3);let max=0,worstPoint=null;
   for(const q of [center,...p]){const hit=tree.nearest(q),d=hit.distance;if(!Number.isFinite(d))throw Error('Abstand konnte nicht bestimmt werden.');if(d>=max){max=d;worstPoint={sourcePoint:q,targetPoint:hit.point,distance:d,sourceTriangle:id,targetTriangle:hit.triangleId};}sampledMaximum=Math.max(sampledMaximum,d);sampledMinimum=Math.min(sampledMinimum,d);sum+=d;sumSquared+=d*d;samplePoints++;}values[id]=max;
   if(worst.length<8||max>worst.at(-1).distance){worst.push(worstPoint);worst.sort((a,b)=>b.distance-a.distance);if(worst.length>8)worst.pop();}
  }
  return {direction:label,triangles:count,sampledTriangles:samples,samplePoints,unmeasuredTriangles:count-samples,sampledMaximum,sampledMinimum,mean:sum/samplePoints,rms:Math.sqrt(sumSquared/samplePoints),worst,values};
 }
 directions.push(directed(left,right,'left-to-right',0,bidirectional ? .5 : 1));if(bidirectional)directions.push(directed(right,left,'right-to-left',.5,1));budget();progress(1);
 return {version:1,units:'mm',directions,sampledMaximum:Math.max(...directions.map(d=>d.sampledMaximum)),milliseconds:performance.now()-started,readOnly:true,sampling:'Deterministische, gleichmäßig nach Dreiecksindex verteilte Auswahl; je Dreieck Schwerpunkt und drei Ecken. Keine Flächengewichtung oder Interpolation.',limitations:'Ungerichtete kürzeste Abstände zur jeweiligen Dreiecksoberfläche. Gemessene Stichproben sind kein garantierter globaler Maximalfehler. Nicht geprüfte Dreiecke bleiben unbekannt; CAD-Oberflächen sind entsprechend der angezeigten Vernetzungsqualität angenähert.'};
}
