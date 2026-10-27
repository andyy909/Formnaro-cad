// CAD-only operations shared by the new model service and independent proofs.
// The caller owns the OCCT module and every returned TopoDS_Shape. This module
// never imports Manifold, creates CAD from a mesh, or treats a mesh as evidence.
import {validateAffineMatrix} from './cad-project.js';
import {cadCleanExportTriangles} from './cad-export-triangles.js';
const EPS=1e-10;
const MAX_TOPOLOGY_ENTITIES=200000;
const MAX_DISPLAY_COORDINATES=3000000;
const MAX_DISPLAY_INDICES=6000000;
// Native integration and exact affine/Boolean identities provide volume proofs.
// No caller-provided project stats are accepted. A BRep fingerprint
// prevents mutable native handles (including shared TShapes) from retaining a
// stale proof after a geometric change. Rendering triangulations are omitted.
const affineVolumes=new WeakMap(),volumeBreps=new WeakMap(),recoveredBooleans=new WeakSet(),MAX_VOLUME_PROOFS=64,MAX_VOLUME_PROOF_BYTES=32*1024*1024;
// Proofs are keyed by current native bytes, never by a mutable TShape handle or
// caller-provided stats. OCCT may share/change TShapes across Boolean results.
const solidProofs=new WeakMap();
function solidProofStore(oc){let store=solidProofs.get(oc);if(!store){store={items:new Map(),bytes:0,hits:0,misses:0};solidProofs.set(oc,store);}return store;}
function rememberSolidProof(oc,brep,value){const store=solidProofStore(oc),bytes=brep.length*2+512,previous=store.items.get(brep);if(previous){store.bytes-=previous.bytes;store.items.delete(brep);}if(bytes>MAX_VOLUME_PROOF_BYTES)return;store.items.set(brep,{value:structuredClone(value),bytes});store.bytes+=bytes;while(store.items.size>MAX_VOLUME_PROOFS||store.bytes>MAX_VOLUME_PROOF_BYTES){const [key,item]=store.items.entries().next().value;store.items.delete(key);store.bytes-=item.bytes;}}
export function cadSolidProofCacheState(oc){const store=solidProofStore(oc);return {entries:store.items.size,bytes:store.bytes,hits:store.hits,misses:store.misses,maxEntries:MAX_VOLUME_PROOFS,maxBytes:MAX_VOLUME_PROOF_BYTES};}
function volumeFingerprint(oc,shape){return typeof oc.FormnaroCadBridge?.WriteNoTriangles==='function'?oc.FormnaroCadBridge.WriteNoTriangles(shape):writeCadBrep(oc,shape);}
function rememberVolume(oc,shape,volume,brep=volumeFingerprint(oc,shape)){
  affineVolumes.set(shape,{oc,volume,brep});let store=volumeBreps.get(oc);if(!store){store={items:new Map(),bytes:0};volumeBreps.set(oc,store);}const bytes=brep.length*2,previous=store.items.get(brep);if(previous){store.bytes-=previous.bytes;store.items.delete(brep);}if(bytes>MAX_VOLUME_PROOF_BYTES)return;
  store.items.set(brep,{volume,bytes});store.bytes+=bytes;while(store.items.size>MAX_VOLUME_PROOFS||store.bytes>MAX_VOLUME_PROOF_BYTES){const [key,value]=store.items.entries().next().value;store.items.delete(key);store.bytes-=value.bytes;}
}

function uniqueEntities(oc,shape,type){
  const explorer=new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum[type]),buckets=new Map(),items=[];
  try{
    while(explorer.More()){
      const item=explorer.Current(),key=oc.ReplicadShapeHasher.HashCode(item,2147483647),bucket=buckets.get(key)||[];
      if(bucket.some(previous=>previous.IsSame(item)))item.delete();
      else{bucket.push(item);buckets.set(key,bucket);items.push(item);if(items.length>MAX_TOPOLOGY_ENTITIES)throw Error('CAD-Topologie überschreitet die Projektgrenze.');}
      explorer.Next();
    }
    return items;
  }catch(error){items.forEach(item=>item.delete());throw error;}
  finally{explorer.delete();}
}

export function cadNativeCapabilities(oc){
  return Object.freeze({
    stepAssembly:typeof oc?.FormnaroCadBridge?.ReadStepAssemblyJson==='function',
    exactBounds:typeof oc?.BRepBndLib?.AddOptimal==='function',
    generalAffine:typeof oc?.FormnaroCadBridge?.Transform==='function'||typeof oc?.BRepBuilderAPI_GTransform==='function',
    rayHits:typeof oc?.FormnaroCadBridge?.RayHitsJson==='function',
    directWriteNoTriangles:typeof oc?.FormnaroCadBridge?.WriteNoTriangles==='function',
    solidPointClassification:typeof oc?.FormnaroCadBridge?.ClassifyPoint==='function',
    doubleExportMesh:typeof oc?.FormnaroCadBridge?.ExportMeshJson==='function',
    copyAndCleanWriteNoTriangles:typeof oc?.BRepTools?.Clean==='function'&&typeof oc?.BRepToolsWrapper?.Read==='function'&&typeof oc?.BRepToolsWrapper?.Write==='function',
    displayFaceMapping:typeof oc?.ReplicadMeshExtractor?.extract==='function'
  });
}

export function cadBounds(oc,shape){
  if(shape.IsNull())throw Error('Keine CAD-Geometrie für Grenzen.');
  const box=new oc.Bnd_Box();
  try{
    // Both switches deliberately false: ignore display triangulations and do
    // not inflate construction dimensions by topological shape tolerances.
    oc.BRepBndLib.AddOptimal(shape,box,false,false);
    if(box.IsVoid()||box.IsWhole())throw Error('Keine endlichen CAD-Grenzen.');
    const min=[box.GetXMin(),box.GetYMin(),box.GetZMin()],max=[box.GetXMax(),box.GetYMax(),box.GetZMax()];
    if([...min,...max].some(v=>!Number.isFinite(v)))throw Error('Keine endlichen CAD-Grenzen.');
    return {min,max,size:min.map((v,i)=>max[i]-v),center:min.map((v,i)=>(max[i]+v)/2)};
  }finally{box.delete();}
}

export function cadVolume(oc,shape,{projection='plane'}={}){
  if(!['plane','point'].includes(projection))throw Error('Unbekannte native CAD-Volumenprojektion.');
  return volumeWithFingerprint(oc,shape,projection,volumeFingerprint(oc,shape));
}
function volumeWithFingerprint(oc,shape,projection,brep){
  const proof=affineVolumes.get(shape);if(proof){if(proof.oc===oc&&proof.brep===brep)return proof.volume;affineVolumes.delete(shape);}
  const cached=volumeBreps.get(oc)?.items.get(brep);if(cached){rememberVolume(oc,shape,cached.volume,brep);return cached.volume;}
  const props=new oc.GProp_GProps();let point,normal,plane;
  // For the unit normal n, div(n*(n·(P-P0)))=1. Thus OCCT's plane-flux
  // integral has the same signed closed volume as its point-flux integral.
  // It avoids near-zero radial flux and pathological adaptive iterations on
  // generally transformed NURBS. Keep native GK, spans and the same epsilon.
  try{let error;if(projection==='point')error=oc.BRepGProp.VolumePropertiesGK(shape,props,1e-10,true,true,false,false,false);else{point=new oc.gp_Pnt(...cadBounds(oc,shape).center);normal=new oc.gp_Dir(1,Math.SQRT2,Math.sqrt(3));plane=new oc.gp_Pln(point,normal);error=oc.BRepGProp.VolumePropertiesGK(shape,props,plane,1e-10,true,true,false,false,false);}const volume=props.Mass();if(!Number.isFinite(error)||error<0||!Number.isFinite(volume))throw Error('CAD-Volumenintegration ist fehlgeschlagen.');rememberVolume(oc,shape,volume,brep);return volume;}
  finally{plane?.delete();normal?.delete();point?.delete();props.delete();}
}

export function validateCadSolid(oc,shape){
  if(shape.IsNull())throw Error('Die CAD-Operation ergibt keinen Körper.');
  const brep=volumeFingerprint(oc,shape),store=solidProofStore(oc),cached=store.items.get(brep);
  if(cached){store.hits++;store.items.delete(brep);store.items.set(brep,cached);return structuredClone(cached.value);}store.misses++;
  const check=new oc.BRepCheck_Analyzer(shape);let solids=[];
  try{
    solids=uniqueEntities(oc,shape,'TopAbs_SOLID');
    if(!check.IsValid()){const error=Error('Keine gültige CAD-Geometrie.');error.code='INVALID_CAD_TOPOLOGY';throw error;}
    if(!solids.length)throw Error('Keine gültigen CAD-Körper.');
    // An OCCT compound can be valid while also holding open faces, edges or
    // vertices. Every geometric entity must belong to one of its solids.
    for(const type of ['TopAbs_SHELL','TopAbs_FACE','TopAbs_WIRE','TopAbs_EDGE','TopAbs_VERTEX']){
      const all=uniqueEntities(oc,shape,type),covered=[];
      try{
        for(const solid of solids)covered.push(...uniqueEntities(oc,solid,type));
        const buckets=new Map();for(const entity of covered){const key=oc.ReplicadShapeHasher.HashCode(entity,2147483647),bucket=buckets.get(key)||[];bucket.push(entity);buckets.set(key,bucket);}
        if(all.some(entity=>!buckets.get(oc.ReplicadShapeHasher.HashCode(entity,2147483647))?.some(candidate=>candidate.IsSame(entity))))throw Error('CAD-Ergebnis enthält offene oder unzugeordnete Geometrie außerhalb der Körper.');
      }finally{covered.forEach(entity=>entity.delete());all.forEach(entity=>entity.delete());}
    }
    const volume=volumeWithFingerprint(oc,shape,'plane',brep);
    if(!Number.isFinite(volume)||volume<=1e-10)throw Error('Keine gültigen CAD-Körper mit positivem Volumen.');
    const result={solids:solids.length,volume,bounds:cadBounds(oc,shape)};rememberSolidProof(oc,volumeFingerprint(oc,shape),result);return result;
  }finally{solids.forEach(solid=>solid.delete());check.delete();}
}

/** One Cut and one Common for all tools. Common supplies a native volume proof
 * even for overlapping cutters and generally affine operands; no summed hole
 * volumes or display meshes establish the result. Inputs stay non-destructive. */
export function cadCutMany(oc,left,tools,{allowEmpty=false}={}){
  if(!Array.isArray(tools)||!tools.length)throw Error('CAD-Schnitt benötigt Schneidkörper.');
  if(tools.length===1)return cadBoolean(oc,'difference',left,tools[0],{allowEmpty});
  const leftVolume=validateCadSolid(oc,left).volume;for(const tool of tools)validateCadSolid(oc,tool);
  let argumentsList,toolsList,result,common;
  function build(type){const builder=new oc[type]();let shape;
    try{builder.SetArguments(argumentsList);builder.SetTools(toolsList);builder.SetNonDestructive(true);builder.Build();if(builder.HasErrors?.())throw Error('Gemeinsamer CAD-Schnitt fehlgeschlagen.');shape=builder.Shape();return shape;}
    catch(error){shape?.delete();throw error;}finally{builder.delete();}
  }
  function volumetric(shape){if(shape.IsNull())return false;const explorer=new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_SOLID);try{return explorer.More();}finally{explorer.delete();}}
  try{
    argumentsList=new oc.NCollection_List_TopoDS_Shape();toolsList=new oc.NCollection_List_TopoDS_Shape();argumentsList.Append(left);for(const tool of tools)toolsList.Append(tool);
    result=build('BRepAlgoAPI_Cut');if(!volumetric(result)&&allowEmpty){result.delete();result=null;return null;}
    common=build('BRepAlgoAPI_Common');const cutVolume=volumetric(common)?validateCadSolid(oc,common).volume:0;
    if(cutVolume<0||cutVolume>leftVolume+leftVolume*1e-8)throw Error('Native CAD-Schnittmasse widerspricht dem Körpervolumen.');
    const volume=leftVolume-cutVolume;if(volume>leftVolume*1e-8)rememberVolume(oc,result,volume);
    validateCadSolid(oc,result);return result;
  }catch(error){result?.delete();error.cadPhase??='boolean-batch-cut';throw error;}finally{common?.delete();argumentsList?.delete();toolsList?.delete();}
}

/** Fast native Fuse for strictly separated bodies. Only full native bounds
 * establish separation; touching/overlapping bodies use inclusion-exclusion.
 * Group construction can balance those proven two-operand operations.
 * A failed batch leaves its operands available for the sequential fallback. */
export function cadFuseMany(oc,shapes,{balanced=false}={}){
  if(!Array.isArray(shapes)||!shapes.length)throw Error('CAD-Vereinigung benötigt Körper.');
  const proofs=shapes.map(shape=>({...validateCadSolid(oc,shape),tolerance:maximumShapeTolerance(oc,shape)}));
  function separated(start,end){for(let i=start;i<end;i++)for(let j=i+1;j<end;j++){const left=proofs[i],right=proofs[j],gap=left.tolerance+right.tolerance+1e-6;if(![0,1,2].some(k=>left.bounds.max[k]+gap<right.bounds.min[k]||right.bounds.max[k]+gap<left.bounds.min[k]))return false;}return true;}
  let result;
  function fuseSeparated(start,end){let args,tools,builder,combined;
    try{args=new oc.NCollection_List_TopoDS_Shape();tools=new oc.NCollection_List_TopoDS_Shape();args.Append(shapes[start]);for(let i=start+1;i<end;i++)tools.Append(shapes[i]);builder=new oc.BRepAlgoAPI_Fuse();builder.SetArguments(args);builder.SetTools(tools);builder.SetNonDestructive(true);builder.Build();if(builder.HasErrors?.())throw Error('CAD-Vereinigung fehlgeschlagen.');combined=builder.Shape();const subset=proofs.slice(start,end);rememberVolume(oc,combined,subset.reduce((sum,p)=>sum+p.volume,0));const checked=validateCadSolid(oc,combined);if(checked.solids!==subset.reduce((sum,p)=>sum+p.solids,0))throw Error('Getrennte CAD-Körper wurden verändert.');return combined;}
    catch{combined?.delete();return null;}
    finally{builder?.delete();tools?.delete();args?.delete();}
  }
  const disjoint=shapes.length>1&&separated(0,shapes.length);
  if(disjoint){result=fuseSeparated(0,shapes.length);if(result)return result;}
  if(balanced&&shapes.length>2){
    function combine(start,end){
      if(end-start===1)return {shape:shapes[start],owned:false};
      // Reuse the original native separation proofs inside the tree too.
      // If the full separated batch failed, do not immediately retry it.
      if(!(disjoint&&start===0&&end===shapes.length)&&separated(start,end)){const shape=fuseSeparated(start,end);if(shape)return {shape,owned:true};}
      let left,right;
      try{const middle=start+Math.floor((end-start)/2);left=combine(start,middle);right=combine(middle,end);return {shape:cadBoolean(oc,'union',left.shape,right.shape),owned:true};}
      finally{if(left?.owned)left.shape.delete();if(right?.owned)right.shape.delete();}
    }
    // Boolean associations can encounter different native edge cases. Keep
    // the established left-to-right calculation available after a failure.
    try{return combine(0,shapes.length).shape;}catch{}
  }
  try{result=readCadBrep(oc,writeCadBrep(oc,shapes[0]));for(const shape of shapes.slice(1)){const next=cadBoolean(oc,'union',result,shape);result.delete();result=next;}return result;}
  catch(error){result?.delete();throw error;}
}

// OCCT can build an unorientable shell for an otherwise valid Boolean input.
// Use the exact set identity, with temporary inverted solids, rather than
// healing/moving faces or increasing the construction tolerance. The inverted
// operands are never stored, validated as finite solids, or returned.
function dualCadBoolean(oc,operation,left,right){
  const union=operation==='union',inverted=(union?left:right).Complemented();
  const builder=new oc[operation==='difference'?'BRepAlgoAPI_Common':'BRepAlgoAPI_Cut']();
  let argumentsList,toolsList,result;
  try{
    argumentsList=new oc.NCollection_List_TopoDS_Shape();toolsList=new oc.NCollection_List_TopoDS_Shape();
    argumentsList.Append(union?inverted:left);toolsList.Append(union?right:inverted);
    builder.SetArguments(argumentsList);builder.SetTools(toolsList);builder.SetNonDestructive(true);builder.SetCheckInverted(true);builder.Build();
    if(builder.HasErrors?.())throw Error('Äquivalente CAD-Operation fehlgeschlagen.');
    result=builder.Shape();
    if(union){const finite=result.Complemented();result.delete();result=finite;}
    const solids=result.IsNull()?null:new oc.TopExp_Explorer(result,oc.TopAbs_ShapeEnum.TopAbs_SOLID);let volumetric;
    try{volumetric=!!solids?.More();}finally{solids?.delete();}
    // An invalid nonempty primary result is not evidence of complete removal.
    if(!volumetric)throw Error('Äquivalente CAD-Operation liefert keinen nachgewiesenen Körper.');
    // Integrate the actual finite result; the auxiliary Common of the original
    // algorithm may itself be the source of the invalid topology.
    validateCadSolid(oc,result);return result;
  }catch(error){result?.delete();throw error;}
  finally{builder.delete();inverted.delete();toolsList?.delete();argumentsList?.delete();}
}

// A bounded OCCT fuzzy calculation merges coincident intersection entities;
// it never modifies the saved operands. Normal successful operations retain
// their original precision. The recovery ceiling is one micrometre in mm.
export const CAD_BOOLEAN_RECOVERY_TOLERANCE=0.001;
function recoverCadBoolean(oc,operation,left,right,leftProof,rightProof){
  let last;
  try{return dualCadBoolean(oc,operation,left,right);}catch(error){last=error;}
  const type={union:'BRepAlgoAPI_Fuse',difference:'BRepAlgoAPI_Cut',intersection:'BRepAlgoAPI_Common'}[operation];
  // Small/thin operands get a proportionally smaller ceiling. A recovery may
  // not consume a narrow cutter or a thin remaining construction as rounding.
  const ceiling=Math.min(CAD_BOOLEAN_RECOVERY_TOLERANCE,...leftProof.bounds.size.map(v=>v*1e-4),...rightProof.bounds.size.map(v=>v*1e-4));
  for(const tolerance of [ceiling/10,ceiling]){
    const builder=new oc[type]();let args,tools,result;
    try{
      args=new oc.NCollection_List_TopoDS_Shape();tools=new oc.NCollection_List_TopoDS_Shape();args.Append(left);tools.Append(right);
      builder.SetArguments(args);builder.SetTools(tools);builder.SetNonDestructive(true);builder.SetFuzzyValue(tolerance);builder.Build();
      if(builder.HasErrors?.())throw Error('Begrenzte CAD-Schnittberechnung fehlgeschlagen.');
      result=builder.Shape();const checked=validateCadSolid(oc,result),lv=leftProof.volume,rv=rightProof.volume,slack=Math.max(lv,rv)*1e-8;
      if(operation==='difference'&&checked.volume>lv+slack||operation==='intersection'&&checked.volume>Math.min(lv,rv)+slack||operation==='union'&&(checked.volume<Math.max(lv,rv)-slack||checked.volume>lv+rv+slack))throw Error('Wiederhergestelltes CAD-Ergebnis widerspricht den Operandvolumen.');
      const bounds=operation==='union'?{min:leftProof.bounds.min.map((v,k)=>Math.min(v,rightProof.bounds.min[k])),max:leftProof.bounds.max.map((v,k)=>Math.max(v,rightProof.bounds.max[k]))}:leftProof.bounds;
      if(checked.bounds.min.some((v,k)=>v<bounds.min[k]-tolerance)||checked.bounds.max.some((v,k)=>v>bounds.max[k]+tolerance))throw Error('Wiederhergestelltes CAD-Ergebnis überschreitet die Operandgrenzen.');
      return result;
    }catch(error){result?.delete();last=error;}
    finally{builder.delete();tools?.delete();args?.delete();}
  }
  throw last;
}

export function cadBoolean(oc,operation,left,right,{allowEmpty=false}={}){
  const types={union:'BRepAlgoAPI_Fuse',difference:'BRepAlgoAPI_Cut',intersection:'BRepAlgoAPI_Common'},type=types[operation];
  if(!type)throw Error('Unbekannte CAD-Operation.');
  // The two-operand constructor builds immediately in destructive mode. It
  // can change shared operand tolerances/pcurves before their validation or
  // before the independent Common used as a volume proof. Configure first.
  const leftProof=validateCadSolid(oc,left),rightProof=validateCadSolid(oc,right);
  const builder=new oc[type]();let argumentsList,toolsList,result;
  try{
    argumentsList=new oc.NCollection_List_TopoDS_Shape();toolsList=new oc.NCollection_List_TopoDS_Shape();argumentsList.Append(left);toolsList.Append(right);
    builder.SetArguments(argumentsList);builder.SetTools(toolsList);builder.SetNonDestructive(true);
    builder.Build();
    if(typeof builder.HasErrors==='function'&&builder.HasErrors())throw Error('CAD-Operation fehlgeschlagen.');
    result=builder.Shape();const solids=result.IsNull()?null:new oc.TopExp_Explorer(result,oc.TopAbs_ShapeEnum.TopAbs_SOLID);let volumetric;try{volumetric=!!solids?.More();}finally{solids?.delete();}
    if(!volumetric&&allowEmpty){result.delete();return null;}
    if(volumetric&&!solidProofStore(oc).items.has(volumeFingerprint(oc,result))){
      const topology=new oc.BRepCheck_Analyzer(result);
      try{if(!topology.IsValid()){const error=Error('Keine gültige CAD-Geometrie.');error.code='INVALID_CAD_TOPOLOGY';throw error;}}
      finally{topology.delete();}
    }
    // Inclusion/exclusion integrates only the actual native intersection;
    // unchanged affine NURBS faces do not need an expensive second integral.
    // Every nonempty returned body still passes all production topology checks.
    if(volumetric&&operation!=='intersection'){
      const lv=leftProof.volume,rv=rightProof.volume,common=cadBoolean(oc,'intersection',left,right,{allowEmpty:true});let cv,recoveredCommon;try{cv=common?cadVolume(oc,common):0;recoveredCommon=!!common&&recoveredBooleans.has(common);}finally{common?.delete();}
      if(cv<0||cv>Math.min(lv,rv)+Math.max(lv,rv)*1e-8)throw Error('Native CAD-Schnittmasse widerspricht den Operandvolumen.');
      const derived=operation==='difference'?lv-cv:lv+rv-cv;
      // Near-total subtraction can lose the remaining tiny mass through
      // cancellation; integrate that actual native remnant instead.
      // A recovered auxiliary intersection can have a different tolerance
      // envelope. Integrate this actual result instead of borrowing its mass.
      if(!recoveredCommon&&derived>Math.max(lv,rv)*1e-8)rememberVolume(oc,result,derived);
    }
    validateCadSolid(oc,result);return result;
  }catch(error){
    result?.delete();result=null;
    if(error.code==='INVALID_CAD_TOPOLOGY'){
      try{const recovered=recoverCadBoolean(oc,operation,left,right,leftProof,rightProof);recoveredBooleans.add(recovered);return recovered;}
      catch(alternative){alternative.cadPhase??='boolean-'+operation+'-recovery';throw alternative;}
    }
    error.cadPhase??='boolean-'+operation;throw error;
  }
  finally{builder.delete();toolsList?.delete();argumentsList?.delete();}
}

export function brepHasNoTriangulation(data){
  if(typeof data!=='string')return false;
  const count=label=>{const match=data.match(new RegExp('(?:^|\\n)'+label+'\\s+(\\d+)(?:\\s|$)'));return match?Number(match[1]):null;};
  return count('Triangulations')===0&&count('Polygon3D')===0&&count('PolygonOnTriangulations')===0;
}

export function writeCadBrep(oc,shape){
  let result;
  if(cadNativeCapabilities(oc).directWriteNoTriangles)result=oc.FormnaroCadBridge.WriteNoTriangles(shape);
  else{
    // Read/Write is an independent geometric copy, unlike a TopoDS copy which
    // shares TShape caches. Clean must never strip the caller's display data.
    const copy=oc.BRepToolsWrapper.Read(oc.BRepToolsWrapper.Write(shape));
    try{oc.BRepTools.Clean(copy,true);result=oc.BRepToolsWrapper.Write(copy);}
    finally{copy.delete();}
  }
  if(!brepHasNoTriangulation(result))throw Error('CAD-Speicherung enthält unerlaubte Triangulierung oder Polygonpuffer.');
  return result;
}

export function readCadBrep(oc,data){
  if(!brepHasNoTriangulation(data))throw Error('CAD-BRep muss triangulierungsfrei sein.');
  const shape=oc.BRepToolsWrapper.Read(data);
  try{validateCadSolid(oc,shape);return shape;}
  catch(error){shape.delete();throw error;}
}

function matrixInfo(matrix){
  const maximum=Math.max(...[0,1,2,4,5,6,8,9,10].map(i=>Math.abs(matrix[i]))),cols=[0,1,2].map(i=>matrix.slice(i*4,i*4+3).map(v=>v/maximum)),lengths=cols.map(v=>Math.hypot(...v)),unit=cols.map((v,i)=>v.map(x=>x/lengths[i])),dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0);
  const [a,b,c]=unit;
  return {similarity:Math.max(...lengths)-Math.min(...lengths)<=EPS*Math.max(...lengths)&&[dot(a,b),dot(a,c),dot(b,c)].every(v=>Math.abs(v)<=EPS)};
}

export function cadAffineVolume(volume,matrix){
  validateAffineMatrix(matrix);if(!Number.isFinite(volume)||volume<=0)throw Error('Natives CAD-Quellvolumen muss positiv und endlich sein.');
  const determinant=matrix[0]*(matrix[5]*matrix[10]-matrix[9]*matrix[6])-matrix[4]*(matrix[1]*matrix[10]-matrix[9]*matrix[2])+matrix[8]*(matrix[1]*matrix[6]-matrix[5]*matrix[2]),result=volume*Math.abs(determinant);
  if(!Number.isFinite(result)||result<=0)throw Error('Affines CAD-Volumen liegt außerhalb des Zahlenbereichs.');return result;
}

function maximumShapeTolerance(oc,shape){
  let maximum=0;
  for(const [type,cast] of [['TopAbs_FACE','Face'],['TopAbs_EDGE','Edge'],['TopAbs_VERTEX','Vertex']]){
    const entities=uniqueEntities(oc,shape,type);
    try{for(const raw of entities){const entity=oc.TopoDS[cast](raw);try{const tolerance=oc.BRep_Tool.Tolerance(entity);if(!Number.isFinite(tolerance)||tolerance<0)throw Error('Affine CAD-Geometrie besitzt keine endliche Konstruktionstoleranz.');maximum=Math.max(maximum,tolerance);}finally{entity.delete();}}}
    finally{entities.forEach(entity=>entity.delete());}
  }
  return maximum;
}

function nativeGeometrySections(brep){
  const sections=[['Curves','Polygon3D'],['Surfaces','Triangulations']].map(([first,last])=>{
    const start=brep.indexOf('\n'+first+' '),end=brep.indexOf('\n'+last+' ',start+1);
    if(start<0||end<=start)throw Error('Native affine CAD-Geometrie lässt sich nicht unabhängig prüfen.');
    return brep.slice(start,end);
  });return sections;
}

function repairAffineParameters(oc,shape,source){
  const analyzer=new oc.BRepCheck_Analyzer(shape);let valid;
  try{valid=analyzer.IsValid();}finally{analyzer.delete();}
  if(valid)return;
  if(typeof oc.BRepLib?.SameParameter!=='function')throw Error('Affine CAD-Kurven benötigen die native Parameterreparatur.');
  const maximumBefore=maximumShapeTolerance(oc,shape),before=writeCadBrep(oc,shape),sourceBefore=writeCadBrep(oc,source),geometryBefore=nativeGeometrySections(before);
  // A general native transform retains its 3D curves/surfaces, but converted
  // trimmed screw faces can lose matching edge/pcurve parameters. Recompute
  // those native parameters without changing the source body or its matrix.
  oc.BRepLib.SameParameter(shape,1e-7,true);
  // Retain the pre-existing transformed tolerance envelope; there is no fixed
  // budget floor that could silently relax a small source feature.
  if(maximumShapeTolerance(oc,shape)>maximumBefore*(1+1e-9))throw Error('Affine CAD-Parameterreparatur überschreitet die ursprüngliche Konstruktionstoleranz.');
  const geometryAfter=nativeGeometrySections(writeCadBrep(oc,shape));
  if(geometryBefore.some((value,index)=>value!==geometryAfter[index])||sourceBefore!==writeCadBrep(oc,source))throw Error('Affine CAD-Parameterreparatur hat ursprüngliche 3D-Geometrie verändert.');
  // The caller performs the full solid/membership/volume validation next.
}

export function transformCad(oc,shape,matrix){
  matrix=validateAffineMatrix(matrix);
  const info=matrixInfo(matrix),capabilities=cadNativeCapabilities(oc);
  if(!info.similarity&&!capabilities.generalAffine)throw Error('CAD-Kern benötigt BRepBuilderAPI_GTransform für ungleichmäßige Skalierung oder Scherung.');
  // The volume change of every nonsingular affine map is exactly |det(A)|.
  // Integrate the original native body, rather than reintegrating the many
  // NURBS patches created by a general GTransform at prohibitive cost.
  const volume=cadAffineVolume(cadVolume(oc,shape),matrix);let tr,builder,result;
  try{
    if(!info.similarity){
      tr=new oc.gp_GTrsf();
      for(let row=0;row<3;row++)for(let col=0;col<4;col++)tr.SetValue(row+1,col+1,matrix[col*4+row]);
      tr.SetForm();
      if(capabilities.generalAffine&&typeof oc.FormnaroCadBridge?.Transform==='function')result=oc.FormnaroCadBridge.Transform(shape,tr);
      else{builder=new oc.BRepBuilderAPI_GTransform(shape,tr,true);result=builder.Shape();}
    }else{
      tr=new oc.gp_Trsf();tr.SetValues(...[0,1,2].flatMap(row=>[matrix[row],matrix[4+row],matrix[8+row],matrix[12+row]]));
      builder=new oc.BRepBuilderAPI_Transform(shape,tr,true,false);result=builder.Shape();
    }
    repairAffineParameters(oc,result,shape);rememberVolume(oc,result,volume);validateCadSolid(oc,result);return result;
  }catch(error){if(result)affineVolumes.delete(result);result?.delete();throw error;}
  finally{builder?.delete();tr?.delete();}
}

export function cadRayHits(oc,shape,{origin,direction,near=0,far=1e9,tolerance=1e-7}={}){
  if(!cadNativeCapabilities(oc).rayHits)throw Error('CAD-Strahlschnitt benötigt die native IntCurvesFace-Schnittstelle.');
  if(![origin,direction].every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite))||Math.hypot(...direction)===0||![near,far,tolerance].every(Number.isFinite)||near<0||far<=near||tolerance<=0)throw Error('Ungültiger CAD-Strahl.');
  const largest=Math.max(...direction.map(Math.abs)),scaled=direction.map(v=>v/largest),point=new oc.gp_Pnt(...origin),dir=new oc.gp_Dir(...scaled);
  try{return JSON.parse(oc.FormnaroCadBridge.RayHitsJson(shape,point,dir,near,far,tolerance));}
  finally{dir.delete();point.delete();}
}

export function cadClassifyPoint(oc,shape,point,{tolerance=1e-7}={}){
  if(!cadNativeCapabilities(oc).solidPointClassification)throw Error('CAD-Konturzuordnung benötigt den nativen Körperklassifikator.');
  if(!Array.isArray(point)||point.length!==3||!point.every(Number.isFinite)||!Number.isFinite(tolerance)||tolerance<=0)throw Error('Ungültiger CAD-Klassifikationspunkt.');
  const nativePoint=new oc.gp_Pnt(...point);
  try{const state=oc.FormnaroCadBridge.ClassifyPoint(shape,nativePoint,tolerance);if(!['inside','outside','boundary'].includes(state))throw Error('CAD-Klassifikator liefert keinen eindeutigen Zustand.');return state;}
  finally{nativePoint.delete();}
}

export function cadExportMesh(oc,shape,{deflection=.01,angleDegrees=5}={}){
  if(!cadNativeCapabilities(oc).doubleExportMesh)throw Error('CAD-Export benötigt die native Double-Tessellierung.');
  if(!Number.isFinite(deflection)||deflection<1e-7||!Number.isFinite(angleDegrees)||angleDegrees<=0||angleDegrees>180)throw Error('Ungültige CAD-Exportqualität; die native Mindestdeflektion beträgt 0,0000001 mm.');
  const copy=oc.BRepToolsWrapper.Read(writeCadBrep(oc,shape));let result;
  try{result=JSON.parse(oc.FormnaroCadBridge.ExportMeshJson(copy,deflection,angleDegrees*Math.PI/180));}finally{copy.delete();}
  const {vertices,triangles,faceGroups}=result;
  if(![vertices,triangles,faceGroups].every(v=>Array.isArray(v)&&v.length>0&&v.length%3===0)||vertices.length>MAX_DISPLAY_COORDINATES||triangles.length>MAX_DISPLAY_INDICES||faceGroups.length>120000||vertices.some(v=>!Number.isFinite(v))||triangles.some(v=>!Number.isSafeInteger(v)||v<0||v>=vertices.length/3))throw Error('Ungültige CAD-Exportpuffer.');
  let offset=0;for(let i=0;i<faceGroups.length;i+=3){if(!faceGroups.slice(i,i+3).every(Number.isSafeInteger)||faceGroups[i]!==offset||faceGroups[i+1]<=0||faceGroups[i+1]%3||faceGroups[i+2]<=0)throw Error('Ungültige CAD-Exportflächen.');offset+=faceGroups[i+1];}
  if(offset!==triangles.length)throw Error('Unvollständige CAD-Exportflächen.');
  return cadCleanExportTriangles(result);
}

export function cadDisplayMesh(oc,shape,{deflection=.02,angleDegrees=8}={}){
  if(!Number.isFinite(deflection)||deflection<=0||!Number.isFinite(angleDegrees)||angleDegrees<=0||angleDegrees>180)throw Error('Ungültige CAD-Anzeigequalität.');
  // OCCT meshing also updates transient shape flags/tolerances. Tessellate an
  // independent geometric BRep copy so native mass proofs and source geometry
  // remain byte-identical at every display/export quality.
  const copy=oc.BRepToolsWrapper.Read(writeCadBrep(oc,shape));let raw;
  try{
    raw=oc.ReplicadMeshExtractor.extract(copy,deflection,angleDegrees*Math.PI/180,false);
    const vertexSize=raw.getVerticesSize(),normalSize=raw.getNormalsSize(),indexSize=raw.getTrianglesSize(),groupSize=raw.getFaceGroupsSize();
    if(![vertexSize,normalSize,indexSize,groupSize].every(v=>Number.isSafeInteger(v)&&v>0&&v%3===0)||vertexSize>MAX_DISPLAY_COORDINATES||indexSize>MAX_DISPLAY_INDICES||groupSize>120000||normalSize!==vertexSize)throw Error('CAD-Anzeigenetz überschreitet die Projektgrenze oder besitzt ungültige Puffer.');
    const buffer=oc.wasmMemory.buffer,floats=(pointer,size)=>Array.from(new Float32Array(buffer,pointer>>>0,size)),uints=(pointer,size)=>Array.from(new Uint32Array(buffer,pointer>>>0,size));
    const result={vertices:floats(raw.getVerticesPtr(),vertexSize),normals:floats(raw.getNormalsPtr(),normalSize),triangles:uints(raw.getTrianglesPtr(),indexSize),faceGroups:uints(raw.getFaceGroupsPtr(),groupSize)};
    if(result.vertices.some(v=>!Number.isFinite(v))||result.normals.some(v=>!Number.isFinite(v))||result.triangles.some(v=>v>=vertexSize/3))throw Error('Ungültige CAD-Anzeigepuffer.');
    const faces=uniqueEntities(oc,copy,'TopAbs_FACE'),byHash=new Map();
    try{
      // Replicad stores memory-identity hashes, which change after BRep reads.
      // Replace them with this body's one-based unique TopExp face index, the
      // same convention used by the native CAD ray bridge. A hash collision is
      // an ambiguity, never grounds for silently selecting a different face.
      for(let i=0;i<faces.length;i++){const hash=oc.ReplicadShapeHasher.HashCode(faces[i],2147483647),ids=byHash.get(hash)||[];ids.push(i+1);byHash.set(hash,ids);}
      let offset=0;for(let i=0;i<groupSize;i+=3){
        if(result.faceGroups[i]!==offset||result.faceGroups[i+1]%3||!result.faceGroups[i+1])throw Error('Ungültige CAD-Flächenzuordnung.');
        const ids=byHash.get(result.faceGroups[i+2]);if(!ids||ids.length!==1)throw Error('CAD-Flächenzuordnung ist unbekannt oder mehrdeutig.');
        result.faceGroups[i+2]=ids[0];offset+=result.faceGroups[i+1];
      }
      if(offset!==indexSize)throw Error('Unvollständige CAD-Flächenzuordnung.');
    }finally{faces.forEach(face=>face.delete());}
    return result;
  }finally{raw?.delete();copy.delete();}
}
