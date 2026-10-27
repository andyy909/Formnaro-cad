// Build measured planar CAD faces with explicit shared native topology.
// A position alone is not a vertex identity: separate surface fans can touch
// at the same STL coordinate. Sewing by distance would merge those fans again.
import {validateCadSolid,writeCadBrep} from './cad-native-kernel.js';
import {CAD_PROJECT_LIMITS} from './cad-project.js';

export function stlVertexFans(model){
  const parent=Array.from({length:model.faces.length*3},(_,i)=>i);
  const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  for(const edge of model.edges.values())for(const vertex of [edge.a,edge.b]){
    const [a,b]=edge.faces,left=find(a*3+model.faces[a].indices.indexOf(vertex)),right=find(b*3+model.faces[b].indices.indexOf(vertex));parent[left]=right;
  }
  const corners=parent.map((_,i)=>find(i)),count=new Set(corners).size;
  return {corners,count,splitVertices:count-model.points.length};
}

export function buildStlFacetedCad(oc,model){
  const fans=stlVertexFans(model),owned=new Set(),keep=x=>(owned.add(x),x),release=x=>{if(owned.delete(x))x.delete();},vertices=new Map(),edges=new Map();
  const builder=keep(new oc.TopoDS_Builder()),shell=keep(new oc.TopoDS_Shell());builder.MakeShell(shell);
  try{
    for(let i=0;i<model.faces.length;i++){
      const face=model.faces[i],ids=face.indices.map((v,c)=>{
        const id=fans.corners[i*3+c];if(!vertices.has(id)){const point=new oc.gp_Pnt(...model.points[v]);let maker;try{maker=new oc.BRepBuilderAPI_MakeVertex(point);vertices.set(id,keep(maker.Vertex()));}finally{maker?.delete();point.delete();}}return id;
      }),wireMaker=new oc.BRepBuilderAPI_MakeWire();let wire,maker,nativeFace;
      try{
        for(let k=0;k<3;k++){
          const a=ids[k],b=ids[(k+1)%3],key=a<b?a+':'+b:b+':'+a;
          if(!edges.has(key)){const edgeMaker=new oc.BRepBuilderAPI_MakeEdge(vertices.get(Math.min(a,b)),vertices.get(Math.max(a,b)));try{if(!edgeMaker.IsDone())throw Error('Eine STL-Kante konnte nicht als CAD-Gerade aufgebaut werden.');edges.set(key,keep(edgeMaker.Edge()));}finally{edgeMaker.delete();}}
          if(a<b)wireMaker.Add(edges.get(key));else{const raw=edges.get(key).Reversed();let edge;try{edge=oc.TopoDS.Edge(raw);wireMaker.Add(edge);}finally{edge?.delete();raw.delete();}}
        }
        if(!wireMaker.IsDone())throw Error('Eine STL-Fläche besitzt keinen geschlossenen CAD-Rand.');
        wire=wireMaker.Wire();maker=new oc.BRepBuilderAPI_MakeFace(wire,true);if(!maker.IsDone())throw Error('Eine STL-Fläche konnte nicht als CAD-Ebene aufgebaut werden.');nativeFace=maker.Face();builder.Add(shell,nativeFace);
      }finally{nativeFace?.delete();maker?.delete();wire?.delete();wireMaker.delete();}
    }
    const maker=keep(new oc.BRepBuilderAPI_MakeSolid(shell));let solid=keep(maker.Solid());
    for(const value of [...edges.values(),...vertices.values(),maker,shell,builder])release(value);
    if(!oc.BRepLib.OrientClosedSolid(solid))throw Error('Die STL-Flächen lassen sich nicht als geschlossener CAD-Körper orientieren.');
    // Merging is an optimization only. Never replace a valid body by an invalid
    // result (notably at pinched vertices or nearly coplanar STL facets).
    let checked=validateCadSolid(oc,solid),merged=false;
    const unify=keep(new oc.ShapeUpgrade_UnifySameDomain(solid,true,true,false));let candidate;
    try{unify.SetSafeInputMode(true);unify.SetLinearTolerance(1e-9);unify.SetAngularTolerance(1e-9);unify.Build();candidate=keep(unify.Shape());const proof=validateCadSolid(oc,candidate);if(Math.abs(proof.volume/checked.volume-1)<=1e-7){release(solid);solid=candidate;checked=proof;merged=true;candidate=null;}}
    catch(error){if(error instanceof WebAssembly.RuntimeError)throw error;/* Keep the independently validated original topology. */}
    finally{if(candidate)release(candidate);release(unify);}
    const delta=Math.abs(checked.volume/model.volume-1),data=writeCadBrep(oc,solid);
    if(checked.solids!==1||delta>.01)throw Error('STL-CAD-Körper überschreitet die zulässige Volumenabweichung von 1 %.');
    if(new TextEncoder().encode(data).length>CAD_PROJECT_LIMITS.brepBytes){const error=Error('STL-CAD-Flächen überschreiten das Projektlimit.');error.code='STL_LIMIT';throw error;}
    // Reserve the same native construction budget as the smooth path, plus
    // the angular/linear merge budget across the entire measured model size.
    const surfaceBound=model.weldError+1e-5+(merged?Math.hypot(...model.size)*1e-9+1e-9:0);
    return {brep:{format:'OpenCascade-BRep',data,triangulation:false},stats:{bounds:{min:checked.bounds.min,max:checked.bounds.max},volume:checked.volume,solids:checked.solids},quality:{method:'native-planar-STL-faces',curvedPatches:0,inputTriangles:model.faces.length,splitVertices:fans.splitVertices,mergedPlanes:merged,surfaceBound,criticalBound:2*surfaceBound,volumeDeviation:delta}};
  }finally{for(const value of [...owned].reverse())value.delete();}
}
