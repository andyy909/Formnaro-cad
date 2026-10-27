// Offline exchange DTOs. Coordinates are world-space millimetres, Z up.
// Shared byte-for-byte with Formnaro Netz; no CAD or Manifold dependency.
import {unzipSync,strFromU8} from 'fflate';
import {Matrix4,Vector3,Quaternion,Color} from 'three';

export const EXCHANGE_LIMITS=Object.freeze({fileBytes:50*1024*1024,expandedBytes:128*1024*1024,entries:2000,parts:500,vertices:1500000,triangles:2000000,depth:64});
const fail=message=>{throw Error(message);};
const integer=(v,min,max,label)=>{if(!Number.isSafeInteger(v)||v<min||v>max)fail('Ungültig oder zu groß: '+label);return v;};
const finite=v=>{if(!Number.isFinite(v)||Math.abs(v)>1e8)fail('Ungültige oder zu große Modellkoordinaten.');return v;};
const arr=(a,n,label)=>{if(!Array.isArray(a)||a.length!==n||a.some(v=>!Number.isFinite(v)))fail('Ungültig: '+label);return a;};
const safeName=(name,fallback)=>String(name||fallback).replace(/[\x00-\x1f]/g,' ').slice(0,200);
function pathName(value,base=''){
 if(typeof value!=='string'||/[\\\x00-\x1f?#]/.test(value)||/^[a-z][a-z\d+.-]*:/i.test(value))fail('Externe oder ungültige Dateiverknüpfung.');
 try{value=decodeURIComponent(value);}catch{fail('Ungültiger Dateipfad.');}
 const pieces=(value.startsWith('/')?value:base+value).split('/'),out=[];
 for(const p of pieces){if(p==='..'){if(!out.length)fail('Dateipfad außerhalb des Pakets.');out.pop();}else if(p&&p!=='.')out.push(p);}
 if(!out.length||out.some(p=>/[\\:\x00-\x1f]/.test(p)))fail('Ungültiger Dateipfad.');return out.join('/');
}
const dir=path=>path.slice(0,path.lastIndexOf('/')+1);
function collector(){
 const parts=[],warnings=new Set();let vertices=0,triangles=0;
 return {parts,warnings,add(part,matrix){
  if(parts.length>=EXCHANGE_LIMITS.parts)fail('Import unterstützt maximal 500 Teile.');
  const v=part.mesh.verts,t=part.mesh.triangles;
  if(!v.length||v.length%3||!t.length||t.length%3)fail('Leeres oder ungültiges Dreiecksnetz.');
  vertices+=v.length/3;triangles+=t.length/3;
  if(vertices>EXCHANGE_LIMITS.vertices||triangles>EXCHANGE_LIMITS.triangles)fail('Import überschreitet die Netzgröße.');
  const result=[];for(let i=0;i<v.length;i+=3)result.push(...new Vector3(...v.slice(i,i+3)).applyMatrix4(matrix).toArray().map(finite));
  const indices=t.map(i=>integer(i,0,v.length/3-1,'Dreiecksindex'));
  if(!Number.isFinite(matrix.determinant())||Math.abs(matrix.determinant())<1e-18)fail('Entartete Modelltransformation.');
  if(matrix.determinant()<0)for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
  parts.push({...part,name:safeName(part.name,'Teil '+(parts.length+1)),mesh:{verts:result,triangles:indices}});
 },result(){if(!parts.length)fail('Die Datei enthält keine sichtbaren Dreiecksobjekte.');return {parts,warnings:[...warnings]};}};
}
const elements=(node,name)=>Array.from(node?.childNodes??[]).filter(n=>n.nodeType===1&&(!name||n.localName===name));
const child=(node,name)=>elements(node,name)[0];
function xmlDocument(bytes){
 const text=strFromU8(bytes);if(/<!DOCTYPE|<!ENTITY/i.test(text))fail('XML mit Dokumenttyp oder Entitäten wird nicht unterstützt.');
 let document;try{document=new DOMParser().parseFromString(text,'application/xml');}catch{fail('Beschädigtes XML im 3MF-Paket.');}
 if(!document?.documentElement||document.getElementsByTagName('parsererror').length)fail('Beschädigtes XML im 3MF-Paket.');return document.documentElement;
}
const attrNum=(node,name)=>{const s=node.getAttribute(name);if(s===null||s==='')fail('Fehlende 3MF-Angabe: '+name);return finite(Number(s));};
const attrId=(node,name)=>integer(attrNum(node,name),1,2147483647,name);
const optional=(node,name,fallback)=>node.hasAttribute(name)?attrNum(node,name):fallback;
function transform3mf(node){
 const text=node.getAttribute('transform');if(!text)return new Matrix4();const v=text.trim().split(/\s+/).map(Number);arr(v,12,'3MF-Transformation');
 return new Matrix4().set(v[0],v[3],v[6],v[9],v[1],v[4],v[7],v[10],v[2],v[5],v[8],v[11],0,0,0,1);
}
function rgba(value){if(!/^#[\da-f]{6}([\da-f]{2})?$/i.test(value??''))fail('Ungültige 3MF-Objektfarbe.');return {color:value.slice(0,7).toLowerCase(),opacity:value.length===9?parseInt(value.slice(7),16)/255:1};}

export function parseThreeMF(input){
 const bytes=new Uint8Array(input);if(bytes.length>EXCHANGE_LIMITS.fileBytes)fail('3MF-Datei ist größer als 50 MB.');
 let expanded=0,entries=0;const seen=new Set();
 const archive=unzipSync(bytes,{filter:entry=>{integer(entry.originalSize,0,EXCHANGE_LIMITS.expandedBytes,'3MF-Paketgröße');expanded+=entry.originalSize;if(++entries>EXCHANGE_LIMITS.entries||expanded>EXCHANGE_LIMITS.expandedBytes)fail('3MF-Paket ist entpackt zu groß.');const path=pathName(entry.name);if(!entry.name.endsWith('/')){if(seen.has(path))fail('Doppelte Datei im 3MF-Paket.');seen.add(path);}return true;}});
 const files=new Map();for(const [name,data]of Object.entries(archive)){if(name.endsWith('/'))continue;const path=pathName(name);if(files.has(path))fail('Doppelte Datei im 3MF-Paket.');files.set(path,data);}
 const read=path=>files.get(path)??fail('3MF-Paketdatei fehlt: '+path);
 const rels=xmlDocument(read('_rels/.rels')),rel=elements(rels,'Relationship').find(n=>n.getAttribute('Type')==='http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel');
 if(!rel||rel.getAttribute('TargetMode')==='External')fail('3MF-Modellverknüpfung fehlt oder ist extern.');
 const main=pathName(rel.getAttribute('Target')),models=new Map(),c=collector();
 function model(path){
  if(models.has(path))return models.get(path);const root=xmlDocument(read(path));
  if(root.localName!=='model'||root.namespaceURI!=='http://schemas.microsoft.com/3dmanufacturing/core/2015/02')fail('Keine unterstützte 3MF-Core-Datei.');
  const units={micron:.001,millimeter:1,centimeter:10,inch:25.4,foot:304.8,meter:1000},unit=root.getAttribute('unit')||'millimeter';if(!Object.hasOwn(units,unit))fail('Unbekannte 3MF-Einheit: '+unit);
  for(const prefix of (root.getAttribute('requiredextensions')||'').trim().split(/\s+/).filter(Boolean)){
   const ns=root.lookupNamespaceURI(prefix);if(!['http://schemas.microsoft.com/3dmanufacturing/production/2015/06','http://schemas.microsoft.com/3dmanufacturing/material/2015/02'].includes(ns))fail('Nicht unterstützte erforderliche 3MF-Erweiterung: '+prefix);
  }
  const resources=new Map(),resourceNode=child(root,'resources');if(!resourceNode)fail('3MF-Ressourcen fehlen.');
  for(const node of elements(resourceNode)){if(!node.hasAttribute('id'))continue;const id=attrId(node,'id');if(resources.has(id))fail('Doppelte 3MF-Ressourcen-ID.');resources.set(id,node);}
  const result={root,resources,unit:units[unit],path};models.set(path,result);return result;
 }
 function material(m,pid,index){
  if(pid===undefined)return {color:'#77a8b5',opacity:1};const resource=m.resources.get(pid);if(!resource)fail('3MF-Materialreferenz fehlt.');
  const values=elements(resource,resource.localName==='basematerials'?'base':'color'),value=values[integer(index,0,values.length-1,'Materialindex')];
  if(!['basematerials','colorgroup'].includes(resource.localName))fail('3MF-Materialtyp wird nicht unterstützt (Texturen/Verbundmaterial).');
  return rgba(value.getAttribute(resource.localName==='basematerials'?'displaycolor':'color'));
 }
 let visits=0;
 function visit(m,id,matrix,stack=[],name=''){
  if(++visits>10000||stack.length>=EXCHANGE_LIMITS.depth)fail('3MF-Komponenten sind zu tief oder zu zahlreich verschachtelt.');
  const key=m.path+'#'+id;if(stack.includes(key))fail('Zyklische 3MF-Komponenten.');
  const object=m.resources.get(id);if(object?.localName!=='object')fail('3MF-Objektreferenz fehlt.');
  if(object.hasAttribute('type')&&object.getAttribute('type')!=='model'){c.warnings.add('Nicht druckbare 3MF-Hilfsobjekte wurden ausgelassen.');return;}
  name=object.getAttribute('name')||name||'Teil '+(c.parts.length+1);const mesh=child(object,'mesh'),components=child(object,'components');
  if(!!mesh===!!components)fail('3MF-Objekt benötigt genau ein Netz oder Komponenten.');
  if(components){for(const ref of elements(components,'component')){
   const target=ref.getAttributeNS('http://schemas.microsoft.com/3dmanufacturing/production/2015/06','path'),other=target?model(pathName(target,dir(m.path))):m;
   // Cross-file model units affect its vertices, not the parent's translation.
   const ratio=other.unit/m.unit;visit(other,attrId(ref,'objectid'),matrix.clone().multiply(transform3mf(ref)).multiply(new Matrix4().makeScale(ratio,ratio,ratio)),[...stack,key],name);
  }return;}
  const vNodes=elements(child(mesh,'vertices'),'vertex'),tNodes=elements(child(mesh,'triangles'),'triangle');
  integer(vNodes.length,3,EXCHANGE_LIMITS.vertices,'3MF-Punkte');integer(tNodes.length,1,EXCHANGE_LIMITS.triangles,'3MF-Dreiecke');
  const verts=vNodes.flatMap(v=>['x','y','z'].map(k=>attrNum(v,k))),triangles=[];let appearance;
  const pid=object.hasAttribute('pid')?attrId(object,'pid'):undefined,index=optional(object,'pindex',0);
  for(const tri of tNodes){triangles.push(...['v1','v2','v3'].map(k=>integer(attrNum(tri,k),0,vNodes.length-1,k)));
   const p=tri.hasAttribute('pid')?attrId(tri,'pid'):pid,i=optional(tri,'p1',index),colors=[i,optional(tri,'p2',i),optional(tri,'p3',i)].map(value=>material(m,p,value));
   appearance??=colors[0];if(colors.some(value=>value.color!==appearance.color||value.opacity!==appearance.opacity))c.warnings.add('Mehrere Flächenfarben innerhalb eines Teils: Die erste Objektfarbe wird verwendet.');
  }
  c.add({name,...appearance,mesh:{verts,triangles}},matrix);
 }
 const primary=model(main),build=child(primary.root,'build');if(!build)fail('3MF-Bauplan fehlt.');
 for(const item of elements(build,'item')){if(item.getAttribute('printable')==='0'||item.getAttribute('printable')==='false'){c.warnings.add('Als nicht druckbar markierte 3MF-Objekte wurden ausgelassen.');continue;}visit(primary,attrId(item,'objectid'),new Matrix4().makeScale(primary.unit,primary.unit,primary.unit).multiply(transform3mf(item)));}
 return c.result();
}

function glbDocument(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length<20||view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==bytes.length)fail('Beschädigte GLB-2-Datei.');
 let json,bin,offset=12;while(offset<bytes.length){if(offset+8>bytes.length)fail('Abgeschnittener GLB-Block.');const length=view.getUint32(offset,true),type=view.getUint32(offset+4,true);offset+=8;if(length%4||offset+length>bytes.length)fail('Ungültige GLB-Blockgröße.');const chunk=bytes.subarray(offset,offset+length);
  if(type===0x4e4f534a){if(json!==undefined||offset!==20)fail('Ungültiger GLB-JSON-Block.');json=JSON.parse(strFromU8(chunk));}else if(type===0x004e4942){if(bin)fail('Doppelter GLB-Binärblock.');bin=chunk;}offset+=length;
 }if(!json)fail('GLB-JSON fehlt.');return {json,bin};
}
export async function parseGltf(input,{binary=false,files=[]}={}){
 const bytes=typeof input==='string'?new TextEncoder().encode(input):new Uint8Array(input);if(bytes.length>EXCHANGE_LIMITS.fileBytes)fail('glTF-Datei ist größer als 50 MB.');
 const {json:g,bin}=binary?glbDocument(bytes):{json:JSON.parse(strFromU8(bytes))},c=collector();
 if(g.asset?.version!=='2.0'||g.asset?.minVersion&&g.asset.minVersion!=='2.0')fail('Es wird glTF 2.0 benötigt.');
 for(const ext of g.extensionsRequired??[])if(!['KHR_mesh_quantization','KHR_materials_unlit'].includes(ext))fail('Nicht unterstützte erforderliche glTF-Erweiterung: '+ext);
 if(g.animations?.length)c.warnings.add('Animationen werden als statische Ausgangsstellung importiert.');
 if(g.textures?.length)c.warnings.add('Texturen werden nicht übernommen; Objektfarben bleiben erhalten.');
 let total=bytes.length;const buffers=[];
 for(const [i,buffer]of (g.buffers??[]).entries()){
  integer(buffer.byteLength,0,EXCHANGE_LIMITS.expandedBytes,'glTF-Puffergröße');let data;
  if(buffer.uri===undefined){if(i!==0||!bin)fail('glTF-Binärpuffer fehlt.');data=bin;}
  else if(/^data:/.test(buffer.uri)){
   if(!/^data:(?:application\/(?:octet-stream|gltf-buffer))?;base64,[a-z\d+/]*={0,2}$/i.test(buffer.uri))fail('Nicht unterstützter glTF-Datenpuffer.');
   const encoded=buffer.uri.slice(buffer.uri.indexOf(',')+1);if(encoded.length>EXCHANGE_LIMITS.expandedBytes*4/3+4)fail('glTF-Datenpuffer ist zu groß.');data=Uint8Array.from(atob(encoded),ch=>ch.charCodeAt(0));
  }else{
   const name=pathName(buffer.uri),matches=files.filter(f=>{const path=f.webkitRelativePath||f.name;return path===name||path.endsWith('/'+name)||f.name===name.split('/').at(-1);});
   if(matches.length!==1)fail('glTF-Begleitdatei fehlt oder ist mehrdeutig: '+name+'. Bitte zusammen mit der glTF-Datei auswählen.');
   if(matches[0].size>EXCHANGE_LIMITS.expandedBytes)fail('glTF-Begleitdatei ist zu groß.');data=new Uint8Array(await matches[0].arrayBuffer());
  }
  total+=data.length;if(total>EXCHANGE_LIMITS.expandedBytes)fail('glTF-Dateien sind zusammen zu groß.');if(data.length<buffer.byteLength||data.length>buffer.byteLength+(buffer.uri===undefined?3:0))fail('glTF-Pufferlänge stimmt nicht.');buffers.push(data.subarray(0,buffer.byteLength));
 }
 const component={5120:[1,'getInt8'],5121:[1,'getUint8'],5122:[2,'getInt16'],5123:[2,'getUint16'],5125:[4,'getUint32'],5126:[4,'getFloat32']};
 function viewData(index){const v=g.bufferViews?.[index],buffer=buffers[v?.buffer];if(!v||!buffer)fail('glTF-Pufferreferenz fehlt.');const offset=v.byteOffset??0;integer(offset,0,buffer.length,'Pufferoffset');integer(v.byteLength,0,buffer.length-offset,'Pufferlänge');if(v.extensions?.EXT_meshopt_compression)fail('Komprimierte glTF-Netze benötigen vorheriges Entpacken.');return {v,buffer,offset};}
 let readValues=0;
 function accessor(index,size,{indices=false}={}){
  const a=g.accessors?.[index],type=size===3?'VEC3':'SCALAR';if(!a||a.type!==type||!component[a.componentType]||indices&&(![5121,5123,5125].includes(a.componentType)||a.normalized))fail('Nicht unterstützter glTF-Accessor.');
  integer(a.count,1,indices?EXCHANGE_LIMITS.triangles*3:EXCHANGE_LIMITS.vertices,'Accessoranzahl');if((readValues+=a.count*size)>18000000)fail('glTF-Accessorbudget überschritten.');
  const [width,get]=component[a.componentType],out=new Array(a.count*size).fill(0),norm=v=>a.normalized?(a.componentType===5120?Math.max(v/127,-1):a.componentType===5122?Math.max(v/32767,-1):v/({5121:255,5123:65535,5125:4294967295}[a.componentType]??1)):v;
  function read(index,offset,count,stride,callback){const d=viewData(index),step=stride??d.v.byteStride??width*size,local=offset??0;integer(local,0,d.v.byteLength,'Accessoroffset');integer(step,width*size,252,'Accessorstride');if(local+(count-1)*step+width*size>d.v.byteLength)fail('glTF-Accessor überschreitet seinen Puffer.');const dv=new DataView(d.buffer.buffer,d.buffer.byteOffset+d.offset,d.v.byteLength);for(let i=0;i<count;i++)for(let k=0;k<size;k++)callback(i,k,finite(norm(dv[get](local+i*step+k*width,true))));}
  if(a.bufferView!==undefined)read(a.bufferView,a.byteOffset,a.count,undefined,(i,k,v)=>out[i*size+k]=v);else if(!a.sparse)fail('glTF-Accessor ohne Daten.');
  if(a.sparse){const s=a.sparse;integer(s.count,1,a.count,'Sparseanzahl');if(![5121,5123,5125].includes(s.indices?.componentType))fail('Ungültiger Sparseindex.');const d=viewData(s.indices.bufferView),[w,method]=component[s.indices.componentType],offset=s.indices.byteOffset??0;integer(offset,0,d.v.byteLength-s.count*w,'Sparseoffset');const dv=new DataView(d.buffer.buffer,d.buffer.byteOffset+d.offset,d.v.byteLength),targets=[];for(let i=0;i<s.count;i++){const n=integer(dv[method](offset+i*w,true),0,a.count-1,'Sparseindex');if(i&&n<=targets[i-1])fail('Sparseindizes müssen aufsteigend sein.');targets.push(n);}read(s.values.bufferView,s.values.byteOffset,s.count,width*size,(i,k,v)=>out[targets[i]*size+k]=v);}
  return out;
 }
 const roots=g.scenes?.[g.scene??0]?.nodes;if(!Array.isArray(roots))fail('glTF-Szene fehlt.');
 const basis=new Matrix4().set(1000,0,0,0,0,0,-1000,0,0,1000,0,0,0,0,0,1);let visits=0;
 function visit(index,parent,stack=[]){
  integer(index,0,(g.nodes?.length??0)-1,'glTF-Knoten');if(stack.includes(index)||stack.length>=EXCHANGE_LIMITS.depth||++visits>10000)fail('Zyklische oder zu große glTF-Hierarchie.');const n=g.nodes[index];
  if(n.skin!==undefined||n.weights?.some(v=>v!==0))fail('Verformte glTF-Netze (Skin/Morph) vorher als statisches Netz speichern.');
  let local;if(n.matrix!==undefined){arr(n.matrix,16,'glTF-Matrix');if(n.matrix[3]||n.matrix[7]||n.matrix[11]||n.matrix[15]!==1)fail('glTF benötigt affine Transformationen.');local=new Matrix4().fromArray(n.matrix);}else{
   const q=arr(n.rotation??[0,0,0,1],4,'glTF-Rotation');if(Math.abs(q.reduce((s,v)=>s+v*v,0)-1)>1e-4)fail('Ungültiges glTF-Quaternion.');local=new Matrix4().compose(new Vector3(...arr(n.translation??[0,0,0],3,'glTF-Lage')),new Quaternion(...q),new Vector3(...arr(n.scale??[1,1,1],3,'glTF-Skalierung')));
  }const world=parent.clone().multiply(local);
  if(n.mesh!==undefined){const mesh=g.meshes?.[n.mesh];if(!mesh||mesh.weights?.some(v=>v!==0))fail('glTF-Netz fehlt oder ist verformt.');const groups=new Map();
   for(const primitive of mesh.primitives??[]){if(primitive.extensions?.KHR_draco_mesh_compression)fail('Draco-komprimierte Netze vorher entpacken.');if(primitive.mode!==undefined&&primitive.mode!==4)fail('glTF-Import benötigt Dreiecksnetze (TRIANGLES).');
    const verts=accessor(primitive.attributes?.POSITION,3),triangles=primitive.indices===undefined?Array.from({length:verts.length/3},(_,i)=>i):accessor(primitive.indices,1,{indices:true});
    if(triangles.length%3)fail('glTF-Dreiecksanzahl ist ungültig.');for(const index of triangles)integer(index,0,verts.length/3-1,'glTF-Primitiveindex');
    if(primitive.attributes?.COLOR_0!==undefined)c.warnings.add('Vertexfarben werden nicht übernommen; Material-Objektfarben bleiben erhalten.');
    const key=primitive.material??-1,part=groups.get(key)??{verts:[],triangles:[]},offset=part.verts.length/3;for(const v of verts)part.verts.push(v);for(const t of triangles)part.triangles.push(t+offset);groups.set(key,part);
   }
   for(const [materialIndex,data]of groups){const material=materialIndex===-1?{}:g.materials?.[materialIndex];if(!material)fail('glTF-Materialreferenz fehlt.');const factor=arr(material.pbrMetallicRoughness?.baseColorFactor??[1,1,1,1],4,'glTF-Farbe');if(factor.some(v=>v<0||v>1))fail('Ungültige glTF-Farbe.');const color=new Color().setRGB(...factor.slice(0,3));c.add({name:safeName(n.name||mesh.name,'Teil '+(c.parts.length+1))+(groups.size>1?' · '+safeName(material.name,'Material '+materialIndex):''),color:'#'+color.getHexString(),opacity:factor[3],mesh:data},world);}
  }
  for(const next of n.children??[])visit(next,world,[...stack,index]);
 }
 for(const root of roots)visit(root,basis);return c.result();
}

export async function readExchangeFile(file,{files=[]}={}){
 if(file.size>EXCHANGE_LIMITS.fileBytes)fail('Importdatei ist größer als 50 MB.');const ext=file.name.split('.').at(-1).toLowerCase(),bytes=await file.arrayBuffer();
 if(ext==='3mf')return parseThreeMF(bytes);if(ext==='glb'||ext==='gltf')return parseGltf(bytes,{binary:ext==='glb',files});fail('Nicht unterstütztes Austauschformat.');
}

export function exchangeMainFile(files,{freecad=false}={}){
 const models=Array.from(files).filter(f=>/\.(3mf|glb|gltf|stl|obj|svg|step|stp)$/i.test(f.name)||freecad&&/\.fcstd$/i.test(f.name));
 if(models.length!==1)fail('Bitte genau eine Modelldatei auswählen; glTF-Begleitdateien dürfen zusätzlich ausgewählt werden.');return models[0];
}
export function exchangeImportSummary(result,{cad=false}={}){
 const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 return `<p>${result.parts.length} <span>einzeln auswählbare ${cad?'Netzreferenzen':'Teile'}.</span></p><p>Dateieinheiten werden in Millimeter umgerechnet. Originalpositionen und Objektfarben bleiben erhalten.</p>`+(cad?'<p>Netzreferenzen sind Ansichtsvorlagen, keine nativen CAD-Körper. 3MF, GLB und glTF können sie wieder exportieren.</p>':'<p>Alle Teile werden gemeinsam geprüft und als ein rückgängig machbarer Import übernommen. Offene Netze werden abgewiesen.</p>')+result.warnings.map(w=>`<p class="warning">${escape(w)}</p>`).join('');
}

// Pack existing validated, embedded glTF into GLB without changing coordinates,
// materials or hierarchy. All buffers get aligned offsets in one BIN chunk.
export function gltfToGlb(text){
 const g=JSON.parse(text),chunks=[];let length=0;
 for(const b of g.buffers){if(!/^data:application\/octet-stream;base64,/.test(b.uri))fail('GLB-Export benötigt eingebettete Puffer.');const data=Uint8Array.from(atob(b.uri.split(',')[1]),c=>c.charCodeAt(0));if(data.length!==b.byteLength)fail('GLB-Pufferlänge stimmt nicht.');chunks.push({data,offset:length});length+=(data.length+3)&~3;}
 for(const view of g.bufferViews){const c=chunks[view.buffer];view.byteOffset=(view.byteOffset??0)+c.offset;view.buffer=0;}g.buffers=[{byteLength:length}];
 const json=new TextEncoder().encode(JSON.stringify(g)),jsonLength=(json.length+3)&~3,output=new Uint8Array(28+jsonLength+length),dv=new DataView(output.buffer);dv.setUint32(0,0x46546c67,true);dv.setUint32(4,2,true);dv.setUint32(8,output.length,true);dv.setUint32(12,jsonLength,true);dv.setUint32(16,0x4e4f534a,true);output.fill(32,20,20+jsonLength);output.set(json,20);dv.setUint32(20+jsonLength,length,true);dv.setUint32(24+jsonLength,0x004e4942,true);for(const c of chunks)output.set(c.data,28+jsonLength+c.offset);return output;
}
