// Reconstruct native polynomial surfaces from measured STL positions/normals.
// Cubic triangular Bernstein patches (PN construction) are converted exactly
// to tensor-product B-splines; no display mesh is used as a CAD solid.
// Reference: Vlachos et al., Curved PN Triangles, DOI 10.1145/364338.364387.
import {validateCadSolid,writeCadBrep} from './cad-native-kernel.js';
import {CAD_PROJECT_LIMITS} from './cad-project.js';

export const STL_CAD_LIMITS=Object.freeze({triangles:40000,displacement:.02,surfaceTolerance:.25,criticalTolerance:.1,weld:.000001});
export function stlError(code,message){const error=Error(message);error.code=code;return error;}
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),scale=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=a=>Math.hypot(...a);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>scale(a,1/norm(a));
const edgeKey=(a,b)=>a<b?a+':'+b:b+':'+a;

export function inspectStlMesh(mesh){
  const {verts,triangles}=mesh??{};
  if(!Array.isArray(verts)||!Array.isArray(triangles)||!verts.length||verts.length%3||triangles.length%3||triangles.length<12||verts.some(v=>!Number.isFinite(v))||triangles.some(i=>!Number.isSafeInteger(i)||i<0||i>=verts.length/3))throw stlError('STL_INVALID','STL enthält ungültige Koordinaten oder Dreiecke.');
  if(triangles.length/3>STL_CAD_LIMITS.triangles||verts.length>360000)throw stlError('STL_LIMIT','CAD-Rekonstruktion unterstützt höchstens 40.000 STL-Dreiecke. Die Netzreferenz bleibt verfügbar.');
  const points=[],lookup=new Map(),ids=[],step=STL_CAD_LIMITS.weld;let weldError=0;
  for(let i=0;i<verts.length;i+=3){const p=verts.slice(i,i+3),key=p.map(v=>Math.round(v/step)).join(','),existing=lookup.get(key);if(existing!==undefined){ids.push(existing);weldError=Math.max(weldError,norm(sub(points[existing],p)));}else{lookup.set(key,points.length);ids.push(points.length);points.push(p);}}
  const faces=[],edges=new Map(),incident=points.map(()=>[]);let signedVolume=0;
  for(let i=0;i<triangles.length;i+=3){const indices=triangles.slice(i,i+3).map(id=>ids[id]),[a,b,c]=indices.map(id=>points[id]),normal=cross(sub(b,a),sub(c,a)),length=norm(normal);
    if(new Set(indices).size<3||length<1e-12)throw stlError('STL_INVALID','STL enthält Nullflächen. Eine Reparatur ist vor der CAD-Rekonstruktion erforderlich.');
    const face={indices,normal:scale(normal,1/length),area:length/2};const index=faces.length;faces.push(face);indices.forEach(id=>incident[id].push(index));
    // Integrate about a nearby vertex, avoiding cancellation at large offsets.
    signedVolume+=dot(sub(a,points[0]),cross(sub(b,points[0]),sub(c,points[0])))/6;
    for(let j=0;j<3;j++){const a=indices[j],b=indices[(j+1)%3],key=edgeKey(a,b),entry=edges.get(key)||{a:Math.min(a,b),b:Math.max(a,b),faces:[],orientation:0};entry.faces.push(index);entry.orientation+=a<b?1:-1;edges.set(key,entry);}
  }
  if([...edges.values()].some(e=>e.faces.length!==2||e.orientation!==0))throw stlError('STL_INVALID','STL muss geschlossen, zweimannigfaltig und einheitlich orientiert sein.');
  if(!Number.isFinite(signedVolume)||Math.abs(signedVolume)<1e-9)throw stlError('STL_INVALID','STL besitzt kein endliches Körpervolumen.');
  if(signedVolume<0){for(const face of faces){[face.indices[1],face.indices[2]]=[face.indices[2],face.indices[1]];face.normal=scale(face.normal,-1);}}
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];points.forEach(p=>p.forEach((v,i)=>{min[i]=Math.min(min[i],v);max[i]=Math.max(max[i],v);}));
  const size=min.map((v,i)=>max[i]-v);if(size.some(v=>v<.01||v>10000)||[...min,...max].some(v=>Math.abs(v)>100000))throw stlError('STL_LIMIT','STL liegt außerhalb des CAD-Arbeitsbereichs.');
  const neighbors=faces.map(()=>[]);for(const edge of edges.values()){const [a,b]=edge.faces;neighbors[a].push(b);neighbors[b].push(a);}
  const visited=new Set([0]),queue=[0];for(let i=0;i<queue.length;i++)for(const next of neighbors[queue[i]])if(!visited.has(next)){visited.add(next);queue.push(next);}
  if(visited.size!==faces.length)throw stlError('STL_UNSUPPORTED','STL enthält mehrere getrennte Hüllen. Diese Gehäuserekonstruktion benötigt einen zusammenhängenden Körper.');
  return {points,faces,edges,incident,neighbors,bounds:{min,max},size,volume:Math.abs(signedVolume),weldError};
}

function cappedControl(point,linear,limit){const delta=sub(point,linear),length=norm(delta);return length>limit?add(linear,scale(delta,limit/length)):point;}
function cornerNormals(model){
  const {points,faces,edges}=model,parent=Array.from({length:faces.length*3},(_,i)=>i),find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;},join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a;};
  for(const edge of edges.values()){const [a,b]=edge.faces;if(dot(faces[a].normal,faces[b].normal)<Math.cos(35*Math.PI/180))continue;for(const vertex of [edge.a,edge.b])join(a*3+faces[a].indices.indexOf(vertex),b*3+faces[b].indices.indexOf(vertex));}
  const sums=new Map();faces.forEach((face,index)=>face.indices.forEach((id,corner)=>{const p=points[id],v1=unit(sub(points[face.indices[(corner+1)%3]],p)),v2=unit(sub(points[face.indices[(corner+2)%3]],p)),angle=Math.acos(Math.max(-1,Math.min(1,dot(v1,v2)))),key=find(index*3+corner);sums.set(key,add(sums.get(key)||[0,0,0],scale(face.normal,angle)));}));
  return faces.map((face,index)=>face.indices.map((_,corner)=>unit(sums.get(find(index*3+corner)))));
}
// Indices are powers of barycentric coordinates (a,b,c), with total degree 3.
const EXPONENTS=[[3,0,0],[0,3,0],[0,0,3],[2,1,0],[1,2,0],[0,2,1],[0,1,2],[1,0,2],[2,0,1],[1,1,1]];
const MULTIPLIERS=[1,1,1,3,3,3,3,3,3,6];
function orientationBound(controls,normal){
  const powers=[[2,0,0],[1,1,0],[1,0,1],[0,2,0],[0,1,1],[0,0,2]],weights=[1,2,2,1,2,1],lookup=new Map(EXPONENTS.map((p,i)=>[p.join(','),controls[i]])),du=[],dv=[];
  for(const [i,j,k]of powers){du.push(scale(sub(lookup.get([i,j+1,k].join(',')),lookup.get([i+1,j,k].join(','))),3));dv.push(scale(sub(lookup.get([i,j,k+1].join(',')),lookup.get([i+1,j,k].join(','))),3));}
  const factorial=[1,1,2,6,24],coefficients=new Map();for(let a=0;a<6;a++)for(let b=0;b<6;b++){const exp=powers[a].map((v,k)=>v+powers[b][k]),key=exp.join(','),mult=24/exp.reduce((v,e)=>v*factorial[e],1),value=dot(cross(du[a],dv[b]),normal)*weights[a]*weights[b]/mult;coefficients.set(key,(coefficients.get(key)||0)+value);}
  return Math.min(...coefficients.values());
}
export function stlPatchValue(controls,s,t){const weights=[(1-s)*(1-t),s*(1-t),t],out=[0,0,0];EXPONENTS.forEach((exp,i)=>{const w=MULTIPLIERS[i]*exp.reduce((v,e,k)=>v*weights[k]**e,1);for(let k=0;k<3;k++)out[k]+=controls[i][k]*w;});return out;}
const INVERSE=[[1,0,0,0],[-5/6,3,-1.5,1/3],[1/3,-1.5,3,-5/6],[0,0,0,1]];
export function stlPatchTensor(controls){
  const samples=Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>stlPatchValue(controls,i/3,j/3))),temp=Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>[0,1,2].map(k=>INVERSE[i].reduce((sum,v,q)=>sum+v*samples[q][j][k],0))));
  return Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>[0,1,2].map(k=>INVERSE[j].reduce((sum,v,q)=>sum+v*temp[i][q][k],0))));
}
export function reconstructStlPatches(mesh){
  const model=inspectStlMesh(mesh),normals=cornerNormals(model),edgeControls=new Map();
  for(const [key,edge]of model.edges){const {a,b}=edge,p=model.points[a],q=model.points[b],[left,right]=edge.faces,ln=model.faces[left].normal,rn=model.faces[right].normal;
    const linearP=scale(add(scale(p,2),q),1/3),linearQ=scale(add(scale(q,2),p),1/3),limit=Math.min(STL_CAD_LIMITS.displacement,norm(sub(p,q))*.08);
    let first=linearP,second=linearQ,best=0;
    for(const faceId of [left,right]){
      const na=normals[faceId][model.faces[faceId].indices.indexOf(a)],nb=normals[faceId][model.faces[faceId].indices.indexOf(b)],cp=cappedControl(sub(linearP,scale(na,dot(sub(q,p),na)/3)),linearP,limit),cq=cappedControl(sub(linearQ,scale(nb,dot(sub(p,q),nb)/3)),linearQ,limit),score=norm(sub(cp,linearP))+norm(sub(cq,linearQ));
      if(score>best){first=cp;second=cq;best=score;}
    }
    edgeControls.set(key,{a,b,first,second,linearP,linearQ,factor:1});
  }
  const makePatch=face=>{
    const [a,b,c]=face.indices,vertices=face.indices.map(id=>model.points[id]),controls=[...vertices];
    for(const [from,to]of [[a,b],[b,c],[c,a]]){const e=edgeControls.get(edgeKey(from,to)),first=add(e.linearP,scale(sub(e.first,e.linearP),e.factor)),second=add(e.linearQ,scale(sub(e.second,e.linearQ),e.factor));controls.push(e.a===from?first:second,e.a===from?second:first);}
    // Edge order c->a supplies b102 then b201, matching EXPONENTS above.
    const linear=EXPONENTS.map(exp=>[0,1,2].map(k=>exp.reduce((sum,v,i)=>sum+v*vertices[i][k]/3,0))),average=scale(controls.slice(3).reduce(add,[0,0,0]),1/6),centroid=linear[9];
    controls.push(cappedControl(add(average,scale(sub(average,centroid),.5)),centroid,STL_CAD_LIMITS.displacement));
    const displacement=Math.max(...controls.map((p,i)=>norm(sub(p,linear[i])))),jacobian=orientationBound(controls,face.normal);
    const planar=controls.every(p=>Math.abs(dot(sub(p,vertices[0]),face.normal))<1e-8);
    return {controls,linear:displacement<=1e-9,planar,indices:face.indices,displacement,jacobian};
  };
  let patches;const limited=new Set();
  for(let attempt=0;attempt<=16;attempt++){
    patches=model.faces.map(makePatch);const bad=patches.flatMap((p,i)=>p.jacobian<=Math.max(1e-14,2*model.faces[i].area*.05)?[i]:[]);if(!bad.length)break;
    if(attempt===16)throw stlError('STL_UNSUPPORTED','Ein Kurvenpatch würde sich falten; dieses Netz wird nicht rekonstruiert.');
    const affected=new Set();for(const i of bad){limited.add(i);const ids=model.faces[i].indices;for(let j=0;j<3;j++)affected.add(edgeKey(ids[j],ids[(j+1)%3]));}for(const key of affected)edgeControls.get(key).factor*=.5;
  }
  const bound=Math.max(model.weldError,...patches.map(p=>p.displacement+model.weldError)),curved=patches.filter(p=>!p.linear).length,minimumJacobianRatio=Math.min(...patches.map((p,i)=>p.jacobian/(2*model.faces[i].area)));
  return {...model,patches,quality:{method:'Bernstein-correspondence-bound',surfaceBound:bound+1e-5,criticalBound:2*bound+2e-5,tolerance:STL_CAD_LIMITS.surfaceTolerance,minimumJacobianRatio,localOrientationCertified:true,limitedPatches:limited.size,curvedPatches:curved,inputTriangles:model.faces.length}};
}

function nativeArray(oc,owned,type,values){const array=new oc[type](1,values.length);owned.push(array);values.forEach((v,i)=>array.SetValue(i+1,v));return array;}
function nativeTolerance(oc,shape){let maximum=0;for(const [type,cast]of [['TopAbs_FACE','Face'],['TopAbs_EDGE','Edge'],['TopAbs_VERTEX','Vertex']]){const explorer=new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum[type]);try{while(explorer.More()){const raw=explorer.Current(),item=oc.TopoDS[cast](raw);try{const value=oc.BRep_Tool.Tolerance(item);if(!Number.isFinite(value)||value<0)throw stlError('STL_QUALITY','CAD-Flächen besitzen keine endliche Toleranz.');maximum=Math.max(maximum,value);}finally{item.delete();raw.delete();}explorer.Next();}}finally{explorer.delete();}}return maximum;}
export function buildStlSurfaceCad(oc,definition){
  const {patches,quality,volume}=definition;
  if(quality.surfaceBound>STL_CAD_LIMITS.surfaceTolerance||quality.criticalBound>STL_CAD_LIMITS.criticalTolerance)throw stlError('STL_QUALITY','Die CAD-Flächen überschreiten die zulässige STL-Abweichung.');
  const owned=new Set(),keep=value=>(owned.add(value),value),release=value=>{if(owned.delete(value))value.delete();},sewing=keep(new oc.BRepBuilderAPI_Sewing(1e-6));
  try{
    for(const patch of patches){const local=[],use=value=>(local.push(value),value);try{
      let face;
      if(patch.planar){const maker=use(new oc.BRepBuilderAPI_MakeWire());for(let i=0;i<3;i++){const points=[patch.controls[i],patch.controls[3+2*i],patch.controls[4+2*i],patch.controls[(i+1)%3]],poles=use(new oc.NCollection_Array1_gp_Pnt(1,4));points.forEach((p,k)=>poles.SetValue(k+1,use(new oc.gp_Pnt(...p))));const curve=use(new oc.Geom_BezierCurve(poles));maker.Add(use(use(new oc.BRepBuilderAPI_MakeEdge(curve)).Edge()));}face=use(use(new oc.BRepBuilderAPI_MakeFace(use(maker.Wire()),true)).Face());}
      else{const tensor=stlPatchTensor(patch.controls),poles=use(new oc.NCollection_Array2_gp_Pnt(1,4,1,4));tensor.forEach((row,i)=>row.forEach((p,j)=>poles.SetValue(i+1,j+1,use(new oc.gp_Pnt(...p)))));
        const knots=nativeArray(oc,local,'NCollection_Array1_double',[0,1]),mult=nativeArray(oc,local,'NCollection_Array1_int',[4,4]),surface=use(new oc.Geom_BSplineSurface(poles,knots,knots,mult,mult,3,3,false,false)),maker=use(new oc.BRepBuilderAPI_MakeFace(surface,1e-7));if(!maker.IsDone())throw stlError('STL_UNSUPPORTED','Eine gekrümmte CAD-Fläche konnte nicht aufgebaut werden.');face=use(maker.Face());}
      sewing.Add(face);
    }finally{for(const value of local.reverse())value.delete();}}
    sewing.Perform();if(sewing.NbFreeEdges()||sewing.NbMultipleEdges())throw stlError('STL_UNSUPPORTED','Die rekonstruierten CAD-Flächen bilden keine eindeutige geschlossene Hülle.');
    let sewn=keep(sewing.SewedShape());release(sewing);
    const unify=keep(new oc.ShapeUpgrade_UnifySameDomain(sewn,true,true,false));unify.Build();const unified=keep(unify.Shape());release(unify);release(sewn);sewn=unified;
    const explorer=keep(new oc.TopExp_Explorer(sewn,oc.TopAbs_ShapeEnum.TopAbs_SHELL));if(!explorer.More())throw stlError('STL_UNSUPPORTED','Rekonstruktion enthält keine CAD-Hülle.');const raw=keep(explorer.Current()),shell=keep(oc.TopoDS.Shell(raw));explorer.Next();if(explorer.More())throw stlError('STL_UNSUPPORTED','Rekonstruktion enthält mehrere CAD-Hüllen.');
    const maker=keep(new oc.BRepBuilderAPI_MakeSolid(shell)),solid=keep(maker.Solid());
    // Solid retains shared topology; construction maps and wrappers can go now.
    for(const value of [maker,shell,raw,explorer,sewn])release(value);
    if(!oc.BRepLib.OrientClosedSolid(solid))throw stlError('STL_INVALID','Die CAD-Hülle lässt sich nicht eindeutig orientieren.');
    const tolerance=nativeTolerance(oc,solid);if(tolerance>5e-6)throw stlError('STL_QUALITY','Native CAD-Toleranz überschreitet das reservierte Rekonstruktionsbudget.');
    const checked=validateCadSolid(oc,solid),data=writeCadBrep(oc,solid),delta=Math.abs(checked.volume/volume-1);if(checked.solids!==1||delta>.01)throw stlError('STL_QUALITY','CAD-Körper überschreitet die zulässige Volumenabweichung von 1 %.');
    if(new TextEncoder().encode(data).length>CAD_PROJECT_LIMITS.brepBytes)throw stlError('STL_LIMIT','Rekonstruierte CAD-Flächen überschreiten das Projektlimit.');
    return {brep:{format:'OpenCascade-BRep',data,triangulation:false},stats:{bounds:{min:checked.bounds.min,max:checked.bounds.max},volume:checked.volume,solids:checked.solids},quality:{...quality,nativeTolerance:tolerance,volumeDeviation:delta}};
  }catch(error){if(!error.code)error.code='STL_UNSUPPORTED';throw error;}
  finally{for(const value of [...owned].reverse())value.delete();}
}
