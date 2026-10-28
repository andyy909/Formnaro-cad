// Geometry is independent of the UI so solid modelling can be verified directly.
import {defaults,SCHEMAS,GENERATORS,validParameters} from './parameters.js';
import {buildParametric} from './parametric-geometry.js';
import {resolveSketch,validSketch} from './mesh-sketch.js';
import {validMarks} from './mesh-marks.js';
import {validPartition} from './mesh-partition-schema.js';
const validCad=()=>false,validFinish=()=>false;
let kernel;
export function setKernel(module) { kernel = module; }
// Preserve signed disconnected shells without a Boolean rebuild.
export function composeManifoldShells(parts) { return kernel.Manifold.compose(parts); }
export function applySketch(node,sketch,{preserveScale=true}={}){
 const resolved=resolveSketch(sketch,Math.max(12,node.segments||64)),m=kernel.Manifold.extrude(resolved.polygons??[resolved.points],resolved.height,0,0,[1,1],false);
 try{
  if(m.isEmpty()||m.status()!=='NoError'||m.volume()<=0)throw Error('Skizze ergibt keinen geschlossenen Körper.');
  const normal=normalizeMesh(meshData(m)),scale=preserveScale&&node.sketchSize?node.size.map((v,i)=>v/node.sketchSize[i]):[1,1,1];
  if(node.sketchCenter){const basis=matrixArray({...node,size:scale}),delta=resolved.center.map((v,i)=>v-node.sketchCenter[i]);node.pos=node.pos.map((v,i)=>v+delta.reduce((sum,d,j)=>sum+basis[j*4+i]*d,0));}
  node.mesh=normal.mesh;node.size=normal.size.map((v,i)=>v*scale[i]);node.sketch=structuredClone(sketch);node.sketchSize=[...normal.size];node.sketchCenter=[...resolved.center];node.type='sketch';
  // Previous markers refer to old surface geometry, and must be reviewed.
  if(node.aiMarks?.length)delete node.aiMarks;
  if(!validNode(node))throw Error('Ungültige Skizzenabmessungen.');return node;
 }finally{m.delete();}
}
export const SHAPES = [
  ['box','Quader','#ed6a48',[20,20,20]],['cylinder','Zylinder','#ebac3c',[20,20,20]],
  ['sphere','Kugel','#418db6',[20,20,20]],['cone','Kegel','#79ae72',[20,20,20]],
  ['pyramid','Pyramide','#976ec3',[20,20,20]],['roof','Dach','#c97c56',[20,20,20]],
  ['wedge','Keil','#78aeb7',[20,20,20]],['hexagon','Sechseck','#ba83bd',[20,20,20]],
  ['triangle','Dreieck','#eaa13c',[20,20,20]],['tube','Rohr','#7c9ac5',[20,20,20]],
  ['torus','Ring','#e9819b',[25,25,8]],['capsule','Kapsel','#639f89',[35,20,10]],
  ['star','Stern','#edb146',[25,25,5]],['heart','Herz','#de7785',[25,25,5]],
  ['gear','Zahnrad','#8b9cae',[30,30,6]],['text','Text','#448fba',[40,14,4]],
  ['roundbox','Rundquader','#dc866b',[25,25,10]],['halfSphere','Halbkugel','#9bb36a',[25,25,12.5]],
  ['thread','Gewinde','#7ca6a2',[8,8,16]],['nut','Gewindemutter','#a591ba',[15,13,6]],
  ['countersink','Senkbohrung','#839ba8',[8.4,8.4,10]],['shellbox','Gehäuse','#69a6a4',[60,40,20]],
  ['polygon','Polygon','#b887ba',[20,20,10]]
];
export function makeNode(type, pos, extra={}) {
  const definition=SHAPES.find(s=>s[0]===type) || ['import','Import','#77a8b5',[20,20,20]];
  return {id:crypto.randomUUID(),type,name:definition[1],color:definition[2],size:[...definition[3]],
    pos:pos||[0,0,definition[3][2]/2],rot:[0,0,0],mirror:[1,1,1],solid:type!=='countersink',hidden:false,locked:false,segments:64,
    ...(SCHEMAS[type]?{params:defaults(type)}:{}),...extra};
}
function replace(old, next) {old.delete(); return next;}
function regular(n, radius=.5) {return Array.from({length:n},(_,i)=>[radius*Math.cos(i*2*Math.PI/n),radius*Math.sin(i*2*Math.PI/n)]);}
function normalize(m) {
  if(m.isEmpty()) throw new Error('Die Operation ergibt keinen Körper.');
  const b=m.boundingBox(), center=b.min.map((v,i)=>(v+b.max[i])/2), size=b.min.map((v,i)=>b.max[i]-v);
  if(size.some(x=>!Number.isFinite(x)||x<1e-6)){m.delete();throw new Error('Die Form hat keine räumliche Ausdehnung.');}
  m=replace(m,m.translate(center.map(v=>-v)));
  return {manifold:replace(m,m.scale(size.map(v=>1/v))),size,center};
}
export function meshData(m) {
  const mesh=m.getMesh(),properties=mesh.vertProperties,verts=new Array(properties.length/mesh.numProp*3);
  // Manifold stores XYZ before any additional per-vertex properties.
  for(let i=0,j=0;i<properties.length;i+=mesh.numProp){verts[j++]=properties[i];verts[j++]=properties[i+1];verts[j++]=properties[i+2];}
  return {verts,triangles:Array.from(mesh.triVerts)};
}
export function fromMesh(data) {
  const mesh=new kernel.Mesh({numProp:3,vertProperties:new Float32Array(data.verts),triVerts:new Uint32Array(data.triangles)});
  mesh.merge();
  const m=new kernel.Manifold(mesh);
  if(m.status()!=='NoError'){const status=m.status();m.delete();throw new Error(`Das Mesh ist kein geschlossener Körper (${status}). Offene oder fehlerhafte Netze vor dem Import reparieren.`);}
  return m;
}
export function normalizeMesh(data) {
  let m=fromMesh(data);
  // SVG Y-axis conversion and some imported meshes reverse the complete winding.
  // Restore outward orientation before exposing the mesh as an editable solid.
  if(m.volume()<0){m.delete();const triangles=[...data.triangles];for(let i=0;i<triangles.length;i+=3)[triangles[i+1],triangles[i+2]]=[triangles[i+2],triangles[i+1]];m=fromMesh({...data,triangles});}
  const result=normalize(m);try{return {mesh:meshData(result.manifold),size:result.size};}finally{result.manifold.delete();}
}
export function localManifold(node) {
  const M=kernel.Manifold, seg=node.segments||64;
  if(!Number.isInteger(seg)||seg<3||seg>512)throw new Error('Qualität: 3 bis 512 Segmente.');
  if(node.type==='thread'||node.type==='nut'){const p=node.params;if(p&&Math.max(32,seg)*(Math.max(16,Math.ceil(p.length/p.pitch*24))+1)>180000)throw new Error('Gewinde zu komplex: Qualität oder Länge verringern.');}
  if(node.mesh) return fromMesh(node.mesh);
  // Old files without settings keep their original geometry until a parameter is edited.
  if(node.params&&SCHEMAS[node.type])return normalize(buildParametric(node,M,fromMesh)).manifold;
  let m;
  switch(node.type) {
    case 'box': m=M.cube([1,1,1],true);break;
    case 'cylinder':m=M.cylinder(1,.5,.5,seg,true);break;
    case 'sphere':m=M.sphere(.5,seg);break;
    case 'cone':m=M.cylinder(1,.5,0,seg,true);break;
    case 'hexagon':m=M.cylinder(1,.5,.5,6,true);break;
    case 'triangle':m=M.cylinder(1,.5,.5,3,true);break;
    case 'pyramid':m=M.extrude([[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]],1,0,0,[0,0],true);break;
    case 'roof':case 'wedge':{
      const p=node.type==='roof'?[[-.5,-.5],[.5,-.5],[0,.5]]:[[-.5,-.5],[.5,-.5],[-.5,.5]];
      m=M.extrude([p],1,0,0,[1,1],true);m=replace(m,m.rotate([90,0,0]));break;
    }
    case 'tube':{const a=M.cylinder(1,.5,.5,seg,true),b=M.cylinder(1.2,.34,.34,seg,true);m=M.difference(a,b);a.delete();b.delete();break;}
    case 'torus':m=M.revolve([regular(Math.max(12,Math.round(seg/2)),.15).map(([x,y])=>[x+.35,y])],seg);break;
    case 'capsule':{
      const parts=[M.cube([.5,1,1],true)];for(const x of [-.25,.25]){const c=M.cylinder(1,.5,.5,seg,true);parts.push(c.translate([x,0,0]));c.delete();}m=M.union(parts);parts.forEach(p=>p.delete());break;
    }
    case 'star':m=M.extrude([Array.from({length:10},(_,i)=>{const a=i*Math.PI/5,r=i%2?.23:.5;return [r*Math.cos(a),r*Math.sin(a)];})],1,0,0,[1,1],true);break;
    case 'heart':{
      const p=Array.from({length:seg},(_,i)=>{const a=-i*2*Math.PI/seg;return [16*Math.sin(a)**3/32,(13*Math.cos(a)-5*Math.cos(2*a)-2*Math.cos(3*a)-Math.cos(4*a))/32];});
      m=M.extrude([p],1,0,0,[1,1],true);break;
    }
    case 'gear':{
      const p=Array.from({length:48},(_,i)=>{const r=i%4===0||i%4===3?.5:.42,a=i*2*Math.PI/48;return [r*Math.cos(a),r*Math.sin(a)];});
      const a=M.extrude([p],1,0,0,[1,1],true),b=M.cylinder(1.2,.1,.1,seg,true);m=M.difference(a,b);a.delete();b.delete();break;
    }
    case 'roundbox':{
      // Rounded XY profile, extruded along Z. Corners stay editable through dimensions.
      const p=[];for(let k=0;k<4;k++){const a0=k*Math.PI/2,cx=k===0||k===3?.35:-.35,cy=k<2?.35:-.35;
        for(let i=0;i<=seg/4;i++){const a=a0+i/(seg/4)*Math.PI/2;p.push([cx+.15*Math.cos(a),cy+.15*Math.sin(a)]);}}
      m=M.extrude([p],1,0,0,[1,1],true);break;
    }
    case 'halfSphere':{const a=M.sphere(.5,seg),b=M.cube([2,2,1],true),shift=b.translate([0,0,.5]);m=M.intersection(a,shift);a.delete();b.delete();shift.delete();break;}
    default: throw new Error('Unbekannte Form.');
  }
  const result=normalize(m);return result.manifold;
}
export function fitParameters(node){
  if(!GENERATORS.has(node.type)||node.mesh)return;
  const m=buildParametric(node,kernel.Manifold,fromMesh);try{if(m.isEmpty()||m.status()!=='NoError')throw new Error('Die Parameter ergeben keinen gültigen Körper.');const b=m.boundingBox(),size=b.min.map((v,i)=>b.max[i]-v);if(size.some(v=>v<.01||v>10000))throw new Error('Die erzeugte Form überschreitet die zulässigen Abmessungen.');const basis=matrixArray({...node,size:[1,1,1]}),delta=(size[2]-node.size[2])/2;for(let i=0;i<3;i++)node.pos[i]+=basis[8+i]*delta;node.size=size;node.parameterSize=[...size];}finally{m.delete();}
}
export function matrixArray(node) {
  // Same ZYX Euler convention as the renderer, using column-major matrices.
  const [x,y,z]=node.rot.map(v=>v*Math.PI/180),cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);
  const s=node.size.map((v,i)=>v*(node.mirror?.[i]||1));
  return [cz*cy*s[0],sz*cy*s[0],-sy*s[0],0,
    (cz*sy*sx-sz*cx)*s[1],(sz*sy*sx+cz*cx)*s[1],cy*sx*s[1],0,
    (cz*sy*cx+sz*sx)*s[2],(sz*sy*cx-cz*sx)*s[2],cy*cx*s[2],0,...node.pos,1];
}
export function worldManifold(node) {const m=localManifold(node);return replace(m,m.transform(matrixArray(node)));}
export function booleanManifold(nodes, operation='union', allowHoleGroup=false) {
  const solids=[],holes=[];
  try{
    for(const n of nodes)(n.solid?solids:holes).push(worldManifold(n));
    if(!solids.length&&allowHoleGroup)solids.push(...holes.splice(0));
    if(!solids.length)throw new Error('Wähle mindestens einen Körper aus.');
    let m=operation==='intersection'?kernel.Manifold.intersection(solids):kernel.Manifold.union(solids);
    if(holes.length){try{m=replace(m,kernel.Manifold.difference([m,...holes]));}catch(e){m.delete();throw e;}}
    if(m.isEmpty()){m.delete();throw new Error('Die Operation ergibt keinen Körper.');}
    return m;
  } finally {solids.forEach(m=>m.delete());holes.forEach(m=>m.delete());}
}
export function groupNodes(nodes, operation='union') {
  const result=normalize(booleanManifold(nodes,operation,true));
  try {
    const children=structuredClone(nodes).map(n=>({...n,pos:n.pos.map((v,i)=>v-result.center[i])}));
    const group=makeNode('group',result.center,{name:operation==='intersection'?'Schnittmenge':'Gruppe',size:result.size,
      solid:nodes.some(n=>n.solid),color:(nodes.find(n=>n.solid)??nodes[0])?.color||'#ed6a48',mesh:meshData(result.manifold),children,baseSize:[...result.size],operation});
    if(!validNode(group))throw new Error('Die Gruppierung erzeugt ein zu großes Teil. Maße, Anzahl oder Qualität verringern.');
    return group;
  } finally {result.manifold.delete();}
}
export function stlBinary(m) {
  const data=meshData(m),n=data.triangles.length/3,buffer=new ArrayBuffer(84+n*50),view=new DataView(buffer);
  new Uint8Array(buffer,0,80).set(new TextEncoder().encode('Formnaro | millimeters | local solid model'));view.setUint32(80,n,true);
  for(let t=0;t<n;t++){
    const i0=data.triangles[t*3]*3,i1=data.triangles[t*3+1]*3,i2=data.triangles[t*3+2]*3,v=data.verts;
    const ax=v[i1]-v[i0],ay=v[i1+1]-v[i0+1],az=v[i1+2]-v[i0+2],bx=v[i2]-v[i0],by=v[i2+1]-v[i0+1],bz=v[i2+2]-v[i0+2];
    const nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx,len=Math.hypot(nx,ny,nz)||1,offset=84+t*50;
    view.setFloat32(offset,nx/len,true);view.setFloat32(offset+4,ny/len,true);view.setFloat32(offset+8,nz/len,true);
    view.setFloat32(offset+12,v[i0],true);view.setFloat32(offset+16,v[i0+1],true);view.setFloat32(offset+20,v[i0+2],true);
    view.setFloat32(offset+24,v[i1],true);view.setFloat32(offset+28,v[i1+1],true);view.setFloat32(offset+32,v[i1+2],true);
    view.setFloat32(offset+36,v[i2],true);view.setFloat32(offset+40,v[i2+1],true);view.setFloat32(offset+44,v[i2+2],true);
  }return buffer;
}
export function objString(m) {const d=meshData(m);return '# Formnaro – mm\n'+Array.from({length:d.verts.length/3},(_,i)=>'v '+d.verts.slice(i*3,i*3+3).join(' ')).join('\n')+'\n'+Array.from({length:d.triangles.length/3},(_,i)=>'f '+d.triangles.slice(i*3,i*3+3).map(n=>n+1).join(' ')).join('\n');}
const meshValidationCache=new WeakMap();
const immutableMeshSnapshots=new WeakSet();
function plainMeshArrays(mesh){
  const vd=Object.getOwnPropertyDescriptor(mesh,'verts'),td=Object.getOwnPropertyDescriptor(mesh,'triangles');
  if(!vd||!td||!Object.hasOwn(vd,'value')||!Object.hasOwn(td,'value'))return null;
  const verts=vd.value,triangles=td.value;
  if(!Array.isArray(verts)||!Array.isArray(triangles)||Object.getPrototypeOf(verts)!==Array.prototype||Object.getPrototypeOf(triangles)!==Array.prototype||verts.every!==Array.prototype.every||triangles.every!==Array.prototype.every)return null;
  return {verts,triangles,vd,td};
}
function checkedDataArrays(verts,triangles){
  let valid=verts.length<=3000000&&triangles.length<=6000000&&verts.length%3===0&&triangles.length%3===0;
  // A single descriptor pass proves immutable own values and validates their
  // numbers. Frozen getters can still change; sparse/custom arrays therefore
  // use the original live validation path instead of this snapshot cache.
  for(let i=0;i<verts.length;i++){
    const descriptor=Object.getOwnPropertyDescriptor(verts,i);
    if(!descriptor||!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='number')return null;
    if(!Number.isFinite(descriptor.value))valid=false;
  }
  const vertexCount=verts.length/3;
  for(let i=0;i<triangles.length;i++){
    const descriptor=Object.getOwnPropertyDescriptor(triangles,i);
    if(!descriptor||!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='number')return null;
    const value=descriptor.value;if(!Number.isInteger(value)||value<0||value>=vertexCount)valid=false;
  }
  return {valid};
}
export function immutableMeshSnapshot(mesh){
  if(!mesh||typeof mesh!=='object')return false;
  // A getter named toJSON may currently yield undefined and change later.
  // Even frozen data remains unsuitable for JSON caching in that case.
  if('toJSON' in mesh)return false;
  if(immutableMeshSnapshots.has(mesh))return !('toJSON' in mesh.verts)&&!('toJSON' in mesh.triangles);
  if(![Object.prototype,null].includes(Object.getPrototypeOf(mesh)))return false;
  const keys=Reflect.ownKeys(mesh);if(keys.length!==2||!keys.includes('verts')||!keys.includes('triangles'))return false;
  const arrays=plainMeshArrays(mesh);
  if(!arrays||!arrays.vd.enumerable||!arrays.td.enumerable||'toJSON' in arrays.verts||'toJSON' in arrays.triangles)return false;
  const checked=checkedDataArrays(arrays.verts,arrays.triangles);if(!checked)return false;
  Object.freeze(arrays.verts);Object.freeze(arrays.triangles);Object.freeze(mesh);
  immutableMeshSnapshots.add(mesh);meshValidationCache.set(mesh,checked);return true;
}
export function validMesh(mesh){
  const cached=meshValidationCache.get(mesh);if(cached)return cached.valid;
  const {verts,triangles}=mesh;
  if(Object.isFrozen(mesh)&&Array.isArray(verts)&&Array.isArray(triangles)&&Object.isFrozen(verts)&&Object.isFrozen(triangles)){
    const arrays=plainMeshArrays(mesh),checked=arrays&&checkedDataArrays(arrays.verts,arrays.triangles);
    if(checked){meshValidationCache.set(mesh,checked);return checked.valid;}
  }
  return Array.isArray(verts)&&Array.isArray(triangles)&&verts.length<=3000000&&triangles.length<=6000000&&verts.length%3===0&&triangles.length%3===0&&verts.every(Number.isFinite)&&triangles.every(v=>Number.isInteger(v)&&v>=0&&v<verts.length/3);
}
export function validNode(n,depth=0,{meshValidator=validMesh}={}) {
  if(!n||depth>12||typeof n.id!=='string'||typeof n.name!=='string'||!n.name||n.name.length>200||typeof n.type!=='string')return false;
  if(!['size','pos','rot'].every(k=>Array.isArray(n[k])&&n[k].length===3&&n[k].every(v=>typeof v==='number'&&Number.isFinite(v))))return false;
  if(n.size.some(v=>v<.01||v>10000)||n.pos.some(v=>Math.abs(v)>100000)||n.rot.some(v=>Math.abs(v)>100000))return false;
  if(!/^#[\da-f]{6}$/i.test(n.color)||typeof n.solid!=='boolean')return false;
  if(n.mirror&&(!Array.isArray(n.mirror)||n.mirror.length!==3||n.mirror.some(v=>v!==1&&v!==-1)))return false;
  if(n.segments&&(!Number.isInteger(n.segments)||n.segments<3||n.segments>512))return false;
  if(n.font!==undefined&&!(/^(regular|bold|serif|free-[a-z0-9-]+|custom-[a-f0-9]{64})$/.test(n.font)))return false;
  if(n.notes!==undefined&&(typeof n.notes!=='string'||n.notes.length>4000))return false;if(n.opacity!==undefined&&(!Number.isFinite(n.opacity)||n.opacity<.05||n.opacity>1))return false;if(n.multicolor!==undefined&&typeof n.multicolor!=='boolean')return false;
  if(n.suppressed!==undefined&&typeof n.suppressed!=='boolean')return false;
  if(n.aiMarks!==undefined&&!validMarks(n.aiMarks))return false;
  if(n.sketch!==undefined&&(n.type!=='sketch'||!n.mesh||!validSketch(n.sketch)||!['sketchSize','sketchCenter'].every(k=>Array.isArray(n[k])&&n[k].length===3&&n[k].every(v=>typeof v==='number'&&Number.isFinite(v)))||n.sketchSize.some(v=>v<.01||v>10000)))return false;
  if(n.type==='sketch'&&!n.sketch)return false;
  if(n.cad!==undefined&&(!n.mesh||!validCad(n.cad)))return false;
  if(n.edgeFinish!==undefined&&(!n.children?.length||!n.operation||!validFinish(n.edgeFinish)))return false;
  if(n.operation!==undefined&&(!['union','intersection','partition'].includes(n.operation)||!n.children?.length||!n.mesh))return false;
  if(!validPartition(n,meshValidator))return false;
  if(!validParameters(n))return false;
  if(n.parameterSize&&(!Array.isArray(n.parameterSize)||n.parameterSize.length!==3||n.parameterSize.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<.01||v>10000)))return false;
  if(n.mesh&&!meshValidator(n.mesh))return false;
  if(!n.mesh&&!SHAPES.some(s=>s[0]===n.type))return false;
  if(n.children&&(!Array.isArray(n.children)||n.children.length>500||!n.children.every(c=>validNode(c,depth+1,{meshValidator}))||!Array.isArray(n.baseSize)||n.baseSize.length!==3||!n.baseSize.every(v=>Number.isFinite(v)&&v>0)))return false;
  return true;
}
