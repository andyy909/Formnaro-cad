export function validateStlReconstructionBytes(bytes){
  const fail=(code,message)=>{const error=Error(message);error.code=code;throw error;};
  if(!(bytes instanceof Uint8Array)||!bytes.length)fail('STL_INVALID','STL-Datei ist leer oder ungültig.');
  if(bytes.byteLength>50*1024*1024)fail('STL_LIMIT','STL-Datei überschreitet das Importlimit von 50 MB.');
  if(bytes.byteLength>=84){const count=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(80,true);if(84+count*50===bytes.byteLength){if(count>40000)fail('STL_LIMIT','CAD-Rekonstruktion unterstützt höchstens 40.000 STL-Dreiecke.');return {format:'binary',triangles:count};}}
  let source;try{source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('STL_INVALID','STL-Datei besitzt keinen gültigen Binär- oder Textaufbau.');}
  if(!/^\s*solid\b/i.test(source)||!/\bendsolid\b/i.test(source))fail('STL_INVALID','Keine unterstützte STL-Datei.');
  let count=0;for(const match of source.matchAll(/\bfacet\s+normal\b/gi)){void match;if(++count>40000)fail('STL_LIMIT','CAD-Rekonstruktion unterstützt höchstens 40.000 STL-Dreiecke.');}
  if(!count)fail('STL_INVALID','STL-Datei enthält keine Dreiecke.');return {format:'ascii',triangles:count};
}
// Three's STLLoader stores positions as float32, including ASCII doubles.
// CAD reconstruction must measure the original file coordinates instead.
export function readStlReconstructionMesh(bytes){
  const info=validateStlReconstructionBytes(bytes),verts=[],triangles=[];
  const fail=message=>{const error=Error(message);error.code='STL_INVALID';throw error;};
  if(info.format==='binary'){
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);for(let face=0;face<info.triangles;face++)for(let vertex=0;vertex<3;vertex++)for(let axis=0;axis<3;axis++)verts.push(view.getFloat32(84+face*50+12+vertex*12+axis*4,true));
  }else{
    const source=new TextDecoder().decode(bytes),number='[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?',vertex=new RegExp('^\\s*vertex\\s+('+number+')\\s+('+number+')\\s+('+number+')\\s*$','i');
    let count=0;for(const match of source.matchAll(/facet\s+normal[^\r\n]*[\r\n]+\s*outer\s+loop\s*[\r\n]+([\s\S]*?)\bendloop\s+endfacet\b/gi)){
      const rows=match[1].split(/\r?\n/).filter(row=>row.trim());if(rows.length!==3)fail('Ein STL-Facet benötigt genau drei Vertices.');
      for(const row of rows){const values=row.match(vertex);if(!values)fail('STL enthält eine ungültige Vertex-Zeile.');verts.push(...values.slice(1).map(Number));}count++;
    }
    if(count!==info.triangles)fail('STL-Facets sind unvollständig oder ungültig.');
  }
  if(verts.some(v=>!Number.isFinite(v)))fail('STL enthält nicht endliche Koordinaten.');for(let i=0;i<verts.length/3;i++)triangles.push(i);return {verts,triangles};
}
