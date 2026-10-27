// Private, generation-local display transport. These buffers never establish
// CAD geometry or enter project state, Undo, precision queries or exports.
const snapshots=new WeakSet();
export const isCadDisplaySnapshot=value=>!!value&&snapshots.has(value);
export function cadDisplaySnapshot(value){
  if(isCadDisplaySnapshot(value))return value;
  const result={};for(const field of ['vertices','normals','triangles','faceGroups']){if(!Array.isArray(value?.[field]))throw Error('Ungültige CAD-Anzeigepuffer.');result[field]=Array.from(value[field]);}
  const {vertices,normals,triangles,faceGroups}=result;
  if(!vertices.length||vertices.length%3||vertices.length>3000000||normals.length!==vertices.length||vertices.some(v=>typeof v!=='number'||!Number.isFinite(Math.fround(v)))||normals.some(v=>typeof v!=='number'||!Number.isFinite(Math.fround(v)))||!triangles.length||triangles.length%3||triangles.length>6000000||triangles.some(v=>!Number.isSafeInteger(v)||v<0||v>=vertices.length/3)||!faceGroups.length||faceGroups.length%3||faceGroups.length>120000)throw Error('Ungültige CAD-Anzeigepuffer.');
  let offset=0;for(let i=0;i<faceGroups.length;i+=3){if(!faceGroups.slice(i,i+3).every(Number.isSafeInteger)||faceGroups[i]!==offset||faceGroups[i+1]<=0||faceGroups[i+1]%3||faceGroups[i+2]<=0)throw Error('Ungültige CAD-Anzeigeflächen.');offset+=faceGroups[i+1];}if(offset!==triangles.length)throw Error('Unvollständige CAD-Anzeigeflächen.');
  for(const values of Object.values(result))Object.freeze(values);Object.freeze(result);snapshots.add(result);return result;
}
export function createCadDisplayEncoder(){
  const tokens=new WeakMap();let serial=0;
  return (mesh,known)=>{
    if(!known)return {mesh:structuredClone(mesh)};
    let token=tokens.get(mesh);if(!token){token='cad-mesh-'+(++serial);tokens.set(mesh,token);}
    if(known.has(token))return {meshToken:token};
    const copy=structuredClone(mesh);known.add(token);
    // The caller's set belongs to one response. Later instances in that same
    // response can refer to this first payload, including oversized meshes.
    return {meshToken:token,mesh:copy};
  };
}
export function createCadDisplayDecoder({maxEntries=128,maxBytes=64*1024*1024}={}){
  if(!Number.isSafeInteger(maxEntries)||maxEntries<1||!Number.isSafeInteger(maxBytes)||maxBytes<1)throw Error('Ungültige CAD-Anzeigecachegrenze.');
  const cache=new Map();let bytes=0,hits=0,misses=0;
  function remember(token,mesh){const cost=token.length*2+Object.values(mesh).reduce((n,a)=>n+a.length*8,0);if(cost>maxBytes)return;const old=cache.get(token);if(old){bytes-=old.bytes;cache.delete(token);}while(cache.size&&(cache.size>=maxEntries||bytes+cost>maxBytes)){const key=cache.keys().next().value;bytes-=cache.get(key).bytes;cache.delete(key);}cache.set(token,{mesh,bytes:cost});bytes+=cost;}
  return {
    capture:()=>new Map([...cache].map(([key,value])=>[key,value.mesh])),
    decode(result,sent=new Map()){
      if(!Array.isArray(result))return result;
      const current=new Map();
      return result.map(record=>{
        if(record.kind!=='cad'||record.meshToken===undefined)return record;
        const {meshToken:token,...out}=record;if(typeof token!=='string'||!/^cad-mesh-[1-9]\d{0,15}$/.test(token))throw Error('Ungültiger CAD-Anzeigeverweis.');
        let mesh;if(record.mesh){misses++;mesh=cadDisplaySnapshot(record.mesh);}else{hits++;mesh=current.get(token)??cache.get(token)?.mesh??sent.get(token);if(!mesh)throw Error('Der CAD-Anzeigeverweis ist nicht mehr vorhanden. Ansicht erneut laden.');}
        current.set(token,mesh);remember(token,mesh);out.mesh=mesh;return out;
      });
    },
    clear(){cache.clear();bytes=0;hits=misses=0;},
    state:()=>({entries:cache.size,bytes,maxEntries,maxBytes,hits,misses})
  };
}
