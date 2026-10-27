import {booleanManifold,fromMesh,meshData,normalizeMesh,matrixArray,validNode} from './geometry.js';
let historyFinisher;
export function setHistoryFinisher(fn){historyFinisher=fn;}

// Children are in the physical, unscaled group frame. Recentring a rebuilt
// mesh must move the parent frame and every child together, preserving all
// unaffected source positions even after rotated/nonuniform/mirrored scaling.
export function rebuildGroup(node){
  if(!node.operation)throw new Error('Diese alte Gruppe hat keine überprüfbare Modellhistorie.');
  let result=booleanManifold(node.children.filter(c=>!c.suppressed),node.operation);
  try{
    if(node.edgeFinish){if(!historyFinisher)throw Error('CAD-Kern für die Kantenbearbeitung noch nicht geladen.');const finished=historyFinisher(node,result);result.delete();result=finished;}
    const box=result.boundingBox(),center=box.min.map((v,i)=>(v+box.max[i])/2);
    const normalized=normalizeMesh(meshData(result));
    if(normalized.size.some(v=>v<.01||v>10000)||normalized.mesh.verts.length>3000000||normalized.mesh.triangles.length>6000000)throw new Error('Die Modellhistorie erzeugt ein zu großes Teil. Maße oder Qualität verringern.');
    const scale=node.size.map((v,i)=>v/node.baseSize[i]),matrix=matrixArray({...node,size:scale});
    const pos=[0,1,2].map(i=>matrix[12+i]+center.reduce((sum,v,j)=>sum+matrix[j*4+i]*v,0));
    const size=normalized.size.map((v,i)=>v*scale[i]);
    if(size.some(v=>v<.01||v>10000)||pos.some(v=>Math.abs(v)>100000))throw new Error('Das berechnete Teil liegt außerhalb des zulässigen Arbeitsbereichs.');
    node.pos=pos;node.size=size;node.baseSize=normalized.size;node.mesh=normalized.mesh;
    for(const child of node.children)child.pos=child.pos.map((v,i)=>v-center[i]);
  }finally{result.delete();}
}

// Old projects omitted the operation. Verify the entire solid, not just its
// volume or its editable display name, before enabling live source editing.
export function inferOperation(node){
  const normalized=fromMesh(node.mesh),stored=normalized.scale(node.baseSize);normalized.delete();
  try{
    const candidates=node.name==='Schnittmenge'?['intersection','union']:['union','intersection'];
    for(const operation of candidates){let candidate,a,b;
      try{
        candidate=booleanManifold(node.children,operation);
        a=stored.subtract(candidate);b=candidate.subtract(stored);
        if(Math.abs(a.volume())+Math.abs(b.volume())<Math.max(1e-4,Math.abs(stored.volume())*1e-5))return operation;
      }catch{/* An old cached group remains usable even without editable sources. */}
      finally{a?.delete();b?.delete();candidate?.delete();}
    }
    return null;
  }finally{stored.delete();}
}

const signatures=new WeakMap();
function signature(node){return JSON.stringify([node.operation,node.edgeFinish,node.children.map(c=>({type:c.type,size:c.size,pos:c.pos,rot:c.rot,mirror:c.mirror,solid:c.solid,segments:c.segments,params:c.params,mesh:c.mesh,suppressed:c.suppressed}))]);}
// Internal snapshots and checked worker results only. External files retain
// synchronizeHistory(upgrade:true) and full geometry validation.
export function adoptComputedHistory(nodes,baseline=nodes){
  const previous=new Map();function collect(n){previous.set(n.id,n);for(const c of n.children||[])collect(c);}baseline.forEach(collect);
  function visit(n){if(n.children){const old=previous.get(n.id);if(old?.children&&old.operation)signatures.set(n,signature(old));n.children.forEach(visit);}}nodes.forEach(visit);
}
export function synchronizeHistory(nodes,{upgrade=false}={}){
  let count=0;const allIds=new Set();
  function visit(node,depth){
    if(++count>5000||depth>12)throw new Error('Die Modellhistorie unterstützt maximal 5000 Formen und 12 Gruppenebenen.');
    if(allIds.has(node.id))throw new Error('Doppelte Formkennung im Projekt.');allIds.add(node.id);
    if(!validNode(node,depth))throw new Error('Ungültige Form in der Modellhistorie.');
    if(!node.children)return;
    const ids=new Set();for(const child of node.children){if(ids.has(child.id))throw new Error('Doppelte Formkennung innerhalb einer Gruppe.');ids.add(child.id);visit(child,depth+1);}
    if(!node.operation&&upgrade){const op=inferOperation(node);if(op)node.operation=op;}
    if(!node.operation)return;
    if(signatures.get(node)!==signature(node))rebuildGroup(node);
    signatures.set(node,signature(node));
  }
  for(const node of nodes)visit(node,0);
}

export function featureContext(nodes,selection){
  if(!selection)return null;
  const root=nodes.find(n=>n.id===selection.rootId);if(!root)return null;
  const chain=[root];let node=root;
  for(const id of selection.path){node=node.children?.find(c=>c.id===id);if(!node)return null;chain.push(node);}
  return {root,node,chain};
}
