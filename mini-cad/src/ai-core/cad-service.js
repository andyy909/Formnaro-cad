import {meshColorsEnabled} from './mesh-appearance.js';
import {createCadDisplayEncoder} from './cad-display-cache.js';
import {cadDisplayStretch,cadDisplayIsometry} from './cad-display-scale.js';
import {createCadAnnotationValidator} from './cad-annotations-native.js';
import {buildCadRecipe,constructionTolerance,cadRecipeMinimumFeature,CAD_CONSTRUCTION_TOLERANCE} from './cad-recipes.js';
import {cadBoolean,cadCutMany,cadFuseMany,cadBounds,validateCadSolid,writeCadBrep,readCadBrep,transformCad,cadDisplayMesh,cadExportMesh} from './cad-native-kernel.js';
import {cadProjectSnapshot,validateAffineMatrix} from './cad-project.js';
import {cadIdentity,multiplyCadMatrices,inverseCadMatrix,cadPoint} from './cad-affine.js';
import {createCadCache} from './cad-worker-client.js';
import {importCadStep,exportCadStep} from './cad-step-io.js';
import {cadColorPartsNative} from './cad-analysis-native.js';
import {encodeCadMeshes} from './cad-mesh-formats.js';
import {rebindCadWorkplaneNative} from './cad-topology-native.js';
import {analyzeStlHousing,buildStlHousingCad} from './cad-stl-housing.js';
import {repairStlMesh} from './cad-stl-repair.js';
import {partitionCadNative} from './cad-partition-native.js';
import {extractCadNative} from './cad-extraction-native.js';
import {cadSourceGeometryDigest} from './cad-geometry-digest.js';

// This independent service is not enabled in the v4 application. Unsupported
// construction or transformation fails instead of entering a mesh code path.
export function createCadService({oc,maxEntries=128,maxBytes=64*1024*1024,finish}={}){
  if(!oc)throw new TypeError('OpenCascade-Modul fehlt.');
  const annotationValidator=createCadAnnotationValidator(oc),displayEnvelope=createCadDisplayEncoder();
  const utf8=new TextEncoder(),cache=createCadCache({maxEntries,maxBytes,dispose:entry=>entry.shape.delete()}),displayCache=createCadCache({maxEntries,maxBytes}),inspectionCache=createCadCache({maxEntries,maxBytes}),colorRegionCache=createCadCache({maxEntries,maxBytes}),exportMeshCache=createCadCache({maxEntries,maxBytes});let disposed=false;
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
  function construct(node,world,signal){
    alive(signal);let shape;
    try{
      if(node.source==='native')shape=buildCadRecipe(oc,node.recipe,{affineTransform:(s,m)=>transformCad(oc,s,m),constructionBudget:tolerance(node.recipe,world)});
      else if(node.source==='step')shape=readCadBrep(oc,node.brep.data);
      else{
        if(['partition','extraction'].includes(node.source)){const child=node.children[0];if(child.suppressed)throw Error('Die Teilung benötigt eine aktive Originalquelle.');const local=readCadBrep(oc,child.brep.data);try{shape=transformCad(oc,local,child.transform);}finally{local.delete();}}else{
        const children=node.children.filter(child=>!child.suppressed),holeGroup=node.children.every(child=>!child.solid),solids=holeGroup?children:children.filter(child=>child.solid),holes=holeGroup?[]:children.filter(child=>!child.solid);
        if(!solids.length)throw Error('CAD-Gruppe benötigt mindestens eine aktive Körperquelle.');
        for(const child of solids){
          const local=readCadBrep(oc,child.brep.data);let placed;
          try{placed=transformCad(oc,local,child.transform);if(!shape){shape=placed;placed=null;}else{const combined=cadBoolean(oc,node.operation==='intersection'?'intersection':'union',shape,placed);shape.delete();shape=combined;}}
          finally{placed?.delete();local.delete();}
        }
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
    return JSON.stringify([node.source,node.operation,node.partition,node.extraction,node.finish,node.children.map(child=>[node.finish?child.id:null,child.brep.data,child.transform,child.solid,!!child.suppressed])]);
  }
  function cached(node,world,signal){
    const key=sourceKey(node,tolerance(node.recipe,world));let entry=cache.get(key),owned=false;
    if(!entry){entry=construct(node,world,signal);const cost=utf8.encode(key).length+utf8.encode(entry.brep).length;try{if(!cache.set(key,entry,Math.max(1,cost)))owned=true;}catch(error){entry.shape.delete();throw error;}}
    return {entry,release:()=>{if(owned)entry.shape.delete();}};
  }
  function nativeNode(recipe,{id=globalThis.crypto.randomUUID(),name=recipe.type,transform=cadIdentity(),solid=true,...metadata}={}){
    alive();validateAffineMatrix(transform);
    for(const key of Object.keys(metadata))if(!['color','opacity','multicolor','hidden','locked','suppressed','layerId','folderId','metadata'].includes(key))throw Error('Unbekannte CAD-Objekteigenschaft: '+key);
    const node={id,kind:'cad',name,solid,source:'native',recipe:structuredClone(recipe),transform:[...transform],...metadata};
    const {entry,release}=cached(node,transform);try{return snapshotNode(node,entry);}finally{release();}
  }
  function stepNode(bytes,{id=globalThis.crypto.randomUUID(),name='STEP-Körper',transform=cadIdentity(),solid=true,...metadata}={}){
    alive();validateAffineMatrix(transform);
    for(const key of Object.keys(metadata))if(!['color','opacity','hidden','locked','layerId','folderId','metadata'].includes(key))throw Error('Unbekannte STEP-Objekteigenschaft: '+key);
    return {id,kind:'cad',name,solid,source:'step',transform:[...transform],...metadata,...importCadStep(oc,bytes)};
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
  async function rebuild(project,{signal,progress,baseline}={}){
    alive(signal);const draft=cadProjectSnapshot(project),total=draft.nodes.length;let completed=0;
    function visit(node,parent){
      alive(signal);if(node.kind!=='cad'){referenceBounds(node);return node;}
      const world=multiplyCadMatrices(parent,node.transform);
      if(node.extraction&&cadSourceGeometryDigest(node.children[0])!==node.extraction.sourceSignature){const error=Error('Die Originalgeometrie wurde geändert. Körper erneut herauslösen.');error.code='CAD_REEXTRACT_REQUIRED';throw error;}
      if(node.children)node.children=node.children.map(child=>visit(child,node.extraction?.constructionFrame??world));
      const {entry,release}=cached(node,world,signal);
      try{return snapshotNode(node,entry);}finally{release();}
    }
    const nodes=[];for(const node of draft.nodes){const built=visit(node,cadIdentity());if(built.kind==='cad'){const checked=inspect(built);if([...checked.worldBounds.min,...checked.worldBounds.max].some(v=>Math.abs(v)>100000)||checked.worldBounds.size.some(v=>v<.01||v>10000))throw Error('CAD-Körper überschreitet den zulässigen Arbeitsbereich.');}nodes.push(annotationValidator.rebindRoot(built));progress?.(++completed/Math.max(1,total));await Promise.resolve();}
    return rebindCadWorkplaneNative(oc,{...draft,nodes},{baseline});
  }
  function display(project,quality={deflection:.02,angleDegrees:8},{colored=false,knownMeshes}={}){
    alive();const draft=cadProjectSnapshot(project),result=[];
    if(knownMeshes!==undefined&&(!Array.isArray(knownMeshes)||knownMeshes.length>128||knownMeshes.some(t=>typeof t!=='string'||!/^cad-mesh-[1-9]\d{0,15}$/.test(t))))throw Error('Ungültige CAD-Anzeigeverweise.');
    const known=knownMeshes===undefined?null:new Set(knownMeshes);
    for(const node of draft.nodes){
      if(node.kind!=='cad'){referenceBounds(node);result.push({id:node.id,kind:node.kind,transform:node.transform,mesh:structuredClone(node.mesh)});continue;}
      if(colored&&node.solid&&node.multicolor&&node.children){
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
      if(!mesh){const shape=readCadBrep(oc,node.brep.data);try{mesh=cadDisplayMesh(oc,shape,localQuality);const bytes=utf8.encode(key).length+[mesh.vertices,mesh.normals,mesh.triangles,mesh.faceGroups].reduce((sum,values)=>sum+values.length*8,0);displayCache.set(key,mesh,Math.max(1,bytes));}finally{shape.delete();}}
      result.push({id:node.id,kind:'cad',transform:node.transform,...displayEnvelope(mesh,known)});
    }
    return result;
  }
  function worldShape(node){alive();if(node.kind!=='cad')throw Error('Netzreferenzen sind keine CAD-Produktionsteile.');const local=readCadBrep(oc,node.brep.data);try{return transformCad(oc,local,node.transform);}finally{local.delete();}}
  function productionNodes(project,{ids}={}){
    alive();const draft=cadProjectSnapshot(project);
    if(ids!==undefined&&(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!draft.nodes.some(n=>n.id===id))))throw Error('Ungültiger CAD-Exportumfang.');
    const layers=new Map(draft.layers.map(layer=>[layer.id,layer])),folders=new Map(draft.folders.map(folder=>[folder.id,folder]));
    function visible(node){if(node.hidden||layers.get(node.layerId)?.hidden)return false;let id=node.folderId;while(id){const folder=folders.get(id);if(folder.hidden)return false;id=folder.parentId;}return true;}
    return draft.nodes.filter(node=>node.kind==='cad'&&node.solid&&visible(node)&&(!ids||ids.includes(node.id)));
  }
  function exportMesh(shape,quality){
    const key=JSON.stringify([writeCadBrep(oc,shape),quality]);let mesh=exportMeshCache.get(key);
    if(!mesh){mesh=cadExportMesh(oc,shape,quality);const bytes=utf8.encode(key).length+[mesh.vertices,mesh.triangles,mesh.faceGroups].reduce((sum,values)=>sum+values.length*8,0);exportMeshCache.set(key,mesh,Math.max(1,bytes));}
    return structuredClone(mesh);
  }
  function exportMeshes(project,quality={deflection:.01,angleDegrees:5},{ids}={}){
    const outputs=[];
    for(const node of productionNodes(project,{ids})){const parts=cadColorPartsNative(oc,node,{regionCache:colorRegionCache});try{for(const part of parts)outputs.push({id:node.id,name:part.name,color:part.color,opacity:part.opacity,mesh:exportMesh(part.shape,quality)});}finally{parts.forEach(part=>part.shape.delete());}}
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
      const colored=n.kind==='mesh'&&meshColorsEnabled(n)&&meshColorParts?.filter(part=>part.rootId===n.id);if(colored?.length){for(const part of colored)parts.push({name:part.name,color:part.color,opacity:part.opacity,mesh:{vertices:part.mesh.verts,triangles:part.mesh.triangles}});continue;}
      const vertices=[];for(let i=0;i<n.mesh.verts.length;i+=3)vertices.push(...cadPoint(n.transform,n.mesh.verts.slice(i,i+3)));
      const triangles=[...n.mesh.triangles],m=n.transform,det=m[0]*(m[5]*m[10]-m[9]*m[6])-m[4]*(m[1]*m[10]-m[9]*m[2])+m[8]*(m[1]*m[6]-m[5]*m[2]);
      if(det<0)for(let i=0;i<triangles.length;i+=3)[triangles[i+1],triangles[i+2]]=[triangles[i+2],triangles[i+1]];
      parts.push({name:n.name,color:n.color??'#8294aa',opacity:n.opacity??1,mesh:{vertices,triangles}});
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
  return {nativeNode,stepNode,stlHousingNode,rebuild,display,inspect,worldShape,productionNodes,exportMeshes,exportStep,exportModel,cacheState:()=>cache.state(),displayCacheState:()=>displayCache.state(),inspectionCacheState:()=>inspectionCache.state(),colorRegionCacheState:()=>colorRegionCache.state(),exportMeshCacheState:()=>exportMeshCache.state(),dispose:()=>{disposed=true;annotationValidator.dispose();cache.clear();displayCache.clear();inspectionCache.clear();colorRegionCache.clear();exportMeshCache.clear();}};
}
