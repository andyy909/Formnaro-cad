// Geometry is independent of the UI so solid modelling can be verified directly.
import {defaults,SCHEMAS,GENERATORS,validParameters} from './parameters.js';
import {buildParametric} from './parametric-geometry.js';
import {validCad,validFinish} from './cad-data.js';
let kernel;
export function setKernel(module) { kernel = module; }
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
export function meshData(m) {const mesh=m.getMesh(), verts=[];for(let i=0;i<mesh.vertProperties.length;i+=mesh.numProp)verts.push(...mesh.vertProperties.slice(i,i+3));return {verts,triangles:Array.from(mesh.triVerts)};}
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
export function booleanManifold(nodes, operation='union') {
  const solids=[],holes=[];
  try{
    for(const n of nodes)(n.solid?solids:holes).push(worldManifold(n));
    if(!solids.length)throw new Error('Wähle mindestens einen Körper aus.');
    let m=operation==='intersection'?kernel.Manifold.intersection(solids):kernel.Manifold.union(solids);
    if(holes.length){try{m=replace(m,kernel.Manifold.difference([m,...holes]));}catch(e){m.delete();throw e;}}
    if(m.isEmpty()){m.delete();throw new Error('Die Operation ergibt keinen Körper.');}
    return m;
  } finally {solids.forEach(m=>m.delete());holes.forEach(m=>m.delete());}
}
export function groupNodes(nodes, operation='union') {
  const result=normalize(booleanManifold(nodes,operation));
  try {
    const children=structuredClone(nodes).map(n=>({...n,pos:n.pos.map((v,i)=>v-result.center[i])}));
    const group=makeNode('group',result.center,{name:operation==='intersection'?'Schnittmenge':'Gruppe',size:result.size,
      color:nodes.find(n=>n.solid)?.color||'#ed6a48',mesh:meshData(result.manifold),children,baseSize:[...result.size],operation});
    if(!validNode(group))throw new Error('Die Gruppierung erzeugt ein zu großes Teil. Maße, Anzahl oder Qualität verringern.');
    return group;
  } finally {result.manifold.delete();}
}
export function stlBinary(m) {
  const data=meshData(m),n=data.triangles.length/3,buffer=new ArrayBuffer(84+n*50),view=new DataView(buffer);
  new Uint8Array(buffer,0,80).set(new TextEncoder().encode('Formnaro | millimeters | local solid model'));view.setUint32(80,n,true);
  for(let t=0;t<n;t++){
    const points=data.triangles.slice(t*3,t*3+3).map(i=>data.verts.slice(i*3,i*3+3));
    const a=points[1].map((v,i)=>v-points[0][i]),b=points[2].map((v,i)=>v-points[0][i]);
    let normal=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],len=Math.hypot(...normal)||1;normal=normal.map(v=>v/len);
    [...normal,...points.flat()].forEach((v,i)=>view.setFloat32(84+t*50+i*4,v,true));
  }return buffer;
}
export function objString(m) {const d=meshData(m);return '# Formnaro – mm\n'+Array.from({length:d.verts.length/3},(_,i)=>'v '+d.verts.slice(i*3,i*3+3).join(' ')).join('\n')+'\n'+Array.from({length:d.triangles.length/3},(_,i)=>'f '+d.triangles.slice(i*3,i*3+3).map(n=>n+1).join(' ')).join('\n');}
export function validNode(n,depth=0) {
  if(!n||depth>12||typeof n.id!=='string'||typeof n.name!=='string'||!n.name||n.name.length>200||typeof n.type!=='string')return false;
  if(!['size','pos','rot'].every(k=>Array.isArray(n[k])&&n[k].length===3&&n[k].every(v=>typeof v==='number'&&Number.isFinite(v))))return false;
  if(n.size.some(v=>v<.01||v>10000)||n.pos.some(v=>Math.abs(v)>100000)||n.rot.some(v=>Math.abs(v)>100000))return false;
  if(!/^#[\da-f]{6}$/i.test(n.color)||typeof n.solid!=='boolean')return false;
  if(n.mirror&&(!Array.isArray(n.mirror)||n.mirror.length!==3||n.mirror.some(v=>v!==1&&v!==-1)))return false;
  if(n.segments&&(!Number.isInteger(n.segments)||n.segments<3||n.segments>512))return false;
  if(n.font!==undefined&&!['regular','bold','serif'].includes(n.font))return false;
  if(n.notes!==undefined&&(typeof n.notes!=='string'||n.notes.length>4000))return false;if(n.opacity!==undefined&&(!Number.isFinite(n.opacity)||n.opacity<.05||n.opacity>1))return false;if(n.multicolor!==undefined&&typeof n.multicolor!=='boolean')return false;
  if(n.suppressed!==undefined&&typeof n.suppressed!=='boolean')return false;
  if(n.cad!==undefined&&(!n.mesh||!validCad(n.cad)))return false;
  if(n.edgeFinish!==undefined&&(!n.children?.length||!n.operation||!validFinish(n.edgeFinish)))return false;
  if(n.operation!==undefined&&(!['union','intersection'].includes(n.operation)||!n.children?.length||!n.mesh))return false;
  if(!validParameters(n))return false;
  if(n.parameterSize&&(!Array.isArray(n.parameterSize)||n.parameterSize.length!==3||n.parameterSize.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<.01||v>10000)))return false;
  if(n.mesh){const {verts,triangles}=n.mesh;if(!Array.isArray(verts)||!Array.isArray(triangles)||verts.length>3000000||triangles.length>6000000||verts.length%3||triangles.length%3||!verts.every(Number.isFinite)||!triangles.every(v=>Number.isInteger(v)&&v>=0&&v<verts.length/3))return false;}
  if(!n.mesh&&!SHAPES.some(s=>s[0]===n.type))return false;
  if(n.children&&(!Array.isArray(n.children)||n.children.length>500||!n.children.every(c=>validNode(c,depth+1))||!Array.isArray(n.baseSize)||n.baseSize.length!==3||!n.baseSize.every(v=>Number.isFinite(v)&&v>0)))return false;
  return true;
}
