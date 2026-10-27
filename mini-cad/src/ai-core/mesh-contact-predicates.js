// Filtered orientation with an exact dyadic fallback. Every finite JavaScript
// number is an integer times a power of two; the fallback therefore decides
// the sign of the stored coordinates without a geometric tolerance.
const buffer=new DataView(new ArrayBuffer(8));
function dyadic(x){buffer.setFloat64(0,x,false);const hi=buffer.getUint32(0),lo=buffer.getUint32(4),e=(hi>>>20)&2047,m=(BigInt(hi&0xfffff)<<32n)|BigInt(lo),n=(e?m+(1n<<52n):m)*(hi>>>31?-1n:1n);return [n,e?e-1075:-1074];}
function minus(a,b){const e=Math.min(a[1],b[1]);return [(a[0]<<BigInt(a[1]-e))-(b[0]<<BigInt(b[1]-e)),e];}
const times=(a,b)=>[a[0]*b[0],a[1]+b[1]];
export function projectedOrientation(a,b,c,i,j){const x=(b[i]-a[i])*(c[j]-a[j]),y=(b[j]-a[j])*(c[i]-a[i]),d=x-y,error=(Math.abs(x)+Math.abs(y))*Number.EPSILON*4;if(Math.abs(d)>error)return Math.sign(d);const u=times(minus(dyadic(b[i]),dyadic(a[i])),minus(dyadic(c[j]),dyadic(a[j]))),v=times(minus(dyadic(b[j]),dyadic(a[j])),minus(dyadic(c[i]),dyadic(a[i]))),n=minus(u,v)[0];return n<0n?-1:n>0n?1:0;}
const same=(a,b)=>a.every((x,k)=>x===b[k]);
export function sharedSimplexSeparates(a,b,shared){
 if(shared.length===2){const [p,q]=shared,u=a.find(v=>!shared.some(s=>same(v,s))),v=b.find(v=>!shared.some(s=>same(v,s)));if(u&&v)for(const [i,j] of [[0,1],[0,2],[1,2]])if(projectedOrientation(p,q,u,i,j)*projectedOrientation(p,q,v,i,j)===-1)return true;}
 if(shared.length===1){const p=shared[0],aa=a.filter(v=>!same(v,p)),bb=b.filter(v=>!same(v,p));for(const q of [...aa,...bb])for(const [i,j] of [[0,1],[0,2],[1,2]]){const sa=aa.map(v=>projectedOrientation(p,q,v,i,j)),sb=bb.map(v=>projectedOrientation(p,q,v,i,j));if(!sa.some(v=>v)||!sb.some(v=>v))continue;if(!(sa.every(v=>v>=0)&&sb.every(v=>v<=0)||sa.every(v=>v<=0)&&sb.every(v=>v>=0)))continue;const za=aa.filter((v,k)=>sa[k]===0),zb=bb.filter((v,k)=>sb[k]===0);if(!za.length||!zb.length)return true;const axis=Math.abs(q[i]-p[i])>=Math.abs(q[j]-p[j])?i:j;if(za.every(u=>zb.every(v=>Math.sign(u[axis]-p[axis])*Math.sign(v[axis]-p[axis])===-1)))return true;}}
 return false;
}
