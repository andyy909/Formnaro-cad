import OCModule from 'replicad-opencascadejs';
import {worldManifold,meshData,stlBinary,fromMesh,normalizeMesh,matrixArray,groupNodes,validNode} from './geometry.js';
import {setHistoryFinisher,rebuildGroup} from './history.js';
import {meshHash,validFinish} from './cad-data.js';

let oc,ready,sequence=0;
const MAX_FACES=40000;
export function initCad(wasmUrl){
  return ready??=(async()=>{
    const config={print:()=>{},printErr:()=>{}};
    if(wasmUrl)config.wasmBinary=new Uint8Array(await(await fetch(wasmUrl)).arrayBuffer());
    oc=await OCModule(config);setHistoryFinisher(finishGroup);return oc;
  })().catch(e=>{ready=null;throw e;});
}
function scope(){const objects=[];return {keep:o=>(objects.push(o),o),release:o=>(objects.splice(objects.indexOf(o),1),o),close:()=>{for(const o of objects.reverse())o?.delete?.();}};}
function uniqueShapes(shape,type){
  const ex=new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum[type]),list=[],buckets=new Map();
  try{while(ex.More()){const s=ex.Current(),key=oc.ReplicadShapeHasher.HashCode(s,2147483647),bucket=buckets.get(key)||[];if(bucket.some(v=>v.IsSame(s)))s.delete();else{bucket.push(s);buckets.set(key,bucket);list.push(s);}ex.Next();if(list.length>MAX_FACES)throw Error('Zu viele CAD-Flächen. Qualität oder Modellumfang verringern.');}return list;}
  catch(e){list.forEach(s=>s.delete());throw e;}finally{ex.delete();}
}
function checkSolid(shape){
  if(shape.IsNull())throw Error('Die CAD-Operation ergibt keinen Körper.');
  const s=scope();try{
    const check=s.keep(new oc.BRepCheck_Analyzer(shape));if(!check.IsValid())throw Error('Keine gültige geschlossene CAD-Geometrie. Kleineren Radius oder andere Kanten wählen.');
    const solids=uniqueShapes(shape,'TopAbs_SOLID');solids.forEach(v=>s.keep(v));
    if(!solids.length)throw Error('Es werden geschlossene STEP-Körper benötigt; reine Flächen werden nicht importiert.');
    const props=s.keep(new oc.GProp_GProps());oc.BRepGProp.VolumeProperties(shape,props,true,false,false);
    if(!Number.isFinite(props.Mass())||props.Mass()<=1e-8)throw Error('Der CAD-Körper besitzt kein positives Volumen.');
    return {solids:solids.length,volume:props.Mass()};
  }finally{s.close();}
}
function rawMesh(shape){
  const raw=oc.ReplicadMeshExtractor.extract(shape,.015,.12,true);
  try{const buffer=oc.wasmMemory.buffer,verts=Array.from(new Float32Array(buffer,raw.getVerticesPtr()>>>0,raw.getVerticesSize())),triangles=Array.from(new Uint32Array(buffer,raw.getTrianglesPtr()>>>0,raw.getTrianglesSize()));
    if(triangles.length>6000000||verts.length>3000000)throw Error('Das CAD-Netz überschreitet die Projektgrenze.');return {verts,triangles};
  }finally{raw.delete();}
}
function boxOf(mesh){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<mesh.verts.length;i++) {const k=i%3;min[k]=Math.min(min[k],mesh.verts[i]);max[k]=Math.max(max[k],mesh.verts[i]);}return {min,max,size:min.map((v,k)=>max[k]-v),center:min.map((v,k)=>(max[k]+v)/2)};}
function transform(shape,matrix){
  const s=scope();try{const tr=s.keep(new oc.gp_Trsf());tr.SetValues(...[0,1,2].flatMap(r=>[matrix[r],matrix[4+r],matrix[8+r],matrix[12+r]]));const builder=s.keep(new oc.BRepBuilderAPI_Transform(shape,tr,true,false));return builder.Shape();}finally{s.close();}
}
function translate(shape,delta){return transform(shape,[1,0,0,0,0,1,0,0,0,0,1,0,...delta,1]);}
// Shells of a closed Manifold carry their orientation: negative-volume shells
// bound enclosed voids. Attach each void to the smallest enclosing outer shell.
function encloses(mesh,point){
  const dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  let angle=0;for(let i=0;i<mesh.triangles.length;i+=3){const [a,b,c]=mesh.triangles.slice(i,i+3).map(index=>mesh.verts.slice(index*3,index*3+3).map((v,k)=>v-point[k])),la=Math.hypot(...a),lb=Math.hypot(...b),lc=Math.hypot(...c);angle+=2*Math.atan2(dot(a,cross(b,c)),la*lb*lc+dot(a,b)*lc+dot(b,c)*la+dot(c,a)*lb);}
  return Math.abs(angle)>2*Math.PI;
}
function shapeFromManifold(manifold){
  if(manifold.numTri()>MAX_FACES)throw Error('Kantenbearbeitung/STEP-Netzumwandlung: maximal 40000 Dreiecke je Teil. Qualität verringern oder kleinere Teile bearbeiten.');
  const path='/formnaro-'+(++sequence)+'.stl',s=scope();
  try{
    oc.FS.writeFile(path,new Uint8Array(stlBinary(manifold)));
    const reader=s.keep(new oc.StlAPI_Reader()),raw=s.keep(new oc.TopoDS_Shape());if(!reader.Read(raw,path))throw Error('Das Netz konnte nicht in einen CAD-Körper umgewandelt werden.');
    const sewing=s.keep(new oc.BRepBuilderAPI_Sewing(1e-5));sewing.Add(raw);sewing.Perform();if(sewing.NbFreeEdges()||sewing.NbMultipleEdges())throw Error('Das Netz besitzt offene oder mehrdeutige Kanten.');
    const sewn=s.keep(sewing.SewedShape()),unify=s.keep(new oc.ShapeUpgrade_UnifySameDomain(sewn,true,true,false));unify.SetLinearTolerance(1e-6);unify.Build();
    const clean=s.keep(unify.Shape()),shells=uniqueShapes(clean,'TopAbs_SHELL');shells.forEach(v=>s.keep(v));if(!shells.length)throw Error('Keine geschlossene Hülle für die CAD-Bearbeitung gefunden.');
    const compound=s.keep(new oc.TopoDS_Compound()),builder=s.keep(new oc.TopoDS_Builder());builder.MakeCompound(compound);
    const props=s.keep(new oc.GProp_GProps()),parts=shells.map(sh=>{const shell=s.keep(oc.TopoDS.Shell(sh)),maker=s.keep(new oc.BRepBuilderAPI_MakeSolid(shell)),solid=s.keep(maker.Solid());oc.BRepGProp.VolumeProperties(solid,props,true,false,false);return {shell,volume:props.Mass(),mesh:rawMesh(solid),cavities:[]};});
    const outer=parts.filter(p=>p.volume>1e-8);
    for(const cavity of parts.filter(p=>p.volume< -1e-8)){const point=cavity.mesh.verts.slice(0,3),parent=outer.filter(p=>encloses(p.mesh,point)).sort((a,b)=>a.volume-b.volume)[0];if(!parent)throw Error('Eine innere CAD-Hülle konnte keinem Körper zugeordnet werden.');parent.cavities.push(cavity.shell);}
    for(const part of outer){const maker=s.keep(new oc.BRepBuilderAPI_MakeSolid(part.shell));for(const cavity of part.cavities)maker.Add(cavity);const solid=s.keep(maker.Solid());builder.Add(compound,solid);}
    oc.BRepGProp.VolumeProperties(compound,props,true,false,false);if(Math.abs(props.Mass()-manifold.volume())>Math.max(.02,Math.abs(manifold.volume())*1e-5))throw Error('Die CAD-Umwandlung würde das Körpervolumen verändern.');
    checkSolid(compound);return s.release(compound);
  }finally{s.close();try{oc.FS.unlink(path);}catch{}}
}
// CAD curves survive uniform scaling/rotation/mirroring. Affine mesh geometry
// is converted from the actual mesh, so no nonuniform transform is discarded.
export function shapeForNode(node){
  if(node.cad&&node.mesh&&node.cad.meshHash===meshHash(node.mesh)){
    const ratios=node.size.map((v,i)=>v/node.cad.size[i]);
    if(Math.max(...ratios)-Math.min(...ratios)<1e-8){const original=oc.BRepToolsWrapper.Read(node.cad.brep);try{return transform(original,matrixArray({...node,size:ratios}));}finally{original.delete();}}
  }
  const m=worldManifold(node);try{return shapeFromManifold(m);}finally{m.delete();}
}
function edgeRecords(shape){
  const raw=uniqueShapes(shape,'TopAbs_EDGE'),records=[];
  try{for(let i=0;i<raw.length;i++){
    const edge=oc.TopoDS.Edge(raw[i]),curve=new oc.BRepAdaptor_Curve(edge);
    try{const start=curve.FirstParameter(),end=curve.LastParameter();if(!Number.isFinite(start)||!Number.isFinite(end))throw Error('Unbegrenzte CAD-Kante.');
      const points=[];for(let k=0;k<=32;k++){const p=curve.Value(start+(end-start)*k/32);points.push([p.X(),p.Y(),p.Z()]);p.delete();}
      let length=0;for(let k=1;k<points.length;k++)length+=Math.hypot(...points[k].map((v,j)=>v-points[k-1][j]));
      if(length>1e-6)records.push({id:i,edge,points,length,curveType:curve.GetType().value});else edge.delete();
    }catch(e){edge.delete();throw e;}finally{curve.delete();}
  }return records;}catch(e){records.forEach(r=>r.edge.delete());throw e;}finally{raw.forEach(r=>r.delete());}
}
function anchor(record,box,edgeCount){return {points:[0,8,16,24,32].map(i=>record.points[i].map((v,k)=>(v-box.min[k])/box.size[k])),curveType:record.curveType,edgeCount};}
export function cadEdges(node){
  const local=node.edgeFinish?{...node,pos:[0,0,0],rot:[0,0,0],mirror:[1,1,1],size:node.baseSize}:node;
  const matrix=node.edgeFinish?matrixArray({...node,size:node.size.map((v,i)=>v/node.baseSize[i])}):null;
  const shape=shapeForNode(local);let records=[];try{checkSolid(shape);const box=boxOf(rawMesh(shape));records=edgeRecords(shape);if(records.length>8000)throw Error('Zu viele Kanten für die Auswahl. Qualität verringern.');return records.map(r=>({id:r.id,points:matrix?r.points.map(p=>[0,1,2].map(k=>matrix[12+k]+p.reduce((v,x,i)=>v+matrix[i*4+k]*x,0))):r.points,length:r.length,anchor:anchor(r,box,records.length)}));}
  finally{records.forEach(r=>r.edge.delete());shape.delete();}
}
function matchedEdges(records,anchors,box){
  const used=new Set(),result=[];
  for(const expected of anchors){let best=null,score=Infinity,runner=Infinity;
    for(const r of records){if(used.has(r.id)||(expected.curveType!==undefined&&r.curveType!==expected.curveType))continue;const actual=anchor(r,box).points;
      const distance=reverse=>Math.max(...expected.points.map((p,i)=>Math.hypot(...p.map((v,k)=>v-actual[reverse?4-i:i][k]))));
      const d=Math.min(distance(false),distance(true));if(d<score){runner=score;score=d;best=r;}else runner=Math.min(runner,d);}
    // With unchanged edge topology, allow small movement of earlier bevels
    // after source resizing only when the nearest match is clearly distinct.
    const flexible=expected.edgeCount===records.length&&score<=.025&&runner>score*4+.002;
    if(!best||runner<=2e-4||(score>2e-4&&!flexible)||(expected.edgeCount!==undefined&&expected.edgeCount!==records.length))throw Error('Eine bearbeitete Kante ist nach der Quellenänderung nicht mehr eindeutig vorhanden. Kantenoperation entfernen und neu auswählen.');used.add(best.id);result.push(best.edge);
  }return result;
}
function applySteps(shape,steps){
  let current=shape;
  try{for(const step of steps){const records=edgeRecords(current);let builder;
    try{const box=boxOf(rawMesh(current)),edges=matchedEdges(records,step.edges,box);
      builder=step.kind==='round'?new oc.BRepFilletAPI_MakeFillet(current,oc.ChFi3d_FilletShape.ChFi3d_Rational):new oc.BRepFilletAPI_MakeChamfer(current);
      for(const e of edges)builder.Add(step.amount,e);
      let next;try{next=builder.Shape();checkSolid(next);}catch(e){next?.delete();throw Error('Kantenoperation nicht möglich. Radius/Fase verkleinern oder Kanten einzeln bearbeiten.');}
      current.delete();current=next;
    }finally{builder?.delete();records.forEach(r=>r.edge.delete());}
  }return current;}catch(e){current.delete();throw e;}
}
function storeCad(node,shape,mesh,source){
  const box=boxOf(mesh),centered=translate(shape,box.center.map(v=>-v)),normalized=normalizeMesh(mesh);
  try{node.cad={version:1,source,brep:oc.BRepToolsWrapper.Write(centered),size:normalized.size,meshHash:meshHash(normalized.mesh)};return normalized;}
  finally{centered.delete();}
}
function finishGroup(node,base){
  if(!validFinish(node.edgeFinish))throw Error('Ungültige Kantenoperation.');
  let shape;if(node.children.length===1&&node.children[0].solid){shape=shapeForNode(node.children[0]);}else shape=shapeFromManifold(base);
  shape=applySteps(shape,node.edgeFinish.steps);
  try{const mesh=rawMesh(shape);storeCad(node,shape,mesh,'finish');return fromMesh(mesh);}finally{shape.delete();}
}
export function finishNode(input,{kind,amount,edges,remove=false}={}){
  if(input.locked)throw Error('Das Teil ist gesperrt.');
  let node=structuredClone(input);
  if(remove){if(!node.edgeFinish)throw Error('Keine Kantenoperation vorhanden.');node.edgeFinish.steps.pop();if(!node.edgeFinish.steps.length){delete node.edgeFinish;delete node.cad;}rebuildGroup(node);return node;}
  if(!input.solid)throw Error('Eine fertige Körperform auswählen.');
  if(!node.edgeFinish){const source=node;node=groupNodes([source]);node.name=source.name;for(const key of ['layerId','folderId','opacity','multicolor','notes'])if(source[key]!==undefined)node[key]=source[key];node.edgeFinish={steps:[]};}
  node.edgeFinish.steps.push({kind,amount,edges});if(!validFinish(node.edgeFinish))throw Error('Radius/Fase: 0,01–1000 mm, 1–128 Kanten und höchstens 20 Operationen.');
  rebuildGroup(node);if(!validNode(node))throw Error('Das Ergebnis überschreitet die Projektgrenzen.');return node;
}
export function importStep(bytes){
  if(bytes.length>30*1024*1024)throw Error('STEP-Import ist auf 30 MB begrenzt.');
  const head=new TextDecoder().decode(bytes.subarray(0,256));if(!/ISO-10303-21\s*;/i.test(head))throw Error('Keine STEP-Datei im unterstützten Textformat.');
  const path='/formnaro-'+(++sequence)+'.step',s=scope();try{
    oc.FS.writeFile(path,bytes);const reader=s.keep(new oc.STEPControl_Reader());if(reader.ReadFile(path)!==oc.IFSelect_ReturnStatus.IFSelect_RetDone)throw Error('STEP-Datei konnte nicht gelesen werden.');
    reader.SetSystemLengthUnit(1);if(!reader.TransferRoots())throw Error('STEP-Datei enthält keine übertragbaren Körper.');const shape=s.keep(reader.OneShape()),stats=checkSolid(shape);
    const faces=uniqueShapes(shape,'TopAbs_FACE');faces.forEach(f=>s.keep(f));
    const solids=uniqueShapes(shape,'TopAbs_SOLID');solids.forEach(v=>s.keep(v));let solidFaces=0;for(const solid of solids){const list=uniqueShapes(solid,'TopAbs_FACE');solidFaces+=list.length;list.forEach(v=>v.delete());}
    if(faces.length!==solidFaces)throw Error('STEP enthält zusätzliche offene Flächen. Nur vollständige Körper importieren.');
    const data=rawMesh(shape),holder={},normal=storeCad(holder,shape,data,'step');return {...normal,cad:holder.cad,solids:stats.solids,volume:stats.volume};
  }finally{s.close();try{oc.FS.unlink(path);}catch{}}
}
export function exportStep(nodes){
  const s=scope(),path='/formnaro-'+(++sequence)+'.step';try{
    const compound=s.keep(new oc.TopoDS_Compound()),builder=s.keep(new oc.TopoDS_Builder());builder.MakeCompound(compound);
    for(const n of nodes){if(!n.solid)continue;const shape=s.keep(shapeForNode(n));checkSolid(shape);builder.Add(compound,shape);}
    checkSolid(compound);oc.Interface_Static.SetCVal('write.step.unit','MM');oc.Interface_Static.SetIVal('write.step.schema',5);
    const writer=s.keep(new oc.STEPControl_Writer()),progress=s.keep(new oc.Message_ProgressRange());
    if(writer.Transfer(compound,oc.STEPControl_StepModelType.STEPControl_AsIs,true,progress)!==oc.IFSelect_ReturnStatus.IFSelect_RetDone||writer.Write(path)!==oc.IFSelect_ReturnStatus.IFSelect_RetDone)throw Error('STEP-Export fehlgeschlagen.');
    return oc.FS.readFile(path).slice();
  }finally{s.close();try{oc.FS.unlink(path);}catch{}}
}
