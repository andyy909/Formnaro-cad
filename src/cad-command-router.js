import {rejectStaleCadReferences} from './cad-ai-reference-guard.js';
import {hasGeometryRefs,isGeometryRef} from './cad-geometry-ref.js';
import {validateCadLinkedPattern,materializeCadLinkedPattern,stampCadLinkedPattern,cadLinkedPatternProblems,assertCadLinkedPatternCopyReady} from './cad-linked-pattern-data.js';
import {remapCadJoints,validateCadJoints} from './cad-joints-data.js';
import {prepareConstrainedSketch} from './sketch-constraints-solver.js';
import {prepareSketchAttachment,checkSketchAttachment,attachmentNativeCommands} from './sketch-attachment.js';
import {meshToCadNative} from './cad-mesh-to-cad-native.js';
import {parametricSceneMetadata} from './cad-parametric-data.js';
import {cadMeshCopyNative} from './cad-mesh-copy-native.js';
import {cadAxisMeasures} from './cad-axis-measures.js';
import {projectObjectType,projectObjectCapabilities,projectObjectGeometryDigest} from './project-objects.js';
import {meshSourceTree} from './cad-mesh-source-tree.js';
import {aiFeedback} from './ai-feedback.js';
import {cadSelectionContext,cadInterfaceLocalBounds,cadResizeForm} from './cad-interface-state.js';
import {resolveCadAnnotationNative} from './cad-annotations-native.js';
import {validateCadAnnotations,cadAnnotationWorld} from './cad-annotations-data.js';
import {readCadBrep,cadRayHits} from './cad-native-kernel.js';
import {cadPartitionWorldPlane} from './cad-partition-frame.js';
import {cloneCadSources} from './cad-source-clone.js';
import {copyCadProjectParameterReferences,reparentCadProjectParameterReferences} from './cad-project-parameters-references.js';
import {Euler,Matrix4,Quaternion,Vector3} from 'three';
import {cadProjectSnapshot,cadProjectRevision,validateAffineMatrix} from './cad-project.js';
import {cadIdentity,cadPoint,multiplyCadMatrices,inverseCadMatrix,cadFrameSources,dissolveCadGroup,resizeCadAtCorner} from './cad-affine.js';
import {createCadTransactions} from './cad-transactions.js';
import {createCadToolsNative} from './cad-tools-native.js';
import {buildCadPluginShape} from './cad-plugin-recipes.js';
import {cadPreserveFormBounds,cadFitFormDimensions,CAD_SHAPES} from './cad-form-controls.js';
import {cadContoursFromSvgSubpaths} from './cad-original-contours.js';
import {buildCadTemplate} from './cad-template-recipes.js';
import {readStlReconstructionMesh} from './cad-stl-input.js';
import {cadSketchRecipe} from './cad-sketch.js';
import {validateCadModelingOperation} from './cad-modeling-data.js';
import {cadSourceGeometryDigest} from './cad-geometry-digest.js';
import {assertCadContourTargetChanges,copyCadContourLinks,reparentCadContourLinks} from './cad-linked-contours-data.js';

const fail=(code,message,feedback)=>{const error=Error(message);error.code=code;if(feedback)error.feedback=feedback;throw error;};
const translate=value=>new Matrix4().makeTranslation(...vector(value)).toArray();
function vector(value,length=3){if(!Array.isArray(value)||value.length!==length||value.some(v=>!Number.isFinite(v)))fail('INVALID_COMMAND','Endliche Koordinaten erforderlich.');return [...value];}
function fields(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail('INVALID_COMMAND','Unbekannte oder ungültige Befehlsfelder.');}
function rotation(degrees){const [x,y,z]=vector(degrees).map(v=>v*Math.PI/180);return new Matrix4().makeRotationFromEuler(new Euler(x,y,z,'ZYX')).toArray();}
function workplaneMatrix(project){return new Matrix4().makeRotationFromQuaternion(new Quaternion(...project.workplane.orientation)).setPosition(...project.workplane.origin).toArray();}
function axesOrientation(matrix){
  const x=new Vector3(matrix[0],matrix[1],matrix[2]).normalize(),y=new Vector3(matrix[4],matrix[5],matrix[6]);y.addScaledVector(x,-x.dot(y)).normalize();const z=new Vector3().crossVectors(x,y).normalize();
  if(!Number.isFinite(x.x)||y.lengthSq()<.99)fail('INVALID_COMMAND','Die affine Orientierung ist nicht eindeutig.');return new Matrix4().makeBasis(x,y,z);
}
function absoluteOrientation(node,degrees){
  const bounds=cadInterfaceLocalBounds(node),basis=axesOrientation(node.transform),desired=new Matrix4().fromArray(rotation(degrees)),delta=desired.multiply(basis.transpose()),center=bounds.min.map((v,k)=>(v+bounds.max[k])/2),point=cadPoint(node.transform,center);
  node.transform=multiplyCadMatrices(multiplyCadMatrices(multiplyCadMatrices(translate(point),delta.toArray()),translate(point.map(v=>-v))),node.transform);
}
function absoluteMirror(node,signs){
  signs=vector(signs);if(signs.some(v=>v!==1&&v!==-1))fail('INVALID_COMMAND','Spiegelachsen müssen +1 oder −1 sein.');const bounds=cadInterfaceLocalBounds(node),matrix=new Matrix4().fromArray(node.transform),current=[1,1,matrix.determinant()<0?-1:1],center=bounds.min.map((v,k)=>(v+bounds.max[k])/2),factors=signs.map((v,k)=>v/current[k]);
  node.transform=multiplyCadMatrices(node.transform,multiplyCadMatrices(multiplyCadMatrices(translate(center),new Matrix4().makeScale(...factors).toArray()),translate(center.map(v=>-v))));
}
export {cloneCadSources} from './cad-source-clone.js';

/** All renderer and automation commands reach this native worker boundary.
 * Native intermediate builds supply exact bounds and topology correspondence;
 * the complete batch remains one unconfirmed candidate and one Undo entry. */
export function createCadCommandRouter({oc,service,makeRecipe,editRecipe}={}){
  if(!oc||!service)throw TypeError('Nativer CAD-Dienst fehlt.');
  function catalogueBounds(local,matrix){const points=Array.from({length:8},(_,i)=>cadPoint(matrix,[0,1,2].map(k=>i&(1<<k)?local.max[k]:local.min[k]))),min=[0,1,2].map(k=>Math.min(...points.map(p=>p[k]))),max=[0,1,2].map(k=>Math.max(...points.map(p=>p[k])));return {min,max,size:min.map((v,k)=>max[k]-v),center:min.map((v,k)=>(v+max[k])/2),basis:'package-catalog-bounds',nativeProven:false};}
  function shapeBounds(node,matrix){
    if(hasGeometryRefs(node))return catalogueBounds(node.kind==='cad'?node.stats.bounds:node.mesh.bounds,matrix);
    if(node.kind!=='cad'){
      const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<node.mesh.verts.length;i+=3){const point=cadPoint(matrix,node.mesh.verts.slice(i,i+3));for(let k=0;k<3;k++){min[k]=Math.min(min[k],point[k]);max[k]=Math.max(max[k],point[k]);}}
      return {min,max,size:min.map((v,k)=>max[k]-v),center:min.map((v,k)=>(v+max[k])/2),basis:'original-mesh-vertices'};
    }
    return service.inspect(node,matrix).worldBounds;
  }
  function containerFlags(project,node){
    let locked=!!node.locked,hidden=!!node.hidden;const layer=project.layers.find(v=>v.id===node.layerId);locked||=!!layer?.locked;hidden||=!!layer?.hidden;
    let folder=project.folders.find(v=>v.id===node.folderId);while(folder){locked||=folder.locked;hidden||=folder.hidden;folder=project.folders.find(v=>v.id===folder.parentId);}return {locked,hidden};
  }
  function address(project,target,aliases){
    if(typeof target==='string'&&target.startsWith('$'))target=aliases[target.slice(1)];
    if(typeof target==='string')target={rootId:target,path:[]};fields(target,['rootId','path']);
    if(typeof target.rootId!=='string'||!Array.isArray(target.path)||target.path.length>12)fail('UNKNOWN_CAD_OBJECT','Eindeutige Objektkennung und Quellenpfad erforderlich.');
    const root=project.nodes.find(node=>node.id===target.rootId);if(!root)fail('UNKNOWN_CAD_OBJECT','CAD-Objekt fehlt.',{target:{rootId:target.rootId,path:target.path}});
    let node=root,siblings=project.nodes,parent=null,parentWorld=cadIdentity(),locked=containerFlags(project,root).locked,modelingReadonly=false;
    for(const id of target.path){modelingReadonly ||= !!node.modeling?.sourceSignature;parentWorld=multiplyCadMatrices(parentWorld,node.transform);parent=node;siblings=node.children;node=siblings?.find(child=>child.id===id);if(!node)fail('UNKNOWN_CAD_SOURCE','CAD-Quelle fehlt.',{target:{rootId:target.rootId,path:target.path}});locked||=!!node.locked;}
    return {root,node,siblings,parent,parentWorld,world:multiplyCadMatrices(parentWorld,node.transform),locked,modelingReadonly,target:{rootId:root.id,path:[...target.path]}};
  }
  function editable(context){if(context.locked)fail('LOCKED_CAD_OBJECT','Objekt, Quelle oder Container ist gesperrt.',{target:context.target,retryable:false});if(context.modelingReadonly)fail('CAD_MODELING_REFERENCE_CHANGED','Die erhaltene Flächenquelle ist geschützt. Für eine andere Ausgangsgeometrie die Bearbeitungsfläche erneut wählen.');}
  function frameFor(project,context,space='local'){if(!['local','world','plane'].includes(space))fail('INVALID_COMMAND','Unbekanntes Koordinatensystem.');return space==='local'?context.parentWorld:space==='plane'?workplaneMatrix(project):cadIdentity();}
  function shift(context,delta,frame){
    editable(context);const worldDelta=multiplyCadMatrices(multiplyCadMatrices(frame,delta),inverseCadMatrix(frame));
    context.node.transform=multiplyCadMatrices(multiplyCadMatrices(inverseCadMatrix(context.parentWorld),worldDelta),context.world);
  }
  function setCenter(node,point){
    const local=cadInterfaceLocalBounds(node);
    const center=local.min.map((v,k)=>(v+local.max[k])/2),current=cadPoint(node.transform,center);
    node.transform=multiplyCadMatrices(translate(point.map((v,k)=>v-current[k])),node.transform);
  }
  function alias(command,value,aliases){if(command.as!==undefined){if(typeof command.as!=='string'||! /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(command.as)||Object.hasOwn(aliases,command.as))fail('INVALID_ALIAS','Eindeutiger Befehlsalias erforderlich.');aliases[command.as]=value;}}
  function unlinkPlane(project,context){const reference=project.workplane.reference;if(reference?.objectId===context.root.id&&(reference.kind==='mesh'||context.target.path.every((id,index)=>reference.topology.origin.path[index]===id)))project.workplane.reference=null;}
  function groupPlaneReference(project,contexts,group){
    const reference=project.workplane.reference;if(!reference||reference.kind==='mesh')return;const first=contexts[0],origin=reference.topology.origin;
    if(!first.parent){const source=group.children.find(child=>child.id===reference.objectId);if(!source)return;const matrix=source.transform,inverse=inverseCadMatrix(matrix),anchor=reference.topology.anchor,unit=value=>{const scale=Math.max(...value.map(Math.abs));if(!scale||!Number.isFinite(scale))fail('INVALID_CAD_ANCHOR','CAD-Flächenrichtung ist nicht endlich.');const scaled=value.map(v=>v/scale),length=Math.hypot(...scaled);return scaled.map(v=>v/length);};
      anchor.point=cadPoint(matrix,anchor.point);if(anchor.samples)anchor.samples=anchor.samples.map(point=>cadPoint(matrix,point));if(anchor.normal)anchor.normal=unit([0,1,2].map(row=>inverse[row*4]*anchor.normal[0]+inverse[row*4+1]*anchor.normal[1]+inverse[row*4+2]*anchor.normal[2]));if(anchor.tangent)anchor.tangent=unit([0,1,2].map(row=>matrix[row]*anchor.tangent[0]+matrix[4+row]*anchor.tangent[1]+matrix[8+row]*anchor.tangent[2]));reference.objectId=group.id;origin.rootId=group.id;origin.path=[source.id,...origin.path];return;
    }
    if(reference.objectId!==first.root.id)return;const parentPath=first.target.path.slice(0,-1),selectedIds=new Set(contexts.map(context=>context.node.id));
    // Nested grouping inserts an identity frame under the existing root. Its
    // root-local geometric anchor and unrelated source branches stay intact.
    if(parentPath.every((id,index)=>origin.path[index]===id)&&selectedIds.has(origin.path[parentPath.length]))origin.path=[...parentPath,group.id,...origin.path.slice(parentPath.length)];
  }
  function groupAliasAddresses(aliases,contexts,group){
    const first=contexts[0],parentPath=first.target.path.slice(0,-1);
    function remap(value){if(Array.isArray(value))return value.map(remap);const target=typeof value==='string'?{rootId:value,path:[]}:value;if(!target||typeof target.rootId!=='string'||!Array.isArray(target.path))return value;
      const source=contexts.find(context=>target.rootId===context.root.id&&context.target.path.every((id,index)=>target.path[index]===id));if(!source)return value;
      return !first.parent?{rootId:group.id,path:[source.node.id,...target.path]}:{rootId:target.rootId,path:[...parentPath,group.id,...target.path.slice(parentPath.length)]};
    }
    for(const key of Object.keys(aliases))aliases[key]=remap(aliases[key]);
  }
  function assign(project,node,layer=project.activeLayerId,folder=project.activeFolderId){
    const chosen=project.layers.find(v=>v.id===layer),container=folder===null?null:project.folders.find(v=>v.id===folder);
    if(!chosen||chosen.locked||folder!==null&&(!container||container.layerId!==layer||container.locked))fail('INVALID_CONTAINER','Entsperrter Layer und gültiger Ordner erforderlich.');node.layerId=layer;node.folderId=folder;
  }
  async function batch(input,operation,baseline,progress){
    fields(operation,['kind','commands','initialAliases']);if(!Array.isArray(operation.commands)||!operation.commands.length||operation.commands.length>200)fail('INVALID_COMMAND','1–200 CAD-Befehle erforderlich.');
    // The controller supplies aliases only between native segments of one
    // mixed transaction. This field is absent from every public request schema.
    const seeds=operation.initialAliases??{};if(!seeds||Object.getPrototypeOf(seeds)!==Object.prototype||Object.keys(seeds).length>400)fail('INVALID_ALIAS','Ungültige interne Befehlsaliase.');
    const validAliasValue=(value,depth=0)=>depth<3&&(typeof value==='string'&&value.length>0&&value.length<=200||Array.isArray(value)&&value.length<=500&&value.every(v=>validAliasValue(v,depth+1))||value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).every(k=>['rootId','path'].includes(k))&&typeof value.rootId==='string'&&Array.isArray(value.path)&&value.path.length<=12&&value.path.every(v=>typeof v==='string'));
    for(const [key,value]of Object.entries(seeds))if(!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(key)||!validAliasValue(value))fail('INVALID_ALIAS','Ungültige interne Befehlsaliase.');
    let project=cadProjectSnapshot(input),rebuildBaseline=cadProjectSnapshot(baseline??input);const aliases=structuredClone(seeds);let dirtyGeometry=false;const jointOriginal=input.joints?structuredClone(input.joints):undefined,jointCopies=new Map();
    async function verified(){if(dirtyGeometry){try{project=await service.rebuild(project,{baseline:rebuildBaseline});}catch(error){error.code??='CAD_ERROR';error.cadBatchFailure=true;error.feedback=aiFeedback(error);throw error;}rebuildBaseline=cadProjectSnapshot(project);dirtyGeometry=false;}return project;}
    for(let index=0;index<operation.commands.length;index++){
      const command=operation.commands[index];try{rejectStaleCadReferences(command,index>0);if(!command||typeof command.op!=='string')fail('INVALID_COMMAND','Befehlsname fehlt.');
      switch(command.op){
        case 'modeling':{
          fields(command,['op','target','operation','as']);await verified();const context=address(project,command.target,aliases);editable(context);
          if(context.parent||context.node.kind!=='cad'||!context.node.solid||containerFlags(project,context.node).hidden)fail('INVALID_COMMAND','Ein sichtbares fertiges CAD-Materialteil auswählen.');
          const operation=validateCadModelingOperation(command.operation);if(!['face-offset','shell'].includes(operation.kind))fail('INVALID_COMMAND','Flächenversatz oder CAD-Aushöhlen wählen.');
          const original=context.node,child=cloneCadSources(original),wrapper=structuredClone(original);wrapper.source='modeling';wrapper.transform=cadIdentity();wrapper.children=[child];
          if(wrapper.annotations)wrapper.annotations=wrapper.annotations.map(annotation=>{const placed=cadAnnotationWorld({...annotation,status:'valid'},original.transform);return {...annotation,point:placed.point,normal:placed.normal};});
          for(const key of ['recipe','operation','finish','partition','extraction','modeling','multicolor'])delete wrapper[key];
          wrapper.modeling={version:1,...operation,sourceSignature:cadSourceGeometryDigest(child)};
          if(wrapper.metadata){delete wrapper.metadata.stepFaceColors;delete wrapper.metadata.parametricSource;}
          context.siblings[context.siblings.indexOf(original)]=wrapper;if(project.workplane.reference?.objectId===original.id)project.workplane.reference=null;
          alias(command,wrapper.id,aliases);dirtyGeometry=true;break;
        }
        case 'editModeling':{
          fields(command,['op','target','operation','as']);await verified();const context=address(project,command.target,aliases);editable(context);
          if(context.parent||context.node.source!=='modeling'||containerFlags(project,context.node).hidden)fail('INVALID_COMMAND','Eine sichtbare gespeicherte CAD-Bearbeitung auswählen.');
          const operation=validateCadModelingOperation(command.operation),node=context.node;if(operation.kind!==node.modeling.kind)fail('INVALID_COMMAND','Zum Ändern dasselbe CAD-Werkzeug verwenden.');
          node.modeling={version:1,...operation,...(node.modeling.sourceSignature?{sourceSignature:node.modeling.sourceSignature}:{})};alias(command,node.id,aliases);dirtyGeometry=true;break;
        }
        case 'profileModeling':{
          fields(command,['op','targets','kind','path','orientation','profileOrder','as']);await verified();const operation=validateCadModelingOperation({kind:command.kind,...Object.fromEntries(['path','orientation','profileOrder'].filter(key=>command[key]!==undefined).map(key=>[key,command[key]]))});
          if(!['loft','sweep'].includes(operation.kind)||!Array.isArray(command.targets)||operation.kind==='sweep'&&command.targets.length!==1||command.targets.length<1||command.targets.length>8||operation.kind==='loft'&&command.targets.length<2)fail('INVALID_COMMAND','Loft benötigt 2–8 Skizzen, Sweep eine Skizze.');
          const contexts=command.targets.map(target=>address(project,target,aliases));if(new Set(contexts.map(c=>c.node.id)).size!==contexts.length)fail('INVALID_COMMAND','Verschiedene Skizzenprofile auswählen.');
          for(const context of contexts){editable(context);if(context.parent||context.node.kind!=='cad'||!context.node.solid||context.node.source!=='native'||context.node.recipe?.type!=='sketch'||containerFlags(project,context.node).hidden)fail('INVALID_COMMAND','Sichtbare fertige native Skizzen als Profile auswählen.');}
          const children=contexts.map(c=>cloneCadSources(c.node)),first=contexts[0].node,node={id:globalThis.crypto.randomUUID(),kind:'cad',name:operation.kind==='loft'?'Profilübergang':'Profil entlang Pfad',source:'modeling',solid:true,transform:cadIdentity(),modeling:{version:1,...operation},children,brep:structuredClone(first.brep),stats:structuredClone(first.stats),color:first.color??'#ef9a38'};
          assign(project,node,first.layerId??project.activeLayerId,first.folderId??null);project.nodes.push(node);alias(command,node.id,aliases);dirtyGeometry=true;break;
        }
        case 'mark':{
          fields(command,['op','target','ray','point','space','note','color','radius']);const c=address(await verified(),command.target,aliases);editable(c);if(cadSelectionContext(project,c.target).hidden)fail('HIDDEN_CAD_OBJECT','Eine sichtbare native CAD-Fläche wählen.');if(c.target.path.length||c.node.kind!=='cad')fail('INVALID_COMMAND','Eine sichtbare Stelle an einem fertigen CAD-Teil markieren.');
          let localPoint;if(command.ray!==undefined){if(command.point!==undefined||command.space!==undefined)fail('INVALID_COMMAND','Flächenstrahl oder Koordinaten wählen.');fields(command.ray,['origin','direction','far']);const shape=service.worldShape(c.node);try{const hits=cadRayHits(oc,shape,command.ray).sort((a,b)=>a.t-b.t);if(!hits.length)fail('CAD_MARK_LOST','Der Strahl trifft keine native Modellfläche.');localPoint=cadPoint(inverseCadMatrix(c.world),hits[0].point);}finally{shape.delete();}}else{localPoint=vector(command.point);if(command.space==='world')localPoint=cadPoint(inverseCadMatrix(c.world),localPoint);else if(command.space!==undefined&&command.space!=='local')fail('INVALID_COMMAND','Lokale oder Weltkoordinaten wählen.');}
          const proof=resolveCadAnnotationNative(oc,c.node,{point:localPoint});if(proof.status!=='valid')fail('CAD_MARK_'+proof.reason.toUpperCase(),'Der native Flächenpunkt ist verloren oder mehrdeutig. Eindeutige Flächenstelle wählen.');
          const mark=validateCadAnnotations([{id:globalThis.crypto.randomUUID(),version:1,point:localPoint,normal:proof.normal,note:command.note,color:command.color??'#d34d72',radius:command.radius??2,status:'valid',faceSignature:proof.faceSignature}])[0];c.node.annotations??=[];c.node.annotations.push(mark);dirtyGeometry=true;break;
        }
        case 'editMark':case 'removeMark':{
          fields(command,command.op==='editMark'?['op','target','id','note','color','radius','point','space','ray']:['op','target','id']);const c=address(await verified(),command.target,aliases);editable(c);const mark=c.node.annotations?.find(a=>a.id===command.id);if(!mark)fail('UNKNOWN_CAD_MARK','Die Markierung ist nicht mehr vorhanden.');
          if(command.op==='removeMark'){c.node.annotations=c.node.annotations.filter(a=>a.id!==command.id);if(!c.node.annotations.length)delete c.node.annotations;}else{
            if(command.point!==undefined||command.ray!==undefined||command.space!==undefined){
              let point;if(command.ray!==undefined){if(command.point!==undefined||command.space!==undefined)fail('INVALID_COMMAND','Flächenstrahl oder Koordinaten wählen.');fields(command.ray,['origin','direction','far']);const shape=service.worldShape(c.root);try{const hit=cadRayHits(oc,shape,command.ray).sort((a,b)=>a.t-b.t)[0];if(!hit)fail('CAD_MARK_LOST','Der Strahl trifft keine native Modellfläche.');point=cadPoint(inverseCadMatrix(c.world),hit.point);}finally{shape.delete();}}
              else{point=vector(command.point);if(command.space==='world')point=cadPoint(inverseCadMatrix(c.world),point);else if(command.space!==undefined&&command.space!=='local')fail('INVALID_COMMAND','Lokale oder Weltkoordinaten wählen.');}
              const localToRoot=multiplyCadMatrices(inverseCadMatrix(c.root.transform),c.world),proof=resolveCadAnnotationNative(oc,c.root,{point:cadPoint(localToRoot,point)});if(proof.status!=='valid')fail('CAD_MARK_'+proof.reason.toUpperCase(),'Der native Flächenpunkt ist verloren oder mehrdeutig. Eindeutige Flächenstelle wählen.');
              const normal=[0,1,2].map(k=>localToRoot[k*4]*proof.normal[0]+localToRoot[k*4+1]*proof.normal[1]+localToRoot[k*4+2]*proof.normal[2]),scale=Math.max(...normal.map(Math.abs)),scaled=normal.map(v=>v/scale),length=Math.hypot(...scaled);Object.assign(mark,{point,normal:scaled.map(v=>v/length),status:'valid',faceSignature:proof.faceSignature});delete mark.reason;
            }
            for(const key of ['note','color','radius'])if(command[key]!==undefined)mark[key]=command[key];validateCadAnnotations(c.node.annotations);
          }dirtyGeometry=true;break;
        }
        case 'extractSolids':{
          fields(command,['op','target','as']);const context=address(await verified(),command.target,aliases);editable(context);if(context.target.path.length)fail('INVALID_COMMAND','Zum Herauslösen ein fertiges CAD-Teil auswählen.');const store=createCadTransactions({initial:project,build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions:store}),oldIds=new Set(project.nodes.map(n=>n.id)),result=await tools.previewExtract({id:context.node.id,revision:store.revision()});project=result.project;rebuildBaseline=cadProjectSnapshot(project);dirtyGeometry=false;alias(command,project.nodes.filter(n=>!oldIds.has(n.id)).map(n=>n.id),aliases);break;
        }
        case 'split':{
          fields(command,['op','target','mode','normal','distance','asPositive','asNegative']);const context=address(await verified(),command.target,aliases);editable(context);if(context.target.path.length)fail('INVALID_COMMAND','Für eine Ebenenteilung ein fertiges CAD-Teil auswählen.');
          const store=createCadTransactions({initial:project,build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions:store}),positiveId=globalThis.crypto.randomUUID(),negativeId=globalThis.crypto.randomUUID();
          const result=await tools.previewSplit({id:context.node.id,mode:command.mode,normal:command.normal,distance:command.distance,positiveId,negativeId,revision:store.revision()});project=result.project;rebuildBaseline=cadProjectSnapshot(project);dirtyGeometry=false;
          if(command.asPositive!==undefined)alias({as:command.asPositive},positiveId,aliases);if(command.asNegative!==undefined)alias({as:command.asNegative},negativeId,aliases);break;
        }
        case 'sketch':{
          fields(command,['op','as','target','name','sketch','solid','color','frame']);const recipe=cadSketchRecipe(prepareConstrainedSketch(command.sketch));
          if(command.target!==undefined){
            if(command.name!==undefined||command.solid!==undefined||command.color!==undefined||command.frame!==undefined)fail('INVALID_COMMAND','Skizzenbearbeitung ändert nur die gespeicherte Kontur und Maße.');
            const context=address(project,command.target,aliases);editable(context);const node=context.node;
            if(node.source!=='native'||node.recipe?.type!=='sketch')fail('INVALID_COMMAND','Eine native Skizze oder ihre Gruppenquelle auswählen.');
            if(project.contourLinks?.links.some(link=>link.target.rootId===context.target.rootId&&JSON.stringify(link.target.path)===JSON.stringify(context.target.path)))assertCadContourTargetChanges(project,context.target,command.sketch);
            const replacement=service.nativeNode(recipe,{id:node.id,name:node.name,transform:node.transform});
            // The sketch origin is its bottom on the original workplane.
            // Retain all 16 affine entries, source IDs and display metadata.
            node.recipe=replacement.recipe;node.brep=replacement.brep;node.stats=replacement.stats;
            alias(command,context.target,aliases);
          }else{
            const node=service.nativeNode(recipe,{name:command.name??'Eigene Skizze',transform:command.frame===undefined?workplaneMatrix(project):validateAffineMatrix(command.frame),solid:command.solid??true,color:command.color??'#ef9a38'});assign(project,node);project.nodes.push(node);alias(command,node.id,aliases);
          }
          dirtyGeometry=true;break;
        }
        case 'create':{
          fields(command,['op','as','type','name','size','pos','rot','mirror','solid','color','segments','params','parent','space','text','font']);
          if(typeof makeRecipe!=='function')fail('CAD_RECIPE_UNAVAILABLE','CAD-Formadapter fehlt.');
          const definition=CAD_SHAPES.find(v=>v.type===command.type),recipe=await makeRecipe(command.type,command),node=service.nativeNode(recipe,{name:command.name??definition?.name??command.type,solid:command.solid??command.type!=='countersink',color:command.color??definition?.color??'#ef6948'});
          if(command.rot)node.transform=multiplyCadMatrices(node.transform,rotation(command.rot));
          if(command.mirror){const signs=vector(command.mirror);if(signs.some(v=>v!==1&&v!==-1))fail('INVALID_COMMAND','Spiegelachsen müssen +1 oder −1 sein.');node.transform=multiplyCadMatrices(node.transform,new Matrix4().makeScale(...signs).toArray());}
          const b=node.stats.bounds;setCenter(node,command.pos?vector(command.pos):[0,0,(b.max[2]-b.min[2])/2]);
          let createdAddress=node.id;
          if(command.parent){if(command.space&&command.space!=='local')fail('INVALID_COMMAND','Neue Gruppenquelle benötigt lokale Koordinaten.');const context=address(project,command.parent,aliases);editable(context);if(!['group','finish'].includes(context.node.source)||context.node.source==='finish')fail('INVALID_COMMAND','Neue Quellen benötigen eine boolesche Gruppe.');context.node.children.push(node);createdAddress={rootId:context.root.id,path:[...context.target.path,node.id]};}
          else{if(command.space==='plane')node.transform=multiplyCadMatrices(workplaneMatrix(project),node.transform);else if(command.space&&command.space!=='world')fail('INVALID_COMMAND','Neue Wurzelform benötigt Welt- oder Ebenenkoordinaten.');assign(project,node);project.nodes.push(node);}
          alias(command,createdAddress,aliases);dirtyGeometry=true;break;
        }
        case 'update':{
          fields(command,['op','target','set']);fields(command.set,['name','size','pos','rot','mirror','solid','color','opacity','notes','segments','sides','params','text','font','suppressed','hidden','operation']);const context=address(project,command.target,aliases);editable(context);const node=context.node,set=command.set;
          if(node.kind!=='cad'&&Object.keys(set).some(key=>!['name','size','pos','rot','mirror','color','opacity','notes','hidden'].includes(key)))fail('MESH_TOOL_REQUIRED','Netzrollen und gespeicherte Formparameter mit dem ausdrücklichen Netz-Werkzeug bearbeiten.');
          if(set.params!==undefined||set.text!==undefined||set.font!==undefined||set.sides!==undefined||set.segments!==undefined&&node.recipe?.type==='polygon'){if(typeof editRecipe!=='function'||node.source!=='native')fail('INVALID_COMMAND','Nur native CAD-Quellen besitzen Formparameter.');const patch={};for(const key of ['params','text','font','sides'])if(set[key]!==undefined)patch[key]=set[key];if(set.segments!==undefined&&node.recipe.type==='polygon')patch.sides=set.segments;const recipe=await editRecipe(node,patch),replacement=service.nativeNode(recipe,{id:node.id,name:node.name});Object.assign(node,cadPreserveFormBounds(node,replacement));dirtyGeometry=true;}
          if(set.size!==undefined)node.transform=(node.kind==='cad'?resizeCadAtCorner(node,vector(set.size)):cadResizeForm(node,vector(set.size))).transform;
          if(set.pos!==undefined)setCenter(node,vector(set.pos));
          if(set.rot!==undefined)absoluteOrientation(node,vector(set.rot));
          if(set.mirror!==undefined)absoluteMirror(node,set.mirror);
          if(['size','pos','rot','mirror'].some(key=>Object.hasOwn(set,key)))dirtyGeometry=true;
          for(const key of ['name','solid','color','opacity','suppressed','hidden','operation'])if(Object.hasOwn(set,key))node[key]=structuredClone(set[key]);
          if(Object.hasOwn(set,'notes')){if(typeof set.notes!=='string'||set.notes.length>10000)fail('INVALID_COMMAND','Notizen dürfen höchstens 10000 Zeichen enthalten.');node.metadata={...node.metadata,notes:set.notes};}
          if(set.suppressed!==undefined&&!context.parent)fail('INVALID_COMMAND','Nur Gruppenquellen können unterdrückt werden.');if(set.solid!==undefined||set.suppressed!==undefined||set.operation!==undefined)dirtyGeometry=true;break;
        }
        case 'transform':{
          fields(command,['op','target','translate','position','rotate','scale','space']);const context=address(project,command.target,aliases);editable(context);
          if(command.translate&&command.position)fail('INVALID_COMMAND','Verschiebung und Zielposition nicht kombinieren.');const chosenFrame=frameFor(project,context,command.space??'local');
          if(command.translate)shift(context,translate(vector(command.translate)),chosenFrame);
          if(command.position){const local=cadInterfaceLocalBounds(context.node),center=local.min.map((v,k)=>(v+local.max[k])/2),desired=cadPoint(chosenFrame,vector(command.position)),current=cadPoint(multiplyCadMatrices(context.parentWorld,context.node.transform),center);shift(context,translate(desired.map((v,k)=>v-current[k])),cadIdentity());}
          if(command.rotate)context.node.transform=multiplyCadMatrices(context.node.transform,rotation(command.rotate));
          if(command.scale){const factors=vector(command.scale);if(factors.some(v=>v<=0))fail('INVALID_COMMAND','Skalierung benötigt positive Faktoren.');context.node.transform=multiplyCadMatrices(context.node.transform,new Matrix4().makeScale(...factors).toArray());}
          dirtyGeometry=true;break;
        }
        case 'duplicate':{
          fields(command,['op','target','as','translate','space']);const context=address(project,command.target,aliases);editable(context);assertCadLinkedPatternCopyReady(project,[context.root.id]);const contourBefore=project.contourLinks?cadProjectSnapshot(project):undefined,mapping=new Map(),copy=cloneCadSources(context.node,{mapping});if(jointOriginal&&!context.parent){const list=jointCopies.get(context.node.id)??[];list.push(copy.id);jointCopies.set(context.node.id,list);}context.siblings.splice(context.siblings.indexOf(context.node)+1,0,copy);const next={...context,node:copy,world:multiplyCadMatrices(context.parentWorld,copy.transform)};if(command.translate)shift(next,translate(vector(command.translate)),frameFor(project,next,command.space??'local'));const to=context.parent?{rootId:context.root.id,path:[...context.target.path.slice(0,-1),copy.id]}:{rootId:copy.id,path:[]};if(project.projectParameters)project.projectParameters=copyCadProjectParameterReferences(project,{from:context.target,to,mapping});if(contourBefore)project.contourLinks=copyCadContourLinks(project,{from:context.target,to,mapping,previousProject:contourBefore});alias(command,context.parent?to:copy.id,aliases);dirtyGeometry=true;break;
        }
        case 'delete':{
          fields(command,['op','target']);const context=address(project,command.target,aliases);editable(context);context.siblings.splice(context.siblings.indexOf(context.node),1);unlinkPlane(project,context);dirtyGeometry=true;break;
        }
        case 'group':{
          fields(command,['op','targets','as','name','operation']);if(!Array.isArray(command.targets)||command.targets.length<2)fail('INVALID_COMMAND','Mindestens zwei Gruppenquellen erforderlich.');
          // Rebind pending source edits before introducing a new source path.
          // Otherwise the baseline cannot locate the original material point.
          await verified();
          const contourBefore=project.contourLinks?cadProjectSnapshot(project):undefined,contexts=command.targets.map(target=>address(project,target,aliases)),first=contexts[0];if(new Set(contexts.map(c=>c.node.id)).size!==contexts.length||contexts.some(c=>c.siblings!==first.siblings||c.node.kind!=='cad'))fail('INVALID_COMMAND','Eindeutige benachbarte CAD-Quellen erforderlich.');contexts.forEach(editable);
          const holeGroup=contexts.every(c=>!c.node.solid),positive=contexts.find(c=>!c.node.suppressed&&(holeGroup||c.node.solid));if(!positive)fail('INVALID_COMMAND','Gruppe benötigt eine aktive Körperquelle oder Lochformen.');
          const operation=command.operation??'union';if(!['union','intersection'].includes(operation))fail('INVALID_COMMAND','Unbekannte Gruppenoperation.');const source=positive.node,group={id:globalThis.crypto.randomUUID(),kind:'cad',name:command.name??'CAD-Gruppe',solid:!holeGroup,source:'group',operation,transform:cadIdentity(),children:cadFrameSources(contexts.map(c=>c.node),cadIdentity()),brep:structuredClone(source.brep),stats:structuredClone(source.stats),color:source.color??'#ef6948',opacity:source.opacity??1,multicolor:true};
          if(!first.parent)assign(project,group,source.layerId,source.folderId);groupPlaneReference(project,contexts,group);groupAliasAddresses(aliases,contexts,group);const selectedIds=new Set(contexts.map(c=>c.node.id)),at=Math.min(...contexts.map(c=>c.siblings.indexOf(c.node)));for(let n=first.siblings.length-1;n>=0;n--)if(selectedIds.has(first.siblings[n].id))first.siblings.splice(n,1);first.siblings.splice(at,0,group);if(project.projectParameters)project.projectParameters=reparentCadProjectParameterReferences(project,contexts.map(c=>({from:c.target,to:first.parent?{rootId:first.root.id,path:[...first.target.path.slice(0,-1),group.id,c.node.id]}:{rootId:group.id,path:[c.node.id]}})));if(contourBefore)project.contourLinks=reparentCadContourLinks(project,contexts.map(c=>({from:c.target,to:first.parent?{rootId:first.root.id,path:[...first.target.path.slice(0,-1),group.id,c.node.id]}:{rootId:group.id,path:[c.node.id]}})),{previousProject:contourBefore});alias(command,first.parent?{rootId:first.root.id,path:[...first.target.path.slice(0,-1),group.id]}:group.id,aliases);dirtyGeometry=true;break;
        }
        case 'align':{
          fields(command,['op','targets','reference','axis','edge','space']);await verified();if(!Array.isArray(command.targets)||command.targets.length<2||![0,1,2].includes(command.axis)||!['min','center','max'].includes(command.edge))fail('INVALID_COMMAND','Ungültige CAD-Ausrichtung.');
          const contexts=command.targets.map(target=>address(project,target,aliases)),reference=command.reference?address(project,command.reference,aliases):null,chosen=frameFor(project,contexts[0],command.space??'world'),inverse=inverseCadMatrix(chosen),bounds=contexts.map(c=>shapeBounds(c.node,multiplyCadMatrices(inverse,c.world)));
          const key=command.edge,axis=command.axis,coordinate=reference?shapeBounds(reference.node,multiplyCadMatrices(inverse,reference.world))[key][axis]:key==='center'?(Math.min(...bounds.map(b=>b.min[axis]))+Math.max(...bounds.map(b=>b.max[axis])))/2:key==='min'?Math.min(...bounds.map(b=>b.min[axis])):Math.max(...bounds.map(b=>b.max[axis]));
          contexts.forEach((context,n)=>{if(context.node.id===reference?.node.id)return;const delta=[0,0,0];delta[axis]=coordinate-bounds[n][key][axis];shift(context,translate(delta),chosen);});dirtyGeometry=true;break;
        }
        case 'drop':{
          fields(command,['op','target','space']);await verified();const context=address(project,command.target,aliases),chosen=frameFor(project,context,command.space??'plane'),b=shapeBounds(context.node,multiplyCadMatrices(inverseCadMatrix(chosen),context.world));shift(context,translate([0,0,-b.min[2]]),chosen);dirtyGeometry=true;break;
        }
        case 'layOnFace':{
          fields(command,['op','target','ray','ground']);await verified();const context=address(project,command.target,aliases);editable(context);if(context.target.path.length)fail('INVALID_COMMAND','Für die Auflage ein fertiges CAD-Teil auswählen.');
          const store=createCadTransactions({initial:project,build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions:store}),proposal=await tools.previewLayOnFace({id:context.node.id,ray:command.ray,ground:command.ground??false,revision:store.revision()});project=proposal.project;dirtyGeometry=true;break;
        }
        case 'placeAtReference':{
          fields(command,['op','target','sourceReference','referenceTarget','targetReference','offset']);await verified();const context=address(project,command.target,aliases);editable(context);if(context.target.path.length)fail('INVALID_COMMAND','Native Bezugspunktplatzierung benötigt ein fertiges Teil.');
          const target=command.referenceTarget===undefined?null:address(project,command.referenceTarget,aliases);if(target?.target.path.length)fail('INVALID_COMMAND','Zielbezug benötigt ein fertiges Teil.');
          const store=createCadTransactions({initial:project,build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions:store}),proposal=await tools.previewReferencePlacement({id:context.node.id,sourceReference:command.sourceReference,targetId:target?.node.id,targetReference:command.targetReference,offset:command.offset,revision:store.revision()});project=proposal.project;dirtyGeometry=true;break;
        }
        case 'drill':{
          fields(command,['op','target','reference','kind','through','termination','stopReference','associative','diameter','depth','headDiameter','headDepth','angle','gap','offset','as']);if(command.associative!==undefined&&typeof command.associative!=='boolean')fail('INVALID_COMMAND','Mitwachsende Bohrung benötigt einen booleschen Wert.');await verified();const context=address(project,command.target,aliases);editable(context);if(context.target.path.length)fail('INVALID_COMMAND','Bohrungsassistent benötigt ein fertiges Teil.');const resultId=globalThis.crypto.randomUUID(),store=createCadTransactions({initial:project,build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions:store}),proposal=await tools.previewDrill({...command,id:context.node.id,resultId,revision:store.revision()});project=proposal.project;alias(command,resultId,aliases);dirtyGeometry=true;break;
        }
        case 'editDrill':
        case 'detachDrillPattern':{
          fields(command,command.op==='editDrill'?['op','target','patch','positionReference','stopReference']:['op','target','index']);await verified();const context=address(project,command.target,aliases);editable(context);
          const store=createCadTransactions({initial:project,build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions:store});
          const options={id:context.root.id,path:context.target.path,revision:store.revision()},proposal=command.op==='editDrill'?await tools.previewEditDrill({...options,patch:command.patch,positionReference:command.positionReference,stopReference:command.stopReference}):await tools.previewDetachDrillPattern({...options,index:command.index});
          project=proposal.project;dirtyGeometry=true;break;
        }
        case 'pattern':{
          fields(command,['op','target','kind','count','step','columns','rowStep','radius','angle','startAngle','center','rotateCopies','space','as']);const context=address(project,command.target,aliases);editable(context);assertCadLinkedPatternCopyReady(project,[context.root.id]);
          if(!Number.isSafeInteger(command.count)||command.count<2||command.count>200||!['line','grid','circle'].includes(command.kind))fail('INVALID_COMMAND','Ungültiges CAD-Muster.');const contourBefore=project.contourLinks?cadProjectSnapshot(project):undefined,chosen=frameFor(project,context,command.space??'local'),copies=[],original=structuredClone(context.node),localBounds=cadInterfaceLocalBounds(original),baseCenter=cadPoint(multiplyCadMatrices(inverseCadMatrix(chosen),context.world),localBounds.min.map((v,k)=>(v+localBounds.max[k])/2));
          for(let n=command.kind==='circle'?0:1;n<command.count;n++){
            const mapping=new Map(),copy=n===0?context.node:cloneCadSources(original,{mapping});let delta;
            if(command.kind==='circle'){
              if(!Number.isFinite(command.radius)||command.radius<=0||command.radius>10000||!baseCenter)fail('INVALID_COMMAND','CAD-Kreismuster benötigt einen gültigen Radius.');const span=command.angle??360,theta=((command.startAngle??0)+span*n/(Math.abs(span)===360?command.count:command.count-1))*Math.PI/180,center=vector(command.center??baseCenter),point=[center[0]+command.radius*Math.cos(theta),center[1]+command.radius*Math.sin(theta),center[2]];delta=translate(point.map((v,k)=>v-baseCenter[k]));if(command.rotateCopies)delta=multiplyCadMatrices(delta,multiplyCadMatrices(multiplyCadMatrices(translate(baseCenter),rotation([0,0,theta*180/Math.PI])),translate(baseCenter.map(v=>-v))));
            }else{const step=vector(command.step??[20,0,0]);let offset=step.map(v=>v*n);if(command.kind==='grid'){if(!Number.isSafeInteger(command.columns)||command.columns<1||command.columns>200)fail('INVALID_COMMAND','Gültige Spaltenzahl erforderlich.');const row=vector(command.rowStep??[0,20,0]);offset=step.map((v,k)=>v*(n%command.columns)+row[k]*Math.floor(n/command.columns));}delta=translate(offset);}
            shift({...context,node:copy,world:multiplyCadMatrices(context.parentWorld,original.transform)},delta,chosen);if(n){context.siblings.push(copy);copies.push(copy);if(project.projectParameters)project.projectParameters=copyCadProjectParameterReferences(project,{from:context.target,to:context.parent?{rootId:context.root.id,path:[...context.target.path.slice(0,-1),copy.id]}:{rootId:copy.id,path:[]},mapping});if(contourBefore)project.contourLinks=copyCadContourLinks(project,{from:context.target,to:context.parent?{rootId:context.root.id,path:[...context.target.path.slice(0,-1),copy.id]}:{rootId:copy.id,path:[]},mapping,previousProject:contourBefore});}
          }
          alias(command,copies.map(n=>n.id),aliases);dirtyGeometry=true;break;
        }
        case 'layer':{
          fields(command,['op','as','name']);const id=globalThis.crypto.randomUUID();project.layers.push({id,name:command.name,hidden:false,locked:false});alias(command,id,aliases);break;
        }
        case 'folder':{
          fields(command,['op','as','name','layer','parent']);const id=globalThis.crypto.randomUUID(),resolve=value=>typeof value==='string'&&value.startsWith('$')?aliases[value.slice(1)]:value;project.folders.push({id,name:command.name,hidden:false,locked:false,layerId:resolve(command.layer??project.activeLayerId),parentId:resolve(command.parent??null)});alias(command,id,aliases);break;
        }
        case 'assign':{
          fields(command,['op','target','layer','folder']);const context=address(project,command.target,aliases);editable(context);if(context.parent)fail('INVALID_COMMAND','Gruppenquellen erben den Wurzelcontainer.');const resolve=value=>typeof value==='string'&&value.startsWith('$')?aliases[value.slice(1)]:value;assign(project,context.node,resolve(command.layer??project.activeLayerId),resolve(command.folder??null));break;
        }
        case 'workplane':fields(command,['op','origin','orientation','coordinateMode']);project.workplane={origin:vector(command.origin),orientation:vector(command.orientation,4),reference:null};if(command.coordinateMode!==undefined)project.coordinateMode=command.coordinateMode;break;
        default:fail('INVALID_COMMAND','Unbekannter CAD-Befehl: '+command.op);
      }
      }catch(error){error.code??='CAD_ERROR';let target=command?.target;if(typeof target==='string'&&target.startsWith('$')&&aliases[target.slice(1)]!==undefined)target=aliases[target.slice(1)];if(typeof target==='string'&&!target.startsWith('$'))target={rootId:target,path:[]};error.feedback=aiFeedback(error,error.cadBatchFailure?{}:{commandIndex:index+1,operation:command?.op,target:error.feedback?.target??target});throw error;}
      progress?.((index+1)/operation.commands.length*.8);
    }
    if(jointOriginal&&jointCopies.size){const count=Math.max(...[...jointCopies.values()].map(v=>v.length));for(let i=0;i<count;i++){const mapping=new Map([...jointCopies].flatMap(([id,list])=>list[i]?[[id,list[i]]]:[])),copied=remapCadJoints(jointOriginal,mapping);if(copied.joints.length)project.joints=validateCadJoints({version:1,bases:[...new Set([...(project.joints?.bases??[]),...copied.bases])],joints:[...(project.joints?.joints??[]),...copied.joints]});}}
    try{return {project:await service.rebuild(project,{baseline:rebuildBaseline,progress:value=>progress?.(.8+value*.2)}),aliases,changes:operation.commands.map(c=>({op:c.op,target:c.target??c.as??null})),warnings:[]};}catch(error){error.code??='CAD_ERROR';error.feedback=aiFeedback(error);throw error;}
  }
  async function run(input,operation,{baseline=input,progress}={}){
    const project=cadProjectSnapshot(input);if(!operation||typeof operation.kind!=='string')fail('INVALID_COMMAND','CAD-Auftrag fehlt.');
    switch(operation.kind){
      case 'linkedPatternDetachInstance':{
        fields(operation,['kind','id','index']);if(cadProjectRevision(project)!==cadProjectRevision(baseline))fail('UNCONFIRMED_PROJECT','Das Lösen benötigt den bestätigten Modellstand.');
        const current=project.linkedPatterns?.patterns.find(p=>p.id===operation.id),instance=current?.instances.find(i=>i.index===operation.index);if(!instance||current.excluded.includes(operation.index))fail('INVALID_COMMAND','Eine vorhandene Musterkopie auswählen.');
        if(cadLinkedPatternProblems(project,current).length)fail('PATTERN_UPDATE_REQUIRED','Das Muster zuerst aktualisieren, bevor eine Kopie gelöst wird.');
        const node=project.nodes.find(n=>n.id===instance.id);if(!node||containerFlags(project,node).locked)fail('LOCKED_CAD_OBJECT','Die Musterkopie fehlt oder ist gesperrt.');
        const next={...current,excluded:[...current.excluded,operation.index].sort((a,b)=>a-b),instances:current.instances.filter(i=>i.index!==operation.index)};delete next.snapshot;
        const stamped=stampCadLinkedPattern(project,next);project.linkedPatterns={version:1,patterns:project.linkedPatterns.patterns.map(p=>p.id===current.id?stamped:p)};
        return {project:cadProjectSnapshot(project),changes:[{op:'linkedPatternDetachInstance',target:instance.id}],warnings:[]};
      }
      case 'linkedPatternDetach':{
        fields(operation,['kind','id','confirmConflict']);if(cadProjectRevision(project)!==cadProjectRevision(baseline))fail('UNCONFIRMED_PROJECT','Das Lösen benötigt den bestätigten Modellstand.');
        const existing=project.linkedPatterns?.patterns.find(p=>p.id===operation.id);if(!existing)fail('INVALID_COMMAND','Musterverknüpfung fehlt.');
        if(operation.confirmConflict!==undefined&&typeof operation.confirmConflict!=='boolean')fail('INVALID_COMMAND','Ungültige Bestätigung.');
        if(cadLinkedPatternProblems(project,existing).length&&operation.confirmConflict!==true)fail('PATTERN_UPDATE_REQUIRED','Das veraltete Muster nur nach ausdrücklicher Bestätigung lösen: vorhandene Teile bleiben unverändert, fehlende Teile werden nicht wiederhergestellt.');
        for(const nodeId of [existing.sourceId,...existing.instances.map(i=>i.id)]){const node=project.nodes.find(n=>n.id===nodeId);if(node&&containerFlags(project,node).locked)fail('LOCKED_CAD_OBJECT','Muster oder Musterkopie ist gesperrt.');}
        const remaining=project.linkedPatterns.patterns.filter(p=>p.id!==operation.id);if(remaining.length)project.linkedPatterns={version:1,patterns:remaining};else delete project.linkedPatterns;
        return {project:cadProjectSnapshot(project),changes:[{op:'linkedPatternDetach',target:existing.sourceId}],warnings:[]};
      }
      case 'linkedPattern':{
        fields(operation,['kind','pattern']);if(cadProjectRevision(project)!==cadProjectRevision(baseline))fail('UNCONFIRMED_PROJECT','Muster benötigt den bestätigten Modellstand.');
        const requested=validateCadLinkedPattern(operation.pattern),previous=project.linkedPatterns?.patterns.find(p=>p.id===requested.id),context=address(project,requested.sourceId,{});editable(context);
        if(context.parent||containerFlags(project,context.node).hidden)fail('INVALID_COMMAND','Eine sichtbare vollständige CAD-Quelle auswählen.');
        if(!previous&&requested.snapshot)fail('INVALID_COMMAND','Neues Muster darf keinen vorherigen Zustand behaupten.');
        for(const item of previous?.instances??[]){const node=project.nodes.find(n=>n.id===item.id);if(node&&(containerFlags(project,node).locked||containerFlags(project,node).hidden))fail('LOCKED_CAD_OBJECT','Gesperrte oder verborgene Musterkopie kann nicht aktualisiert werden.');}
        const result=materializeCadLinkedPattern(project,requested,{previous}),list=project.linkedPatterns?.patterns??[];
        result.project.linkedPatterns={version:1,patterns:[...list.filter(p=>p.id!==requested.id),result.pattern]};
        const rebuilt=await service.rebuild(result.project,{baseline,progress}),pattern=stampCadLinkedPattern(rebuilt,result.pattern);rebuilt.linkedPatterns={version:1,patterns:[...list.filter(p=>p.id!==requested.id),pattern]};
        return {project:cadProjectSnapshot(rebuilt),changes:[{op:'linkedPattern',target:requested.sourceId}],warnings:[]};
      }
      case 'cadToMesh':{fields(operation,['kind','target','quality','id']);if(cadProjectRevision(project)!==cadProjectRevision(baseline))fail('UNCONFIRMED_PROJECT','Eine Netzkopie benötigt den bestätigten CAD-Stand, keine veränderte Vorschau.');const {node,report}=cadMeshCopyNative(oc,project,operation);project.nodes.push(node);return {project:await service.rebuild(project,{baseline,progress}),report,changes:[{op:'cadToMesh',target:operation.target}],warnings:[]};}
      case 'create':fields(operation,['kind','recipe','options']);project.nodes.push(service.nativeNode(operation.recipe,operation.options));break;
      case 'meshToCad':{fields(operation,['kind','target','sourceDigest','bytes','id','notes']);if(cadProjectRevision(project)!==cadProjectRevision(baseline))fail('UNCONFIRMED_PROJECT','Die CAD-Kopie benötigt das bestätigte Quellnetz.');project.nodes.push(meshToCadNative(service,project,operation));break;}
      case 'importStepAssembly':fields(operation,['kind','bytes','options']);service.stepAssembly(project,operation.bytes,operation.options);break;
      case 'freecadImportStep':{
        fields(operation,['kind','bytes','options']);if(cadProjectRevision(project)!==cadProjectRevision(baseline))fail('UNCONFIRMED_PROJECT','Ein FCStd-Import benötigt den bestätigten Modellstand.');
        const node=service.stepNode(operation.bytes,operation.options);if(node.metadata?.freecadSource?.version!==2||node.metadata.freecadSource.mode!=='native'||node.metadata?.importedFile?.type!=='fcstd')fail('INVALID_COMMAND','Die erhaltene FCStd-Importquelle fehlt.');project.nodes.push(node);
        // STEP import already constructed this new native body. Validate only
        // its placement; never reserialize unrelated confirmed BReps or stats.
        return {project:await service.rebuildSubset(project,{baseline:project,rootIds:[node.id],touchedIds:[node.id],geometryIds:[],progress})};
      }
      case 'importStep':fields(operation,['kind','bytes','options']);project.nodes.push(service.stepNode(operation.bytes,operation.options));break;
      case 'importStlHousing':{
        fields(operation,['kind','mesh','bytes','unit','options','repair']);
        if(!!operation.mesh===!!operation.bytes)fail('INVALID_COMMAND','STL-Auftrag benötigt genau eine Datei oder ein Netz.');
        const unit=operation.unit??1;if(!Number.isFinite(unit)||unit<=0||unit>1000)fail('INVALID_COMMAND','Ungültige STL-Einheit.');
        let mesh=operation.mesh??readStlReconstructionMesh(operation.bytes);
        if(unit!==1)mesh={...mesh,verts:mesh.verts.map(v=>v*unit)};
        project.nodes.push(service.stlHousingNode(mesh,operation.options,operation.repair));break;
      }
      case 'svg':{
        fields(operation,['kind','paths','height','options']);if(!Array.isArray(operation.paths)||!operation.paths.length||operation.paths.length>500||!Number.isFinite(operation.height)||operation.height<.01||operation.height>10000)fail('INVALID_COMMAND','Gefüllte originale SVG-Konturen und gültige Extrusionshöhe erforderlich.');
        const children=[];for(const path of operation.paths){fields(path,['subpaths','fillRule','color']);const contours=cadContoursFromSvgSubpaths(oc,path.subpaths,{fillRule:path.fillRule??'nonzero'});if(!contours.contours.length)continue;children.push(service.nativeNode({type:'svg',size:[1,1,operation.height],...contours},{name:operation.options?.name??'SVG-Kontur',color:path.color??'#448fba'}));}
        if(!children.length)fail('INVALID_COMMAND','SVG enthält keine gefüllte CAD-Kontur.');
        let node;if(children.length===1)node={...children[0],...operation.options};else{node={id:operation.options?.id??globalThis.crypto.randomUUID(),kind:'cad',source:'group',name:operation.options?.name??'SVG-Extrusion',solid:true,multicolor:true,operation:'union',transform:cadIdentity(),children,brep:children[0].brep,stats:children[0].stats,...operation.options};}
        project.nodes.push(node);break;
      }
      case 'plugin':{
        fields(operation,['kind','manifest','shapeId','options']);const node=await buildCadPluginShape(service,operation.manifest,operation.shapeId,{...operation.options,project});project.nodes.push(node);break;
      }
      case 'form':{
        fields(operation,['kind','target','patch','preserveBounds','dimensions']);const context=address(project,operation.target,{});editable(context);if(typeof editRecipe!=='function'||context.node.source!=='native')fail('INVALID_COMMAND','Native Formquelle erforderlich.');
        const node=context.node,recipe=await editRecipe(node,operation.patch),replacement=service.nativeNode(recipe,{id:node.id,name:node.name});
        if(operation.dimensions!==undefined)Object.assign(node,cadFitFormDimensions(node,replacement,operation.dimensions));else if(operation.preserveBounds!==false)Object.assign(node,cadPreserveFormBounds(node,replacement));else Object.assign(node,{recipe:replacement.recipe,brep:replacement.brep,stats:replacement.stats});break;
      }
      case 'finish':{
        fields(operation,['kind','target','step']);const context=address(project,operation.target,{});editable(context);if(context.node.kind!=='cad'||context.parent)fail('INVALID_COMMAND','Kantenoperation benötigt einen fertigen CAD-Wurzelkörper.');const node=context.node,step=structuredClone(operation.step);
        if(node.drill){
          const references=value=>typeof value==='string'?value===node.id:Array.isArray(value)?value.some(references):!!value&&typeof value==='object'&&Object.values(value).some(references);
          for(const key of ['projectParameters','contourLinks','joints','drawings','linkedPatterns','featureReferences'])if(references(project[key]))fail('CAD_DRILL_DEPENDENCIES_UNSUPPORTED','Eine Kantenbearbeitung auf verknüpfter Bohrung mit bestehenden Bezügen wird noch nicht unterstützt.');
          function lockedSource(source){return !!source.locked||(source.children??[]).some(lockedSource);}if(lockedSource(node))fail('LOCKED_CAD_OBJECT','Die Bohrungsquelle oder eine ihrer Quellen ist gesperrt.');
          const child=structuredClone(node);child.id=globalThis.crypto.randomUUID();child.transform=cadIdentity();delete child.annotations;delete child.geometryIdentity;
          for(const edge of step.edges??[]){edge.origin.rootId=node.id;edge.origin.path=[child.id,...(edge.origin.path??[])];}
          const reference=project.workplane.reference;if(reference?.objectId===node.id)reference.topology.origin.path=[child.id,...reference.topology.origin.path];
          delete node.drill;delete node.operation;delete node.geometryIdentity;node.source='finish';node.children=[child];node.finish={steps:[step]};
        }
        else if(node.source==='group'||node.source==='finish'||node.source==='partition'||node.source==='extraction'||node.source==='modeling'){node.finish??={steps:[]};node.finish.steps.push(step);}
        else{const child=structuredClone(node);child.id=globalThis.crypto.randomUUID();child.transform=cadIdentity();for(const edge of step.edges??[]){edge.origin.rootId=node.id;edge.origin.path=[child.id,...(edge.origin.path??[])];}const reference=project.workplane.reference;if(reference?.objectId===node.id)reference.topology.origin.path=[child.id,...reference.topology.origin.path];delete node.recipe;node.source='finish';node.children=[child];node.finish={steps:[step]};}
        break;
      }
      case 'editFinish':{
        fields(operation,['kind','target','steps']);const context=address(project,operation.target,{});editable(context);if(!context.node.finish)fail('INVALID_COMMAND','Editierbare Kantenoperation fehlt.');
        if(!Array.isArray(operation.steps))fail('INVALID_COMMAND','Kantenoperationen müssen eine Liste sein.');
        if(operation.steps.length)context.node.finish={steps:structuredClone(operation.steps)};
        else if(['group','partition','extraction','modeling'].includes(context.node.source))delete context.node.finish;
        else if(context.node.source==='finish'){
          const wrapper=context.node,child=structuredClone(wrapper.children[0]),childId=child.id,childFrame=[...child.transform],inverseChild=inverseCadMatrix(childFrame);child.id=wrapper.id;child.transform=multiplyCadMatrices(wrapper.transform,childFrame);
          for(const key of ['name','solid','color','opacity','multicolor','hidden','locked','layerId','folderId','metadata','annotations'])if(wrapper[key]!==undefined)child[key]=structuredClone(wrapper[key]);
          // Surviving nested operations keep their own result-root identity.
          // Only the child that takes over the wrapper ID is renamed.
          function rebase(node){for(const step of node.finish?.steps??[])for(const edge of step.edges)if(edge.origin.rootId===childId)edge.origin.rootId=wrapper.id;for(const source of node.children??[])rebase(source);}rebase(child);
          context.siblings[context.siblings.indexOf(wrapper)]=child;const reference=project.workplane.reference;
          if(reference?.objectId===wrapper.id){const topology=reference.topology;if(topology.origin.path[0]===childId){topology.origin.path.shift();const anchor=topology.anchor;anchor.point=cadPoint(inverseChild,anchor.point);if(anchor.samples)anchor.samples=anchor.samples.map(point=>cadPoint(inverseChild,point));if(anchor.normal)anchor.normal=new Vector3(...[0,1,2].map(col=>childFrame[col*4]*anchor.normal[0]+childFrame[col*4+1]*anchor.normal[1]+childFrame[col*4+2]*anchor.normal[2])).normalize().toArray();if(anchor.tangent)anchor.tangent=new Vector3(...[0,1,2].map(row=>inverseChild[row]*anchor.tangent[0]+inverseChild[4+row]*anchor.tangent[1]+inverseChild[8+row]*anchor.tangent[2])).normalize().toArray();}else project.workplane.reference=null;}
        }else fail('INVALID_COMMAND','CAD-Kantenquelle kann nicht wiederhergestellt werden.');break;
      }
      case 'tool':{
        fields(operation,['kind','name','options']);const store=createCadTransactions({initial:project,build:(p,context)=>service.rebuild(p,{baseline:context.baseline})}),tools=createCadToolsNative({oc,service,transactions:store});
        if(!['previewAlign','previewAnchor','previewWorkplane','previewPlace','previewLayOnFace','previewSplit','previewExtract','previewReferencePlacement','previewDrill','previewConvertDrill','previewRebindDrills','previewEditDrill','previewDetachDrillPattern','previewGroup','previewEditSource','previewSuppressSource','previewDissolve'].includes(operation.name))fail('INVALID_COMMAND','Unbekanntes natives CAD-Werkzeug.');
        const drillOptions={previewRebindDrills:['id','bindings'],previewConvertDrill:['id','confirmed','reference','kind','through','termination','stopReference','diameter','depth','headDiameter','headDepth','angle','gap','offset'],previewDrill:['id','reference','kind','through','termination','stopReference','diameter','depth','headDiameter','headDepth','angle','gap','offset','associative','resultId'],previewEditDrill:['id','path','patch','positionReference','stopReference'],previewDetachDrillPattern:['id','path','index']}[operation.name];if(drillOptions)fields(operation.options,drillOptions);
        const result=await tools[operation.name]({...operation.options,revision:store.revision()});return {project:result.project};
      }
      case 'sketchAttachment':{
        const prepared=prepareSketchAttachment(project,operation);if(prepared.engine!=='cad')throw Error('Für ein Netzteil das Netz-Anbauwerkzeug verwenden.');
        const before=service.inspect(prepared.target),result=await batch(project,{kind:'batch',commands:attachmentNativeCommands(prepared)},baseline,progress),alias=result.aliases.attachment,id=typeof alias==='string'?alias:alias.rootId,node=result.project.nodes.find(n=>n.id===id),after=service.inspect(node),report=checkSketchAttachment(before,after,prepared);
        return {...result,selectedIds:[id],report};
      }
      case 'template':fields(operation,['kind','controls','bindings','values']);return {project:await buildCadTemplate(project,operation,{service,editRecipe}),changes:[{op:'template',label:'Native Vorlagenmaße'}],warnings:[]};
      case 'batch':return batch(project,operation,baseline,progress);
      default:fail('INVALID_COMMAND','Unbekannter CAD-Auftrag.');
    }
    return {project:await service.rebuild(project,{baseline,progress})};
  }
  function scene(input,selection=[]){
    const project=cadProjectSnapshot(input),objects=[];
    function visit(node,parentWorld,rootId,path,inherited){
      const world=multiplyCadMatrices(parentWorld,node.transform),state={hidden:inherited.hidden||!!node.hidden||!path.length&&!!node.suppressed,locked:inherited.locked||!!node.locked,sourceGeometryReadonly:inherited.sourceGeometryReadonly||node.source==='extraction'||!!node.modeling?.sourceSignature};let worldBounds,volume,solids;
      let localBounds;if(hasGeometryRefs(node)){const local=node.kind==='cad'?node.stats.bounds:node.mesh.bounds;localBounds=catalogueBounds(local,cadIdentity());worldBounds=catalogueBounds(local,world);}else if(node.kind==='cad'){({localBounds,worldBounds,volume,solids}=service.inspect(node,world));}
      else{worldBounds=shapeBounds(node,world);localBounds=shapeBounds(node,cadIdentity());}
      const dimensions={...cadAxisMeasures(localBounds,node.transform,world),...(node.kind==='cad'?{solids}:{})};
      const objectType=projectObjectType(node),sharedCommands=state.locked?[]:['update','transform','duplicate','delete','align','drop','pattern','assign'],meshTools=node.kind!=='mesh'||state.locked||state.hidden?[]:['role','repair',...(node.meshRole!=='hole'?['counterpart']:[]),...(objectType==='closedMesh'?['group','sourceEdit',...(node.meshRole!=='hole'?['split','drill','bodies','finish','dissolve']:[])]:[])];
      const meshSources=node.kind==='mesh'?meshSourceTree(node).slice(0,500).map(({node:source,path,poseEditable,suppressed,suppressible,locked,hidden})=>({path,name:source.name,type:source.type,size:source.size,pos:source.pos,rot:source.rot,mirror:source.mirror,params:source.params,segments:source.segments,color:source.color,opacity:source.opacity,solid:source.solid,poseEditable,suppressed,suppressible,locked,hidden})):undefined;
      objects.push({...dimensions,...(hasGeometryRefs(node)?{geometryLoaded:false,geometryEvidence:'package-catalogue-only'}:{}),id:node.id,name:node.name,kind:node.kind,type:node.recipe?.type??node.source??objectType,objectType,capabilities:projectObjectCapabilities(node),automation:{sharedCommands,meshTools,programTools:state.locked||state.hidden?[]:node.kind==='mesh'?['mesh','app','converter']:node.kind==='cad'?['cad','app']:[],meshBodyProofRequired:node.kind==='mesh',nativeTools:node.kind==='cad'&&!state.locked&&!state.hidden},...(node.kind==='mesh'?{meshRole:node.meshRole??'solid',geometryDigest:projectObjectGeometryDigest(node),meshSources}:{}),target:{rootId,path},parentId:path.length?path.at(-2)??rootId:null,solid:node.solid,source:node.source,recipe:node.recipe,transform:node.transform,worldMatrix:world,localBounds,worldBounds,volume,hidden:state.hidden,locked:state.locked,suppressed:!!node.suppressed,color:node.color,opacity:node.opacity,operation:node.operation,children:(node.children??[]).map(c=>c.id),drill:node.drill,finish:node.finish,modeling:node.modeling,annotations:node.annotations?.map(a=>cadAnnotationWorld(a,world)),extraction:node.extraction,sourceGeometryReadonly:inherited.sourceGeometryReadonly,partition:node.partition,partitionWorld:node.partition?cadPartitionWorldPlane(node.partition,world):undefined,layerId:node.layerId,folderId:node.folderId,metadata:node.metadata});
      objects.at(-1).metadata=parametricSceneMetadata(node.metadata);
      for(const child of node.children??[])visit(child,world,rootId,[...path,child.id],state);
    }
    for(const node of project.nodes)visit(node,cadIdentity(),node.id,[],containerFlags(project,node));
    return {application:'Formnaro',projectVersion:project.version,units:'mm',revision:cadProjectRevision(project),name:project.name,selection:[...selection],bed:project.bed,workplane:project.workplane,coordinateMode:project.coordinateMode,layers:project.layers,folders:project.folders,objects};
  }
  function bounds(input,{targets,frame=cadIdentity()}={}){
    const project=cadProjectSnapshot(input);if(!Array.isArray(targets)||!targets.length)fail('INVALID_COMMAND','CAD-Auswahl fehlt.');const inverse=inverseCadMatrix(validateAffineMatrix(frame)),byId=targets.map(target=>{const context=address(project,target,{});return {id:context.node.id,target:context.target,...shapeBounds(context.node,multiplyCadMatrices(inverse,context.world))};}),min=[0,1,2].map(k=>Math.min(...byId.map(b=>b.min[k]))),max=[0,1,2].map(k=>Math.max(...byId.map(b=>b.max[k])));return {revision:cadProjectRevision(project),frame,min,max,size:min.map((v,k)=>max[k]-v),center:min.map((v,k)=>(v+max[k])/2),byId};
  }
  return {run,scene,bounds};
}
