import {projectObjectGeometryDigest} from './project-objects.js';
// Isolated format-5 tool core. The v4 editor does not import this module.
// Queries read CAD BReps; every model change is a transaction preview and
// becomes confirmed only through the caller's explicit transactions.apply().
import {Matrix4,Quaternion,Vector3} from 'three';
import {cadProjectSnapshot,cadProjectRevision,validateAffineMatrix} from './cad-project.js';
import {cadIdentity,cadPoint,cadFrameSources,dissolveCadGroup,multiplyCadMatrices,inverseCadMatrix} from './cad-affine.js';
import {cadBounds,cadRayHits,readCadBrep} from './cad-native-kernel.js';
import {cadPlacementOnPlane} from './cad-face-placement.js';
import {cadReferencePointsNative,resolveCadReferenceNative,cadReferenceFrame} from './cad-reference-points.js';
import {cadPartitionDirection} from './cad-partition-data.js';
import {cloneCadSources} from './cad-source-clone.js';
import {reparentCadProjectParameterReferences} from './cad-project-parameters-references.js';
import {reparentCadContourLinks} from './cad-linked-contours-data.js';
import {rebindCadWorkplaneNative} from './cad-topology-native.js';
import {cadPartitionLocalPlane} from './cad-partition-frame.js';
import {cadIndependentSolids} from './cad-extraction-native.js';
import {cadGeometryDigest,cadSourceGeometryDigest} from './cad-geometry-digest.js';
import {writeCadBrep,transformCad} from './cad-native-kernel.js';

const HIT_TOLERANCE=1e-7;
const fail=(code,message)=>{const error=Error(message);error.code=code;throw error;};
function vector(value,name){if(!Array.isArray(value)||value.length!==3||value.some(v=>!Number.isFinite(v)))fail('INVALID_CAD_POINT',`${name}: endlicher CAD-Punkt erforderlich.`);return [...value];}
function unit(value,name){const result=vector(value,name),largest=Math.max(...result.map(Math.abs));if(!largest)fail('INVALID_CAD_DIRECTION',`${name}: Richtung fehlt.`);const scaled=result.map(v=>v/largest),length=Math.hypot(...scaled);return scaled.map(v=>v/length);}
function direction(matrix,value){validateAffineMatrix(matrix);const p=vector(value,'Richtung');return [0,1,2].map(row=>matrix[row]*p[0]+matrix[4+row]*p[1]+matrix[8+row]*p[2]);}
function normal(matrix,value){const inverse=inverseCadMatrix(matrix),n=vector(value,'Normale');return unit([0,1,2].map(row=>inverse[row*4]*n[0]+inverse[row*4+1]*n[1]+inverse[row*4+2]*n[2]),'CAD-Normale');}
const translation=delta=>new Matrix4().makeTranslation(...vector(delta,'Verschiebung')).toArray();
function tangentFor(normalValue){const n=new Vector3(...unit(normalValue,'CAD-Normale')),axis=Math.abs(n.x)<.8?new Vector3(1,0,0):new Vector3(0,1,0);return axis.addScaledVector(n,-axis.dot(n)).normalize().toArray();}
function frameOrientation(n,tangent=tangentFor(n)){const z=new Vector3(...unit(n,'CAD-Normale')),x=new Vector3(...unit(tangent,'CAD-Tangente'));x.addScaledVector(z,-x.dot(z));if(x.lengthSq()<1e-20)fail('AMBIGUOUS_CAD_FRAME','CAD-Tangente ist nicht eindeutig.');x.normalize();const y=new Vector3().crossVectors(z,x);return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x,y,z)).normalize().toArray();}

/** Distances between explicit CAD/ruler coordinates, without display rounding. */
export function measureCadPoints(from,to){const a=vector(from,'Startpunkt'),b=vector(to,'Endpunkt'),delta=b.map((v,k)=>v-a[k]),distance=Math.hypot(...delta);if(delta.some(v=>!Number.isFinite(v))||!Number.isFinite(distance))fail('INVALID_CAD_DISTANCE','CAD-Abstand außerhalb des Zahlenbereichs.');return {from:a,to:b,delta,distance};}

/** Geometric anchor only. faceIndex is deliberately not persisted as identity. */
export function cadWorkplaneFromHit(hit,{transform=cadIdentity()}={}){
  if(!hit||typeof hit.objectId!=='string'||!hit.objectId)fail('INVALID_CAD_HIT','CAD-Flächentreffer fehlt.');
  const point=vector(hit.point,'CAD-Treffer'),n=unit(hit.normal,'CAD-Flächennormale'),tangent=tangentFor(n),inverse=inverseCadMatrix(transform);
  return {origin:point,orientation:frameOrientation(n,tangent),reference:{objectId:hit.objectId,topology:{kind:'face',origin:{rootId:hit.objectId,path:[]},anchor:{point:cadPoint(inverse,point),normal:normal(inverse,n),tangent:unit(direction(inverse,tangent),'Lokale CAD-Tangente')}}}};
}

/** Requires a real native CAD service and a confirmed transaction store.
 * Native ray placement fails when the IntCurvesFace capability is unavailable.
 * The service rebuild resolves saved face anchors natively or detaches them. */
export function createCadToolsNative({oc,service,transactions}={}){
  if(!oc||typeof service?.worldShape!=='function'||typeof transactions?.snapshot!=='function'||typeof transactions?.preview!=='function'||typeof transactions?.revision!=='function')throw TypeError('Nativer CAD-Dienst und Transaktionen erforderlich.');
  function project(value){return cadProjectSnapshot(value??transactions.snapshot());}
  function root(p,id){const node=p.nodes.find(n=>n.id===id);if(!node)fail('UNKNOWN_CAD_OBJECT','CAD-Objekt fehlt.');if(node.kind!=='cad')fail('REFERENCE_MESH_NOT_CAD','Netzreferenzen sind keine CAD-Werkzeugziele.');return node;}
  function selected(p,ids){if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)fail('INVALID_CAD_SELECTION','Eindeutige CAD-Auswahl erforderlich.');return ids.map(id=>root(p,id));}
  function containerState(p,node,key){if(node[key]||p.layers.find(layer=>layer.id===node.layerId)?.[key])return true;let id=node.folderId;while(id){const folder=p.folders.find(entry=>entry.id===id);if(folder[key])return true;id=folder.parentId;}return false;}
  function editable(p,node){if(containerState(p,node,'locked'))fail('LOCKED_CAD_OBJECT','CAD-Objekt oder Container ist gesperrt.');}
  function baseline(expected){if(expected!==transactions.revision())fail('STALE_REVISION','Das CAD-Modell wurde geändert.');return project();}
  function frameBounds(p,node,frame){validateAffineMatrix(frame);return service.inspect(node,multiplyCadMatrices(inverseCadMatrix(frame),node.transform)).worldBounds;}
  function bounds({ids,frame=cadIdentity(),project:input}={}){
    const p=project(input),nodes=selected(p,ids),byId=nodes.map(node=>({id:node.id,...frameBounds(p,node,frame)}));
    const min=[0,1,2].map(k=>Math.min(...byId.map(b=>b.min[k]))),max=[0,1,2].map(k=>Math.max(...byId.map(b=>b.max[k])));
    return {revision:cadProjectRevision(p),frame:[...frame],min,max,size:min.map((v,k)=>max[k]-v),center:min.map((v,k)=>(v+max[k])/2),byId};
  }
  function minimumDistance({fromId,toId,project:input}={}){
    const p=project(input),left=service.worldShape(root(p,fromId));let right,dist;
    try{right=service.worldShape(root(p,toId));dist=new oc.BRepExtrema_DistShapeShape(left,right);if(!dist.IsDone()||!Number.isFinite(dist.Value())||dist.Value()<0||dist.NbSolution()<1)fail('CAD_DISTANCE_FAILED','Nativer CAD-Abstand konnte nicht berechnet werden.');const a=dist.PointOnShape1(1),b=dist.PointOnShape2(1);try{return {...measureCadPoints([a.X(),a.Y(),a.Z()],[b.X(),b.Y(),b.Z()]),distance:dist.Value(),revision:cadProjectRevision(p),fromId,toId,solutions:dist.NbSolution()};}finally{b.delete();a.delete();}}
    finally{dist?.delete();right?.delete();left.delete();}
  }
  function rayPick({ray,ids,excludeIds=[],includeHoles=false,withGeometryDigest=false,project:input}={}){
    const p=project(input),nodes=ids?selected(p,ids):p.nodes.filter(n=>n.kind==='cad'),hits=[];
    if(!Array.isArray(excludeIds)||typeof includeHoles!=='boolean'||typeof withGeometryDigest!=='boolean')fail('INVALID_CAD_SELECTION','Ungültige CAD-Strahlausschlüsse.');
    for(const node of nodes){if(excludeIds.includes(node.id)||!node.solid&&!includeHoles||containerState(p,node,'hidden'))continue;const shape=service.worldShape(node);try{
      for(const hit of cadRayHits(oc,shape,ray)){
        if(!Number.isFinite(hit.t)||hit.t<0||!Number.isSafeInteger(hit.faceIndex)||hit.faceIndex<1)fail('INVALID_CAD_HIT','Ungültiger nativer CAD-Flächentreffer.');
        hits.push({...hit,point:vector(hit.point,'CAD-Treffer'),normal:unit(hit.normal,'CAD-Normale'),objectId:node.id});
      }
    }finally{shape.delete();}}
    hits.sort((a,b)=>a.t-b.t);if(!hits.length)return null;
    const first=hits[0];if(hits.slice(1).some(hit=>Math.abs(hit.t-first.t)<=HIT_TOLERANCE&&(hit.objectId!==first.objectId||hit.faceIndex!==first.faceIndex)))fail('AMBIGUOUS_CAD_HIT','CAD-Strahl trifft mehrere Flächen; eindeutigen Punkt wählen.');
    return {...first,...(withGeometryDigest?{geometryDigest:projectObjectGeometryDigest(nodes.find(node=>node.id===first.objectId))}:{}),revision:cadProjectRevision(p),ray:structuredClone(ray)};
  }
  function submit(p,revision,label){return transactions.preview({project:cadProjectSnapshot(p),revision,label});}
  function clearReference(p,ids){if(ids.includes(p.workplane.reference?.objectId))p.workplane.reference=null;}
  function remapReference(p,newId,matrix,path){
    const ref=p.workplane.reference,anchor=ref.topology.anchor;
    anchor.point=cadPoint(matrix,anchor.point);
    if(anchor.normal)anchor.normal=normal(matrix,anchor.normal);
    if(anchor.tangent)anchor.tangent=unit(direction(matrix,anchor.tangent),'CAD-Tangente');
    if(anchor.samples)anchor.samples=anchor.samples.map(point=>cadPoint(matrix,point));
    ref.objectId=newId;ref.topology.origin.rootId=newId;ref.topology.origin.path=path;
  }
  function move(p,node,delta){
    editable(p,node);node.transform=multiplyCadMatrices(delta,node.transform);
    if(p.workplane.reference?.objectId!==node.id)return;
    // The reference anchor stays in this body's local CAD coordinates. Only
    // the world plane moves when the root placement changes rigidly.
    p.workplane.origin=cadPoint(delta,p.workplane.origin);
    const q=new Quaternion().setFromRotationMatrix(new Matrix4().fromArray(delta));p.workplane.orientation=q.multiply(new Quaternion(...p.workplane.orientation)).normalize().toArray();
  }
  function previewAlign({ids,targetId,axis,mode='center',targetMode=mode,frame=cadIdentity(),revision}={}){
    const p=baseline(revision),nodes=selected(p,ids),target=root(p,targetId);if(nodes.some(n=>n.id===targetId)||![0,1,2].includes(axis)||!['min','center','max'].includes(mode)||!['min','center','max'].includes(targetMode))fail('INVALID_CAD_ALIGNMENT','Ungültige CAD-Ausrichtung.');
    const targetBounds=frameBounds(p,target,frame),coordinate=targetBounds[targetMode][axis];
    for(const node of nodes){const current=frameBounds(p,node,frame),offset=[0,0,0];offset[axis]=coordinate-current[mode][axis];move(p,node,translation(direction(frame,offset)));}
    return submit(p,revision,'CAD ausrichten');
  }
  function previewAnchor({id,localPoint,targetPoint,revision}={}){
    const p=baseline(revision),node=root(p,id),current=cadPoint(node.transform,vector(localPoint,'CAD-Anker')),target=vector(targetPoint,'CAD-Zielpunkt');move(p,node,translation(target.map((v,k)=>v-current[k])));return submit(p,revision,'CAD-Anker setzen');
  }
  function referencePoints({nodeId,maxPoints=20000}={}){const p=project(),node=root(p,nodeId);if(containerState(p,node,'hidden'))fail('HIDDEN_CAD_REFERENCE','Ein sichtbares CAD-Teil für den Bezug wählen.');if(!Number.isSafeInteger(maxPoints)||maxPoints<1||maxPoints>20000)fail('INVALID_CAD_REFERENCE','Ungültige Bezugspunktgrenze.');return {...cadReferencePointsNative(oc,node,{maxPoints}),revision:cadProjectRevision(p)};}
  function reference(p,id,value){const node=root(p,id);if(containerState(p,node,'hidden'))fail('HIDDEN_CAD_REFERENCE','Ein sichtbares CAD-Teil für den Bezug wählen.');return resolveCadReferenceNative(oc,node,value);}
  function targetReference(p,targetId,value){
    if(value?.workplane!==undefined){if(targetId!==undefined||!Array.isArray(value.workplane)||value.workplane.length!==2||!value.workplane.every(Number.isFinite)||Object.keys(value).length!==1)fail('INVALID_CAD_REFERENCE','Arbeitsebenenpunkt benötigt U/V ohne Zielteil.');const frame=new Matrix4().makeRotationFromQuaternion(new Quaternion(...p.workplane.orientation)).setPosition(...p.workplane.origin).toArray();return {point:cadPoint(frame,[...value.workplane,0]),normal:frame.slice(8,11)};}
    return reference(p,targetId,value);
  }
  function previewReferencePlacement({id,sourceReference,targetId,targetReference:targetValue,offset=[0,0,0],revision}={}){
    const p=baseline(revision),node=root(p,id);editable(p,node);if(id===targetId)fail('INVALID_CAD_REFERENCE','Zielbezug an einem anderen Teil oder auf der Arbeitsebene wählen.');
    const from=reference(p,id,sourceReference),to=targetReference(p,targetId,targetValue),normalValue=to.normal??new Vector3(0,0,1).applyQuaternion(new Quaternion(...p.workplane.orientation)).toArray(),frame=cadReferenceFrame(to.point,normalValue),target=cadPoint(frame,vector(offset,'Bezugsversatz'));
    move(p,node,translation(target.map((v,k)=>v-from.point[k])));return submit(p,revision,'CAD an Bezugspunkt platzieren');
  }
  async function previewDrill({id,reference:referenceValue,kind='plain',through=true,diameter=4,depth=10,headDiameter=8,headDepth=3,angle=90,gap=0,offset=[0,0,0],resultId=globalThis.crypto.randomUUID(),revision}={}){
    const p=baseline(revision),node=root(p,id);editable(p,node);if(!node.solid||!['plain','countersink','counterbore'].includes(kind)||typeof through!=='boolean')fail('INVALID_CAD_DRILL','Ein positives fertiges CAD-Teil und eine passende Bohrung wählen.');
    if(![diameter,depth,headDiameter,headDepth,angle,gap].every(Number.isFinite)||diameter<.1||diameter>1000||depth<.1||depth>10000||gap<0||gap>5||angle<30||angle>150||headDepth<=0||headDepth>10000)fail('INVALID_CAD_DRILL','Ungültige Bohrungsmaße oder Spielwerte.');
    const picked=reference(p,id,referenceValue);if(!picked.normal)fail('INVALID_CAD_DRILL','Eine native Flächennormale für die Bohrrichtung wählen.');
    const entry=cadPoint(cadReferenceFrame(picked.point,picked.normal),vector(offset,'Bohrungsversatz')),frame=cadReferenceFrame(entry,picked.normal),bounds=frameBounds(p,node,frame),margin=Math.max(oc.Precision.Confusion()*16,Math.hypot(...bounds.size)*1e-9),length=through?-bounds.min[2]+margin:depth,bore=diameter+gap*2,head=headDiameter+gap*2;
    if(length<.1||length>10000||bore>1000||kind!=='plain'&&(head<=bore||head>1000))fail('INVALID_CAD_DRILL','Bohrungslänge oder Kopfmaß passt nicht zum gewählten Körper.');
    const tools=[],create=(recipe,name,localDepth)=>{const transform=multiplyCadMatrices(frame,translation([0,0,-localDepth/2])),tool=service.nativeNode(recipe,{id:globalThis.crypto.randomUUID(),name,solid:false,transform,color:'#89929e',layerId:node.layerId,folderId:node.folderId});tools.push(tool);};
    if(kind==='countersink'){
      const sink=(head-bore)/2/Math.tan(angle*Math.PI/360),profileLength=Math.min(length,300);
      if(sink>=profileLength||bore>200||head>300)fail('INVALID_CAD_DRILL','Senkung benötigt mehr Bohrungstiefe oder überschreitet die native Senkvorlage.');
      create({type:'countersink',size:[head,head,profileLength],params:{bore,sinkDiameter:head,angle,length:profileLength}},'Senkbohrung',profileLength);
      if(length>profileLength)create({type:'cylinder',size:[bore,bore,length]},'Durchgangsbohrung',length);
    }else{
      create({type:'cylinder',size:[bore,bore,length]},through?'Durchgangsbohrung':'Sackloch',length);
      if(kind==='counterbore'){if(headDepth>=(through?length-margin:length))fail('INVALID_CAD_DRILL','Schraubenkopfaufnahme muss flacher als die Bohrung sein.');create({type:'cylinder',size:[head,head,headDepth]},'Schraubenkopfaufnahme',headDepth);}
    }
    const before=service.inspect(node).volume,group={id:resultId,kind:'cad',source:'group',name:node.name,solid:true,operation:'union',transform:cadIdentity(),children:[structuredClone(node),...tools],brep:structuredClone(node.brep),stats:structuredClone(node.stats),layerId:node.layerId,folderId:node.folderId};
    for(const key of ['color','opacity','multicolor','metadata'])if(node[key]!==undefined)group[key]=structuredClone(node[key]);
    const index=p.nodes.indexOf(node);p.nodes[index]=group;
    if(p.workplane.reference?.objectId===id)remapReference(p,resultId,node.transform,[node.id,...p.workplane.reference.topology.origin.path]);
    const candidate=await service.rebuild(p,{baseline:transactions.snapshot()}),after=candidate.nodes[index].stats.volume;
    if(before-after<=Math.max(before*1e-12,1e-8))fail('NO_CAD_DRILL_MATERIAL','Die gewählte Bohrung entfernt an dieser Stelle kein Material.');
    return submit(candidate,revision,'Native CAD-Bohrung erstellen');
  }
  function previewWorkplane({ray,ids,includeHoles=false,revision}={}){
    const p=baseline(revision),hit=rayPick({ray,ids,includeHoles,project:p});if(!hit)fail('NO_CAD_HIT','Keine CAD-Fläche für die Arbeitsebene getroffen.');const node=root(p,hit.objectId);p.workplane=cadWorkplaneFromHit(hit,{transform:node.transform});
    if(node.source==='native'&&node.recipe.type==='cylinder'){
      const local=readCadBrep(oc,node.brep.data);try{const b=cadBounds(oc,local),anchor=p.workplane.reference.topology.anchor,n=anchor.normal;let feature;
        if(n[2]>1-1e-8&&Math.abs(anchor.point[2]-b.max[2])<1e-6)feature='cylinder-face-top';
        else if(n[2]<-1+1e-8&&Math.abs(anchor.point[2]-b.min[2])<1e-6)feature='cylinder-face-bottom';
        else if(Math.abs(n[2])<1e-8)feature='cylinder-face-side';
        if(feature)p.workplane.reference.topology.origin.featureId=feature;
      }finally{local.delete();}
    }
    return submit(p,revision,'CAD-Arbeitsebene setzen');
  }
  function previewPlace({id,ray,targetIds,localPoint,alignNormal=true,includeHoles=false,revision}={}){
    const p=baseline(revision),node=root(p,id);editable(p,node);if(typeof alignNormal!=='boolean')fail('INVALID_CAD_PLACEMENT','Ungültige CAD-Normalausrichtung.');
    const hit=rayPick({ray,ids:targetIds,excludeIds:[id],includeHoles,project:p});if(!hit)fail('NO_CAD_HIT','Keine CAD-Fläche zum Platzieren getroffen.');
    let anchor;
    if(localPoint!==undefined)anchor=vector(localPoint,'CAD-Anker');else{const local=readCadBrep(oc,node.brep.data);try{const b=cadBounds(oc,local);anchor=[b.center[0],b.center[1],b.min[2]];}finally{local.delete();}}
    let delta=cadIdentity();if(alignNormal){const q=new Quaternion().setFromUnitVectors(new Vector3(...normal(node.transform,[0,0,1])),new Vector3(...hit.normal));delta=new Matrix4().makeRotationFromQuaternion(q).toArray();}
    const rotated=multiplyCadMatrices(delta,node.transform),position=cadPoint(rotated,anchor);delta=multiplyCadMatrices(translation(hit.point.map((v,k)=>v-position[k])),delta);move(p,node,delta);return submit(p,revision,'CAD auf Fläche platzieren');
  }
  function previewLayOnFace({id,ray,visibleIds,ground=false,revision}={}){
    const p=baseline(revision),node=root(p,id);editable(p,node);if(!node.solid||typeof ground!=='boolean')fail('INVALID_CAD_SUPPORT','Ein fertiges positives CAD-Teil auswählen.');
    const hit=rayPick({ray,ids:visibleIds,project:p});if(!hit||hit.objectId!==id)fail('NO_CAD_SUPPORT_HIT','Eine sichtbare eigene Auflagefläche des ausgewählten Teils anklicken.');
    const workplane=ground?{origin:[0,0,0],orientation:[0,0,0,1]}:p.workplane,result=cadPlacementOnPlane(oc,service,node,hit,workplane);
    // Detach an attached plane at its prior world pose before moving the part.
    if(p.workplane.reference?.objectId===id)p.workplane.reference=null;
    node.transform=result.transform;return submit(p,revision,'CAD auf eigene Fläche legen');
  }
  async function previewSplit({id,mode='z',normal:customNormal=[0,0,1],distance=0,positiveId=globalThis.crypto.randomUUID(),negativeId=globalThis.crypto.randomUUID(),revision}={}){
    const p=baseline(revision),node=root(p,id);editable(p,node);if(containerState(p,node,'hidden'))fail('HIDDEN_CAD_OBJECT','Ein sichtbares CAD-Teil für die Teilung auswählen.');
    if(!['x','y','z','workplane','custom'].includes(mode)||!Number.isFinite(distance)||Math.abs(distance)>100000)fail('INVALID_CAD_PARTITION','Ungültige Teilungsebene oder Abstand.');
    if(positiveId===negativeId||[positiveId,negativeId].some(value=>typeof value!=='string'||!value.trim()||p.nodes.some(n=>n.id===value)))fail('INVALID_CAD_PARTITION','Eindeutige neue Teilkennungen erforderlich.');
    const n=cadPartitionDirection(mode==='workplane'?new Vector3(0,0,1).applyQuaternion(new Quaternion(...p.workplane.orientation)).toArray():mode==='custom'?customNormal:[mode==='x'?1:0,mode==='y'?1:0,mode==='z'?1:0]),base=mode==='workplane'?p.workplane.origin:[0,0,0],origin=base.map((v,k)=>v+n[k]*distance),mappings=[];
    const localPlane=cadPartitionLocalPlane(origin,n,node.transform),parts=['positive','negative'].map((side,index)=>{
      const mapping=new Map(),child=cloneCadSources(node,{mapping});mappings.push(mapping);
      child.transform=cadIdentity();
      const part={id:index===0?positiveId:negativeId,kind:'cad',source:'partition',name:node.name.slice(0,196)+(side==='positive'?' · +':' · −'),solid:node.solid,transform:[...node.transform],children:[child],partition:{version:1,...structuredClone(localPlane),side},brep:structuredClone(node.brep),stats:structuredClone(node.stats)};
      for(const key of ['color','opacity','multicolor','hidden','locked','layerId','folderId','metadata'])if(node[key]!==undefined)part[key]=structuredClone(node[key]);return part;
    });
    const attached=p.workplane.reference?.objectId===id,reference=attached?structuredClone(p.workplane.reference):null,index=p.nodes.indexOf(node);p.nodes.splice(index,1,...parts);if(attached)p.workplane.reference=null;
    let rebuilt=await service.rebuild(p);
    // Preserve a former face attachment only if exactly one resulting body
    // owns it natively. A point on the cut seam stays at its old world pose.
    if(reference){const candidates=[];for(let k=0;k<2;k++){
      const candidate=structuredClone(rebuilt);candidate.workplane.reference=structuredClone(reference);const ref=candidate.workplane.reference,mapping=mappings[k];ref.objectId=parts[k].id;ref.topology.origin.rootId=parts[k].id;ref.topology.origin.path=[parts[k].children[0].id,...ref.topology.origin.path.map(value=>mapping.get(value)??value)];
      const bound=rebindCadWorkplaneNative(oc,candidate);if(bound.workplane.reference)candidates.push(bound.workplane);
    }if(candidates.length===1)rebuilt.workplane=candidates[0];}
    return submit(rebuilt,revision,'CAD-Körper mit Ebene teilen');
  }
  async function previewExtract({id,revision}={}){
    const p=baseline(revision),node=root(p,id);editable(p,node);if(containerState(p,node,'hidden'))fail('HIDDEN_CAD_OBJECT','Ein sichtbares CAD-Teil zum Herauslösen auswählen.');
    const raw=readCadBrep(oc,node.brep.data);let input,items,bodySignature;
    try{input=transformCad(oc,raw,cadIdentity());items=cadIndependentSolids(oc,input,{world:node.transform});bodySignature=cadGeometryDigest(writeCadBrep(oc,input));}finally{input?.delete();raw.delete();}
    const maps=[],parts=items.map((item,index)=>{const mapping=new Map(),child=cloneCadSources(node,{mapping});maps.push(mapping);child.transform=cadIdentity();const part={id:globalThis.crypto.randomUUID(),kind:'cad',source:'extraction',name:node.name.slice(0,190)+' · '+(index+1),solid:node.solid,transform:[...node.transform],children:[child],extraction:{version:1,sourceSignature:cadSourceGeometryDigest(child),bodySignature,solidSignature:item.signature,constructionFrame:[...node.transform]},brep:{format:'OpenCascade-BRep',data:item.brep,triangulation:false},stats:{bounds:{min:item.bounds.min,max:item.bounds.max},volume:item.volume,solids:1}};for(const key of ['color','opacity','multicolor','hidden','locked','layerId','folderId','metadata'])if(node[key]!==undefined)part[key]=structuredClone(node[key]);return part;});
    const reference=p.workplane.reference?.objectId===id?structuredClone(p.workplane.reference):null,index=p.nodes.indexOf(node);p.nodes.splice(index,1,...parts);if(reference)p.workplane.reference=null;let rebuilt=await service.rebuild(p);
    if(reference){const candidates=[];for(let k=0;k<parts.length;k++){const candidate=structuredClone(rebuilt),ref=structuredClone(reference);ref.objectId=parts[k].id;ref.topology.origin.rootId=parts[k].id;ref.topology.origin.path=[parts[k].children[0].id,...ref.topology.origin.path.map(value=>maps[k].get(value)??value)];candidate.workplane.reference=ref;const bound=rebindCadWorkplaneNative(oc,candidate);if(bound.workplane.reference)candidates.push(bound.workplane);}if(candidates.length===1)rebuilt.workplane=candidates[0];}
    return submit(rebuilt,revision,'Unabhängige CAD-Körper herauslösen');
  }
  function previewGroup({ids,id=globalThis.crypto.randomUUID(),name='CAD-Gruppe',operation='union',frame=cadIdentity(),revision}={}){
    const p=baseline(revision),contourBefore=p.contourLinks?cadProjectSnapshot(p):undefined,nodes=selected(p,ids);if(nodes.length<2||!['union','intersection'].includes(operation))fail('INVALID_CAD_GROUP','Mindestens zwei CAD-Quellen und eine boolesche Operation erforderlich.');for(const node of nodes)editable(p,node);
    const holeGroup=nodes.every(node=>!node.solid),positive=nodes.filter(node=>!node.suppressed&&(holeGroup||node.solid));if(!positive.length||operation==='intersection'&&positive.length<2)fail('INVALID_CAD_GROUP','Die CAD-Gruppe braucht aktive Körperquellen oder mindestens zwei Lochformen.');
    const first=positive[0],group={id,kind:'cad',name,source:'group',solid:!holeGroup,transform:validateAffineMatrix(frame),operation,children:cadFrameSources(nodes,frame),brep:structuredClone(first.brep),stats:structuredClone(first.stats),layerId:first.layerId,folderId:first.folderId};
    for(const key of ['color','opacity','multicolor'])if(first[key]!==undefined)group[key]=first[key];
    const reference=p.workplane.reference;
    if(ids.includes(reference?.objectId)){const child=group.children.find(node=>node.id===reference.objectId);remapReference(p,id,child.transform,[child.id,...reference.topology.origin.path]);}
    const index=Math.min(...nodes.map(node=>p.nodes.indexOf(node)));p.nodes=p.nodes.filter(node=>!ids.includes(node.id));p.nodes.splice(index,0,group);if(p.projectParameters)p.projectParameters=reparentCadProjectParameterReferences(p,nodes.map(node=>({from:{rootId:node.id,path:[]},to:{rootId:id,path:[node.id]}})));if(contourBefore)p.contourLinks=reparentCadContourLinks(p,nodes.map(node=>({from:{rootId:node.id,path:[]},to:{rootId:id,path:[node.id]}})),{previousProject:contourBefore});return submit(p,revision,'CAD-Gruppe erstellen');
  }
  function source(p,groupId,path){
    const group=root(p,groupId);editable(p,group);if(!['group','finish','partition'].includes(group.source)||!Array.isArray(path)||!path.length)fail('INVALID_CAD_SOURCE_PATH','Editierbarer CAD-Quellenpfad erforderlich.');let node=group;
    for(const id of path){node=node.children?.find(child=>child.id===id);if(!node)fail('INVALID_CAD_SOURCE_PATH','CAD-Quelle fehlt im angegebenen Pfad.');if(node.locked)fail('LOCKED_CAD_OBJECT','CAD-Quelle ist gesperrt.');}
    return {group,node};
  }
  function previewEditSource({groupId,path,patch,revision}={}){
    const p=baseline(revision),{node}=source(p,groupId,path);
    if(!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length||Object.keys(patch).some(key=>!['recipe','transform','solid','name'].includes(key)))fail('INVALID_CAD_SOURCE_EDIT','Ungültige CAD-Quellenänderung.');
    if(Object.hasOwn(patch,'recipe')&&node.source!=='native')fail('INVALID_CAD_SOURCE_EDIT','Nur native CAD-Quellen besitzen ein editierbares Formenrezept.');if(Object.hasOwn(patch,'transform'))validateAffineMatrix(patch.transform);
    Object.assign(node,structuredClone(patch));return submit(p,revision,'CAD-Quelle bearbeiten');
  }
  function previewSuppressSource({groupId,path,suppressed,revision}={}){
    const p=baseline(revision),{node}=source(p,groupId,path);if(typeof suppressed!=='boolean')fail('INVALID_CAD_SOURCE_EDIT','CAD-Quellenunterdrückung muss boolesch sein.');node.suppressed=suppressed;return submit(p,revision,'CAD-Quelle unterdrücken');
  }
  function previewDissolve({id,revision}={}){
    const p=baseline(revision),contourBefore=p.contourLinks?cadProjectSnapshot(p):undefined,group=root(p,id);editable(p,group);const children=dissolveCadGroup(group),index=p.nodes.indexOf(group),reference=p.workplane.reference;
    if(reference?.objectId===id){const path=reference.topology.origin.path,source=group.children.find(child=>child.id===path[0]);if(source)remapReference(p,source.id,inverseCadMatrix(source.transform),path.slice(1));else clearReference(p,[id]);}
    p.nodes.splice(index,1,...children);if(p.projectParameters)p.projectParameters=reparentCadProjectParameterReferences(p,children.map(child=>({from:{rootId:id,path:[child.id]},to:{rootId:child.id,path:[]}})));if(contourBefore)p.contourLinks=reparentCadContourLinks(p,children.map(child=>({from:{rootId:id,path:[child.id]},to:{rootId:child.id,path:[]}})),{previousProject:contourBefore});return submit(p,revision,'CAD-Gruppe auflösen');
  }
  return {bounds,minimumDistance,rayPick,referencePoints,previewReferencePlacement,previewDrill,previewAlign,previewAnchor,previewWorkplane,previewPlace,previewLayOnFace,previewSplit,previewExtract,previewGroup,previewEditSource,previewSuppressSource,previewDissolve};
}
