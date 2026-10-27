// Synchronous SHA-256 for native geometry correspondence in the browser worker.
// No Node crypto shim, network, mutable native handle or display buffer.
const K=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
const rotate=(x,n)=>(x>>>n)|(x<<(32-n));
export function cadGeometryDigest(text){
 const bytes=new TextEncoder().encode(text),data=new Uint8Array(Math.ceil((bytes.length+9)/64)*64);data.set(bytes);data[bytes.length]=128;const view=new DataView(data.buffer),bits=bytes.length*8;view.setUint32(data.length-8,Math.floor(bits/4294967296));view.setUint32(data.length-4,bits>>>0);
 const h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]),w=new Uint32Array(64);
 for(let offset=0;offset<data.length;offset+=64){for(let i=0;i<16;i++)w[i]=view.getUint32(offset+i*4);for(let i=16;i<64;i++){const x=w[i-15],y=w[i-2];w[i]=(w[i-16]+(rotate(x,7)^rotate(x,18)^(x>>>3))+w[i-7]+(rotate(y,17)^rotate(y,19)^(y>>>10)))>>>0;}let[a,b,c,d,e,f,g,z]=h;for(let i=0;i<64;i++){const t1=(z+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^((~e)&g))+K[i]+w[i])>>>0,t2=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))>>>0;z=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}for(const [i,v]of[a,b,c,d,e,f,g,z].entries())h[i]=(h[i]+v)>>>0;}
 return Array.from(h,v=>v.toString(16).padStart(8,'0')).join('');
}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object'){const out={};for(const key of Object.keys(value).sort())out[key]=canonical(value[key]);return out;}return value===0?0:value;}
/** Geometry-only source identity. Styles and source IDs may change during
 * duplication/library use; native source parameters and topology may not. */
export function cadSourceGeometryDigest(root){
 const ids=new Map();function index(n,path){ids.set(n.id,path);n.children?.forEach((child,i)=>index(child,path+'/'+i));}index(root,'source');
 function model(n){const out={};for(const key of ['kind','source','recipe','transform','solid','suppressed','operation','partition','extraction'])if(n[key]!==undefined)out[key]=n[key];if(n.source==='step')out.brep=n.brep;if(n.finish){out.finish=structuredClone(n.finish);for(const step of out.finish.steps)for(const ref of step.edges){ref.origin.rootId=ids.get(ref.origin.rootId)??ref.origin.rootId;ref.origin.path=ref.origin.path.map(id=>ids.get(id)??id);}}if(n.children)out.children=n.children.map(model);return out;}
 return cadGeometryDigest(JSON.stringify(canonical(model(root))));
}
