import {buildAssociativeStepDrill} from './cad-step-drill.js';
import {partFaceColors,splitPartSurfaceMesh,hasCurrentPartSurfaceGroups} from './cad-part-properties.js';
import {hasGeometryRefs,isGeometryRef,sameDeferredGeometry} from './cad-geometry-ref.js';
import {cadStepMeshParts} from './cad-step-appearance.js';
import {meshColorsEnabled} from './mesh-appearance.js';
import {createCadDisplayEncoder} from './cad-display-cache.js';
import {cadDisplayStretch,cadDisplayIsometry} from './cad-display-scale.js';
import {createCadAnnotationValidator} from './cad-annotations-native.js';
import {buildCadRecipe,constructionTolerance,cadRecipeMinimumFeature,CAD_CONSTRUCTION_TOLERANCE} from './cad-recipes.js';
import {cadBoolean,cadCutMany,cadFuseMany,cadBounds,validateCadSolid,writeCadBrep,readCadBrep,transformCad,cadDisplayMesh,cadExportMesh} from './cad-native-kernel.js';
import {cadProjectSnapshot,validateAffineMatrix} from './cad-project.js';
import {cadIdentity,multiplyCadMatrices,inverseCadMatrix,cadPoint} from './cad-affine.js';
import {createCadCache} from './cad-worker-client.js';
import {importCadStep,importCadStepAssembly,exportCadStep} from './cad-step-io.js';
import {cadColorPartsNative} from './cad-analysis-native.js';
import {encodeCadMeshes} from './cad-mesh-formats.js';
import {rebindCadWorkplaneNative} from './cad-topology-native.js';
import {analyzeStlHousing,buildStlHousingCad} from './cad-stl-housing.js';
import {repairStlMesh} from './cad-stl-repair.js';
import {partitionCadNative} from './cad-partition-native.js';
import {extractCadNative} from './cad-extraction-native.js';
import {cadGeometryDigest,cadSourceGeometryDigest} from './cad-geometry-digest.js';
import {cadModelingNative,cadProfileModelingNative} from './cad-modeling-native.js';
import {buildAssociativeBoxDrill} from './cad-associative-drill.js';

// This independent service is not enabled in the v4 application. Unsupported
// construction or transformation fails instead of entering a mesh code path.
export function createCadService({oc,maxEntries=128,maxBytes=64*1024*1024,finish,onConstruct}={}){
  if(!oc)throw new TypeError('OpenCascade-Modul fehlt.');
  const annotationValidator=createCadAnnotationValidator(oc),displayEnvelope=createCadDisplayEncoder();
  const utf8=new TextEncoder(),cache=createCadCache({maxEntries,maxBytes,dispose:entry=>entry.shape.delete()}),displayCache=createCadCache({maxEntries,maxBytes}),inspectionCache=createCadCache({maxEntries,maxBytes}),colorRegionCache=createCadCache({maxEntries,maxBytes}),exportMeshCache=createCadCache({maxEntries,maxBytes}),sourceProofs=createCadCache({maxEntries:5000,maxBytes:4*1024*1024}),constructions=new Map();let disposed=false;
  function alive(signal){if(disposed)throw Error('CAD-Dienst geschlossen.');if(signal?.aborted){const error=Error('CAD-Berechnung abgebrochen.');error.name='AbortError';throw error;}}
  function referenceBounds(node){
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],coordinates=node.mesh.verts;
    for(let i=0;i<coordinates.length;i+=3){const local=coordinates.slice(i,i+3);if(local.some(v=>!Number.isFinite(Math.fround(v))))throw Error('Netzreferenz besitzt nicht darstellbare Koordinaten.');const point=cadPoint(node.transform,local);for(let k=0;k<3;k++){min[k]=Math.min(min[k],point[k]);max[k]=Math.max(max[k],point[k]);}}
    if([...min,...max].some(v=>Math.abs(v)>100000)||min.some((v,k)=>max[k]-v>10000))throw Error('Netzreferenz überschreitet den darstellbaren Arbeitsbereich.');
  }
  function bodyRecord(shape){const checked=validateCadSolid(oc,shape);return {shape,brep:writeCadBrep(oc,shape),stats:{bounds:{min:checked.bounds.min,max:checked.bounds.max},volume:checked.volume,solids:checked.solids}};}
  function snapshotNode(node,record){return {...node,brep:{format:'OpenCascade-BRep',data:record.brep,triangulation:false},stats:structuredClone(record.stats)};}
  // Induced matrix norm sqrt(||A||1 ||A||infinity) bounds the amplification
  // of any local curve error, including ancestor shear and reflection.
  function stretch(matrix){
    const columns=[0,1,2].map(i=>[Math.abs(matrix[i*4]),Math.abs(matrix[i*4+1]),Math.abs(matrix[i*4+2])]);
    const one=Math.max(...columns.map(c=>c.reduce((a,b)=>a+b,0))),infinity=Math.max(...[0,1,2].map(i=>columns.reduce((sum,c)=>sum+c[i],0)));
    return Math.sqrt(one)*Math.sqrt(infinity);
  }
  function tolerance(recipe,world){
    if(!['heart','gear','thread','nut'].includes(recipe?.type))return undefined;
    const amplification=stretch(world),inverseAmplification=stretch(inverseCadMatrix(world));
    if(!Number.isFinite(amplification)||amplification<=0||!Number.isFinite(inverseAmplification)||inverseAmplification<=0)throw Error('CAD-Transformation hat keine nachweisbare Genauigkeitsgrenze.');
    // For every local feature vector v: |A v| >= |v| / ||A^-1||.
    // Use a conservative lower bound even with anisotropic scale or shear,
    // then divide the world error allowance by the full-chain amplification.
    const localFeature=cadRecipeMinimumFeature(recipe),worldFeatureLower=localFeature/inverseAmplification;
    const worldAllowance=constructionTolerance(worldFeatureLower);
    return constructionTolerance(localFeature,Math.min(CAD_CONSTRUCTION_TOLERANCE,worldAllowance/amplification));
  }
  function nodeTolerance(node,world){const required=tolerance(node.recipe,world);if(node.constructionBudget===undefined)return required;if(node.source!=='native'||required===undefined||!Number.isFinite(node.constructionBudget)||node.constructionBudget<2e-7||node.constructionBudget>CAD_CONSTRUCTION_TOLERANCE)throw Error('Ungültiges gespeichertes CAD-Konstruktionsbudget.');return Math.min(required,node.constructionBudget);}
  function construct(node,world,signal){
    alive(signal);let shape;
    const count=(constructions.get(node.id)??0)+1;constructions.delete(node.id);constructions.set(node.id,count);while(constructions.size>5000)constructions.delete(constructions.keys().next().value);onConstruct?.({id:node.id,source:node.source,type:node.recipe?.type});
    try{
      if(node.source==='native')shape=buildCadRecipe(oc,node.recipe,{affineTransform:(s,m)=>transformCad(oc,s,m),constructionBudget:nodeTolerance(node,world)});
      else if(node.source==='step')shape=readCadBrep(oc,node.brep.data);
      else if(node.drill)shape=node.drill.version===3?buildAssociativeStepDrill(oc,node.children[0],node.drill):buildAssociativeBoxDrill(oc,node.children[0],node.drill);
      else{
        if(node.source==='modeling'){
          if(node.modeling.sourceSignature&&cadSourceGeometryDigest(node.children[0])!==node.modeling.sourceSignature)throw Object.assign(Error('Die Originalgeometrie wurde geändert. Die Bearbeitungsfläche erneut wählen.'),{code:'CAD_MODELING_REFERENCE_CHANGED'});
          const {sourceSignature,version,...operation}=node.modeling;
          if(['loft','sweep'].includes(operation.kind)){
            const profiles=node.children.map(child=>({sketch:child.recipe.sketch,frame:child.transform}));
            shape=cadProfileModelingNative(oc,operation.kind==='loft'?{...operation,profiles}:{kind:'sweep',profile:profiles[0],path:operation.path});
          }else{
            const child=node.children[0],local=readCadBrep(oc,child.brep.data);let input;
            try{input=transformCad(oc,local,child.transform);shape=cadModelingNative(oc,input,operation);}finally{input?.delete();local.delete();}
          }
        }else if(['partition','extraction'].includes(node.source)){const child=node.children[0];if(child.suppressed)throw Error('Die Teilung benötigt eine aktive Originalquelle.');const local=readCadBrep(oc,child.brep.data);try{shape=transformCad(oc,local,child.transform);}finally{local.delete();}}else{
        const children=node.children.filter(child=>!child.suppressed),holeGroup=node.children.every(child=>!child.solid),solids=holeGroup?children:children.filter(child=>child.solid),holes=holeGroup?[]:children.filter(child=>!child.solid);
        if(!solids.length)throw Error('CAD-Gruppe benötigt mindestens eine aktive Körperquelle.');
        const operands=[];
        try{
          for(const child of solids){const local=readCadBrep(oc,child.brep.data);try{operands.push(transformCad(oc,local,child.transform));}finally{local.delete();}}
          if(operands.length===1)shape=operands.shift();
          else if(node.operation==='intersection'){
            shape=operands.shift();for(const operand of operands){const combined=cadBoolean(oc,'intersection',shape,operand);shape.delete();shape=combined;}
          }else shape=cadFuseMany(oc,operands,{balanced:true});
        }finally{operands.forEach(operand=>operand.delete());}
        const cutters=[];
        try{
          for(const hole of holes){const local=readCadBrep(oc,hole.brep.data);try{cutters.push(transformCad(oc,local,hole.transform));}finally{local.delete();}}
          if(cutters.length){let cut;
            try{cut=cadCutMany(oc,shape,cutters);}catch(error){if(cutters.length<2)throw error;
              // Preserve the proven sequential path for native batch failures.
              for(const cutter of cutters){const next=cadBoolean(oc,'difference',shape,cutter);shape.delete();shape=next;}cut=null;
            }
            if(cut){shape.delete();shape=cut;}
          }
        }finally{cutters.forEach(cutter=>cutter.delete());}
        }
        if(node.extraction){const selected=extractCadNative(oc,shape,node.extraction);shape.delete();shape=selected;}
        if(node.partition){const divided=partitionCadNative(oc,shape,node.partition);shape.delete();shape=divided;}
        if(node.finish){if(typeof finish!=='function')throw Error('CAD-Kantenoperationen mit Herkunftszuordnung sind noch nicht angebunden.');const finished=finish(shape,node.finish,node);if(finished===shape)throw Error('CAD-Kantenprüfer muss einen eigenen Ergebniskörper liefern.');try{validateCadSolid(oc,finished);}catch(error){finished.delete();throw error;}shape.delete();shape=finished;}
      }
      const record=bodyRecord(shape);
      // The native reader has already validated the topology and excluded
      // triangulations. Rewriting unchanged STEP/STL sources renormalizes
      // axes by a few ulps and must not alter their saved source bytes.
      if(node.source==='step')record.brep=node.brep.data;
      return record;
    }catch(error){shape?.delete();throw error;}
  }
  function sourceKey(node,budget){
    if(node.source==='native')return JSON.stringify(['native',node.recipe,budget]);
    if(node.source==='step')return JSON.stringify(['step',node.brep.data]);
    return JSON.stringify([node.source,node.operation,node.partition,node.extraction,node.modeling,node.finish,node.drill,node.children.map(child=>[node.finish?child.id:null,child.brep.data,child.transform,child.solid,!!child.suppressed,...(node.source==='modeling'?[child.recipe]:[])])]);
  }
  function cached(node,world,signal){
    const key=sourceKey(node,nodeTolerance(node,world));let entry=cache.get(key),owned=false;
    if(!entry){
      const proofKey=cadGeometryDigest(key),proof=sourceProofs.get(proofKey);
      // A private native proof permits reading a finished unchanged BRep after
      // shape eviction. Caller-provided geometry alone never establishes proof.
      // Recipe/budget and every stored BRep byte must match the native result.
      if(proof&&node.brep?.data&&cadGeometryDigest(node.brep.data)===proof.brepDigest)entry={shape:readCadBrep(oc,node.brep.data),brep:node.brep.data,stats:structuredClone(proof.stats)};
      else{entry=construct(node,world,signal);const evidence={brepDigest:cadGeometryDigest(entry.brep),stats:structuredClone(entry.stats)};sourceProofs.set(proofKey,evidence,utf8.encode(proofKey+JSON.stringify(evidence)).length);}
      const cost=utf8.encode(key).length+utf8.encode(entry.brep).length;try{if(!cache.set(key,entry,Math.max(1,cost)))owned=true;}catch(error){entry.shape.delete();throw error;}
    }
    return {entry,release:()=>{if(owned)entry.shape.delete();}};
  }
  function nativeNode(recipe,{id=globalThis.crypto.randomUUID(),name=recipe.type,transform=cadIdentity(),solid=true,...metadata}={}){
    alive();validateAffineMatrix(transform);
    for(const key of Object.keys(metadata))if(!['color','opacity','multicolor','hidden','locked','suppressed','layerId','folderId','metadata','constructionBudget'].includes(key))throw Error('Unbekannte CAD-Objekteigenschaft: '+key);
    const node={id,kind:'cad',name,solid,source:'native',recipe:structuredClone(recipe),transform:[...transform],...metadata};
    const {entry,release}=cached(node,transform);try{return snapshotNode(node,entry);}finally{release();}
  }
  function stepNode(bytes,{id=globalThis.crypto.randomUUID(),name='STEP-Körper',transform=cadIdentity(),solid=true,...metadata}={}){
    alive();validateAffineMatrix(transform);
    for(const key of Object.keys(metadata))if(!['color','opacity','hidden','locked','layerId','folderId','metadata'].includes(key))throw Error('Unbekannte STEP-Objekteigenschaft: '+key);
    return {id,kind:'cad',name,solid,source:'step',transform:[...transform],...metadata,...importCadStep(oc,bytes)};
  }
  function stepAssembly(project,bytes,options={}){
    alive();const tree=importCadStepAssembly(oc,bytes),layerId=options.layerId??project.activeLayerId;
    const folder=(name,parentId)=>{const id=globalThis.crypto.randomUUID();project.folders.push({id,name,hidden:false,locked:false,layerId,parentId});return id;};
    const parent=folder(options.name??'STEP',options.folderId??project.activeFolderId),ids=[];
    function visit(item,parentId){
      if(item.children){const id=folder(item.name,parentId);item.children.forEach(child=>visit(child,id));return;}
      const id=ids.length?globalThis.crypto.randomUUID():(options.id??globalThis.crypto.randomUUID()),metadata={...options.metadata};
      if(item.faceColors?.length)metadata.stepFaceColors=item.faceColors.map(f=>({faceIndex:f.faceIndex,color:f.appearance.color,opacity:Math.max(.05,f.appearance.opacity??1)}));
      project.nodes.push({id,kind:'cad',name:item.name,source:'step',solid:true,transform:options.transform??cadIdentity(),layerId,folderId:parentId,metadata,...item.appearance,...(item.appearance.opacity!==undefined?{opacity:Math.max(.05,item.appearance.opacity)}:{}),brep:item.brep,stats:item.stats});ids.push(id);
    }
    tree.forEach(item=>visit(item,parent));cadProjectSnapshot(project);return ids;
  }
  function stlHousingNode(mesh,{id=globalThis.crypto.randomUUID(),name='STL-Gehäuse',transform=cadIdentity(),solid=true,...metadata}={},repair={}){
    alive();validateAffineMatrix(transform);
    for(const key of Object.keys(metadata))if(!['color','opacity','hidden','locked','layerId','folderId','metadata'].includes(key))throw Error('Unbekannte STL-CAD-Objekteigenschaft: '+key);
    if(!repair||typeof repair!=='object'||Array.isArray(repair)||Object.keys(repair).some(key=>!['enabled','fillSmallHoles'].includes(key))||['enabled','fillSmallHoles'].some(key=>repair[key]!==undefined&&typeof repair[key]!=='boolean'))throw Error('Ungültige STL-Reparaturoption.');
    const fixed=repair.enabled?repairStlMesh(mesh,{fillSmallHoles:repair.fillSmallHoles??false}):null;
    const parameters=analyzeStlHousing(fixed?.mesh??mesh),{quality,...geometry}=buildStlHousingCad(oc,parameters);
    const measure=value=>Number(value.toFixed(5)),faceted=quality.method==='native-planar-STL-faces',surfaceNote=faceted?`STL-Flächen als native CAD-Ebenen erhalten; ${quality.splitVertices} zusätzliche topologische Punkte trennen berührende Flächenfächer ohne Koordinatenänderung. Rundungen bleiben facettiert; Kantenabrundungen über solche Facetten können geometrisch ungeeignet sein.`:`${quality.curvedPatches} begrenzte Bézierflächen; ebene Bereiche nativ zusammengefasst. Die einzelnen Flächen sind glatt; Übergänge sind nicht überall tangentenstetig.`,summary=`STL-CAD-Rekonstruktion: Außenmaß ${parameters.size.map(measure).join(' × ')} mm. ${surfaceNote} Oberflächen-Abweichungsgrenze zur STL: ${measure(quality.surfaceBound)} mm (Grenzwert 0,25 mm); kritische Geometrie: ${measure(quality.criticalBound)} mm (Grenzwert 0,10 mm). Volumenabweichung: ${measure(quality.volumeDeviation*100)} %. Ursprüngliche Radien und Konstruktionshistorie werden nicht wiederhergestellt. Original-STL bleibt separate Eingabedatei.`;
    const repairNote=fixed?`STL-Reparatur: ${fixed.report.removedDegenerateFaces} Nullflächen und ${fixed.report.removedDuplicateFaces} doppelte Flächen entfernt, ${fixed.report.splitNeighborFaces} kollineare Nachbarkanten geteilt, ${fixed.report.flippedFaces} Flächen ausgerichtet, ${fixed.report.addedFaces} Flächen zum Schließen kleiner Lücken ergänzt. Punkte wurden nicht verschoben. Die CAD-Abweichungsgrenze bezieht sich auf das reparierte Netz.`:'';
    const original=metadata.metadata??{},notes=[original.notes?.slice(0,Math.max(0,3998-summary.length-repairNote.length)),summary,repairNote].filter(Boolean).join('\n');
    return {id,kind:'cad',name,solid,source:'step',transform:[...transform],...metadata,metadata:{...original,notes},...geometry};
  }
  function inspect(node,world=node.transform){
    if(isGeometryRef(node.brep))throw Object.assign(Error('Geometrie für native Prüfung zuerst laden.'),{code:'GEOMETRY_NOT_LOADED'});
    alive();world=validateAffineMatrix(world);
    // Translation preserves native topology, volume and exact extrema. Cache
    // only proofs from actual BRep reads, keyed by its full bytes and linear
    // map; caller-supplied stats never establish a geometry proof.
    const linear=[...world];linear[12]=linear[13]=linear[14]=0;
    const key=JSON.stringify([node.brep.data,linear]);let record=inspectionCache.get(key);
    if(!record){const local=readCadBrep(oc,node.brep.data);let placed;
      try{const localBounds=cadBounds(oc,local);placed=transformCad(oc,local,linear);const checked=validateCadSolid(oc,placed);record={localBounds,worldBounds:checked.bounds,volume:checked.volume,solids:checked.solids};inspectionCache.set(key,record,utf8.encode(key).length+512);}
      finally{placed?.delete();local.delete();}
    }
    const result=structuredClone(record),bounds=result.worldBounds;
    bounds.min=bounds.min.map((v,k)=>v+world[12+k]);bounds.max=bounds.max.map((v,k)=>v+world[12+k]);bounds.center=bounds.center.map((v,k)=>v+world[12+k]);
    return result;
  }
  async function rebuild(project,{signal,progress,baseline,catalogOnly=false}={}){
    alive(signal);const draft=cadProjectSnapshot(project),total=draft.nodes.length;let completed=0;
    function visit(node,parent){
      alive(signal);if(node.kind!=='cad'){referenceBounds(node);return node;}
      const world=multiplyCadMatrices(parent,node.transform);
      if(node.extraction&&cadSourceGeometryDigest(node.children[0])!==node.extraction.sourceSignature){const error=Error('Die Originalgeometrie wurde geändert. Körper erneut herauslösen.');error.code='CAD_REEXTRACT_REQUIRED';throw error;}
      if(node.children)node.children=node.children.map(child=>visit(child,node.extraction?.constructionFrame??world));
      const {entry,release}=cached(node,world,signal);
      try{return snapshotNode(node,entry);}finally{release();}
    }
    const nodes=[];for(const node of draft.nodes){if(hasGeometryRefs(node)){if(!catalogOnly&&!sameDeferredGeometry(baseline?.nodes.find(n=>n.id===node.id),node))throw Object.assign(Error('Geänderte Geometrie vor dem Aufbau laden.'),{code:'GEOMETRY_NOT_LOADED'});nodes.push(node);progress?.(++completed/Math.max(1,total));continue;}const built=visit(node,cadIdentity());if(built.kind==='cad'){const checked=inspect(built);if([...checked.worldBounds.min,...checked.worldBounds.max].some(v=>Math.abs(v)>100000)||checked.worldBounds.size.some(v=>v<.01||v>10000))throw Error('CAD-Körper überschreitet den zulässigen Arbeitsbereich.');}nodes.push(annotationValidator.rebindRoot(built));progress?.(++completed/Math.max(1,total));await Promise.resolve();}
    return rebindCadWorkplaneNative(oc,{...draft,nodes},{baseline});
  }
  /** Explicit parameter updates visit only selected source branches. Every
   * geometry edit is already collected before this single bottom-up traversal.
   * afterNode changes only its final affine placement using fresh native bounds.
   * Persisted strict budgets cover any not-yet-known ancestor resize. */
  async function rebuildSubset(project,{baseline,rootIds,touchedIds,geometryIds,afterNode,beforeNode,nodeOrder,signal,progress}={}){
    alive(signal);if(!baseline||!Array.isArray(rootIds)||new Set(rootIds).size!==rootIds.length||!Array.isArray(touchedIds)||!Array.isArray(geometryIds)||afterNode!==undefined&&typeof afterNode!=='function'||beforeNode!==undefined&&typeof beforeNode!=='function'||nodeOrder!==undefined&&(!Array.isArray(nodeOrder)||new Set(nodeOrder).size!==nodeOrder.length))throw Error('Gezielter CAD-Aufbau benötigt bestätigte Quellen und einen vollständigen Änderungsplan.');
    const draft=cadProjectSnapshot(project),before=cadProjectSnapshot(baseline),roots=new Set(rootIds),touched=new Set(touchedIds),geometry=new Set(geometryIds),budgets=new Map();
    if(JSON.stringify(draft.nodes.map(n=>n.id))!==JSON.stringify(before.nodes.map(n=>n.id))||rootIds.some(id=>!draft.nodes.some(n=>n.id===id&&n.kind==='cad')))throw Error('Gezielter CAD-Aufbau darf keine Teile ersetzen oder entfernen.');
    for(let i=0;i<draft.nodes.length;i++)if(!roots.has(draft.nodes[i].id)&&JSON.stringify(draft.nodes[i])!==JSON.stringify(before.nodes[i]))throw Error('Ein unbeteiligtes Teil wurde im gezielten CAD-Aufbau geändert.');
    // Reused native sources retain the construction proof of the confirmed
    // placement. A later affine edit can require a tighter bound even when
    // its persisted refinement budget and recipe have not changed. Include
    // every descendant: an untouched sibling can inherit an ancestor resize.
    function baselineBudgets(node,parent){
      alive(signal);if(node.kind!=='cad')return;const world=multiplyCadMatrices(parent,node.transform),budget=nodeTolerance(node,world);
      if(budget!==undefined)budgets.set(node.id,budget);
      for(const child of node.children??[])baselineBudgets(child,node.extraction?.constructionFrame??world);
    }
    for(const root of before.nodes)if(roots.has(root.id))baselineBudgets(root,cadIdentity());
    async function build(node,parent,target){
      alive(signal);if(beforeNode){node=await beforeNode(node,{project:draft,target,parentWorld:parent,world:multiplyCadMatrices(parent,node.transform)})??node;alive(signal);}
      const world=multiplyCadMatrices(parent,node.transform);let built=node;
      if(geometry.has(node.id)){const budget=nodeTolerance(node,world),{entry,release}=cached(node,world,signal);try{built=snapshotNode(node,entry);if(budget!==undefined)budgets.set(node.id,budget);}finally{release();}}
      if(afterNode)built=await afterNode(built,{parentWorld:parent,world});alive(signal);return built;
    }
    async function visit(node,parent,target){
      alive(signal);if(!touched.has(node.id))return node;if(node.kind!=='cad')throw Error('Gezielte native Maße benötigen CAD-Quellen.');
      const world=multiplyCadMatrices(parent,node.transform);
      if(node.extraction&&cadSourceGeometryDigest(node.children[0])!==node.extraction.sourceSignature)throw Object.assign(Error('Die Originalgeometrie wurde geändert. Körper erneut herauslösen.'),{code:'CAD_REEXTRACT_REQUIRED'});
      if(node.children){const next=[];for(const child of node.children)next.push(await visit(child,node.extraction?.constructionFrame??world,{rootId:target.rootId,path:[...target.path,child.id]}));node.children=next;}
      return build(node,parent,target);
    }
    if(nodeOrder!==undefined){
      const indexed=new Map(),rank=new Map(nodeOrder.map((id,index)=>[id,index]));
      function index(node,target,parent){indexed.set(node.id,{node,target,parent});for(const child of node.children??[])index(child,{rootId:target.rootId,path:[...target.path,child.id]},node.id);}
      for(const root of draft.nodes)if(root.kind==='cad')index(root,{rootId:root.id,path:[]},null);
      if(nodeOrder.some(id=>!indexed.has(id))||[...touched].some(id=>!rank.has(id)))throw Error('Unvollständige native Abhängigkeitsreihenfolge.');
      for(const [id,entry]of indexed)if(touched.has(id)&&entry.parent&&touched.has(entry.parent)&&rank.get(id)>=rank.get(entry.parent))throw Error('CAD-Quellen müssen vor ihrem abhängigen Körper aufgebaut werden.');
      function parentWorld(entry){if(!entry.parent)return cadIdentity();const parent=indexed.get(entry.parent);return parent.node.extraction?.constructionFrame??multiplyCadMatrices(parentWorld(parent),parent.node.transform);}
      for(const id of nodeOrder){if(!touched.has(id))continue;const entry=indexed.get(id);if(!roots.has(entry.target.rootId)||entry.node.kind!=='cad')throw Error('Ungültiges natives Abhängigkeitsziel.');if(entry.node.extraction&&cadSourceGeometryDigest(entry.node.children[0])!==entry.node.extraction.sourceSignature)throw Object.assign(Error('Die Originalgeometrie wurde geändert. Körper erneut herauslösen.'),{code:'CAD_REEXTRACT_REQUIRED'});const built=await build(entry.node,parentWorld(entry),entry.target),siblings=entry.parent?indexed.get(entry.parent).node.children:draft.nodes;siblings[siblings.findIndex(n=>n.id===id)]=built;entry.node=built;}
    }
    let completed=0;for(let i=0;i<draft.nodes.length;i++)if(roots.has(draft.nodes[i].id)){if(nodeOrder===undefined)draft.nodes[i]=await visit(draft.nodes[i],cadIdentity(),{rootId:draft.nodes[i].id,path:[]});const checked=inspect(draft.nodes[i]);if([...checked.worldBounds.min,...checked.worldBounds.max].some(v=>Math.abs(v)>100000)||checked.worldBounds.size.some(v=>v<.01||v>10000))throw Error('CAD-Körper überschreitet den zulässigen Arbeitsbereich.');draft.nodes[i]=annotationValidator.rebindRoot(draft.nodes[i]);progress?.(++completed/Math.max(1,roots.size));await Promise.resolve();}
    function precision(node,parent){if(node.kind!=='cad')return;const world=multiplyCadMatrices(parent,node.transform),used=budgets.get(node.id),required=nodeTolerance(node,world);if(used!==undefined&&used>required*(1+1e-12))throw Error('Das fertige CAD-Maß benötigt eine feinere Konstruktion als das einmalig gebaute Ergebnis.');for(const child of node.children??[])precision(child,node.extraction?.constructionFrame??world);}
    for(const root of draft.nodes)if(roots.has(root.id))precision(root,cadIdentity());
    return rebindCadWorkplaneNative(oc,draft,{baseline:before});
  }
  function display(project,quality={deflection:.02,angleDegrees:8},{colored=false,knownMeshes,ids}={}){
    alive();const draft=cadProjectSnapshot(project),result=[];
    if(knownMeshes!==undefined&&(!Array.isArray(knownMeshes)||knownMeshes.length>128||knownMeshes.some(t=>typeof t!=='string'||!/^cad-mesh-[1-9]\d{0,15}$/.test(t))))throw Error('Ungültige CAD-Anzeigeverweise.');
    if(ids!==undefined&&(!Array.isArray(ids)||ids.length>500||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!draft.nodes.some(n=>n.id===id))))throw Error('Ungültige Teilauswahl für die Darstellung.');
    const known=knownMeshes===undefined?null:new Set(knownMeshes),included=ids===undefined?null:new Set(ids);
    for(const node of draft.nodes){
      if(included&&!included.has(node.id))continue;
      if(node.kind!=='cad'){referenceBounds(node);result.push({id:node.id,kind:node.kind,transform:node.transform,mesh:structuredClone(node.mesh),...(partFaceColors(node).length?{faceColors:partFaceColors(node)}:{})});continue;}
      if(colored&&node.solid&&node.multicolor&&node.children&&!hasCurrentPartSurfaceGroups(node)){
        const linear=[...node.transform];linear[12]=linear[13]=linear[14]=0;
        const colorSource=value=>[value.brep.data,value.transform,value.name,value.color,value.opacity,value.solid,!!value.suppressed,!!value.multicolor,value.children?.map(colorSource)];
        const placementKey=JSON.stringify(['colored-placement',colorSource({...node,transform:cadIdentity()}),quality]),previous=displayCache.get(placementKey);
        let placedMeshes,displayTransform;
        if(previous){
          const sameFrame=linear.every((v,i)=>v===previous.frame[i]),delta=sameFrame?cadIdentity():multiplyCadMatrices(linear,inverseCadMatrix(previous.frame));
          if(cadDisplayIsometry(delta)){for(let k=0;k<3;k++)delta[12+k]=node.transform[12+k];placedMeshes=previous.meshes;displayTransform=delta;}
        }
        if(placedMeshes){for(const part of placedMeshes){const {mesh,...style}=part;result.push({id:node.id,rootId:node.id,kind:'cad',...style,...displayEnvelope(mesh,known),transform:[...displayTransform]});}continue;}
        // Keep the native world-space partition on a genuine stretch/shear.
        // Reserve more than the isometry roundoff admitted above, so reusing
        // an existing frame cannot exceed the chosen world deflection.
        const localQuality={deflection:(quality.deflection??.02)/(1+1e-9),angleDegrees:quality.angleDegrees??8};
        const localNode={...node,transform:linear},key=JSON.stringify(['colored',colorSource(localNode),localQuality]);let meshes=displayCache.get(key);
        if(!meshes){const parts=cadColorPartsNative(oc,localNode,{display:true,regionCache:colorRegionCache});try{meshes=parts.map(part=>{
          const brep=part.displayBrep??writeCadBrep(oc,part.shape),meshKey=JSON.stringify([brep,localQuality]);let mesh=displayCache.get(meshKey);
          if(!mesh){mesh=cadDisplayMesh(oc,part.shape,localQuality);const bytes=utf8.encode(meshKey).length+[mesh.vertices,mesh.normals,mesh.triangles,mesh.faceGroups].reduce((n,values)=>n+values.length*8,0);displayCache.set(meshKey,mesh,Math.max(1,bytes));}
          return {color:part.color,opacity:part.opacity,name:part.name,mesh};
        });const bytes=utf8.encode(key).length+meshes.reduce((sum,part)=>sum+[part.mesh.vertices,part.mesh.normals,part.mesh.triangles,part.mesh.faceGroups].reduce((n,values)=>n+values.length*8,0),0);displayCache.set(key,meshes,Math.max(1,bytes));}finally{parts.forEach(part=>part.shape.delete());}}
        const placementBytes=utf8.encode(placementKey).length+512+meshes.reduce((sum,part)=>sum+[part.mesh.vertices,part.mesh.normals,part.mesh.triangles,part.mesh.faceGroups].reduce((n,values)=>n+values.length*8,0),0);displayCache.set(placementKey,{frame:linear,meshes},Math.max(1,placementBytes));
        const transform=cadIdentity();for(let k=0;k<3;k++)transform[12+k]=node.transform[12+k];
        for(const part of meshes){const {mesh,...style}=part;result.push({id:node.id,rootId:node.id,kind:'cad',...style,...displayEnvelope(mesh,known),transform:[...transform]});}continue;
      }
      const localQuality={deflection:(quality.deflection??.02)/cadDisplayStretch(node.transform),angleDegrees:quality.angleDegrees??8},key=JSON.stringify([node.brep.data,localQuality]);let mesh=displayCache.get(key);
      if(!mesh){
        // A slightly finer mesh of the identical native BRep already meets
        // this world-space error budget. Reuse only the same angular budget
        // and at most ten percent tighter deflection, so shrinking does not
        // retain an arbitrarily dense mesh. No geometry/proof/export changes.
        const prefix='['+JSON.stringify(node.brep.data)+',';
        mesh=displayCache.find((value,candidateKey)=>{if(!candidateKey.startsWith(prefix))return false;const candidate=JSON.parse(candidateKey.slice(prefix.length,-1));return candidate.angleDegrees===localQuality.angleDegrees&&candidate.deflection<=localQuality.deflection&&candidate.deflection>=localQuality.deflection/1.1;});
      }
      if(!mesh){const shape=readCadBrep(oc,node.brep.data);try{mesh=cadDisplayMesh(oc,shape,localQuality);const bytes=utf8.encode(key).length+[mesh.vertices,mesh.normals,mesh.triangles,mesh.faceGroups].reduce((sum,values)=>sum+values.length*8,0);displayCache.set(key,mesh,Math.max(1,bytes));}finally{shape.delete();}}
      result.push({id:node.id,kind:'cad',transform:node.transform,...(partFaceColors(node).length?{faceColors:partFaceColors(node)}:{}),...displayEnvelope(mesh,known)});
    }
    return result;
  }
  function worldShape(node){alive();if(node.kind!=='cad')throw Error('Netzreferenzen sind keine CAD-Produktionsteile.');const local=readCadBrep(oc,node.brep.data);try{return transformCad(oc,local,node.transform);}finally{local.delete();}}
  function productionNodes(project,{ids}={}){
    alive();const draft=cadProjectSnapshot(project);
    if(ids!==undefined&&(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!draft.nodes.some(n=>n.id===id))))throw Error('Ungültiger CAD-Exportumfang.');
    const layers=new Map(draft.layers.map(layer=>[layer.id,layer])),folders=new Map(draft.folders.map(folder=>[folder.id,folder]));
    function visible(node){if(node.hidden||layers.get(node.layerId)?.hidden)return false;let id=node.folderId;while(id){const folder=folders.get(id);if(folder.hidden)return false;id=folder.parentId;}return true;}
    return draft.nodes.filter(node=>node.kind==='cad'&&node.solid&&!node.suppressed&&visible(node)&&(!ids||ids.includes(node.id)));
  }
  function exportMesh(shape,quality){
    const key=JSON.stringify([writeCadBrep(oc,shape),quality]);let mesh=exportMeshCache.get(key);
    if(!mesh){mesh=cadExportMesh(oc,shape,quality);const bytes=utf8.encode(key).length+[mesh.vertices,mesh.triangles,mesh.faceGroups].reduce((sum,values)=>sum+values.length*8,0);exportMeshCache.set(key,mesh,Math.max(1,bytes));}
    return structuredClone(mesh);
  }
  function exportMeshes(project,quality={deflection:.01,angleDegrees:5},{ids}={}){
    const outputs=[];
    for(const node of productionNodes(project,{ids})){const parts=cadColorPartsNative(oc,node,{regionCache:colorRegionCache});try{for(const part of parts)for(const output of cadStepMeshParts(part,exportMesh(part.shape,quality)))outputs.push({id:node.id,...output});}finally{parts.forEach(part=>part.shape.delete());}}
    return outputs;
  }
  function exportStep(project,{ids}={}){
    const parts=[];try{for(const node of productionNodes(project,{ids}))parts.push(...cadColorPartsNative(oc,node,{regionCache:colorRegionCache}));return exportCadStep(oc,parts);}finally{parts.forEach(part=>part.shape.delete());}
  }
  function meshExportParts(project,{ids,includeReferences=false,meshColorParts}={}){
    const draft=cadProjectSnapshot(project),layers=new Map(draft.layers.map(v=>[v.id,v])),folders=new Map(draft.folders.map(v=>[v.id,v])),parts=[];
    for(const n of draft.nodes){
      if(!(n.kind==='mesh'&&n.meshRole!=='hole'||includeReferences&&n.kind==='referenceMesh')||n.hidden||layers.get(n.layerId)?.hidden||ids&&!ids.includes(n.id))continue;
      let folder=n.folderId,hidden=false;while(folder){const f=folders.get(folder);if(f.hidden)hidden=true;folder=f.parentId;}if(hidden)continue;
      const colored=!hasCurrentPartSurfaceGroups(n)&&n.kind==='mesh'&&meshColorsEnabled(n)&&meshColorParts?.filter(part=>part.rootId===n.id);if(colored?.length){for(const part of colored)parts.push({name:part.name,color:part.color,opacity:part.opacity,mesh:{vertices:part.mesh.verts,triangles:part.mesh.triangles}});continue;}
      const vertices=[];for(let i=0;i<n.mesh.verts.length;i+=3)vertices.push(...cadPoint(n.transform,n.mesh.verts.slice(i,i+3)));
      const triangles=[...n.mesh.triangles],m=n.transform,det=m[0]*(m[5]*m[10]-m[9]*m[6])-m[4]*(m[1]*m[10]-m[9]*m[2])+m[8]*(m[1]*m[6]-m[5]*m[2]);
      if(det<0)for(let i=0;i<triangles.length;i+=3)[triangles[i+1],triangles[i+2]]=[triangles[i+2],triangles[i+1]];
      parts.push(...splitPartSurfaceMesh(n,{vertices,triangles}));
    }
    return parts;
  }
  function exportModel(project,{format,quality={deflection:.01,angleDegrees:5},ids,meshColorParts}={}){
    if(format==='step')return {data:exportStep(project,{ids}),extension:'step',mime:'application/step'};
    if(!['stl','obj','3mf','gltf','glb'].includes(format))throw Error('Unbekanntes CAD-Exportformat.');
    if(!Number.isFinite(quality.deflection)||quality.deflection<=0||!Number.isFinite(quality.angleDegrees)||quality.angleDegrees<=0||quality.angleDegrees>180)throw Error('Ungültige CAD-Exportqualität.');
    let parts;
    if(format==='stl'){
      let combined;const shapes=[];
      try{for(const node of productionNodes(project,{ids}))shapes.push(worldShape(node));parts=meshExportParts(project,{ids});if(shapes.length){combined=cadFuseMany(oc,shapes);parts.unshift({name:project.name,color:'#bbbbbb',opacity:1,mesh:cadExportMesh(oc,combined,quality)});}if(!parts.length)throw Error('Keine sichtbaren CAD-Körper oder Netzteile für den Export.');}
      finally{combined?.delete();shapes.forEach(shape=>shape.delete());}
    }else{
      // glTF position attributes are float32. Reserve half of the requested
      // world tolerance for centered-buffer quantization and verify it below.
      const meshQuality=['gltf','glb'].includes(format)?{...quality,deflection:quality.deflection/2}:quality;parts=exportMeshes(project,meshQuality,{ids});
      parts.push(...meshExportParts(project,{ids,includeReferences:['3mf','gltf','glb'].includes(format),meshColorParts}));
    }
    return {data:encodeCadMeshes(parts,format,{roundingBudget:quality.deflection/2}),extension:format==='obj'?'zip':format,mime:{stl:'model/stl',obj:'application/zip','3mf':'model/3mf',gltf:'model/gltf+json',glb:'model/gltf-binary'}[format]};
  }
  return {kernel:oc,nativeNode,stepNode,stepAssembly,stlHousingNode,rebuild,rebuildSubset,display,inspect,worldShape,productionNodes,exportMeshes,exportStep,exportModel,validateReferenceBounds:node=>{alive();referenceBounds(node);return true;},constructionState:()=>({total:[...constructions.values()].reduce((a,b)=>a+b,0),counts:Object.fromEntries(constructions)}),resetConstructionState:()=>constructions.clear(),cacheState:()=>cache.state(),sourceProofState:()=>sourceProofs.state(),displayCacheState:()=>displayCache.state(),inspectionCacheState:()=>inspectionCache.state(),colorRegionCacheState:()=>colorRegionCache.state(),exportMeshCacheState:()=>exportMeshCache.state(),dispose:()=>{disposed=true;annotationValidator.dispose();cache.clear();sourceProofs.clear();displayCache.clear();inspectionCache.clear();colorRegionCache.clear();exportMeshCache.clear();}};
}
