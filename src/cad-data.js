// Optional CAD metadata stays separate from the editable source geometry.
const meshHashes=new WeakMap();
export function meshHash(mesh){
  if(meshHashes.has(mesh))return meshHashes.get(mesh);
  let a=2166136261,b=2246822519;
  const view=new DataView(new ArrayBuffer(8));
  for(const values of [mesh.verts,mesh.triangles])for(const value of values){
    view.setFloat64(0,value===0?0:value,true);
    for(let i=0;i<8;i++){const byte=view.getUint8(i);a=Math.imul(a^byte,16777619);b=Math.imul(b^byte,3266489917);}
  }
  const hash=[a,b].map(v=>(v>>>0).toString(16).padStart(8,'0')).join('');meshHashes.set(mesh,hash);return hash;
}
export function validCad(cad){
  return cad&&cad.version===1&&typeof cad.brep==='string'&&cad.brep.length>0&&cad.brep.length<=12*1024*1024
    &&Array.isArray(cad.size)&&cad.size.length===3&&cad.size.every(v=>Number.isFinite(v)&&v>=.01&&v<=10000)
    &&/^[0-9a-f]{16}$/.test(cad.meshHash)&&['step','finish'].includes(cad.source);
}
export function validFinish(finish){
  return finish&&Array.isArray(finish.steps)&&finish.steps.length>0&&finish.steps.length<=20&&finish.steps.every(s=>
    ['round','chamfer'].includes(s.kind)&&Number.isFinite(s.amount)&&s.amount>=.01&&s.amount<=1000
    &&Array.isArray(s.edges)&&s.edges.length>0&&s.edges.length<=128&&s.edges.every(e=>
      e&&(e.curveType===undefined||Number.isInteger(e.curveType)&&e.curveType>=0&&e.curveType<=20)
      &&(e.edgeCount===undefined||Number.isInteger(e.edgeCount)&&e.edgeCount>0&&e.edgeCount<=40000)
      &&Array.isArray(e.points)&&e.points.length===5&&e.points.every(p=>Array.isArray(p)&&p.length===3&&p.every(v=>Number.isFinite(v)&&v>=-.001&&v<=1.001))));
}
export function hasFinishing(nodes){return nodes.some(n=>n.edgeFinish||hasFinishing(n.children||[]));}
